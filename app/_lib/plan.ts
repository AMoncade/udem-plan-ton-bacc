/**
 * Le plan de l'étudiant : quel cours dans quel trimestre.
 *
 * Stocké comme un objet plat pour que `localStorage` le relise sans schéma.
 * Deux vérifications, distinctes exprès :
 *  - l'OFFRE (voir `offre.ts`) refuse un placement impossible ;
 *  - l'ORDRE constate après coup qu'un préalable arrive trop tard. Ce n'est
 *    pas un refus : l'étudiant a le droit de construire son plan dans
 *    n'importe quel ordre, il doit juste voir ce qui ne tient pas.
 */
import type { Catalogue, CodeCours, Trimestre } from "../../lib/types";
import { evaluerNoeud, ficheDe } from "./cours";
import { libelleTrimestre, ordreTrimestre } from "./trimestres";
import { verifierOffre } from "./offre";

export type Plan = Record<CodeCours, Trimestre>;

export interface AnomaliePlan {
  code: CodeCours;
  /** `refus` = le plan contient un placement impossible. `reserve` = à vérifier. */
  gravite: "refus" | "reserve";
  message: string;
}

/** Crédits placés dans un trimestre, et combien de cours restent sans fiche. */
export interface ChargeTrimestre {
  credits: number;
  coursSansFiche: number;
  nombre: number;
}

export function coursDuTrimestre(plan: Plan, cible: Trimestre): CodeCours[] {
  return Object.keys(plan)
    .filter((code) => ordreTrimestre(plan[code]) === ordreTrimestre(cible))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

export function chargeTrimestre(
  catalogue: Catalogue,
  plan: Plan,
  cible: Trimestre,
): ChargeTrimestre {
  const codes = coursDuTrimestre(plan, cible);
  let credits = 0;
  let coursSansFiche = 0;
  for (const code of codes) {
    const fiche = ficheDe(catalogue, code);
    if (fiche === undefined) coursSansFiche += 1;
    else credits += fiche.credits;
  }
  return { credits, coursSansFiche, nombre: codes.length };
}

/**
 * Tout ce qui ne tient pas dans le plan tel qu'il est. Les placements refusés
 * y figurent aussi : un plan relu de `localStorage` a pu être écrit avant que
 * la fiche du cours soit connue, et il ne doit pas redevenir valide en
 * silence parce que personne ne le revérifie.
 */
export function verifierPlan(
  catalogue: Catalogue,
  plan: Plan,
  faits: Set<CodeCours>,
): AnomaliePlan[] {
  const anomalies: AnomaliePlan[] = [];

  for (const code of Object.keys(plan).sort((a, b) => a.localeCompare(b, "fr"))) {
    const cible = plan[code];
    const fiche = ficheDe(catalogue, code);

    const verdict = verifierOffre(code, fiche, cible);
    if (verdict.decision === "refus") {
      anomalies.push({ code, gravite: "refus", message: verdict.raison });
    }

    if (fiche?.prealables != null) {
      const evaluation = evaluerNoeud(
        fiche.prealables,
        (prealable) =>
          faits.has(prealable) ||
          (plan[prealable] !== undefined &&
            ordreTrimestre(plan[prealable]) < ordreTrimestre(cible)),
      );
      if (!evaluation.satisfait) {
        anomalies.push({
          code,
          gravite: "reserve",
          message: `${code} est placé à ${libelleTrimestre(cible)}, mais ${evaluation.manquants.join(", ")} n'y est ni fait ni planifié avant.`,
        });
      }
      for (const texte of evaluation.opaques) {
        anomalies.push({
          code,
          gravite: "reserve",
          message: `${code} porte une condition que l'outil ne sait pas vérifier : « ${texte} »`,
        });
      }
    }
  }

  return anomalies;
}
