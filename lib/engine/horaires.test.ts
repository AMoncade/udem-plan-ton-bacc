/**
 * CHEVAUCHEMENTS D'HORAIRE — ce que le moteur constate, et ce qu'il refuse.
 *
 * Les deux tests qui portent ce module sont ceux des FENÊTRES DE DATES et de
 * la SÉLECTION. Mesuré sur le cache au 2026-09-13 (trimestre Automne 2026,
 * 2 570 cours ayant au moins une séance datée) : 22 % des plages de séances
 * tiennent en un seul jour et 26 % en une semaine ou moins — des examens, des
 * séances uniques. Comparer sur le seul couple jour/heure signalerait donc un
 * conflit entre un cours de septembre et un examen de décembre.
 *
 * Et `MAT 1400` publie douze sections pour deux tables identiques : empiler les
 * sections d'un cours produirait onze conflits du cours AVEC LUI-MÊME.
 */
import { describe, it, expect } from "vitest";
import {
  chevauchements,
  chevauchementsDeSelection,
  conflitsEntreCours,
  incoherencesDeCours,
  type ChoixSection,
} from "./horaires";
import type { ApercuTrimestre, JourSemaine, Seance, SectionHoraire, Trimestre } from "../types";

const AUTOMNE: Trimestre = { saison: "Automne", annee: 2026 };

/** « Mardi 15 h 30 – 16 h 29, du 31/08 au 16/10 ». */
const seance = (
  jour: JourSemaine,
  debut: string,
  fin: string,
  du: string,
  au: string,
): Seance => {
  const min = (h: string) => Number(h.split(":")[0]) * 60 + Number(h.split(":")[1]);
  return { creneau: { genre: "attribue", jour, debutMin: min(debut), finMin: min(fin) }, du, au };
};

const section = (nom: string, seances: Seance[]): SectionHoraire => ({ nom, seances });
const choix = (code: string, nom: string, seances: Seance[]): ChoixSection => ({
  code,
  section: section(nom, seances),
});

const TOUT_LE_TRIMESTRE = ["2026-08-31", "2026-12-09"] as const;
const [T0, T1] = TOUT_LE_TRIMESTRE;

