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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Cours, Programme } from "../../lib/types";
import { cleParcours } from "../../lib/parcours";
import { normaliserCode } from "../../lib/codes";
import { codesSurDisque, empreinteExtracteur, fichesDeProgramme, grouperParSujet } from "./disposition";

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

describe("codesSurDisque", () => {
  // Celle-ci LIT le disque, alors qu'en tête de fichier on s'interdit d'y
  // écrire. D'où le paramètre `dossier` : le test travaille dans un dossier
  // temporaire, jamais sur `data/cours/` que la passe remplit pour de vrai.
  // Un test qui lirait `data/` réel ne réfuterait rien — son résultat
  // changerait à chaque scrape, et il passerait aussi bien avec un filtre cassé.
  async function dossierTemporaire(fichiers: Record<string, unknown>): Promise<string> {
    const d = await mkdtemp(path.join(tmpdir(), "cours-sur-disque-"));
    for (const [nom, valeur] of Object.entries(fichiers)) {
      await writeFile(path.join(d, nom), JSON.stringify(valeur, null, 2), "utf8");
    }
    return d;
  }

  it("rend les codes de tous les fichiers de sujet", async () => {
    const d = await dossierTemporaire({
      "ACT.json": { "ACT 1240": {}, "ACT 2250": {} },
      "MAT.json": { "MAT 1000": {} },
    });
    try {
      expect([...(await codesSurDisque(d))].sort()).toEqual(["ACT 1240", "ACT 2250", "MAT 1000"]);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("écarte les clés de commentaire d'un fichier écrit par une version antérieure", async () => {
    // Le contrat dit que toutes les clés de `data/cours/<SUJET>.json` sont des
    // codes. Un `_avertissement` laissé par une ancienne version deviendrait
    // sinon un « cours déjà en fiche » nommé `_avertissement`, ce qui n'empêche
    // rien de marcher — et c'est bien le problème : personne ne le verrait.
    const d = await dossierTemporaire({
      "ACT.json": { _avertissement: "Fichier GÉNÉRÉ…", "ACT 1240": {} },
    });
    try {
      expect([...(await codesSurDisque(d))]).toEqual(["ACT 1240"]);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("ignore un fichier illisible au lieu de faire sauter la passe", async () => {
    // Le pire cas admissible est de REDEMANDER un cours, jamais d'en escamoter
    // un : un sujet corrompu doit donc rendre ses codes « absents », et laisser
    // les autres sujets intacts.
    const d = await dossierTemporaire({ "MAT.json": { "MAT 1000": {} } });
    await writeFile(path.join(d, "ACT.json"), "{ ceci n'est pas du JSON", "utf8");
    try {
      expect([...(await codesSurDisque(d))]).toEqual(["MAT 1000"]);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("rend un ensemble vide quand le dossier n'existe pas", async () => {
    // Premier scrape d'une machine neuve : `data/cours/` n'existe pas encore.
    // `--reprendre` doit alors ne rien sauter, pas planter.
    expect((await codesSurDisque(path.join(tmpdir(), "cours-absent-xyz"))).size).toBe(0);
  });

  it("les codes rendus se comparent à l'identique à ceux que le scrape demande", async () => {
    // LA couture qui compte : la reprise soustrait les codes du disque de ceux
    // que la passe veut demander. Les deux côtés doivent être dans la MÊME
    // forme, sinon la soustraction ne retire rien et la tranche suivante
    // refait la précédente — sans erreur visible, juste une passe qui n'avance
    // plus. `ecrireCours` range par `sujetDeCode`, donc les clés écrites sont
    // déjà canoniques : on vérifie qu'un aller-retour les préserve.
    const { parSujet } = grouperParSujet([cours("ACT 2250"), cours("DRT 1151G"), cours("PSY 40001")]);
    const fichiers: Record<string, unknown> = {};
    for (const [sujet, fiches] of parSujet) fichiers[`${sujet}.json`] = fiches;
    const d = await dossierTemporaire(fichiers);
    try {
      const relus = await codesSurDisque(d);
      for (const code of ["ACT 2250", "DRT 1151G", "PSY 40001"]) {
        expect(relus.has(code), `${code} doit être reconnu comme déjà en fiche`).toBe(true);
        expect(normaliserCode(code)).toBe(code);
      }
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
});

describe("empreinteExtracteur", () => {
  // Ce test existe pour UNE raison : la formule est écrite DEUX FOIS, ici par
  // le scraper et dans tests/coutures.test.ts par la suite de coutures. Deux
  // implémentations d'une même formule qui divergent produiraient un désaccord
  // permanent — l'index dirait une empreinte, le test en recalculerait une
  // autre, et comme le message parle de « données en retard » on relancerait le
  // scrape indéfiniment sans jamais rattraper. La référence ci-dessous est
  // réécrite exprès à partir de la spec, sans appeler le code testé.
  function reference(dossier: string): string {
    const h = createHash("sha256");
    for (const f of readdirSync(dossier).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts")).sort()) {
      h.update(f);
      h.update(readFileSync(path.join(dossier, f), "utf8").replace(/\r\n/g, "\n"));
    }
    return h.digest("hex");
  }

  it("donne le même résultat que la formule de référence", async () => {
    const dossier = path.join(import.meta.dirname);
    expect(await empreinteExtracteur()).toBe(reference(dossier));
  });

  it("est stable d'un appel à l'autre", async () => {
    // Une empreinte qui bouge sans que le code bouge condamnerait toutes les
    // données à passer pour périmées en permanence.
    expect(await empreinteExtracteur()).toBe(await empreinteExtracteur());
  });

  it("a la forme d'un SHA-256", async () => {
    expect(await empreinteExtracteur()).toMatch(/^[0-9a-f]{64}$/);
  });
});
