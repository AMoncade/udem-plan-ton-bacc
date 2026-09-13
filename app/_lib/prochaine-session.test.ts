/**
 * LA SÉLECTION DE LA PROCHAINE SESSION.
 *
 * Ce qui est surveillé ici, c'est surtout ce que la liste ne doit PAS proposer.
 * Un planificateur qui propose un cours impossible coûte plus qu'un
 * planificateur qui ne propose rien : l'étudiant construit sa session dessus et
 * ne le découvre qu'à l'inscription.
 *
 * L'ORDRE est aussi testé, et c'est délibéré : il porte une décision (« prends
 * ceux-là »), donc il doit être reproductible et justifiable critère par
 * critère. Un tri qui change d'une exécution à l'autre ne se conteste pas.
 */
import { describe, expect, it } from "vitest";
import type {
  Audit,
  Bloc,
  Catalogue,
  CodeCours,
  Cours,
  DiagnosticCours,
  EtatBloc,
  Programme,
  Saison,
  Trimestre,
} from "../../lib/types";
import {
  CREDITS_STANDARD,
  composer,
  prochainTrimestre,
  suggererPourTrimestre,
  type Suggestion,
} from "./prochaine-session";
import type { Plan } from "./plan";

const HIVER_2027: Trimestre = { saison: "Hiver", annee: 2027 };
const AUTOMNE_2026: Trimestre = { saison: "Automne", annee: 2026 };

function bloc(id: string, cours: string[], min = 6): Bloc {
  return {
    id,
    cle: `01/${id}`,
    segment: "01",
    nom: "",
    regle: { type: "obligatoire", bornes: { min, max: min } },
    regleBrut: "",
    cours,
    contenuOuvert: false,
    notes: [],
  };
}

function fiche(
  code: string,
  options: { credits?: number; saisons?: Saison[]; annees?: number[] } = {},
): Cours {
  const saisons = options.saisons ?? ["Automne", "Hiver"];
  const annees = options.annees ?? [2026, 2027];
  return {
    code,
    titre: `titre de ${code}`,
    credits: options.credits ?? 3,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres: saisons.flatMap((saison) => annees.map((annee) => ({ saison, annee }))),
    url: "",
    scrapeISO: "2026-01-01T00:00:00.000Z",
  };
}

function programmeDe(blocs: Bloc[]): Programme {
  return {
    id: "p",
    nom: "P",
    orientation: null,
    segments: ["01"],
    orientations: [],
    cycle: null,
    faculte: null,
    typeProgramme: null,
    creditsTotal: null,
    exigences: null,
    blocs,
    notes: [],
    url: "",
    scrapeISO: "2026-01-01T00:00:00.000Z",
  };
}

function catalogueDe(programme: Programme, fiches: Cours[]): Catalogue {
  return {
    programmes: [programme],
    cours: Object.fromEntries(fiches.map((f) => [f.code, f])),
    prealablesNonParses: [],
    journal: [],
    scrapeISO: "2026-01-01T00:00:00.000Z",
  };
}

/** Un audit dont chaque bloc a le manque demandé. Seul `creditsManquants` est
 *  lu par le module ; le reste est rempli pour satisfaire le type. */
function auditDe(manques: Record<string, number>): Audit {
  const blocs: EtatBloc[] = Object.entries(manques).map(([cleBloc, creditsManquants]) => ({
    cleBloc,
    idBloc: cleBloc.split("/")[1] ?? cleBloc,
    creditsAttribues: 0,
    creditsManquants,
    creditsPerdus: 0,
    conforme: creditsManquants === 0,
    coursAttribues: [],
  }));
  // Typé sans `as` : un cast ici laisserait la fixture survivre à un champ
  // ajouté au contrat, et c'est exactement comme ça qu'un test cesse de décrire
  // la vraie forme sans que rien ne le signale.
  return {
    idProgramme: "p",
    blocs,
    creditsTotal: 0,
    creditsObligatoires: 0,
    creditsOption: 0,
    creditsChoix: 0,
    conforme: false,
    problemes: [],
  };
}

