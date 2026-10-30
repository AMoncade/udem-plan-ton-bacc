/**
 * Décision du job « decider » de scrape-horaires.yml.
 *
 * Un cron qui ne décide jamais de tourner ne fait échouer rien : ces tests sont
 * la seule chose qui le verrait. Les dates sont fixes, aucune dépendance à
 * l'horloge.
 */
import { describe, it, expect } from "vitest";
import { decider, enPeriode, lirePeriodes, premierLundiDuMois } from "./calendrier-horaires";

const PAR_DEFAUT = "03-01:09-15,10-15:01-31";

describe("lirePeriodes", () => {
  it("lit les périodes séparées par des virgules", () => {
    expect(lirePeriodes(PAR_DEFAUT)).toEqual([
      { de: "03-01", a: "09-15" },
      { de: "10-15", a: "01-31" },
    ]);
  });

  it("refuse une forme illisible plutôt que de la lire comme « jamais »", () => {
    expect(() => lirePeriodes("03-01/09-15")).toThrow(/illisible/);
    expect(() => lirePeriodes("13-01:09-15")).toThrow(/illisible/);
    expect(() => lirePeriodes("03-32:09-15")).toThrow(/illisible/);
  });

  it("une spécification vide ne donne aucune période", () => {
    expect(lirePeriodes("")).toEqual([]);
  });
});

describe("enPeriode", () => {
  const p = lirePeriodes(PAR_DEFAUT);

  it("compte les bornes", () => {
    expect(enPeriode("2026-03-01", p)).toBe(true);
    expect(enPeriode("2026-09-15", p)).toBe(true);
    expect(enPeriode("2026-10-15", p)).toBe(true);
    expect(enPeriode("2027-01-31", p)).toBe(true);
  });

  it("exclut ce qui est entre deux périodes", () => {
    expect(enPeriode("2026-09-16", p)).toBe(false);
    expect(enPeriode("2026-10-14", p)).toBe(false);
    expect(enPeriode("2027-02-15", p)).toBe(false);
  });

  it("une période peut chevaucher le Nouvel An", () => {
    expect(enPeriode("2026-12-31", p)).toBe(true);
    expect(enPeriode("2027-01-01", p)).toBe(true);
    expect(enPeriode("2026-11-20", p)).toBe(true);
  });

  it("ne dépend pas de l'année", () => {
    expect(enPeriode("2024-06-10", p)).toBe(true);
    expect(enPeriode("2031-02-03", p)).toBe(false);
  });
});

describe("premierLundiDuMois", () => {
  it("vrai pour le premier lundi, faux pour les suivants", () => {
    expect(premierLundiDuMois("2027-02-01")).toBe(true); // lundi 1er
    expect(premierLundiDuMois("2027-02-08")).toBe(false);
    expect(premierLundiDuMois("2026-10-05")).toBe(true);
  });

  it("faux un jour qui n'est pas un lundi, même dans les 7 premiers", () => {
    expect(premierLundiDuMois("2026-10-06")).toBe(false);
  });
});

describe("decider", () => {
  it("lance quand forcé, n'importe quand", () => {
    expect(decider("2027-02-15", PAR_DEFAUT, true)).toMatchObject({ executer: true, raison: "lancement forcé" });
  });

  it("lance en période d'inscription", () => {
    const d = decider("2026-11-09", PAR_DEFAUT, false);
    expect(d.executer).toBe(true);
    expect(d.raison).toContain("période d'inscription");
  });

  it("lance le premier lundi du mois hors période", () => {
    const d = decider("2027-02-01", PAR_DEFAUT, false); // février : hors période
    expect(d.executer).toBe(true);
    expect(d.raison).toContain("premier lundi");
  });

  it("ne lance pas hors période un lundi qui n'est pas le premier", () => {
    const d = decider("2027-02-15", PAR_DEFAUT, false);
    expect(d.executer).toBe(false);
    expect(d.raison).toContain("hors période");
  });

  it("sans période, seul le premier lundi lance", () => {
    expect(decider("2026-11-09", "", false).executer).toBe(false);
    expect(decider("2026-11-02", "", false).executer).toBe(true);
  });
});
