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
  /** Libellé qui précédait la règle et qui en délimite la portée
   *  (« Cheminement régulier »). À ranger dans `Bloc.notes` : il dit à QUI la
   *  règle s'applique, et le perdre ferait passer la règle d'un cheminement
   *  pour celle du bloc entier. */
  prefixe: string | null;
}

/** « 12 » et « 1,5 » et « 1.5 ». La page écrit des crédits fractionnaires. */
function nombre(brut: string): number {
  return Number.parseFloat(brut.replace(",", "."));
}

const NB = String.raw`\d+(?:[.,]\d+)?`;
const CR = String.raw`cr[ée]dits?`;

/**
 * Tous les tirets Unicode, ramenés au tiret ASCII AVANT toute reconnaissance.
 *
 * Huit blocs écrivaient « Option ‐ Maximum 6 crédits. » avec U+2010 (HYPHEN) au
 * lieu de U+002D, et un autre « Option – min. 3.0 crédits » avec U+2013 (EN
 * DASH). À l'œil c'est le même caractère ; pour une expression régulière c'est
 * un échec silencieux. Normaliser une fois vaut mieux qu'une variante de regex
 * par tiret : la prochaine page qui emploiera U+2012 passera sans rien changer.
 */
const TIRETS_UNICODE = /[‐‑‒–—―−]/g;
/** Espace insécable : même raison, `\s` ne la couvre pas partout. */
const ESPACES_UNICODE = /[   ]/g;

export function normaliserPonctuation(texte: string): string {
  return texte.replace(TIRETS_UNICODE, "-").replace(ESPACES_UNICODE, " ");
}

/**
 * Type du bloc, puis le reste. Le séparateur est OPTIONNEL et peut être un
 * tiret ou un deux-points : la page écrit « Obligatoire - 26 crédits. » mais
 * aussi « Obligatoire 12 crédits. » (certificat de gérontologie), « Option-
 * Minimum 1 crédit. » (maîtrise en biologie moléculaire) et « Option : Minimum
 * 12 crédits, maximum 42 crédits. » (bacc. en sociologie).
 *
 * « Cours obligatoire » (DESS en journalisme) et « Au choix » (DESS en santé
 * environnementale mondiale) sont les mêmes types, écrits autrement.
 */
const RE_TYPE =
  /^(cours\s+obligatoires?|obligatoires?|au\s+choix|choix|options?)\s*(?:[-:]\s*)?([\s\S]*)$/i;

/**
 * Préfixe de cheminement devant la règle, ancré sur le mot « Cheminement ».
 *
 * Le bacc. en sociologie écrit « Cheminement régulier : option - Maximum 9
 * crédits. » dans le `<small>` et met la règle de l'AUTRE cheminement dans
 * `bloc-notes`. Le préfixe n'est pas du bruit — il dit à quel cheminement la
 * règle s'applique — donc il est retiré pour la lecture et rendu à l'appelant,
 * qui le range dans `Bloc.notes`.
 */
const RE_PREFIXE_CHEMINEMENT = /^(Cheminements?\s+[^:]{1,40}?)\s*:?\s+(?=(?:cours\s+)?(?:obligatoire|option|choix|au\s+choix)\b)/i;

function typeDeMot(mot: string): "obligatoire" | "option" | "choix" | null {
  const m = mot.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(?:cours )?obligatoires?$/.test(m)) return "obligatoire";
  if (/^options?$/.test(m)) return "option";
  if (/^(?:au )?choix$/.test(m)) return "choix";
  return null;
}

type FormeBornes = "exacte" | "min-max" | "max" | "min-seul";

interface BornesLues {
  forme: FormeBornes;
  bornes: Intervalle | null;
}

/** « Minimum », « minimum de », « min. » — et pareil pour le maximum. */
const MIN = String.raw`min(?:imum|\.)\s*(?:de\s+)?`;
const MAX = String.raw`max(?:imum|\.)\s*(?:de\s+)?`;
/** Ce qui sépare deux bornes : virgule, point-virgule, « et », ou rien. */
const ENTRE_BORNES = String.raw`\s*(?:[,;]\s*)?(?:et\s+)?`;

/**
 * Partie droite de la règle : les bornes seules.
 *
 * Les orthographes acceptées viennent toutes de pages réelles, relevées sur les
 * 1 088 programmes :
 *   « Minimum 12 crédits, maximum 27 crédits »        forme majoritaire
 *   « Minimum de 2 crédits, maximum de 6 crédits »    doctorat en sciences de la vision
 *   « Minimum 21 crédits; maximum 30 crédits »        bacc. en communication et politique
 *   « Minimum 6 crédits et maximum 9 crédits »        DESS en santé environnementale mondiale
 *   « Minimum 10 et maximum 21 crédits »              DES en médecine vétérinaire
 *   « min. 3.0 crédits, max. 9.0 crédits »            bacc. en enseignement des sciences
 *   « min. 3 max. 9 crédits »                         idem, sans virgule ni premier « crédits »
 *   « 6 à 12 crédits »                                bacc. 4 ans en arts et lettres
 */
