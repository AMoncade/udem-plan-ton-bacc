/**
 * Les règles de crédits, des deux côtés : celle d'un bloc (`RegleBloc`) et les
 * totaux par type d'un programme (`ExigencesParType`).
 *
 * POURQUOI CE FICHIER EXISTE À PART. En v1 la règle de bloc était quatre
 * expressions régulières enfouies dans `structure.ts`, une par forme, et la
 * cinquième forme — `Option - 4 crédits.`, sur notre propre page — s'y lisait
 * « ambiguë ». La v2 n'énumère plus des phrases : elle lit un TYPE puis des
 * BORNES, indépendamment. Trois types (obligatoire, option, choix) fois trois
 * formes de bornes (exacte, min+max, max seul) couvrent les neuf formes relevées,
 * minuscules comprises, et couvrent aussi les combinaisons jamais vues sans
 * qu'on ait à les deviner une par une.
 *
 * Formes relevées sur le site (docs/VALIDATION-AUTRES-PROGRAMMES.md, et vérifiées
 * à nouveau le 2026-09-11) :
 *
 *   Obligatoire - N crédits.                          obligatoire, exacte
 *   Option - N crédits.                               option,      exacte   (bloc 82B)
 *   Option - Maximum M crédits.                       option,      max seul
 *   Option - Minimum N crédits, maximum M crédits.    option,      min+max
 *   Option - Minimum N crédits, Maximum M crédits.    idem, « Maximum » capital (Accès - FAC, bloc 70B)
 *   Option - maximum M crédits.                       idem en minuscules
 *   Option - minimum N crédits, maximum M crédits.    idem en minuscules
 *   Choix - N crédits.                                choix,       exacte
 *   Choix - Maximum M crédits.                        choix,       max seul
 *   Choix - Minimum N crédits, maximum M crédits.     choix,       min+max
 *
 * DEUX CHOIX DE LECTURE, explicites parce qu'ils ne sont pas neutres :
 *
 * 1. `Intervalle` du contrat v2 est `{min:number, max:number}` — pas de `null`.
 *    « Maximum 13 crédits », sans minimum écrit, devient donc `{min:0, max:13}`.
 *    C'est la lecture littérale de la page (on peut n'en prendre aucun), et
 *    `regleBrut` garde le verbatim pour qui voudrait en juger autrement.
 * 2. « Minimum N crédits » SANS maximum n'existe nulle part dans tout ce qui a
 *    été relevé. Si elle sortait, aucun maximum honnête ne peut être nommé : la
 *    règle devient `{type:"inconnu", brut}` et le journal le dit. Mettre
 *    `max: creditsTotal` serait inventer une borne que la page n'écrit pas.
 */
import type { ExigencesParType, Intervalle, RegleBloc } from "../../lib/types";

export interface RegleLue {
  regle: RegleBloc;
  /** Note à journaliser quand la lecture mérite d'être vérifiée. null sinon. */
  note: string | null;
}

/** « 12 » et « 1,5 » et « 1.5 ». La page écrit des crédits fractionnaires. */
function nombre(brut: string): number {
  return Number.parseFloat(brut.replace(",", "."));
}

const NB = String.raw`\d+(?:[.,]\d+)?`;
const CR = String.raw`cr[ée]dits?`;
/** Tiret, demi-cadratin ou cadratin : la page utilise les trois selon la page. */
const TIRET = String.raw`[-–—]`;

const TYPES: { mot: RegExp; type: "obligatoire" | "option" | "choix" }[] = [
  { mot: /^obligatoires?$/i, type: "obligatoire" },
  { mot: /^options?$/i, type: "option" },
  { mot: /^choix$/i, type: "choix" },
];

type FormeBornes = "exacte" | "min-max" | "max" | "min-seul";

interface BornesLues {
  forme: FormeBornes;
  bornes: Intervalle | null;
}

/** Partie droite de la règle, après le tiret : les bornes seules. */
export function parseBornes(droite: string): BornesLues | null {
  const t = droite.trim();

  let m = new RegExp(`^Minimum\\s*(${NB})\\s*(?:${CR})?\\s*,?\\s*Maximum\\s*(${NB})\\s*(?:${CR})?$`, "i").exec(t);
  if (m) return { forme: "min-max", bornes: { min: nombre(m[1]), max: nombre(m[2]) } };

  m = new RegExp(`^Maximum\\s*(${NB})\\s*(?:${CR})?$`, "i").exec(t);
  if (m) return { forme: "max", bornes: { min: 0, max: nombre(m[1]) } };

  m = new RegExp(`^Minimum\\s*(${NB})\\s*(?:${CR})?$`, "i").exec(t);
  if (m) return { forme: "min-seul", bornes: null };

  m = new RegExp(`^(${NB})\\s*${CR}$`, "i").exec(t);
  if (m) return { forme: "exacte", bornes: { min: nombre(m[1]), max: nombre(m[1]) } };

  return null;
}

