import { describe, it, expect } from "vitest";
import { normaliserCode, extraireCodes, segmentDeBloc, slugUrl } from "./codes";

describe("normaliserCode", () => {
  it("accepte les trois écritures UdeM du même cours", () => {
    for (const v of ["ACT 2250", "ACT2250", "act-2250", "  act 2250 ", "Act_2250"]) {
      expect(normaliserCode(v)).toBe("ACT 2250");
    }
  });
  it("rejette ce qui n'est pas un code plutôt que de deviner", () => {
    for (const v of ["", "ACT", "2250", "ACTU 2250", "ACT 225", "ACT 22500", "autorisation du département"]) {
      expect(normaliserCode(v)).toBeNull();
    }
  });
});

describe("extraireCodes", () => {
  it("tire les deux codes d'une ligne de préalables réelle", () => {
    expect(extraireCodes("ACT1240 ET MAT1720")).toEqual(["ACT 1240", "MAT 1720"]);
  });
  it("ne renvoie rien sur une condition en prose", () => {
    expect(extraireCodes("autorisation du département")).toEqual([]);
  });
});

describe("segmentDeBloc", () => {
  it("sépare segment et lettre de bloc", () => {
    expect(segmentDeBloc("75C")).toBe("75");
    expect(segmentDeBloc("01A")).toBe("01");
  });
});

describe("slugUrl", () => {
  it("reconstruit l'URL UdeM", () => {
    expect(slugUrl("ACT 2250")).toBe("act-2250");
  });
  it("refuse un code non normalisé au lieu de fabriquer une URL fausse", () => {
    expect(() => slugUrl("ACT2250")).toThrow();
  });
});
