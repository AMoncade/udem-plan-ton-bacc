/**
 * LE PONT VERS LE MOTEUR — la pièce la plus risquée de ce chantier.
 *
 * `lib/engine` lit encore la forme v1 de `RegleBloc` (`credits`/`min`/`max`)
 * alors que le contrat gelé porte `bornes`. Sans pont, le moteur ne renverrait
 * pas des nombres faux mais des `NaN`, et un `NaN` traverse toute l'UI sans
 * lever d'erreur. Ces tests surveillent donc trois choses, dans cet ordre
 * d'importance :
 *
 *  1. aucun `NaN` ne sort de l'audit, jamais ;
 *  2. `EtatBloc.cleBloc` est rempli, et correctement apparié ;
 *  3. ce que le pont ne peut pas traduire fidèlement ressort dans
 *     `problemes` et interdit `conforme`.
 */
import { describe, expect, it } from "vitest";
import type { Audit, Bloc, Catalogue, Cours, Programme, RegleBloc } from "../../lib/types";
import { cleBloc } from "../../lib/codes";
import { creerDepotDemo } from "../_demo/depot-demo";
import { ID_ACTUARIAT, ID_MAITRISE_DOUBLE } from "../_demo/donnees-demo";
import { assembler } from "./depot";
import { auditProgramme, diagnostiquerCours } from "./moteur";

function bloc(segment: string, id: string, regle: RegleBloc, cours: string[] = []): Bloc {
  return {
    id,
    cle: cleBloc(segment, id),
    segment,
    nom: "",
    regle,
    regleBrut: `règle publiée de ${id}`,
    cours,
    notes: [],
  };
}

function fiche(code: string, credits: number): Cours {
  return {
    code,
    titre: `titre de ${code}`,
    credits,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres: [],
    url: "https://exemple.invalid",
    scrapeISO: "1970-01-01T00:00:00.000Z",
  };
}

function monter(blocs: Bloc[], creditsTotal: number | null = 90) {
  const codes = [...new Set(blocs.flatMap((b) => b.cours))];
  const programme: Programme = {
    id: "p",
    nom: "Programme",
    orientation: null,
    segments: ["01"],
    cycle: null,
    faculte: null,
    typeProgramme: null,
    creditsTotal,
    exigences: null,
    blocs,
    notes: [],
    url: "https://exemple.invalid",
    scrapeISO: "1970-01-01T00:00:00.000Z",
  };
  const catalogue: Catalogue = {
    programmes: [programme],
    cours: Object.fromEntries(codes.map((code) => [code, fiche(code, 3)])),
    prealablesNonParses: [],
    journal: [],
    scrapeISO: "1970-01-01T00:00:00.000Z",
  };
  return { programme, catalogue };
}

/** Tout nombre d'un audit, pour prouver qu'aucun n'est NaN. */
function nombresDe(audit: Audit): number[] {
  return [
    audit.creditsTotal,
    audit.creditsObligatoires,
    audit.creditsOption,
    audit.creditsChoix,
    ...audit.blocs.flatMap((b) => [
      b.creditsAttribues,
      b.creditsManquants,
      b.creditsPerdus,
    ]),
  ];
}

