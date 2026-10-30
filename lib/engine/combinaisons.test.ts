/**
 * COMBINAISONS D'HORAIRE — ce que ces tests épinglent, et pourquoi.
 *
 * Les séances de MAT 1400 et STT 1700 (Hiver 2027) sont COPIÉES de data/cours
 * le 2026-10-30 (commit 74720ea), pas lues par chemin : un test qui dépend du
 * dernier scrape changerait de verdict à chaque passe sans qu'on ait touché au
 * code. Ces deux cours sont aussi ceux de la mesure d'en-tête du module : leurs
 * sous-sections (A101…) sont la forme que la preuve Synchro soutient.
 *
 * Les tests de STRUCTURE (indéterminé) portent la règle du projet : un cours dont
 * les sections ne sont pas comprises ne sort JAMAIS comme « sans conflit ».
 */
import { describe, it, expect } from "vitest";
import {
  combinaisons,
  PLAFOND_COMBINAISONS_DEFAUT,
  structureDeSections,
} from "./combinaisons";
import { chevauchements } from "./horaires";
import type {
  Cours,
  Creneau,
  JourSemaine,
  Seance,
  SectionHoraire,
  Trimestre,
} from "../types";

const HIVER_2027: Trimestre = { saison: "Hiver", annee: 2027 };
const AUTOMNE_2026: Trimestre = { saison: "Automne", annee: 2026 };

/** Fenêtre qui couvre tout le trimestre, pour les cas construits à la main. */
const D0 = "2027-01-07";
const D1 = "2027-04-16";

const s = (jour: JourSemaine, debutMin: number, finMin: number, du: string, au: string): Seance => ({
  creneau: { genre: "attribue", jour, debutMin, finMin },
  du,
  au,
});
const sCreneau = (creneau: Creneau, du = D0, au = D1): Seance => ({ creneau, du, au });
const section = (nom: string, seances: Seance[]): SectionHoraire => ({ nom, seances });

const lundi830 = () => s("Lundi", 510, 629, D0, D1);
const mardi830 = () => s("Mardi", 510, 629, D0, D1);

/** Une fiche minimale ; seul `apercuHoraires` et le code importent ici. */
function cours(
  code: string,
  sections: SectionHoraire[] | undefined,
  trimestre: Trimestre = HIVER_2027,
): Cours {
  return {
    code,
    titre: code,
    credits: 3,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres: [trimestre],
    apercuHoraires: sections === undefined ? undefined : [{ trimestre, sections }],
    url: "https://exemple.invalide/",
    scrapeISO: "2026-10-30T00:00:00.000Z",
  };
}

// Séances copiées de data/cours/MAT.json et data/cours/STT.json (Hiver 2027).
const MAT_1400_H27: SectionHoraire[] = [
  section("A", [
    s("Jeudi", 510, 629, "2027-01-07", "2027-02-26"),
    s("Mardi", 510, 629, "2027-01-07", "2027-02-26"),
    s("Jeudi", 510, 629, "2027-03-08", "2027-04-16"),
    s("Mardi", 510, 629, "2027-03-08", "2027-04-16"),
  ]),
  section("A101", [
    s("Lundi", 930, 1049, "2027-01-11", "2027-02-19"),
    s("Lundi", 930, 1049, "2027-03-08", "2027-04-16"),
  ]),
  section("A102", [
    s("Lundi", 930, 1049, "2027-01-11", "2027-02-19"),
    s("Lundi", 930, 1049, "2027-03-08", "2027-04-16"),
  ]),
  section("A103", [
    s("Lundi", 930, 1049, "2027-01-11", "2027-02-19"),
    s("Lundi", 930, 1049, "2027-03-08", "2027-04-16"),
  ]),
  section("B", [
    s("Jeudi", 510, 629, "2027-01-07", "2027-02-26"),
    s("Mardi", 510, 629, "2027-01-07", "2027-02-26"),
    s("Jeudi", 510, 629, "2027-03-08", "2027-04-16"),
    s("Mardi", 510, 629, "2027-03-08", "2027-04-16"),
  ]),
  section("B101", [
    s("Lundi", 930, 1049, "2027-01-11", "2027-02-19"),
    s("Lundi", 930, 1049, "2027-03-08", "2027-04-16"),
  ]),
  section("B102", [
    s("Lundi", 930, 1049, "2027-01-11", "2027-02-19"),
    s("Lundi", 930, 1049, "2027-03-08", "2027-04-16"),
  ]),
];

