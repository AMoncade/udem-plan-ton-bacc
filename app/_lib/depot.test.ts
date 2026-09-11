/**
 * L'ASSEMBLAGE À LA DEMANDE.
 *
 * C'est la pièce qui survivra au débranchement de la démonstration : le dépôt
 * change, `assembler()` ne change pas. Ce qu'on surveille ici :
 *  - on ne charge QUE les sujets dont le programme a besoin ;
 *  - les préalables qui franchissent les sujets sont suivis de proche en proche ;
 *  - les codes sont normalisés à l'entrée, et les illisibles ressortent ;
 *  - ce qui manque est consigné au journal, jamais avalé.
 */
import { describe, expect, it, vi } from "vitest";
import { sujetDeCode } from "../../lib/codes";
import type { Cours } from "../../lib/types";
import { creerDepotDemo } from "../_demo/depot-demo";
import {
  ID_ACTUARIAT,
  ID_DROIT_INTERVALLE,
  ID_MAITRISE_DOUBLE,
} from "../_demo/donnees-demo";
import { assembler, sujetsDesBlocs, sujetsDesPrealables, type Depot } from "./depot";

describe("sujetsDesBlocs", () => {
  it("tire les sujets des codes cités, sans doublon et triés", () => {
    expect(
      sujetsDesBlocs([
        {
          id: "A",
          cle: "01/A",
          segment: "01",
          nom: "",
          regle: { type: "obligatoire", bornes: { min: 3, max: 3 } },
          regleBrut: "",
          cours: ["STT 1000", "ACT 1000", "act-2250", "ACT2251"],
          notes: [],
        },
      ]),
    ).toEqual(["ACT", "STT"]);
  });

  it("ignore un code illisible sans jeter", () => {
    expect(
      sujetsDesBlocs([
        {
          id: "A",
          cle: "01/A",
          segment: "01",
          nom: "",
          regle: { type: "choix", bornes: { min: 3, max: 3 } },
          regleBrut: "",
          cours: ["pas un code", "MAT 1000"],
          notes: [],
        },
      ]),
    ).toEqual(["MAT"]);
  });
});

describe("sujetsDesPrealables", () => {
  const base: Omit<Cours, "prealables" | "concomitantsBrut" | "restrictionsBrut"> = {
    code: "ACT 2250",
    titre: "t",
    credits: 3,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    trimestres: [],
    url: "https://exemple.invalid",
    scrapeISO: "1970-01-01T00:00:00.000Z",
  };

  it("suit les codes de l'arbre de préalables", () => {
    expect(
      sujetsDesPrealables([
        {
          ...base,
          prealables: {
            genre: "et",
            enfants: [
              { genre: "cours", code: "MAT 1720" },
              { genre: "ou", enfants: [{ genre: "cours", code: "STT 1682" }] },
              { genre: "opaque", texte: "autorisation du département" },
            ],
          },
          concomitantsBrut: null,
          restrictionsBrut: null,
        },
      ]),
    ).toEqual(["MAT", "STT"]);
  });

  it("tire aussi des sujets des concomitants et des restrictions", () => {
    // Pour savoir quel FICHIER charger, pas pour les traiter en préalables :
    // une restriction d'inscription n'est ni l'un ni l'autre.
    expect(
      sujetsDesPrealables([
        {
          ...base,
          prealables: null,
          concomitantsBrut: "IFT1015",
          restrictionsBrut: "Restrictions d'inscription: DMO1000/DMO1010",
        },
      ]),
    ).toEqual(["DMO", "IFT"]);
  });
});

