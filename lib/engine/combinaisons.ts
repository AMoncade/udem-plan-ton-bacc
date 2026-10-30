import type { CodeCours, Cours, Creneau, SectionHoraire, Trimestre } from "../types";
import { normaliserCode } from "../codes";
import { sectionsDuTrimestre, seancesDeSection } from "../horaires";
import { chevauchements, conflitsEntreCours, type Chevauchement } from "./horaires";

/**
 * COMBINAISONS D'HORAIRE — les horaires qu'un étudiant PEUT composer pour un
 * trimestre, et la liste de ce que ce module refuse de composer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE : QUE SONT « A101 » ET « A102 » ?
 *
 * Sur la fiche publique, MAT 1400 Hiver 2027 publie A, A101, A102, A103, B,
 * B101, B102. L'hypothèse naturelle est « A101 est un TP qui dépend de A :
 * l'étudiant prend A + une des sous-sections de A ». La page ne l'écrit nulle
 * part (voir `SectionHoraire`) — d'où la mesure ci-dessous, faite avant d'écrire
 * la règle plutôt qu'après.
 *
 * FORMES DES NOMS DE SECTION (L = lettre, 9 = chiffre).
 *  - tout `data/cours` : L 8 522 · L999 1 380 · L9 640 · L99 247 · LL 22 ·
 *    LLL 16 · 9 (chiffre seul) 1 ;
 *  - Hiver 2027 seulement (3 134 cours ayant un aperçu publié ce trimestre,
 *    aucune section sans séance) : L 3 793 · L999 748 · L9 317 · L99 117 ·
 *    LL 14 · LLL 7 · 9 : 0.
 *
 * CLASSEMENT DES 3 134 COURS DE L'HIVER 2027 PAR STRUCTURE DE SECTIONS
 * (exclusif ; précédence c > d > b > a ; mesuré sur data/cours le 2026-10-30,
 * commit 74720ea) :
 *
 *   cas                                                   cours   exemples réels
 *   (a) lettres seulement (L, LL, LLL)                    2 738   ABK 1901 [A] · ARC 1012 [INS] · ASA 6708 [SN]
 *   (b) lettres + L999 dont la lettre existe                202
 *       - centaine 1 seule (A101…)                          184   MAT 1400 [A,A101,A102,A103,B,B101,B102] · STT 1700 [A,A101,A102] · ACT 1240 [A,A101]
 *       - centaine 2 ou 3 seule (A201…)                      16   BIO 2405 [A,A201] · BIO 1634 [A,A201,A202,A203] · BIO 3283 [A,A301,A302]
 *       - centaines 1 ET 2                                     2   BIO 1434 [A,A101,A201,B,B101,B201,C,C101,C201]
 *   (c) sous-sections ORPHELINES (lettre absente)            50
 *       - L999 seul                                            9   BIO 2110 [A201,B201,C201] · GEO 3031 [A101] · EDU 3003 [X101]
 *       - avec L9/L99                                         41   PSY 6028 [H1] · MMD 2142 [A1] · SOL 1018 [A1]
 *   (d) mélanges L9/L99 dont la lettre existe                144
 *       - L9 seul                                            133   ANT 2470 [A,A1,A2,A3] · APA 1330 [A,A1,B,B1] · ARC 2214 [A,A1]
 *       - L99 seul                                             3   SOI 1814 [H,H11,H12,H21,H22,Z,Z11,Z12,Z21,Z22] · SOI 1823 · SOI 3614
 *       - L9 + L99                                             1   MMD 2115 [A,A1…A8,A55,T,T1]
 *       - avec L999 en plus                                    7   SOI 2514 [A,A101,A102,A103,A11,A12,A21,A22,A31,A32,C,…]
 *   total                                                   3 134
 *
 * Ces classes se recoupent avec « horaire inconnu » (voir plus bas). Après
 * application des deux tests, dans l'ordre du code, sur ces mêmes 3 134 cours :
 * 441 horaire inconnu (14,1 %), 195 indéterminés (6,2 %), 2 498 combinables
 * (79,7 %) dont 2 320 en alternatives (a) et 178 en volets (b, centaine 1).
 *
 * Deux faits secondaires, pour juger de la robustesse de l'hypothèse « une
 * sous-section se tient EN PLUS de son parent » : sur les 701 sous-sections L999
 * dont le parent est publié, 12 (1,7 %) chevauchent les séances de leur parent ;
 * sur les 347 sous-sections L9/L99, 2 (0,6 %). Un chevauchement parent~sous-
 * section est un signal CONTRE la lecture « en plus » (on ne peut être aux deux
 * à la fois) : il y en a peu, et ces combinaisons sortent EN CONFLIT, jamais
 * « sans conflit ». Cela ne PROUVE rien : c'est une absence de réfutation.
 *
 * LA PREUVE INDÉPENDANTE — captures réelles de Synchro
 * (`synchro-calendrier/tests/fixtures/liste-A26.rows.json`, « Votre horaire
 * cours », Automne 2026, 4 cours inscrits). Chaque rangée porte la section ET
 * le volet (`component` TH/TP/LAB dans le code de l'extension) :
 *   MAT 1400 : A/TH + A102/TP · MAT 1500 : A/TH + A102/TP ·
 *   MAT 1600 : A/TH + A102/TP · STT 1700 : A/TH + A103/TP.
 * Ce que cela SOUTIENT : sur 4 cours sur 4, la sous-section L1xx est un volet TP
 * que l'étudiant suit EN PLUS de la section lettre (volet TH), pas à sa place.
 * Ce que cela NE SOUTIENT PAS :
 *  - l'appariement du préfixe. La seule lettre choisie est « A » dans les
 *    quatre cas ; rien ne montre que « A » + « B101 » serait refusé. Le module
 *    exige quand même que le préfixe coïncide : c'est la lecture prudente (elle
 *    n'énumère que des paires que la capture n'a pas contredites, et s'il
 *    existait des paires croisées légales elles manqueraient — jamais l'inverse) ;
 *  - un volet LAB. Le type existe dans l'extension, mais aucune capture n'en
 *    contient : ni la centaine 2xx, ni la forme L9/L99, ni les orphelines n'ont
 *    de témoin. « A201 est un laboratoire » est une hypothèse, pas un fait ;
 *  - le cas « une lettre sans sous-section alors que d'autres en ont » (0 cas
 *    mesuré dans le cas (b), donc aucune règle à en tirer).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RÈGLE RETENUE — elle n'applique la dépendance qu'à ce que la mesure soutient.
 *
 *  - (a) lettres seulement : les sections sont des ALTERNATIVES, on en suit une
 *    (invariant de `lib/horaires.ts`) ;
 *  - (b) lettres + L1xx, chaque lettre ayant au moins une sous-section, chaque
 *    sous-section ayant sa lettre : on suit une lettre ET UNE de ses
 *    sous-sections ;
 *  - TOUT AUTRE CAS va dans `indetermines`, jamais dans les combinaisons :
 *    centaines 2xx et plus (aucun témoin), formes L9/L99/LL999 (aucun témoin),
 *    sous-sections orphelines, lettre sans sous-section parmi des lettres qui
 *    en ont, nom répété, nom hors des formes mesurées. Les 195 cours indéterminés
 *    de l'Hiver 2027 sont LISTÉS, pas devinés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HORAIRE INCONNU — jamais « sans conflit ».
 *
 * Un cours dont la fiche est antérieure au champ, sans section pour ce
 * trimestre, avec une section sans séance, ou dont UNE séance (de n'importe
 * quelle section) est `nonAttribue` ou `illisible`, va dans `horaireInconnu` et
 * n'est comparé à rien. Mesuré, Hiver 2027 : 435 cours ont une séance « Non
 * attribué » et 13 une séance illisible (441 au total, 7 ayant les deux). Ce test précède celui de la
 * structure : un cours sans horaire n'a pas de structure à interpréter.
 * Conséquence pour l'appelant : `sansConflit` ne vaut que PARMI les cours
 * énumérés. Un cours listé dans `horaireInconnu` ou `indetermines` n'a pas été
 * confronté aux autres, et l'écran doit le dire à côté du compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENUMÉRATION
 *
 * Retour arrière sur les cours (ordre de l'appelant, doublons de code écartés),
 * une OPTION par cours (voir ci-dessus). Les chevauchements viennent de
 * `chevauchements()` — mêmes fenêtres de dates : deux séances sans date
 * commune ne se chevauchent pas — appelé par PAIRE de sections et mis en cache,
 * puis filtré par `conflitsEntreCours` (les recouvrements internes à une section
 * sont des incohérences de la page, pas un choix). Une séance `indetermine`
 * compterait comme un conflit : tout `Chevauchement` rendu, quel que soit son
 * état, est un conflit de la combinaison et empêche de la compter « sans
 * conflit ».
 *
 * Un seul cas garde un `Chevauchement` dont `a.code === b.code` : le recouvrement
 * entre la lettre et la sous-section CHOISIE d'un même cours (« A » et « A101 »
 * au même moment). C'est la conséquence de la combinaison choisie, pas une
 * incohérence de la page, et l'étudiant ne peut pas être aux deux.
 *
 * Tri : nombre de conflits croissant, puis ordre de découverte (déterministe :
 * cours dans l'ordre de l'appelant, options dans l'ordre de la page). Les
 * combinaisons SANS conflit viennent donc en premier, et il y en a
 * `sansConflit`. La liste continue avec les moins conflictuelles jusqu'à
 * `plafond` : l'écran peut n'afficher que les `sansConflit` premières quand il
 * y en a.
 *
 * Élagage : dès que la liste est pleine, une branche dont le coût partiel atteint
 * celui de la dernière retenue est abandonnée (elle ne peut que l'égaler, et à
 * égalité la plus ancienne gagne). `tronque` vaut vrai quand il existe plus de
 * combinaisons que `plafond`, OU quand le budget de recherche (BUDGET_NOEUDS)
 * est épuisé — dans ce second cas la liste n'est plus garantie minimale non
 * plus. Dans les deux cas la liste est incomplète : c'est ce que `tronque` dit.
 *
 * AUCUN COURS ÉNUMÉRABLE (liste vide, ou tous exclus) : `combinaisons` est VIDE,
 * pas « une combinaison vide ». Une combinaison vide serait « 1 horaire sans
 * conflit » pour zéro cours, la vérité vacue que ce projet refuse de rendre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉSERVE DE `RESERVE_APERCU` S'APPLIQUE À TOUT CE QUI SORT D'ICI : « sans
 * conflit » veut dire « sans conflit dans l'APERÇU publié ».
 */

