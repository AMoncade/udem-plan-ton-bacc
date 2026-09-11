/**
 * LA COUVERTURE DES FICHES.
 *
 * Ce qui est surveillé ici, c'est surtout ce que la mesure ne doit PAS dire.
 * Trois confusions, chacune produisant une phrase fausse à l'écran :
 *  - un parcours sans cours cité n'est pas un parcours sans fiches ;
 *  - un sujet dont ce parcours ne cite aucune fiche connue n'est pas un sujet
 *    sans fichier — c'est le journal du dépôt qui le sait, pas les codes ;
 *  - un fichier incomplet n'est pas un fichier absent, et c'est le cas le plus
 *    courant.
 */
import { describe, expect, it } from "vitest";
import type { Bloc, Catalogue, Cours, EntreeJournal, Programme } from "../../lib/types";
import type { CatalogueAssemble } from "./depot";
import { couvertureFiches } from "./couverture";

function bloc(cle: string, cours: string[], extra: Partial<Bloc> = {}): Bloc {
  return {
    id: cle,
    cle: `01/${cle}`,
    segment: "01",
    nom: "",
    regle: { type: "obligatoire", bornes: { min: 3, max: 3 } },
    regleBrut: "",
    cours,
    contenuOuvert: false,
    notes: [],
    ...extra,
  };
}

function fiche(code: string): Cours {
  return {
    code,
    titre: `titre de ${code}`,
    credits: 3,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres: [],
    url: "",
    scrapeISO: "2026-01-01T00:00:00.000Z",
  };
}

/** Ce que `assembler()` inscrit quand un sujet ne rend aucune fiche. */
function manque(sujet: string): EntreeJournal {
  return { genre: "manque", sujet, message: `aucune fiche de cours pour le sujet ${sujet}` };
}