export function parseBornes(droite: string): BornesLues | null {
  const t = droite.trim();

  let m = new RegExp(
    `^${MIN}(${NB})\\s*(?:${CR})?${ENTRE_BORNES}${MAX}(${NB})\\s*(?:${CR})?$`,
    "i",
  ).exec(t);
  if (m) return { forme: "min-max", bornes: { min: nombre(m[1]), max: nombre(m[2]) } };

  m = new RegExp(`^${MAX}(${NB})\\s*(?:${CR})?$`, "i").exec(t);
  if (m) return { forme: "max", bornes: { min: 0, max: nombre(m[1]) } };

  m = new RegExp(`^${MIN}(${NB})\\s*(?:${CR})?$`, "i").exec(t);
  if (m) return { forme: "min-seul", bornes: null };

  // « 6 à 12 crédits » : un intervalle écrit sans nommer ses bornes.
  m = new RegExp(`^(${NB})\\s*[àa]\\s*(${NB})\\s*${CR}$`, "i").exec(t);
  if (m) return { forme: "min-max", bornes: { min: nombre(m[1]), max: nombre(m[2]) } };

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
  // Normaliser AVANT de reconnaître : tirets Unicode et espaces insécables.
  let t = normaliserPonctuation(verbatim).replace(/\.$/, "").trim();

  let prefixe: string | null = null;
  const mPrefixe = RE_PREFIXE_CHEMINEMENT.exec(t);
  if (mPrefixe) {
    prefixe = mPrefixe[1].trim();
    t = t.slice(mPrefixe[0].length).trim();
  }

  const coupe = RE_TYPE.exec(t);
  const type = coupe ? typeDeMot(coupe[1]) : null;
  if (!coupe || type === null) {
    return {
      regle: { type: "inconnu", brut: verbatim },
      note: `« ${verbatim} » ne commence pas par un type de bloc (obligatoire, option ou choix)`,
      prefixe,
    };
  }

  const lues = parseBornes(coupe[2]);
  if (!lues) {
    return {
      regle: { type: "inconnu", brut: verbatim },
      note:
        coupe[2].trim() === ""
          ? `règle « ${verbatim} » : un type sans aucune borne de crédits`
          : `bornes de crédits non reconnues dans « ${verbatim} » (partie « ${coupe[2].trim()} »)`,
      prefixe,
    };
  }
  if (lues.bornes === null) {
    return {
      regle: { type: "inconnu", brut: verbatim },
      note:
        `règle « ${verbatim} » : un minimum sans maximum. Aucun maximum ne peut ` +
        "être nommé sans l'inventer — bloc laissé non auditable.",
      prefixe,
    };
  }

  return { regle: { type, bornes: lues.bornes }, note: null, prefixe };
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

// ---------------------------------------------------------------------------
// Orientations — les PARCOURS déclarés par une page
// ---------------------------------------------------------------------------

export interface OrientationBrute {
  nom: string;
  segments: string[];
  /** La phrase d'où l'orientation a été lue, verbatim. Elle porte parfois la
   *  répartition, parfois seulement le nom et les segments. */
  phrase: string;
}

/**
 * Nom d'orientation : ce qui suit « orientation », « option » ou
 * « cheminement », jusqu'à la première ponctuation ou au premier verbe.
 *
 * Formes réelles, toutes de la même page ou d'à côté :
 *   « - orientation Actuariat (segments 01 et 75) avec 54 crédits… »
 *   « - orientation générale (segment 01 et 76) : 57 crédits… »
 *   « - cheminement honor (segment 01 et 78) : 54 crédits… »
 *   « - l'option Mathématiques pures, cheminement avec mémoire (segment 70), »
 *   « - L'orientation clinique comportant 105 crédits comprend les segments 01 et 80 avec… »
 */
const NOM_ORIENTATION =
  /(?:orientations?|options?|cheminements?)\s+([A-Za-zÀ-ÿ0-9][^(,:;]{1,69}?)(?=\s*[,(:;]|\s+(?:comportant|comprend|avec|est|sont)\b|$)/i;

/**
 * Mots qui suivent « orientations » sans nommer une orientation.
 *
 * La phrase « Il comprend un tronc commun (segment 01) et est offert selon sept
 * orientations : » porte à la fois le mot « orientations » et un numéro de
 * segment : sans ce garde-fou, elle fabriquait un parcours fantôme, qui aurait
 * donné une entrée d'index qui ne s'ouvre sur rien.
 */
const FAUX_NOMS = /^(?:suivantes?|suivants?|ci-dessous|distinctes?|différentes?|[\d\W]+)$/i;

/** « (segments 01 et 75) », « (segment 70) », « comprend les segments 01 et 80 ». */
const SEGMENTS_CITES = /segments?\s+((?:\d{1,3})(?:\s*(?:,|et|ou|&)\s*\d{1,3})*)/i;

/**
 * Orientations déclarées par un texte de description.
 *
 * POURQUOI ELLES EXISTENT. Un `Programme` est une PAGE ; ce qu'un étudiant
 * choisit est un PARCOURS. La page du bacc. en mathématiques énonce sept
 * répartitions de crédits, une par orientation : avec un seul emplacement
 * `exigences`, désigner celle de l'actuariat serait un choix arbitraire déguisé
 * en donnée. Chaque orientation porte donc la sienne.
 *
 * Une orientation n'est retenue que si la phrase donne À LA FOIS un nom et des
 * segments. Sans segments, on ne saurait pas quels blocs lui appartiennent, et
 * un parcours sans blocs vaut moins que pas de parcours du tout.
 */
export function lireOrientations(texte: string): OrientationBrute[] {
  const puces = decouperEnPuces(texte);
  // Si la description n'est PAS une liste à puces, on ne cherche pas
  // d'orientations. La phrase d'introduction en contient toujours les mots :
  // « Il comprend un tronc commun (segment 01) et est offert selon 2
  // orientations et un cheminement particulier : » porte « orientations » ET un
  // numéro de segment, et fabriquait un parcours nommé « et un cheminement
  // particulier ». Une page sans puces déclare un seul parcours — et rater une
  // orientation qui ne serait pas en puce donne un parcours unique, ce qui est
  // faux mais visible, alors qu'un parcours fantôme est une entrée d'index qui
  // ne s'ouvre sur rien.
  if (puces.length === 0) return [];

  const out: OrientationBrute[] = [];
  for (const puce of puces) {
    const mNom = NOM_ORIENTATION.exec(puce);
    const mSeg = SEGMENTS_CITES.exec(puce);
    if (!mNom || !mSeg) continue;
    const nom = mNom[1]
      .replace(/^(?:l['’]|la\s+|le\s+|les\s+)/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const segments = [...mSeg[1].matchAll(/\d{1,3}/g)].map((m) => m[0]);
    if (nom === "" || nom.length < 2 || FAUX_NOMS.test(nom) || segments.length === 0) continue;

    // Une même orientation est souvent annoncée DEUX FOIS : une liste qui donne
    // son segment propre, puis une seconde qui donne ses segments complets et sa
    // répartition (bacc. en informatique). On fusionne au lieu de garder la
    // première : garder la première perdait la répartition, garder la seconde
    // perdait rien mais c'est un hasard d'ordre.
    const deja = out.find((o) => o.nom.toLowerCase() === nom.toLowerCase());
    if (deja) {
      deja.segments = [...new Set([...deja.segments, ...segments])];
      if (trouverPhrasesExigences(deja.phrase).length === 0) deja.phrase = puce;
      continue;
    }
    out.push({ nom, segments, phrase: puce });
  }
  return out;
}

/**
 * Les PUCES d'un texte de description, une par entrée de liste.
 *
 * `texteBrut` met déjà chaque `<p>` sur sa ligne, et la page met une puce par
 * `<p>` ; mais la maîtrise et le certificat écrivent leurs trois puces dans un
 * même paragraphe, séparées par des virgules. D'où la seconde coupure.
 * Une ligne qui ne commence pas par un tiret n'est pas une puce : c'est ce qui
 * écarte la phrase d'introduction.
 */
function decouperEnPuces(texte: string): string[] {
  const out: string[] = [];
  for (const ligne of texte.split("\n")) {
    for (const morceau of ligne.split(/(?<=[,;:.])\s+(?=[-–—]\s)/)) {
      const t = morceau.trim();
      if (/^[-–—]\s/.test(t)) out.push(t);
    }
  }
  return out;
}

/**
 * Nom du CHEMINEMENT qu'une phrase de répartition qualifie, ou null.
 *
 * Un cheminement mémoire et un cheminement stage ont des répartitions de
 * crédits différentes : ce sont donc deux parcours au sens où l'étudiant en
 * choisit un, et c'est exactement ce que `Orientation` désigne. Ils sont
 * aplatis en orientations plutôt que modélisés sur un troisième niveau —
 * l'imbrication est une façon dont la PAGE est écrite, pas une nécessité du
 * modèle, et un niveau de plus se propagerait dans le sélecteur, la clé de
 * parcours, la projection et les tests de trois chantiers sans rien exprimer
 * de neuf.
 *
 * Deux formulations réelles, sur deux pages du même cycle :
 *   maîtrise en mathématiques : « - cheminement avec mémoire (MM) : 29 crédits… »
 *   maîtrise en informatique  : « Les crédits de l'option avec mémoire (MM), sont répartis… »
 * La seconde n'écrit même pas le mot « cheminement ». Leur seul noyau commun
 * est le « avec X » suivi de son sigle entre parenthèses — d'où l'ancrage
 * là-dessus, et non sur un mot-clé qui n'est pas toujours écrit.
 */
const CHEMINEMENT =
  /(?:cheminements?|options?|orientations?)\s+(avec\s+[^(,:;.]{1,50}?)\s*(?:\(([A-Za-z]{1,4})\))?\s*[,:]/i;

export function lireCheminement(phrase: string): string | null {
  const m = CHEMINEMENT.exec(phrase);
  if (!m) return null;
  const qualificatif = m[1].replace(/\s+/g, " ").trim();
  if (qualificatif === "") return null;
  const sigle = m[2] ? ` (${m[2].toUpperCase()})` : "";
  return `${qualificatif}${sigle}`;
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
