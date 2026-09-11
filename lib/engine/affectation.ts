import type { CodeCours, Intervalle } from "../types";
import { arrondi, type Bornes, type TypeBloc } from "./bornes";

/**
 * AFFECTATION DES COURS AUX BLOCS, SOUS BORNES.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 *
 * La v1 attribuait chaque cours au PREMIER bloc qui le cite, et documentait
 * l'hypothèse : sur l'actuariat, les huit blocs citent 55 codes DISTINCTS, donc
 * l'attribution n'a aucun choix à faire. La validation a trouvé le
 * contre-exemple, sur un vrai programme de l'UdeM
 * (docs/VALIDATION-AUTRES-PROGRAMMES.md §6) :
 *
 *   Bacc. en droit, bloc 70K « Formation pratique »   — Option - 3 crédits.
 *                   bloc 70L « ... complémentaire »   — Option - Maximum 9 crédits.
 *
 * Les 11 cours de 70K sont TOUS dans 70L : 70K ⊂ 70L. Un étudiant qui a suivi
 * DRT 3910, 3911, 3912 et 3913 (12 crédits) est conforme — 3 crédits dans 70K,
 * 9 dans 70L — mais l'attribution directe met les quatre cours dans 70K, qui
 * n'en retient que 3, perd 9 crédits et laisse 70L vide. Elle déclare donc NON
 * CONFORME un parcours CONFORME. Le raisonnement v1 avait vu juste sur le sens
 * de l'erreur ; il avait tort de croire le cas hypothétique.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CE QUE CET ALGORITHME GARANTIT
 *
 *  G1. Une affectation rendue avec `cout` tout à zéro est une PREUVE de
 *      conformité : elle est exhibée, chaque cours n'y apparaît qu'une fois, et
 *      toutes les bornes y tiennent. On peut la montrer à l'étudiant.
 *  G2. Quand `tronquee` est faux, la recherche est EXHAUSTIVE sur l'espace des
 *      affectations : « aucune affectation ne marche » est alors démontré, pas
 *      supposé.
 *  G3. Déterminisme total : le résultat ne dépend ni de l'ordre d'insertion
 *      dans le `Set` de cours faits, ni de l'ordre des clés d'un objet. Les
 *      cours sont triés, les groupes sont triés, l'énumération est ordonnée.
 *  G4. La PREMIÈRE affectation essayée est exactement celle de la v1 (tout au
 *      premier bloc candidat déclaré). Le solveur ne peut donc jamais être
 *      pire que la v1 ; il ne fait que continuer à chercher.
 *
 * CE QU'IL NE GARANTIT PAS
 *
 *  N1. Si `tronquee` est vrai, le verdict de NON-conformité n'est pas une
 *      preuve : la recherche a été coupée au plafond. L'appelant DOIT le dire à
 *      l'étudiant. (Le verdict de conformité, lui, reste valide : voir G1.)
 *  N2. Rien n'est garanti sur les contraintes que le contrat ne porte pas :
 *      « trois cours du bloc 79H ou 79Y dans la même discipline », « 33 crédits
 *      de sigle POL et 33 de sigle ECN », les séquences et les autorisations.
 *      Elles vivent dans `Bloc.notes` / `Programme.notes`, que le moteur ne
 *      lit pas : l'appelant doit les faire ressortir.
 *  N3. L'affectation retenue en cas d'échec est la MOINS MAUVAISE au sens du
 *      coût lexicographique ci-dessous, pas « celle que l'étudiant aurait
 *      choisie ». Elle sert à expliquer, pas à conseiller.
 *  N4. Un cours cité par un bloc ne va jamais dans le bloc au choix (voir
 *      `DECISION JOKER`). C'est une interprétation, pas un théorème.
 *  N5. La recherche s'ARRÊTE à la première affectation de coût nul, donc parmi
 *      les affectations conformes elle ne minimise pas forcément le gaspillage.
 *      `EtatBloc.creditsPerdus` peut donc être plus élevé qu'il ne devait l'être,
 *      sur un parcours par ailleurs conforme. C'est assumé : continuer à
 *      chercher pour embellir un verdict déjà favorable coûterait du temps sans
 *      changer la réponse à la question posée (« est-ce que je diplôme ? »).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MÉTHODE, ET POURQUOI ELLE SUFFIT
 *
 * Le problème général (remplir des bornes avec des objets indivisibles) est
 * NP-difficile. Les instances réelles, elles, sont minuscules ET très
 * structurées, et deux réductions les rendent triviales :
 *
 *  R1. Un cours cité par UN SEUL bloc n'offre aucun choix : il y va. Sur
 *      l'actuariat, c'est 55 cours sur 55 — la recherche ne s'exécute même pas.
 *  R2. Deux cours ambigus qui ont les MÊMES blocs candidats et le MÊME nombre
 *      de crédits sont interchangeables. On ne choisit donc pas « quel cours va
 *      où » mais « COMBIEN de ce groupe vont dans chaque bloc ». Le cas du
 *      droit passe de 2^11 = 2048 affectations à 12.
 *
 * Puis une borne inférieure admissible élague : pour chaque bloc, on calcule le
 * maximum de crédits qu'il pourrait encore recevoir des groupes non placés, et
 * on en déduit le manque minimal incontournable. Si ce manque dépasse déjà
 * celui de la meilleure affectation connue, la branche est coupée.
 *
 * Pas de solveur de flot : un flot entier découperait les crédits d'un cours
 * entre deux blocs, ce qu'un cours ne permet pas. Pas de programmation
 * linéaire : rien à installer, et rien à déboguer quand le verdict surprend.
 */

// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------

export interface BlocAffectable {
  /** `Bloc.cle` — PAS `Bloc.id`, qui n'est pas unique (`MM-Bloc 73A` et
   *  `S-Bloc 73A` coexistent dans le segment 73 de la maîtrise). */
  cle: string;
  id: string;
  bornes: Bornes;
  /** Codes NORMALISÉS cités par le bloc. */
  cours: ReadonlySet<CodeCours>;
  /** Bloc « Choix » à liste vide : accepte n'importe quel cours. */
  joker: boolean;
}

export interface ExigencesTotaux {
  obligatoire: Intervalle;
  option: Intervalle;
  choix: Intervalle;
  /** Total de crédits du diplôme. Null quand la page ne l'annonce pas : la
   *  contrainte de somme est alors simplement absente, jamais supposée à 90. */
  creditsTotal: number | null;
}

/**
 * Coût d'une affectation, comparé LEXICOGRAPHIQUEMENT dans cet ordre.
 * Tout à zéro <=> toutes les contraintes modélisables tiennent ensemble.
 */
export interface Cout {
  /** Σ des crédits manquants pour atteindre le minimum de chaque bloc. */
  blocs: number;
  /** Σ des crédits manquants pour atteindre le minimum de chaque TYPE. */
  types: number;
  /** Crédits manquants pour atteindre le total du programme. */
  total: number;
  /** Crédits réussis qui ne comptent pas : au-delà du maximum d'un bloc, ou
   *  au-delà du maximum d'un type. Départage seulement. */
  gaspille: number;
}

export interface ResultatAffectation {
  /** Cle de bloc -> codes attribués, triés. Couvre tous les blocs, même vides. */
  parCle: Map<string, CodeCours[]>;
  /** Cours faits qu'aucun bloc ne peut accueillir (pas cité, pas de joker). */
  horsBloc: CodeCours[];
  cout: Cout;
  /** Affectations complètes effectivement évaluées. */
  explorees: number;
  /** Affectations complètes qu'il aurait fallu évaluer pour être exhaustif.
   *  Infinity si le produit déborde. */
  combinaisons: number;
  /** Recherche coupée au plafond sans trouver d'affectation de coût nul : le
   *  « non conforme » n'est alors PAS une preuve. */
  tronquee: boolean;
  /** Cours cités par plus d'un bloc candidat (le vrai travail du solveur). */
  nbAmbigus: number;
  /** Groupes d'équivalence effectivement recherchés (réduction R2). */
  nbGroupes: number;
}