const STT_1700_H27: SectionHoraire[] = [
  section("A", [
    s("Mardi", 810, 929, "2027-01-07", "2027-02-26"),
    s("Vendredi", 630, 689, "2027-01-07", "2027-02-26"),
    s("Mardi", 810, 929, "2027-03-08", "2027-04-16"),
    s("Vendredi", 630, 689, "2027-03-08", "2027-04-16"),
  ]),
  section("A101", [
    s("Mercredi", 930, 1049, "2027-01-11", "2027-01-29"),
    s("Mercredi", 930, 1049, "2027-02-08", "2027-02-26"),
    s("Mercredi", 930, 1049, "2027-03-08", "2027-03-12"),
    s("Mercredi", 930, 1049, "2027-03-22", "2027-04-16"),
  ]),
  section("A102", [
    s("Mercredi", 930, 1049, "2027-01-11", "2027-01-29"),
    s("Mercredi", 930, 1049, "2027-02-08", "2027-02-26"),
    s("Mercredi", 930, 1049, "2027-03-08", "2027-03-12"),
    s("Mercredi", 930, 1049, "2027-03-22", "2027-04-16"),
  ]),
];


const MAT_1400 = cours("MAT 1400", MAT_1400_H27);
const STT_1700 = cours("STT 1700", STT_1700_H27);

describe("combinaisons : MAT 1400 + STT 1700, Hiver 2027 (séances réelles)", () => {
  const r = combinaisons([MAT_1400, STT_1700], HIVER_2027);

  it("5 options pour MAT 1400 (A+A101..A103, B+B101..B102) x 2 pour STT 1700 = 10, toutes sans conflit", () => {
    expect(r.combinaisons).toHaveLength(10);
    expect(r.sansConflit).toBe(10);
    expect(r.tronque).toBe(false);
    expect(r.horaireInconnu).toEqual([]);
    expect(r.indetermines).toEqual([]);
    expect(r.combinaisons.every((c) => c.conflits.length === 0)).toBe(true);
  });

  it("la première combinaison suit l'ordre de la page, lettre PUIS sa sous-section", () => {
    expect(r.combinaisons[0].choix).toEqual([
      { code: "MAT 1400", sections: ["A", "A101"] },
      { code: "STT 1700", sections: ["A", "A101"] },
    ]);
  });

  it("une sous-section n'est jamais prise avec une autre lettre que la sienne", () => {
    for (const c of r.combinaisons) {
      for (const choix of c.choix) {
        const [lettre, sous] = choix.sections;
        expect(sous.startsWith(lettre)).toBe(true);
        expect(choix.sections).toHaveLength(2);
      }
    }
    const mat = new Set(r.combinaisons.map((c) => c.choix[0].sections.join("+")));
    expect([...mat].sort()).toEqual(["A+A101", "A+A102", "A+A103", "B+B101", "B+B102"]);
    expect(mat.has("A+B101")).toBe(false);
  });

  it("est déterministe : deux appels, même résultat, même ordre", () => {
    expect(combinaisons([MAT_1400, STT_1700], HIVER_2027)).toEqual(r);
  });
});

