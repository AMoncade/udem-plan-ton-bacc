/**
 * R2 — contraintes de quota par sigle.
 *
 * Le test qui porte ce module est celui du « piège central » transposé : un
 * parcours dont CHAQUE BLOC est dans ses bornes et dont le quota par sigle
 * n'est pourtant pas rempli. C'est exactement la forme du piège 18-contre-33
 * de l'actuariat, mais sur les sigles au lieu des types de blocs, et c'est la
 * seule raison valable d'écrire ce module : si tout parcours conforme bloc par
 * bloc satisfaisait automatiquement le quota, la règle n'aurait rien à vérifier.
 *
 * Les autres tests protègent surtout contre le sur-zèle : neuf des douze proses
 * du catalogue qui portent le motif « N crédits <SIGLE> » ne sont PAS des
 * conditions de diplôme, et les transformer en exigences fabriquerait des
 * parcours faussement bloquants.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditProgramme } from "./index";
import { lireContraintesSigles, verifierContraintesSigles } from "./sigles";
import { catalogueTest, ficheTest } from "./donnees-test";
import { cleBloc } from "../codes";
import type { Bloc, CodeCours, Cours, Programme, RegleBloc } from "../types";

// ---------------------------------------------------------------------------
// Programme synthétique : la forme du bacc en économie et politique, réduite
// ---------------------------------------------------------------------------

const bloc = (
  id: string,
  regle: RegleBloc,
  regleBrut: string,
  cours: CodeCours[],
  contenuOuvert = false,
  notes: string[] = [],
): Bloc => ({
  id,
  cle: cleBloc("71", id),
  segment: "71",
  nom: "",
  regle,
  regleBrut,
  cours,
  contenuOuvert,
  notes,
});

/**
 * 18 crédits : 6 obligatoires (ECN) + 12 à option répartis en deux blocs qui
 * acceptent CHACUN du POL et de l'ECN. C'est cette mixité qui rend le piège
 * possible : on peut remplir les deux blocs sans toucher au POL.
 *
 * Le quota est ramené à 9 + 9 = 18 pour que l'arithmétique soit close, la page
 * réelle écrivant 33 + 33 sur 90.
 */
const QUOTA_BRUT =
  "Quels que soient les cours à option choisis, 9 crédits de cours POL et 9 crédits de cours ECN devront avoir été complétés, incluant les cours obligatoires.";

function programmeQuota(notes: string[] = [QUOTA_BRUT]): Programme {
  return {
    id: "test-quota-sigle-71",
    nom: "Programme SYNTHÉTIQUE à quota par sigle (forme réelle du bacc. en économie et politique)",
    orientation: null,
    segments: ["71"],
    orientations: [],
    cycle: "1er cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Baccalauréat",
    creditsTotal: 18,
    exigences: {
      brut: "6 crédits obligatoires et 12 crédits à option (SYNTHÉTIQUE)",
      obligatoire: { min: 6, max: 6 },
      option: { min: 12, max: 12 },
      choix: { min: 0, max: 0 },
    },
    blocs: [
      bloc("71A", { type: "obligatoire", bornes: { min: 6, max: 6 } }, "Obligatoire - 6 crédits.", [
        "ECN 1000",
        "ECN 1010",
      ]),
      bloc(
        "71I",
        { type: "option", bornes: { min: 6, max: 12 } },
        "Option - Minimum 6 crédits, maximum 12 crédits.",
        ["POL 2000", "POL 2010", "ECN 2000", "ECN 2010"],
      ),
      bloc(
        "71J",
        { type: "option", bornes: { min: 6, max: 12 } },
        "Option - Minimum 6 crédits, maximum 12 crédits.",
        ["POL 3000", "POL 3010", "ECN 3000", "ECN 3010"],
      ),
    ],
    notes,
    url: "https://exemple.invalide/test-quota-sigle",
    scrapeISO: "2026-09-11T00:00:00.000Z",
  };
}

const FICHES: Cours[] = [
  "ECN 1000",
  "ECN 1010",
  "ECN 2000",
  "ECN 2010",
  "ECN 3000",
  "ECN 3010",
  "POL 2000",
  "POL 2010",
  "POL 3000",
  "POL 3010",
].map((code) => ficheTest(code, 3));

const catalogue = (programme: Programme, fiches: Cours[] = FICHES) =>
  catalogueTest([programme], fiches);

