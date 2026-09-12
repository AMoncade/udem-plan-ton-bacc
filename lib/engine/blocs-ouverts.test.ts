/**
 * BLOCS À CONTENU OUVERT : ce que le moteur accepte enfin d'auditer, et pourquoi
 * il refuse tout le reste.
 *
 * Mesuré sur le catalogue au 2026-09-12, HEAD `7bdbc6a` : 401 blocs portent
 * `contenuOuvert`, mais seuls **169** bloquent un verdict (les autres ont un
 * minimum de 0 et ne demandaient rien). Sur ces 169, **55** portent une
 * contrainte dite mécanisable, dont **48** sont des exclusions de sigle sur des
 * blocs « Choix » — les seules que le moteur exploite. Elles lèvent le dernier
 * bloc invérifiable de **47 programmes**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LIGNE, ET POURQUOI ELLE PASSE LÀ
 *
 * Un bloc « Choix » à liste vide signifie DÉJÀ « n'importe quel cours ». Une
 * exclusion de sigle en RETRANCHE. La contrainte est soustractive sur un
 * ensemble universel : le moteur n'invente aucune appartenance, il restreint.
 *
 * Tout autre bloc ouvert renvoie à un ENSEMBLE EXTÉRIEUR qu'on ne connaît pas —
 * les cours du Centre de langues, la banque de 2e cycle d'une faculté, « des
 * cours de même niveau d'autres universités ». Y verser des cours inventerait
 * une appartenance qu'aucune donnée n'atteste. C'est la différence entre
 * restreindre et deviner, et c'est elle que ces tests protègent.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditProgramme } from "./index";
import { catalogueTest, ficheTest } from "./donnees-test";
import { cleBloc } from "../codes";
import type { Bloc, CodeCours, ContrainteContenu, Cours, Programme, RegleBloc } from "../types";

const bloc = (
  id: string,
  regle: RegleBloc,
  regleBrut: string,
  cours: CodeCours[],
  contenuOuvert = false,
  contrainteContenu?: ContrainteContenu,
  notes: string[] = [],
): Bloc => ({
  id,
  cle: cleBloc("71", id, ""),
  segment: "71",
  nom: "",
  regle,
  regleBrut,
  cours,
  contenuOuvert,
  ...(contrainteContenu ? { contrainteContenu } : {}),
  notes,
});

/**
 * 9 crédits : 6 obligatoires listés, plus un bloc au choix de 3 crédits dont la
 * page dit seulement « un sigle autre que ECN ». C'est la forme des 48 blocs
 * `xxZ` du catalogue.
 */
function programmeAvecChoix(
  contrainte: ContrainteContenu | undefined,
  regleChoix: RegleBloc = { type: "choix", bornes: { min: 3, max: 3 } },
  brutChoix = "Choix - 3 crédits.",
): Programme {
  return {
    id: "test-bloc-ouvert-choix",
    nom: "Programme SYNTHÉTIQUE à bloc au choix contraint (forme réelle des blocs 01Z/71Z)",
    orientation: null,
    segments: ["71"],
    orientations: [],
    cycle: "1er cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Baccalauréat",
    creditsTotal: 9,
    exigences: {
      brut: "6 crédits obligatoires et 3 crédits au choix (SYNTHÉTIQUE)",
      obligatoire: { min: 6, max: 6 },
      option: null,
      choix: { min: 3, max: 3 },
    },
    blocs: [
      bloc("71A", { type: "obligatoire", bornes: { min: 6, max: 6 } }, "Obligatoire - 6 crédits.", [
        "ECN 1000",
        "ECN 1010",
      ]),
      bloc("71Z", regleChoix, brutChoix, [], true, contrainte, [
        "Sauf exception autorisée, les cours au choix doivent être choisis parmi les cours identifiés par un sigle autre que le sigle ECN.",
      ]),
    ],
    notes: [],
    url: "https://exemple.invalide/test-bloc-ouvert",
    scrapeISO: "2026-09-12T00:00:00.000Z",
  };
}

const EXCLUSION_ECN: ContrainteContenu = { genre: "sigle", exclus: ["ECN"] };
const FICHES: Cours[] = ["ECN 1000", "ECN 1010", "ECN 2000", "POL 2000"].map((c) => ficheTest(c, 3));
const OBLIGATOIRES: CodeCours[] = ["ECN 1000", "ECN 1010"];