function diagnosticsDe(
  entrees: Record<string, { etat: DiagnosticCours["etat"]; manquants?: string[] }>,
): Map<CodeCours, DiagnosticCours> {
  const map = new Map<CodeCours, DiagnosticCours>();
  for (const [code, { etat, manquants }] of Object.entries(entrees)) {
    map.set(code, { code, etat, manquants: manquants ?? [], avertissements: [] });
  }
  return map;
}

describe("suggererPourTrimestre : ce qui ne doit pas être proposé", () => {
  it("un cours non offert à la saison visée est ÉCARTÉ, pas rétrogradé", () => {
    // Le refus d'offre n'est pas une préférence : un cours d'hiver placé à
    // l'automne est un plan qui ne se réalisera pas. Le laisser en bas de liste
    // le ferait choisir par quelqu'un qui descend jusqu'au bout.
    const p = programmeDe([bloc("A", ["ACT 1000", "ACT 2000"])]);
    const c = catalogueDe(p, [
      fiche("ACT 1000", { saisons: ["Hiver"] }),
      fiche("ACT 2000", { saisons: ["Automne"] }),
    ]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 6 }),
      diagnosticsDe({ "ACT 1000": { etat: "disponible" }, "ACT 2000": { etat: "disponible" } }),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual(["ACT 2000"]);
  });

  it("un cours déjà fait n'est pas reproposé", () => {
    const p = programmeDe([bloc("A", ["ACT 1000", "ACT 2000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000"), fiche("ACT 2000")]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 3 }),
      diagnosticsDe({ "ACT 1000": { etat: "fait" }, "ACT 2000": { etat: "disponible" } }),
      new Set(["ACT 1000"]),
      {},
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual(["ACT 2000"]);
  });

  it("un cours placé à un AUTRE trimestre est laissé où il est", () => {
    // Le reproposer ferait croire qu'il est libre, et l'étudiant le placerait
    // deux fois sans que rien ne le signale.
    const p = programmeDe([bloc("A", ["ACT 1000", "ACT 2000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000"), fiche("ACT 2000")]);
    const plan: Plan = { "ACT 1000": HIVER_2027 };
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 6 }),
      diagnosticsDe({ "ACT 1000": { etat: "disponible" }, "ACT 2000": { etat: "disponible" } }),
      new Set(),
      plan,
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual(["ACT 2000"]);
  });

  it("un cours placé AU trimestre visé reste dans la liste", () => {
    // C'est la session qu'on est en train de composer : ses cours doivent y
    // figurer, sinon l'écran se vide à mesure qu'on choisit.
    const p = programmeDe([bloc("A", ["ACT 1000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000")]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 3 }),
      diagnosticsDe({ "ACT 1000": { etat: "disponible" } }),
      new Set(),
      { "ACT 1000": AUTOMNE_2026 },
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual(["ACT 1000"]);
  });

  it("un préalable planifié LA MÊME session ne débloque pas son cours", () => {
    // Le piège central de cet écran. ACT 2000 exige ACT 1000 ; les placer tous
    // les deux à l'automne donne une session dont l'ordre interne est
    // impossible. Seul un préalable STRICTEMENT antérieur compte.
    const p = programmeDe([bloc("A", ["ACT 1000", "ACT 2000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000"), fiche("ACT 2000")]);
    const diagnostics = diagnosticsDe({
      "ACT 1000": { etat: "disponible" },
      "ACT 2000": { etat: "verrouille", manquants: ["ACT 1000"] },
    });

    const memeSession = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 6 }),
      diagnostics,
      new Set(),
      { "ACT 1000": AUTOMNE_2026 },
      AUTOMNE_2026,
    );
    expect(memeSession.map((x) => x.code)).toEqual(["ACT 1000"]);

    // Placé AVANT, il débloque : c'est tout l'intérêt de planifier.
    const sessionAvant = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 6 }),
      diagnostics,
      new Set(),
      { "ACT 1000": AUTOMNE_2026 },
      HIVER_2027,
    );
    expect(sessionAvant.map((x) => x.code)).toEqual(["ACT 2000"]);
  });

  it("un cours verrouillé dont le préalable reste manquant est écarté", () => {
    const p = programmeDe([bloc("A", ["ACT 1000", "ACT 2000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000"), fiche("ACT 2000")]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 6 }),
      diagnosticsDe({
        "ACT 1000": { etat: "disponible" },
        "ACT 2000": { etat: "verrouille", manquants: ["ACT 1000"] },
      }),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual(["ACT 1000"]);
  });

  it("un cours que le parcours ne cite pas n'est jamais proposé", () => {
    // Le catalogue porte aussi les cours atteints par les préalables. Les
    // proposer ferait planifier des cours qui ne comptent pas au diplôme.
    const p = programmeDe([bloc("A", ["ACT 1000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000"), fiche("MAT 9999")]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 3 }),
      diagnosticsDe({ "ACT 1000": { etat: "disponible" } }),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual(["ACT 1000"]);
  });
});

