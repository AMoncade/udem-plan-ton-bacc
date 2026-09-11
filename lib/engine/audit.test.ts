import { describe, it, expect } from "vitest";
import { auditProgramme } from "./index";
import type { Audit, Bloc, Catalogue, Cours, Programme } from "../types";
import fixtureBrute from "../../data/fixtures/actuariat-verifie.fixture.json";

const fixture = fixtureBrute as unknown as Catalogue;
const programme: Programme = fixture.programmes[0];

// ---------------------------------------------------------------------------
// CATALOGUE DE TRAVAIL
//
// La fixture ne contient que 3 fiches de cours pour 55 codes référencés : elle
// ne permet donc PAS de démontrer l'arithmétique des crédits, puisque 52 cours
// ont des crédits inconnus. Les tests d'arithmétique utilisent donc un
// catalogue SYNTHÉTIQUE : mêmes blocs (vrais, ceux de la fixture), fiches
// fabriquées.
//
// /!\ Les valeurs de crédits ci-dessous sont INVENTÉES pour faire tomber les
// totaux sur les nombres de la page de structure (01A = 26 crédits sur 7 cours,
// 75B = 7 crédits sur 3 cours — donc ces blocs ne peuvent PAS être faits de
// cours à 3 crédits). Ce n'est une affirmation sur aucun vrai cours de l'UdeM.
// ---------------------------------------------------------------------------
const CREDITS_INVENTES: Record<string, number> = {
  "MAT 1000": 4, "MAT 1400": 4, "MAT 1500": 4, "MAT 1600": 4, "MAT 1720": 4, // 01A : 4+4+4+4+4
  "MAT 2717": 3, "STT 1700": 3, //                                             + 3+3 = 26
  "IFT 1015": 3, "IFT 1174": 3, "STT 1682": 1, //                              75B : 3+3+1 = 7
};
/** Cours hors de tout bloc, pour alimenter le bloc « Choix » 75Z. */
const HORS_BLOCS = ["ZZZ 9001", "ZZZ 9002"];

function fiche(code: string): Cours {
  return {
    code,
    titre: `Cours ${code}`,
    credits: CREDITS_INVENTES[code] ?? 3,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    trimestres: [],
    url: `https://exemple.test/${code}`,
    scrapeISO: "2026-09-10T00:00:00.000Z",
  };
}

const codesDesBlocs = programme.blocs.flatMap((b) => b.cours);
const catalogueComplet: Catalogue = {
  programmes: fixture.programmes,
  cours: Object.fromEntries([...codesDesBlocs, ...HORS_BLOCS].map((c) => [c, fiche(c)])),
  prealablesNonParses: [],
  scrapeISO: "2026-09-10T00:00:00.000Z",
};

function bloc(id: string): Bloc {
  const b = programme.blocs.find((x) => x.id === id);
  if (!b) throw new Error(`bloc absent de la fixture : ${id}`);
  return b;
}
/** Les n premiers cours d'un bloc. */
function prendre(id: string, n: number): string[] {
  return bloc(id).cours.slice(0, n);
}
function credits(codes: string[]): number {
  return codes.reduce((s, c) => s + (CREDITS_INVENTES[c] ?? 3), 0);
}
function auditer(faits: string[], cat: Catalogue = catalogueComplet, prog: Programme = programme): Audit {
  return auditProgramme(prog, cat, new Set(faits));
}
function joint(a: Audit): string {
  return a.problemes.join("\n");
}
function etat(a: Audit, id: string) {
  const e = a.blocs.find((b) => b.idBloc === id);
  if (!e) throw new Error(`bloc absent de l'audit : ${id}`);
  return e;
}

// Les 54 crédits obligatoires : tous les cours de 01A + 75A + 75B.
const OBLIGATOIRES = [...bloc("01A").cours, ...bloc("75A").cours, ...bloc("75B").cours];
// 18 crédits d'option = EXACTEMENT les minimums des quatre blocs (12 + 3 + 0 + 3).
const OPTION_AUX_MINIMUMS = [...prendre("75C", 4), ...prendre("75D", 1), ...prendre("75Y", 1)];
// 33 crédits d'option, répartis sous les maximums (27 + 3 + 0 + 3).
const OPTION_COMPLETE = [...prendre("75C", 9), ...prendre("75D", 1), ...prendre("75Y", 1)];
const CHOIX = ["ZZZ 9001"];

// ---------------------------------------------------------------------------