// ---------------------------------------------------------------------------

describe("R2 — lecture de la prose", () => {
  it("lit « 9 crédits de cours POL et 9 crédits de cours ECN » comme DEUX quotas", () => {
    const { contraintes, nonLues } = lireContraintesSigles(programmeQuota());
    expect(nonLues).toEqual([]);
    const minimums = contraintes.filter((c) => c.genre === "minimum");
    expect(minimums).toHaveLength(2);
    expect(minimums.map((c) => (c.genre === "minimum" ? [c.sigles, c.credits] : null))).toEqual([
      [["POL"], 9],
      [["ECN"], 9],
    ]);
  });

  it("« 42 crédits de cours CIN ou JEU » est UN quota à deux sigles, pas deux quotas", () => {
    // Forme réelle du bacc. en écriture de scénario et création littéraire.
    // Les séparer exigerait 84 crédits au lieu de 42.
    const p = programmeQuota([
      "Quels que soient les cours à option choisis, l'étudiant doit compléter au moins 42 crédits de cours CIN ou JEU et au moins 42 crédits de cours FRA.",
    ]);
    const minimums = lireContraintesSigles(p).contraintes.filter((c) => c.genre === "minimum");
    expect(minimums).toHaveLength(2);
    expect(minimums[0]).toMatchObject({ sigles: ["CIN", "JEU"], credits: 42 });
    expect(minimums[1]).toMatchObject({ sigles: ["FRA"], credits: 42 });
  });

  /**
   * Le coeur du garde-fou. Ces quatre phrases sont VERBATIM du catalogue et
   * portent toutes le motif « N crédits <SIGLE> ». Aucune n'est une condition
   * de diplôme. Un parseur qui les retient fabrique des exigences inexistantes.
   */
  it.each([
    [
      "admissibilité aux cycles supérieurs (bacc. en physique)",
      "Pour être admissible aux cycles supérieurs en physique, l'étudiant doit avoir réussi au moins 9 crédits PHY de niveau 3000 au bloc 73D.",
    ],
    [
      "possibilité offerte (géographie environnementale)",
      "Possibilité de prendre 3 crédits de cours PLU (Cours d'études supérieures de l'École d'été du CÉRIUM) après l'obtention de 60 crédits.",
    ],
    [
      "plafond (DESS en études internationales)",
      "Les étudiants peuvent prendre un maximum de 6 crédits de cours POL.",
    ],
    [
      "ligne de préalables (microprogramme en leadership appliqué à la santé)",
      "Préalables: SPU7012: Pour les étudiants du programme 3-631-6-0, être candidat ou détenir un doctorat en santé publique, et avoir complété au moins 12 crédits de cours SPU de 3e cycle.",
    ],
  ])("n'invente pas d'exigence : %s", (_nom, phrase) => {
    const { contraintes, nonLues } = lireContraintesSigles(programmeQuota([phrase]));
    expect(contraintes.filter((c) => c.genre === "minimum")).toEqual([]);
    // Écartée, mais JAMAIS en silence : le projet exige que l'écart soit dit.
    expect(nonLues).toHaveLength(1);
    expect(nonLues[0].raison).toBeTruthy();
  });

  it("ignore une note préfixée d'un segment qui n'est pas celui du parcours", () => {
    // Les notes de l'écriture de scénario sont préfixées « Segment 71 — ».
    // Projetée sur un parcours d'autres segments, la règle porterait sur des
    // blocs qui ne sont pas les siens.
    const p = { ...programmeQuota([`Segment 99 — ${QUOTA_BRUT}`]), segments: ["71"] };
    expect(lireContraintesSigles(p).contraintes).toEqual([]);
  });

  it("lit une exclusion de sigle et retient que la page admet une dérogation", () => {
    const p = programmeQuota([]);
    p.blocs.push(
      bloc("71Z", { type: "choix", bornes: { min: 0, max: 3 } }, "Choix - Maximum 3 crédits.", [], true, [
        "Sauf exception autorisée, les cours au choix doivent être choisis parmi les cours identifiés par un sigle autre que les sigles ECN ou POL.",
      ]),
    );
    const exclusions = lireContraintesSigles(p).contraintes.filter((c) => c.genre === "exclusion");
    expect(exclusions).toHaveLength(1);
    expect(exclusions[0]).toMatchObject({
      sigles: ["ECN", "POL"],
      cleBloc: "71/71Z",
      exceptionPossible: true,
    });
  });
});