describe("suggererPourTrimestre : les motifs sont recomptables", () => {
  it("compte les cours DE CE PARCOURS que le code débloquerait", () => {
    const p = programmeDe([bloc("A", ["ACT 1000", "ACT 2000", "ACT 3000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000"), fiche("ACT 2000"), fiche("ACT 3000")]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 9 }),
      diagnosticsDe({
        "ACT 1000": { etat: "disponible" },
        "ACT 2000": { etat: "verrouille", manquants: ["ACT 1000"] },
        "ACT 3000": { etat: "verrouille", manquants: ["ACT 1000"] },
      }),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s[0].code).toBe("ACT 1000");
    expect(s[0].motifs).toContainEqual({ genre: "debloque", nombre: 2 });
  });

  it("« saison unique » ne se déclare que sur une seule saison, pas une seule année", () => {
    // Un cours offert à l'automne 2026 ET 2027 n'est pas rare ; un cours offert
    // seulement à l'hiver l'est. Confondre les deux ferait marquer urgent la
    // moitié du catalogue, et un marqueur qui s'allume partout cesse d'être lu.
    const p = programmeDe([bloc("A", ["ACT 1000", "ACT 2000"])]);
    const c = catalogueDe(p, [
      fiche("ACT 1000", { saisons: ["Hiver"], annees: [2027] }),
      fiche("ACT 2000", { saisons: ["Hiver"], annees: [2026, 2027] }),
    ]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 6 }),
      diagnosticsDe({ "ACT 1000": { etat: "disponible" }, "ACT 2000": { etat: "disponible" } }),
      new Set(),
      {},
      HIVER_2027,
    );
    for (const suggestion of s) {
      expect(suggestion.motifs).toContainEqual({ genre: "saison-unique", saison: "Hiver" });
    }
  });

  it("un cours dont tous les blocs sont comblés est marqué SANS EFFET", () => {
    // Permis, mais il ne rapprocherait pas du diplôme. Le proposer en tête
    // ferait perdre une session entière à quelqu'un qui suit la liste.
    const p = programmeDe([bloc("A", ["ACT 1000"]), bloc("B", ["ACT 2000"])]);
    const c = catalogueDe(p, [fiche("ACT 1000"), fiche("ACT 2000")]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 0, "01/B": 6 }),
      diagnosticsDe({ "ACT 1000": { etat: "disponible" }, "ACT 2000": { etat: "disponible" } }),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s.map((x) => [x.code, x.sansEffet])).toEqual([
      ["ACT 2000", false],
      ["ACT 1000", true],
    ]);
  });

  it("la réserve d'offre est transmise mot pour mot, pas résumée", () => {
    // Sans fiche, l'offre est inconnue : le cours reste proposable et la raison
    // doit rester lisible. La réécrire ferait diverger deux écrans qui parlent
    // du même verdict.
    const p = programmeDe([bloc("A", ["ACT 1000"])]);
    const c = catalogueDe(p, []);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 3 }),
      diagnosticsDe({}),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s).toHaveLength(1);
    expect(s[0].credits).toBeNull();
    expect(s[0].reserve).toContain("ACT 1000");
    expect(s[0].reserve).toContain("sous réserve");
  });
});

