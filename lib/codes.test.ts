import { describe, it, expect } from "vitest";
import { normaliserCode, extraireCodes, cleBloc, sujetDeCode, slugUrl } from "./codes";

describe("normaliserCode — les trois écritures UdeM du même cours", () => {
  it("ramène les formes courantes à la forme canonique", () => {
    for (const v of ["ACT 2250", "ACT2250", "act-2250", "  act 2250 ", "Act_2250"]) {
      expect(normaliserCode(v)).toBe("ACT 2250");
    }
  });

  it("conserve le suffixe, qui distingue deux cours différents", () => {
    // CRI 1600G est une fiche distincte de CRI 1600 : perdre le suffixe
    // fusionne deux cours et fausse le graphe sans rien signaler.
    for (const v of ["CRI 1600G", "CRI1600G", "cri-1600g", "cri1600g"]) {
      expect(normaliserCode(v)).toBe("CRI 1600G");
    }
    expect(normaliserCode("CRI 1600")).toBe("CRI 1600");
    expect(normaliserCode("CRI 1600G")).not.toBe(normaliserCode("CRI 1600"));
  });

  it("accepte les codes à cinq chiffres", () => {
    expect(normaliserCode("PSY 40001")).toBe("PSY 40001");
    expect(normaliserCode("mte-12041")).toBe("MTE 12041");
  });

  it("rejette ce qui n'est pas un code plutôt que de deviner", () => {
    for (const v of ["", "ACT", "2250", "ACTU 2250", "ACT 225", "ACT 225000", "autorisation du département"]) {
      expect(normaliserCode(v), v).toBeNull();
    }
  });
});

describe("extraireCodes", () => {
  it("tire les deux codes d'une ligne de préalables réelle", () => {
    expect(extraireCodes("ACT1240 ET MAT1720")).toEqual(["ACT 1240", "MAT 1720"]);
  });

  it("ne happe pas la première lettre du mot suivant", () => {
    // Le piège du suffixe optionnel : « MAT1720 ou » ne doit pas se lire
    // « MAT1720O ». Un seul code mal lu suffit à vider une branche du graphe.
    expect(extraireCodes("MAT1600 et (MAT1720 ou MAT1978)")).toEqual([
      "MAT 1600",
      "MAT 1720",
      "MAT 1978",
    ]);
  });

  it("lit les codes suffixés au milieu d'une ligne", () => {
    expect(extraireCodes("CRI1006 ou CRI1006G ou CRI1600")).toEqual([
      "CRI 1006",
      "CRI 1006G",
      "CRI 1600",
    ]);
  });

  it("ne renvoie rien sur une condition en prose", () => {
    expect(extraireCodes("autorisation du département")).toEqual([]);
  });

  it("ne lit pas un code dans un sigle de programme", () => {
    // « baccalauréat en mathématiques 1-190-1-0 » n'est pas un cours.
    expect(extraireCodes("57 crédits dans le baccalauréat 1-190-1-0")).toEqual([]);
  });
});

describe("cleBloc", () => {
  it("distingue deux blocs de même id dans un même segment", () => {
    // La maîtrise en mathématiques porte MM-Bloc 73A ET S-Bloc 73A : un
    // identifiant de bloc seul ne suffit pas à les séparer.
    expect(cleBloc("73", "MM-Bloc 73A")).not.toBe(cleBloc("73", "S-Bloc 73A"));
    expect(cleBloc("75", "75C")).toBe("75/75C");
  });
});

describe("sujetDeCode", () => {
  it("donne la clé de découpage des fichiers de cours", () => {
    expect(sujetDeCode("ACT 2250")).toBe("ACT");
    expect(sujetDeCode("DRT 1151G")).toBe("DRT");
  });

  it("refuse un code non canonique au lieu de renvoyer un faux sujet", () => {
    expect(sujetDeCode("ACT2250")).toBeNull();
  });
});

describe("slugUrl", () => {
  it("reconstruit l'URL UdeM, suffixe compris", () => {
    expect(slugUrl("ACT 2250")).toBe("act-2250");
    expect(slugUrl("DRT 1151G")).toBe("drt-1151g");
    expect(slugUrl("PSY 40001")).toBe("psy-40001");
  });

  it("refuse un code non normalisé au lieu de fabriquer une URL fausse", () => {
    expect(() => slugUrl("ACT2250")).toThrow();
  });
});