describe("combinaisons : conflits", () => {
  it("une paire en conflit certain : aucune combinaison sans conflit, le chevauchement porte le recouvrement exact", () => {
    const x = cours("ACT 1000", [section("A", [lundi830()])]);
    const y = cours("ACT 2000", [section("A", [lundi830()])]);
    const r = combinaisons([x, y], HIVER_2027);
    expect(r.combinaisons).toHaveLength(1);
    expect(r.sansConflit).toBe(0);
    const [c] = r.combinaisons;
    expect(c.conflits).toHaveLength(1);
    expect(c.conflits[0].etat).toBe("chevauche");
    expect(c.conflits[0].recouvrement).toEqual({ jour: "Lundi", debutMin: 510, finMin: 629, du: D0, au: D1 });
    expect([c.conflits[0].a.code, c.conflits[0].b.code].sort()).toEqual(["ACT 1000", "ACT 2000"]);
  });

  it("demi-trimestres : mêmes jour et heure sur des fenêtres disjointes ne sont pas un conflit", () => {
    const x = cours("ACT 1000", [section("A", [s("Lundi", 510, 629, "2027-01-07", "2027-02-26")])]);
    const y = cours("ACT 2000", [section("A", [s("Lundi", 510, 629, "2027-03-08", "2027-04-16")])]);
    const r = combinaisons([x, y], HIVER_2027);
    expect(r.sansConflit).toBe(1);
    expect(r.combinaisons[0].conflits).toEqual([]);
  });

  it("les bornes sont incluses : deux fenêtres qui se touchent un jour sont en conflit", () => {
    const x = cours("ACT 1000", [section("A", [s("Lundi", 510, 629, "2027-01-07", "2027-02-26")])]);
    const y = cours("ACT 2000", [section("A", [s("Lundi", 510, 629, "2027-02-26", "2027-04-16")])]);
    expect(combinaisons([x, y], HIVER_2027).sansConflit).toBe(0);
  });

  it("des créneaux consécutifs (fin en :29, début en :30) ne sont pas un conflit", () => {
    const x = cours("ACT 1000", [section("A", [s("Lundi", 510, 629, D0, D1)])]);
    const y = cours("ACT 2000", [section("A", [s("Lundi", 630, 749, D0, D1)])]);
    expect(combinaisons([x, y], HIVER_2027).sansConflit).toBe(1);
  });

  it("le conflit d'une option n'infecte pas les autres : les combinaisons propres viennent d'abord", () => {
    const x = cours("ACT 1000", [section("A", [lundi830()]), section("B", [mardi830()])]);
    const y = cours("ACT 2000", [section("A", [lundi830()])]);
    const r = combinaisons([x, y], HIVER_2027);
    expect(r.combinaisons.map((c) => c.choix[0].sections[0])).toEqual(["B", "A"]);
    expect(r.sansConflit).toBe(1);
    expect(r.combinaisons[0].conflits).toEqual([]);
    expect(r.combinaisons[1].conflits).toHaveLength(1);
  });

  it("sans combinaison propre, rend les moins conflictuelles d'abord, à égalité l'ordre de la page", () => {
    // Y occupe lundi ET mardi. X.A occupe lundi et mardi (2 conflits), X.B lundi
    // seulement (1), X.C lundi seulement aussi (1, après B dans la page).
    const y = cours("ACT 2000", [section("A", [lundi830(), mardi830()])]);
    const x = cours("ACT 1000", [
      section("A", [lundi830(), mardi830()]),
      section("B", [lundi830()]),
      section("C", [lundi830()]),
    ]);
    const r = combinaisons([x, y], HIVER_2027);
    expect(r.sansConflit).toBe(0);
    expect(r.combinaisons.map((c) => [c.choix[0].sections[0], c.conflits.length])).toEqual([
      ["B", 1],
      ["C", 1],
      ["A", 2],
    ]);
  });

  it("réutilise chevauchements() : les conflits d'une combinaison sont ceux du moteur sur les mêmes sections", () => {
    const x = cours("ACT 1000", [section("A", [lundi830(), mardi830()])]);
    const y = cours("ACT 2000", [section("A", [s("Mardi", 540, 700, D0, D1)])]);
    const r = combinaisons([x, y], HIVER_2027);
    const direct = chevauchements([
      { code: "ACT 1000", section: section("A", [lundi830(), mardi830()]) },
      { code: "ACT 2000", section: section("A", [s("Mardi", 540, 700, D0, D1)]) },
    ]);
    expect(direct).toHaveLength(1);
    expect(r.combinaisons[0].conflits).toEqual(direct);
  });

  it("une sous-section qui chevauche sa propre lettre est un conflit de la combinaison, sous le code du cours", () => {
    const x = cours("ACT 1000", [section("A", [lundi830()]), section("A101", [lundi830()])]);
    const r = combinaisons([x], HIVER_2027);
    expect(r.combinaisons).toHaveLength(1);
    expect(r.sansConflit).toBe(0);
    const [c] = r.combinaisons[0].conflits;
    expect(c.etat).toBe("chevauche");
    expect(c.a.code).toBe("ACT 1000");
    expect(c.b.code).toBe("ACT 1000");
    expect([c.a.section, c.b.section].sort()).toEqual(["A", "A101"]);
  });

  it("ne compte pas comme conflit la contradiction INTERNE d'une section (incohérence de la page)", () => {
    const x = cours("ACT 1000", [section("A", [lundi830(), lundi830()])]);
    const y = cours("ACT 2000", [section("A", [mardi830()])]);
    const r = combinaisons([x, y], HIVER_2027);
    expect(r.sansConflit).toBe(1);
    expect(r.combinaisons[0].conflits).toEqual([]);
  });
});

