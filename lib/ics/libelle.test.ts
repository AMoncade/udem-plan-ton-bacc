import { describe, expect, test } from "vitest";
import {
  choisirLibelle,
  estGenerique,
  titreDepuisDescription,
  titreDepuisResume,
} from "./libelle";

describe("estGenerique", () => {
  test("les volets et les types d'évaluation ne sont pas des titres", () => {
    for (const mot of [
      "TH",
      "TP",
      "LAB",
      "Théorie",
      "Travaux pratiques",
      "Laboratoire",
      "Examen intra",
      "Examen final",
      "Quiz 1",
      "Quiz-tp3",
      "TP A",
      "groupe 3",
      "section A",
      "classe nº 1490",
      "Cours magistral",
      "",
    ]) {
      expect(estGenerique(mot), mot).toBe(true);
    }
  });

  test("un vrai titre de cours n'est pas générique, même s'il commence par « Th »", () => {
    for (const titre of [
      "Calcul 1",
      "Théorie des nombres",
      "Mathématiques discrètes",
      "Introduction à la statistique",
      "Thermodynamique",
      "Atelier de préparation à l'examen professionnel de la SOA",
    ]) {
      expect(estGenerique(titre), titre).toBe(false);
    }
  });
});

describe("titreDepuisResume", () => {
  test("forme A : sigle espacé, section accolée, volet entre parenthèses", () => {
    expect(titreDepuisResume("MAT 1400-A Calcul 1 (TH)", ["MAT 1400"])).toBe("Calcul 1");
    expect(
      titreDepuisResume("STT 1700-A103 Introduction à la statistique (TP)", ["STT 1700"]),
    ).toBe("Introduction à la statistique");
  });

  test("forme B : le SUMMARY ne porte que le volet, donc rien à en tirer", () => {
    expect(titreDepuisResume("MAT1400-A — Théorie", ["MAT 1400"])).toBe("");
  });

  test("forme C : titre entre deux tirets, volet à la fin", () => {
    expect(titreDepuisResume("MAT1400 - Calcul II - Théorie", ["MAT 1400"])).toBe("Calcul II");
    expect(titreDepuisResume("MAT1400 - Calcul II - TP A", ["MAT 1400"])).toBe("Calcul II");
    expect(titreDepuisResume("IFT-1015 - Programmation 1 - Théorie", ["IFT 1015"])).toBe(
      "Programmation 1",
    );
  });

  test("un examen ne donne pas de titre de cours", () => {
    expect(titreDepuisResume("MAT 1400 — Examen intra", ["MAT 1400"])).toBe("");
    expect(titreDepuisResume("MAT1400 — Quiz-tp3", ["MAT 1400"])).toBe("");
  });

  test("une parenthèse finale informative est gardée", () => {
    expect(titreDepuisResume("MAT 1400-A Calcul 1 (accéléré)", ["MAT 1400"])).toBe(
      "Calcul 1 (accéléré)",
    );
  });

  test("un titre avant le sigle est retrouvé", () => {
    expect(
      titreDepuisResume("Atelier de la SOA — ACT 2525-A", ["ACT 2525"]),
    ).toBe("Atelier de la SOA");
  });
});

describe("titreDepuisDescription", () => {
  test("forme B : le titre est la première ligne", () => {
    expect(titreDepuisDescription("Calcul 1\nclasse nº 1490")).toBe("Calcul 1");
  });

  test("forme A : la première ligne n'est que de la métadonnée", () => {
    expect(titreDepuisDescription("Théorie — section A — classe nº 1490")).toBe("");
  });

  test("une description d'échéance ne donne pas de titre", () => {
    expect(
      titreDepuisDescription("Ouvert du 2026-10-02 08:00 au 2026-10-05 23:59\nSource : StudiUM"),
    ).toBe("");
  });

  test("une description vide ne donne rien", () => {
    expect(titreDepuisDescription("")).toBe("");
  });
});

describe("choisirLibelle", () => {
  test("le SUMMARY passe avant la DESCRIPTION", () => {
    // Export tiers : la DESCRIPTION dit « Section A - Cours magistral » deux
    // fois, le SUMMARY dit « Calcul II ». Départager au plus fréquent sur le tas
    // mélangé donnait « Cours magistral » comme titre de cours.
    const libelle = choisirLibelle([
      {
        resume: "MAT1400 - Calcul II - Théorie",
        description: "Section A - Cours magistral",
        codes: ["MAT 1400"],
      },
      {
        resume: "MAT1400 - Calcul II - Théorie",
        description: "Section A - Cours magistral",
        codes: ["MAT 1400"],
      },
      { resume: "MAT1400 - Calcul II - TP A", description: "Travaux pratiques", codes: ["MAT 1400"] },
    ]);
    expect(libelle).toBe("Calcul II");
  });

  test("la DESCRIPTION sert de recours quand le SUMMARY ne porte que le volet", () => {
    expect(
      choisirLibelle([
        { resume: "MAT1400-A — Théorie", description: "Calcul 1\nclasse nº 1490", codes: ["MAT 1400"] },
      ]),
    ).toBe("Calcul 1");
  });

  test("aucun titre dans le fichier : null, pas un titre inventé", () => {
    expect(
      choisirLibelle([
        { resume: "IFT1015 — Examen final", description: "", codes: ["IFT 1015"] },
      ]),
    ).toBeNull();
  });

  test("un évènement partagé ne laisse pas le sigle de l'autre cours dans le titre", () => {
    const evenement = {
      resume: "ACT 2121 / ACT 2151 — séance commune",
      description: "",
      codes: ["ACT 2121", "ACT 2151"],
    };
    expect(choisirLibelle([evenement])).toBe("séance commune");
  });
});
