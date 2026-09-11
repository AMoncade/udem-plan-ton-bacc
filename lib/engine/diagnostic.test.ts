import { describe, it, expect } from "vitest";
import { diagnostiquerCours, evaluerPrealables } from "./index";
import type { Catalogue, Cours, NoeudPrealable } from "../types";
import fixtureBrute from "../../data/fixtures/actuariat-verifie.fixture.json";
import { adapterCatalogue, catalogueTest, ficheTest } from "./donnees-test";

/** La fixture est écrite dans le contrat v1 et appartient à une autre session :
 *  elle est TRADUITE, pas éditée. Voir ./donnees-test.ts. */
const fixture: Catalogue = adapterCatalogue(fixtureBrute);

function fiche(code: string, extra: Partial<Cours> = {}): Cours {
  return ficheTest(code, 3, extra);
}

function catalogueDe(cours: Cours[]): Catalogue {
  return catalogueTest([], cours);
}

const ET_2250: NoeudPrealable = {
  genre: "et",
  enfants: [
    { genre: "cours", code: "ACT 1240" },
    { genre: "cours", code: "MAT 1720" },
  ],
};

describe("diagnostiquerCours — sur la fixture réelle (3 fiches, 55 codes de blocs)", () => {
  it("couvre tous les codes cités par les blocs, pas seulement les 3 fiches", () => {
    // Sinon l'UI a `undefined` sur 52 cases de blocs à afficher.
    const d = diagnostiquerCours(fixture, new Set());
    expect(d.size).toBe(55);
    expect(d.has("MAT 1000")).toBe(true); // cité par 01A, aucune fiche
    expect(d.has("ACT 2250")).toBe(true); // la seule fiche avec des préalables
  });

  it("verrouille ACT 2250 sans ses préalables, et ne plante pas bien qu'ACT 1240 et MAT 1720 n'aient aucune fiche", () => {
    const d = diagnostiquerCours(fixture, new Set());
    expect(d.get("ACT 2250")).toEqual({
      code: "ACT 2250",
      etat: "verrouille",
      manquants: ["ACT 1240", "MAT 1720"],
      avertissements: [],
    });
  });

  it("ouvre ACT 2250 quand les deux préalables sont faits", () => {
    const d = diagnostiquerCours(fixture, new Set(["ACT 1240", "MAT 1720"]));
    expect(d.get("ACT 2250")?.etat).toBe("disponible");
    expect(d.get("ACT 2250")?.manquants).toEqual([]);
  });

  it("ne laisse qu'un manquant quand un seul préalable est fait", () => {
    const d = diagnostiquerCours(fixture, new Set(["ACT 1240"]));
    expect(d.get("ACT 2250")?.etat).toBe("verrouille");
    expect(d.get("ACT 2250")?.manquants).toEqual(["MAT 1720"]);
  });

  it("déclare disponible un cours dont la page n'a PAS de champ Préalables (IFT 1015)", () => {
    // prealablesBrut: null est une affirmation forte, pas un bouche-trou.
    const d = diagnostiquerCours(fixture, new Set());
    expect(d.get("IFT 1015")?.etat).toBe("disponible");
  });

  it("met en avertissement, jamais en verrouillé, un code de bloc sans fiche", () => {
    const d = diagnostiquerCours(fixture, new Set());
    const mat1000 = d.get("MAT 1000");
    expect(mat1000?.etat).toBe("avertissement");
    expect(mat1000?.manquants).toEqual([]);
    expect(mat1000?.avertissements.join(" ")).toMatch(/aucune fiche de cours/);
  });

  it("normalise les codes faits (« act2250 » vaut « ACT 2250 »)", () => {
    const d = diagnostiquerCours(fixture, new Set(["act2250", "mat-1720"]));
    expect(d.get("ACT 2250")?.etat).toBe("fait");
    expect(d.get("MAT 1720")?.etat).toBe("fait");
  });

  it("ne mute ni le catalogue ni l'ensemble des cours faits", () => {
    const faits = new Set(["ACT 1240"]);
    const avant = JSON.stringify(fixture);
    diagnostiquerCours(fixture, faits);
    expect(JSON.stringify(fixture)).toBe(avant);
    expect([...faits]).toEqual(["ACT 1240"]);
  });
});

