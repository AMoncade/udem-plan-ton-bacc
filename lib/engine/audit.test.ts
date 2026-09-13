import { describe, it, expect } from "vitest";
import { auditProgramme } from "./index";
import { cleBloc } from "../codes";
import type { Audit, Bloc, Catalogue, Cours, Programme } from "../types";
import fixtureBrute from "../../data/fixtures/actuariat-verifie.fixture.json";
import {
  EXIGENCES_ACTUARIAT_VERIFIEES,
  adapterCatalogue,
  avecExigences,
  catalogueContenuOuvert,
  ficheTest,
  formeDetectee,
  programmeContenuOuvert,
} from "./donnees-test";

/**
 * La fixture appartient à l'intégratrice et est écrite dans le contrat v1 ;
 * le moteur lit le contrat v2. `adapterCatalogue()` la traduit mécaniquement,
 * en échouant bruyamment sur toute forme qu'elle ne sait pas traduire, et en
 * laissant `exigences: null` — ce qui force le moteur à se rabattre sur la
 * déduction, exactement comme en v1. Voir `./donnees-test.ts`.
 */
const fixture: Catalogue = adapterCatalogue(fixtureBrute);
const programme: Programme = fixture.programmes[0];
/** Le même programme, mais avec les exigences VÉRIFIÉES de la page. */
const programmeAvecExigences: Programme = avecExigences(programme, {
  brut: EXIGENCES_ACTUARIAT_VERIFIEES.brut,
  obligatoire: { ...EXIGENCES_ACTUARIAT_VERIFIEES.obligatoire },
  option: { ...EXIGENCES_ACTUARIAT_VERIFIEES.option },
  choix: { ...EXIGENCES_ACTUARIAT_VERIFIEES.choix },
});

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
  return ficheTest(code, CREDITS_INVENTES[code] ?? 3);
}