describe("combinaisons : horaire inconnu", () => {
  const y = cours("ACT 2000", [section("A", [mardi830()])]);

  it("une séance nonAttribue sort en horaireInconnu, n'entre pas dans les combinaisons", () => {
    const x = cours("ACT 1000", [section("A", [sCreneau({ genre: "nonAttribue" })])]);
    const r = combinaisons([x, y], HIVER_2027);
    expect(r.horaireInconnu).toEqual(["ACT 1000"]);
    expect(r.combinaisons.map((c) => c.choix.map((k) => k.code))).toEqual([["ACT 2000"]]);
  });

  it("une séance illisible sort en horaireInconnu", () => {
    const x = cours("ACT 1000", [section("A", [sCreneau({ genre: "illisible", brut: "Ma ??:??" })])]);
    expect(combinaisons([x, y], HIVER_2027).horaireInconnu).toEqual(["ACT 1000"]);
  });

  it("UNE section non attribuée suffit, même si une autre est lisible", () => {
    const x = cours("ACT 1000", [
      section("A", [lundi830()]),
      section("B", [sCreneau({ genre: "nonAttribue" })]),
    ]);
    expect(combinaisons([x], HIVER_2027).horaireInconnu).toEqual(["ACT 1000"]);
  });

  it("fiche sans apercuHoraires, trimestre absent, aucune section, section sans séance : tous horaireInconnu", () => {
    const sansChamp = cours("ACT 1000", undefined);
    const autreTrimestre = cours("ACT 1001", [section("A", [lundi830()])], AUTOMNE_2026);
    const aucuneSection = cours("ACT 1002", []);
    const sectionVide = cours("ACT 1003", [section("A", [])]);
    const r = combinaisons([sansChamp, autreTrimestre, aucuneSection, sectionVide], HIVER_2027);
    expect(r.horaireInconnu).toEqual(["ACT 1000", "ACT 1001", "ACT 1002", "ACT 1003"]);
    expect(r.combinaisons).toEqual([]);
  });

  it("un cours inconnu n'est jamais compté sans conflit : tous exclus, rien n'est rendu", () => {
    const x = cours("ACT 1000", [section("A", [sCreneau({ genre: "nonAttribue" })])]);
    const r = combinaisons([x], HIVER_2027);
    expect(r.combinaisons).toEqual([]);
    expect(r.sansConflit).toBe(0);
    expect(r.tronque).toBe(false);
  });
});

