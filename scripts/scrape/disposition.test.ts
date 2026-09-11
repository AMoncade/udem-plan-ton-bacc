/**
 * La disposition sur disque : fiches d'index, découpage par sujet, fusion.
 *
 * Les fonctions PURES sont testées ici. Les écritures de fichiers ne le sont
 * pas : elles viseraient `data/`, que le scrape d'échantillon remplit pour de
 * vrai, et un test qui y écrit effacerait ce que la passe vient de produire.
 * La règle métier qui compte — fusionner au lieu d'écraser — est en revanche
 * vérifiée sur la fonction qui la porte.
 */
import { describe, it, expect } from "vitest";
import type { Cours, Programme } from "../../lib/types";
import { cleParcours } from "../../lib/parcours";
import { fichesDeProgramme, grouperParSujet } from "./disposition";

function cours(code: string): Cours {
  return {
    code,
    titre: `Titre de ${code}`,
    credits: 3,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres: [],
    url: `https://admission.umontreal.ca/cours-et-horaires/cours/x/`,
    scrapeISO: "2026-09-11T11:05:32.006Z",
  };
}

function bloc(cle: string, segment: string, id: string, cours: string[]) {
  return {
    id,
    cle,
    segment,
    nom: `Bloc ${id}`,
    regle: { type: "option" as const, bornes: { min: 10, max: 16 } },
    regleBrut: "Option - Minimum 10 crédits, maximum 16 crédits.",
    cours,
    contenuOuvert: false,
    notes: [],
  };
}

const PROGRAMME: Programme = {
  id: "maitrise-en-mathematiques",
  nom: "Maîtrise en mathématiques",
  orientation: null,
  segments: ["70", "73"],
  orientations: [],
  cycle: "Cycles supérieurs",
  faculte: "Faculté des arts et des sciences",
  typeProgramme: "Maîtrise",
  creditsTotal: 45,
  exigences: null,
  blocs: [bloc("73/MM-73A", "73", "MM-73A", ["ACT 6230"])],
  notes: ["Segment 73 — …"],
  url: "https://admission.umontreal.ca/programmes/maitrise-en-mathematiques/structure-du-programme/",
  scrapeISO: "2026-09-11T11:05:32.006Z",
};

describe("fichesDeProgramme", () => {
  it("ne garde que ce dont le sélecteur a besoin, sans les blocs", () => {
    // `data/index-programmes.json` porte une fiche par PARCOURS et doit rester
    // petit : l'app embarque tout le catalogue, donc on ne charge jamais 12 Mo
    // pour afficher une liste.
    const fiches = fichesDeProgramme(PROGRAMME, true);
    expect(fiches).toEqual([
      {
        cle: "maitrise-en-mathematiques",
        id: "maitrise-en-mathematiques",
        nom: "Maîtrise en mathématiques",
        orientation: null,
        cycle: "Cycles supérieurs",
        faculte: "Faculté des arts et des sciences",
        typeProgramme: "Maîtrise",
        creditsTotal: 45,
        nbBlocs: 1,
        structureLue: true,
      },
    ]);
    expect(Object.keys(fiches[0])).not.toContain("blocs");
    expect(Object.keys(fiches[0])).not.toContain("notes");
  });

  it("rend UNE fiche PAR PARCOURS quand la page en déclare plusieurs", () => {
    // Ce que le sélecteur propose n'est pas une page mais un parcours suivable :
    // « ouvrir le bacc. en mathématiques » n'a pas de sens, ses sept orientations
    // sont des alternatives dont les blocs ne s'additionnent pas.
    const aOrientations: Programme = {
      ...PROGRAMME,
      orientations: [
        { nom: "Mathématiques pures", segments: ["70"], exigences: null },
        { nom: "Actuariat", segments: ["73"], exigences: null },
      ],
      blocs: [
        bloc("70/70A", "70", "70A", ["MAT 6001"]),
        bloc("70/70B", "70", "70B", ["MAT 6002"]),
        bloc("73/MM-73A", "73", "MM-73A", ["ACT 6230"]),
      ],
    };
    const fiches = fichesDeProgramme(aOrientations, true);
    expect(fiches.map((f) => f.cle)).toEqual([
      cleParcours("maitrise-en-mathematiques", "Mathématiques pures"),
      cleParcours("maitrise-en-mathematiques", "Actuariat"),
    ]);
    // Toutes gardent le même `id` : c'est le nom du fichier de programme.
    expect(new Set(fiches.map((f) => f.id)).size).toBe(1);
    // `nbBlocs` est celui DU PARCOURS, pas de la page : c'est ce que le
    // sélecteur annonce et ce que l'étudiant ouvrira.
    expect(fiches.map((f) => f.nbBlocs)).toEqual([2, 1]);
    expect(fiches.map((f) => f.orientation)).toEqual(["Mathématiques pures", "Actuariat"]);
  });

  it("reporte `structureLue: false` tel qu'on le lui passe", () => {
    expect(fichesDeProgramme({ ...PROGRAMME, blocs: [] }, false)[0]).toMatchObject({
      nbBlocs: 0,
      structureLue: false,
    });
  });
});

describe("grouperParSujet", () => {
  it("découpe par les trois lettres du code, via sujetDeCode", () => {
    const { parSujet, sansSujet } = grouperParSujet([
      cours("ACT 2250"),
      cours("MAT 1000"),
      cours("ACT 1240"),
    ]);
    expect([...parSujet.keys()].sort()).toEqual(["ACT", "MAT"]);
    expect(Object.keys(parSujet.get("ACT") ?? {})).toEqual(["ACT 2250", "ACT 1240"]);
    expect(sansSujet).toEqual([]);
  });

  it("range un code suffixé et un code à cinq chiffres sous leur sujet", () => {
    // `DRT 1151G` et `PSY 40001` sont des codes valides du contrat v2, et
    // `CRI 1600G` est une fiche DISTINCTE de `CRI 1600` : les deux doivent
    // coexister dans le même fichier de sujet.
    const { parSujet } = grouperParSujet([
      cours("DRT 1151G"),
      cours("PSY 40001"),
      cours("CRI 1600"),
      cours("CRI 1600G"),
    ]);
    expect([...parSujet.keys()].sort()).toEqual(["CRI", "DRT", "PSY"]);
    expect(Object.keys(parSujet.get("CRI") ?? {}).sort()).toEqual(["CRI 1600", "CRI 1600G"]);
  });

  it("signale un code sans sujet au lieu de le ranger ailleurs", () => {
    // Un code non canonique n'a nulle part où aller ; le taire le ferait
    // disparaître du catalogue sans laisser de trace.
    const { parSujet, sansSujet } = grouperParSujet([cours("pas un code"), cours("ACT 2250")]);
    expect(sansSujet).toEqual(["pas un code"]);
    expect([...parSujet.keys()]).toEqual(["ACT"]);
  });

  it("la dernière fiche d'un même code gagne, sans perdre les autres codes", () => {
    const ancien = { ...cours("ACT 2250"), titre: "ancien" };
    const neuf = { ...cours("ACT 2250"), titre: "neuf" };
    const { parSujet } = grouperParSujet([ancien, neuf, cours("ACT 1240")]);
    expect(parSujet.get("ACT")?.["ACT 2250"].titre).toBe("neuf");
    expect(Object.keys(parSujet.get("ACT") ?? {})).toHaveLength(2);
  });
});
