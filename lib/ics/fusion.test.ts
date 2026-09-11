import { describe, expect, test } from "vitest";
import { fusionnerFaits } from "./fusion";

describe("fusionnerFaits", () => {
  test("ajoute à la suite, sans rien perdre", () => {
    expect(fusionnerFaits(["ACT 2250"], ["MAT 1400", "STT 1700"])).toEqual({
      faits: ["ACT 2250", "MAT 1400", "STT 1700"],
      ajoutes: ["MAT 1400", "STT 1700"],
      dejaLa: [],
    });
  });

  /** Le compte affiché à l'étudiant doit dire la vérité : 2 cochés, 1 ajouté. */
  test("sépare ce qui est ajouté de ce qui était déjà là", () => {
    const f = fusionnerFaits(["ACT 2250", "MAT 1400"], ["MAT 1400", "STT 1700"]);
    expect(f.ajoutes).toEqual(["STT 1700"]);
    expect(f.dejaLa).toEqual(["MAT 1400"]);
    expect(f.faits).toEqual(["ACT 2250", "MAT 1400", "STT 1700"]);
  });

  test("un doublon dans la sélection n'ajoute qu'une fois", () => {
    const f = fusionnerFaits([], ["MAT 1400", "MAT 1400"]);
    expect(f.faits).toEqual(["MAT 1400"]);
    expect(f.ajoutes).toEqual(["MAT 1400"]);
  });

  test("une sélection vide ne touche à rien", () => {
    expect(fusionnerFaits(["ACT 2250"], [])).toEqual({
      faits: ["ACT 2250"],
      ajoutes: [],
      dejaLa: [],
    });
  });

  /** L'ordre d'origine est conservé : les autres écrans ne doivent pas voir
   *  leur liste se réordonner à chaque import. */
  test("l'ordre des cours déjà faits ne bouge pas", () => {
    const f = fusionnerFaits(["STT 1700", "ACT 2250"], ["ACT 2250", "MAT 1400"]);
    expect(f.faits).toEqual(["STT 1700", "ACT 2250", "MAT 1400"]);
  });
});