const codesDesBlocs = programme.blocs.flatMap((b) => b.cours);
const catalogueComplet: Catalogue = {
  ...fixture,
  cours: Object.fromEntries([...codesDesBlocs, ...HORS_BLOCS].map((c) => [c, fiche(c)])),
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
/** Les problèmes qui ne sont PAS la mise en garde sur la déduction. Sert à
 *  garder les assertions « aucun problème » de la v1 sans les affaiblir : la
 *  note de repli est attendue, tout le reste doit rester vide. */
function problemesHorsRepli(a: Audit): string[] {
  return a.problemes.filter((p) => !p.includes("il est DÉDUIT"));
}
/** La note de repli, qui doit TOUJOURS être là quand `exigences` vaut null. */
const NOTE_DEDUCTION =
  /le total de crédits à option n'est pas écrit dans les données de ce programme : il est DÉDUIT, 90 crédits au total − 54 crédits d'obligatoires − 3 crédits au choix = 33 crédits/;

// Les 54 crédits obligatoires : tous les cours de 01A + 75A + 75B.
const OBLIGATOIRES = [...bloc("01A").cours, ...bloc("75A").cours, ...bloc("75B").cours];
// 18 crédits d'option = EXACTEMENT les minimums des quatre blocs (12 + 3 + 0 + 3).
const OPTION_AUX_MINIMUMS = [...prendre("75C", 4), ...prendre("75D", 1), ...prendre("75Y", 1)];
// 33 crédits d'option, répartis sous les maximums (27 + 3 + 0 + 3).
const OPTION_COMPLETE = [...prendre("75C", 9), ...prendre("75D", 1), ...prendre("75Y", 1)];
const CHOIX = ["ZZZ 9001"];

// ---------------------------------------------------------------------------

describe("pont v1 -> v2 — l'instrument de mesure lui-même", () => {
  it("la fixture du dépôt est encore en contrat v1, et la traduction la rend lisible", () => {
    // Le jour où le scraper livre du v2, CE test change de valeur attendue et
    // dit lequel des deux mondes on est en train de mesurer. Sans lui, la
    // traduction pourrait devenir un no-op ou un mensonge sans qu'on le voie.
    expect(formeDetectee(fixtureBrute)).toBe("v1");
    expect(formeDetectee(fixture)).toBe("v2");
    for (const b of fixture.programmes[0].blocs) {
      expect(b.regle.type).not.toBe("inconnu");
      if (b.regle.type !== "inconnu") {
        expect(typeof b.regle.bornes.min).toBe("number");
        expect(typeof b.regle.bornes.max).toBe("number");
      }
    }
    // La v1 n'avait pas ces champs : ils sont vides, pas inventés.
    expect(programme.exigences).toBeNull();
    expect(programme.notes).toEqual([]);
    expect(fixture.journal).toEqual([]);
  });

  it("refuse de traduire une règle qu'elle ne connaît pas, au lieu de l'avaler", () => {
    const casse = structuredClone(fixtureBrute) as unknown as {
      programmes: { blocs: { regle: unknown }[] }[];
    };
    casse.programmes[0].blocs[0].regle = { type: "quota-par-sigle", credits: 9 };
    expect(() => adapterCatalogue(casse)).toThrow(/type de règle v1 inconnu/);
  });

  it("refuse une règle d'option sans maximum : forme jamais relevée sur le site", () => {
    const casse = structuredClone(fixtureBrute) as unknown as {
      programmes: { blocs: { regle: unknown }[] }[];
    };
    casse.programmes[0].blocs[3].regle = { type: "option", min: 12, max: null };
    expect(() => adapterCatalogue(casse)).toThrow(/sans maximum/);
  });
});

describe("arithmétique de la fixture — vérification des affirmations du brief", () => {
  it("obligatoire = 54, choix = 3, minimums d'option = 18, capacité d'option = 67", () => {
    let obligatoire = 0;
    let choix = 0;
    let minOption = 0;
    let maxOption = 0;
    for (const b of programme.blocs) {
      if (b.regle.type === "inconnu") throw new Error(`règle illisible : ${b.id}`);
      // Contrat v2 : TOUT type connu porte `bornes`, et une exigence exacte
      // s'écrit min === max. La v1 lisait `credits` / `min` / `max`.
      const { min, max } = b.regle.bornes;
      if (b.regle.type === "obligatoire") {
        expect(min).toBe(max); // « Obligatoire - 26 crédits » est exact
        obligatoire += min;
      } else if (b.regle.type === "choix") {
        expect(min).toBe(max);
        choix += min;
      } else {
        minOption += min;
        maxOption += max;
      }
    }
    expect(obligatoire).toBe(54); // 01A 26 + 75A 21 + 75B 7
    expect(choix).toBe(3); // 75Z
    expect(minOption).toBe(18); // 75C 12 + 75D 3 + 75E 0 + 75Y 3
    expect(maxOption).toBe(67); // 27 + 15 + 13 + 12

    // `creditsTotal` peut être null dans le contrat v2 : il ne se suppose pas.
    expect(programme.creditsTotal).toBe(90);
    const total = programme.creditsTotal;
    if (total === null) throw new Error("total absent");
    // Le nombre central du projet n'est écrit NULLE PART dans ces données : il
    // se déduit. C'est pour ça que le moteur garde la déduction en repli.
    expect(total - obligatoire - choix).toBe(33);
    expect(33 - minOption).toBe(15); // l'écart qui fait tout le piège
    expect(JSON.stringify(fixtureBrute)).not.toContain('"33"');
  });

  it("les clés de blocs sont uniques, et ce sont elles qui identifient", () => {
    // `Bloc.id` n'est pas unique dans le contrat v2 (`MM-Bloc 73A` et
    // `S-Bloc 73A` coexistent) : l'audit identifie par `cle`.
    const cles = programme.blocs.map((b) => b.cle);
    expect(new Set(cles).size).toBe(cles.length);
    expect(cles).toContain(cleBloc("01", "01A", ""));
    expect(cles).toContain(cleBloc("75", "75C", "Compléments d'actuariat"));
    const a = auditer([]);
    expect(a.blocs.map((b) => b.cleBloc)).toEqual(cles);
    expect(a.blocs.map((b) => b.idBloc)).toEqual(programme.blocs.map((b) => b.id));
  });

  it("aucun cours n'est cité par deux blocs de l'actuariat (le solveur n'a rien à résoudre)", () => {
    // Vrai ici, FAUX en droit (70K ⊂ 70L) : voir affectation.test.ts.
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
    expect(joint(a)).toMatch(/Remplir chaque bloc d.option à son minimum donne 18 crédits, et le programme en exige 33 crédits/);
    // Le message dit quoi faire, et où il reste de la place.
    expect(joint(a)).toMatch(/place restante : 75C 15 crédits, 75D 12 crédits, 75E 13 crédits, 75Y 9 crédits/);
    // Et il dit que le 33 est déduit, pas lu (contrat v2, point 3 du brief).
    expect(joint(a)).toMatch(NOTE_DEDUCTION);
  });

  it("le même piège quand les 33 crédits sont LUS sur la page au lieu d'être déduits", () => {
    // Chemin `Programme.exigences` : même verdict, sans mise en garde de repli.
    const a = auditer([...OBLIGATOIRES, ...OPTION_AUX_MINIMUMS, ...CHOIX], catalogueComplet, programmeAvecExigences);
    expect(a.creditsOption).toBe(18);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 15 crédits de cours d'option : 18 crédits sur les 33 crédits exigés/);
    // La phrase de la page est citée, et AUCUNE mise en garde de déduction.
    expect(joint(a)).toMatch(/d'après la page \(« 54 crédits obligatoires, 33 crédits à option et 3 crédits au choix »\)/);
    expect(joint(a)).not.toMatch(/DÉDUIT/);
  });

  it("les 15 crédits manquants placés sous les maximums rendent le parcours conforme", () => {
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX]);
    expect(a.creditsObligatoires).toBe(54);
    expect(a.creditsOption).toBe(33);
    expect(a.creditsChoix).toBe(3);
    expect(a.creditsTotal).toBe(90);
    expect(problemesHorsRepli(a)).toEqual([]);
    expect(a.problemes).toHaveLength(1); // la seule note est celle du repli
    expect(joint(a)).toMatch(NOTE_DEDUCTION);
    expect(a.conforme).toBe(true);
  });

  it("le même parcours avec les exigences de la page : conforme et AUCUN problème", () => {
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, programmeAvecExigences);
    expect(a.problemes).toEqual([]);
    expect(a.conforme).toBe(true);
  });

  it("l'exigence d'option est DÉDUITE du total, pas codée en dur (90 -> 33, 93 -> 36)", () => {
    const plusLong: Programme = { ...programme, creditsTotal: 93 };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, plusLong);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 3 crédits de cours d'option : 33 crédits sur les 36 crédits exigés/);
  });

  it("`creditsTotal: null` n'est PAS supposé valoir 90 : la déduction devient impossible et le dit", () => {
    // Contrat v2, point 4 du brief. La v1 écrivait `creditsTotal ?? 0`, ce qui
    // aurait déduit « 0 − 54 − 3 = −57 crédits d'option » sur un vrai programme.
    const sansTotal: Programme = { ...programme, creditsTotal: null };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, sansTotal);
    expect(joint(a)).toMatch(/le total de crédits à option est INCONNU pour ce programme/);
    expect(joint(a)).toMatch(/faute de total de crédits/);
    expect(joint(a)).toMatch(/n'est donc pas concluant/);
    expect(joint(a)).not.toMatch(/il est DÉDUIT/);
    // Et surtout : aucun « incohérence, les obligatoires dépassent les 0 crédits
    // du programme », qui serait le symptôme d'un 0 supposé.
    expect(joint(a)).not.toMatch(/dépassent déjà les/);
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

    // La perte EST dite, mais sans conseil. La v1 se taisait complètement ici,
    // au motif que « déplacez ces cours » n'a de sens que si un manque existe.
    // Le raisonnement valait pour le CONSEIL, pas pour le fait : six crédits
    // réussis qui ne comptent pas restent une information, et c'est justement
    // quand le parcours est par ailleurs conforme que personne ne l'apprendra
    // plus jamais à l'étudiant.
    const perte = a.signaux.filter((s) => s.genre === "perteOuSurplus");
    expect(perte).toHaveLength(1);
    expect(perte[0].message).toMatch(/ne changerait rien/);
    expect(perte[0].message).not.toMatch(/déplacez/);
    expect(perte[0].cleBloc).toBe(bloc("75C").cle);
    // Et rien d'autre : le parcours tient.
    expect(problemesHorsRepli(a).filter((m) => !/dépassent le maximum/.test(m))).toEqual([]);
  });
});