describe("l'ordre porte une décision, donc il est reproductible", () => {
  it("le plus débloquant d'abord, puis le rare, puis le bloc le plus près du but", () => {
    // L'ORDRE A CHANGÉ, et il a changé parce que l'essai sur le vrai catalogue
    // l'a démenti : rareté en tête, le bacc en mathématiques (Statistique) avec
    // un relevé vide proposait IFT 2425, STT 3795 et ECN 2165 — niveau 2000-3000
    // — devant MAT 1000, MAT 1400 et MAT 1600, qui débloquent 5, 9 et 12 autres
    // cours du parcours. La composition à 15 crédits ne contenait aucun cours de
    // première année. Un cours rare qu'on ne peut pas construire ne fait pas
    // avancer, et le prendre à la place d'un préalable retarde tout ce qui suit.
    const p = programmeDe([
      bloc("A", ["ACT 1000", "ACT 2000"]),
      bloc("B", ["ACT 3000", "ACT 4000"]),
    ]);
    const c = catalogueDe(p, [
      // Rare : une seule saison.
      fiche("ACT 4000", { saisons: ["Automne"] }),
      // Débloque deux cours.
      fiche("ACT 1000"),
      // Bloc presque comblé (3 crédits manquants contre 9).
      fiche("ACT 3000"),
      fiche("ACT 2000"),
    ]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 9, "01/B": 3 }),
      diagnosticsDe({
        "ACT 1000": { etat: "disponible" },
        "ACT 2000": { etat: "verrouille", manquants: ["ACT 1000"] },
        "ACT 3000": { etat: "disponible" },
        "ACT 4000": { etat: "disponible" },
      }),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual([
      "ACT 1000", // débloque 1 (ACT 2000) — aucun autre n'en débloque
      "ACT 4000", // rare : une seule saison
      "ACT 3000", // ni rare ni débloquant : bloc B, 3 crédits manquants
    ]);
  });

  it("un cours RARE qui n'avance pas le diplôme passe quand même en dernier", () => {
    // Le cas où « sans effet » décide vraiment, et le seul. Partout ailleurs il
    // coïncide avec « aucun bloc à combler », donc la règle de tri semble
    // redondante — trouvé en la retirant : les 21 tests restaient verts. Ici
    // elle ne l'est pas : la rareté passe AVANT le bloc dans l'ordre, donc sans
    // cette règle un cours rare et inutile au diplôme s'afficherait EN TÊTE de
    // la liste, avec le marqueur le plus urgent de l'écran.
    const p = programmeDe([bloc("A", ["ACT 1000"]), bloc("B", ["ACT 2000"])]);
    const c = catalogueDe(p, [
      fiche("ACT 1000", { saisons: ["Automne"] }), // rare, mais bloc A comblé
      fiche("ACT 2000"), // banal, mais bloc B à combler
    ]);
    const s = suggererPourTrimestre(
      p,
      c,
      auditDe({ "01/A": 0, "01/B": 6 }),
      diagnosticsDe({ "ACT 1000": { etat: "disponible" }, "ACT 2000": { etat: "disponible" } }),
      new Set(),
      {},
      AUTOMNE_2026,
    );
    expect(s.map((x) => x.code)).toEqual(["ACT 2000", "ACT 1000"]);
    expect(s[1].motifs).toContainEqual({ genre: "saison-unique", saison: "Automne" });
    expect(s[1].sansEffet).toBe(true);
  });

  it("à critères égaux, l'ordre est celui des codes — deux exécutions, un écran", () => {
    const p = programmeDe([bloc("A", ["ACT 3000", "ACT 1000", "ACT 2000"])]);
    const c = catalogueDe(p, [fiche("ACT 3000"), fiche("ACT 1000"), fiche("ACT 2000")]);
    const suggerer = () =>
      suggererPourTrimestre(
        p,
        c,
        auditDe({ "01/A": 9 }),
        diagnosticsDe({
          "ACT 1000": { etat: "disponible" },
          "ACT 2000": { etat: "disponible" },
          "ACT 3000": { etat: "disponible" },
        }),
        new Set(),
        {},
        AUTOMNE_2026,
      );
    expect(suggerer().map((x) => x.code)).toEqual(["ACT 1000", "ACT 2000", "ACT 3000"]);
    expect(suggerer().map((x) => x.code)).toEqual(suggerer().map((x) => x.code));
  });
});