export const PLAFOND_COMBINAISONS_DEFAUT = 200;

/** Noeuds du retour arrière au-delà desquels on abandonne. Dimensionné pour
 *  que le plafond par défaut soit atteint en moins d'une seconde sur des cas
 *  patho (12 cours de 12 alternatives toutes en conflit). */
const BUDGET_NOEUDS = 500_000;

/** Centaines de sous-section dont la lecture « volet TP » a un témoin Synchro
 *  (A102, A103 : MAT 1400, 1500, 1600, STT 1700). Ajouter « 2 » exigerait une
 *  capture contenant un volet LAB. */
const CENTAINES_SOUTENUES: readonly string[] = ["1"];

export interface ChoixDeCours {
  code: CodeCours;
  /** Les sections suivies, noms verbatim : « A » pour une alternative, ou
   *  « A », « A101 » (lettre puis sous-section) pour un cours à volets. */
  sections: string[];
}

export interface Combinaison {
  /** Un élément par cours énuméré, dans l'ordre des fiches reçues. */
  choix: ChoixDeCours[];
  /** Tous les chevauchements de la combinaison, `indetermine` compris. */
  conflits: Chevauchement[];
}

export interface OptionsCombinaisons {
  /** Nombre maximal de combinaisons rendues. Entier >= 1 ; défaut 200. */
  plafond?: number;
  /** Noeuds du retour arrière au-delà desquels la recherche s'arrête (alors
   *  `tronque` est vrai). Entier >= 1 ; défaut 500 000. Borne la latence d'un
   *  écran ; les tests s'en servent pour atteindre l'abandon sans 500 000 noeuds. */
  budgetNoeuds?: number;
}

