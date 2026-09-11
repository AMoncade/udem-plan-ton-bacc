/**
 * POINT DE BASCULE DU MOTEUR — le seul endroit de l'UI qui nomme un moteur.
 *
 * La surface est gelée à deux fonctions, et l'UI ne connaît qu'elles :
 *   diagnostiquerCours(catalogue, faits) -> Map<CodeCours, DiagnosticCours>
 *   auditProgramme(programme, catalogue, faits) -> Audit
 *
 * Aujourd'hui elles viennent du faux de `app/_demo/`, parce que
 * `lib/engine/index.ts` est écrit en parallèle par une autre session.
 *
 * POUR DÉBRANCHER LE FAUX, deux lignes ici :
 *   export { diagnostiquerCours, auditProgramme } from "../../lib/engine";
 *   export const MOTEUR_EST_FACTICE = false;
 * puis `app/_demo/` peut être supprimé en entier (il ne reste qu'un import du
 * bouton de scénario dans `components/EnteteApp.tsx`, signalé par un
 * commentaire « DÉMO »).
 *
 * Ce fichier vit hors de `app/_demo/` exprès : la bascule doit survivre à la
 * suppression du dossier qu'elle débranche.
 */
export { diagnostiquerCours, auditProgramme } from "../_demo/moteur-factice";

/** Pilote la bannière qui prévient que les nombres viennent d'un faux moteur. */
export const MOTEUR_EST_FACTICE = true;
