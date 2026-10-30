import { describe, expect, it } from "vitest";
import { fusionnerFaits, lireImportExtension } from "./import-extension";

const fragment = (valeur: unknown): string => `#import=${encodeURIComponent(JSON.stringify(valeur))}`;

const BASE = {
  v: 1,
  parcours: "baccalaureat-en-mathematiques#Statistique",
  cheminement: null,
  faits: ["MAT1400", "MAT 1500"],
  enCours: ["MAT1600", "STT 1700"],
};

describe("lireImportExtension", () => {
  it("lit le lien de ClientSide Horaire et normalise les codes", () => {
    expect(lireImportExtension(fragment(BASE))).toEqual({
      parcours: "baccalaureat-en-mathematiques#Statistique",
      cheminement: null,
      faits: ["MAT 1400", "MAT 1500"],
      enCours: ["MAT 1600", "STT 1700"],
      illisibles: [],
    });
  });

  it("garde réussis et en cours SÉPARÉS ; un code présent des deux côtés est réussi", () => {
    const r = lireImportExtension(fragment({ ...BASE, enCours: ["MAT 1400", "MAT 1600"] }));
    expect(r?.faits).toEqual(["MAT 1400", "MAT 1500"]);
    expect(r?.enCours).toEqual(["MAT 1600"]);
  });

  it("rend les codes illisibles à part au lieu de les avaler", () => {
    expect(lireImportExtension(fragment({ ...BASE, faits: ["MAT 1400", "n'importe quoi"] }))?.illisibles).toEqual([
      "n'importe quoi",
    ]);
  });

  it("ne propose rien quand le fragment n'est pas un import lisible", () => {
    expect(lireImportExtension("")).toBeNull();
    expect(lireImportExtension("#audit")).toBeNull();
    expect(lireImportExtension("#import=%7Bpas-du-json")).toBeNull();
    expect(lireImportExtension(fragment({ ...BASE, v: 2 }))).toBeNull();
    expect(lireImportExtension(fragment({ ...BASE, parcours: "" }))).toBeNull();
    expect(lireImportExtension(fragment({ ...BASE, faits: "MAT 1400" }))).toBeNull();
    expect(lireImportExtension(fragment({ ...BASE, cheminement: 3 }))).toBeNull();
  });
});

describe("fusionnerFaits", () => {
  const importe = lireImportExtension(fragment(BASE))!;

  it("ajoute sans rien retirer de ce qui était déjà coché", () => {
    expect(fusionnerFaits(["IFT 1015", "MAT 1400"], importe, false)).toEqual(["IFT 1015", "MAT 1400", "MAT 1500"]);
  });

  it("les cours en cours n'entrent que si l'étudiant le choisit", () => {
    expect(fusionnerFaits([], importe, true)).toEqual(["MAT 1400", "MAT 1500", "MAT 1600", "STT 1700"]);
  });
});