describe("arithmétique de la fixture — vérification des affirmations du brief", () => {
  it("obligatoire = 54, choix = 3, minimums d'option = 18, capacité d'option = 67", () => {
    let obligatoire = 0;
    let choix = 0;
    let minOption = 0;
    let maxOption = 0;
    for (const b of programme.blocs) {
      if (b.regle.type === "obligatoire") obligatoire += b.regle.credits;
      else if (b.regle.type === "choix") choix += b.regle.credits;
      else {
        minOption += b.regle.min ?? 0;
        maxOption += b.regle.max ?? Infinity;
      }
    }
    expect(obligatoire).toBe(54); // 01A 26 + 75A 21 + 75B 7
    expect(choix).toBe(3); // 75Z
    expect(minOption).toBe(18); // 75C 12 + 75D 3 + 75E 0 + 75Y 3
    expect(maxOption).toBe(67); // 27 + 15 + 13 + 12
    expect(programme.creditsTotal).toBe(90);
    // Le nombre central du projet n'est écrit NULLE PART dans les données : il
    // se déduit. C'est pour ça que le moteur le calcule au lieu de le coder.
    expect(programme.creditsTotal - obligatoire - choix).toBe(33);
    expect(33 - minOption).toBe(15); // l'écart qui fait tout le piège
    expect(JSON.stringify(fixture)).not.toContain('"33"');
  });

  it("hypothèse d'attribution vérifiée : aucun cours n'est cité par deux blocs", () => {
    // S'il y avait chevauchement, l'attribution directe ne suffirait plus et il
    // faudrait un solveur d'affectation sous bornes.
    const vus = new Map<string, string>();
    const chevauchements: string[] = [];
    for (const b of programme.blocs) {
      for (const c of b.cours) {
        const precedent = vus.get(c);
        if (precedent) chevauchements.push(`${c} : ${precedent} + ${b.id}`);
        else vus.set(c, b.id);
      }
    }
    expect(chevauchements).toEqual([]);
    expect(vus.size).toBe(55);
    expect(codesDesBlocs.length).toBe(55); // aucun doublon non plus
  });

  it("le bloc « Choix » 75Z est le seul à liste vide (il accepte n'importe quel cours)", () => {
    const vides = programme.blocs.filter((b) => b.cours.length === 0).map((b) => b.id);
    expect(vides).toEqual(["75Z"]);
  });

  it("mes crédits inventés tombent bien sur les nombres de la page de structure", () => {
    expect(credits(bloc("01A").cours)).toBe(26);
    expect(credits(bloc("75A").cours)).toBe(21);
    expect(credits(bloc("75B").cours)).toBe(7);
    expect(credits(OBLIGATOIRES)).toBe(54);
    expect(credits(OPTION_AUX_MINIMUMS)).toBe(18);
    expect(credits(OPTION_COMPLETE)).toBe(33);
    expect(credits(CHOIX)).toBe(3);
  });
});

describe("auditProgramme — LE PIÈGE 18-CONTRE-33", () => {
  it("un parcours à 54 obligatoires + 18 option + 3 choix est NON CONFORME, bien que CHAQUE bloc soit dans ses bornes", () => {
    const a = auditer([...OBLIGATOIRES, ...OPTION_AUX_MINIMUMS, ...CHOIX]);

    // Niveau 1 — bloc par bloc : tout est vert. C'est exactement ce qui fait
    // conclure « conforme » à un audit naïf.
    for (const b of a.blocs) {
      expect(b.creditsManquants, `bloc ${b.idBloc}`).toBe(0);
      expect(b.conforme, `bloc ${b.idBloc}`).toBe(true);
    }
    expect(etat(a, "75C").creditsAttribues).toBe(12); // = son minimum
    expect(etat(a, "75D").creditsAttribues).toBe(3);
    expect(etat(a, "75E").creditsAttribues).toBe(0); // minimum 0 : conforme à vide
    expect(etat(a, "75Y").creditsAttribues).toBe(3);

    // Niveau 2 — totaux par type : il manque 15 crédits d'option.
    expect(a.creditsObligatoires).toBe(54);
    expect(a.creditsOption).toBe(18);
    expect(a.creditsChoix).toBe(3);
    expect(a.creditsTotal).toBe(75); // et non 90 : le parcours ne diplôme pas

    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 15 crédits de cours d'option/);
    expect(joint(a)).toMatch(/sur les 33 crédits exigés/);
    expect(joint(a)).toMatch(/ne totalisent que 18 crédits/);
    expect(joint(a)).toMatch(/NE SUFFIT PAS/);
    // Le message dit quoi faire, et où il reste de la place.
    expect(joint(a)).toMatch(/place restante : 75C 15 crédits, 75D 12 crédits, 75E 13 crédits, 75Y 9 crédits/);
  });

  it("les 15 crédits manquants placés sous les maximums rendent le parcours conforme", () => {
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX]);
    expect(a.creditsObligatoires).toBe(54);
    expect(a.creditsOption).toBe(33);
    expect(a.creditsChoix).toBe(3);
    expect(a.creditsTotal).toBe(90);
    expect(a.problemes).toEqual([]);
    expect(a.conforme).toBe(true);
  });

  it("l'exigence d'option est DÉDUITE du total, pas codée en dur (90 -> 33, 93 -> 36)", () => {
    const plusLong: Programme = { ...programme, creditsTotal: 93 };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, plusLong);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 3 crédits de cours d'option : 33 crédits sur les 36 crédits exigés/);
  });
});