describe("auditProgramme — les totaux par type sont des INTERVALLES", () => {
  /**
   * Droit : « de 30 à 33 crédits à option ». Au-delà, ça ne compte pas.
   * Transposé ici sur les blocs réels de l'actuariat : 54 obligatoires, de 27 à
   * 30 d'option, 3 au choix, pour un total de 84 — l'intervalle et le total sont
   * COUPLÉS, donc 84 est le seul total que 27 d'option peut atteindre.
   */
  const avecIntervalle: Programme = avecExigences({ ...programme, creditsTotal: 84 }, {
    brut: "54 crédits obligatoires, de 27 à 30 crédits à option et 3 crédits au choix (SYNTHÉTIQUE)",
    obligatoire: { min: 54, max: 54 },
    option: { min: 27, max: 30 },
    choix: { min: 3, max: 3 },
  });

  it("un total d'option dans l'intervalle suffit : 27 sur « de 27 à 30 »", () => {
    const a = auditer([...OBLIGATOIRES, ...prendre("75C", 7), ...prendre("75D", 1), ...prendre("75Y", 1), ...CHOIX], catalogueComplet, avecIntervalle);
    expect(a.creditsOption).toBe(27);
    expect(a.conforme).toBe(true);
    expect(a.problemes).toEqual([]);
  });

  it("sous le minimum de l'intervalle, le message cite l'intervalle au lieu d'un nombre exact", () => {
    const a = auditer([...OBLIGATOIRES, ...OPTION_AUX_MINIMUMS, ...CHOIX], catalogueComplet, avecIntervalle);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(
      /il manque 9 crédits de cours d'option : 18 crédits sur le minimum de 27 crédits exigé \(l'intervalle du programme va de 27 crédits à 30 crédits\)/,
    );
  });

  it("au-dessus du maximum de l'intervalle, le surplus est annoncé comme ne comptant pas", () => {
    // 33 crédits d'option alors que le programme en autorise 30 au plus.
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, avecIntervalle);
    expect(a.creditsOption).toBe(33);
    expect(joint(a)).toMatch(
      /3 crédits de cours d'option dépassent le maximum de 30 crédits que le programme autorise pour ce type/,
    );
  });

  it("le minimum d'un TYPE est vérifié pour lui-même, pas seulement via le total", () => {
    /**
     * AJOUTÉ APRÈS UNE MUTATION SURVIVANTE, et c'est tout l'intérêt de la
     * méthode. En retirant du verdict les trois contrôles `manques.* === 0`,
     * AUCUN test ne tombait : sur l'actuariat, la contrainte de total rattrapait
     * toujours le manque d'option, donc le contrôle par type était redondant
     * dans tous mes cas. Le test nommé « 18-contre-33 » mesurait le bon verdict
     * par le mauvais chemin.
     *
     * Le cas qui les sépare : il faut que les maximums par type laissent assez
     * de MOU pour que la somme atteigne le total alors qu'un type reste sous son
     * minimum. Avec un bloc au choix plafonné à 6 (« Choix - Maximum 6 crédits »,
     * une forme réelle du site) :
     *
     *   54 obligatoires + 30 d'option + 6 au choix = 90 = le total exigé,
     *   chaque bloc est dans ses bornes (75Z a un minimum de 0),
     *   et pourtant le programme exige 33 crédits d'option : il en manque 3.
     */
    const avecMou: Programme = avecExigences(
      {
        ...programme,
        blocs: programme.blocs.map((b) =>
          b.id === "75Z"
            ? { ...b, regle: { type: "choix", bornes: { min: 0, max: 6 } }, regleBrut: "Choix - Maximum 6 crédits." }
            : b,
        ),
      },
      {
        brut: "54 crédits obligatoires, de 33 à 60 crédits à option et un maximum de 6 crédits au choix (SYNTHÉTIQUE)",
        obligatoire: { min: 54, max: 54 },
        option: { min: 33, max: 60 },
        choix: { min: 0, max: 6 },
      },
    );
    // 75C 8 cours = 24, 75D 3, 75Y 3 => 30 d'option. Puis 2 cours hors bloc = 6 au choix.
    const faits = [...OBLIGATOIRES, ...prendre("75C", 8), ...prendre("75D", 1), ...prendre("75Y", 1), ...HORS_BLOCS];
    const a = auditer(faits, catalogueComplet, avecMou);

    // Chaque bloc est dans ses bornes : le niveau 1 est entièrement vert.
    for (const b of a.blocs) expect(b.creditsManquants, `bloc ${b.idBloc}`).toBe(0);
    // Et le total du programme est atteint : le niveau 3 est vert aussi.
    expect(a.creditsObligatoires).toBe(54);
    expect(a.creditsOption).toBe(30);
    expect(a.creditsChoix).toBe(6);
    expect(a.creditsTotal).toBe(90);
    expect(joint(a)).not.toMatch(/il manque .* au total du programme/);
    // Seul le minimum du TYPE « option » est violé, et il doit suffire à refuser.
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(
      /il manque 3 crédits de cours d'option : 30 crédits sur le minimum de 33 crédits exigé \(l'intervalle du programme va de 33 crédits à 60 crédits\)/,
    );
  });

  it("les intervalles sont COUPLÉS par la somme : être dans chacun ne suffit pas", () => {
    // Le cas du droit, transposé : chaque type est dans son intervalle, mais la
    // somme des crédits retenus n'atteint pas le total du programme.
    const couple: Programme = avecExigences(
      { ...programme, creditsTotal: 96 },
      {
        brut: "de 51 à 54 crédits obligatoires, de 30 à 39 crédits à option et un maximum de 3 crédits au choix (SYNTHÉTIQUE)",
        obligatoire: { min: 51, max: 54 },
        option: { min: 30, max: 39 },
        choix: { min: 0, max: 3 },
      },
    );
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, couple);
    expect(a.creditsObligatoires).toBe(54); // dans [51, 54]
    expect(a.creditsOption).toBe(33); //       dans [30, 39]
    expect(a.creditsChoix).toBe(3); //         dans [0, 3]
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(
      /chaque type de crédits est dans son intervalle, mais il manque 6 crédits au total du programme : 90 crédits comptent sur les 96 crédits exigés/,
    );
    expect(joint(a)).toMatch(/couplés par la somme/);
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

  it("une règle `inconnu` du contrat v2 n'est PAS auditée comme vide", () => {
    // C'est la forme prévue par le contrat : le scraper a vu une règle qu'il ne
    // sait pas réduire et conserve son texte. Le moteur doit la faire ressortir.
    const inconnue: Programme = {
      ...programme,
      blocs: programme.blocs.map((b) =>
        b.id === "75E" ? { ...b, regle: { type: "inconnu", brut: "Option - trois cours de la même discipline." } } : b,
      ),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, inconnue);
    expect(a.conforme).toBe(false);
    expect(etat(a, "75E").conforme).toBe(false);
    expect(joint(a)).toMatch(/la règle du bloc 75E n'a pas été interprétée/);
  });

  it("un type de règle hors contrat est refusé par la garde d'exhaustivité, pas avalé", () => {
    const casse: Programme = {
      ...programme,
      blocs: programme.blocs.map((b) =>
        b.id === "75E" ? ({ ...b, regle: { type: "quota-inconnu", credits: 9 } } as unknown as Bloc) : b,
      ),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, casse);
    expect(a.conforme).toBe(false);
    expect(etat(a, "75E").conforme).toBe(false);
    expect(joint(a)).toMatch(/la règle du bloc 75E n'a pas été interprétée/);
  });

  it("des bornes impossibles (min > max) ressortent au lieu d'être réordonnées", () => {
    const absurde: Programme = {
      ...programme,
      blocs: programme.blocs.map((b) =>
        b.id === "75D" ? { ...b, regle: { type: "option", bornes: { min: 15, max: 3 } } } : b,
      ),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, absurde);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/la règle du bloc 75D n'a pas été interprétée/);
  });

  it("deux blocs qui portent la même clé sont signalés comme indiscernables", () => {
    // Le cas `MM-Bloc 73A` / `S-Bloc 73A` de la maîtrise, poussé au bout : si le
    // scraper produisait deux clés identiques, l'affectation fusionnerait les
    // deux blocs en silence. C'est le bogue qui a mis 58 cours dans le mauvais
    // bloc pendant la validation.
    const doublon: Programme = {
      ...programme,
      blocs: programme.blocs.map((b) => (b.id === "75D" ? { ...b, cle: bloc("75C").cle } : b)),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, doublon);
    expect(a.conforme).toBe(false);
    // La clé est FABRIQUÉE par la même source que le doublon ci-dessus, jamais
    // écrite en dur : `cleBloc` a gagné le nom du bloc, et une chaîne littérale
    // ici ferait de ce test un instrument à recalibrer à chaque évolution de
    // l'identité d'un bloc — alors que ce qu'il vérifie, c'est la DÉTECTION.
    expect(joint(a)).toContain(`portent la même clé « ${bloc("75C").cle} »`);
  });

  it("les notes normatives de la page sont annoncées comme NON évaluées", () => {
    // « trois cours du bloc 79H ou du bloc 79Y dans la même discipline » est une
    // exigence de diplôme que le contrat ne modélise pas. Le moteur ne peut pas
    // la vérifier ; il doit refuser de faire comme si elle n'existait pas.
    const avecNotes: Programme = {
      ...programme,
      notes: ["L'étudiant doit prendre trois cours du bloc 79 H ou du bloc 79 Y dans la même discipline."],
      blocs: programme.blocs.map((b) =>
        b.id === "75Z" ? { ...b, notes: ["Sauf exception autorisée, les cours au choix…"] } : b,
      ),
    };
    const a = auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX], catalogueComplet, avecNotes);
    expect(joint(a)).toMatch(/2 note\(s\) normative\(s\) de la page échappent au moteur/);
    // Elles ne rendent pas le parcours non conforme : le moteur n'a pas de quoi
    // l'affirmer. Elles rendent le verdict CONDITIONNEL, et le disent.
    expect(a.conforme).toBe(true);
  });
});

