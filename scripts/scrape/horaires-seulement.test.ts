/**
 * Briques pures de `--horaires-seulement` et de `--sujets`.
 */
import { describe, it, expect } from "vitest";
import type { Cours } from "../../lib/types";
import { filtrerParSujets, fusionnerHoraires, lireSpecSujets, pagePorteSectionHoraires } from "./horaires-seulement";

describe("lireSpecSujets", () => {
  it("lit une liste de sujets, casse indifférente", () => {
    const passe = lireSpecSujets("act, mat");
    expect(passe("ACT")).toBe(true);
    expect(passe("MAT")).toBe(true);
    expect(passe("STT")).toBe(false);
  });

  it("lit un intervalle de première lettre, bornes comprises", () => {
    const passe = lireSpecSujets("A-F");
    expect(["ACT", "BIO", "FRA"].map(passe)).toEqual([true, true, true]);
    expect(["GEO", "MAT", "STT"].map(passe)).toEqual([false, false, false]);
  });

  it("mélange intervalles et sujets", () => {
    const passe = lireSpecSujets("A-C,STT");
    expect(passe("CHM")).toBe(true);
    expect(passe("STT")).toBe(true);
    expect(passe("SOC")).toBe(false);
  });

  it("refuse ce qu'il ne sait pas lire, au lieu de tout laisser passer", () => {
    expect(() => lireSpecSujets("")).toThrow(/vide/);
    expect(() => lireSpecSujets(" , ")).toThrow(/vide/);
    expect(() => lireSpecSujets("F-A")).toThrow(/à l'envers/);
    expect(() => lireSpecSujets("MATH")).toThrow(/ni un sujet/);
    expect(() => lireSpecSujets("A-")).toThrow(/ni un sujet/);
    expect(() => lireSpecSujets("A1")).toThrow(/ni un sujet/);
  });
});

describe("filtrerParSujets", () => {
  const codes = ["ACT 1000", "MAT 1400", "STT 1700", "MAT 1400A", "DRT 1151G", "n'importe quoi"];

  it("filtre par liste de sujets", () => {
    expect(filtrerParSujets(codes, "MAT,STT")).toEqual(["MAT 1400", "STT 1700", "MAT 1400A"]);
  });

  it("filtre par intervalle de première lettre", () => {
    expect(filtrerParSujets(codes, "A-D")).toEqual(["ACT 1000", "DRT 1151G"]);
    expect(filtrerParSujets(codes, "M-Z")).toEqual(["MAT 1400", "STT 1700", "MAT 1400A"]);
  });

  it("deux tranches complémentaires partitionnent les codes canoniques", () => {
    const canoniques = codes.slice(0, 5);
    const a = filtrerParSujets(canoniques, "A-L");
    const b = filtrerParSujets(canoniques, "M-Z");
    expect([...a, ...b].sort()).toEqual([...canoniques].sort());
    expect(a.filter((c) => b.includes(c))).toEqual([]);
  });

  it("écarte un code sans sujet canonique plutôt que de le garder", () => {
    expect(filtrerParSujets(["n'importe quoi"], "A-Z")).toEqual([]);
  });
});

describe("fusionnerHoraires", () => {
  const ancienne: Cours = {
    code: "MAT 1400",
    titre: "Calcul 1",
    credits: 3,
    cycle: "Premier cycle",
    faculte: "Faculté des arts et des sciences",
    description: "ancienne description",
    prealablesBrut: "MAT 1000",
    prealables: { genre: "cours", code: "MAT 1000" },
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres: [{ saison: "Automne", annee: 2026 }],
    apercuHoraires: [{ trimestre: { saison: "Automne", annee: 2026 }, sections: [] }],
    url: "https://admission.umontreal.ca/cours-et-horaires/cours/mat-1400/",
    scrapeISO: "2026-09-13T00:00:00.000Z",
  };
  const lus = {
    trimestres: [{ saison: "Hiver" as const, annee: 2027 }],
    apercuHoraires: [],
    horairesISO: "2026-10-30T09:17:00.000Z",
  };

  it("réécrit trimestres, apercuHoraires et horairesISO", () => {
    const f = fusionnerHoraires(ancienne, lus);
    expect(f.trimestres).toEqual(lus.trimestres);
    expect(f.apercuHoraires).toEqual([]);
    expect(f.horairesISO).toBe(lus.horairesISO);
  });

  it("ne touche à AUCUN autre champ, scrapeISO compris", () => {
    const apres: Record<string, unknown> = { ...fusionnerHoraires(ancienne, lus) };
    const avant: Record<string, unknown> = { ...ancienne };
    for (const champ of ["trimestres", "apercuHoraires", "horairesISO"]) {
      delete apres[champ];
      delete avant[champ];
    }
    expect(apres).toEqual(avant);
  });

  it("écrit bien la liste vide quand la page ne donne plus de séance", () => {
    expect(fusionnerHoraires(ancienne, lus).apercuHoraires).toEqual([]);
  });

  it("ne modifie pas la fiche d'entrée", () => {
    const copie = structuredClone(ancienne);
    fusionnerHoraires(ancienne, lus);
    expect(ancienne).toEqual(copie);
  });

  it("garde l'ordre des clés de la fiche existante", () => {
    expect(Object.keys(fusionnerHoraires(ancienne, lus)).slice(0, 12)).toEqual(Object.keys(ancienne).slice(0, 12));
  });
});

describe("pagePorteSectionHoraires", () => {
  it("reconnaît la section, vide ou non", () => {
    expect(pagePorteSectionHoraires('<main><section class="cours-horaires"><h2>Aperçu</h2></section>')).toBe(true);
  });

  it("refuse une page sans la section : ce n'est pas « aucun horaire »", () => {
    expect(pagePorteSectionHoraires("<html><body>Service indisponible</body></html>")).toBe(false);
  });
});