/** Plafond d'affectations complètes évaluées. Atteint => `tronquee`, et
 *  l'appelant doit dire que le verdict négatif n'est pas démontré. Choisi pour
 *  rester sous la dizaine de millisecondes : les instances réelles relevées
 *  demandent 1 (actuariat, aucun choix) à 12 (droit) évaluations. */
export const PLAFOND_AFFECTATIONS = 200_000;

// ---------------------------------------------------------------------------
// Solveur
// ---------------------------------------------------------------------------

interface Groupe {
  /** Clé de tri, pour un ordre d'exploration indépendant des entrées. */
  cle: string;
  /** Index (dans `blocs`) des blocs candidats, dans l'ordre de DÉCLARATION. */
  candidats: number[];
  credits: number;
  /** Codes du groupe, triés. Interchangeables par construction. */
  codes: CodeCours[];
}

/**
 * DECISION JOKER, reprise de la v1 et maintenue.
 *
 * Un bloc « Choix » à liste vide accepte n'importe quel cours : il chevauche
 * donc FORMELLEMENT tous les autres blocs, et si on le traitait comme un
 * candidat de plus, chaque cours du programme deviendrait ambigu — la
 * combinatoire exploserait pour modéliser un choix que le règlement ne laisse
 * pas. Décision conservée : un cours cité par un bloc va dans un bloc qui le
 * cite ; seuls les cours cités par AUCUN bloc alimentent le bloc au choix.
 *
 * Argument : « Choix - 3 crédits » veut dire « 3 crédits libres EN PLUS du
 * programme », pas « 3 crédits de n'importe lequel de vos cours d'option ». Le
 * relâcher rendrait un parcours conforme plus souvent, donc l'audit plus
 * clément — et c'est le sens d'erreur que ce projet refuse. L'interprétation
 * stricte peut déclarer non conforme un parcours conforme ; elle ne peut pas
 * faire croire à un diplôme qui n'arrive pas. Le message de `problemes` le dit
 * à l'étudiant, qui peut aller vérifier.
 */
