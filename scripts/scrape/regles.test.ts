/**
 * Les neuf formes de règle de bloc, et les totaux par type.
 *
 * Chaque chaîne testée ici est un VERBATIM relevé sur une page réelle, avec le
 * programme et le bloc où il a été vu — sinon ce fichier testerait les phrases
 * qu'on aurait aimé trouver. Aucun accès réseau.
 */
import { describe, it, expect } from "vitest";
import { formeDeRegle, parseExigencesParType, parseRegleBloc, trouverPhrasesExigences } from "./regles";

describe("parseRegleBloc — les 9 formes, avec leur programme d'origine", () => {
  const cas: [string, string, { type: string; bornes?: { min: number; max: number } }][] = [
    ["Obligatoire - 26 crédits.", "bacc. maths, bloc 01A", { type: "obligatoire", bornes: { min: 26, max: 26 } }],
    ["Option - Minimum 12 crédits, maximum 27 crédits.", "bacc. maths, bloc 75C", { type: "option", bornes: { min: 12, max: 27 } }],
    ["Option - Maximum 13 crédits.", "bacc. maths, bloc 75E", { type: "option", bornes: { min: 0, max: 13 } }],
    ["Option - 4 crédits.", "bacc. maths, bloc 82B", { type: "option", bornes: { min: 4, max: 4 } }],
    ["Choix - 3 crédits.", "bacc. maths, bloc 75Z", { type: "choix", bornes: { min: 3, max: 3 } }],
    ["Choix - Maximum 3 crédits.", "bacc. droit, bloc 70Z", { type: "choix", bornes: { min: 0, max: 3 } }],
    ["Choix - Minimum 3 crédits, maximum 6 crédits.", "bacc. psycho, bloc 71Z", { type: "choix", bornes: { min: 3, max: 6 } }],
    ["Option - maximum 6 crédits.", "bacc. éco-politique, bloc 71F (minuscule)", { type: "option", bornes: { min: 0, max: 6 } }],
    ["Option - minimum 15 crédits, maximum 24 crédits.", "maîtrise maths, S-Bloc 73A (minuscules)", { type: "option", bornes: { min: 15, max: 24 } }],
  ];

  for (const [brut, ou, attendu] of cas) {
    it(`« ${brut} » (${ou})`, () => {
      const lu = parseRegleBloc(brut);
      expect(lu.regle).toEqual(attendu);
      expect(lu.note).toBeNull();
    });
  }

  it("« Option - Minimum 3 crédits, Maximum 15 crédits. » — « Maximum » capital au milieu", () => {
    // Accès - FAC, bloc 70B. Dixième orthographe, absente du relevé des neuf :
    // un parseur sensible à la casse au milieu de la phrase la rate.
    expect(parseRegleBloc("Option - Minimum 3 crédits, Maximum 15 crédits.").regle).toEqual({
      type: "option",
      bornes: { min: 3, max: 15 },
    });
  });

  it("tolère l'absence du point final, le singulier et les tirets longs", () => {
    expect(parseRegleBloc("obligatoire - 7 CRÉDITS").regle).toEqual({
      type: "obligatoire",
      bornes: { min: 7, max: 7 },
    });
    expect(parseRegleBloc("Choix – 1 crédit").regle).toEqual({
      type: "choix",
      bornes: { min: 1, max: 1 },
    });
  });

  it("lit un nombre fractionnaire, écrit à la française ou à l'anglaise", () => {
    expect(parseRegleBloc("Obligatoire - 1,5 crédit.").regle).toEqual({
      type: "obligatoire",
      bornes: { min: 1.5, max: 1.5 },
    });
    expect(parseRegleBloc("Obligatoire - 1.5 crédit.").regle).toEqual({
      type: "obligatoire",
      bornes: { min: 1.5, max: 1.5 },
    });
  });
});

