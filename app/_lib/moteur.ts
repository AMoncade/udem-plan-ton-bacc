/**
 * POINT DE BASCULE DU MOTEUR — le seul endroit de l'UI qui nomme un moteur.
 *
 * La surface est gelée à deux fonctions, et l'UI ne connaît qu'elles :
 *   diagnostiquerCours(catalogue, faits) -> Map<CodeCours, DiagnosticCours>
 *   auditProgramme(programme, catalogue, faits) -> Audit
 *
 * Branché sur le VRAI moteur depuis la fusion des chantiers. Le faux de
 * `app/_demo/`, qui avait permis d'écrire l'UI avant que `lib/engine` existe,
 * a été supprimé.
 *
 * `MOTEUR_EST_FACTICE` reste exporté exprès : c'est le filet qui allume la
 * bannière d'avertissement si quelqu'un rebranche un faux un jour. Un faux
 * moteur qui alimente des écrans sans le dire est précisément le genre de
 * chose qui finit par être pris pour la réalité.
 */
export { diagnostiquerCours, auditProgramme } from "../../lib/engine";

/** Pilote la bannière qui prévient que les nombres viennent d'un faux moteur. */
export const MOTEUR_EST_FACTICE = false;
