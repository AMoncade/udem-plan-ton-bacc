/**
 * ÉCARTS AMONT — quand c'est la PAGE qui est incohérente, pas le parcours.
 *
 * Le bacc en musique annonce « Obligatoire - 15 crédits » au bloc 01/01A et n'y
 * liste que 4 cours à 3 crédits. Vérifié dans le HTML brut : rien de caché,
 * rien de mal scrapé, la page se contredit. Dix blocs du catalogue sont dans ce
 * cas, mesurés sur les 937 blocs dont toutes les fiches sont connues.
 *
 * Les deux réponses faciles sont fausses :
 *   - exiger que l'amont soit juste bloquerait le projet sur une donnée qu'il
 *     ne maîtrise pas ;
 *   - tolérer en silence est précisément ce que ce projet refuse.
 *
 * Sans ce diagnostic, l'audit dit à un étudiant qui a réussi les QUATRE cours
 * du bloc « il vous manque 3 crédits » — une exigence qu'aucune action de sa
 * part ne peut satisfaire. Ces tests fixent le troisième comportement :
 * l'écart est journalisé, l'étudiant n'est pas mis en dette, et le bloc n'est
 * pas déclaré conforme pour autant.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditProgramme, clesBlocsIncoherents } from "./index";
import { catalogueTest, ficheTest } from "./donnees-test";
import { cleBloc } from "../codes";
import type { Bloc, CodeCours, Cours, Programme, RegleBloc } from "../types";

const bloc = (id: string, regle: RegleBloc, regleBrut: string, cours: CodeCours[]): Bloc => ({
  id,
  cle: cleBloc("01", id, ""),
  segment: "01",
  nom: "",
  regle,
  regleBrut,
  cours,
  contenuOuvert: false,
  notes: [],
});

/** La forme du bloc 01/01A de la musique : un minimum que ses cours n'atteignent pas. */
function programmeIncoherent(minimum: number): Programme {
  return {
    id: "test-ecart-amont-01A",
    nom: "Programme SYNTHÉTIQUE à bloc infaisable (forme réelle du bacc. en musique 01/01A)",
    orientation: null,
    segments: ["01"],
    orientations: [],
    cycle: "1er cycle",
    faculte: "Musique",
    typeProgramme: "Baccalauréat",
    creditsTotal: minimum,
    exigences: {
      brut: `${minimum} crédits de cours obligatoire (SYNTHÉTIQUE)`,
      obligatoire: { min: minimum, max: minimum },
      option: null,
      choix: null,
    },
    blocs: [
      bloc(
        "01A",
        { type: "obligatoire", bornes: { min: minimum, max: minimum } },
        `Obligatoire - ${minimum} crédits.`,
        ["MTE 2210", "MTE 2211", "MUL 1102", "MUL 1132"],
      ),
    ],
    notes: [],
    url: "https://exemple.invalide/test-ecart-amont",
    scrapeISO: "2026-09-11T00:00:00.000Z",
  };
}

const QUATRE = ["MTE 2210", "MTE 2211", "MUL 1102", "MUL 1132"];
const FICHES: Cours[] = QUATRE.map((code) => ficheTest(code, 3));
const TOUT_FAIT = new Set<CodeCours>(QUATRE);

describe("écart amont : un bloc dont le minimum dépasse ses propres cours", () => {
  it("CONTRÔLE — le même bloc, cohérent, ne déclenche rien", () => {
    // Sans ce contrôle, les assertions ci-dessous ne prouveraient pas que c'est
    // bien l'incohérence qui parle : un diagnostic toujours allumé passerait.
    const p = programmeIncoherent(12); // 4 × 3 = 12 : la page se tient
    const audit = auditProgramme(p, catalogueTest([p], FICHES), TOUT_FAIT);
    expect(audit.conforme).toBe(true);
    expect(audit.blocs[0].conforme).toBe(true);
    expect(audit.problemes.some((m) => m.includes("incohérente"))).toBe(false);
  });

  it("ne met PAS l'étudiant en dette de crédits qui n'existent pas", () => {
    const p = programmeIncoherent(15); // la page en annonce 15, elle en liste 12
    const audit = auditProgramme(p, catalogueTest([p], FICHES), TOUT_FAIT);
    // Le point de tout l'exercice : il a fait les quatre cours du bloc.
    // Lui réclamer 3 crédits de plus serait lui demander l'impossible.
    expect(audit.blocs[0].creditsManquants).toBe(0);
  });

  it("ne déclare pas le bloc conforme pour autant, et journalise l'écart", () => {
    const p = programmeIncoherent(15);
    const audit = auditProgramme(p, catalogueTest([p], FICHES), TOUT_FAIT);
    expect(audit.blocs[0].conforme).toBe(false);
    expect(audit.conforme).toBe(false);
    const dit = audit.problemes.find((m) => m.includes("incohérente"));
    expect(dit).toBeDefined();
    // Le message doit désigner la page, pas le parcours, et chiffrer l'écart.
    expect(dit).toContain("PAGE");
    expect(dit).toContain("12 crédits");
    expect(dit).toContain("3 crédits");
  });

  it("ce qui reste à faire se mesure sur l'ATTEIGNABLE, pas sur l'annoncé", () => {
    // Deux cours faits sur quatre : il reste 6 crédits réellement faisables,
    // pas 9. Annoncer 9 mélangerait une dette réelle et une dette imaginaire.
    const p = programmeIncoherent(15);
    const audit = auditProgramme(p, catalogueTest([p], FICHES), new Set(QUATRE.slice(0, 2)));
    expect(audit.blocs[0].creditsManquants).toBe(6);
  });

  it("n'accuse PAS la page quand c'est une fiche qui manque chez nous", () => {
    // Le garde-fou décisif. 70 % des cours cités par le catalogue n'ont pas
    // encore de fiche : une somme partielle est un PLANCHER. Conclure
    // « la page est incohérente » sur un plancher reprocherait à l'UdeM un trou
    // de notre propre scrape.
    const p = programmeIncoherent(15);
    const amputees = FICHES.filter((f) => f.code !== "MUL 1132");
    const audit = auditProgramme(p, catalogueTest([p], amputees), TOUT_FAIT);
    expect(audit.problemes.some((m) => m.includes("incohérente"))).toBe(false);
  });
});

