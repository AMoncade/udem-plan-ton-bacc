import { describe, expect, test } from "vitest";
import { PLAFOND_OCCURRENCES, analyserRrule, occurrences } from "./recurrence";

describe("analyserRrule", () => {
  test("la règle que produit synchro-calendrier", () => {
    expect(analyserRrule("FREQ=WEEKLY;UNTIL=20261017T035959Z")).toEqual({
      freq: "WEEKLY",
      interval: 1,
      until: "2026-10-17",
      count: null,
      ignorees: [],
    });
  });

  test("INTERVAL et COUNT", () => {
    const regle = analyserRrule("FREQ=WEEKLY;INTERVAL=2;COUNT=5");
    expect(regle.interval).toBe(2);
    expect(regle.count).toBe(5);
  });

  /** Ce que le module ne sait pas faire doit RESSORTIR, pas être avalé. */
  test("consigne les parties non gérées au lieu de les oublier", () => {
    const regle = analyserRrule("FREQ=WEEKLY;BYDAY=MO,WE;WKST=SU");
    expect(regle.ignorees).toEqual(["BYDAY=MO,WE", "WKST=SU"]);
  });

  test("consigne un UNTIL illisible plutôt que de le traiter comme absent en silence", () => {
    const regle = analyserRrule("FREQ=WEEKLY;UNTIL=plus tard");
    expect(regle.until).toBeNull();
    expect(regle.ignorees).toEqual(["UNTIL=plus tard"]);
  });
});

describe("occurrences", () => {
  test("sans récurrence : une seule séance", () => {
    expect(occurrences("2026-10-26", null, []).dates).toEqual(["2026-10-26"]);
  });

  /**
   * Le cas réel de MAT 1400 : mardi 1er septembre au 16 octobre. `UNTIL` est
   * écrit en UTC (« 20261017T035959Z »), donc un jour plus loin que la fin
   * voulue ; la dernière occurrence reste le 13 octobre parce que le 20 tombe
   * au-delà.
   */
  test("hebdomadaire jusqu'à UNTIL", () => {
    const { dates } = occurrences("2026-09-01", analyserRrule("FREQ=WEEKLY;UNTIL=20261017T035959Z"), []);
    expect(dates).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
      "2026-10-06",
      "2026-10-13",
    ]);
  });

  test("retire les EXDATE de la relâche", () => {
    const { dates, remarques } = occurrences(
      "2026-09-14",
      analyserRrule("FREQ=WEEKLY;UNTIL=20261017T035959Z"),
      ["2026-10-05", "2026-10-12"],
    );
    expect(dates).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(remarques).toEqual([]);
  });

  test("une EXDATE hors de la série est signalée", () => {
    const { dates, remarques } = occurrences(
      "2027-01-11",
      analyserRrule("FREQ=WEEKLY;COUNT=3"),
      ["2027-01-18", "2027-01-19"],
    );
    expect(dates).toEqual(["2027-01-11", "2027-01-25"]);
    expect(remarques).toEqual(["1 date d'exclusion hors de la série (2027-01-19)."]);
  });

  test("INTERVAL=2 avance de deux semaines", () => {
    const { dates } = occurrences("2027-01-20", analyserRrule("FREQ=WEEKLY;INTERVAL=2;COUNT=5"), []);
    expect(dates).toEqual([
      "2027-01-20",
      "2027-02-03",
      "2027-02-17",
      "2027-03-03",
      "2027-03-17",
    ]);
  });

  test("FREQ=DAILY", () => {
    const { dates } = occurrences("2027-01-11", analyserRrule("FREQ=DAILY;COUNT=3"), []);
    expect(dates).toEqual(["2027-01-11", "2027-01-12", "2027-01-13"]);
  });

  /** Une fréquence non dépliée compte UNE séance et le DIT. */
  test("FREQ=MONTHLY : une séance et une remarque, jamais un compte inventé", () => {
    const { dates, remarques } = occurrences(
      "2027-01-15",
      analyserRrule("FREQ=MONTHLY;COUNT=4"),
      [],
    );
    expect(dates).toEqual(["2027-01-15"]);
    expect(remarques).toEqual([
      'récurrence « FREQ=MONTHLY » non dépliée : une seule séance comptée.',
    ]);
  });

  test("une règle sans fin est plafonnée, et le dit", () => {
    const { dates, remarques } = occurrences("2027-01-11", analyserRrule("FREQ=WEEKLY"), []);
    expect(dates).toHaveLength(PLAFOND_OCCURRENCES);
    expect(remarques).toEqual([
      `récurrence sans fin lisible : compte arrêté à ${PLAFOND_OCCURRENCES} séances.`,
    ]);
  });

  test("un UNTIL antérieur au début ne rend aucune séance", () => {
    const { dates } = occurrences(
      "2027-01-11",
      analyserRrule("FREQ=WEEKLY;UNTIL=20260101T000000Z"),
      [],
    );
    expect(dates).toEqual([]);
  });
});
