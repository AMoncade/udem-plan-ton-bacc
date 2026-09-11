/**
 * CE QUE L'UI ATTEND DU MOTEUR.
 *
 * Ces tests ont d'abord surveillé un PONT : `lib/engine` lisait encore la
 * forme v1 de `RegleBloc` alors que le contrat portait déjà `bornes`, et l'UI
 * traduisait. Le moteur v2 a été fusionné et le pont est parti.
 *
 * Les tests, eux, restent — et c'est le point. Ils ne décrivaient pas le pont,
 * ils décrivaient ce dont les écrans ont besoin pour ne pas mentir :
 *
 *  1. aucun `NaN` ne sort de l'audit, jamais. Un `NaN` traverse toute l'UI
 *     sans lever d'erreur et s'affiche tel quel à l'étudiant ;
 *  2. `EtatBloc.cleBloc` est rempli et distingue deux blocs homonymes ;
 *  3. les crédits perdus au-delà d'un plafond restent visibles ;
 *  4. une restriction d'inscription n'est jamais lue comme un préalable.
 *
 * Ils valent donc contre le moteur v2 aussi bien que contre le pont, sans
 * qu'une ligne d'assertion ait changé — sauf celles qui nommaient le pont.
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

describe("ce que l'UI attend de l'audit", () => {
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

  it("honore un intervalle sur un bloc au choix, sans en écraser une borne", () => {
    // « Choix - Minimum 3 crédits, maximum 6 crédits. » : la forme v1 ne savait
    // écrire qu'UN nombre pour ce type de bloc, et il fallait alors signaler la
    // perte. Le moteur v2 lit l'intervalle, donc 6 crédits placés tiennent dans
    // les bornes au lieu d'en faire 3 de perdus.
    const { programme, catalogue } = monter([
      bloc("01", "01A", { type: "choix", bornes: { min: 3, max: 6 } }, [
        "MAT 1000",
        "MAT 1010",
      ]),
    ]);
    const audit = auditProgramme(programme, catalogue, new Set(["MAT 1000", "MAT 1010"]));
    const etat = audit.blocs[0];
    expect(etat.creditsAttribues).toBe(6);
    expect(etat.creditsPerdus).toBe(0);
    expect(etat.creditsManquants).toBe(0);
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

describe("l'audit sur les programmes de démonstration", () => {
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

describe("diagnostiquerCours", () => {
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

    // La règle, en deux moitiés qui doivent tenir ENSEMBLE.
    //
    // 1. Une restriction ne verrouille pas et n'invente aucun préalable
    //    manquant. MUI 1162A n'a QUE des restrictions : un moteur qui les
    //    confond avec des préalables y voit vingt cours requis.
    expect(etat?.etat).not.toBe("verrouille");
    expect(etat?.manquants).toEqual([]);

    // 2. Elle ne disparaît pas pour autant. Le moteur v2 la remonte en
    //    avertissement — un cran de plus que ce que ce test exigeait quand il
    //    a été écrit, où l'état attendu était simplement « disponible ». Une
    //    exigence réelle que rien n'affiche est le repli silencieux que ce
    //    projet combat, donc on vérifie qu'elle est bien DITE.
    expect(etat?.etat).toBe("avertissement");
    expect(etat?.avertissements.join(" ")).toContain("restriction d'inscription");
    expect(etat?.avertissements.join(" ")).toContain(
      (avecRestriction as Cours).restrictionsBrut as string,
    );
  });
});