describe("auditProgramme — le piège symétrique : total atteint mais bloc sous son minimum", () => {
  it("33 crédits d'option avec 75D à zéro reste NON CONFORME", () => {
    const faits = [...OBLIGATOIRES, ...prendre("75C", 9), ...prendre("75Y", 2), ...CHOIX];
    const a = auditer(faits);
    expect(a.creditsOption).toBe(33); // le total y est
    expect(etat(a, "75D").creditsAttribues).toBe(0); // mais le minimum de 75D, non
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(
      /il manque 3 crédits dans le bloc 75D \(Compléments de statistique\) : 0 crédit sur un minimum de 3 crédits/,
    );
    expect(joint(a)).not.toMatch(/cours d'option :/); // pas de faux problème de total
  });
});

describe("auditProgramme — crédits au-delà du maximum d'un bloc", () => {
  it("33 crédits d'option tous empilés dans 75C : 6 crédits perdus, et le total d'option retombe à 27", () => {
    // 75C liste 11 cours à 3 crédits = 33, pour un maximum de 27.
    const a = auditer([...OBLIGATOIRES, ...bloc("75C").cours, ...CHOIX]);
    expect(etat(a, "75C").creditsAttribues).toBe(27); // plafonné au maximum
    expect(etat(a, "75C").creditsPerdus).toBe(6); // ne comptent pas vers le diplôme
    expect(etat(a, "75C").coursAttribues).toHaveLength(11); // tous visibles malgré tout
    expect(a.creditsOption).toBe(27); // et non 33
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/6 crédits dépassent le maximum du bloc 75C \(27 crédits\)/);
    expect(joint(a)).toMatch(/il manque 6 crédits de cours d'option/);
    expect(joint(a)).toMatch(/il manque 3 crédits dans le bloc 75D/);
    expect(joint(a)).toMatch(/il manque 3 crédits dans le bloc 75Y/);
  });

  it("un dépassement sans conséquence sur les totaux ne rend pas le parcours non conforme", () => {
    // 39 crédits d'option suivis, dont 6 perdus dans 75C : 33 comptent quand même.
    const faits = [...OBLIGATOIRES, ...bloc("75C").cours, ...prendre("75D", 1), ...prendre("75Y", 1), ...CHOIX];
    const a = auditer(faits);
    expect(etat(a, "75C").creditsPerdus).toBe(6);
    expect(a.creditsOption).toBe(33);
    expect(a.conforme).toBe(true);
    expect(a.problemes).toEqual([]);
  });
});

describe("auditProgramme — bloc au choix et cours hors programme", () => {
  it("un cours cité par aucun bloc alimente 75Z, le surplus devient des crédits perdus", () => {
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...HORS_BLOCS]);
    expect(etat(a, "75Z").coursAttribues).toEqual(HORS_BLOCS);
    expect(etat(a, "75Z").creditsAttribues).toBe(3);
    expect(etat(a, "75Z").creditsPerdus).toBe(3);
    expect(a.creditsChoix).toBe(3);
    expect(a.conforme).toBe(true); // 3 crédits gaspillés n'empêchent pas de diplômer
  });

  it("sans cours au choix, le problème dit qu'un cours d'option en surplus ne compte pas", () => {
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE]);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 3 crédits de cours au choix/);
    expect(joint(a)).toMatch(/un cours d'option en surplus, non/);
  });

  it("un cours hors programme est signalé quand aucun bloc ne peut l'accueillir", () => {
    const sansChoix: Programme = { ...programme, blocs: programme.blocs.filter((b) => b.id !== "75Z") };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, "ZZZ 9001"], catalogueComplet, sansChoix);
    expect(joint(a)).toMatch(/1 cours fait\(s\) n'entre\(nt\) dans aucun bloc de ce programme \(ZZZ 9001\)/);
  });
});

