/**
 * POINT DE BASCULE DU MOTEUR — le seul endroit de l'UI qui nomme un moteur.
 *
 * La surface est gelée à deux fonctions, et l'UI ne connaît qu'elles :
 *   diagnostiquerCours(catalogue, faits) -> Map<CodeCours, DiagnosticCours>
 *   auditProgramme(programme, catalogue, faits) -> Audit
 *
 * `diagnostiquerCours` passe tel quel : il ne lit que `Catalogue.cours` et les
 * arbres de préalables, identiques en v1 et en v2.
 *
 * `auditProgramme` passe par un PONT, décrit plus bas. Il disparaîtra le jour
 * où `lib/engine` lira le contrat v2 ; voir « DÉBRANCHEMENT » à la fin.
 */
import { auditProgramme as auditMoteur, diagnostiquerCours } from "../../lib/engine";
import type { Audit, Catalogue, CodeCours, EtatBloc, Programme } from "../../lib/types";

export { diagnostiquerCours };

/** Pilote la bannière qui prévient que les nombres viennent d'un faux moteur. */
export const MOTEUR_EST_FACTICE = false;

/**
 * PONT v2 -> v1, temporaire et BRUYANT.
 *
 * À ce commit, `lib/engine/index.ts` lit encore la forme v1 de `RegleBloc` —
 * `regle.credits`, `regle.min`, `regle.max` — alors que le contrat gelé porte
 * maintenant `regle.bornes`. `npx tsc --noEmit` le signale sept fois dans ce
 * fichier, qui appartient à la session moteur : l'UI ne l'édite pas.
 *
 * Sans pont, les nombres ne seraient pas faux de façon visible, ils seraient
 * `NaN` : `Math.min(bruts, undefined)` puis `Math.max(0, undefined - comptes)`.
 * Et `NaN` traverse tout sans lever d'erreur — exactement le repli muet que ce
 * projet combat. Le pont fait donc trois choses, et dit ce qu'il fait :
 *
 *  1. il présente à chaque bloc une règle qui porte les DEUX formes
 *     (`bornes` ET `credits`/`min`/`max`), donc le moteur actuel lit des
 *     nombres et le moteur v2 lira les mêmes ;
 *  2. il rattache `EtatBloc.cleBloc`, que le moteur n'émet pas encore, en
 *     appariant position par position — et en VÉRIFIANT l'appariement au lieu
 *     de le supposer ;
 *  3. il refuse de maquiller ce qu'il ne peut pas traduire fidèlement, et
 *     ajoute alors un problème à l'audit en forçant `conforme: false`.
 *
 * Ce que le pont NE répare PAS, parce que ce n'est pas à l'UI de le faire —
 * les deux sont signalés à la session moteur :
 *  - le moteur indexe les blocs par `bloc.id` (`parId`, `blocsParCode`), or le
 *    contrat v2 dit que `id` n'est pas unique. Deux blocs `73A` dans un même
 *    segment : le second écrase le premier dans la map, et les cours du premier
 *    sont attribués au second sans qu'aucune erreur ne soit levée ;
 *  - le moteur ignore `Programme.exigences`. Quand `creditsTotal` est `null`,
 *    il calcule `0 - obligatoires - choix`, obtient un nombre négatif et
 *    conclut « incohérence des données » sur un programme parfaitement sain.
 */
export const MOTEUR_LIT_CONTRAT_V1 = true;

/** Règle vue par le moteur : la forme v2 plus les champs v1 qu'il lit encore. */
type ReglePont = Record<string, unknown>;

interface Traduction {
  blocs: Programme["blocs"];
  /** Blocs dont les bornes ne sont pas exprimables dans la forme v1. */
  infideles: { cle: string; id: string; regleBrut: string; raison: string }[];
}

/**
 * La forme v1 ne sait écrire qu'UN nombre pour un bloc `obligatoire` ou
 * `choix` (`{credits: N}`, lu comme min = max = N). La v2 leur donne un
 * intervalle, et la page du certificat écrit « Choix - Minimum 3 crédits,
 * maximum 6 crédits. ». Un tel bloc ne peut pas être transmis fidèlement : on
 * le signale plutôt que de choisir silencieusement une des deux bornes.
 */