export interface ResultatCombinaisons {
  /** Triées : moins de conflits d'abord, puis ordre de découverte. */
  combinaisons: Combinaison[];
  /** Combien de combinaisons RENDUES n'ont aucun conflit — elles ouvrent la liste. */
  sansConflit: number;
  /** La liste est incomplète : plus de combinaisons que `plafond`, ou budget de recherche épuisé. */
  tronque: boolean;
  /** Pas de séance publiée pour ce trimestre, ou séance `nonAttribue`/`illisible`. */
  horaireInconnu: CodeCours[];
  /** Structure de sections ambiguë : le cours n'a pas été combiné. */
  indetermines: CodeCours[];
}

// ---------------------------------------------------------------------------
// Structure des sections
// ---------------------------------------------------------------------------

export type StructureDeSections =
  | {
      genre: "determinee";
      /** `alternatives` : une section au choix. `volets` : une lettre ET une de ses sous-sections. */
      forme: "alternatives" | "volets";
      /** Chaque option est la liste des sections suivies. Ordre de la page. */
      options: string[][];
    }
  | { genre: "indeterminee"; raison: string };

const LETTRES = /^[A-Z]+$/;
const SOUS_SECTION = /^([A-Z])([0-9])[0-9]{2}$/;

const indeterminee = (raison: string): StructureDeSections => ({ genre: "indeterminee", raison });

