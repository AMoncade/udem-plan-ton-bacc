/**
 * POINT DE BASCULE DU MOTEUR — le seul endroit de l'UI qui nomme un moteur.
 *
 * La surface est gelée à deux fonctions, et l'UI ne connaît qu'elles :
 *   diagnostiquerCours(catalogue, faits) -> Map<CodeCours, DiagnosticCours>
 *   auditProgramme(programme, catalogue, faits) -> Audit
 *
 * Ce fichier a porté un PONT pendant une journée : `lib/engine` lisait encore
 * la forme v1 de `RegleBloc` (`credits`/`min`/`max`) alors que le contrat gelé
 * portait déjà `bornes`, et il n'émettait pas `EtatBloc.cleBloc`. Le pont
 * traduisait, rattachait les clés, et refusait de maquiller ce qu'il ne pouvait
 * pas transmettre sans perte.
 *
 * Le moteur v2 a été fusionné (`lib/engine/bornes.ts`, `affectation.ts`) : il
 * lit `regle.bornes`, remplit `cleBloc`, et exploite `Programme.exigences`. Le
 * pont est donc parti tel qu'il avait été prévu, en deux lignes. Ce qu'il
 * surveillait ne disparaît pas pour autant : `app/_lib/moteur.test.ts` garde
 * les invariants qui comptent — aucun `NaN` ne sort d'un audit, `cleBloc`
 * distingue deux blocs homonymes, les crédits perdus restent visibles, et une
 * restriction d'inscription n'est jamais lue comme un préalable.
 *
 * `MOTEUR_EST_FACTICE` reste exporté exprès : c'est le filet qui allume la
 * bannière d'avertissement si quelqu'un rebranche un faux moteur un jour. Un
 * faux moteur qui alimente des écrans sans le dire est précisément le genre de
 * chose qui finit par être pris pour la réalité.
 */
/**
 * `clesBlocsIncoherents` passe par ici comme les deux autres, et pour la même
 * raison : c'est un MARQUEUR EXPLICITE demandé au moteur plutôt qu'une
 * déduction faite dans la vue.
 *
 * La vue aurait pu reconnaître ces blocs par
 * `creditsManquants === 0 && !conforme && !contenuOuvert`. Cette conjonction
 * est exacte aujourd'hui — et elle avalerait en silence le prochain genre de
 * bloc que le moteur rendra non conforme sans dette. Un marqueur se périme
 * bruyamment, une déduction se périme sans rien dire.
 */
export {
  diagnostiquerCours,
  auditProgramme,
  clesBlocsIncoherents,
} from "../../lib/engine";

/** Pilote la bannière qui prévient que les nombres viennent d'un faux moteur. */
export const MOTEUR_EST_FACTICE = false;
