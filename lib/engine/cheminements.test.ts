/**
 * CHEMINEMENTS EXCLUSIFS (R1) — le filtre, côté audit.
 *
 * Trois pièces justes qui se rencontraient sur rien : le scraper émettait
 * `Bloc.cheminement`, `blocsDuCheminement()` existait et passait ses tests, et
 * personne ne l'appelait. Le coût vivait dans l'application.
 *
 * Mesuré sur `data/` au 2026-09-12 : `maitrise-en-finance-mathematique-et-
 * computationnelle` annonce 45 crédits et en exigeait 54 (30 + 3 + 3 communs,
 * PLUS les 9 du stage ET les 9 du travail dirigé). C'est le piège
 * 180-contre-90 en miniature — additionner des parcours qui s'excluent.
 *
 * Le choix de conception que ces tests fixent : sans cheminement nommé, l'audit
 * ne filtre RIEN et refuse d'affirmer. Choisir le premier par défaut donnerait
 * un audit plausible et faux ; déclarer « non conforme » présenterait comme une
 * dette un manque qui n'est qu'un artefact du non-choix.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditProgramme } from "./index";
import { catalogueTest, ficheTest } from "./donnees-test";
import { cleBloc } from "../codes";
import { blocsDuCheminement, exigeUnCheminement } from "../parcours";
import type { Bloc, CodeCours, Cours, Programme, RegleBloc } from "../types";

const bloc = (id: string, min: number, cheminement?: string): Bloc => ({
  id,
  cle: cleBloc("70", id, cheminement ?? ""),
  segment: "70",
  nom: cheminement ?? "",
  regle: { type: "obligatoire", bornes: { min, max: min } } as RegleBloc,
  regleBrut: `Obligatoire - ${min} crédits.`,
  cours: [],
  contenuOuvert: false,
  notes: [],
  ...(cheminement === undefined ? {} : { cheminement }),
});

/** La forme de la maîtrise en finance mathématique, réduite : 6 communs + 3 par
 *  cheminement, donc 9 annoncés et 12 si l'on additionne les deux branches. */
function programmeACheminements(cheminements: string[] | undefined): Programme {
  return {
    id: "test-cheminements-70",
    nom: "Programme SYNTHÉTIQUE à cheminements exclusifs (forme de la maîtrise en finance mathématique)",
    orientation: null,
    segments: ["70"],
    orientations: [],
    cycle: "2e cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Maîtrise",
    creditsTotal: 9,
    exigences: {
      brut: "9 crédits de cours obligatoire (SYNTHÉTIQUE)",
      obligatoire: { min: 9, max: 9 },
      option: null,
      choix: null,
    },
    blocs: [
      bloc("70A", 6),
      bloc("70D", 3, "Stage"),
      bloc("70D", 3, "Travail dirigé"),
    ],
    ...(cheminements === undefined ? {} : { cheminements }),
    notes: [],
    url: "https://exemple.invalide/test-cheminements",
    scrapeISO: "2026-09-12T00:00:00.000Z",
  };
}

const FICHES: Cours[] = [];
const VIDE = new Set<CodeCours>();
const audit = (p: Programme, chem: string | null = null) =>
  auditProgramme(p, catalogueTest([p], FICHES), VIDE, chem);

const CHEMINEMENTS = ["Stage", "Travail dirigé"];

describe("cheminements : sans choix, l'audit refuse d'affirmer", () => {
  it("n'explose PAS, alors que le filtre partagé lève dans ce cas", () => {
    // `blocsDuCheminement(p, null)` lève par conception — c'est sa garde contre
    // l'amputation silencieuse, et elle est juste. Mais `auditProgramme` tourne
    // pendant un rendu : une exception y remplacerait un écran par une page
    // blanche. Le moteur convertit donc la garde en verdict.
    const p = programmeACheminements(CHEMINEMENTS);
    expect(() => blocsDuCheminement(p, null)).toThrow();
    expect(() => audit(p)).not.toThrow();
  });

  it("le dit, et refuse le verdict au lieu de le déclarer non conforme", () => {
    const p = programmeACheminements(CHEMINEMENTS);
    const a = audit(p);
    expect(a.conforme).toBe(false);
    const dit = a.problemes.find((m) => m.includes("cheminements exclusifs"));
    expect(dit).toBeDefined();
    // Le message doit désigner l'artefact, pas une dette de l'étudiant.
    expect(dit).toContain("artefact du non-choix");
    expect(dit).toContain("Stage");
  });
});