describe("R2 — le piège : tous les blocs dans leurs bornes, quota non atteint", () => {
  /** Six ECN obligatoires, puis 12 crédits d'option pris entièrement en ECN. */
  const TOUT_ECN = new Set<CodeCours>([
    "ECN 1000",
    "ECN 1010",
    "ECN 2000",
    "ECN 2010",
    "ECN 3000",
    "ECN 3010",
  ]);

  /** Le même volume, réparti pour honorer 9 POL et 9 ECN. */
  const REPARTI = new Set<CodeCours>([
    "ECN 1000",
    "ECN 1010",
    "POL 2000",
    "POL 2010",
    "POL 3000",
    "ECN 3000",
  ]);

  it("chaque bloc est effectivement satisfait — sans quoi le test ne prouverait rien", () => {
    // Contrôle indispensable : si un bloc échouait déjà, le refus de conformité
    // ci-dessous ne dirait rien du quota. C'est la moitié du test qui compte.
    const p = programmeQuota([]); // sans la note : aucun quota lu
    const audit = auditProgramme(p, catalogue(p), TOUT_ECN);
    expect(audit.blocs.every((b) => b.conforme)).toBe(true);
    expect(audit.creditsTotal).toBe(18);
    expect(audit.conforme).toBe(true);
  });

  it("le MÊME parcours cesse d'être conforme une fois le quota lu", () => {
    const p = programmeQuota();
    const audit = auditProgramme(p, catalogue(p), TOUT_ECN);
    // Les blocs n'ont pas bougé : c'est bien le quota, et lui seul, qui tranche.
    expect(audit.blocs.every((b) => b.conforme)).toBe(true);
    expect(audit.conforme).toBe(false);
    expect(audit.problemes.some((m) => m.includes("quota de sigle non atteint"))).toBe(true);
    expect(audit.problemes.some((m) => m.includes("POL"))).toBe(true);
  });

  it("un parcours qui honore le quota reste conforme", () => {
    const p = programmeQuota();
    const audit = auditProgramme(p, catalogue(p), REPARTI);
    expect(audit.conforme).toBe(true);
    expect(audit.problemes.some((m) => m.includes("quota de sigle non atteint"))).toBe(false);
  });
});

describe("R2 — ce que le moteur refuse d'affirmer", () => {
  it("un cours retenu sans fiche rend le quota INDÉTERMINÉ, pas violé", () => {
    // Le compte devient un plancher : conclure « il manque des crédits » serait
    // une affirmation que les données ne portent pas. 70 % des cours cités du
    // catalogue n'ont pas de fiche, donc ce cas n'est pas théorique.
    const p = programmeQuota();
    const sansUneFiche = FICHES.filter((f) => f.code !== "POL 2000");
    const faits = new Set<CodeCours>([
      "ECN 1000",
      "ECN 1010",
      "POL 2000",
      "POL 2010",
      "POL 3000",
      "ECN 3000",
    ]);
    const audit = auditProgramme(p, catalogue(p, sansUneFiche), faits);
    expect(audit.problemes.some((m) => m.includes("PLANCHER"))).toBe(true);
    expect(audit.problemes.some((m) => m.includes("quota de sigle non atteint"))).toBe(false);
    // Indéterminé ≠ satisfait : le verdict ne peut pas être affirmé.
    expect(audit.conforme).toBe(false);
  });

  it("une exclusion de sigle ne fait JAMAIS échouer un audit", () => {
    // La page écrit « Sauf exception autorisée ». Transformer cette règle en
    // échec affirmerait plus que la page.
    const p = programmeQuota([]);
    p.blocs.push(
      bloc("71Z", { type: "choix", bornes: { min: 0, max: 3 } }, "Choix - Maximum 3 crédits.", [], true, [
        "Sauf exception autorisée, les cours au choix doivent être choisis parmi les cours identifiés par un sigle autre que les sigles ECN ou POL.",
      ]),
    );
    const faits = new Set<CodeCours>([
      "ECN 1000",
      "ECN 1010",
      "ECN 2000",
      "ECN 2010",
      "ECN 3000",
      "ECN 3010",
    ]);
    const audit = auditProgramme(p, catalogue(p), faits);
    expect(audit.conforme).toBe(true);
    expect(audit.problemes.some((m) => m.includes("71/71Z"))).toBe(true);
  });

  it("l'exclusion est rapportée comme invérifiable, jamais comme satisfaite", () => {
    // Constat mesuré : les 47 blocs du catalogue portant une exclusion ont tous
    // `contenuOuvert: true`, donc le moteur ne leur affecte aucun cours. Un
    // contrôle sur les cours affectés serait vide par construction.
    const resultats = verifierContraintesSigles(
      [
        {
          genre: "exclusion",
          sigles: ["ECN", "POL"],
          portee: "bloc",
          cleBloc: "71/71Z",
          exceptionPossible: true,
          brut: "Sauf exception autorisée…",
        },
      ],
      { attribuesParBloc: new Map(), nonAttribues: [], fiches: new Map() },
    );
    expect(resultats[0].etat).toBe("indeterminee");
  });
});