export function resoudreAffectation(
  blocs: readonly BlocAffectable[],
  coursFaits: readonly CodeCours[],
  creditsDe: (code: CodeCours) => number | null,
  exigences: ExigencesTotaux,
  plafond: number = PLAFOND_AFFECTATIONS,
): ResultatAffectation {
  const n = blocs.length;
  const jokers = blocs.map((b, i) => (b.joker ? i : -1)).filter((i) => i >= 0);

  // --- candidats de chaque cours, puis regroupement ------------------------
  const horsBloc: CodeCours[] = [];
  const forces: Array<{ bloc: number; code: CodeCours; credits: number }> = [];
  const groupesParCle = new Map<string, Groupe>();
  let nbAmbigus = 0;

  // Tri : l'audit ne doit pas dépendre de l'ordre d'insertion dans le Set que
  // l'UI nous passe (garantie G3).
  for (const code of [...coursFaits].sort()) {
    const cites: number[] = [];
    for (let i = 0; i < n; i++) if (blocs[i].cours.has(code)) cites.push(i);
    const candidats = cites.length > 0 ? cites : jokers;
    if (candidats.length === 0) {
      horsBloc.push(code);
      continue;
    }
    if (cites.length > 1) nbAmbigus++;
    const credits = creditsDe(code) ?? 0;
    // Un cours à 0 crédit (ou sans fiche, donc crédits inconnus comptés 0) ne
    // peut changer aucun coût : le placer est arbitraire, donc on le fixe au
    // premier candidat plutôt que de faire exploser la combinatoire pour rien.
    if (candidats.length === 1 || credits === 0) {
      forces.push({ bloc: candidats[0], code, credits });
      continue;
    }
    const cle = `${candidats.join(",")}#${credits}`;
    const deja = groupesParCle.get(cle);
    if (deja) deja.codes.push(code);
    else groupesParCle.set(cle, { cle, candidats, credits, codes: [code] });
  }

  const groupes = [...groupesParCle.values()].sort((a, b) => (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));

  // --- état de départ : les cours sans choix ------------------------------
  const brutsInitiaux = new Array<number>(n).fill(0);
  const forcesParBloc: CodeCours[][] = Array.from({ length: n }, () => []);
  for (const f of forces) {
    brutsInitiaux[f.bloc] = arrondi(brutsInitiaux[f.bloc] + f.credits);
    forcesParBloc[f.bloc].push(f.code);
  }

  // --- reste potentiel par bloc, pour la borne d'élagage ------------------
  // reste[g][b] = crédits que le bloc b pourrait encore recevoir des groupes
  // d'indice >= g. Suffixes précalculés : la borne devient O(nbBlocs) par noeud.
  const reste: number[][] = Array.from({ length: groupes.length + 1 }, () => new Array<number>(n).fill(0));
  for (let g = groupes.length - 1; g >= 0; g--) {
    for (let b = 0; b < n; b++) reste[g][b] = reste[g + 1][b];
    const tout = arrondi(groupes[g].codes.length * groupes[g].credits);
    for (const b of groupes[g].candidats) reste[g][b] = arrondi(reste[g][b] + tout);
  }

  let combinaisons = 1;
  for (const g of groupes) combinaisons = saturer(combinaisons * compositions(g.codes.length, g.candidats.length));

  // --- recherche -----------------------------------------------------------
  const bruts = [...brutsInitiaux];
  /** repartition[g][j] = nombre de cours du groupe g placés dans son j-e candidat. */
  const repartition: number[][] = groupes.map((g) => new Array<number>(g.candidats.length).fill(0));

  let meilleurCout: Cout | null = null;
  let meilleureRepartition: number[][] | null = null;
  let explorees = 0;
  let plafondAtteint = false;

  const evaluer = (): void => {
    explorees++;
    const cout = couter(bruts, blocs, exigences);
    if (meilleurCout === null || compareCout(cout, meilleurCout) < 0) {
      meilleurCout = cout;
      meilleureRepartition = repartition.map((r) => [...r]);
    }
  };

  /** Manque de blocs incontournable, même en plaçant au mieux tout ce qui
   *  reste. Admissible : chaque bloc est optimisé indépendamment, donc la
   *  valeur ne peut que SOUS-estimer le vrai manque. */
  const borneBlocs = (g: number): number => {
    let somme = 0;
    for (let b = 0; b < n; b++) {
      const bornes = blocs[b].bornes;
      if (bornes.min <= 0) continue;
      const potentiel = Math.min(arrondi(bruts[b] + reste[g][b]), bornes.max);
      if (potentiel < bornes.min) somme = arrondi(somme + (bornes.min - potentiel));
    }
    return somme;
  };

  const explorer = (g: number): void => {
    if (plafondAtteint) return;
    if (meilleurCout !== null && estNul(meilleurCout)) return; // preuve trouvée (G1)
    if (g === groupes.length) {
      evaluer();
      if (explorees >= plafond) plafondAtteint = true;
      return;
    }
    // Élagage : > et non >=, parce qu'à coût de blocs égal une branche peut
    // encore améliorer les totaux par type ou le gaspillage.
    if (meilleurCout !== null && borneBlocs(g) > meilleurCout.blocs) return;

    const groupe = groupes[g];
    const k = groupe.candidats.length;
    const parts = repartition[g];

    // Énumération DESCENDANTE sur le premier candidat : la toute première
    // feuille atteinte est donc « tout au premier bloc déclaré », c'est-à-dire
    // exactement l'attribution directe de la v1 (garantie G4).
    const placer = (j: number, restants: number): void => {
      if (plafondAtteint) return;
      if (j === k - 1) {
        parts[j] = restants;
        const b = groupe.candidats[j];
        const delta = arrondi(restants * groupe.credits);
        bruts[b] = arrondi(bruts[b] + delta);
        explorer(g + 1);
        bruts[b] = arrondi(bruts[b] - delta);
        parts[j] = 0;
        return;
      }
      for (let prise = restants; prise >= 0; prise--) {
        if (plafondAtteint) return;
        if (meilleurCout !== null && estNul(meilleurCout)) return;
        parts[j] = prise;
        const b = groupe.candidats[j];
        const delta = arrondi(prise * groupe.credits);
        bruts[b] = arrondi(bruts[b] + delta);
        placer(j + 1, restants - prise);
        bruts[b] = arrondi(bruts[b] - delta);
        parts[j] = 0;
      }
    };
    placer(0, groupe.codes.length);
  };

  explorer(0);

  // Aucun groupe : une seule affectation possible, déjà évaluée par explorer().
  const cout = meilleurCout ?? couter(brutsInitiaux, blocs, exigences);
  const retenue = meilleureRepartition ?? repartition;

  // --- reconstruction de l'affectation retenue ----------------------------
  const parCle = new Map<string, CodeCours[]>();
  const attribues: CodeCours[][] = forcesParBloc.map((xs) => [...xs]);
  for (let g = 0; g < groupes.length; g++) {
    const groupe = groupes[g];
    let curseur = 0;
    for (let j = 0; j < groupe.candidats.length; j++) {
      const combien = retenue[g][j];
      for (let t = 0; t < combien; t++) attribues[groupe.candidats[j]].push(groupe.codes[curseur++]);
    }
  }
  for (let b = 0; b < n; b++) parCle.set(blocs[b].cle, attribues[b].sort());

  return {
    parCle,
    horsBloc,
    cout,
    explorees: Math.max(explorees, 1),
    combinaisons,
    tronquee: plafondAtteint && !estNul(cout),
    nbAmbigus,
    nbGroupes: groupes.length,
  };
}