function traduireBlocs(programme: Programme): Traduction {
  const infideles: Traduction["infideles"] = [];
  const blocs = programme.blocs.map((bloc) => {
    const regle = bloc.regle;
    if (regle.type === "inconnu") {
      // Le moteur actuel tombe dans son `default:` et en fait
      // `{type:"inconnu", min:0, max:Infinity}`, ce qui est le comportement
      // voulu par le contrat v2 : pas auditable, donc pas conforme. Rien à
      // traduire.
      return bloc;
    }
    const { min, max } = regle.bornes;
    if (regle.type !== "option" && min !== max) {
      infideles.push({
        cle: bloc.cle,
        id: bloc.id,
        regleBrut: bloc.regleBrut,
        raison: `bornes ${min}–${max} sur un bloc « ${regle.type} »`,
      });
    }
    const pont: ReglePont = {
      type: regle.type,
      bornes: regle.bornes,
      // Lu par le moteur v1 pour `obligatoire` et `choix`.
      credits: min,
      // Lu par le moteur v1 pour `option`.
      min,
      max,
    };
    return { ...bloc, regle: pont as unknown as typeof bloc.regle };
  });
  return { blocs, infideles };
}

/**
 * Rattache `cleBloc` aux états de blocs rendus par le moteur.
 *
 * Le moteur construit `calculs` par `programme.blocs.map(...)` puis
 * `etatsBlocs` par `calculs.map(...)` : l'ordre est donc préservé et
 * `audit.blocs[i]` correspond à `programme.blocs[i]`. C'est une lecture de ses
 * internes, donc on ne s'y FIE pas — on vérifie que les `id` concordent un à
 * un. Si l'appariement casse (le moteur a réordonné, filtré ou dédupliqué),
 * on ne devine pas une clé : on laisse `cleBloc` vide et on le dit.
 */
function appairer(
  programme: Programme,
  blocs: EtatBloc[],
): { blocs: EtatBloc[]; appariementRompu: boolean } {
  const concorde =
    blocs.length === programme.blocs.length &&
    blocs.every((etat, i) => etat.idBloc === programme.blocs[i].id);
  if (!concorde) {
    return { blocs, appariementRompu: true };
  }
  return {
    blocs: blocs.map((etat, i) => ({ ...etat, cleBloc: programme.blocs[i].cle })),
    appariementRompu: false,
  };
}

export function auditProgramme(
  programme: Programme,
  catalogue: Catalogue,
  faits: Set<CodeCours>,
): Audit {
  const { blocs, infideles } = traduireBlocs(programme);
  const brut = auditMoteur({ ...programme, blocs }, catalogue, faits);
  const { blocs: avecCles, appariementRompu } = appairer(programme, brut.blocs);

  const problemes = [...brut.problemes];
  for (const bloc of infideles) {
    problemes.push(
      `la règle du bloc ${bloc.id} (« ${bloc.regleBrut} ») n'a pas pu être transmise au moteur sans perte ` +
        `(${bloc.raison}) : le moteur ne lit encore qu'un seul nombre pour ce type de bloc. ` +
        `L'audit de ce bloc n'est pas concluant.`,
    );
  }
  if (appariementRompu) {
    problemes.push(
      `les ${brut.blocs.length} états de blocs rendus par le moteur ne correspondent plus aux ` +
        `${programme.blocs.length} blocs du programme : les clés de blocs sont indisponibles et ` +
        `l'affichage bloc par bloc peut être incomplet.`,
    );
  }

  const douteux = infideles.length > 0 || appariementRompu;
  return {
    ...brut,
    blocs: avecCles,
    problemes,
    // Un audit qu'on sait mal renseigné ne se déclare pas conforme.
    conforme: brut.conforme && !douteux,
  };
}

/**
 * DÉBRANCHEMENT — quand `lib/engine` lira le contrat v2 (`regle.bornes`, et
 * `EtatBloc.cleBloc` rempli depuis `Bloc.cle`), ce fichier redevient deux
 * lignes :
 *
 *   export { diagnostiquerCours, auditProgramme } from "../../lib/engine";
 *   export const MOTEUR_EST_FACTICE = false;
 *
 * Tout le reste de ce fichier part avec, y compris `MOTEUR_LIT_CONTRAT_V1`,
 * dont la disparition éteint la mention affichée dans le pied de page.
 */