describe("chevauchement : le cas nominal", () => {
  it("deux séances au même jour, heures croisées, dates croisées", () => {
    const r = chevauchements([
      choix("ACT 1240", "A", [seance("Mardi", "13:30", "15:29", T0, T1)]),
      choix("STT 1700", "B", [seance("Mardi", "14:30", "16:29", T0, T1)]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].etat).toBe("chevauche");
    // L'écran doit pouvoir peindre EXACTEMENT ces minutes-là.
    expect(r[0].recouvrement).toEqual({
      jour: "Mardi",
      debutMin: 14 * 60 + 30,
      finMin: 15 * 60 + 29,
      du: T0,
      au: T1,
    });
    // Et savoir de quelles séances il s'agit, sections comprises.
    expect(r[0].a.code).toBe("ACT 1240");
    expect(r[0].a.section).toBe("A");
    expect(r[0].b.section).toBe("B");
  });

  it("deux créneaux CONSÉCUTIFS ne se chevauchent pas", () => {
    // La page écrit les fins en :29 et :59 — 15 h 30–16 h 29 puis 16 h 30.
    // Si quelqu'un « arrondit » 16 h 29 en 16 h 30 en amont, ce test tombe, et
    // c'est le but : tout créneau adjacent deviendrait un conflit.
    const r = chevauchements([
      choix("A", "A", [seance("Mardi", "15:30", "16:29", T0, T1)]),
      choix("B", "A", [seance("Mardi", "16:30", "17:29", T0, T1)]),
    ]);
    expect(r).toEqual([]);
  });

  it("un jour différent ne chevauche pas", () => {
    const r = chevauchements([
      choix("A", "A", [seance("Mardi", "13:30", "15:29", T0, T1)]),
      choix("B", "A", [seance("Jeudi", "13:30", "15:29", T0, T1)]),
    ]);
    expect(r).toEqual([]);
  });
});

describe("les FENÊTRES DE DATES — la condition qui porte le plus", () => {
  it("même jour, même heure, périodes DISJOINTES : aucun conflit", () => {
    // 48 % des séances du catalogue tiennent en une semaine ou moins. Sans
    // cette condition, le moteur opposerait un cours de septembre à un examen
    // de décembre.
    const r = chevauchements([
      choix("A", "A", [seance("Mardi", "13:30", "15:29", "2026-08-31", "2026-10-16")]),
      choix("B", "A", [seance("Mardi", "13:30", "15:29", "2026-10-26", "2026-12-09")]),
    ]);
    expect(r).toEqual([]);
  });

  it("des fenêtres qui se touchent d'un seul jour chevauchent, sur ce jour", () => {
    const r = chevauchements([
      choix("A", "A", [seance("Mardi", "13:30", "15:29", "2026-08-31", "2026-10-16")]),
      choix("B", "A", [seance("Mardi", "13:30", "15:29", "2026-10-16", "2026-12-09")]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].recouvrement?.du).toBe("2026-10-16");
    expect(r[0].recouvrement?.au).toBe("2026-10-16");
  });
});

describe("ce que le moteur refuse d'affirmer", () => {
  it("« Non attribué » sur des dates qui se croisent : indéterminé, jamais « pas de conflit »", () => {
    const r = chevauchements([
      choix("A", "A", [{ creneau: { genre: "nonAttribue" }, du: T0, au: T1 }]),
      choix("B", "A", [seance("Mardi", "13:30", "15:29", T0, T1)]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].etat).toBe("indetermine");
    expect(r[0].raison).toContain("Non attribué");
  });

  it("« Non attribué » sur des dates DISJOINTES ne dit rien du tout", () => {
    // Contrôle : sans lui, le test précédent pourrait passer parce que le
    // moteur signale tout créneau non attribué, sans regarder les dates.
    const r = chevauchements([
      choix("A", "A", [{ creneau: { genre: "nonAttribue" }, du: "2026-08-31", au: "2026-10-16" }]),
      choix("B", "A", [seance("Mardi", "13:30", "15:29", "2026-10-26", "2026-12-09")]),
    ]);
    expect(r).toEqual([]);
  });

  it("un créneau illisible garde son verbatim dans la raison", () => {
    const r = chevauchements([
      choix("A", "A", [{ creneau: { genre: "illisible", brut: "Lun-Mer-Ven" }, du: T0, au: T1 }]),
      choix("B", "A", [seance("Mardi", "13:30", "15:29", T0, T1)]),
    ]);
    expect(r[0].etat).toBe("indetermine");
    expect(r[0].raison).toContain("Lun-Mer-Ven");
  });
});

describe("la SÉLECTION : un cours, une section", () => {
  it("un cours cité deux fois n'est pas comparé, et le dit", () => {
    // Le piège `MAT 1400` : douze sections, deux tables identiques. Empiler
    // signalerait onze conflits du cours avec lui-même, indiscernables de vrais
    // conflits à l'écran.
    const meme = [seance("Jeudi", "08:30", "11:29", T0, T1)];
    const r = chevauchements([
      choix("MAT 1400", "A", meme),
      choix("MAT 1400", "B", meme),
      choix("STT 1700", "A", [seance("Mardi", "13:30", "15:29", T0, T1)]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].etat).toBe("indetermine");
    expect(r[0].raison).toContain("ALTERNATIVES");
    // Et surtout : aucun « chevauche » fabriqué.
    expect(r.some((c) => c.etat === "chevauche")).toBe(false);
  });

  it("deux séances d'un même cours qui se recouvrent sont une incohérence, pas un conflit", () => {
    // Un cours peut siéger mardi ET jeudi : ses séances s'additionnent. Si deux
    // d'entre elles se recouvrent, c'est la page qui se contredit — et
    // l'étudiant n'y peut rien, donc ça ne doit pas lui faire écarter un cours.
    const r = chevauchements([
      choix("A", "A", [
        seance("Mardi", "13:30", "15:29", T0, T1),
        seance("Mardi", "14:30", "16:29", T0, T1),
      ]),
    ]);
    expect(r).toHaveLength(1);
    expect(conflitsEntreCours(r)).toEqual([]);
    expect(incoherencesDeCours(r)).toHaveLength(1);
  });
});

describe("projection : les gardes du helper partagé deviennent des verdicts", () => {
  const apercus: ApercuTrimestre[] = [
    { trimestre: AUTOMNE, sections: [section("A", [seance("Mardi", "13:30", "15:29", T0, T1)])] },
  ];

  it("projette et compare quand la section existe", () => {
    const r = chevauchementsDeSelection([
      { code: "ACT 1240", apercus, trimestre: AUTOMNE, nomSection: "A" },
      { code: "STT 1700", apercus, trimestre: AUTOMNE, nomSection: "A" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].etat).toBe("chevauche");
  });

  it("une section inconnue ne fait pas tomber l'écran, et son cours est déclaré hors comparaison", () => {
    // `seancesDeSection()` lève — c'est sa garde contre le « aucune séance donc
    // aucun conflit ». Ici elle doit parler sans faire une page blanche.
    const r = chevauchementsDeSelection([
      { code: "ACT 1240", apercus, trimestre: AUTOMNE, nomSection: "Z" },
      { code: "STT 1700", apercus, trimestre: AUTOMNE, nomSection: "A" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].etat).toBe("indetermine");
    expect(r[0].a.code).toBe("ACT 1240");
    // Le message doit dire que l'absence de conflit ne vaut rien pour ce cours.
    expect(r[0].raison).toContain("AUCUNE comparaison");
  });

  it("une fiche sans apercuHoraires est signalée, pas silencieusement ignorée", () => {
    const r = chevauchementsDeSelection([
      { code: "ACT 1240", apercus: undefined, trimestre: AUTOMNE, nomSection: "A" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].etat).toBe("indetermine");
  });
});