describe("le pont v2 vers le moteur", () => {
  it("ne laisse sortir aucun NaN des règles à bornes", () => {
    const { programme, catalogue } = monter([
      bloc("01", "01A", { type: "obligatoire", bornes: { min: 6, max: 6 } }, [
        "MAT 1000",
        "MAT 1010",
      ]),
      bloc("01", "01B", { type: "option", bornes: { min: 3, max: 9 } }, [
        "STT 1000",
        "STT 1010",
        "STT 1020",
        "STT 1030",
      ]),
      bloc("01", "01Z", { type: "choix", bornes: { min: 3, max: 3 } }),
    ]);
    const audit = auditProgramme(
      programme,
      catalogue,
      new Set(["MAT 1000", "MAT 1010", "STT 1000", "STT 1010"]),
    );
    for (const nombre of nombresDe(audit)) {
      expect(Number.isFinite(nombre), `valeur non finie dans l'audit : ${nombre}`).toBe(
        true,
      );
    }
    expect(audit.creditsObligatoires).toBe(6);
    expect(audit.creditsOption).toBe(6);
  });

  it("remplit cleBloc et l'apparie au bon bloc", () => {
    const { programme, catalogue } = monter([
      bloc("01", "01A", { type: "obligatoire", bornes: { min: 3, max: 3 } }, ["MAT 1000"]),
      bloc("75", "75C", { type: "option", bornes: { min: 3, max: 6 } }, ["ACT 2000"]),
    ]);
    const audit = auditProgramme(programme, catalogue, new Set(["MAT 1000"]));
    expect(audit.blocs.map((b) => b.cleBloc)).toEqual(["01/01A", "75/75C"]);
    // L'appariement n'est pas qu'un étiquetage : le bloc retrouvé par sa clé
    // doit bien être celui qui a reçu le cours.
    const premier = audit.blocs.find((b) => b.cleBloc === "01/01A");
    expect(premier?.coursAttribues).toEqual(["MAT 1000"]);
  });

  it("distingue deux blocs de même id dans le même segment par leur clé", () => {
    const { programme, catalogue } = monter([
      bloc("73", "MM-Bloc 73A", { type: "option", bornes: { min: 3, max: 6 } }, [
        "MAT 6000",
      ]),
      bloc("73", "S-Bloc 73A", { type: "option", bornes: { min: 3, max: 6 } }, [
        "STT 6000",
      ]),
    ]);
    const audit = auditProgramme(programme, catalogue, new Set());
    const cles = audit.blocs.map((b) => b.cleBloc);
    expect(new Set(cles).size).toBe(2);
    expect(cles).toEqual(["73/MM-Bloc 73A", "73/S-Bloc 73A"]);
  });

  it("laisse un bloc `inconnu` interdire la conformité, et le DIT", () => {
    const { programme, catalogue } = monter([
      bloc("01", "01A", { type: "obligatoire", bornes: { min: 3, max: 3 } }, ["MAT 1000"]),
      bloc("01", "01B", { type: "inconnu", brut: "Bloc - voir remarques." }, ["MAT 1010"]),
    ]);
    const audit = auditProgramme(programme, catalogue, new Set(["MAT 1000", "MAT 1010"]));
    expect(audit.conforme).toBe(false);
    expect(audit.problemes.join(" ")).toContain("01B");
    for (const nombre of nombresDe(audit)) expect(Number.isFinite(nombre)).toBe(true);
  });

  it("signale un bloc obligatoire à bornes inégales au lieu d'en choisir une", () => {
    // La forme v1 ne sait écrire qu'UN nombre pour un bloc obligatoire ou au
    // choix. Plutôt que de transmettre le min ou le max en silence, le pont le
    // dit et refuse de déclarer l'audit conforme.
    const { programme, catalogue } = monter([
      bloc("01", "01A", { type: "choix", bornes: { min: 3, max: 6 } }, ["MAT 1000"]),
    ]);
    const audit = auditProgramme(programme, catalogue, new Set(["MAT 1000"]));
    expect(audit.conforme).toBe(false);
    const texte = audit.problemes.join(" ");
    expect(texte).toContain("01A");
    expect(texte).toContain("sans perte");
  });

  it("ne signale RIEN quand toutes les bornes sont exprimables", () => {
    const { programme, catalogue } = monter([
      bloc("01", "01A", { type: "obligatoire", bornes: { min: 3, max: 3 } }, ["MAT 1000"]),
      bloc("01", "01B", { type: "option", bornes: { min: 3, max: 9 } }, ["STT 1000"]),
      bloc("01", "01Z", { type: "choix", bornes: { min: 3, max: 3 } }),
    ]);
    const audit = auditProgramme(programme, catalogue, new Set(["MAT 1000"]));
    expect(audit.problemes.join(" ")).not.toContain("sans perte");
  });

  it("garde visibles les crédits perdus au-delà du plafond d'un bloc", () => {
    // L'information qu'un étudiant ne trouve nulle part ailleurs : au-delà du
    // maximum, un cours réussi ne compte pas vers le diplôme.
    const { programme, catalogue } = monter([
      bloc("75", "75C", { type: "option", bornes: { min: 3, max: 6 } }, [
        "ACT 2000",
        "ACT 2010",
        "ACT 2020",
      ]),
    ]);
    const audit = auditProgramme(
      programme,
      catalogue,
      new Set(["ACT 2000", "ACT 2010", "ACT 2020"]),
    );
    const etat = audit.blocs[0];
    expect(etat.creditsAttribues).toBe(6);
    expect(etat.creditsPerdus).toBe(3);
    expect(etat.creditsAttribues + etat.creditsPerdus).toBe(9);
  });

  it("ne produit pas de NaN quand creditsTotal est null", () => {
    const { programme, catalogue } = monter(
      [bloc("01", "01A", { type: "obligatoire", bornes: { min: 3, max: 3 } }, ["MAT 1000"])],
      null,
    );
    const audit = auditProgramme(programme, catalogue, new Set(["MAT 1000"]));
    for (const nombre of nombresDe(audit)) expect(Number.isFinite(nombre)).toBe(true);
  });
});