describe("cheminements : avec un choix, le filtre mord", () => {
  it("ne garde que les blocs communs et ceux du cheminement nommé", () => {
    const p = programmeACheminements(CHEMINEMENTS);
    const a = audit(p, "Stage");
    const cles = a.blocs.map((b) => b.cleBloc);
    expect(cles).toHaveLength(2);
    expect(cles).toContain(cleBloc("70", "70A", ""));
    expect(cles).toContain(cleBloc("70", "70D", "Stage"));
    expect(cles).not.toContain(cleBloc("70", "70D", "Travail dirigé"));
    expect(a.problemes.some((m) => m.includes("cheminements exclusifs"))).toBe(false);
  });

  it("le total exigé retombe sur ce que la page annonce", () => {
    // Le cœur du défaut : 6 + 3 + 3 = 12 exigés pour 9 annoncés, tant que les
    // deux branches s'additionnent.
    const p = programmeACheminements(CHEMINEMENTS);
    const sans = audit(p).blocs.reduce((s, b) => s + b.creditsManquants, 0);
    const avec = audit(p, "Stage").blocs.reduce((s, b) => s + b.creditsManquants, 0);
    expect(sans).toBe(12);
    expect(avec).toBe(p.creditsTotal);
  });
});

describe("cheminements : les cas limites", () => {
  it("un libellé que le programme ne déclare pas est signalé, pas jeté", () => {
    // Filtrer dessus ne garderait aucun bloc spécifique et amputerait le
    // programme ; ne pas filtrer le gonfle. On gonfle ET on le dit, parce qu'un
    // programme amputé se lit comme un parcours plus court.
    const p = programmeACheminements(CHEMINEMENTS);
    const a = audit(p, "Passerelle");
    expect(a.conforme).toBe(false);
    const dit = a.problemes.find((m) => m.includes("Passerelle"));
    expect(dit).toBeDefined();
    expect(dit).toContain("n'est pas déclaré");
    // Aucun bloc n'a disparu : le programme est gonflé, pas amputé.
    expect(a.blocs).toHaveLength(3);
  });

  it("un programme SANS cheminement ignore un choix résiduel, sans rien signaler", () => {
    // L'UI peut garder une sélection en passant d'un programme à l'autre : ce
    // n'est pas une erreur, et en faire une noierait l'écran d'avertissements.
    const p = programmeACheminements(undefined);
    expect(exigeUnCheminement(p)).toBe(false);
    const a = audit(p, "Stage");
    expect(a.blocs).toHaveLength(3);
    expect(a.problemes.some((m) => m.includes("cheminement"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contre la vraie page
// ---------------------------------------------------------------------------

const DIR = join(import.meta.dirname, "..", "..", "data", "programmes");
const FINANCE = join(DIR, "maitrise-en-finance-mathematique-et-computationnelle.json");

describe.skipIf(!existsSync(FINANCE))("sur la vraie maîtrise en finance mathématique", () => {
  it("45 crédits annoncés, 54 exigés sans filtre, 45 avec", () => {
    const p = JSON.parse(readFileSync(FINANCE, "utf8")) as Programme;
    if (!exigeUnCheminement(p)) return; // l'amont a changé : se taire plutôt que mesurer un artefact

    const minimums = (blocs: { regle: Programme["blocs"][number]["regle"] }[]) =>
      blocs.reduce((s, b) => s + (b.regle.type === "inconnu" ? 0 : b.regle.bornes.min), 0);

    expect(minimums(p.blocs)).toBe(54);
    expect(p.creditsTotal).toBe(45);
    for (const choix of p.cheminements ?? []) {
      expect(minimums(blocsDuCheminement(p, choix)), `cheminement ${choix}`).toBe(45);
    }

    const fiches = p.blocs.flatMap((b) => b.cours).map((c) => ficheTest(c, 3));
    const cat = catalogueTest([p], fiches);
    expect(auditProgramme(p, cat, new Set<CodeCours>(), null).conforme).toBe(false);
    expect(
      auditProgramme(p, cat, new Set<CodeCours>(), null).problemes.some((m) =>
        m.includes("cheminements exclusifs"),
      ),
    ).toBe(true);
  });
});