const auditer = (p: Programme, faits: CodeCours[]) =>
  auditProgramme(p, catalogueTest([p], FICHES), new Set(faits));

describe("bloc « Choix » à exclusion de sigle : auditable", () => {
  it("CONTRÔLE — sans la contrainte, le bloc reste invérifiable et bloque le verdict", () => {
    // Sans ce contrôle, les tests suivants ne prouveraient pas que c'est la
    // contrainte qui débloque : ils pourraient passer pour une autre raison.
    const p = programmeAvecChoix(undefined);
    const a = auditer(p, [...OBLIGATOIRES, "POL 2000"]);
    expect(a.conforme).toBe(false);
    expect(a.problemes.some((m) => m.includes("n'énumère aucun cours"))).toBe(true);
  });

  it("un cours d'un sigle autorisé y est versé, et le verdict devient affirmable", () => {
    const p = programmeAvecChoix(EXCLUSION_ECN);
    const a = auditer(p, [...OBLIGATOIRES, "POL 2000"]);
    const z = a.blocs.find((b) => b.cleBloc === p.blocs[1].cle);
    expect(z?.coursAttribues).toEqual(["POL 2000"]);
    expect(z?.conforme).toBe(true);
    expect(a.conforme).toBe(true);
    // Il n'est plus annoncé comme invérifiable : il a été vérifié.
    expect(a.problemes.some((m) => m.includes("n'énumère aucun cours"))).toBe(false);
  });

  it("un cours du sigle EXCLU n'y est pas versé — l'exclusion mord vraiment", () => {
    // Le test qui donne son sens au précédent. Si le filtre ne mordait pas,
    // ECN 2000 comblerait le bloc et l'audit dirait « conforme » à un parcours
    // que la page refuse.
    const p = programmeAvecChoix(EXCLUSION_ECN);
    const a = auditer(p, [...OBLIGATOIRES, "ECN 2000"]);
    const z = a.blocs.find((b) => b.cleBloc === p.blocs[1].cle);
    expect(z?.coursAttribues).toEqual([]);
    expect(z?.creditsManquants).toBe(3);
    expect(a.conforme).toBe(false);
  });

  it("l'exclusion ne vaut que pour le bloc qui la porte", () => {
    // ECN 1000 et ECN 1010 sont CITÉS par le bloc obligatoire : un joker qui
    // exclut ECN ne doit pas les lui retirer.
    const p = programmeAvecChoix(EXCLUSION_ECN);
    const a = auditer(p, [...OBLIGATOIRES, "POL 2000"]);
    const oblig = a.blocs.find((b) => b.cleBloc === p.blocs[0].cle);
    expect(oblig?.coursAttribues.sort()).toEqual(["ECN 1000", "ECN 1010"]);
  });
});