describe("parseRegleBloc — ce qui n'est pas avalé en silence", () => {
  it("une forme inconnue devient `inconnu` AVEC son brut, jamais null", () => {
    // En v1 une règle illisible rendait null et faisait IGNORER le bloc entier :
    // un bloc disparu ne laisse aucune trace à l'écran, un bloc non auditable si.
    const lu = parseRegleBloc("Obligatoire - tous les cours du département");
    expect(lu.regle).toEqual({ type: "inconnu", brut: "Obligatoire - tous les cours du département" });
    expect(lu.note).toMatch(/bornes de crédits non reconnues/);
  });

  it("un type inconnu devient `inconnu`, avec le mot fautif dans la note", () => {
    const lu = parseRegleBloc("Recommandé - 6 crédits.");
    expect(lu.regle.type).toBe("inconnu");
    expect(lu.note).toContain("Recommandé");
  });

  it("une règle vide devient `inconnu`, pas un bloc à 0 crédit", () => {
    // Zéro crédit passerait tous les audits sans rien déclencher.
    expect(parseRegleBloc("").regle).toEqual({ type: "inconnu", brut: "" });
  });

  it("« Minimum N » sans maximum devient `inconnu` : aucun maximum n'est nommable", () => {
    // Forme jamais relevée. Lui donner `max: creditsTotal` inventerait une borne
    // que la page n'écrit pas.
    const lu = parseRegleBloc("Option - Minimum 12 crédits.");
    expect(lu.regle.type).toBe("inconnu");
    expect(lu.note).toMatch(/minimum sans maximum/);
  });

  it("formeDeRegle classe les neuf formes en 3 types x 3 bornes", () => {
    expect(formeDeRegle("Obligatoire - 26 crédits.")).toBe("obligatoire / exacte");
    expect(formeDeRegle("Option - Maximum 13 crédits.")).toBe("option / max seul");
    expect(formeDeRegle("Choix - Minimum 3 crédits, maximum 6 crédits.")).toBe("choix / min+max");
    expect(formeDeRegle("Recommandé - 6 crédits.")).toBe("inconnu");
  });
});

describe("trouverPhrasesExigences", () => {
  it("reconnaît « N crédits obligatoires et M crédits à option » SANS « au choix »", () => {
    // Le bogue muet que ce test épingle : `\b` devant « à » n'est jamais une
    // frontière de mot en JavaScript (« à » n'est pas un caractère de mot ASCII),
    // donc `/\b[àa]\s+option\b/` ne matchait rien. Les deux orientations COOP du
    // bacc. en maths, qui n'ont pas de crédits au choix, disparaissaient.
    const phrase =
      "- orientation Actuariat COOP (segments 01 et 76) avec 60 crédits obligatoires et 30 crédits à option.";
    expect(trouverPhrasesExigences(phrase)).toEqual([phrase]);
  });

  it("ne prend pas « Le baccalauréat comporte 90 crédits. » pour une répartition", () => {
    expect(trouverPhrasesExigences("Le baccalauréat comporte 90 crédits.")).toEqual([]);
  });

  it("ne prend pas une phrase sans chiffre pour une répartition", () => {
    expect(trouverPhrasesExigences("Les cours à option sont choisis au choix.")).toEqual([]);
  });

  it("sépare les sept puces d'orientation du bacc. en mathématiques", () => {
    const texte =
      "- orientation Actuariat (segments 01 et 75) avec 54 crédits obligatoires, 33 crédits à option et 3 crédits au choix. " +
      "- orientation Actuariat COOP (segments 01 et 76) avec 60 crédits obligatoires et 30 crédits à option. " +
      "- orientation Statistique (segments 01 et 79) avec 60 crédits obligatoires, 27 à option et 3 crédits au choix.";
    expect(trouverPhrasesExigences(texte)).toHaveLength(3);
  });
});

