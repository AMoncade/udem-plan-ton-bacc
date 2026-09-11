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

/** Minimum de crédits exigé par un bloc. 0 quand le bloc n'en impose aucun. */
export function minBloc(regle: RegleBloc): number {
  switch (regle.type) {
    case "obligatoire":
      return regle.credits;
    case "option":
      return regle.min ?? 0;
    case "choix":
      return regle.credits;
    default: {
      const jamais: never = regle;
      throw new Error(`type de règle inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

/** Maximum de crédits d'un bloc. `null` = aucun plafond déclaré. */
export function maxBloc(regle: RegleBloc): number | null {
  switch (regle.type) {
    case "obligatoire":
      return regle.credits;
    case "option":
      return regle.max;
    case "choix":
      return regle.credits;
    default: {
      const jamais: never = regle;
      throw new Error(`type de règle inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Le coeur du projet, calculé et non recopié : ce que le programme exige en
 * crédits d'option, c'est ce qui reste une fois l'obligatoire et le choix
 * retirés du total. Pour l'actuariat : 90 − 54 − 3 = 33, alors que les
 * minimums des blocs d'option n'en totalisent que 18. Un étudiant peut donc
 * satisfaire chaque bloc et ne pas diplômer.
 */
export function arithmetiqueProgramme(programme: Programme) {
  let obligatoire = 0;
  let choix = 0;
  let minimumsOption = 0;
  let capaciteOption = 0;
  let capaciteOptionMax = 0;
  for (const bloc of programme.blocs) {
    switch (bloc.regle.type) {
      case "obligatoire":
        obligatoire += bloc.regle.credits;
        break;
      case "choix":
        choix += bloc.regle.credits;
        break;
      case "option":
        minimumsOption += bloc.regle.min ?? 0;
        capaciteOption += bloc.regle.max ?? 0;
        capaciteOptionMax = Math.max(
          capaciteOptionMax,
          bloc.regle.max ?? bloc.regle.min ?? 0,
        );
        break;
    }
  }
  const exigeOption = programme.creditsTotal - obligatoire - choix;
  return {
    obligatoire,
    choix,
    exigeOption,
    minimumsOption,
    capaciteOption,
    /** Le plus haut plafond parmi les blocs d'option, échelle des barres. */
    capaciteOptionMax,
    /** Crédits d'option qu'aucun minimum de bloc ne réclame. */
    ecart: exigeOption - minimumsOption,
  };
}
