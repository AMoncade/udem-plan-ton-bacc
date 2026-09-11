import { describe, expect, it } from "vitest";
import { catalogue } from "../_donnees/catalogue";
import { codesReferences, ficheDe } from "./cours";
import { saisonsOffertes, verifierOffre } from "./offre";
import { ordreTrimestre } from "./trimestres";

const AUTOMNE_2026 = { saison: "Automne", annee: 2026 } as const;
const HIVER_2027 = { saison: "Hiver", annee: 2027 } as const;
const HIVER_2029 = { saison: "Hiver", annee: 2029 } as const;

describe("contrainte d'offre", () => {
  it("refuse un cours d'hiver placé à l'automne, en donnant la raison", () => {
    const verdict = verifierOffre("ECN 2165", ficheDe(catalogue, "ECN 2165"), AUTOMNE_2026);
    expect(verdict.decision).toBe("refus");
    if (verdict.decision !== "refus") throw new Error("verdict inattendu");
    expect(verdict.raison).toContain("n'est pas offert à l'automne");
    expect(verdict.raison).toContain("Hiver 2027");
  });

  it("accepte le trimestre exact que l'horaire publié annonce", () => {
    expect(
      verifierOffre("ECN 2165", ficheDe(catalogue, "ECN 2165"), HIVER_2027).decision,
    ).toBe("accepte");
  });

  it("accepte sous réserve la bonne saison dans une année hors de l'horaire", () => {
    const verdict = verifierOffre("ECN 2165", ficheDe(catalogue, "ECN 2165"), HIVER_2029);
    expect(verdict.decision).toBe("reserve");
    if (verdict.decision !== "reserve") throw new Error("verdict inattendu");
    expect(verdict.raison).toContain("Hiver 2029");
  });

  it("refuse ACT 2250 à l'hiver : son horaire ne couvre que l'été et l'automne", () => {
    expect(saisonsOffertes(ficheDe(catalogue, "ACT 2250"))).toEqual(
      new Set(["Été", "Automne"]),
    );
    expect(
      verifierOffre("ACT 2250", ficheDe(catalogue, "ACT 2250"), HIVER_2027).decision,
    ).toBe("refus");
  });

  it("ne refuse jamais un cours sans fiche : l'offre est inconnue, pas interdite", () => {
    expect(ficheDe(catalogue, "ACT 2251")).toBeUndefined();
    const verdict = verifierOffre("ACT 2251", undefined, AUTOMNE_2026);
    expect(verdict.decision).toBe("reserve");
    if (verdict.decision !== "reserve") throw new Error("verdict inattendu");
    expect(verdict.raison).toContain("pas de fiche");
  });
});

describe("catalogue partiel", () => {
  it("référence des cours qui n'ont pas de fiche — l'état normal à gérer", () => {
    const codes = codesReferences(catalogue);
    const sansFiche = codes.filter((code) => ficheDe(catalogue, code) === undefined);
    expect(codes.length).toBeGreaterThan(0);
    expect(sansFiche.length).toBeGreaterThan(0);
  });
});

describe("ordre des trimestres", () => {
  it("classe Automne 2026 avant Hiver 2027, puis Été 2027, puis Automne 2027", () => {
    const suite = [
      AUTOMNE_2026,
      HIVER_2027,
      { saison: "Été", annee: 2027 } as const,
      { saison: "Automne", annee: 2027 } as const,
    ].map(ordreTrimestre);
    expect(suite).toEqual([...suite].sort((a, b) => a - b));
    expect(new Set(suite).size).toBe(suite.length);
  });
});
