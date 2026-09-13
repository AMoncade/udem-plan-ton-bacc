/**
 * ENTRÉES DÉGÉNÉRÉES — ce que le moteur fait des programmes qu'aucun écran ne
 * traverse.
 *
 * Deux défauts de la journée avaient la même forme : une affirmation émise sur
 * une condition plus large que ce qu'elle énonce. Les entrées dégénérées sont
 * l'endroit où cette forme se voit le mieux, parce qu'elles rendent fausses les
 * hypothèses implicites qu'aucun parcours normal ne met en défaut.
 *
 * La question posée à chaque cas n'est pas « le moteur plante-t-il » — il ne
 * doit pas — mais **« rend-il un résultat faux, ou refuse-t-il de répondre »**.
 * Un audit qui déclare conforme un programme vide serait pire qu'un audit qui
 * lève.
 */
import { describe, it, expect } from "vitest";
import { auditProgramme, diagnostiquerCours } from "./index";
import { cleBloc } from "../codes";
import { ficheTest } from "./donnees-test";
import type { Bloc, Catalogue, CodeCours, Cours, Programme, RegleBloc } from "../types";

const FICHES: Cours[] = ["IFT 1000", "IFT 1010", "IFT 2000"].map((c) => ficheTest(c, 3));
const cat = (p: Programme, fiches: Cours[] = FICHES): Catalogue => ({
  programmes: [p],
  cours: Object.fromEntries(fiches.map((f) => [f.code, f])),
  prealablesNonParses: [],
  journal: [],
  scrapeISO: "",
});

const bloc = (id: string, regle: RegleBloc, cours: CodeCours[] = []): Bloc => ({
  id,
  cle: cleBloc("70", id, ""),
  segment: "70",
  nom: "",
  regle,
  regleBrut: "(SYNTHÉTIQUE)",
  cours,
  contenuOuvert: false,
  notes: [],
});

const programme = (blocs: Bloc[], exigences: Programme["exigences"], creditsTotal: number | null): Programme => ({
  id: "test-degenere",
  nom: "Programme SYNTHÉTIQUE dégénéré",
  orientation: null,
  segments: ["70"],
  orientations: [],
  cycle: "1er cycle",
  faculte: "Arts et sciences",
  typeProgramme: "Baccalauréat",
  creditsTotal,
  exigences,
  blocs,
  notes: [],
  url: "https://exemple.invalide/degenere",
  scrapeISO: "2026-09-13T00:00:00.000Z",
});

const SANS = new Set<CodeCours>();

