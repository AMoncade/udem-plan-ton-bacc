import type { Cours, Trimestre } from "../types";
import { normaliserCode } from "../codes";
import { seancesDeSection } from "../horaires";
import type { ChoixDeCours, Combinaison, ResultatCombinaisons } from "./combinaisons";

/**
 * GRILLES DISTINCTES — « 3 horaires possibles » doit compter des SEMAINES
 * différentes, pas des choix de sections différents.
 *
 * Mesuré sur MAT 1400 + STT 1700, Hiver 2027 : `combinaisons()` rend 10
 * combinaisons, toutes sans conflit, et les 10 donnent exactement la même
 * semaine. Les sections A et B de MAT 1400 ont les mêmes séances, et ses
 * sous-sections A101 à A103 aussi. Annoncer « 10 horaires possibles » pour une
 * seule grille ferait croire à un choix qui n'existe pas.
 *
 * Deux combinaisons donnent la même grille quand, cours par cours, leurs séances
 * coïncident : même jour, mêmes minutes, mêmes dates de début et de fin. Le nom
 * des sections n'entre pas dans la comparaison. Il reste affiché, parce que
 * c'est lui que l'étudiant inscrit dans Synchro, et les variantes sont gardées
 * pour qu'il puisse choisir un groupe qui n'est pas plein.
 */

export interface GrilleDistincte {
  /** La première combinaison de ce groupe, dans l'ordre de `combinaisons()`. */
  combinaison: Combinaison;
  /** Les autres choix de sections qui donnent exactement cette semaine. */
  equivalentes: ChoixDeCours[][];
}

export interface ResultatGrilles {
  grilles: GrilleDistincte[];
  /** Grilles DISTINCTES sans conflit ; elles ouvrent la liste. */
  sansConflit: number;
  /**
   * Repris de `combinaisons()` : la liste était tronquée AVANT le regroupement.
   * Le plafond coupe dans l'ordre de découverte, donc 200 combinaisons peuvent
   * toutes donner la même semaine et cacher les autres. « 1 horaire » n'est
   * alors qu'un minimum, et l'écran doit le dire.
   */
  tronque: boolean;
  /** Repris tels quels : un appelant qui n'affiche que les grilles ne doit pas les perdre. */
  horaireInconnu: ResultatCombinaisons["horaireInconnu"];
  indetermines: ResultatCombinaisons["indetermines"];
}

function signature(combinaison: Combinaison, fiches: Map<string, Cours>, cible: Trimestre): string {
  return JSON.stringify(
    combinaison.choix.map((choix) => {
      const fiche = fiches.get(normaliserCode(choix.code) ?? choix.code);
      const seances = choix.sections.flatMap((nom) =>
        // `combinaisons()` n'énumère que des sections publiées pour `cible` : si
        // celle-ci lève, la fiche a changé entre les deux appels, et deux grilles
        // qu'on ne sait pas comparer ne doivent pas être fusionnées.
        fiche === undefined ? [`?${choix.code}/${nom}`] : seancesDeSection(fiche.apercuHoraires, cible, nom).map((s) =>
          s.creneau.genre === "attribue"
            ? `${s.creneau.jour}|${s.creneau.debutMin}|${s.creneau.finMin}|${s.du}|${s.au}`
            : `${s.creneau.genre}|${choix.code}|${nom}`,
        ),
      );
      return [choix.code, seances.sort()];
    }),
  );
}

/**
 * Regroupe les combinaisons qui donnent la même semaine. L'ordre est préservé :
 * les grilles sans conflit d'abord, comme dans `combinaisons()`.
 */
export function grillesDistinctes(
  resultat: ResultatCombinaisons,
  fiches: Cours[],
  cible: Trimestre,
): ResultatGrilles {
  const parCode = new Map<string, Cours>();
  for (const fiche of fiches) {
    const code = normaliserCode(fiche.code) ?? fiche.code;
    if (!parCode.has(code)) parCode.set(code, fiche);
  }

  const grilles: GrilleDistincte[] = [];
  const index = new Map<string, GrilleDistincte>();
  let sansConflit = 0;
  for (const combinaison of resultat.combinaisons) {
    let cle: string;
    try {
      cle = signature(combinaison, parCode, cible);
    } catch {
      cle = `illisible:${grilles.length}`;
    }
    const deja = index.get(cle);
    if (deja !== undefined) {
      deja.equivalentes.push(combinaison.choix);
      continue;
    }
    const grille: GrilleDistincte = { combinaison, equivalentes: [] };
    index.set(cle, grille);
    grilles.push(grille);
    if (combinaison.conflits.length === 0) sansConflit += 1;
  }
  return {
    grilles,
    sansConflit,
    tronque: resultat.tronque,
    horaireInconnu: resultat.horaireInconnu,
    indetermines: resultat.indetermines,
  };
}