describe("assembler", () => {
  it("ne charge que les sujets utiles, et les compte", async () => {
    const depot = creerDepotDemo();
    const espion = vi.spyOn(depot, "chargerSujet");
    const { catalogue, programme, sujets } = await assembler(depot, ID_ACTUARIAT);

    expect(programme.id).toBe(ID_ACTUARIAT);
    expect(catalogue.programmes).toHaveLength(1);
    expect(sujets.length).toBeGreaterThan(0);

    // Le point de l'exercice : on ne charge pas tous les sujets du catalogue.
    const tousLesSujets = (await depot.chargerIndex()).sujets;
    expect(sujets.length).toBeLessThan(tousLesSujets.length);

    // Aucun sujet n'est chargé deux fois.
    const demandes = espion.mock.calls.map((appel) => appel[0]);
    expect(new Set(demandes).size).toBe(demandes.length);

    // Toute fiche chargée appartient à un sujet demandé.
    for (const code of Object.keys(catalogue.cours)) {
      expect(sujets).toContain(sujetDeCode(code));
    }
  });

  it("suit les préalables d'un sujet à l'autre", async () => {
    const depot = creerDepotDemo();
    const { programme, sujets } = await assembler(depot, ID_ACTUARIAT);
    const citesParLesBlocs = sujetsDesBlocs(programme.blocs);
    // Les blocs de l'actuariat citent ACT, MAT, STT, IFT, ECN ; leurs
    // préalables en amènent d'autres. Si l'expansion ne se faisait pas, les
    // deux listes seraient identiques.
    expect(sujets.length).toBeGreaterThanOrEqual(citesParLesBlocs.length);
    expect(sujets).toEqual(expect.arrayContaining(citesParLesBlocs));
  });

  it("normalise les codes et conserve les illisibles", async () => {
    const fiches: Cours[] = [
      {
        code: "act-2250",
        titre: "Mathématiques actuarielles",
        credits: 3,
        cycle: "1er cycle",
        faculte: null,
        description: "",
        prealablesBrut: "ACT1240",
        prealables: { genre: "cours", code: "ACT1240" },
        concomitantsBrut: null,
        restrictionsBrut: null,
        trimestres: [],
        url: "https://exemple.invalid",
        scrapeISO: "1970-01-01T00:00:00.000Z",
      },
    ];
    const depot: Depot = {
      origine: "test",
      estFactice: true,
      async chargerIndex() {
        return { programmes: [], sujets: ["ACT"], scrapeISO: "x" };
      },
      async chargerProgramme() {
        return {
          id: "p",
          nom: "P",
          orientation: null,
          segments: ["01"],
          cycle: null,
          faculte: null,
          typeProgramme: null,
          creditsTotal: 90,
          exigences: null,
          blocs: [
            {
              id: "01A",
              cle: "01/01A",
              segment: "01",
              nom: "",
              regle: { type: "obligatoire", bornes: { min: 3, max: 3 } },
              regleBrut: "",
              // Trois écritures du MÊME cours, plus un code impossible.
              cours: ["ACT 2250", "ACT2250", "act-2250", "pas-un-code"],
              notes: [],
            },
          ],
          notes: [],
          url: "https://exemple.invalid",
          scrapeISO: "1970-01-01T00:00:00.000Z",
        };
      },
      async chargerSujet(sujet) {
        return sujet === "ACT" ? fiches : [];
      },
    };

    const { catalogue, programme, codesIllisibles } = await assembler(depot, "p");

    // Les trois écritures se réduisent à une, sinon le bloc compterait trois
    // fois le même cours. Le code impossible est conservé verbatim.
    expect(programme.blocs[0].cours).toEqual(["ACT 2250", "pas-un-code"]);
    expect(codesIllisibles).toEqual(["pas-un-code"]);
    expect(Object.keys(catalogue.cours)).toEqual(["ACT 2250"]);
    // Le préalable « ACT1240 » est normalisé lui aussi, sinon le graphe
    // s'afficherait sans arête et rien ne le signalerait.
    expect(catalogue.cours["ACT 2250"].prealables).toEqual({
      genre: "cours",
      code: "ACT 1240",
    });
    // Et l'illisible ressort au journal, pas seulement dans un tableau.
    expect(catalogue.journal.some((e) => e.message.includes("pas-un-code"))).toBe(true);
  });

  it("consigne au journal un sujet sans aucune fiche", async () => {
    const depot = creerDepotDemo();
    // Le bloc 75Y de l'actuariat cite des cours de niveau 7000, qui n'ont
    // jamais de fiche : c'est le cas « cité par un bloc, sans fiche ».
    const { catalogue } = await assembler(depot, ID_ACTUARIAT);
    const cites = catalogue.programmes[0].blocs.flatMap((b) => b.cours);
    const sansFiche = cites.filter((code) => catalogue.cours[code] === undefined);
    expect(sansFiche.length).toBeGreaterThan(0);
  });

  it("recalcule les lignes de préalables non réduites sur les fiches chargées", async () => {
    const { catalogue } = await assembler(creerDepotDemo(), ID_ACTUARIAT);
    // Le jeu de démonstration en contient exprès (« avoir réussi 30 crédits »).
    expect(catalogue.prealablesNonParses.length).toBeGreaterThan(0);
    for (const ligne of catalogue.prealablesNonParses) {
      expect(catalogue.cours[ligne.code].prealables).toBeNull();
      expect(ligne.brut.trim()).not.toBe("");
    }
  });

  it("rejette un identifiant inconnu plutôt que de rendre un programme vide", async () => {
    await expect(assembler(creerDepotDemo(), "demo-nexiste-pas")).rejects.toThrow(
      /identifiant/,
    );
  });

  it("rejette une fiche sans structure exploitable, en disant laquelle", async () => {
    const depot = creerDepotDemo();
    const index = await depot.chargerIndex();
    const horsStructure = index.programmes.find((f) => !f.structureLue);
    expect(horsStructure).toBeDefined();
    await expect(assembler(depot, (horsStructure as { id: string }).id)).rejects.toThrow(
      /structure/,
    );
  });

  it("fait sommer les fiches à la règle de chaque bloc OBLIGATOIRE", async () => {
    // Le test de couture le plus utile du projet, appliqué au jeu de
    // démonstration : deux informations produites indépendamment — la règle du
    // bloc et les crédits des fiches — doivent concorder. Sans ça l'audit
    // affiche des crédits manquants ou perdus sur un bloc obligatoire, ce qui
    // se lit comme un bogue de l'audit alors que c'est la donnée qui est fausse.
    for (const id of [ID_ACTUARIAT, ID_DROIT_INTERVALLE, ID_MAITRISE_DOUBLE]) {
      const { catalogue, programme } = await assembler(creerDepotDemo(), id);
      for (const bloc of programme.blocs) {
        if (bloc.regle.type !== "obligatoire") continue;
        const somme = bloc.cours.reduce(
          (total, code) => total + (catalogue.cours[code]?.credits ?? 0),
          0,
        );
        expect(
          somme,
          `${id} — bloc ${bloc.id} : ses fiches somment à ${somme}, sa règle dit ${bloc.regle.bornes.min}`,
        ).toBe(bloc.regle.bornes.min);
      }
    }
  });

  it("assemble aussi les deux programmes difficiles du contrat", async () => {
    const depot = creerDepotDemo();

    const maitrise = await assembler(depot, ID_MAITRISE_DOUBLE);
    const ids = maitrise.programme.blocs.map((b) => b.id);
    const cles = maitrise.programme.blocs.map((b) => b.cle);
    // Deux blocs de même id dans le même segment : les id se répètent, les
    // clés non. C'est exactement ce que `Bloc.cle` existe pour garantir.
    expect(ids.filter((id) => id.endsWith("73A"))).toHaveLength(2);
    expect(new Set(cles).size).toBe(cles.length);

    const droit = await assembler(depot, ID_DROIT_INTERVALLE);
    expect(droit.programme.exigences?.option).toEqual({ min: 30, max: 33 });
  });
});
