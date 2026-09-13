import { describe, it, expect } from "vitest";
import { auditProgramme } from "./index";
import { compositions, resoudreAffectation, type BlocAffectable, type ExigencesTotaux } from "./affectation";
import { bornesDeRegle } from "./bornes";
import type { Audit, Catalogue, Programme } from "../types";
import {
  COURS_70K,
  COURS_70L,
  CREDITS_DRT_SUPPOSES,
  catalogueChevauchement,
  programmeChevauchement,
} from "./donnees-test";

/**
 * L'AFFECTATION SOUS BORNES — le morceau que la v1 n'avait pas.
 *
 * La v1 attribuait chaque cours au premier bloc qui le cite, en documentant
 * l'hypothèse « aucun chevauchement » et en notant que son erreur est à sens
 * unique. La validation a trouvé le contre-exemple sur un vrai programme :
 * bacc. en droit, bloc 70K (« Option - 3 crédits. ») entièrement contenu dans
 * le bloc 70L (« Option - Maximum 9 crédits. »), onze cours communs.
 *
 * Les données de ce fichier viennent de `./donnees-test.ts`, où la frontière
 * entre ce qui est RELEVÉ sur la page et ce qui est INVENTÉ pour clore
 * l'arithmétique est marquée ligne par ligne.
 */

const programme: Programme = programmeChevauchement();
const catalogue: Catalogue = catalogueChevauchement();
const OBLIGATOIRES = ["DRT 1001", "DRT 1002"];