/**
 * Ce que les noms de section permettent d'affirmer, ou pourquoi ils ne le
 * permettent pas. Voir l'en-tête du module pour la mesure qui fonde chaque
 * branche. Exportée pour que l'écran puisse dire POURQUOI un cours est
 * indéterminé, et parce que c'est la fonction à rouvrir quand une nouvelle
 * capture de Synchro soutiendra une autre forme.
 */
export function structureDeSections(noms: readonly string[]): StructureDeSections {
  if (noms.length === 0) return indeterminee("aucune section publiée");
  if (new Set(noms).size !== noms.length) {
    return indeterminee("un nom de section est répété : impossible de savoir laquelle est suivie");
  }

  const lettres = noms.filter((n) => LETTRES.test(n));
  const autres = noms.filter((n) => !LETTRES.test(n));

  if (autres.length === 0) {
    return { genre: "determinee", forme: "alternatives", options: noms.map((n) => [n]) };
  }

  const sousSections = new Map<string, string[]>();
  for (const nom of autres) {
    const m = SOUS_SECTION.exec(nom);
    if (m === null) {
      return indeterminee(
        `« ${nom} » n'a pas la forme lettre + 3 chiffres, la seule dont la dépendance à sa lettre a un témoin (A102, A103 dans Synchro)`,
      );
    }
    if (!CENTAINES_SOUTENUES.includes(m[2])) {
      return indeterminee(
        `« ${nom} » : seule la centaine 1 (TP) a un témoin dans Synchro ; le rôle de la centaine ${m[2]} n'est pas établi`,
      );
    }
    if (!lettres.includes(m[1])) {
      return indeterminee(`« ${nom} » est une sous-section orpheline : la section « ${m[1]} » n'est pas publiée`);
    }
    const deja = sousSections.get(m[1]);
    if (deja) deja.push(nom);
    else sousSections.set(m[1], [nom]);
  }

  for (const lettre of lettres) {
    if (!sousSections.has(lettre)) {
      return indeterminee(
        `la section « ${lettre} » n'a pas de sous-section alors que d'autres en ont : on ne sait pas si elle se suit seule`,
      );
    }
  }

  const options: string[][] = [];
  for (const lettre of lettres) {
    for (const sous of sousSections.get(lettre) ?? []) options.push([lettre, sous]);
  }
  return { genre: "determinee", forme: "volets", options };
}