describe("combinaisons : structure de sections indéterminée", () => {
  const ok = cours("ACT 2000", [section("A", [mardi830()])]);
  const un = (nom: string[]) => cours("ACT 1000", nom.map((n) => section(n, [lundi830()])));

  it("sous-section orpheline (A101 sans A) : indeterminé, pas combiné", () => {
    const r = combinaisons([un(["A101", "A102"]), ok], HIVER_2027);
    expect(r.indetermines).toEqual(["ACT 1000"]);
    expect(r.combinaisons.map((c) => c.choix.map((k) => k.code))).toEqual([["ACT 2000"]]);
  });

  it("forme L9 (A, A1, A2) : aucun témoin, indeterminé", () => {
    expect(combinaisons([un(["A", "A1", "A2"])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
  });

  it("forme L99 (A, A11, A12) : indeterminé", () => {
    expect(combinaisons([un(["A", "A11", "A12"])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
  });

  it("centaine 2 (A, A201) : le rôle (laboratoire ?) n'a pas de témoin, indeterminé", () => {
    expect(combinaisons([un(["A", "A201"])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
  });

  it("centaines 1 ET 2 (A, A101, A201) : indeterminé", () => {
    expect(combinaisons([un(["A", "A101", "A201"])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
  });

  it("une lettre sans sous-section parmi des lettres qui en ont (A, A101, B) : indeterminé", () => {
    expect(combinaisons([un(["A", "A101", "B"])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
  });

  it("une sous-section dont la lettre est publiée mais autre que la sienne (A, B101) : indeterminé", () => {
    expect(combinaisons([un(["A", "B", "B101"])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
  });

  it("nom répété : indeterminé", () => {
    expect(combinaisons([un(["A", "A"])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
  });

  it("nom hors des formes mesurées (chiffre seul, minuscule, tiret) : indeterminé", () => {
    for (const nom of ["1", "a1", "A-101"]) {
      expect(combinaisons([un(["A", nom])], HIVER_2027).indetermines).toEqual(["ACT 1000"]);
    }
  });

  it("l'horaire inconnu passe avant la structure : un cours orphelin ET non attribué est horaireInconnu", () => {
    const x = cours("ACT 1000", [section("A101", [sCreneau({ genre: "nonAttribue" })])]);
    const r = combinaisons([x], HIVER_2027);
    expect(r.horaireInconnu).toEqual(["ACT 1000"]);
    expect(r.indetermines).toEqual([]);
  });

  it("des lettres seules, même à deux ou trois lettres (BA, BB, INS), sont des alternatives", () => {
    const r = combinaisons([un(["BA", "BB", "INS"])], HIVER_2027);
    expect(r.indetermines).toEqual([]);
    expect(r.combinaisons.map((c) => c.choix[0].sections)).toEqual([["BA"], ["BB"], ["INS"]]);
  });
});

describe("structureDeSections", () => {
  it("ne rend jamais de dépendance pour une forme sans témoin, et dit pourquoi", () => {
    for (const noms of [["A", "A1"], ["A201"], ["A", "A201"], ["A", "A101", "B"], ["A", "A", "A101"], []]) {
      const r = structureDeSections(noms);
      expect(r.genre).toBe("indeterminee");
      if (r.genre === "indeterminee") expect(r.raison.length).toBeGreaterThan(10);
    }
  });

  it("A, A101, A102, B, B101 : quatre options lettre+sous-section dans l'ordre de la page", () => {
    expect(structureDeSections(["A", "A101", "A102", "B", "B101"])).toEqual({
      genre: "determinee",
      forme: "volets",
      options: [["A", "A101"], ["A", "A102"], ["B", "B101"]],
    });
  });

  it("une section par option pour des lettres seules", () => {
    expect(structureDeSections(["A", "B"])).toEqual({
      genre: "determinee",
      forme: "alternatives",
      options: [["A"], ["B"]],
    });
  });
});

describe("combinaisons : plafond, troncature, cas limites", () => {
  /** Un cours à `n` alternatives, toutes sur des jours/heures qui ne se croisent
   *  avec rien : le nombre de combinaisons est un simple produit. */
  const libre = (code: string, n: number, decalage: number): Cours =>
    cours(
      code,
      Array.from({ length: n }, (_, i) =>
        section(String.fromCharCode(65 + i), [s("Lundi", (decalage * 10 + i) * 30, (decalage * 10 + i) * 30 + 29, D0, D1)]),
      ),
    );

  it("le plafond coupe la liste et tronque devient vrai", () => {
    const fiches = [libre("ACT 1000", 3, 0), libre("ACT 2000", 3, 1), libre("ACT 3000", 3, 2)]; // 27
    const r = combinaisons(fiches, HIVER_2027, { plafond: 5 });
    expect(r.combinaisons).toHaveLength(5);
    expect(r.tronque).toBe(true);
    expect(r.sansConflit).toBe(5);
  });

  it("un plafond égal au nombre exact de combinaisons ne tronque pas", () => {
    const fiches = [libre("ACT 1000", 3, 0), libre("ACT 2000", 3, 1), libre("ACT 3000", 3, 2)];
    const r = combinaisons(fiches, HIVER_2027, { plafond: 27 });
    expect(r.combinaisons).toHaveLength(27);
    expect(r.tronque).toBe(false);
  });

  it("le plafond par défaut est 200", () => {
    expect(PLAFOND_COMBINAISONS_DEFAUT).toBe(200);
    const fiches = [libre("ACT 1000", 6, 0), libre("ACT 2000", 6, 1), libre("ACT 3000", 6, 2)]; // 216
    const r = combinaisons(fiches, HIVER_2027);
    expect(r.combinaisons).toHaveLength(200);
    expect(r.tronque).toBe(true);
  });

  it("tronquée, la liste garde les combinaisons SANS conflit en premier, pas les premières trouvées", () => {
    // X.A entre en conflit avec Y ; X.B et X.C non. Plafond 1 : on doit garder une propre.
    const y = cours("ACT 2000", [section("A", [lundi830()])]);
    const x = cours("ACT 1000", [section("A", [lundi830()]), section("B", [mardi830()]), section("C", [mardi830()])]);
    const r = combinaisons([x, y], HIVER_2027, { plafond: 1 });
    expect(r.tronque).toBe(true);
    expect(r.sansConflit).toBe(1);
    expect(r.combinaisons[0].choix[0].sections).toEqual(["B"]);
  });

  it("un budget de recherche épuisé tronque même quand il y a moins de combinaisons que le plafond", () => {
    const fiches = [libre("ACT 1000", 3, 0), libre("ACT 2000", 3, 1), libre("ACT 3000", 3, 2)]; // 27 < 200
    expect(combinaisons(fiches, HIVER_2027).tronque).toBe(false);
    expect(combinaisons(fiches, HIVER_2027, { budgetNoeuds: 10 }).tronque).toBe(true);
    expect(() => combinaisons(fiches, HIVER_2027, { budgetNoeuds: 0 })).toThrow(RangeError);
  });

  it("beaucoup de combinaisons toutes en conflit (12 cours de 12 alternatives) : borné, au plus plafond, jamais sans conflit", () => {
    const fiches = Array.from({ length: 12 }, (_, k) =>
      cours(
        `ACT ${1000 + k}`,
        Array.from({ length: 12 }, (_, i) => section(String.fromCharCode(65 + i), [lundi830()])),
      ),
    );
    const r = combinaisons(fiches, HIVER_2027, { plafond: 3 });
    expect(r.tronque).toBe(true);
    expect(r.sansConflit).toBe(0);
    expect(r.combinaisons.length).toBeLessThanOrEqual(3);
    expect(r.combinaisons.every((c) => c.conflits.length > 0)).toBe(true);
  }, 20_000);

  it("aucun cours : aucune combinaison (pas « une combinaison vide sans conflit »)", () => {
    const r = combinaisons([], HIVER_2027);
    expect(r).toEqual({ combinaisons: [], sansConflit: 0, tronque: false, horaireInconnu: [], indetermines: [] });
  });

  it("un seul cours : une combinaison par option", () => {
    const r = combinaisons([libre("ACT 1000", 3, 0)], HIVER_2027);
    expect(r.combinaisons.map((c) => c.choix[0].sections)).toEqual([["A"], ["B"], ["C"]]);
    expect(r.sansConflit).toBe(3);
  });

  it("un cours cité deux fois (même code, écriture différente) compte une fois", () => {
    const a = libre("ACT 1000", 2, 0);
    const b = { ...a, code: "act-1000" };
    const r = combinaisons([a, b, libre("ACT 2000", 2, 1)], HIVER_2027);
    expect(r.combinaisons).toHaveLength(4);
    expect(r.combinaisons[0].choix.map((c) => c.code)).toEqual(["ACT 1000", "ACT 2000"]);
  });

  it("plafond invalide (0, négatif, décimal, NaN) : RangeError, pas de repli silencieux", () => {
    for (const plafond of [0, -1, 2.5, Number.NaN]) {
      expect(() => combinaisons([], HIVER_2027, { plafond })).toThrow(RangeError);
    }
  });

  it("ne modifie pas ses entrées", () => {
    const fiches = [MAT_1400, STT_1700];
    const avant = JSON.stringify(fiches);
    const r = combinaisons(fiches, HIVER_2027);
    r.combinaisons[0].choix[0].sections.push("ZZZ");
    expect(JSON.stringify(fiches)).toBe(avant);
  });
});
