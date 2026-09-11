import type { Orientation, Programme } from "./types";

/**
 * Projection d'une page de programme sur un PARCOURS suivable.
 *
 * Propriété de la session intégratrice : l'UI, les tests du moteur et les tests
 * de couture doivent projeter de la même façon. Trois implémentations
 * différentes produiraient trois audits différents pour le même étudiant, sans
 * qu'aucune erreur n'apparaisse.
 */

/** Clé unique d'un parcours. Doit correspondre à `FicheIndex.cle`. */
export function cleParcours(idProgramme: string, orientation: string | null): string {
  return orientation === null ? idProgramme : `${idProgramme}#${orientation}`;
}

/** Décompose une clé de parcours. Renvoie null si la clé est mal formée. */
export function lireCleParcours(
  cle: string,
): { id: string; orientation: string | null } | null {
  if (cle === "") return null;
  const i = cle.indexOf("#");
  if (i < 0) return { id: cle, orientation: null };
  const id = cle.slice(0, i);
  const orientation = cle.slice(i + 1);
  if (id === "" || orientation === "") return null;
  return { id, orientation };
}

/**
 * Réduit un programme à une seule orientation : ses blocs deviennent ceux dont
 * le segment appartient à l'orientation, et ses exigences celles de
 * l'orientation.
 *
 * Une page à plusieurs orientations ne peut PAS être auditée telle quelle : ses
 * orientations sont des alternatives, pas des exigences cumulées. Le bacc en
 * mathématiques oppose les segments 75 (actuariat) et 76 (actuariat COOP) ;
 * exiger les deux serait impossible, et le conclure silencieusement produirait
 * un « non conforme » que l'étudiant ne pourrait jamais corriger. D'où un échec
 * bruyant plutôt qu'un repli.
 */
export function projeterOrientation(
  programme: Programme,
  nomOrientation: string | null,
): Programme {
  if (nomOrientation === null) {
    if (programme.orientations.length > 0) {
      throw new Error(
        `${programme.id} porte ${programme.orientations.length} orientations ` +
          `(${programme.orientations.map((o) => o.nom).join(", ")}) : il faut en ` +
          `nommer une, ses blocs ne s'additionnent pas.`,
      );
    }
    return programme;
  }

  const o: Orientation | undefined = programme.orientations.find(
    (x) => x.nom === nomOrientation,
  );
  if (!o) {
    // Ne jamais se rabattre sur « tous les blocs » : ce serait auditer un
    // parcours qui n'existe pas, en silence.
    throw new Error(
      `orientation « ${nomOrientation} » absente de ${programme.id} ` +
        `(connues : ${programme.orientations.map((x) => x.nom).join(", ") || "aucune"})`,
    );
  }

  const segments = new Set(o.segments);
  return {
    ...programme,
    orientation: o.nom,
    segments: [...o.segments],
    orientations: [],
    exigences: o.exigences,
    blocs: programme.blocs.filter((b) => segments.has(b.segment)),
  };
}

/** Tous les parcours suivables d'une page, dans l'ordre de la page. */
export function parcoursDe(
  programme: Programme,
): { cle: string; orientation: string | null }[] {
  if (programme.orientations.length === 0) {
    return [{ cle: cleParcours(programme.id, null), orientation: null }];
  }
  return programme.orientations.map((o) => ({
    cle: cleParcours(programme.id, o.nom),
    orientation: o.nom,
  }));
}