describe("le marqueur publié pour l'UI", () => {
  it("nomme le bloc incohérent, et rien d'autre", () => {
    const p = programmeIncoherent(15);
    expect(clesBlocsIncoherents(p, catalogueTest([p], FICHES))).toEqual([p.blocs[0].cle]);
  });

  it("ne nomme rien quand la page se tient", () => {
    const p = programmeIncoherent(12);
    expect(clesBlocsIncoherents(p, catalogueTest([p], FICHES))).toEqual([]);
  });

  it("ne nomme rien quand c'est une fiche qui manque chez nous", () => {
    const p = programmeIncoherent(15);
    const amputees = FICHES.filter((f) => f.code !== "MUL 1132");
    expect(clesBlocsIncoherents(p, catalogueTest([p], amputees))).toEqual([]);
  });

  it("dit la MÊME chose que l'audit — un marqueur qui diverge est pire que pas de marqueur", () => {
    // Deux implémentations du même critère finiraient par se contredire sans
    // que rien ne le signale : l'UI peindrait « page incohérente » sur un bloc
    // que l'audit tient pour normal, ou l'inverse.
    const p = programmeIncoherent(15);
    const cat = catalogueTest([p], FICHES);
    const marques = new Set(clesBlocsIncoherents(p, cat));
    const audit = auditProgramme(p, cat, TOUT_FAIT);
    for (const etat of audit.blocs) {
      if (!marques.has(etat.cleBloc)) continue;
      expect(etat.conforme, `${etat.cleBloc} marqué incohérent mais déclaré conforme`).toBe(false);
      expect(etat.creditsManquants, `${etat.cleBloc} : dette réclamée sur un bloc incohérent`).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Contre la vraie page
// ---------------------------------------------------------------------------

const DIR_PROGRAMMES = join(import.meta.dirname, "..", "..", "data", "programmes");
const DIR_COURS = join(import.meta.dirname, "..", "..", "data", "cours");
const MUSIQUE = join(DIR_PROGRAMMES, "baccalaureat-en-musique.json");

const fichesDe = (sujets: string[]): Cours[] => {
  const out: Cours[] = [];
  for (const sujet of sujets) {
    const f = join(DIR_COURS, `${sujet}.json`);
    if (!existsSync(f)) continue;
    for (const fiche of Object.values(JSON.parse(readFileSync(f, "utf8")) as Record<string, Cours>)) {
      if (fiche?.code) out.push(fiche);
    }
  }
  return out;
};

describe.skipIf(!existsSync(MUSIQUE) || !existsSync(join(DIR_COURS, "MTE.json")))(
  "écart amont — sur la vraie page du bacc. en musique",
  () => {
    it("le bloc 01/01A est signalé comme incohérent, pas comme un manque de l'étudiant", () => {
      const page = JSON.parse(readFileSync(MUSIQUE, "utf8")) as Programme;
      const cible = page.blocs.find((b) => b.cle === "01/01A");
      expect(cible, "le bloc 01/01A a disparu de la page").toBeDefined();

      const fiches = fichesDe(["MTE", "MUL"]);
      // Si l'amont a été corrigé entre-temps, ce test doit se taire plutôt que
      // de mesurer un artefact : on vérifie d'abord que l'écart existe encore.
      const credits = new Map(fiches.map((f) => [f.code, f.credits]));
      const toutesConnues = cible!.cours.every((c) => credits.has(c));
      const somme = cible!.cours.reduce((s, c) => s + (credits.get(c) ?? 0), 0);
      const minimum = cible!.regle.type === "obligatoire" ? cible!.regle.bornes.min : 0;
      if (!toutesConnues || somme >= minimum) return;

      const audit = auditProgramme(page, catalogueTest([page], fiches), new Set(cible!.cours));
      const etat = audit.blocs.find((b) => b.cleBloc === "01/01A");
      expect(etat?.creditsManquants).toBe(0);
      expect(audit.problemes.some((m) => m.includes("incohérente"))).toBe(true);
    });
  },
);
