import { describe, expect, it } from "vitest";
import type { Cours, Trimestre } from "../../lib/types";
import { codesReferences, ficheDe } from "./cours";
import { saisonsOffertes, verifierOffre } from "./offre";
import { ordreTrimestre } from "./trimestres";
import { assembler } from "./depot";
import { creerDepotDemo } from "../_demo/depot-demo";
import { ID_ACTUARIAT } from "../_demo/donnees-demo";

const AUTOMNE_2026 = { saison: "Automne", annee: 2026 } as const;
const HIVER_2027 = { saison: "Hiver", annee: 2027 } as const;
const HIVER_2029 = { saison: "Hiver", annee: 2029 } as const;

/**
 * Les fiches sont ÉCRITES ICI et non tirées du catalogue.
 *
 * La version précédente de ce fichier nommait des cours réels (« ECN 2165 »,
 * « ACT 2250 ») et lisait leur horaire dans le catalogue. Deux fois déjà, la
 * prémisse s'est évaporée sous le test : quand la fixture partielle a été
 * remplacée par un scrape, puis quand le catalogue monolithique a été découpé.
 * Un test dont la prémisse vient des données échoue alors pour une raison qui
 * n'est pas celle qu'il surveille. Ce qui est surveillé ici est une RÈGLE :
 * c'est la saison qui refuse, jamais le couple saison-année.
 */
function fiche(code: string, trimestres: Trimestre[]): Cours {
  return {
    code,
    titre: `titre de ${code}`,
    credits: 3,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres,
    url: "https://exemple.invalid",
    scrapeISO: "1970-01-01T00:00:00.000Z",
  };
}

/** Un cours d'hiver seulement, dont l'horaire publié s'arrête en 2027. */
const COURS_HIVER = fiche("XXX 2165", [HIVER_2027]);
/** Un cours d'été et d'automne — le profil d'ACT 2250. */
const COURS_ETE_AUTOMNE = fiche("XXX 2250", [
  { saison: "Été", annee: 2026 },
  AUTOMNE_2026,
]);

describe("contrainte d'offre", () => {
  it("refuse un cours d'hiver placé à l'automne, en donnant la raison", () => {
    const verdict = verifierOffre(COURS_HIVER.code, COURS_HIVER, AUTOMNE_2026);
    expect(verdict.decision).toBe("refus");
    if (verdict.decision !== "refus") throw new Error("verdict inattendu");
    expect(verdict.raison).toContain("n'est pas offert à l'automne");
    expect(verdict.raison).toContain("Hiver 2027");
  });

  it("accepte le trimestre exact que l'horaire publié annonce", () => {
    expect(verifierOffre(COURS_HIVER.code, COURS_HIVER, HIVER_2027).decision).toBe(
      "accepte",
    );
  });

  it("accepte SOUS RÉSERVE la bonne saison dans une année hors de l'horaire", () => {
    // Le coeur de la règle : l'horaire d'UdeM ne publie que les trimestres
    // proches. Refuser « Hiver 2029 » parce que l'horaire s'arrête en 2027
    // inventerait une interdiction. Le motif durable est saisonnier.
    const verdict = verifierOffre(COURS_HIVER.code, COURS_HIVER, HIVER_2029);
    expect(verdict.decision).toBe("reserve");
    if (verdict.decision !== "reserve") throw new Error("verdict inattendu");
    expect(verdict.raison).toContain("Hiver 2029");
  });

  it("refuse un cours d'été-automne à l'hiver", () => {
    expect(saisonsOffertes(COURS_ETE_AUTOMNE)).toEqual(new Set(["Été", "Automne"]));
    expect(
      verifierOffre(COURS_ETE_AUTOMNE.code, COURS_ETE_AUTOMNE, HIVER_2027).decision,
    ).toBe("refus");
  });

  it("ne refuse jamais un cours sans fiche : l'offre est inconnue, pas interdite", () => {
    const verdict = verifierOffre("ZZZ 9999", undefined, AUTOMNE_2026);
    expect(verdict.decision).toBe("reserve");
    if (verdict.decision !== "reserve") throw new Error("verdict inattendu");
    expect(verdict.raison).toContain("pas de fiche");
  });

  it("ne refuse jamais un cours sans horaire publié : vide n'est pas « jamais offert »", () => {
    const sansHoraire = fiche("XXX 1000", []);
    const verdict = verifierOffre(sansHoraire.code, sansHoraire, AUTOMNE_2026);
    expect(verdict.decision).toBe("reserve");
  });
});

describe("catalogue partiel", () => {
  it("référence des cours qui n'ont pas de fiche — l'état normal à gérer", async () => {
    const { catalogue } = await assembler(creerDepotDemo(), ID_ACTUARIAT);
    const codes = codesReferences(catalogue);
    const sansFiche = codes.filter((code) => ficheDe(catalogue, code) === undefined);
    expect(codes.length).toBeGreaterThan(0);
    expect(
      sansFiche.length,
      "aucun cours référencé sans fiche : le jeu de démonstration ne couvre plus ce cas",
    ).toBeGreaterThan(0);
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
