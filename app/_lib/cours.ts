/**
 * Lectures dérivées du catalogue, côté UI uniquement.
 *
 * Rien ici ne décide d'un état ni d'une conformité : c'est le travail du
 * moteur (`diagnostiquerCours`, `auditProgramme`). Ce fichier ne répond qu'à
 * des questions de lecture — quels codes existent, lesquels ont une fiche,
 * que dit la règle d'un bloc — pour que l'affichage n'ait jamais à inventer
 * une valeur absente.
 */
import type {
  Bloc,
  Catalogue,
  CodeCours,
  Cours,
  Intervalle,
  NoeudPrealable,
  Programme,
  RegleBloc,
} from "../../lib/types";

/** Tous les codes cités par les préalables d'un noeud, dans l'ordre. */
export function codesDuNoeud(noeud: NoeudPrealable | null): CodeCours[] {
  if (noeud === null) return [];
  switch (noeud.genre) {
    case "cours":
      return [noeud.code];
    case "et":
    case "ou":
      return noeud.enfants.flatMap(codesDuNoeud);
    case "opaque":
      return [];
    default: {
      const jamais: never = noeud;
      throw new Error(`genre de noeud inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

/** Textes des conditions non mécanisables d'un noeud. Ne bloquent jamais. */
export function opaquesDuNoeud(noeud: NoeudPrealable | null): string[] {
  if (noeud === null) return [];
  switch (noeud.genre) {
    case "cours":
      return [];
    case "et":
    case "ou":
      return noeud.enfants.flatMap(opaquesDuNoeud);
    case "opaque":
      return [noeud.texte];
    default: {
      const jamais: never = noeud;
      throw new Error(`genre de noeud inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

export interface EvaluationNoeud {
  satisfait: boolean;
  /** Codes qui manquent pour satisfaire l'arbre, sans doublon. */
  manquants: CodeCours[];
  /** Conditions non mécanisables rencontrées, texte verbatim. */
  opaques: string[];
}

/**
 * Évaluation STRUCTURELLE d'un arbre de préalables : « en possédant ceci,
 * l'arbre est-il satisfait ». La politique — quel état en découle, et si un
 * noeud opaque vaut avertissement — appartient au moteur. Ici on ne fait que
 * parcourir l'arbre, avec un prédicat fourni par l'appelant : « code déjà
 * fait » pour un diagnostic, « code fait OU planifié plus tôt » pour vérifier
 * l'ordre d'un plan. Un noeud opaque ne bloque JAMAIS — il ressort dans
 * `opaques` pour être affiché.
 */
export function evaluerNoeud(
  noeud: NoeudPrealable | null,
  possede: (code: CodeCours) => boolean,
): EvaluationNoeud {
  if (noeud === null) return { satisfait: true, manquants: [], opaques: [] };
  switch (noeud.genre) {
    case "cours":
      return possede(noeud.code)
        ? { satisfait: true, manquants: [], opaques: [] }
        : { satisfait: false, manquants: [noeud.code], opaques: [] };
    case "et": {
      const enfants = noeud.enfants.map((e) => evaluerNoeud(e, possede));
      return {
        satisfait: enfants.every((e) => e.satisfait),
        manquants: [
          ...new Set(enfants.filter((e) => !e.satisfait).flatMap((e) => e.manquants)),
        ],
        opaques: [...new Set(enfants.flatMap((e) => e.opaques))],
      };
    }
    case "ou": {
      const enfants = noeud.enfants.map((e) => evaluerNoeud(e, possede));
      const satisfait = enfants.some((e) => e.satisfait);
      return {
        satisfait,
        manquants: satisfait ? [] : [...new Set(enfants.flatMap((e) => e.manquants))],
        opaques: [...new Set(enfants.flatMap((e) => e.opaques))],
      };
    }
    case "opaque":
      return { satisfait: true, manquants: [], opaques: [noeud.texte] };
    default: {
      const jamais: never = noeud;
      throw new Error(`genre de noeud inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Tous les codes que l'app connaît : ceux listés par les blocs, ceux qui ont
 * une fiche, et ceux cités en préalable. Les trois ensembles ne coïncident
 * pas — un bloc cite des cours sans fiche, et une fiche cite des préalables
 * qu'aucun bloc ne liste.
 */
export function codesReferences(catalogue: Catalogue): CodeCours[] {
  const vus = new Set<CodeCours>();
  for (const programme of catalogue.programmes) {
    for (const bloc of programme.blocs) for (const code of bloc.cours) vus.add(code);
  }
  for (const fiche of Object.values(catalogue.cours)) {
    vus.add(fiche.code);
    for (const code of codesDuNoeud(fiche.prealables)) vus.add(code);
  }
  return [...vus].sort((a, b) => a.localeCompare(b, "fr"));
}

export function ficheDe(catalogue: Catalogue, code: CodeCours): Cours | undefined {
  return catalogue.cours[code];
}

/** `null` veut dire « la fiche manque », jamais « 0 crédit ». */
export function creditsDe(catalogue: Catalogue, code: CodeCours): number | null {
  return catalogue.cours[code]?.credits ?? null;
}

export function blocsDuCours(programme: Programme, code: CodeCours): Bloc[] {
  return programme.blocs.filter((bloc) => bloc.cours.includes(code));
}

/**
 * Bornes de crédits d'un bloc, ou `null` quand la règle n'a pas été
 * interprétée (`type: "inconnu"`).
 *
 * UNE fonction et non deux (`minBloc`/`maxBloc` de la v1), parce que le cas
 * `inconnu` doit être traité UNE fois par l'appelant. Deux fonctions qui
 * renvoient chacune `number | null` invitent à écrire `?? 0` d'un côté et
 * `?? Infinity` de l'autre : un bloc dont la règle est illisible passerait
 * alors pour un bloc sans exigence et sans plafond, ce qui est faux dans les
 * deux sens. Ici l'appelant reçoit `null` et doit dire « règle non lue ».
 *
 * En v2 un maximum est toujours un nombre fini : la forme « minimum sans
 * maximum » que la v1 autorisait n'apparaît sur aucune page
 * (`docs/CONTRAT.md`). `null` ne veut donc JAMAIS dire « pas de plafond ».
 */
export function bornesBloc(regle: RegleBloc): Intervalle | null {
  switch (regle.type) {
    case "obligatoire":
    case "option":
    case "choix":
      return regle.bornes;
    case "inconnu":
      return null;
    default: {
      const jamais: never = regle;
      throw new Error(`type de règle inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

/** Le bloc d'un programme par sa CLÉ. `Bloc.id` n'est pas unique (la maîtrise
 *  en mathématiques porte `MM-Bloc 73A` et `S-Bloc 73A`) : chercher par `id`
 *  rend le premier des deux, sans erreur et sans prévenir. */
export function blocParCle(programme: Programme, cle: string): Bloc | undefined {
  return programme.blocs.find((bloc) => bloc.cle === cle);
}

/** D'où vient le total d'option exigé : lu sur la page, déduit du total de
 *  crédits, ou inconnu. Affiché, parce qu'une déduction et une lecture n'ont
 *  pas la même autorité. */
export type OrigineExigence = "page" | "deduit" | "inconnu";

export interface ArithmetiqueProgramme {
  /** Somme des bornes des blocs obligatoires. */
  obligatoire: Intervalle;
  choix: Intervalle;
  /** Somme des minimums des blocs d'option. */
  minimumsOption: number;
  /** Somme des maximums des blocs d'option : la place totale disponible. */
  capaciteOption: number;
  /** Le plus haut plafond parmi les blocs d'option — échelle des barres. */
  capaciteOptionMax: number;
  /** Ce que le programme exige en option. `null` quand rien ne le dit. */
  exigeOption: Intervalle | null;
  origineOption: OrigineExigence;
  creditsTotal: number | null;
  /** Crédits d'option exigés qu'aucun minimum de bloc ne réclame. `null`
   *  quand `exigeOption` est inconnu — surtout pas 0. */
  ecart: number | null;
  /** Blocs dont la règle n'a pas été interprétée. Ils rendent toute somme
   *  ci-dessus incomplète, donc ils s'affichent. */
  blocsInconnus: Bloc[];
}

const ZERO: Intervalle = { min: 0, max: 0 };

function somme(a: Intervalle, b: Intervalle): Intervalle {
  return { min: a.min + b.min, max: a.max + b.max };
}

/**
 * Le coeur du projet : ce que le programme exige en crédits d'option, comparé
 * à ce que les minimums de ses blocs réclament. Pour l'actuariat la page écrit
 * 33 crédits d'option alors que les minimums des blocs n'en totalisent que 18 :
 * un étudiant peut satisfaire CHAQUE bloc et ne pas diplômer.
 *
 * Trois changements par rapport à la v1, chacun parce que la v1 était fausse
 * hors actuariat :
 *
 *  1. `Programme.exigences` est LU en priorité. La v1 déduisait toujours
 *     90 − 54 − 3 = 33. Ailleurs c'est indéductible, parce que les pages
 *     écrivent des intervalles : droit « de 30 à 33 à option ».
 *  2. `creditsTotal` peut être `null`. La v1 faisait `null - 54 - 3` = NaN, et
 *     `NaN crédits` s'affichait à l'écran. Sans total ET sans exigences,
 *     `exigeOption` vaut `null` et l'écran dit « non annoncé ».
 *  3. Les blocs `inconnu` ressortent dans `blocsInconnus` au lieu d'être
 *     ignorés par un `switch` sans cas par défaut — c'était le repli
 *     silencieux type : un bloc disparu d'une somme ne fait échouer aucun test.
 */
export function arithmetiqueProgramme(programme: Programme): ArithmetiqueProgramme {
  let obligatoire = ZERO;
  let choix = ZERO;
  let minimumsOption = 0;
  let capaciteOption = 0;
  let capaciteOptionMax = 0;
  const blocsInconnus: Bloc[] = [];

  for (const bloc of programme.blocs) {
    const bornes = bornesBloc(bloc.regle);
    if (bornes === null) {
      blocsInconnus.push(bloc);
      continue;
    }
    switch (bloc.regle.type) {
      case "obligatoire":
        obligatoire = somme(obligatoire, bornes);
        break;
      case "choix":
        choix = somme(choix, bornes);
        break;
      case "option":
        minimumsOption += bornes.min;
        capaciteOption += bornes.max;
        capaciteOptionMax = Math.max(capaciteOptionMax, bornes.max);
        break;
    }
  }

  // Lu sur la page d'abord ; déduit seulement en dernier recours, et dit.
  //
  // L'ORDRE ET LES CONDITIONS SONT CEUX DU MOTEUR (`lib/engine/bornes.ts`,
  // `resoudreExigences`), délibérément. Cette fonction alimente la balance du
  // haut de l'écran ; le moteur alimente la liste des problèmes juste en
  // dessous. Deux règles de déduction différentes donneraient deux nombres
  // différents sur le MÊME écran — « Option 0/33 » au-dessus et « il manque
  // 18 crédits d'option » en dessous — sans qu'aucun test de l'un ou l'autre
  // ne tombe, puisque chacun serait cohérent avec lui-même.
  const resolu = (
    champ: "obligatoire" | "choix",
    sommeDesBlocs: Intervalle,
  ): Intervalle => programme.exigences?.[champ] ?? { min: sommeDesBlocs.min, max: sommeDesBlocs.min };
  const estExact = (i: Intervalle): boolean => i.min === i.max;

  const obligatoireResolu = resolu("obligatoire", obligatoire);
  const choixResolu = resolu("choix", choix);

  let exigeOption: Intervalle | null = null;
  let origineOption: OrigineExigence = "inconnu";
  const surPage = programme.exigences?.option ?? null;
  if (surPage !== null) {
    exigeOption = surPage;
    origineOption = "page";
  } else if (
    programme.creditsTotal !== null &&
    // Soustraire des INTERVALLES donnerait un résultat plus large que la
    // réalité, donc un audit trop clément : la déduction n'a de sens que si
    // l'obligatoire et le choix sont des nombres exacts.
    estExact(obligatoireResolu) &&
    estExact(choixResolu)
  ) {
    const reste = programme.creditsTotal - obligatoireResolu.min - choixResolu.min;
    if (reste >= 0) {
      exigeOption = { min: reste, max: reste };
      origineOption = "deduit";
    }
  }

  return {
    obligatoire,
    choix,
    minimumsOption,
    capaciteOption,
    capaciteOptionMax,
    exigeOption,
    origineOption,
    creditsTotal: programme.creditsTotal,
    ecart: exigeOption === null ? null : exigeOption.min - minimumsOption,
    blocsInconnus,
  };
}

/**
 * Pourquoi un bloc ne liste aucun cours. Trois raisons DIFFÉRENTES, qui se
 * ressemblent à l'écran et ne veulent pas du tout dire la même chose :
 *
 *  - `joker`  : un bloc « Choix » sans liste — n'importe quel cours convient.
 *  - `ouvert` : `contenuOuvert`, le contenu n'est décrit qu'en PROSE (bacc en
 *               musique 02/02E : renvoi aux cours du Centre de langues). Ce
 *               n'est pas un joker et ce n'est pas une erreur : c'est un bloc
 *               que l'outil ne peut pas vérifier, et l'étudiant doit le savoir.
 *  - `vide`   : un bloc d'option sans liste et sans prose, c'est-à-dire une
 *               donnée incomplète — on ne sait pas quels cours l'alimentent.
 *
 * Les confondre ferait dire « n'importe quel cours convient » là où la page dit
 * « voir les cours du Centre de langues », ce qui est un conseil faux.
 */
export type NatureListe = "enumere" | "joker" | "ouvert" | "vide";

export function natureListe(bloc: Bloc): NatureListe {
  if (bloc.cours.length > 0) return "enumere";
  if (bloc.contenuOuvert) return "ouvert";
  return bloc.regle.type === "choix" ? "joker" : "vide";
}

/** « 12 » ou « de 30 à 33 » — un intervalle tel qu'on le lit à voix haute. */
export function libelleIntervalle(intervalle: Intervalle): string {
  return intervalle.min === intervalle.max
    ? `${intervalle.min}`
    : `de ${intervalle.min} à ${intervalle.max}`;
}