describe("parseExigencesParType — verbatims de quatre facultés", () => {
  it("actuariat : trois nombres exacts (le 54/33/3 du projet)", () => {
    const { exigences } = parseExigencesParType(
      "- orientation Actuariat (segments 01 et 75) avec 54 crédits obligatoires, 33 crédits à option et 3 crédits au choix.",
    );
    expect(exigences.obligatoire).toEqual({ min: 54, max: 54 });
    expect(exigences.option).toEqual({ min: 33, max: 33 });
    expect(exigences.choix).toEqual({ min: 3, max: 3 });
  });

  it("droit : intervalle d'option et maximum au choix", () => {
    const { exigences } = parseExigencesParType(
      "Les crédits du baccalauréat sont répartis de la façon suivante : 68 crédits obligatoires, de 30 à 33 crédits à option et un maximum de 3 crédits au choix.",
    );
    expect(exigences.obligatoire).toEqual({ min: 68, max: 68 });
    expect(exigences.option).toEqual({ min: 30, max: 33 });
    expect(exigences.choix).toEqual({ min: 0, max: 3 });
  });

  it("psycho : deux intervalles, dont « 3 à 6 » sans le mot « de »", () => {
    const { exigences } = parseExigencesParType(
      "Les crédits du baccalauréat sont répartis de la façon suivante : 45 crédits obligatoires, de 39 à 42 crédits à option et 3 à 6 crédits au choix.",
    );
    expect(exigences.obligatoire).toEqual({ min: 45, max: 45 });
    expect(exigences.option).toEqual({ min: 39, max: 42 });
    expect(exigences.choix).toEqual({ min: 3, max: 6 });
  });

  it("Actuariat COOP : aucun crédit au choix ENONCÉ reste null, pas {0,0}", () => {
    // « {min:0,max:0} » affirmerait « zéro crédit au choix », que la page ne dit
    // pas : elle ne parle pas des crédits au choix du tout.
    const { exigences } = parseExigencesParType(
      "- orientation Actuariat COOP (segments 01 et 76) avec 60 crédits obligatoires et 30 crédits à option.",
    );
    expect(exigences.obligatoire).toEqual({ min: 60, max: 60 });
    expect(exigences.option).toEqual({ min: 30, max: 30 });
    expect(exigences.choix).toBeNull();
  });

  it("« 27 à option » sans le mot « crédits » est quand même lu", () => {
    const { exigences } = parseExigencesParType(
      "- orientation Statistique (segments 01 et 79) avec 60 crédits obligatoires, 27 à option et 3 crédits au choix.",
    );
    expect(exigences.option).toEqual({ min: 27, max: 27 });
  });

  it("maîtrise : « obligatoires attribués à la recherche » ne casse pas la lecture", () => {
    const { exigences } = parseExigencesParType(
      "- cheminement avec stage (S) : 21 crédits obligatoires attribués à un stage, de 15 à 24 crédits à option et un maximum de 9 crédits au choix.",
    );
    expect(exigences.obligatoire).toEqual({ min: 21, max: 21 });
    expect(exigences.option).toEqual({ min: 15, max: 24 });
    expect(exigences.choix).toEqual({ min: 0, max: 9 });
  });

  it("éco-politique : « un minimum de 60 à option » reste null AVEC un motif", () => {
    // Aucun maximum n'est écrit, et le déduire (90 − 27 − 3) serait une
    // inférence, pas une lecture. null plus une note, jamais un nombre plausible.
    const { exigences, notes } = parseExigencesParType(
      "Ce programme totalise 27 crédits de cours obligatoire, un minimum de 60 crédits à option et un maximum de 3 crédits au choix.",
    );
    expect(exigences.obligatoire).toEqual({ min: 27, max: 27 });
    expect(exigences.option).toBeNull();
    expect(exigences.choix).toEqual({ min: 0, max: 3 });
    expect(notes.join(" ")).toMatch(/sans bornes nommables/);
  });

  it("garde la phrase verbatim dans `brut`", () => {
    const phrase = "Les crédits de la mineure sont répartis de la façon suivante : 19 crédits obligatoires, 9 crédits à option et 2 crédits au choix.";
    expect(parseExigencesParType(phrase).exigences.brut).toBe(phrase);
  });
});