/**
 * Règle de crédits d'un bloc, telle qu'écrite dans le `<small>` de son titre.
 *
 * Ne rend JAMAIS null : une forme inconnue devient `{type:"inconnu", brut}` avec
 * une note. C'est la différence avec la v1, qui rendait `null` et faisait
 * *ignorer le bloc entier* par l'appelant — un bloc disparu est plus grave
 * qu'un bloc non auditable, parce qu'il ne laisse aucune trace à l'écran.
 */
export function parseRegleBloc(brut: string): RegleLue {
  const verbatim = brut.trim();
  const sansPoint = verbatim.replace(/\.$/, "").trim();

  const coupe = new RegExp(`^([^${"-–—"}]+?)\\s*${TIRET}\\s*([\\s\\S]+)$`).exec(sansPoint);
  if (!coupe) {
    return {
      regle: { type: "inconnu", brut: verbatim },
      note: `règle de bloc sans séparateur « type - bornes » : « ${verbatim} »`,
    };
  }

  const motType = coupe[1].trim();
  const type = TYPES.find((t) => t.mot.test(motType))?.type;
  if (!type) {
    return {
      regle: { type: "inconnu", brut: verbatim },
      note: `type de bloc inconnu (« ${motType} ») dans la règle « ${verbatim} » — attendu obligatoire, option ou choix`,
    };
  }

  const lues = parseBornes(coupe[2]);
  if (!lues) {
    return {
      regle: { type: "inconnu", brut: verbatim },
      note: `bornes de crédits non reconnues dans « ${verbatim} » (partie « ${coupe[2].trim()} »)`,
    };
  }
  if (lues.bornes === null) {
    return {
      regle: { type: "inconnu", brut: verbatim },
      note:
        `règle « ${verbatim} » : un minimum sans maximum. Forme jamais relevée, et ` +
        "aucun maximum ne peut être nommé sans l'inventer — bloc laissé non auditable.",
    };
  }

  return { regle: { type, bornes: lues.bornes }, note: null };
}

/** Nom court de la forme lue, pour le relevé imprimé en fin de scrape. */
export function formeDeRegle(brut: string): string {
  const lue = parseRegleBloc(brut);
  if (lue.regle.type === "inconnu") return "inconnu";
  const { min, max } = lue.regle.bornes;
  const bornes = min === max ? "exacte" : min === 0 ? "max seul" : "min+max";
  return `${lue.regle.type} / ${bornes}`;
}

// ---------------------------------------------------------------------------
// Totaux par type — `Programme.exigences`
// ---------------------------------------------------------------------------

/**
 * Reconnaît une phrase qui énonce les totaux par type. Formes relevées :
 *
 *   « 54 crédits obligatoires, 33 crédits à option et 3 crédits au choix »
 *   « 60 crédits obligatoires et 30 crédits à option »                 (aucun « au choix »)
 *   « 60 crédits obligatoires, 27 à option et 3 crédits au choix »      (« 27 à option », sans « crédits »)
 *   « 68 crédits obligatoires, de 30 à 33 crédits à option et un maximum de 3 crédits au choix »
 *   « 45 crédits obligatoires, de 39 à 42 crédits à option et 3 à 6 crédits au choix »
 *   « 29 crédits obligatoires attribués à la recherche, de 10 à 16 crédits à option et un maximum de 6 crédits au choix »
 *   « 27 crédits de cours obligatoire, un minimum de 60 crédits à option et un maximum de 3 crédits au choix »
 *   « Le segment comporte 15 crédits obligatoires et un minimum de 30 crédits à option. »
 */
/**
 * `\b` ne marche PAS devant « à ». Bogue muet attrapé sur la page du bacc en
 * mathématiques : `\b` en JavaScript est une frontière de mot ASCII, et « à »
 * n'est pas un caractère de mot ASCII. Dans « 30 crédits à option », le « à »
 * est précédé d'une espace — deux non-mots, donc aucune frontière, donc aucune
 * correspondance. Conséquence observée : les deux orientations COOP, qui
 * écrivent « 60 crédits obligatoires et 30 crédits à option » sans « au choix »,
 * n'étaient pas reconnues comme des phrases de répartition. Rien n'échouait :
 * elles disparaissaient. D'où ce lookbehind explicite sur les lettres latines.
 */
const AVANT_MOT = String.raw`(?<![A-Za-zÀ-ÿ])`;
const A_OPTION = new RegExp(`${AVANT_MOT}[àa]\\s+option\\b`, "i");
const AU_CHOIX = /\bau\s+choix\b/i;
const CREDITS_OBLIGATOIRES = /cr[ée]dits?\s+(?:de\s+cours\s+)?obligatoires?/i;

const MARQUEURS_EXIGENCE = [CREDITS_OBLIGATOIRES, A_OPTION, AU_CHOIX];

/**
 * Découpe un texte en phrases et garde celles qui énoncent des totaux par type.
 *
 * Exige DEUX marqueurs différents, pas un : « 90 crédits » seul n'est pas une
 * répartition, et « les cours à option » non plus.
 */