function assemble(
  blocs: Bloc[],
  fiches: string[],
  journal: EntreeJournal[] = [],
): CatalogueAssemble {
  const programme: Programme = {
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
  const catalogue: Catalogue = {
    programmes: [programme],
    cours: Object.fromEntries(fiches.map((c) => [c, fiche(c)])),
    prealablesNonParses: [],
    journal,
    scrapeISO: "2026-01-01T00:00:00.000Z",
  };
  return {
    catalogue,
    programme,
    cle: "p",
    parcoursVoisins: [],
    sujets: [],
    codesIllisibles: [],
  };
}

describe("couvertureFiches", () => {
  it("compte les codes DISTINCTS, pas les citations", () => {
    // ACT 1000 est cité par deux blocs : c'est un seul titre manquant à
    // l'écran. Compter les citations ferait dire « 2 cours sans fiche » là où
    // l'étudiant n'en voit qu'un.
    const c = couvertureFiches(
      assemble([bloc("A", ["ACT 1000", "ACT 2000"]), bloc("B", ["ACT 1000"])], ["ACT 2000"]),
    );
    expect(c.cites).toBe(2);
    expect(c.avecFiche).toBe(1);
    expect(c.sansFiche).toBe(1);
    expect(c.niveau).toBe("partielle");
    expect(c.part).toBeCloseTo(0.5);
  });

  it("un parcours sans cours cité est SANS OBJET, pas à zéro", () => {
    // Le piège central. Un bloc au choix et un bloc à contenu ouvert ne citent
    // aucun code ; `part` valant 0 ferait afficher « aucune fiche de cours »
    // pour un parcours dont il n'y a rien à récupérer.
    const c = couvertureFiches(
      assemble(
        [
          bloc("A", [], { regle: { type: "choix", bornes: { min: 0, max: 6 } } }),
          bloc("B", [], { contenuOuvert: true }),
        ],
        [],
      ),
    );
    expect(c.niveau).toBe("sans-objet");
    expect(c.part).toBeNull();
    expect(c.cites).toBe(0);
    expect(c.sujetsSansFichier).toEqual([]);
  });

  it("« aucune » ne se déclare que si des cours sont cités", () => {
    const c = couvertureFiches(
      assemble([bloc("A", ["ARC 1000", "ARC 1001"])], [], [manque("ARC")]),
    );
    expect(c.niveau).toBe("aucune");
    expect(c.part).toBe(0);
    expect(c.sujetsSansFichier).toEqual(["ARC"]);
    expect(c.sansFicheSujetPresent).toBe(0);
  });

  it("un fichier PRÉSENT mais incomplet n'est jamais annoncé comme absent", () => {
    // Le défaut que la session scraper a signalé. `data/cours/DRT.json` porte
    // 160 fiches et n'a pas celles que ce bloc cite : déduire « aucun fichier
    // pour DRT » de « aucun code DRT cité n'a de fiche » écrirait une phrase
    // fausse. Le journal ne dit rien de DRT, donc le fichier a répondu.
    const c = couvertureFiches(
      assemble([bloc("A", ["DRT 1116G", "DRT 1117G"])], [], []),
    );
    expect(c.sujetsSansFichier).toEqual([]);
    expect(c.sansFicheSujetPresent).toBe(2);
    expect(c.niveau).toBe("aucune");
  });

  it("sépare le fichier absent du fichier à trous", () => {
    // ARC n'a pas de fichier (le journal le dit) ; MAT en a un, et il lui
    // manque MAT 1001. Les deux se réparent différemment, donc ils se comptent
    // séparément.
    const c = couvertureFiches(
      assemble(
        [bloc("A", ["MAT 1000", "MAT 1001", "ARC 1000", "ARC 1001"])],
        ["MAT 1000"],
        [manque("ARC")],
      ),
    );
    expect(c.sujetsSansFichier).toEqual(["ARC"]);
    expect(c.sansFiche).toBe(3);
    expect(c.sansFicheSujetPresent).toBe(1);
    expect(c.niveau).toBe("partielle");
  });

  it("ne retient du journal que le genre « manque »", () => {
    // Les autres genres portent la CLÉ DU PARCOURS dans le champ `sujet` :
    // `assembler()` y consigne les codes illisibles sous `sujet: cle`. Les
    // prendre pour des sigles ferait annoncer « aucun fichier pour le sigle
    // baccalaureat-en-droit ».
    const c = couvertureFiches(
      assemble(
        [bloc("A", ["MAT 1000"])],
        ["MAT 1000"],
        [
          manque("ARC"),
          { genre: "inattendu", sujet: "p", message: "2 codes non normalisables" },
          { genre: "info", sujet: "p", message: "rien à signaler" },
        ],
      ),
    );
    expect(c.sujetsSansFichier).toEqual(["ARC"]);
  });

  it("un code illisible n'est imputé à aucun fichier", () => {
    // `sujetDeCode()` refuse « pas un code ». Le compter comme « fichier
    // présent, cours absent » ferait accuser un fichier de données d'un défaut
    // de forme du code, que `assembler()` signale déjà de son côté.
    const c = couvertureFiches(assemble([bloc("A", ["pas un code", "MAT 1000"])], ["MAT 1000"]));
    expect(c.sujetsSansFichier).toEqual([]);
    expect(c.sansFicheSujetPresent).toBe(0);
    expect(c.cites).toBe(2);
    expect(c.avecFiche).toBe(1);
    expect(c.sansFiche).toBe(1);
  });

  it("tout couvert : « complete », et rien à signaler", () => {
    const c = couvertureFiches(
      assemble([bloc("A", ["MAT 1000", "STT 1000"])], ["MAT 1000", "STT 1000"]),
    );
    expect(c.niveau).toBe("complete");
    expect(c.part).toBe(1);
    expect(c.sansFiche).toBe(0);
    expect(c.sujetsSansFichier).toEqual([]);
    expect(c.sansFicheSujetPresent).toBe(0);
  });
});
