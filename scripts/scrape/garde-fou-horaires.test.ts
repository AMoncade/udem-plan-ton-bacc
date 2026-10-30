/**
 * Garde-fou des horaires : la fonction pure, sur des fiches en mémoire.
 *
 * `aujourdhui` est toujours passé en paramètre : aucun de ces tests ne dépend de
 * l'horloge, donc aucun ne se met à échouer en janvier.
 */
import { describe, it, expect } from "vitest";
import type { ApercuTrimestre, Saison, Seance } from "../../lib/types";
import { comparerHoraires, formaterVerdict, type FicheHoraires } from "./garde-fou-horaires";

const AUJOURDHUI = "2026-10-30";

const seance = (du: string, au: string): Seance => ({
  creneau: { genre: "attribue", jour: "Lundi", debutMin: 540, finMin: 630 },
  du,
  au,
});

/** `n` séances dans une section unique d'un trimestre. */
function apercu(saison: Saison, annee: number, n: number, au: string): ApercuTrimestre {
  return {
    trimestre: { saison, annee },
    sections: [{ nom: "A", seances: Array.from({ length: n }, () => seance("2026-01-01", au)) }],
  };
}

/** `nbFiches` fiches portant chacune `n` séances de l'Hiver 2027 (fin en avril 2027). */
function fiches(nbFiches: number, n: number, saison: Saison = "Hiver", annee = 2027, au = "2027-04-20"): FicheHoraires[] {
  return Array.from({ length: nbFiches }, () => ({ apercuHoraires: [apercu(saison, annee, n, au)] }));
}