describe("diagnostiquerCours — un noeud opaque ne verrouille jamais", () => {
  it("donne l'état avertissement et fait ressortir le texte", () => {
    const cat = catalogueDe([
      fiche("ACT 4000", {
        prealablesBrut: "autorisation du département",
        prealables: { genre: "opaque", texte: "autorisation du département" },
      }),
    ]);
    expect(diagnostiquerCours(cat, new Set()).get("ACT 4000")).toEqual({
      code: "ACT 4000",
      etat: "avertissement",
      manquants: [],
      avertissements: ["autorisation du département"],
    });
  });

  it("fait ressortir le texte opaque MÊME quand le cours est verrouillé par ailleurs", () => {
    const cat = catalogueDe([
      fiche("ACT 4000", {
        prealablesBrut: "ACT1240 ET autorisation du département",
        prealables: {
          genre: "et",
          enfants: [
            { genre: "cours", code: "ACT 1240" },
            { genre: "opaque", texte: "autorisation du département" },
          ],
        },
      }),
    ]);
    const d = diagnostiquerCours(cat, new Set()).get("ACT 4000");
    expect(d?.etat).toBe("verrouille");
    expect(d?.manquants).toEqual(["ACT 1240"]);
    expect(d?.avertissements).toEqual(["autorisation du département"]);
  });

  it("signale une ligne de préalables non analysée au lieu de la lire comme « aucun préalable »", () => {
    const cat = catalogueDe([
      fiche("ACT 4000", { prealablesBrut: "ACT1240, MAT1720", prealables: null }),
    ]);
    const d = diagnostiquerCours(cat, new Set()).get("ACT 4000");
    expect(d?.etat).toBe("avertissement");
    expect(d?.avertissements.join(" ")).toMatch(/préalables non analysés.*ACT1240, MAT1720/);
  });

  it("signale des concomitants non analysés plutôt que de les laisser tomber", () => {
    const cat = catalogueDe([fiche("ACT 4000", { concomitantsBrut: "MAT 1720" })]);
    const d = diagnostiquerCours(cat, new Set()).get("ACT 4000");
    expect(d?.etat).toBe("avertissement");
    expect(d?.avertissements.join(" ")).toMatch(/concomitants non analysés.*MAT 1720/);
  });
});