// ---------------------------------------------------------------------------
// Contre les VRAIES données : la prose synthétique ci-dessus pourrait diverger
// ---------------------------------------------------------------------------

const DIR_PROGRAMMES = join(import.meta.dirname, "..", "..", "data", "programmes");
const lireProgramme = (id: string): Programme =>
  JSON.parse(readFileSync(join(DIR_PROGRAMMES, `${id}.json`), "utf8")) as Programme;
const presente = (id: string) => existsSync(join(DIR_PROGRAMMES, `${id}.json`));

describe.skipIf(!presente("baccalaureat-en-economie-et-politique"))(
  "R2 — sur les pages réelles",
  () => {
    it("lit 33 POL et 33 ECN sur le bacc. en économie et politique", () => {
      const minimums = lireContraintesSigles(
        lireProgramme("baccalaureat-en-economie-et-politique"),
      ).contraintes.filter((c) => c.genre === "minimum");
      expect(minimums.map((c) => (c.genre === "minimum" ? [c.sigles, c.credits] : null))).toEqual([
        [["POL"], 33],
        [["ECN"], 33],
      ]);
    });

    it("lit l'exclusion ECN/POL du bloc au choix 71Z", () => {
      const exclusions = lireContraintesSigles(
        lireProgramme("baccalaureat-en-economie-et-politique"),
      ).contraintes.filter((c) => c.genre === "exclusion");
      expect(exclusions).toHaveLength(1);
      expect(exclusions[0]).toMatchObject({ sigles: ["ECN", "POL"], cleBloc: "71/71Z" });
    });
  },
);

const DIR_COURS = join(import.meta.dirname, "..", "..", "data", "cours");
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

describe.skipIf(
  !presente("baccalaureat-en-economie-et-politique") || !existsSync(join(DIR_COURS, "ECN.json")),
)("R2 — bout en bout sur la vraie page", () => {
  it("un relevé tout en ECN fait ressortir le quota POL dans l'audit", () => {
    // Le câblage compte autant que la lecture : une contrainte lue mais non
    // branchée sur `auditProgramme` ne protège personne.
    const p = lireProgramme("baccalaureat-en-economie-et-politique");
    const faits = new Set<CodeCours>();
    for (const b of p.blocs) for (const code of b.cours) if (code.startsWith("ECN")) faits.add(code);
    expect(faits.size).toBeGreaterThan(0);

    const audit = auditProgramme(p, catalogueTest([p], fichesDe(["ECN", "POL"])), faits);
    const surPOL = audit.problemes.filter((m) => m.includes("quota de sigle") && m.includes("POL"));
    expect(surPOL.length).toBeGreaterThan(0);
    expect(audit.conforme).toBe(false);
  });
});

describe.skipIf(!presente("baccalaureat-en-physique"))("R2 — sur les pages réelles (suite)", () => {
  it("ne retient AUCUN quota du bacc. en physique, et journalise pourquoi", () => {
    // Cinq phrases « au moins 9 crédits PHY de niveau 3000 », toutes des
    // admissibilités aux cycles supérieurs. Les retenir bloquerait le diplôme
    // sur une condition qui ne le conditionne pas.
    const { contraintes, nonLues } = lireContraintesSigles(lireProgramme("baccalaureat-en-physique"));
    expect(contraintes.filter((c) => c.genre === "minimum")).toEqual([]);
    expect(nonLues.length).toBeGreaterThan(0);
    expect(nonLues.every((p) => p.raison.length > 0)).toBe(true);
  });
});