describe("entrées dégénérées : le moteur ne doit ni lever ni mentir", () => {
  it("programme SANS AUCUN BLOC : ne déclare pas conforme un vide", () => {
    // Le cas le plus important de ce fichier. Un programme sans bloc n'a aucune
    // exigence à violer, donc tout calcul bloc-par-bloc le déclare parfait. Ce
    // serait diplômer sur du vide.
    const p = programme([], null, 90);
    const a = auditProgramme(p, cat(p), SANS);
    expect(a.conforme, "un programme sans bloc ne peut pas être conforme").toBe(false);
    expect(a.problemes.length).toBeGreaterThan(0);
  });

  it("programme sans bloc ET sans creditsTotal : refuse toujours d'affirmer", () => {
    // Ici il n'y a littéralement RIEN à vérifier : ni bloc, ni total. Le piège
    // serait de conclure « aucune contrainte violée, donc conforme ».
    const p = programme([], null, null);
    const a = auditProgramme(p, cat(p), SANS);
    expect(a.conforme).toBe(false);
  });

  it("BORNES INVERSÉES sur un bloc (min > max) : c'est dit, pas avalé", () => {
    // Une donnée que la page ne devrait jamais produire. Si elle arrive, le
    // bloc est insatisfiable par construction : aucun nombre de crédits ne peut
    // être à la fois ≥ 9 et ≤ 3.
    const p = programme(
      [bloc("70A", { type: "option", bornes: { min: 9, max: 3 } }, ["IFT 1000", "IFT 1010", "IFT 2000"])],
      { brut: "", obligatoire: { min: 0, max: 0 }, option: { min: 9, max: 9 }, choix: { min: 0, max: 0 } },
      9,
    );
    const a = auditProgramme(p, cat(p), new Set(["IFT 1000", "IFT 1010", "IFT 2000"]));
    expect(a.conforme, "un bloc aux bornes inversées ne peut pas être déclaré conforme").toBe(false);
  });

  it("exigences TOUTES À ZÉRO avec un total non nul : l'écart est signalé", () => {
    // 0 + 0 + 0 par type, mais 90 crédits annoncés au total : la page se
    // contredit. Le moteur ne doit pas conclure « rien d'exigé, donc conforme ».
    const p = programme(
      [bloc("70A", { type: "option", bornes: { min: 0, max: 30 } }, ["IFT 1000"])],
      { brut: "", obligatoire: { min: 0, max: 0 }, option: { min: 0, max: 0 }, choix: { min: 0, max: 0 } },
      90,
    );
    const a = auditProgramme(p, cat(p), SANS);
    expect(a.conforme).toBe(false);
    expect(a.problemes.some((m) => /total/.test(m))).toBe(true);
  });

  it("étudiant avec PLUS de crédits que le programme n'en demande", () => {
    // Le surplus ne doit ni faire échouer l'audit, ni disparaître : des crédits
    // réussis qui ne comptent pas sont une perte réelle, et le projet a un
    // genre pour ça.
    const p = programme(
      [bloc("70A", { type: "option", bornes: { min: 3, max: 3 } }, ["IFT 1000", "IFT 1010", "IFT 2000"])],
      { brut: "", obligatoire: { min: 0, max: 0 }, option: { min: 3, max: 3 }, choix: { min: 0, max: 0 } },
      3,
    );
    const a = auditProgramme(p, cat(p), new Set(["IFT 1000", "IFT 1010", "IFT 2000"]));
    const etat = a.blocs[0];
    expect(etat.creditsAttribues).toBe(3);
    expect(etat.creditsPerdus).toBe(6);
    expect(a.signaux.some((s) => s.genre === "perteOuSurplus")).toBe(true);
  });

  it("catalogue VIDE : aucun cours n'a de fiche, et le moteur le dit", () => {
    const p = programme(
      [bloc("70A", { type: "option", bornes: { min: 3, max: 3 } }, ["IFT 1000"])],
      { brut: "", obligatoire: { min: 0, max: 0 }, option: { min: 3, max: 3 }, choix: { min: 0, max: 0 } },
      3,
    );
    const a = auditProgramme(p, cat(p, []), new Set(["IFT 1000"]));
    expect(a.conforme).toBe(false);
    expect(a.signaux.some((s) => s.genre === "donneesAmont")).toBe(true);
  });

  it("aucune de ces entrées ne fait lever le moteur", () => {
    // `auditProgramme` tourne pendant un rendu : une exception y remplace
    // l'écran par une page blanche. Le refus doit passer par le verdict.
    const cas: Programme[] = [
      programme([], null, 90),
      programme([], null, null),
      programme([bloc("70A", { type: "inconnu", brut: "???" })], null, 90),
      programme([bloc("70A", { type: "option", bornes: { min: 9, max: 3 } })], null, 90),
      programme(
        [bloc("70A", { type: "obligatoire", bornes: { min: -3, max: -1 } })],
        { brut: "", obligatoire: { min: -3, max: -1 }, option: null, choix: null },
        -9,
      ),
    ];
    for (const p of cas) {
      expect(() => auditProgramme(p, cat(p), SANS), p.blocs[0]?.regleBrut ?? "sans bloc").not.toThrow();
      expect(() => diagnostiquerCours(cat(p), SANS)).not.toThrow();
    }
  });

  it("un bloc de règle INCONNUE ne peut pas être déclaré conforme", () => {
    // Le contrat le dit : « un bloc `inconnu` ne peut PAS être déclaré
    // conforme, il ressort dans les problèmes ».
    const p = programme(
      [bloc("70A", { type: "inconnu", brut: "Forme jamais vue - 3 crédits." }, ["IFT 1000"])],
      { brut: "", obligatoire: { min: 0, max: 0 }, option: { min: 0, max: 0 }, choix: { min: 0, max: 0 } },
      3,
    );
    const a = auditProgramme(p, cat(p), new Set(["IFT 1000"]));
    expect(a.blocs[0].conforme).toBe(false);
    expect(a.conforme).toBe(false);
    // Le message cite `regleBrut` — le verbatim de la page — et non le `brut`
    // porté par la règle `inconnu`. C'est mon test qui se trompait, pas le
    // moteur : c'est bien le texte affiché à l'étudiant qu'il faut citer.
    expect(a.problemes.some((m) => /n'a pas été interprétée/.test(m))).toBe(true);
  });
});
