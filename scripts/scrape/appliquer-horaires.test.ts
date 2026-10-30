import { describe, expect, it } from "vitest";
import type { Cours } from "../../lib/types";
import { appliquerSujet } from "./appliquer-horaires";

const fiche = (code: string, over: Partial<Cours> = {}): Cours =>
  ({
    code,
    titre: code,
    credits: 3,
    prealablesBrut: "MAT 1000",
    prealables: { genre: "cours", code: "MAT 1000" },
    trimestres: [{ saison: "Automne", annee: 2026 }],
    apercuHoraires: [],
    scrapeISO: "2026-09-13T00:00:00.000Z",
    ...over,
  }) as unknown as Cours;

describe("appliquerSujet", () => {
  it("ne reprend QUE les champs d'horaire : un préalable corrigé entre-temps survit", () => {
    // Le courant a reçu une correction de préalable pendant la passe ; la passe
    // porte l'ancien préalable et de nouveaux horaires.
    const courant = { "MAT 1400": fiche("MAT 1400", { prealablesBrut: "MAT 1000 ou MAT 1001" }) };
    const passe = {
      "MAT 1400": fiche("MAT 1400", {
        trimestres: [{ saison: "Hiver", annee: 2027 }],
        horairesISO: "2026-11-02T09:00:00.000Z",
      }),
    };
    const { fichier, bilan } = appliquerSujet(courant, passe);
    expect(fichier["MAT 1400"]?.prealablesBrut).toBe("MAT 1000 ou MAT 1001");
    expect(fichier["MAT 1400"]?.trimestres).toEqual([{ saison: "Hiver", annee: 2027 }]);
    expect(fichier["MAT 1400"]?.horairesISO).toBe("2026-11-02T09:00:00.000Z");
    expect(bilan.fichesMisesAJour).toBe(1);
  });

  it("une fiche identique n'est pas comptée, et rend le même JSON (aucun diff)", () => {
    const courant = { "MAT 1400": fiche("MAT 1400") };
    const { fichier, bilan } = appliquerSujet(courant, { "MAT 1400": fiche("MAT 1400") });
    expect(bilan.fichesMisesAJour).toBe(0);
    expect(JSON.stringify(fichier)).toBe(JSON.stringify(courant));
  });

  it("ne crée pas de fiche absente du courant, et le dit", () => {
    const { fichier, bilan } = appliquerSujet({ "MAT 1400": fiche("MAT 1400") }, { "MAT 9999": fiche("MAT 9999") });
    expect(Object.keys(fichier)).toEqual(["MAT 1400"]);
    expect(bilan.absentes).toEqual(["MAT 9999"]);
  });

  it("garde l'ordre des fiches du courant et ne modifie pas l'entrée", () => {
    const courant = { "MAT 2000": fiche("MAT 2000"), "MAT 1000": fiche("MAT 1000") };
    const copie = structuredClone(courant);
    const { fichier } = appliquerSujet(courant, { "MAT 1000": fiche("MAT 1000", { apercuHoraires: undefined }) });
    expect(Object.keys(fichier)).toEqual(["MAT 2000", "MAT 1000"]);
    expect(courant).toEqual(copie);
  });
});