export function trouverPhrasesExigences(texte: string): string[] {
  const out: string[] = [];
  for (const ligne of texte.split("\n")) {
    for (const phrase of decouperPhrases(ligne)) {
      const marques = MARQUEURS_EXIGENCE.filter((re) => re.test(phrase)).length;
      if (marques >= 2 && /\d/.test(phrase)) out.push(phrase.trim());
    }
  }
  return out;
}

/** Phrases d'un texte, en ne coupant pas sur le point d'une abréviation. */
function decouperPhrases(texte: string): string[] {
  // Trois coupures :
  //   - un point suivi d'une espace et d'une majuscule (ou d'un tiret de puce) ;
  //   - un point en fin de chaîne ;
  //   - un deux-points suivi d'une PUCE, parce que la page introduit ses listes
  //     par « … est offert selon sept orientations : - orientation Actuariat … ».
  //     Sans cette troisième, la première puce traîne son préambule dans le
  //     `brut` verbatim — lisible, mais moins fidèle à ce que la page énonce.
  // « LL. B. » et « 2e » ne sont pas coupés : on exige une espace ET une
  // majuscule après le point, ou la fin de chaîne.
  return texte
    .split(/(?<=\.)\s+(?=[A-ZÀ-Þ-])|(?<=[:.])\s+(?=[-–—]\s)|(?<=\.)$/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/**
 * Découpe une phrase de répartition en fragments, un par type de crédits.
 *
 * Les PARENTHÈSES sont retirées d'abord, et ce n'est pas cosmétique : la page
 * écrit « - orientation Actuariat (segments 01 et 75) avec 54 crédits
 * obligatoires… ». Le « et 76 » de « (segments 01 et 76) » est un séparateur
 * pour le découpage, et le premier nombre du fragment suivant devenait alors
 * « 76 » au lieu de « 60 ». Résultat : un total obligatoire faux, tiré d'un
 * numéro de segment, sans que rien n'échoue. Les parenthèses ne portent jamais
 * de bornes — elles portent des segments (« (segments 01 et 75) »), un
 * cheminement (« (MM) », « (S) ») ou un grade (« (LL. B.) »).
 */
function fragments(phrase: string): string[] {
  return phrase
    .replace(/\([^)]*\)/g, " ")
    .split(/,| et (?=(?:un |de |[\d]))| et(?= \d)/i)
    .map((f) => f.trim())
    .filter((f) => f !== "");
}

function bornesDuFragment(fragment: string): Intervalle | null {
  let m = new RegExp(`un\\s+maximum\\s+de\\s+(${NB})`, "i").exec(fragment);
  if (m) return { min: 0, max: nombre(m[1]) };

  m = new RegExp(`\\bde\\s+(${NB})\\s+[àa]\\s+(${NB})`, "i").exec(fragment);
  if (m) return { min: nombre(m[1]), max: nombre(m[2]) };

  // « 3 à 6 crédits au choix » : même intervalle, sans le « de ».
  m = new RegExp(`(?:^|[^\\d])(${NB})\\s+[àa]\\s+(${NB})\\s*${CR}`, "i").exec(fragment);
  if (m) return { min: nombre(m[1]), max: nombre(m[2]) };

  // « un minimum de 60 crédits à option » : pas de maximum nommable.
  if (new RegExp(`un\\s+minimum\\s+de\\s+(${NB})`, "i").test(fragment)) return null;

  m = new RegExp(`(${NB})`, "i").exec(fragment);
  if (m) return { min: nombre(m[1]), max: nombre(m[1]) };

  return null;
}

/**
 * Parse une phrase de répartition en `ExigencesParType`.
 *
 * Un type absent de la phrase reste `null` : « 60 crédits obligatoires et 30
 * crédits à option » (Actuariat COOP) n'énonce aucun crédit au choix, et
 * écrire `{min:0,max:0}` affirmerait « zéro crédit au choix », que la page ne
 * dit pas. Un type présent mais dont les bornes ne sont pas nommables
 * (« un minimum de 60 crédits à option ») reste `null` aussi, avec un motif.
 */
export function parseExigencesParType(phrase: string): {
  exigences: ExigencesParType;
  notes: string[];
} {
  const out: ExigencesParType = {
    brut: phrase.trim(),
    obligatoire: null,
    option: null,
    choix: null,
  };
  const notes: string[] = [];

  for (const fragment of fragments(phrase)) {
    let cle: "obligatoire" | "option" | "choix" | null = null;
    if (AU_CHOIX.test(fragment)) cle = "choix";
    else if (A_OPTION.test(fragment)) cle = "option";
    else if (/obligatoires?\b/i.test(fragment)) cle = "obligatoire";
    if (cle === null) continue;
    if (out[cle] !== null) {
      notes.push(`« ${phrase.trim()} » énonce deux fois le total ${cle} — le premier est retenu`);
      continue;
    }
    const bornes = bornesDuFragment(fragment);
    if (bornes === null) {
      notes.push(
        `« ${fragment} » : total ${cle} présent mais sans bornes nommables ` +
          "(un minimum sans maximum, ou aucun nombre) — laissé à null",
      );
      continue;
    }
    out[cle] = bornes;
  }

  return { exigences: out, notes };
}
