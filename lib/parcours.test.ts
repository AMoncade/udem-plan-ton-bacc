import { describe, it, expect } from "vitest";
import { cleParcours, lireCleParcours, parcoursDe, projeterOrientation } from "./parcours";
import type { Bloc, Orientation, Programme } from "./types";

const bloc = (segment: string, id: string): Bloc => ({
  id,
  cle: `${segment}/${id}`,
  segment,
  nom: "",
  regle: { type: "obligatoire", bornes: { min: 3, max: 3 } },
  regleBrut: "Obligatoire - 3 crédits.",
  cours: ["MAT 1000"],
  contenuOuvert: false,
  notes: [],
});

const orientation = (nom: string, segments: string[]): Orientation => ({
  nom,
  segments,
  exigences: {
    brut: `répartition de ${nom}`,
    obligatoire: { min: 54, max: 54 },
    option: { min: 33, max: 33 },
    choix: { min: 3, max: 3 },
  },
});

/** Forme de la page réelle du bacc en mathématiques : un tronc commun (01) et
 *  deux orientations exclusives (75 actuariat, 76 actuariat COOP). */
const MATHS: Programme = {
  id: "baccalaureat-en-mathematiques",
  nom: "Baccalauréat en mathématiques",
  orientation: null,
  segments: ["01", "75", "76"],
  orientations: [orientation("Actuariat", ["01", "75"]), orientation("Actuariat COOP", ["01", "76"])],
  cycle: "1er cycle",
  faculte: "Faculté des arts et des sciences",
  typeProgramme: "Baccalauréat",
  creditsTotal: 90,
  exigences: null,
  blocs: [bloc("01", "01A"), bloc("75", "75A"), bloc("75", "75C"), bloc("76", "76A")],
  notes: [],
  url: "https://example.invalid/",
  scrapeISO: "2026-09-11T00:00:00.000Z",
};

/** Un programme sans orientation : une seule répartition, `exigences` remplie. */
const CERTIFICAT: Programme = {
  ...MATHS,
  id: "certificat-en-droit",
  nom: "Certificat en droit",
  segments: ["01"],
  orientations: [],
  exigences: {
    brut: "9 crédits obligatoires, de 6 à 9 crédits à option",
    obligatoire: { min: 9, max: 9 },
    option: { min: 6, max: 9 },
    choix: { min: 0, max: 3 },
  },
  blocs: [bloc("01", "01A")],
};

describe("cleParcours et lireCleParcours", () => {
  it("fait l'aller-retour sans orientation", () => {
    const cle = cleParcours("certificat-en-droit", null);
    expect(cle).toBe("certificat-en-droit");
    expect(lireCleParcours(cle)).toEqual({ id: "certificat-en-droit", orientation: null });
  });

  it("fait l'aller-retour avec orientation", () => {
    const cle = cleParcours("baccalaureat-en-mathematiques", "Actuariat");
    expect(cle).toBe("baccalaureat-en-mathematiques#Actuariat");
    expect(lireCleParcours(cle)).toEqual({
      id: "baccalaureat-en-mathematiques",
      orientation: "Actuariat",
    });
  });

  it("refuse une clé mal formée au lieu d'en deviner le sens", () => {
    for (const mauvaise of ["", "#Actuariat", "bacc#"]) {
      expect(lireCleParcours(mauvaise), mauvaise).toBeNull();
    }
  });
});

describe("projeterOrientation", () => {
  it("ne garde que les blocs des segments de l'orientation", () => {
    const p = projeterOrientation(MATHS, "Actuariat");
    expect(p.blocs.map((b) => b.cle)).toEqual(["01/01A", "75/75A", "75/75C"]);
    expect(p.segments).toEqual(["01", "75"]);
    expect(p.orientation).toBe("Actuariat");
  });

  it("porte les exigences de l'orientation, pas celles du programme", () => {
    // C'est le point de tout l'exercice : la page énonce une répartition par
    // orientation, et `exigences` n'avait qu'un emplacement. En désigner une
    // arbitrairement aurait été un choix déguisé en donnée.
    const p = projeterOrientation(MATHS, "Actuariat");
    expect(p.exigences?.brut).toBe("répartition de Actuariat");
    expect(p.exigences?.option).toEqual({ min: 33, max: 33 });
    // Et le programme projeté ne se projette plus : il EST un parcours.
    expect(p.orientations).toEqual([]);
  });

  it("sépare deux orientations exclusives", () => {
    const actuariat = projeterOrientation(MATHS, "Actuariat");
    const coop = projeterOrientation(MATHS, "Actuariat COOP");
    expect(actuariat.blocs.map((b) => b.cle)).not.toContain("76/76A");
    expect(coop.blocs.map((b) => b.cle)).toContain("76/76A");
    expect(coop.blocs.map((b) => b.cle)).not.toContain("75/75A");
  });

  it("refuse d'auditer une page à plusieurs orientations sans en nommer une", () => {
    // Les orientations sont des ALTERNATIVES. Additionner leurs blocs exigerait
    // à la fois le segment 75 et le segment 76, ce qui est impossible — et le
    // conclure en silence produirait un « non conforme » que l'étudiant ne
    // pourrait jamais corriger.
    expect(() => projeterOrientation(MATHS, null)).toThrow(/orientations/);
  });

  it("refuse une orientation inexistante au lieu de tout renvoyer", () => {
    expect(() => projeterOrientation(MATHS, "Statistique")).toThrow(/absente/);
  });

  it("laisse intact un programme sans orientation", () => {
    const p = projeterOrientation(CERTIFICAT, null);
    expect(p).toBe(CERTIFICAT);
    expect(p.exigences?.option).toEqual({ min: 6, max: 9 });
  });
});

describe("parcoursDe", () => {
  it("donne un parcours par orientation, dans l'ordre de la page", () => {
    expect(parcoursDe(MATHS)).toEqual([
      { cle: "baccalaureat-en-mathematiques#Actuariat", orientation: "Actuariat" },
      { cle: "baccalaureat-en-mathematiques#Actuariat COOP", orientation: "Actuariat COOP" },
    ]);
  });

  it("donne un seul parcours quand la page n'a pas d'orientation", () => {
    expect(parcoursDe(CERTIFICAT)).toEqual([
      { cle: "certificat-en-droit", orientation: null },
    ]);
  });
});