function auditer(faits: string[], prog: Programme = programme, cat: Catalogue = catalogue): Audit {
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

/**
 * L'ATTRIBUTION DIRECTE DE LA v1, reconstruite ici pour que le test MONTRE ce
 * qu'elle donnait au lieu de l'affirmer en commentaire.
 *
 * Chaque cours va au premier bloc déclaré qui le cite ; les crédits au-delà du
 * maximum d'un bloc sont perdus. C'est exactement l'algorithme remplacé.
 */
function attributionDirecte(prog: Programme, faits: string[]): { option: number; parBloc: Map<string, number> } {
  const parBloc = new Map<string, number>(prog.blocs.map((b) => [b.id, 0]));
  for (const code of [...faits].sort()) {
    const cible = prog.blocs.find((b) => b.cours.includes(code)) ?? prog.blocs.find((b) => b.cours.length === 0);
    if (!cible) continue;
    parBloc.set(cible.id, (parBloc.get(cible.id) ?? 0) + CREDITS_DRT_SUPPOSES);
  }
  let option = 0;
  for (const b of prog.blocs) {
    const bornes = bornesDeRegle(b.regle);
    const comptes = Math.min(parBloc.get(b.id) ?? 0, bornes.max);
    parBloc.set(b.id, comptes);
    if (bornes.type === "option") option += comptes;
  }
  return { option, parBloc };
}

// ---------------------------------------------------------------------------

describe("le chevauchement 70K ⊂ 70L est bien ce que le relevé décrit", () => {
  it("les onze cours de 70K sont tous dans 70L, et 70L en a sept de plus", () => {
    expect(COURS_70K).toHaveLength(11);
    expect(COURS_70L).toHaveLength(18);
    for (const c of COURS_70K) expect(COURS_70L).toContain(c);
    expect(COURS_70L.filter((c) => !COURS_70K.includes(c))).toHaveLength(7);
  });

  it("70K est déclaré AVANT 70L : l'attribution directe y enverrait tout", () => {
    const ids = programme.blocs.map((b) => b.id);
    expect(ids.indexOf("70K")).toBeLessThan(ids.indexOf("70L"));
  });

  it("les règles relevées se lisent bien dans le contrat v2", () => {
    const k = programme.blocs.find((b) => b.id === "70K")!;
    const l = programme.blocs.find((b) => b.id === "70L")!;
    expect(k.regleBrut).toBe("Option - 3 crédits.");
    // « Option - N crédits. » est la forme EXACTE, celle que la v1 ne savait pas
    // écrire du tout : elle devient min === max.
    expect(bornesDeRegle(k.regle)).toEqual({ type: "option", min: 3, max: 3, illisible: null });
    expect(l.regleBrut).toBe("Option - Maximum 9 crédits.");
    expect(bornesDeRegle(l.regle)).toEqual({ type: "option", min: 0, max: 9, illisible: null });
  });
});

describe("UN PARCOURS CONFORME AVEC CHEVAUCHEMENT EST DÉCLARÉ CONFORME", () => {
  // Le test exigé par le brief. C'est le cas du relevé, mot pour mot :
  // « Un étudiant qui suit DRT 3910, 3911, 3912 et 3913 (12 crédits) doit voir
  //   3 crédits attribués à 70K — exactement, c'est un Option - 3 crédits. — et
  //   au plus 9 à 70L. »
  const QUATRE = ["DRT 3910", "DRT 3911", "DRT 3912", "DRT 3913"];
  const faits = [...OBLIGATOIRES, ...QUATRE];

  it("4 cours communs à 70K et 70L : 3 crédits dans 70K, 9 dans 70L, CONFORME", () => {
    const a = auditer(faits);

    expect(etat(a, "70K").creditsAttribues).toBe(3); // exactement son exigence
    expect(etat(a, "70K").coursAttribues).toHaveLength(1);
    expect(etat(a, "70L").creditsAttribues).toBe(9); // exactement son maximum
    expect(etat(a, "70L").coursAttribues).toHaveLength(3);
    // Aucun crédit perdu : l'affectation a tout placé utilement.
    expect(a.blocs.every((b) => b.creditsPerdus === 0)).toBe(true);
    // Les quatre cours sont répartis, chacun dans UN seul bloc.
    const tous = a.blocs.flatMap((b) => b.coursAttribues);
    expect([...tous].sort()).toEqual([...faits].sort());
    expect(new Set(tous).size).toBe(tous.length);

    expect(a.creditsObligatoires).toBe(6);
    expect(a.creditsOption).toBe(12);
    expect(a.creditsTotal).toBe(18);
    expect(a.conforme).toBe(true);
  });

  it("l'attribution directe de la v1, sur CE parcours, aurait dit non conforme", () => {
    // La démonstration du contre-exemple : pas une affirmation, un calcul.
    const directe = attributionDirecte(programme, faits);
    expect(directe.parBloc.get("70K")).toBe(3); // 12 crédits empilés, 3 retenus
    expect(directe.parBloc.get("70L")).toBe(0); // laissé vide
    expect(directe.option).toBe(3); // au lieu de 12
    expect(directe.option).toBeLessThan(programme.exigences!.option!.min);

    // Et le moteur, lui, trouve les 12.
    const a = auditer(faits);
    expect(a.creditsOption).toBe(12);
    expect(a.conforme).toBe(true);
  });

  it("le problème de chevauchement dit que l'affectation est RÉSOLUE et exhibe la preuve", () => {
    const a = auditer(faits);
    // Onze cours sont cités par deux blocs : l'information remonte toujours.
    expect(joint(a)).toMatch(/11 cours figure\(nt\) dans plusieurs blocs/);
    expect(joint(a)).toMatch(/DRT 3910 : 70K \+ 70L/);
    expect(joint(a)).toMatch(/résolue sous bornes, et non attribuée au premier bloc déclaré/);
    expect(joint(a)).toMatch(/L'affectation retenue est la PREUVE que le parcours tient/);
    expect(joint(a)).toMatch(/70K ← DRT 39\d\d ; 70L ← DRT 39\d\d, DRT 39\d\d, DRT 39\d\d/);
    // Le chevauchement ne rend PAS le parcours non conforme.
    expect(a.conforme).toBe(true);
  });

  it("le verdict ne dépend pas de l'ordre des cours faits ni de l'ordre des blocs", () => {
    const a1 = auditer(faits);
    const a2 = auditer([...faits].reverse());
    expect(a2).toEqual(a1);
    // 70L déclaré avant 70K : l'affectation change de forme, pas de verdict.
    const inverse: Programme = {
      ...programme,
      blocs: [programme.blocs[0], programme.blocs[2], programme.blocs[1], programme.blocs[3]],
    };
    const a3 = auditer(faits, inverse);
    expect(a3.conforme).toBe(true);
    expect(a3.creditsOption).toBe(12);
    expect(etat(a3, "70K").creditsAttribues).toBe(3);
    expect(etat(a3, "70L").creditsAttribues).toBe(9);
  });
});

describe("affectation — les cas voisins, pour que le test du dessus ne passe pas par accident", () => {
  it("trop peu de cours : non conforme, et c'est démontré sur TOUTES les affectations", () => {
    const a = auditer([...OBLIGATOIRES, "DRT 3910", "DRT 3911"]); // 6 crédits d'option
    expect(a.creditsOption).toBe(6);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 6 crédits de cours d'option : 6 crédits sur les 12 crédits exigés/);
    expect(joint(a)).toMatch(/Aucune des \d+ affectations possibles ne satisfait toutes les bornes/);
    // Pas de troncature : le « non conforme » est une preuve.
    expect(joint(a)).not.toMatch(/TRONQUÉE/);
  });

  it("un cours de 70K seul remplit 70K sans rien laisser à 70L, qui a un minimum de 0", () => {
    const a = auditer([...OBLIGATOIRES, "DRT 3910"]);
    expect(etat(a, "70K").conforme).toBe(true); // 3 sur 3
    expect(etat(a, "70L").conforme).toBe(true); // 0 sur un minimum de 0
    // Mais le total d'option reste court : le piège 18-contre-33, en petit.
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 9 crédits de cours d'option/);
  });

  it("cinq cours communs : conforme, avec exactement 3 crédits perdus et non 6", () => {
    // 15 crédits pour 12 de capacité utile (3 dans 70K + 9 dans 70L) : un cours
    // doit être gaspillé, mais UN SEUL. Le solveur minimise aussi ça.
    const cinq = ["DRT 3910", "DRT 3911", "DRT 3912", "DRT 3913", "DRT 3914"];
    const a = auditer([...OBLIGATOIRES, ...cinq]);
    expect(a.creditsOption).toBe(12);
    expect(a.conforme).toBe(true);
    const perdus = a.blocs.reduce((s, b) => s + b.creditsPerdus, 0);
    expect(perdus).toBe(3);
    // Les cinq cours restent visibles quelque part : rien n'a disparu.
    expect(a.blocs.flatMap((b) => b.coursAttribues).filter((c) => cinq.includes(c))).toHaveLength(5);
  });

  it("des cours de 70L seul ne peuvent PAS remplir 70K : non conforme, et c'est juste", () => {
    // DRT 3947..3991 ne sont que dans 70L. 70K exige 3 crédits et reste vide :
    // aucune affectation ne peut le sauver, et le solveur ne doit pas prétendre
    // le contraire.
    const horsK = ["DRT 3947", "DRT 3948", "DRT 3951", "DRT 3965"];
    const a = auditer([...OBLIGATOIRES, ...horsK]);
    expect(etat(a, "70K").creditsAttribues).toBe(0);
    expect(etat(a, "70K").conforme).toBe(false);
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/il manque 3 crédits dans le bloc 70K \(Formation pratique\) : 0 crédit sur un minimum de 3 crédits/);
  });

  it("un cours de 70K suffit à sauver 70K quand les autres sont hors de 70K", () => {
    // 70K ← DRT 3910 (3) ; 70L ← trois cours qui ne sont que dans 70L (9).
    const faits = [...OBLIGATOIRES, "DRT 3910", "DRT 3947", "DRT 3948", "DRT 3951"];
    const a = auditer(faits);
    expect(etat(a, "70K").coursAttribues).toEqual(["DRT 3910"]);
    expect(etat(a, "70L").creditsAttribues).toBe(9);
    expect(a.conforme).toBe(true);
  });

  it("le maximum de 70L tient : onze cours communs ne donnent pas 33 crédits d'option", () => {
    const a = auditer([...OBLIGATOIRES, ...COURS_70K]);
    expect(a.creditsOption).toBe(12); // 3 + 9, pas 33
    expect(a.conforme).toBe(true);
    const perdus = a.blocs.reduce((s, b) => s + b.creditsPerdus, 0);
    expect(perdus).toBe(21); // 33 − 12 : réussis, mais hors des bornes des blocs
    // 21 est le MINIMUM atteignable : 70K retient 3 quoi qu'il arrive et 70L 9
    // au plus. Aucune affectation ne fait mieux.
    for (let dansK = 1; dansK <= 11; dansK++) {
      const perte = 33 - 3 - Math.min(3 * (11 - dansK), 9);
      expect(perte).toBeGreaterThanOrEqual(21);
    }
    expect(etat(a, "70K").creditsPerdus + etat(a, "70L").creditsPerdus).toBe(21);

    // La perte est DITE — 21 crédits réussis qui ne comptent pas ne peuvent pas
    // disparaître d'un audit — mais sans le conseil « déplacez ces cours » :
    // le commentaire ci-dessus démontre que 21 est le minimum atteignable, donc
    // aucun déplacement ne gagnerait quoi que ce soit. Conseiller un remède qui
    // n'existe pas serait pire que se taire ; dire la perte sans remède est ce
    // qu'il faut.
    expect(joint(a)).toMatch(/dépassent le maximum du bloc/);
    expect(joint(a)).toMatch(/ne changerait rien/);
    expect(joint(a)).not.toMatch(/déplacez/);
  });
});

describe("affectation — garanties et limites annoncées", () => {
  /** Harnais direct sur le solveur, pour éprouver ce que l'audit ne montre pas. */
  function blocs(defs: Array<{ cle: string; min: number; max: number; cours: string[]; joker?: boolean }>): BlocAffectable[] {
    return defs.map((d) => ({
      cle: d.cle,
      id: d.cle,
      bornes: { type: "option", min: d.min, max: d.max, illisible: null },
      cours: new Set(d.cours),
      joker: d.joker ?? false,
    }));
  }
  const sansTotaux: ExigencesTotaux = {
    obligatoire: { min: 0, max: Infinity },
    option: { min: 0, max: Infinity },
    choix: { min: 0, max: Infinity },
    creditsTotal: null,
  };

  it("G4 : la PREMIÈRE affectation essayée est celle de la v1 (tout au premier bloc)", () => {
    // Aucune affectation ne peut satisfaire ces bornes, donc la recherche est
    // exhaustive et `explorees` compte toutes les feuilles.
    const r = resoudreAffectation(
      blocs([
        { cle: "A", min: 99, max: 99, cours: ["X 1000", "X 1001"] },
        { cle: "B", min: 99, max: 99, cours: ["X 1000", "X 1001"] },
      ]),
      ["X 1000", "X 1001"],
      () => 3,
      sansTotaux,
    );
    expect(r.nbAmbigus).toBe(2);
    expect(r.nbGroupes).toBe(1); // R2 : deux cours interchangeables = un groupe
    expect(r.combinaisons).toBe(3); // (2,0), (1,1), (0,2)
    expect(r.explorees).toBe(3);
    expect(r.tronquee).toBe(false);
  });

  it("R1 : sans ambiguïté, il n'y a rien à chercher (le cas de l'actuariat)", () => {
    const r = resoudreAffectation(
      blocs([
        { cle: "A", min: 3, max: 9, cours: ["X 1000"] },
        { cle: "B", min: 3, max: 9, cours: ["X 1001"] },
      ]),
      ["X 1000", "X 1001"],
      () => 3,
      sansTotaux,
    );
    expect(r.nbAmbigus).toBe(0);
    expect(r.nbGroupes).toBe(0);
    expect(r.combinaisons).toBe(1);
    expect(r.explorees).toBe(1);
    expect(r.parCle.get("A")).toEqual(["X 1000"]);
    expect(r.parCle.get("B")).toEqual(["X 1001"]);
  });

  it("R2 : onze cours interchangeables font 12 affectations, pas 2 048", () => {
    const r = resoudreAffectation(
      blocs([
        { cle: "70K", min: 3, max: 3, cours: [...COURS_70K] },
        { cle: "70L", min: 0, max: 9, cours: [...COURS_70L] },
      ]),
      [...COURS_70K],
      () => 3,
      sansTotaux,
    );
    expect(r.nbAmbigus).toBe(11);
    expect(r.nbGroupes).toBe(1);
    expect(r.combinaisons).toBe(12); // et non 2^11
    expect(compositions(11, 2)).toBe(12);
  });

  it("N1 : au-delà du plafond, la recherche se déclare TRONQUÉE au lieu de conclure", () => {
    // Bornes impossibles + beaucoup de groupes : la recherche ne peut pas finir,
    // et le verdict négatif n'est alors pas une preuve. C'est dit, pas caché.
    const defs = Array.from({ length: 6 }, (_, i) => ({
      cle: `B${i}`,
      min: 999,
      max: 999,
      cours: Array.from({ length: 8 }, (_, j) => `X ${1000 + j}`),
    }));
    const r = resoudreAffectation(
      blocs(defs),
      Array.from({ length: 8 }, (_, j) => `X ${1000 + j}`),
      () => 3,
      sansTotaux,
      50, // plafond abaissé pour que le test soit rapide ET déterministe
    );
    expect(r.tronquee).toBe(true);
    expect(r.explorees).toBeLessThanOrEqual(50);
    expect(r.combinaisons).toBeGreaterThan(50);
  });

  it("N1 bis : l'audit REFUSE de présenter un verdict tronqué comme démontré", () => {
    // Le plafond du moteur n'est pas réglable depuis l'audit : on force donc la
    // troncature avec un programme dont la combinatoire dépasse vraiment le
    // plafond. Sept blocs qui citent tous les mêmes douze cours, et des crédits
    // de six valeurs différentes — donc six groupes d'équivalence de deux cours,
    // soit C(8,6)^6 = 28^6 ≈ 4,8 × 10^8 affectations. Et rien n'est satisfiable :
    // 90 crédits suivis pour 7 × 14 = 98 exigés.
    const VALEURS = [5, 6, 7, 8, 9, 10];
    const codes = VALEURS.flatMap((v, i) => [`DRT ${4000 + i * 2}`, `DRT ${4001 + i * 2}`]);
    const creditsDe = new Map<string, number>();
    VALEURS.forEach((v, i) => {
      creditsDe.set(`DRT ${4000 + i * 2}`, v);
      creditsDe.set(`DRT ${4001 + i * 2}`, v);
    });
    const gros: Programme = {
      ...programme,
      creditsTotal: 98,
      exigences: {
        brut: "98 crédits à option (SYNTHÉTIQUE, conçu pour être insatisfiable)",
        obligatoire: { min: 0, max: 0 },
        option: { min: 98, max: 98 },
        choix: { min: 0, max: 0 },
      },
      blocs: Array.from({ length: 7 }, (_, i) => ({
        id: `9${i}A`,
        cle: `90/9${i}A`,
        segment: "90",
        nom: "",
        regle: { type: "option" as const, bornes: { min: 14, max: 14 } },
        regleBrut: "Option - 14 crédits.",
        cours: [...codes],
        contenuOuvert: false,
        notes: [],
      })),
    };
    const cat: Catalogue = {
      ...catalogue,
      cours: Object.fromEntries(
        codes.map((c) => [
          c,
          { ...Object.values(catalogue.cours)[0], code: c, credits: creditsDe.get(c)! },
        ]),
      ),
    };
    const a = auditProgramme(gros, cat, new Set(codes));
    expect(a.conforme).toBe(false);
    expect(joint(a)).toMatch(/la recherche d'affectation a été TRONQUÉE au plafond de 200000 affectations/);
    expect(joint(a)).toMatch(/ce verdict de non-conformité n'est pas démontré/);
    // Et le message de chevauchement ne prétend PAS avoir tout examiné.
    expect(joint(a)).not.toMatch(/Aucune des .* affectations possibles/);
  });

  it("un cours sans fiche ne fait pas exploser la combinatoire et ne plante pas", () => {
    // Crédits inconnus = 0 : le placement ne peut rien changer, donc il est fixé
    // plutôt que recherché.
    const r = resoudreAffectation(
      blocs([
        { cle: "A", min: 3, max: 3, cours: ["X 1000", "X 1001"] },
        { cle: "B", min: 0, max: 9, cours: ["X 1000", "X 1001"] },
      ]),
      ["X 1000", "X 1001"],
      () => null, // aucune fiche
      sansTotaux,
    );
    expect(r.nbGroupes).toBe(0);
    expect(r.parCle.get("A")).toEqual(["X 1000", "X 1001"]);
    expect(r.cout.blocs).toBe(3); // 70K-like reste vide : c'est dit, pas masqué
  });

  it("N4 : un cours cité par un bloc ne migre pas vers le bloc au choix", () => {
    // Décision v1 maintenue et argumentée dans affectation.ts. Le bloc au choix
    // reste vide alors qu'un cours d'option excédentaire « aurait pu » y aller.
    const a = auditer([...OBLIGATOIRES, ...COURS_70K]);
    expect(etat(a, "70Z").coursAttribues).toEqual([]);
    expect(etat(a, "70Z").creditsAttribues).toBe(0);
    // Et il reste conforme : « Choix - Maximum 3 crédits » a un minimum de 0.
    expect(etat(a, "70Z").conforme).toBe(true);
  });

  it("un cours cité par AUCUN bloc alimente le bloc au choix", () => {
    const cat: Catalogue = {
      ...catalogue,
      cours: { ...catalogue.cours, "ZZZ 9001": { ...Object.values(catalogue.cours)[0], code: "ZZZ 9001", credits: 3 } },
    };
    const a = auditer([...OBLIGATOIRES, "DRT 3910", "DRT 3911", "DRT 3912", "DRT 3913", "ZZZ 9001"], programme, cat);
    expect(etat(a, "70Z").coursAttribues).toEqual(["ZZZ 9001"]);
    expect(a.creditsChoix).toBe(3);
    expect(a.conforme).toBe(true);
  });
});

describe("compositions — la formule de comptage elle-même", () => {
  it("C(n+k−1, k−1) sur les cas connus", () => {
    expect(compositions(0, 2)).toBe(1);
    expect(compositions(1, 2)).toBe(2);
    expect(compositions(11, 2)).toBe(12);
    expect(compositions(4, 3)).toBe(15);
    expect(compositions(5, 1)).toBe(1);
    expect(compositions(3, 4)).toBe(20);
  });
});
