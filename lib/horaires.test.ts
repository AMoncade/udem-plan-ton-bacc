import { describe, it, expect } from "vitest";
import { sectionsDuTrimestre, seancesDeSection, seancesActives } from "./horaires";
import type { ApercuTrimestre, JourSemaine, Seance, Trimestre } from "./types";

const A26: Trimestre = { saison: "Automne", annee: 2026 };
const H27: Trimestre = { saison: "Hiver", annee: 2027 };

const seance = (jour: JourSemaine, du: string, au: string): Seance => ({
  creneau: { genre: "attribue", jour, debutMin: 510, finMin: 629 },
  du,
  au,
});

/** `MAT 1400` réduit : deux sections porteuses aux séances IDENTIQUES, et la
 *  section A qui perd son mardi après le 16 octobre. */
const APERCUS: ApercuTrimestre[] = [
  {
    trimestre: A26,
    sections: [
      {
        nom: "A",
        seances: [
          seance("Jeudi", "2026-08-31", "2026-10-16"),
          seance("Mardi", "2026-08-31", "2026-10-16"),
          seance("Jeudi", "2026-10-26", "2026-12-09"),
        ],
      },
      { nom: "A101", seances: [seance("Lundi", "2026-09-07", "2026-10-16")] },
    ],
  },
];

describe("sectionsDuTrimestre", () => {
  it("énumère les sections sans lever", () => {
    expect(sectionsDuTrimestre(APERCUS, A26)).toEqual(["A", "A101"]);
  });

  it("rend [] sur un trimestre sans horaire, et sur une fiche non relue", () => {
    // Les deux sont des questions légitimes ; c'est `seancesDeSection` qui
    // refuse de répondre, pas celle-ci.
    expect(sectionsDuTrimestre(APERCUS, H27)).toEqual([]);
    expect(sectionsDuTrimestre(undefined, A26)).toEqual([]);
  });
});

describe("seancesDeSection", () => {
  it("projette sur UNE section", () => {
    expect(seancesDeSection(APERCUS, A26, "A")).toHaveLength(3);
    expect(seancesDeSection(APERCUS, A26, "A101")).toHaveLength(1);
  });

  it("refuse de répondre plutôt que de rendre un [] rassurant", () => {
    // Un tableau vide se lirait « aucune séance, donc aucun conflit » : une
    // ignorance transformée en autorisation. Trois causes, trois messages.
    expect(() => seancesDeSection(undefined, A26, "A")).toThrow(/pas regardé/);
    expect(() => seancesDeSection(APERCUS, H27, "A")).toThrow(/aucun horaire publié/);
    expect(() => seancesDeSection(APERCUS, A26, "B")).toThrow(/absente/);
  });

  it("ne replie AUCUN libellé de section sur un autre", () => {
    // « A101 » n'est ni « A1 » ni « A ». Une normalisation silencieuse viderait
    // la grille de l'étudiant sans rien signaler.
    expect(() => seancesDeSection(APERCUS, A26, "A1")).toThrow(/absente/);
    expect(() => seancesDeSection(APERCUS, A26, "a")).toThrow(/absente/);
  });
});

describe("seancesActives", () => {
  const sA = () => seancesDeSection(APERCUS, A26, "A");

  it("le motif hebdomadaire CHANGE en cours de trimestre", () => {
    // Le cœur du champ : en septembre le cours tient mardi et jeudi, en
    // novembre le jeudi seul. Une grille sans date de référence est fausse la
    // moitié du trimestre, et fausse en silence.
    expect(seancesActives(sA(), "2026-09-15").length).toBe(2);
    expect(seancesActives(sA(), "2026-11-03").length).toBe(1);
  });

  it("rend [] dans le trou entre deux fenêtres", () => {
    // Du 17 au 25 octobre, rien n'est actif — et c'est une réponse, pas une
    // ignorance : les fenêtres sont connues et la date tombe entre elles.
    expect(seancesActives(sA(), "2026-10-20")).toEqual([]);
  });

  it("les bornes sont inclusives des DEUX côtés", () => {
    // Écrit ici plutôt que laissé à chaque appelant : une comparaison
    // exclusive d'un côté et inclusive de l'autre ferait disparaître un cours
    // le dernier jour de sa plage chez l'un et pas chez l'autre. Un décalage
    // d'un jour ne se voit pas et ne casse aucun test.
    expect(seancesActives(sA(), "2026-08-31").length).toBe(2);
    expect(seancesActives(sA(), "2026-10-16").length).toBe(2);
    expect(seancesActives(sA(), "2026-08-30")).toEqual([]);
    expect(seancesActives(sA(), "2026-12-10")).toEqual([]);
  });
});