describe("ce que le moteur continue de refuser, et c'est délibéré", () => {
  it("la même exclusion sur un bloc « Option » reste INVÉRIFIABLE", () => {
    // La condition qui porte toute la conception. Un bloc « Option » ouvert
    // renvoie à un ensemble extérieur inconnu ; y verser des cours inventerait
    // une appartenance. Seul « Choix » signifie déjà « n'importe quel cours ».
    const p = programmeAvecChoix(
      EXCLUSION_ECN,
      { type: "option", bornes: { min: 3, max: 3 } },
      "Option - 3 crédits.",
    );
    const a = auditer(p, [...OBLIGATOIRES, "POL 2000"]);
    const z = a.blocs.find((b) => b.cleBloc === p.blocs[1].cle);
    expect(z?.coursAttribues).toEqual([]);
    expect(a.problemes.some((m) => m.includes("n'énumère aucun cours"))).toBe(true);
    expect(a.conforme).toBe(false);
  });

  it("une contrainte de CYCLE n'est pas exploitée, même sur un bloc « Choix »", () => {
    // 126 blocs la portent, plus que les sigles. Mais leurs proses nomment des
    // répertoires que l'étiquette ne porte pas (« la banque de 2e cycle de la
    // Faculté des sciences de l'éducation », « des cours d'autres
    // universités »). Filtrer sur `Cours.cycle` y admettrait des cours que la
    // page n'autorise pas : une contrainte additive déguisée en soustractive.
    const p = programmeAvecChoix({ genre: "cycle", cycle: "2e cycle" });
    const a = auditer(p, [...OBLIGATOIRES, "POL 2000"]);
    const z = a.blocs.find((b) => b.cleBloc === p.blocs[1].cle);
    expect(z?.coursAttribues).toEqual([]);
    expect(a.problemes.some((m) => m.includes("n'énumère aucun cours"))).toBe(true);
  });

  it.each([
    ["autorisation", { genre: "autorisation" } as ContrainteContenu],
    ["renvoiExterne", { genre: "renvoiExterne" } as ContrainteContenu],
    ["renvoiBlocs", { genre: "renvoiBlocs", blocs: ["71A"] } as ContrainteContenu],
  ])("le genre %s laisse le bloc invérifiable", (_nom, contrainte) => {
    const p = programmeAvecChoix(contrainte);
    const a = auditer(p, [...OBLIGATOIRES, "POL 2000"]);
    expect(a.blocs.find((b) => b.cleBloc === p.blocs[1].cle)?.coursAttribues).toEqual([]);
    expect(a.problemes.some((m) => m.includes("n'énumère aucun cours"))).toBe(true);
  });

  it("une liste d'exclus vide ne rend pas le bloc auditable", () => {
    // Un `exclus: []` dirait « aucun sigle n'est exclu », ce qui ferait du bloc
    // un joker ordinaire. Or la prose contraint bien quelque chose que le
    // scraper n'a pas su réduire : le traiter comme libre serait pire que de
    // le dire invérifiable.
    const p = programmeAvecChoix({ genre: "sigle", exclus: [] });
    const a = auditer(p, [...OBLIGATOIRES, "POL 2000"]);
    expect(a.blocs.find((b) => b.cleBloc === p.blocs[1].cle)?.coursAttribues).toEqual([]);
    expect(a.problemes.some((m) => m.includes("n'énumère aucun cours"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contre les vraies pages
// ---------------------------------------------------------------------------

const DIR_PROGRAMMES = join(import.meta.dirname, "..", "..", "data", "programmes");
const DIR_COURS = join(import.meta.dirname, "..", "..", "data", "cours");
const HISTOIRE = join(DIR_PROGRAMMES, "baccalaureat-en-histoire.json");

const fichesDe = (sujets: string[]): Cours[] => {
  const out: Cours[] = [];
  for (const s of sujets) {
    const f = join(DIR_COURS, `${s}.json`);
    if (!existsSync(f)) continue;
    for (const fiche of Object.values(JSON.parse(readFileSync(f, "utf8")) as Record<string, Cours>)) {
      if (fiche?.code) out.push(fiche);
    }
  }
  return out;
};

describe.skipIf(!existsSync(HISTOIRE))("sur la vraie page du bacc. en histoire", () => {
  it("le bloc au choix 01/01Z exclut HST et accepte le reste", () => {
    const p = JSON.parse(readFileSync(HISTOIRE, "utf8")) as Programme;
    const z = p.blocs.find((b) => b.contenuOuvert && b.contrainteContenu?.genre === "sigle");
    if (!z || z.regle.type !== "choix") return; // l'amont a changé : se taire plutôt que mesurer un artefact
    const exclus = z.contrainteContenu?.genre === "sigle" ? z.contrainteContenu.exclus : [];
    expect(exclus).toContain("HST");

    const fiches = fichesDe(["HST", "SOL"]);
    const unHST = fiches.find((f) => f.code.startsWith("HST") && f.credits > 0);
    const unAutre = fiches.find((f) => !f.code.startsWith("HST") && f.credits > 0);
    if (!unHST || !unAutre) return;

    // Un cours HST non cité par un bloc ne doit PAS combler le bloc au choix.
    const cite = new Set(p.blocs.flatMap((b) => b.cours));
    const hstLibre = fiches.find((f) => f.code.startsWith("HST") && !cite.has(f.code));
    if (hstLibre) {
      const a = auditProgramme(p, catalogueTest([p], fiches), new Set([hstLibre.code]));
      expect(a.blocs.find((b) => b.cleBloc === z.cle)?.coursAttribues).toEqual([]);
    }
    const b = auditProgramme(p, catalogueTest([p], fiches), new Set([unAutre.code]));
    expect(b.blocs.find((x) => x.cleBloc === z.cle)?.coursAttribues).toEqual([unAutre.code]);
  });
});