// ---------------------------------------------------------------------------
// Analyse d'un cours
// ---------------------------------------------------------------------------

/** `switch` exhaustif avec garde `never` : `Creneau` est une union que le
 *  scraper étendra, et un genre nouveau ne doit pas passer pour exploitable. */
function creneauExploitable(creneau: Creneau): boolean {
  switch (creneau.genre) {
    case "attribue":
      return true;
    case "nonAttribue":
    case "illisible":
      return false;
    default: {
      const jamais: never = creneau;
      throw new Error(`genre de créneau non traité : ${JSON.stringify(jamais)}`);
    }
  }
}

interface CoursEnumerable {
  code: CodeCours;
  options: string[][];
  sections: Map<string, SectionHoraire>;
}

type Analyse =
  | { genre: "inconnu" }
  | { genre: "indetermine" }
  | { genre: "enumerable"; cours: CoursEnumerable };

function analyser(fiche: Cours, cible: Trimestre): Analyse {
  const noms = sectionsDuTrimestre(fiche.apercuHoraires, cible);
  if (noms.length === 0) return { genre: "inconnu" };

  // Projection par `seancesDeSection` : le seul endroit qui choisit une
  // section. Elle LÈVE ; ici une exception veut dire « horaire non projetable ».
  const sections = new Map<string, SectionHoraire>();
  try {
    for (const nom of noms) {
      const seances = seancesDeSection(fiche.apercuHoraires, cible, nom);
      if (seances.length === 0) return { genre: "inconnu" };
      if (!seances.every((s) => creneauExploitable(s.creneau))) return { genre: "inconnu" };
      sections.set(nom, { nom, seances });
    }
  } catch {
    return { genre: "inconnu" };
  }

  const structure = structureDeSections(noms);
  if (structure.genre === "indeterminee") return { genre: "indetermine" };
  return { genre: "enumerable", cours: { code: fiche.code, options: structure.options, sections } };
}

// ---------------------------------------------------------------------------
// Énumération
// ---------------------------------------------------------------------------

interface Retenue {
  cout: number;
  options: number[];
  conflits: Chevauchement[];
}