describe("auditProgramme — ce que le moteur n'a pas pu interpréter ressort", () => {
  it("sur la fixture réelle, les 52 cours sans fiche sont comptés 0 ET signalés", () => {
    // Cas NORMAL d'un scrape incrémental : un bloc cite un cours sans fiche.
    const a = auditProgramme(programme, fixture, new Set(OBLIGATOIRES));
    // Seuls ACT 2250 (75A) et IFT 1015 (75B) ont une fiche parmi les 17 cours
    // obligatoires : 3 + 3 = 6 crédits connus.
    expect(a.creditsObligatoires).toBe(6);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/15 cours marqués faits n'ont aucune fiche dans le catalogue/);
    expect(joint(a)).toMatch(/crédits inconnus, comptés comme 0/);
    expect(joint(a)).toMatch(/au pire trop sévère, jamais trop clément/);
  });

  it("un audit de la fixture avec un parcours vide ne plante pas et explique l'arithmétique", () => {
    const a = auditProgramme(programme, fixture, new Set());
    expect(a.idProgramme).toBe("bac-mathematiques-actuariat");
    expect(a.conforme).toBe(false);
    expect(a.creditsTotal).toBe(0);
    expect(a.blocs).toHaveLength(8);
    expect(joint(a)).toMatch(/il manque 54 crédits de cours obligatoires/);
    expect(joint(a)).toMatch(/il manque 33 crédits de cours d'option/);
    expect(joint(a)).toMatch(/il manque 3 crédits de cours au choix/);
  });

  it("normalise les codes faits et signale ceux qui ne sont pas des codes", () => {
    const a = auditer(["act-2250", "ACT2250", "MATH-1000", "???"]);
    // « act-2250 » et « ACT2250 » sont le même cours : 3 crédits, pas 6.
    expect(etat(a, "75A").creditsAttribues).toBe(3);
    expect(etat(a, "75A").coursAttribues).toEqual(["ACT 2250"]);
    expect(joint(a)).toMatch(/2 code\(s\) de cours fait\(s\) non reconnu\(s\) et ignoré\(s\)/);
    expect(joint(a)).toMatch(/MATH-1000/);
  });

  it("détecte un chevauchement entre blocs au lieu de l'attribuer en silence", () => {
    const avecChevauchement: Programme = {
      ...programme,
      blocs: programme.blocs.map((b) =>
        b.id === "75C" ? { ...b, cours: ["ACT 2250", ...b.cours] } : b,
      ),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_AUX_MINIMUMS], catalogueComplet, avecChevauchement);
    expect(joint(a)).toMatch(/1 cours figure\(nt\) dans plusieurs blocs \(ACT 2250 : 75A \+ 75C\)/);
    expect(joint(a)).toMatch(/l'attribution est directe \(premier bloc déclaré\)/);
    // Attribution déterministe : le premier bloc déclaré gagne.
    expect(etat(a, "75A").coursAttribues).toContain("ACT 2250");
    expect(etat(a, "75C").coursAttribues).not.toContain("ACT 2250");
  });

  it("signale un programme dont les maximums d'option ne peuvent pas atteindre l'exigence", () => {
    const impossible: Programme = { ...programme, creditsTotal: 200 };
    const a = auditer([], catalogueComplet, impossible);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(
      /incohérence des données : le programme exige 143 crédits d'option alors que les maximums des blocs d'option n'en autorisent que 67 crédits/,
    );
  });

  it("signale un bloc d'option qui exige un minimum sans lister de cours", () => {
    const vide: Programme = {
      ...programme,
      blocs: programme.blocs.map((b) => (b.id === "75D" ? { ...b, cours: [] } : b)),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, vide);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/le bloc 75D exige un minimum de 3 crédits mais ne liste aucun cours/);
  });

  it("signale une règle de bloc non interprétée au lieu de l'auditer comme vide", () => {
    const casse: Programme = {
      ...programme,
      blocs: programme.blocs.map((b) =>
        b.id === "75E"
          ? ({ ...b, regle: { type: "quota-inconnu", credits: 9 } } as unknown as Bloc)
          : b,
      ),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, casse);
    expect(a.conforme).toBe(false);
    expect(etat(a, "75E").conforme).toBe(false);
    expect(joint(a)).toMatch(/la règle du bloc 75E n'a pas été interprétée/);
  });
});

describe("auditProgramme — pureté", () => {
  it("ne mute ni le programme, ni le catalogue, ni l'ensemble des cours faits", () => {
    const faits = new Set([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX]);
    const tailleAvant = faits.size;
    const progAvant = JSON.stringify(programme);
    const catAvant = JSON.stringify(catalogueComplet);
    const a1 = auditProgramme(programme, catalogueComplet, faits);
    const a2 = auditProgramme(programme, catalogueComplet, faits);
    expect(faits.size).toBe(tailleAvant);
    expect(JSON.stringify(programme)).toBe(progAvant);
    expect(JSON.stringify(catalogueComplet)).toBe(catAvant);
    expect(a2).toEqual(a1); // déterministe
  });

  it("ne dépend pas de l'ordre d'insertion des cours faits", () => {
    const codes = [...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX];
    const a1 = auditer(codes);
    const a2 = auditer([...codes].reverse());
    expect(a2).toEqual(a1);
  });
});
