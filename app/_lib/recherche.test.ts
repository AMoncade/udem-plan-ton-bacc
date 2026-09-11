/**
 * La recherche et les filtres, éprouvés à l'échelle réelle.
 *
 * Le jeu de démonstration compte plusieurs centaines de fiches, et c'est
 * délibéré : une recherche éprouvée sur cinq lignes ne dit rien du classement,
 * du plafond de rendu, ni des facettes qui se vident.
 */
import { describe, expect, it } from "vitest";
import type { FicheIndex, IndexProgrammes } from "../../lib/types";
import { creerDepotDemo } from "../_demo/depot-demo";
import {
  FILTRES_VIDES,
  PLAFOND_RESULTATS,
  chercher,
  facettes,
  ficheParId,
  libelleFiche,
  plier,
  preparerIndex,
  type Filtres,
} from "./recherche";

const depot = creerDepotDemo();
const index: IndexProgrammes = await depot.chargerIndex();
const prepare = preparerIndex(index);

function avec(partiel: Partial<Filtres>): Filtres {
  return { ...FILTRES_VIDES, ...partiel };
}

describe("l'index de démonstration", () => {
  it("a l'échelle voulue : plusieurs centaines de fiches", () => {
    expect(prepare.entrees.length).toBeGreaterThanOrEqual(300);
  });

  it("contient des fiches sans structure exploitable", () => {
    expect(prepare.nbSansStructure).toBeGreaterThan(0);
  });

  it("couvre les trois cycles et plusieurs facultés et types", () => {
    expect(prepare.cycles.length).toBe(3);
    expect(prepare.facultes.length).toBeGreaterThan(4);
    expect(prepare.types.length).toBeGreaterThan(4);
  });

  it("n'a aucun identifiant en double", () => {
    const ids = prepare.entrees.map((e) => e.fiche.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("préfixe tous les identifiants par `demo-` : aucun ne peut passer pour un vrai", () => {
    expect(prepare.entrees.every((e) => e.fiche.id.startsWith("demo-"))).toBe(true);
  });
});

describe("plier", () => {
  it("retire les accents et la casse", () => {
    expect(plier("Baccalauréat en mathématiques")).toBe("baccalaureat en mathematiques");
    expect(plier("Études hispaniques")).toBe("etudes hispaniques");
  });
});

describe("chercher", () => {
  it("trouve un programme accentué avec une requête sans accents", () => {
    const r = chercher(prepare, avec({ texte: "mathematiques" }));
    expect(r.total).toBeGreaterThan(0);
    expect(r.fiches.some((f) => f.nom.includes("mathématiques"))).toBe(true);
  });

  it("accepte les mots dans n'importe quel ordre", () => {
    const direct = chercher(prepare, avec({ texte: "baccalaureat mathematiques" }));
    const inverse = chercher(prepare, avec({ texte: "mathematiques baccalaureat" }));
    expect(direct.total).toBeGreaterThan(0);
    expect(inverse.total).toBe(direct.total);
  });

  it("trouve par abréviation partielle de plusieurs mots", () => {
    const r = chercher(prepare, avec({ texte: "bacc math" }));
    expect(r.fiches.some((f) => f.nom === "Baccalauréat en mathématiques")).toBe(true);
  });

  it("classe le nom avant la faculté", () => {
    // « droit » est aussi le nom d'une faculté, qui porte plusieurs programmes.
    // Le baccalauréat en droit doit sortir avant eux.
    const r = chercher(prepare, avec({ texte: "droit" }));
    expect(r.total).toBeGreaterThan(1);
    expect(r.fiches[0].nom.toLowerCase()).toContain("droit");
  });

  it("trouve par faculté, par type et par cycle, pas seulement par nom", () => {
    expect(chercher(prepare, avec({ texte: "musique" })).total).toBeGreaterThan(0);
    expect(chercher(prepare, avec({ texte: "certificat" })).total).toBeGreaterThan(0);
  });

  it("plafonne le rendu et ANNONCE ce qui n'est pas affiché", () => {
    const r = chercher(prepare, FILTRES_VIDES);
    expect(r.total).toBe(prepare.entrees.length);
    expect(r.fiches.length).toBe(Math.min(PLAFOND_RESULTATS, r.total));
    expect(r.tronques).toBe(r.total - r.fiches.length);
    // Une troncature muette ferait croire qu'il n'y a rien de plus.
    expect(r.tronques).toBeGreaterThan(0);
  });

  it("rend une liste vide plutôt qu'une erreur quand rien ne correspond", () => {
    const r = chercher(prepare, avec({ texte: "zzzzqqqq" }));
    expect(r.total).toBe(0);
    expect(r.fiches).toEqual([]);
    expect(r.tronques).toBe(0);
  });

  it("est stable : deux appels identiques rendent le même ordre", () => {
    const a = chercher(prepare, avec({ texte: "en" })).fiches.map((f) => f.id);
    const b = chercher(prepare, avec({ texte: "en" })).fiches.map((f) => f.id);
    expect(a).toEqual(b);
  });

  it("combine les filtres en ET", () => {
    const cycle = prepare.cycles[1];
    const r = chercher(prepare, avec({ cycle }), 10_000);
    expect(r.total).toBeGreaterThan(0);
    expect(r.fiches.every((f) => f.cycle === cycle)).toBe(true);

    const faculte = r.fiches[0].faculte;
    const double = chercher(prepare, avec({ cycle, faculte }), 10_000);
    expect(double.total).toBeGreaterThan(0);
    expect(double.total).toBeLessThanOrEqual(r.total);
    expect(double.fiches.every((f) => f.cycle === cycle && f.faculte === faculte)).toBe(
      true,
    );
  });

  it("montre les fiches sans structure par défaut, et sait les masquer", () => {
    const avecElles = chercher(prepare, FILTRES_VIDES, 10_000);
    const sansElles = chercher(prepare, avec({ masquerSansStructure: true }), 10_000);
    expect(avecElles.total - sansElles.total).toBe(prepare.nbSansStructure);
    expect(sansElles.fiches.every((f) => f.structureLue)).toBe(true);
  });
});

describe("facettes", () => {
  it("compte en appliquant les AUTRES filtres, pas le sien", () => {
    const cycle = prepare.cycles[0];
    const toutes = facettes(prepare, FILTRES_VIDES, "faculte");
    const restreintes = facettes(prepare, avec({ cycle }), "faculte");
    const sommeToutes = toutes.reduce((s, f) => s + f.nombre, 0);
    const sommeRestreintes = restreintes.reduce((s, f) => s + f.nombre, 0);
    expect(sommeRestreintes).toBeLessThan(sommeToutes);
  });

  it("énumère sa propre dimension en entier, même quand elle est filtrée", () => {
    // Sans ça, choisir un cycle ferait disparaître les autres cycles de la
    // liste déroulante et on ne pourrait plus en changer.
    const cycle = prepare.cycles[0];
    const options = facettes(prepare, avec({ cycle }), "cycle");
    expect(options.length).toBe(prepare.cycles.length);
  });

  it("ne propose jamais de cul-de-sac : chaque option a au moins une fiche", () => {
    const cycle = prepare.cycles[2];
    for (const option of facettes(prepare, avec({ cycle }), "faculte")) {
      expect(option.nombre).toBeGreaterThan(0);
      const r = chercher(prepare, avec({ cycle, faculte: option.valeur }), 10_000);
      expect(r.total).toBe(option.nombre);
    }
  });
});

describe("ficheParId et libelleFiche", () => {
  it("retrouve une fiche par son identifiant", () => {
    const premiere = prepare.entrees[0].fiche;
    expect(ficheParId(prepare, premiere.id)).toBe(premiere);
    expect(ficheParId(prepare, "demo-inexistant")).toBeUndefined();
  });

  it("nomme l'orientation quand il y en a une", () => {
    const avecOrientation = prepare.entrees
      .map((e) => e.fiche)
      .find((f: FicheIndex) => f.orientation !== null);
    expect(avecOrientation).toBeDefined();
    expect(libelleFiche(avecOrientation as FicheIndex)).toContain("orientation");
  });
});