export function combinaisons(
  fiches: Cours[],
  cible: Trimestre,
  options: OptionsCombinaisons = {},
): ResultatCombinaisons {
  const plafond = options.plafond ?? PLAFOND_COMBINAISONS_DEFAUT;
  if (!Number.isInteger(plafond) || plafond < 1) {
    throw new RangeError(`plafond de combinaisons invalide : ${String(plafond)} (entier >= 1 attendu)`);
  }
  const budget = options.budgetNoeuds ?? BUDGET_NOEUDS;
  if (!Number.isInteger(budget) || budget < 1) {
    throw new RangeError(`budget de recherche invalide : ${String(budget)} (entier >= 1 attendu)`);
  }

  // Un cours cité deux fois est le même cours : on garde la première fiche.
  const vus = new Set<string>();
  const cours: CoursEnumerable[] = [];
  const horaireInconnu: CodeCours[] = [];
  const indetermines: CodeCours[] = [];
  for (const fiche of fiches) {
    const cle = normaliserCode(fiche.code) ?? fiche.code;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const a = analyser(fiche, cible);
    if (a.genre === "inconnu") horaireInconnu.push(fiche.code);
    else if (a.genre === "indetermine") indetermines.push(fiche.code);
    else cours.push(a.cours);
  }

  const n = cours.length;
  if (n === 0) {
    return { combinaisons: [], sansConflit: 0, tronque: false, horaireInconnu, indetermines };
  }

  // Chevauchements d'une paire de sections de DEUX cours, calculés une fois.
  const cachePaires = new Map<string, Chevauchement[]>();
  const entre = (i: number, p: string, j: number, q: string): Chevauchement[] => {
    const cle = `${i}\u0001${p}\u0001${j}\u0001${q}`;
    let r = cachePaires.get(cle);
    if (r === undefined) {
      r = conflitsEntreCours(
        chevauchements([
          { code: cours[i].code, section: cours[i].sections.get(p) as SectionHoraire },
          { code: cours[j].code, section: cours[j].sections.get(q) as SectionHoraire },
        ]),
      );
      cachePaires.set(cle, r);
    }
    return r;
  };

  // Recouvrement entre la lettre et la sous-section choisies d'UN cours. Le
  // moteur refuse de comparer deux sections d'un même code (ce sont des
  // alternatives) : on les lui présente sous deux codes provisoires, puis on
  // remet le vrai code dans les références.
  const cacheInternes = new Map<string, Chevauchement[]>();
  const internes = (i: number, p: string, q: string): Chevauchement[] => {
    const cle = `${i}\u0001${p}\u0001${q}`;
    let r = cacheInternes.get(cle);
    if (r === undefined) {
      const code = cours[i].code;
      r = conflitsEntreCours(
        chevauchements([
          { code: "parent", section: cours[i].sections.get(p) as SectionHoraire },
          { code: "volet", section: cours[i].sections.get(q) as SectionHoraire },
        ]),
      ).map((c) => ({ ...c, a: { ...c.a, code }, b: { ...c.b, code } }));
      cacheInternes.set(cle, r);
    }
    return r;
  };

  // Conflits qu'ajoute l'option `o` du cours `k` aux options déjà choisies.
  const ajoutes = (k: number, o: number, choisies: number[]): Chevauchement[] => {
    const parts = cours[k].options[o];
    const out: Chevauchement[] = [];
    if (parts.length === 2) out.push(...internes(k, parts[0], parts[1]));
    for (let i = 0; i < k; i++) {
      for (const p of cours[i].options[choisies[i]]) {
        for (const q of parts) out.push(...entre(i, p, k, q));
      }
    }
    return out;
  };

  const retenues: Retenue[] = [];
  const choisies: number[] = new Array<number>(n).fill(0);
  const pile: Chevauchement[][] = new Array<Chevauchement[]>(n);
  let noeuds = 0;
  let abandon = false;

  const enregistrer = (cout: number): void => {
    // Après les égales : à coût égal, la plus ancienne reste devant.
    let pos = retenues.length;
    while (pos > 0 && retenues[pos - 1].cout > cout) pos--;
    retenues.splice(pos, 0, { cout, options: choisies.slice(), conflits: pile.flat() });
    if (retenues.length > plafond) retenues.pop();
  };

  const descendre = (k: number, cout: number): void => {
    if (k === n) {
      enregistrer(cout);
      return;
    }
    for (let o = 0; o < cours[k].options.length; o++) {
      if (++noeuds > budget) {
        abandon = true;
        return;
      }
      const nouveaux = ajoutes(k, o, choisies);
      const coutPartiel = cout + nouveaux.length;
      if (retenues.length >= plafond && coutPartiel >= retenues[retenues.length - 1].cout) continue;
      choisies[k] = o;
      pile[k] = nouveaux;
      descendre(k + 1, coutPartiel);
      if (abandon) return;
    }
  };
  descendre(0, 0);

  const total = cours.reduce((produit, c) => produit * c.options.length, 1);
  const rendues: Combinaison[] = retenues.map((r) => ({
    choix: cours.map((c, i) => ({ code: c.code, sections: [...c.options[r.options[i]]] })),
    conflits: r.conflits,
  }));

  return {
    combinaisons: rendues,
    sansConflit: rendues.filter((c) => c.conflits.length === 0).length,
    tronque: total > plafond || abandon,
    horaireInconnu,
    indetermines,
  };
}