describe("composer : une charge visée, jamais dépassée", () => {
  const suggestion = (
    code: string,
    credits: number | null,
    sansEffet = false,
    avertissements: string[] = [],
  ): Suggestion => ({
    code,
    credits,
    motifs: [],
    reserve: null,
    sansEffet,
    avertissements,
  });

  it("s'arrête à la charge visée et n'y revient pas", () => {
    const c = composer(
      [suggestion("A", 3), suggestion("B", 3), suggestion("C", 3), suggestion("D", 3)],
      9,
    );
    expect(c.codes).toEqual(["A", "B", "C"]);
    expect(c.credits).toBe(9);
  });

  it("un cours de crédits inconnus RÉSERVE sa place sans entrer dans le total", () => {
    // Le compter pour zéro ferait entrer un cours de plus que la charge visée —
    // c'est la manière dont une session se surcharge sans que personne l'ait
    // décidé. Mais l'ajouter au total afficherait des crédits que rien n'atteste.
    const c = composer([suggestion("A", 6), suggestion("B", null), suggestion("C", 3)], 9);
    expect(c.codes).toEqual(["A", "B"]);
    expect(c.credits).toBe(6);
    expect(c.creditsInconnus).toBe(1);
    expect(CREDITS_STANDARD).toBe(3);
  });

  it("les cours sans effet sur le diplôme ne sont jamais composés d'office", () => {
    const c = composer([suggestion("A", 3, true), suggestion("B", 3)], 9);
    expect(c.codes).toEqual(["B"]);
  });

  it("annonce que les conflits d'horaire ne sont pas vérifiés", () => {
    // Tant qu'aucune donnée de séance n'existe, cette composition peut être
    // impossible à l'horaire. Le drapeau existe pour que l'écran le dise plutôt
    // que l'appelant l'oublie.
    expect(composer([], 15).conflitsNonVerifies).toBe(true);
  });
});

describe("prochainTrimestre : l'horloge est un paramètre", () => {
  it("en octobre, on planifie l'hiver suivant — pas l'automne où l'on est", () => {
    expect(prochainTrimestre(new Date(2026, 9, 15))).toEqual({
      saison: "Hiver",
      annee: 2027,
    });
  });

  it("en février, la prochaine session est l'été", () => {
    expect(prochainTrimestre(new Date(2027, 1, 3))).toEqual({ saison: "Été", annee: 2027 });
  });

  it("en juin, c'est l'automne de la même année", () => {
    expect(prochainTrimestre(new Date(2026, 5, 20))).toEqual({
      saison: "Automne",
      annee: 2026,
    });
  });

  it("ne lit pas l'horloge : deux appels avec la même date donnent la même réponse", () => {
    // Une fonction qui appelle `new Date()` en interne ne se teste que le jour
    // où on l'écrit. Ce projet a déjà payé une fixture plus vieille que son
    // générateur ; l'horloge entre par la porte, jamais par la fenêtre.
    const jour = new Date(2026, 11, 31);
    expect(prochainTrimestre(jour)).toEqual(prochainTrimestre(jour));
  });
});