describe("auditProgramme — un bloc à CONTENU OUVERT est invérifiable, et le dit", () => {
  /**
   * Cas réel : deux blocs du site n'énumèrent AUCUN cours et décrivent leur
   * contenu en prose — `baccalaureat-en-economie-et-politique` 71/71G et
   * `baccalaureat-en-musique` 02/02E, « Option - maximum 6 crédits » renvoyant
   * aux cours du Centre de langues, sans aucun lien de cours dans le HTML.
   *
   * Ce n'est ni un bloc au choix ni une page mal lue, et c'est pour ça que
   * `Bloc.contenuOuvert` existe : sans lui, la seule façon de le reconnaître
   * serait de deviner d'après `notes`.
   */
  const OBLIG_71 = ["POL 1001", "POL 1002", "ECN 1001", "ECN 1002"];

  it("sans minimum : il n'empêche pas de diplômer, mais l'audit refuse de le déclarer vérifié", () => {
    const a = auditProgramme(programmeContenuOuvert(), catalogueContenuOuvert(), new Set(OBLIG_71));
    expect(a.creditsObligatoires).toBe(12);
    expect(a.creditsOption).toBe(0);
    // NI IMPOSSIBLE : aucun « il manque 6 crédits dans le bloc 71G », qui serait
    // un reproche que l'étudiant ne peut pas corriger ici.
    expect(etat(a, "71G").creditsManquants).toBe(0);
    expect(joint(a)).not.toMatch(/il manque .* dans le bloc 71G/);
    // Ni confondu avec un bloc d'option aux données incomplètes.
    expect(joint(a)).not.toMatch(/ne liste aucun cours : données de programme incomplètes/);
    // NI SATISFAIT EN SILENCE : le problème est dit, avec la règle verbatim et
    // la prose de la page.
    expect(joint(a)).toMatch(
      /le bloc 71G \(Cours de langues\) \(« Option - maximum 6 crédits\. »\) n'énumère aucun cours/,
    );
    expect(joint(a)).toMatch(/l'audit ne peut ni compter ni vérifier ce que vous y avez fait/);
    expect(joint(a)).toMatch(/Centre de langues/);
    // Le verdict reste calculable : le programme diplôme.
    expect(a.conforme).toBe(true);
  });

  it("avec un minimum : le verdict devient NON AFFIRMABLE, et le message le distingue d'un manque", () => {
    const a = auditProgramme(
      programmeContenuOuvert(3),
      catalogueContenuOuvert(3),
      new Set(OBLIG_71),
    );
    expect(a.conforme).toBe(false);
    expect(etat(a, "71G").conforme).toBe(false);
    expect(etat(a, "71G").creditsManquants).toBe(0); // toujours pas un reproche
    expect(joint(a)).toMatch(/l'audit NE PEUT PAS établir la conformité de ce programme/);
    expect(joint(a)).toMatch(/ce n'est pas « il vous manque des crédits », c'est « je ne sais pas vérifier »/);
    expect(joint(a)).not.toMatch(/il manque .* dans le bloc 71G/);
  });

  it("son minimum invérifiable refuse la conformité POUR LUI-MÊME, pas via le total du type", () => {
    /**
     * AJOUTÉ APRÈS UNE MUTATION SURVIVANTE, la seconde fois que cette méthode
     * attrape la même faute. En retirant du verdict le contrôle des blocs
     * ouverts non affirmables, aucun test ne tombait : dans le cas précédent
     * l'étudiant n'avait aucun crédit d'option, donc c'était le TOTAL du type
     * qui refusait la conformité, pas la règle testée.
     *
     * Le cas qui les sépare : un second bloc d'option, ORDINAIRE, qui permet
     * d'atteindre le minimum du type. Ici 71H donne 6 crédits d'option, donc le
     * type est satisfait, le total du programme aussi, chaque bloc est dans ses
     * bornes — et il reste que personne ne peut dire si les 3 crédits de langues
     * exigés par 71G ont été faits.
     */
    const faits = [...OBLIG_71, "POL 2001", "POL 2002"];
    const a = auditProgramme(programmeContenuOuvert(3), catalogueContenuOuvert(3), new Set(faits));

    // Tout ce qui est vérifiable est vert.
    expect(a.creditsObligatoires).toBe(12);
    expect(a.creditsOption).toBe(6); // >= le minimum de type, qui est 3
    expect(a.creditsTotal).toBe(18); // >= les 12 crédits du programme
    expect(joint(a)).not.toMatch(/il manque .* de cours d'option/);
    expect(joint(a)).not.toMatch(/il manque .* au total du programme/);
    for (const b of a.blocs) expect(b.creditsManquants, `bloc ${b.idBloc}`).toBe(0);

    // Et pourtant le verdict ne peut pas être rendu, à cause du seul 71G.
    expect(a.conforme).toBe(false);
    expect(etat(a, "71G").conforme).toBe(false);
    expect(etat(a, "71H").conforme).toBe(true);
    expect(joint(a)).toMatch(/l'audit NE PEUT PAS établir la conformité de ce programme/);
  });

  it("il n'aspire pas les cours hors bloc : ce n'est pas un bloc au choix", () => {
    // 71G est de type « option », mais même un bloc « Choix » à contenu ouvert
    // ne doit pas servir de joker : sa liste est vide parce que son contenu vit
    // ailleurs, pas parce que n'importe quoi convient.
    const commeChoix: Programme = {
      ...programmeContenuOuvert(),
      blocs: programmeContenuOuvert().blocs.map((b) =>
        b.id === "71G"
          ? { ...b, regle: { type: "choix", bornes: { min: 0, max: 6 } }, regleBrut: "Choix - Maximum 6 crédits." }
          : b,
      ),
    };
    const a = auditProgramme(commeChoix, catalogueContenuOuvert(), new Set([...OBLIG_71, "ZZZ 9001"]));
    expect(etat(a, "71G").coursAttribues).toEqual([]);
    expect(joint(a)).toMatch(/1 cours fait\(s\) n'entre\(nt\) dans aucun bloc de ce programme \(ZZZ 9001\)/);
    expect(joint(a)).toMatch(/n'énumère aucun cours/);
  });

  it("un bloc ordinaire à liste vide reste diagnostiqué comme donnée incomplète", () => {
    // La distinction que `contenuOuvert` sert à faire, vue de l'autre côté : le
    // MÊME bloc sans le drapeau redevient une lacune de scrape.
    const sansDrapeau: Programme = {
      ...programmeContenuOuvert(3),
      blocs: programmeContenuOuvert(3).blocs.map((b) =>
        b.id === "71G" ? { ...b, contenuOuvert: false } : b,
      ),
    };
    const a = auditProgramme(sansDrapeau, catalogueContenuOuvert(3), new Set(OBLIG_71));
    expect(joint(a)).toMatch(/le bloc 71G exige un minimum de 3 crédits mais ne liste aucun cours : données de programme incomplètes/);
    expect(joint(a)).not.toMatch(/je ne sais pas vérifier/);
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

/**
 * « ATTEINDRE CHAQUE MINIMUM NE SUFFIT PAS » — une phrase qui n'est vraie que
 * parfois, et qui était dite toujours.
 *
 * Le test voisin (actuariat : minimums 18, exigé 33) épingle le cas où elle est
 * VRAIE. Il ne pouvait donc pas attraper qu'elle était émise sans garde : la
 * phrase s'accrochait à « il manque des crédits d'option », jamais à une
 * comparaison entre la somme des minimums et l'exigé.
 *
 * Observé sur `/audit` par un audit externe : le bacc. en informatique
 * orientation générale porte 7 blocs d'option totalisant 40 crédits de minimums
 * pour 27 exigés. L'aperçu disait « satisfaire chaque bloc SUFFIT », les
 * signaux disaient l'inverse, à 400 px d'écart sur la même page — et c'est
 * l'aperçu qui avait raison.
 */
describe("le total d'option : la phrase n'est dite que quand elle est vraie", () => {
  const blocOption = (id: string, min: number, max: number, cours: string[]): Bloc => ({
    id,
    cle: cleBloc("70", id, ""),
    segment: "70",
    nom: "",
    regle: { type: "option", bornes: { min, max } },
    regleBrut: `Option - Minimum ${min} crédits, maximum ${max} crédits.`,
    cours,
    contenuOuvert: false,
    notes: [],
  });

  /** `exigeOption` crédits exigés, deux blocs d'option à `minBloc` chacun. */
  const programmeOption = (exigeOption: number, minBloc: number): Programme => ({
    id: "test-total-option",
    nom: "Programme SYNTHÉTIQUE (forme du bacc. en informatique orientation générale)",
    orientation: null,
    segments: ["70"],
    orientations: [],
    cycle: "1er cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Baccalauréat",
    creditsTotal: exigeOption,
    exigences: {
      brut: `${exigeOption} crédits à option (SYNTHÉTIQUE)`,
      obligatoire: { min: 0, max: 0 },
      option: { min: exigeOption, max: exigeOption },
      choix: { min: 0, max: 0 },
    },
    blocs: [
      blocOption("70A", minBloc, 30, ["IFT 1000", "IFT 1010", "IFT 1020"]),
      blocOption("70B", minBloc, 30, ["IFT 2000", "IFT 2010", "IFT 2020"]),
    ],
    notes: [],
    url: "https://exemple.invalide/test-total-option",
    scrapeISO: "2026-09-13T00:00:00.000Z",
  });

  const FICHES = ["IFT 1000", "IFT 1010", "IFT 1020", "IFT 2000", "IFT 2010", "IFT 2020"].map((c) =>
    ficheTest(c, 3),
  );
  const auditerOption = (p: Programme, faits: string[]) =>
    auditProgramme(p, { programmes: [p], cours: Object.fromEntries(FICHES.map((f) => [f.code, f])), prealablesNonParses: [], journal: [], scrapeISO: "" } as Catalogue, new Set(faits));

  it("minimums SUPÉRIEURS à l'exigé : la phrase ne doit PAS être dite", () => {
    // 9 + 9 = 18 de minimums pour 12 exigés : remplir chaque bloc suffit,
    // et même dépasse. C'est le cas du bacc. en informatique (40 pour 27).
    const p = programmeOption(12, 9);
    const a = auditerOption(p, ["IFT 1000"]);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 9 crédits de cours d'option/);
    expect(joint(a)).not.toMatch(/Remplir chaque bloc d.option à son minimum donne/);
  });

  it("minimums INFÉRIEURS à l'exigé : la phrase doit être dite", () => {
    // Le contrôle qui empêche la sur-correction : 3 + 3 = 6 pour 12 exigés,
    // remplir chaque bloc laisse l'étudiant à 6 crédits du compte.
    const p = programmeOption(12, 3);
    const a = auditerOption(p, ["IFT 1000"]);
    expect(joint(a)).toMatch(/Remplir chaque bloc d.option à son minimum donne 6 crédits, et le programme en exige 12 crédits/);
    expect(joint(a)).toMatch(/donne 6 crédits, et le programme en exige 12 crédits/);
  });

  it("minimums ÉGAUX à l'exigé : la phrase ne doit pas être dite", () => {
    // La borne. 6 + 6 = 12 pour 12 exigés : satisfaire chaque bloc suffit
    // exactement, donc « ne suffit pas » serait faux.
    const p = programmeOption(12, 6);
    const a = auditerOption(p, ["IFT 1000"]);
    expect(joint(a)).toMatch(/donne exactement les 12 crédits exigés/);
  });
});

/**
 * Le cas STRICTEMENT SUPÉRIEUR se tait, et ce n'est pas un oubli.
 *
 * Quand les minimums des blocs dépassent le total d'option annoncé, les blocs
 * FORCENT plus que le programme n'exige : c'est déjà rapporté comme une
 * incohérence de données. Y ajouter « satisfaire chaque bloc suffit » mettrait
 * une phrase rassurante à côté d'une contradiction — les deux conclusions
 * opposées que le correctif venait de fermer, reconstituées autrement.
 */
describe("le total d'option : minimums STRICTEMENT supérieurs", () => {
  const blocOption = (id: string, min: number, max: number, cours: string[]): Bloc => ({
    id,
    cle: cleBloc("70", id, ""),
    segment: "70",
    nom: "",
    regle: { type: "option", bornes: { min, max } },
    regleBrut: `Option - Minimum ${min} crédits, maximum ${max} crédits.`,
    cours,
    contenuOuvert: false,
    notes: [],
  });
  const FICHES2 = ["IFT 1000", "IFT 1010", "IFT 2000", "IFT 2010"].map((c) => ficheTest(c, 3));

  it("l'incohérence parle, la phrase rassurante se tait", () => {
    const p: Programme = {
      id: "test-option-superieur",
      nom: "Programme SYNTHÉTIQUE : les blocs forcent plus que le total annoncé",
      orientation: null,
      segments: ["70"],
      orientations: [],
      cycle: "1er cycle",
      faculte: "Arts et sciences",
      typeProgramme: "Baccalauréat",
      creditsTotal: 12,
      exigences: {
        brut: "12 crédits à option (SYNTHÉTIQUE)",
        obligatoire: { min: 0, max: 0 },
        option: { min: 12, max: 12 },
        choix: { min: 0, max: 0 },
      },
      blocs: [
        blocOption("70A", 9, 30, ["IFT 1000", "IFT 1010"]),
        blocOption("70B", 9, 30, ["IFT 2000", "IFT 2010"]),
      ],
      notes: [],
      url: "https://exemple.invalide/test-option-superieur",
      scrapeISO: "2026-09-13T00:00:00.000Z",
    };
    const a = auditProgramme(
      p,
      {
        programmes: [p],
        cours: Object.fromEntries(FICHES2.map((f) => [f.code, f])),
        prealablesNonParses: [],
        journal: [],
        scrapeISO: "",
      } as Catalogue,
      new Set(["IFT 1000"]),
    );
    // 9 + 9 = 18 forcés pour 12 exigés : la page se contredit, et on le dit.
    expect(joint(a)).toMatch(/incohérence des données : les minimums des blocs d'option totalisent 18 crédits/);
    // Et on n'ajoute AUCUNE des deux phrases sur la suffisance.
    expect(joint(a)).not.toMatch(/Remplir chaque bloc d.option à son minimum donne/);
    expect(joint(a)).not.toMatch(/donne exactement les/);
  });
});

/**
 * `signaux` et `problemes` : deux listes remplies au même endroit, et un test
 * qui vérifie qu'elles ne se séparent pas.
 *
 * `problemes` n'est PAS dérivé de `signaux`, délibérément : dériver rendrait la
 * divergence impossible mais déplacerait le risque — reformuler un message
 * changerait le texte de trois écrans sans qu'aucun test ne le dise, et les
 * tests qui épinglent ces phrases vivent dans `tests/coutures.test.ts`. Le prix
 * de ce choix est qu'une divergence devient possible ; ce test est ce qui la
 * rend bruyante.
 *
 * Comparaison TRIÉE et non en ensembles : insensible à l'ordre — réordonner les
 * émissions ne casse rien et ne doit pas faire tomber un test, sinon il finit
 * désactivé — mais sensible au NOMBRE, qu'un `Set` effacerait en silence si un
 * message était émis deux fois d'un seul côté.
 */
describe("accord entre signaux et problemes", () => {
  const auditsVaries = (): Audit[] => [
    auditer([]),
    auditer([...OBLIGATOIRES]),
    auditer([...OBLIGATOIRES, ...OPTION_COMPLETE, ...CHOIX]),
    auditProgramme(programmeContenuOuvert(6), catalogueContenuOuvert(6), new Set<string>()),
  ];

  it("portent exactement les mêmes messages, dans n'importe quel ordre", () => {
    for (const a of auditsVaries()) {
      expect([...a.signaux.map((s) => s.message)].sort()).toEqual([...a.problemes].sort());
    }
  });

  it("chaque signal porte un genre de l'union, jamais une chaîne libre", () => {
    const connus = new Set([
      "bloque",
      "choixAttendu",
      "perteOuSurplus",
      "nonVerifiable",
      "donneesAmont",
      "informatif",
    ]);
    for (const a of auditsVaries()) {
      for (const s of a.signaux) {
        expect(connus.has(s.genre), `genre inattendu : ${s.genre} — « ${s.message} »`).toBe(true);
      }
    }
  });

  it("un signal qui parle d'un bloc nomme ce bloc", () => {
    // C'est ce qui permet à l'écran de l'ancrer SOUS la ligne du bloc plutôt
    // que dans une liste globale, à vingt lignes de ce qu'il explique.
    const a = auditer([]);
    const surBloc = a.signaux.filter((s) => /dans le bloc /.test(s.message));
    expect(surBloc.length).toBeGreaterThan(0);
    for (const s of surBloc) expect(s.cleBloc, `sans cleBloc : « ${s.message} »`).toBeDefined();
  });

  it("un signal qui ne vise aucun bloc n'invente pas de clé", () => {
    // Contrôle symétrique : un total d'option n'appartient à aucun bloc, et lui
    // en attribuer un serait pire que de le laisser dans la liste globale.
    const a = auditer([...OBLIGATOIRES]);
    const surTotal = a.signaux.filter((s) => /crédits de cours d'option/.test(s.message));
    expect(surTotal.length).toBeGreaterThan(0);
    for (const s of surTotal) expect(s.cleBloc).toBeUndefined();
  });

  it("les genres attendus apparaissent sur un parcours vide", () => {
    // Sans ce contrôle, les tests ci-dessus passeraient sur une liste vide.
    const genres = new Set(auditer([]).signaux.map((s) => s.genre));
    expect(genres.has("bloque")).toBe(true);
    expect(genres.has("informatif")).toBe(true);
  });
});