describe("comparerHoraires", () => {
  it("passe quand rien ne bouge", () => {
    const v = comparerHoraires(fiches(100, 3), fiches(100, 3), AUJOURDHUI);
    expect(v.echecs).toEqual([]);
    expect(v.lignes).toHaveLength(1);
    expect(v.lignes[0]).toMatchObject({ libelle: "Hiver 2027", seancesAvant: 300, seancesApres: 300, fichesAvant: 100, fichesApres: 100 });
  });

  it("échoue quand un trimestre non terminé tombe à 0 séance, en nommant trimestre et chiffres", () => {
    const apres: FicheHoraires[] = fiches(100, 0);
    const v = comparerHoraires(fiches(100, 3), apres, AUJOURDHUI);
    expect(v.echecs.length).toBeGreaterThan(0);
    expect(v.echecs[0]).toContain("Hiver 2027");
    expect(v.echecs[0]).toContain("300 à 0");
  });

  it("échoue aussi quand le trimestre a disparu des fiches", () => {
    const apres: FicheHoraires[] = Array.from({ length: 100 }, () => ({ apercuHoraires: [] }));
    const v = comparerHoraires(fiches(100, 3), apres, AUJOURDHUI);
    expect(v.echecs.join("\n")).toContain("Hiver 2027");
    expect(v.echecs.join("\n")).toContain("à 0");
  });

  it("échoue à -60 % de séances", () => {
    const v = comparerHoraires(fiches(100, 10), fiches(100, 4), AUJOURDHUI);
    expect(v.echecs).toHaveLength(1);
    expect(v.echecs[0]).toContain("Hiver 2027");
    expect(v.echecs[0]).toContain("1000 à 400");
    expect(v.echecs[0]).toContain("-60 %");
  });

  it("passe à -40 % de séances", () => {
    const v = comparerHoraires(fiches(100, 10), fiches(100, 6), AUJOURDHUI);
    expect(v.echecs).toEqual([]);
  });

  it("passe à exactement -50 % (le seuil est « plus de 50 % »)", () => {
    expect(comparerHoraires(fiches(100, 10), fiches(100, 5), AUJOURDHUI).echecs).toEqual([]);
  });

  it("échoue quand les séances tiennent mais que 60 % des fiches n'en ont plus", () => {
    // Même total de séances (400), mais concentré sur 40 fiches : le total
    // seul ne verrait pas qu'une partie du catalogue n'a plus d'horaire.
    const apres = [...fiches(40, 10), ...fiches(60, 0)];
    const v = comparerHoraires(fiches(100, 4), apres, AUJOURDHUI);
    expect(v.echecs).toHaveLength(1);
    expect(v.echecs[0]).toContain("fiches");
    expect(v.echecs[0]).toContain("100 à 40");
  });

  it("ignore un trimestre terminé, même s'il disparaît", () => {
    const avant = fiches(100, 3, "Automne", 2026, "2026-12-10"); // fini le 10 déc. 2026
    const v = comparerHoraires(avant, fiches(100, 0, "Automne", 2026, "2026-12-10"), "2027-01-15");
    expect(v.echecs).toEqual([]);
    expect(v.lignes[0].termine).toBe(true);
  });

  it("le même trimestre, avant sa fin, ne serait pas ignoré", () => {
    const avant = fiches(100, 3, "Automne", 2026, "2026-12-10");
    const v = comparerHoraires(avant, fiches(100, 0, "Automne", 2026, "2026-12-10"), "2026-11-01");
    // Deux constats : les séances et les fiches tombent toutes les deux à 0.
    expect(v.echecs).toHaveLength(2);
    expect(v.echecs.every((e) => e.includes("Automne 2026"))).toBe(true);
  });

  it("la fin du trimestre est celle d'AVANT : un APRÈS qui se met à finir plus tôt ne l'efface pas", () => {
    const avant = fiches(100, 3, "Hiver", 2027, "2027-04-20");
    const apres = fiches(100, 3, "Hiver", 2027, "2026-01-01");
    expect(comparerHoraires(avant, apres, AUJOURDHUI).lignes[0].termine).toBe(false);
  });

  it("passe pour un trimestre nouveau", () => {
    const avant = fiches(100, 3);
    const apres = [...fiches(100, 3), ...fiches(100, 3, "Été", 2027, "2027-08-10")];
    const v = comparerHoraires(avant, apres, AUJOURDHUI);
    expect(v.echecs).toEqual([]);
    const ete = v.lignes.find((l) => l.libelle === "Été 2027");
    expect(ete).toMatchObject({ seancesAvant: 0, seancesApres: 300, termine: false });
  });

  it("passe pour un trimestre en hausse", () => {
    expect(comparerHoraires(fiches(50, 3), fiches(100, 5), AUJOURDHUI).echecs).toEqual([]);
  });

  it("juge chaque trimestre séparément : un trimestre sain ne masque pas un trimestre en chute", () => {
    const avant = [...fiches(100, 3), ...fiches(100, 3, "Automne", 2027, "2027-12-10")];
    const apres = [...fiches(100, 3), ...fiches(100, 1, "Automne", 2027, "2027-12-10").slice(0, 20)];
    const v = comparerHoraires(avant, apres, AUJOURDHUI);
    expect(v.echecs.join("\n")).toContain("Automne 2027");
    expect(v.echecs.join("\n")).not.toContain("Hiver 2027");
  });

  it("trie les trimestres dans l'ordre chronologique", () => {
    const avant = [
      ...fiches(2, 1, "Automne", 2026, "2026-12-10"),
      ...fiches(2, 1, "Hiver", 2027),
      ...fiches(2, 1, "Été", 2026, "2026-08-10"),
    ];
    expect(comparerHoraires(avant, avant, AUJOURDHUI).lignes.map((l) => l.libelle)).toEqual([
      "Été 2026",
      "Automne 2026",
      "Hiver 2027",
    ]);
  });

  it("une fiche sans apercuHoraires (antérieure au champ) ne compte pour rien", () => {
    const avant: FicheHoraires[] = [{}, ...fiches(10, 3)];
    const v = comparerHoraires(avant, avant, AUJOURDHUI);
    expect(v.echecs).toEqual([]);
    expect(v.lignes[0].fichesAvant).toBe(10);
  });
});

describe("formaterVerdict", () => {
  it("imprime une ligne par trimestre et marque les trimestres terminés", () => {
    const avant = [...fiches(2, 1, "Automne", 2026, "2026-12-10"), ...fiches(2, 1)];
    const texte = formaterVerdict(comparerHoraires(avant, avant, "2027-01-15"));
    expect(texte).toContain("Automne 2026");
    expect(texte).toContain("terminé le 2026-12-10");
    expect(texte).toContain("Hiver 2027");
  });
});
