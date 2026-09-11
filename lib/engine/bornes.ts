import type { Bloc, ExigencesParType, Intervalle, Programme, RegleBloc } from "../types";

/**
 * BORNES ET EXIGENCES — la lecture des nombres, séparée de l'algorithme.
 *
 * Deux conversions vivent ici, et aucune des deux ne doit jamais échouer en
 * silence :
 *
 *   1. `RegleBloc` -> `Bornes` : la règle d'un bloc devient un intervalle
 *      utilisable. Une règle `inconnu` reste inconnue, elle ne devient pas
 *      « min 0 » discrètement.
 *   2. `Programme.exigences` -> `ExigencesResolues` : les totaux par type. La
 *      v1 les DÉDUISAIT (90 − 54 − 3 = 33) parce que le contrat ne les portait
 *      pas. Le contrat v2 les porte, en intervalles. La déduction reste, mais
 *      comme REPLI, et elle se déclare.
 */

// ---------------------------------------------------------------------------
// Arithmétique
// ---------------------------------------------------------------------------

/** Les crédits UdeM ne sont pas tous entiers (des cours valent 1 ou 1,5
 *  crédit). Additionner des flottants fabrique des 17,999999999999996 qui
 *  feraient échouer une comparaison au minimum d'un bloc. */
export function arrondi(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export function nb(x: number): string {
  return String(arrondi(x)).replace(".", ",");
}

/** « 9 crédits », « 1 crédit », « 1,5 crédit », « 0 crédit ». */
export function cr(x: number): string {
  if (!Number.isFinite(x)) return "sans maximum";
  return `${nb(x)} ${arrondi(x) >= 2 ? "crédits" : "crédit"}`;
}

export function dedup<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function listerCodes(codes: readonly string[], maximum = 10): string {
  const visibles = codes.slice(0, maximum).join(", ");
  const reste = codes.length - maximum;
  return reste > 0 ? `${visibles}, … (+${reste})` : visibles;
}

/** « 75C (Compléments d'actuariat) », ou « 01A » tout court : le catalogue réel
 *  a deux blocs sans nom (01A et 75Z, la page de structure ne leur en donne
 *  pas), et « le bloc 01A () » est un message cassé. */
export function nomBloc(bloc: Bloc): string {
  const nom = (bloc.nom ?? "").trim();
  return nom === "" ? bloc.id : `${bloc.id} (${nom})`;
}

// ---------------------------------------------------------------------------
// Bornes d'un bloc
// ---------------------------------------------------------------------------

export type TypeBloc = "obligatoire" | "option" | "choix" | "inconnu";

export interface Bornes {
  type: TypeBloc;
  min: number;
  max: number;
  /** Renseigné quand la règle n'a pas pu être lue : le texte brut, qui doit
   *  ressortir dans `Audit.problemes`. Un bloc qui porte ce champ ne peut pas
   *  être déclaré conforme. */
  illisible: string | null;
}

const BORNES_INCONNUES = (brut: string): Bornes => ({
  type: "inconnu",
  min: 0,
  max: Infinity,
  illisible: brut,
});

function nombreBorne(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
}

/**
 * Lit les bornes d'une règle de bloc.
 *
 * Le contrat v2 unifie les trois variantes de la v1 : tout type connu porte
 * `bornes: { min, max }`, et une exigence exacte (« Option - 3 crédits. »)
 * s'écrit min === max. C'est ce qui a changé sous ce fichier ; la v1 lisait
 * `regle.credits` / `regle.min` / `regle.max`.
 *
 * Ce qui NE change pas : une règle que le scraper n'a pas su lire (`inconnu`),
 * ou dont les bornes sont absurdes (min > max, valeurs non numériques),
 * ressort. Une règle illisible traitée comme « min 0, max l'infini » rendrait
 * le bloc trivialement conforme — c'est exactement le repli muet que le projet
 * combat.
 */
export function bornesDeRegle(regle: RegleBloc | undefined | null): Bornes {
  if (!regle || typeof regle !== "object") {
    return BORNES_INCONNUES("règle absente des données");
  }
  switch (regle.type) {
    case "obligatoire":
    case "option":
    case "choix": {
      const brut = regle.bornes as Intervalle | undefined;
      const min = nombreBorne(brut?.min);
      const max = nombreBorne(brut?.max);
      if (min === null || max === null) {
        return BORNES_INCONNUES(
          `bornes illisibles pour une règle « ${regle.type} » : ${JSON.stringify(brut ?? null)}`,
        );
      }
      if (min > max) {
        return BORNES_INCONNUES(
          `bornes impossibles pour une règle « ${regle.type} » : minimum ${nb(min)} supérieur au maximum ${nb(max)}`,
        );
      }
      return { type: regle.type, min, max, illisible: null };
    }
    case "inconnu":
      return BORNES_INCONNUES(regle.brut ?? "forme de règle non relevée");
    default: {
      // Garde d'exhaustivité : si `RegleBloc` gagne un type, le compilateur
      // échoue ICI au lieu de laisser le nouveau cas passer en silence. C'est
      // précisément ce qui a manqué à la v1 quand le contrat a bougé.
      const jamais: never = regle;
      return BORNES_INCONNUES(`type de règle non interprété : ${JSON.stringify(jamais)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Exigences par type
// ---------------------------------------------------------------------------

export type SourceExigence = "page" | "deduction" | "minimums";

export interface ExigenceResolue {
  intervalle: Intervalle;
  source: SourceExigence;
}

export interface ExigencesResolues {
  obligatoire: ExigenceResolue;
  option: ExigenceResolue;
  choix: ExigenceResolue;
  /** Vrai si au moins un des trois totaux vient d'un repli et non de la page :
   *  l'audit reste possible, mais il doit le dire. */
  repli: boolean;
  /** Explications à verser dans `Audit.problemes`, en français. */
  notes: string[];
  /** `exigences.brut` quand la page l'écrit, pour citer la phrase exacte. */
  brut: string | null;
}

function exact(n: number): Intervalle {
  return { min: n, max: n };
}

function intervalleValide(i: Intervalle | null | undefined): Intervalle | null {
  if (!i || typeof i !== "object") return null;
  const min = nombreBorne(i.min);
  const max = nombreBorne(i.max);
  if (min === null || max === null || min > max) return null;
  return { min, max };
}

/**
 * Résout les totaux exigés par type.
 *
 * ORDRE DE PRÉFÉRENCE, et pourquoi :
 *
 *  1. `Programme.exigences` — la page l'écrit. Pour le droit :
 *     « 68 crédits obligatoires, de 30 à 33 crédits à option et un maximum de
 *     3 crédits au choix ». Ce sont des INTERVALLES, et ils sont couplés par la
 *     somme (68 + 30 + 3 = 68 + 33 + 0 = 101).
 *  2. Déduction `creditsTotal − obligatoires − choix`, le calcul de la v1. Il
 *     donne 33 pour l'actuariat, où la page n'écrivait rien d'exploitable. Il
 *     reste valable UNIQUEMENT quand les totaux d'obligatoire et de choix sont
 *     exacts, sinon la soustraction d'intervalles n'a pas de sens.
 *  3. Somme des minimums des blocs, en dernier recours, AVEC une note qui dit
 *     que l'audit du total n'est alors pas concluant. C'est la situation où la
 *     v1 se serait crue conforme : pour l'actuariat la somme des minimums
 *     d'option vaut 18 et le vrai total est 33.
 */
export function resoudreExigences(
  programme: Programme,
  bornesParBloc: { bornes: Bornes }[],
): ExigencesResolues {
  const sommeMin = (type: TypeBloc) =>
    arrondi(bornesParBloc.filter((b) => b.bornes.type === type).reduce((s, b) => s + b.bornes.min, 0));

  const minsObligatoire = sommeMin("obligatoire");
  const minsChoix = sommeMin("choix");
  const minsOption = sommeMin("option");

  const notes: string[] = [];
  const ecrites: ExigencesParType | null = programme.exigences ?? null;
  const brut = ecrites?.brut ?? null;

  const depuisPage = (
    champ: "obligatoire" | "option" | "choix",
  ): ExigenceResolue | null => {
    const i = intervalleValide(ecrites?.[champ] ?? null);
    return i ? { intervalle: i, source: "page" } : null;
  };

  const obligatoire: ExigenceResolue =
    depuisPage("obligatoire") ?? { intervalle: exact(minsObligatoire), source: "minimums" };
  const choix: ExigenceResolue =
    depuisPage("choix") ?? { intervalle: exact(minsChoix), source: "minimums" };

  let option = depuisPage("option");
  if (!option) {
    // REPLI de la v1 : le nombre qui n'est écrit nulle part se déduit.
    // Conditions strictes : il faut un total de programme, et des totaux
    // d'obligatoire et de choix EXACTS. Soustraire deux intervalles donnerait un
    // résultat plus large que la réalité, donc un audit trop clément.
    const total = typeof programme.creditsTotal === "number" && Number.isFinite(programme.creditsTotal)
      ? programme.creditsTotal
      : null;
    const obligatoireExact = obligatoire.intervalle.min === obligatoire.intervalle.max;
    const choixExact = choix.intervalle.min === choix.intervalle.max;
    if (total !== null && obligatoireExact && choixExact) {
      const deduit = arrondi(total - obligatoire.intervalle.min - choix.intervalle.min);
      option = { intervalle: exact(deduit), source: "deduction" };
      notes.push(
        `le total de crédits à option n'est pas écrit dans les données de ce programme : il est DÉDUIT, ` +
          `${cr(total)} au total − ${cr(obligatoire.intervalle.min)} d'obligatoires − ${cr(choix.intervalle.min)} au choix = ${cr(deduit)} ` +
          `(les deux soustraits étant la somme des minimums des blocs de leur type). ` +
          `Ce calcul ne vaut que si la page n'énonce pas d'intervalle ; à vérifier sur la page de structure.`,
      );
    } else {
      option = { intervalle: exact(minsOption), source: "minimums" };
      notes.push(
        `le total de crédits à option est INCONNU pour ce programme (ni écrit dans les exigences, ni déductible` +
          (total === null ? " faute de total de crédits" : "") +
          `) : l'audit se rabat sur la somme des minimums des blocs d'option (${cr(minsOption)}), ` +
          `ce qui est probablement trop peu — pour l'actuariat cette somme vaut 18 alors que le programme exige 33. ` +
          `Le verdict de conformité du total d'option n'est donc pas concluant.`,
      );
    }
  }

  if (obligatoire.source === "minimums" && ecrites) {
    notes.push(
      `les exigences de ce programme n'énoncent pas de total obligatoire : l'audit se rabat sur la somme des minimums des blocs obligatoires (${cr(minsObligatoire)}).`,
    );
  }
  if (choix.source === "minimums" && ecrites) {
    notes.push(
      `les exigences de ce programme n'énoncent pas de total au choix : l'audit se rabat sur la somme des minimums des blocs au choix (${cr(minsChoix)}).`,
    );
  }

  return {
    obligatoire,
    option,
    choix,
    repli:
      obligatoire.source !== "page" || option.source !== "page" || choix.source !== "page",
    notes,
    brut,
  };
}