describe("le pont sur les programmes de démonstration", () => {
  it("audite l'actuariat sans NaN et retient le piège 18 contre 33", async () => {
    const { catalogue, programme } = await assembler(creerDepotDemo(), ID_ACTUARIAT);
    // Tous les cours obligatoires faits, et le minimum de chaque bloc d'option.
    const faits = new Set(
      programme.blocs
        .filter((b) => b.regle.type === "obligatoire")
        .flatMap((b) => b.cours),
    );
    const audit = auditProgramme(programme, catalogue, faits);
    for (const nombre of nombresDe(audit)) expect(Number.isFinite(nombre)).toBe(true);
    expect(audit.blocs).toHaveLength(programme.blocs.length);
    expect(audit.blocs.every((b) => b.cleBloc !== "" && b.cleBloc !== undefined)).toBe(
      true,
    );
    // Aucun crédit d'option : le programme ne peut pas être conforme.
    expect(audit.conforme).toBe(false);
    expect(audit.problemes.join(" ")).toContain("option");
  });

  it("audite la maîtrise aux blocs homonymes sans confondre les deux", async () => {
    const { catalogue, programme } = await assembler(creerDepotDemo(), ID_MAITRISE_DOUBLE);
    const audit = auditProgramme(programme, catalogue, new Set());
    const cles = audit.blocs.map((b) => b.cleBloc);
    expect(new Set(cles).size).toBe(cles.length);
    for (const nombre of nombresDe(audit)) expect(Number.isFinite(nombre)).toBe(true);
  });
});

describe("diagnostiquerCours passe sans pont", () => {
  it("marque un cours sans fiche « avertissement », jamais verrouillé", async () => {
    const { catalogue, programme } = await assembler(creerDepotDemo(), ID_ACTUARIAT);
    const diagnostics = diagnostiquerCours(catalogue, new Set());
    const sansFiche = programme.blocs
      .flatMap((b) => b.cours)
      .find((code) => catalogue.cours[code] === undefined);
    expect(sansFiche).toBeDefined();
    const etat = diagnostics.get(sansFiche as string);
    expect(etat?.etat).toBe("avertissement");
    expect(etat?.avertissements.join(" ")).toContain("aucune fiche");
  });

  it("n'interprète JAMAIS une restriction d'inscription comme un préalable", async () => {
    const { catalogue } = await assembler(creerDepotDemo(), ID_ACTUARIAT);
    const avecRestriction = Object.values(catalogue.cours).find(
      (c) => c.restrictionsBrut !== null && c.prealables === null && c.prealablesBrut === null,
    );
    expect(
      avecRestriction,
      "aucun cours à restriction seule : ce test n'a plus d'objet",
    ).toBeDefined();
    const diagnostics = diagnostiquerCours(catalogue, new Set());
    const etat = diagnostics.get((avecRestriction as Cours).code);
    // Une restriction ne verrouille pas : le cours est disponible.
    expect(etat?.etat).toBe("disponible");
    expect(etat?.manquants).toEqual([]);
  });
});
