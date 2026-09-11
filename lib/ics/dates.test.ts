import { describe, expect, test } from "vitest";
import {
  ajouterJours,
  analyserDateICS,
  dateLocale,
  libelleTrimestre,
  saisonDe,
  trimestreDansTexte,
  trimestreDe,
  trimestreDeCodeTerme,
} from "./dates";

describe("analyserDateICS", () => {
  test("date-heure locale", () => {
    expect(analyserDateICS("20260901T083000")).toEqual({
      date: "2026-09-01",
      heure: "08:30",
      utc: false,
    });
  });

  test("date-heure UTC", () => {
    expect(analyserDateICS("20261017T035959Z")).toEqual({
      date: "2026-10-17",
      heure: "03:59",
      utc: true,
    });
  });

  test("VALUE=DATE : journée entière, sans heure", () => {
    expect(analyserDateICS("20270115")).toEqual({ date: "2027-01-15", heure: null, utc: false });
  });

  /** `new Date("2026-02-31")` glisse au 3 mars sans rien dire. Pas ici. */
  test("refuse une date de calendrier impossible", () => {
    expect(analyserDateICS("20270231T090000")).toBeNull();
    expect(analyserDateICS("20260431")).toBeNull();
    expect(analyserDateICS("20261301")).toBeNull();
  });

  test("connaît les années bissextiles", () => {
    expect(analyserDateICS("20240229")?.date).toBe("2024-02-29");
    expect(analyserDateICS("20270229")).toBeNull();
    expect(analyserDateICS("21000229")).toBeNull();
    expect(analyserDateICS("20000229")?.date).toBe("2000-02-29");
  });

  test("refuse ce qui n'est pas une date ICS", () => {
    expect(analyserDateICS("")).toBeNull();
    expect(analyserDateICS("2026-09-01")).toBeNull();
    expect(analyserDateICS("20260901T2530")).toBeNull();
  });
});

describe("ajouterJours", () => {
  test("franchit un mois et une année", () => {
    expect(ajouterJours("2026-09-01", 7)).toBe("2026-09-08");
    expect(ajouterJours("2026-12-28", 7)).toBe("2027-01-04");
    expect(ajouterJours("2027-03-01", -1)).toBe("2027-02-28");
  });

  /**
   * Le changement d'heure ne déplace pas une date : l'arithmétique est en UTC.
   * Faite en heure locale, le 8 mars 2027 + 7 jours pourrait rendre le 14.
   */
  test("traverse le changement d'heure de mars sans glisser", () => {
    expect(ajouterJours("2027-03-08", 7)).toBe("2027-03-15");
    expect(ajouterJours("2026-11-01", 7)).toBe("2026-11-08");
  });
});

describe("saisonDe", () => {
  test("les trois trimestres aux bornes retenues", () => {
    expect(saisonDe("2027-01-01")).toBe("Hiver");
    expect(saisonDe("2027-04-30")).toBe("Hiver");
    expect(saisonDe("2027-05-01")).toBe("Été");
    expect(saisonDe("2027-08-15")).toBe("Été");
    expect(saisonDe("2027-08-16")).toBe("Automne");
    expect(saisonDe("2027-12-31")).toBe("Automne");
  });

  /**
   * LE CAS QUI CONDAMNE LA RÈGLE « SEPTEMBRE À DÉCEMBRE ». L'horaire A26
   * réellement exporté fait commencer MAT 1500, MAT 1600 et STT 1700 le
   * 2026-08-31 : une borne au 1er septembre classerait ces trois cours en été.
   */
  test("le 31 août appartient à l'automne, comme dans l'horaire A26 réel", () => {
    expect(trimestreDe("2026-08-31")).toEqual({ saison: "Automne", annee: 2026 });
  });

  test("l'année est l'année civile, y compris pour l'hiver", () => {
    expect(trimestreDe("2027-02-10")).toEqual({ saison: "Hiver", annee: 2027 });
  });
});

describe("trimestreDansTexte", () => {
  test("lit les noms de calendrier des générateurs observés", () => {
    expect(trimestreDansTexte("UdeM — Automne 2026")).toEqual({
      saison: "Automne",
      annee: 2026,
    });
    expect(trimestreDansTexte("UdeM Automne 2026")).toEqual({ saison: "Automne", annee: 2026 });
    expect(trimestreDansTexte("Registre — Hiver 2027")).toEqual({
      saison: "Hiver",
      annee: 2027,
    });
  });

  test("accepte « Ete » sans accent et la casse libre", () => {
    expect(trimestreDansTexte("horaire ete 2027")).toEqual({ saison: "Été", annee: 2027 });
    expect(trimestreDansTexte("ÉTÉ 2027")).toEqual({ saison: "Été", annee: 2027 });
  });

  test("rend null quand rien ne s'y lit", () => {
    expect(trimestreDansTexte("Mon calendrier")).toBeNull();
    expect(trimestreDansTexte("Automne")).toBeNull();
  });
});

describe("trimestreDeCodeTerme", () => {
  /** Le code de trimestre Synchro, en tête de chaque UID : « A26-MAT1400-… ». */
  test("les trois lettres de saison", () => {
    expect(trimestreDeCodeTerme("A26")).toEqual({ saison: "Automne", annee: 2026 });
    expect(trimestreDeCodeTerme("H27")).toEqual({ saison: "Hiver", annee: 2027 });
    expect(trimestreDeCodeTerme("E27")).toEqual({ saison: "Été", annee: 2027 });
    expect(trimestreDeCodeTerme("a26")).toEqual({ saison: "Automne", annee: 2026 });
  });

  test("refuse ce qui n'est pas un code de trimestre", () => {
    expect(trimestreDeCodeTerme("MAT1400")).toBeNull();
    expect(trimestreDeCodeTerme("X26")).toBeNull();
    expect(trimestreDeCodeTerme("A2026")).toBeNull();
    expect(trimestreDeCodeTerme("")).toBeNull();
  });
});

describe("dateLocale", () => {
  /**
   * En heure locale et non en UTC : à Montréal, `toISOString()` passe au
   * lendemain dès 20 h, ce qui déclarerait un trimestre terminé un jour trop tôt.
   */
  test("prend la date du fuseau de la machine, pas celle d'UTC", () => {
    const soir = new Date(2026, 11, 10, 21, 30);
    expect(dateLocale(soir)).toBe("2026-12-10");
  });

  test("remplit les zéros", () => {
    expect(dateLocale(new Date(2027, 0, 5, 9, 0))).toBe("2027-01-05");
  });
});

describe("libelleTrimestre", () => {
  test("forme affichable", () => {
    expect(libelleTrimestre({ saison: "Automne", annee: 2026 })).toBe("Automne 2026");
  });
});