// ---------------------------------------------------------------------------
// Coût
// ---------------------------------------------------------------------------

export function estNul(c: Cout): boolean {
  return c.blocs === 0 && c.types === 0 && c.total === 0;
}

/** Ordre lexicographique : blocs, puis types, puis total, puis gaspillage. */
export function compareCout(a: Cout, b: Cout): number {
  return (
    a.blocs - b.blocs || a.types - b.types || a.total - b.total || a.gaspille - b.gaspille
  );
}

function couter(
  bruts: readonly number[],
  blocs: readonly BlocAffectable[],
  exigences: ExigencesTotaux,
): Cout {
  let manqueBlocs = 0;
  let gaspille = 0;
  const parType: Record<TypeBloc, number> = { obligatoire: 0, option: 0, choix: 0, inconnu: 0 };

  for (let b = 0; b < blocs.length; b++) {
    const bornes = blocs[b].bornes;
    const comptes = Math.min(bruts[b], bornes.max);
    manqueBlocs = arrondi(manqueBlocs + Math.max(0, bornes.min - comptes));
    gaspille = arrondi(gaspille + Math.max(0, bruts[b] - comptes));
    parType[bornes.type] = arrondi(parType[bornes.type] + comptes);
  }

  let manqueTypes = 0;
  let retenuTotal = 0;
  for (const type of ["obligatoire", "option", "choix"] as const) {
    const borne = exigences[type];
    const obtenu = parType[type];
    manqueTypes = arrondi(manqueTypes + Math.max(0, borne.min - obtenu));
    // Au-delà du maximum d'un type, les crédits sont réussis mais ne comptent
    // pas vers le diplôme : même traitement que le dépassement d'un bloc.
    const retenu = Math.min(obtenu, borne.max);
    gaspille = arrondi(gaspille + Math.max(0, obtenu - retenu));
    retenuTotal = arrondi(retenuTotal + retenu);
  }

  const manqueTotal =
    exigences.creditsTotal === null ? 0 : arrondi(Math.max(0, exigences.creditsTotal - retenuTotal));

  return { blocs: manqueBlocs, types: manqueTypes, total: manqueTotal, gaspille };
}

// ---------------------------------------------------------------------------
// Combinatoire
// ---------------------------------------------------------------------------

function saturer(x: number): number {
  return Number.isFinite(x) && x <= Number.MAX_SAFE_INTEGER ? x : Infinity;
}

/** Nombre de façons de répartir `n` objets identiques dans `k` boîtes :
 *  C(n + k − 1, k − 1). */
export function compositions(n: number, k: number): number {
  if (k <= 1) return 1;
  let r = 1;
  for (let i = 1; i <= k - 1; i++) r = (r * (n + i)) / i;
  return saturer(Math.round(r));
}