describe("diagnostiquerCours — restrictions d'inscription (champ nouveau du contrat v2)", () => {
  it("une restriction n'est NI un préalable NI un concomitant : jamais évaluée, toujours signalée", () => {
    // Donnée RÉELLE piégée hors contrat en v1 : la fiche de DMO 1000 publie
    // « Restrictions d'inscription: DMO1000/DMO1010 », c'est-à-dire que les deux
    // cours s'excluent — pas que DMO 1000 est son propre préalable. En v1 ce
    // texte voyageait dans la clé `_journal` non typée et rien ne l'affichait.
    const cat = catalogueDe([fiche("DMO 1000", { restrictionsBrut: "DMO1000/DMO1010" })]);
    const d = diagnostiquerCours(cat, new Set()).get("DMO 1000");
    expect(d?.etat).toBe("avertissement");
    expect(d?.manquants).toEqual([]); // surtout PAS « il manque DMO 1000 »
    expect(d?.avertissements.join(" ")).toMatch(
      /restriction d'inscription non évaluée \(ce n'est ni un préalable ni un concomitant\).*DMO1000\/DMO1010/,
    );
  });

  it("un cours qui n'a QUE des restrictions n'est pas verrouillé pour autant", () => {
    // MUI 1162A n'a aucune ligne de préalables, seulement des restrictions : un
    // parseur qui les confondrait y verrait vingt cours requis et verrouillerait.
    const cat = catalogueDe([
      fiche("MUI 1162A", {
        prealablesBrut: null,
        prealables: null,
        restrictionsBrut: "MUI1111A/MUI1112A/MUI1113A/MUI1114A",
      }),
    ]);
    const d = diagnostiquerCours(cat, new Set()).get("MUI 1162A");
    expect(d?.etat).toBe("avertissement"); // et non « verrouille »
    expect(d?.manquants).toEqual([]);
  });

  it("restriction ET préalable sur la même fiche : les deux ressortent, séparément", () => {
    const cat = catalogueDe([
      fiche("DMO 1000", {
        prealablesBrut: "MAT1720",
        prealables: { genre: "cours", code: "MAT 1720" },
        restrictionsBrut: "DMO1000/DMO1010",
      }),
    ]);
    const d = diagnostiquerCours(cat, new Set(["MAT 1720"])).get("DMO 1000");
    expect(d?.etat).toBe("avertissement"); // préalable satisfait, restriction en attente
    expect(d?.avertissements).toHaveLength(1);
    expect(d?.avertissements[0]).toMatch(/restriction d'inscription/);

    const bloque = diagnostiquerCours(cat, new Set()).get("DMO 1000");
    expect(bloque?.etat).toBe("verrouille"); // le préalable, lui, verrouille
    expect(bloque?.manquants).toEqual(["MAT 1720"]);
    expect(bloque?.avertissements[0]).toMatch(/restriction d'inscription/);
  });

  it("une restriction vide ou absente ne fabrique pas d'avertissement", () => {
    const cat = catalogueDe([
      fiche("IFT 1015", { restrictionsBrut: null }),
      fiche("IFT 1016", { restrictionsBrut: "   " }),
    ]);
    const d = diagnostiquerCours(cat, new Set());
    expect(d.get("IFT 1015")?.etat).toBe("disponible");
    expect(d.get("IFT 1016")?.etat).toBe("disponible");
  });
});

describe("evaluerPrealables — arbre ET / OU / opaque", () => {
  it("ET : tous les enfants sont requis", () => {
    expect(evaluerPrealables(ET_2250, new Set(["ACT 1240"]))).toEqual({
      satisfait: false, manquants: ["MAT 1720"], opaques: [],
    });
    expect(evaluerPrealables(ET_2250, new Set(["ACT 1240", "MAT 1720"])).satisfait).toBe(true);
  });

  it("OU : un seul enfant suffit", () => {
    const ou: NoeudPrealable = {
      genre: "ou",
      enfants: [{ genre: "cours", code: "STT 1700" }, { genre: "cours", code: "MAT 2717" }],
    };
    expect(evaluerPrealables(ou, new Set(["MAT 2717"])).satisfait).toBe(true);
    const rien = evaluerPrealables(ou, new Set());
    expect(rien.satisfait).toBe(false);
    // Non satisfait : on montre toutes les branches, sans choisir pour l'étudiant.
    expect(rien.manquants).toEqual(["STT 1700", "MAT 2717"]);
  });

  it("un OU dont une branche est opaque n'est jamais verrouillé", () => {
    const ou: NoeudPrealable = {
      genre: "ou",
      enfants: [
        { genre: "cours", code: "STT 1700" },
        { genre: "opaque", texte: "autorisation du département" },
      ],
    };
    const r = evaluerPrealables(ou, new Set());
    expect(r.satisfait).toBe(true);
    expect(r.opaques).toEqual(["autorisation du département"]);
  });

  it("déduplique les codes manquants d'un arbre imbriqué", () => {
    const arbre: NoeudPrealable = {
      genre: "et",
      enfants: [
        { genre: "cours", code: "ACT 1240" },
        { genre: "ou", enfants: [{ genre: "cours", code: "ACT 1240" }, { genre: "cours", code: "MAT 1720" }] },
      ],
    };
    expect(evaluerPrealables(arbre, new Set()).manquants).toEqual(["ACT 1240", "MAT 1720"]);
  });

  it("normalise les codes écrits dans l'arbre (« ACT1240 » vaut « ACT 1240 »)", () => {
    const n: NoeudPrealable = { genre: "cours", code: "ACT1240" };
    expect(evaluerPrealables(n, new Set(["ACT 1240"])).satisfait).toBe(true);
  });
});
