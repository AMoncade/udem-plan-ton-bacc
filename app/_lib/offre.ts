/**
 * CONTRAINTE D'OFFRE — ce que les autres planificateurs ne disent pas.
 *
 * `Cours.trimestres` liste les trimestres où le cours est réellement offert.
 * Une moitié du bloc 75C n'existe qu'à l'hiver : l'étudiant ne peut donc pas
 * répartir ses options librement, et placer un cours d'hiver à l'automne n'est
 * pas un détail à corriger plus tard, c'est un plan qui ne se réalisera pas.
 *
 * Trois verdicts, jamais deux :
 *  - `refus`   : la saison visée n'apparaît dans aucun trimestre offert.
 *  - `reserve` : placement possible, mais l'horaire publié ne le confirme pas
 *                (fiche absente, ou année hors de la portée de l'horaire).
 *  - `accepte` : le trimestre visé figure tel quel dans l'horaire publié.
 *
 * La saison, pas l'année, décide du refus. L'horaire d'UdeM ne couvre que les
 * trimestres proches (la fixture va de l'été 2026 à l'hiver 2027) : refuser
 * « Automne 2028 » parce que l'horaire s'arrête en 2027 inventerait une
 * interdiction. Le motif durable est saisonnier — ACT 2251 est un cours
 * d'hiver — et c'est celui-là qui refuse.
 */
import type { CodeCours, Cours, Saison, Trimestre } from "../../lib/types";
import { aLaSaison, libelleTrimestre, memeTrimestre } from "./trimestres";

export type Verdict =
  | { decision: "accepte" }
  | { decision: "reserve"; raison: string }
  | { decision: "refus"; raison: string };

export function saisonsOffertes(fiche: Cours | undefined): Set<Saison> {
  return new Set((fiche?.trimestres ?? []).map((t) => t.saison));
}

export function horairePublie(fiche: Cours | undefined): string {
  const liste = fiche?.trimestres ?? [];
  if (liste.length === 0) return "aucun horaire publié";
  return liste.map(libelleTrimestre).join(", ");
}

export function verifierOffre(
  code: CodeCours,
  fiche: Cours | undefined,
  cible: Trimestre,
): Verdict {
  if (fiche === undefined) {
    return {
      decision: "reserve",
      raison: `${code} n'a pas de fiche de cours : son offre est inconnue. Placement accepté sous réserve.`,
    };
  }

  if (fiche.trimestres.length === 0) {
    return {
      decision: "reserve",
      raison: `Aucun horaire publié pour ${code} : son offre est inconnue. Placement accepté sous réserve.`,
    };
  }

  const saisons = saisonsOffertes(fiche);
  if (!saisons.has(cible.saison)) {
    const offertes = [...saisons].map(aLaSaison).join(" et ");
    return {
      decision: "refus",
      raison: `${code} n'est pas offert ${aLaSaison(cible.saison)} — seulement ${offertes}. Horaire publié : ${horairePublie(fiche)}.`,
    };
  }

  if (!fiche.trimestres.some((t) => memeTrimestre(t, cible))) {
    return {
      decision: "reserve",
      raison: `${code} est offert ${aLaSaison(cible.saison)}, mais l'horaire publié ne va pas jusqu'à ${libelleTrimestre(cible)} (${horairePublie(fiche)}).`,
    };
  }

  return { decision: "accepte" };
}
