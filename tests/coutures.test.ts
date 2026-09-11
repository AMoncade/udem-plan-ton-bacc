/**
 * TESTS DE COUTURE — propriété de la session intégratrice.
 *
 * Chaque chantier a été écrit séparément et passe ses propres tests. Ce
 * fichier teste ce qu'aucun d'eux ne peut tester : l'endroit où deux pièces
 * correctes se rencontrent.
 *
 * Le moteur a été écrit contre `data/fixtures/actuariat-verifie.fixture.json`
 * (3 fiches de cours, crédits inventés pour l'arithmétique). Il n'avait jamais
 * vu `data/catalogue.json`, produit par le scraper depuis les vraies pages.
 * C'est cette rencontre-là qui est vérifiée ici.
 */
import { describe, it, expect } from "vitest";
import { diagnostiquerCours, auditProgramme } from "../lib/engine";
import { normaliserCode } from "../lib/codes";
import type { Catalogue, CodeCours } from "../lib/types";
import brut from "../data/catalogue.json";

const catalogue = brut as unknown as Catalogue;
const programme = catalogue.programmes[0];
const AUCUN_COURS_FAIT = new Set<CodeCours>();

/** Tous les codes cités par les blocs du programme. */
const codesDesBlocs = [...new Set(programme.blocs.flatMap((b) => b.cours))];

describe("couture scraper -> contrat : le catalogue réel respecte lib/types.ts", () => {
  it("le catalogue n'est pas vide et correspond à ce que le scraper annonce", () => {
    expect(programme.blocs).toHaveLength(8);
    expect(Object.keys(catalogue.cours)).toHaveLength(55);
    expect(codesDesBlocs).toHaveLength(55);
  });

  it("chaque code est sous forme canonique, et la clé du catalogue égale le champ code", () => {
    // LA couture la plus silencieuse du projet : UdeM écrit « ACT 2250 »,
    // « ACT2250 » et « act-2250 ». Une seule forme non normalisée d'un côté
    // ne lève aucune erreur — le graphe s'affiche sans arêtes et l'audit
    // trouve zéro cours fait.
    for (const [cle, fiche] of Object.entries(catalogue.cours)) {
      expect(normaliserCode(cle), `clé non canonique: ${cle}`).toBe(cle);
      expect(fiche.code, `clé et champ code divergent pour ${cle}`).toBe(cle);
    }
    for (const code of codesDesBlocs) {
      expect(normaliserCode(code), `code de bloc non canonique: ${code}`).toBe(code);
    }
  });

  it("tout cours cité par un bloc a une fiche", () => {
    const sansFiche = codesDesBlocs.filter((c) => !(c in catalogue.cours));
    expect(sansFiche).toEqual([]);
  });

  it("les crédits des fiches somment à la règle du bloc, pour chaque bloc obligatoire", () => {
    // Deux informations scrapées INDÉPENDAMMENT (la règle sur la page de
    // structure, les crédits sur chaque fiche de cours) qui doivent concorder.
    // Un écart signifierait que l'un des deux est mal lu, sans qu'aucun test
    // de chantier puisse le voir.
    for (const bloc of programme.blocs) {
      if (bloc.regle.type !== "obligatoire") continue;
      const somme = bloc.cours.reduce((s, c) => s + (catalogue.cours[c]?.credits ?? 0), 0);
      expect(somme, `bloc ${bloc.id} (${bloc.regleBrut})`).toBe(bloc.regle.credits);
    }
  });

  it("rien n'est avalé : chaque ligne non parsée correspond à une fiche dont les préalables sont opaques", () => {
    expect(catalogue.prealablesNonParses.length).toBeGreaterThan(0);
    for (const { code, brut: ligne } of catalogue.prealablesNonParses) {
      const fiche = catalogue.cours[code];
      expect(fiche, `ligne non parsée pour un cours absent: ${code}`).toBeDefined();
      expect(fiche.prealablesBrut).toBe(ligne);
      expect(fiche.prealables?.genre, `${code} devrait être opaque`).toBe("opaque");
    }
  });
});

describe("couture moteur -> catalogue réel : le moteur digère les vraies données", () => {
  it("diagnostiquerCours couvre tout cours cité par un bloc", () => {
    const diag = diagnostiquerCours(catalogue, AUCUN_COURS_FAIT);
    for (const code of codesDesBlocs) {
      expect(diag.get(code), `aucun diagnostic pour ${code}`).toBeDefined();
    }
  });

  it("un parcours vide est non conforme et il manque les trois totaux", () => {
    const a = auditProgramme(programme, catalogue, AUCUN_COURS_FAIT);
    expect(a.conforme).toBe(false);
    expect(a.creditsObligatoires).toBe(0);
    expect(a.creditsOption).toBe(0);
    expect(a.creditsChoix).toBe(0);
    expect(a.problemes.length).toBeGreaterThan(0);
    expect(a.blocs).toHaveLength(8);
  });

  it("les trois blocs obligatoires faits donnent exactement 54 crédits retenus", () => {
    // 26 + 21 + 7, le chiffre officiel de la page. Calculé ici à partir des
    // crédits des fiches réelles et de l'attribution du moteur, pas recopié.
    const obligatoires = programme.blocs
      .filter((b) => b.regle.type === "obligatoire")
      .flatMap((b) => b.cours);
    const a = auditProgramme(programme, catalogue, new Set(obligatoires));
    expect(a.creditsObligatoires).toBe(54);
    for (const etat of a.blocs) {
      const bloc = programme.blocs.find((b) => b.id === etat.idBloc)!;
      if (bloc.regle.type !== "obligatoire") continue;
      expect(etat.conforme, `bloc ${etat.idBloc}`).toBe(true);
      expect(etat.creditsPerdus, `bloc ${etat.idBloc}`).toBe(0);
    }
    // Mais le programme ne l'est pas : il reste 33 crédits d'option et 3 au
    // choix. C'est le piège 18-contre-33 vu depuis l'autre bout.
    expect(a.conforme).toBe(false);
  });
});
