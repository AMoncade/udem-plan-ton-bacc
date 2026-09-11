/**
 * L'arithmétique des blocs, contrat v2.
 *
 * Ce que ces tests surveillent, c'est la liste précise de ce que la v1 faisait
 * mal hors actuariat : les neuf formes de règles, les exigences en intervalles,
 * `creditsTotal: null`, et les blocs dont la règle n'a pas été lue.
 */
import { describe, expect, it } from "vitest";
import type { Bloc, ExigencesParType, Programme, RegleBloc } from "../../lib/types";
import { cleBloc } from "../../lib/codes";
import {
  arithmetiqueProgramme,
  blocParCle,
  bornesBloc,
  libelleIntervalle,
} from "./cours";

function bloc(segment: string, id: string, regle: RegleBloc, cours: string[] = []): Bloc {
  return {
    id,
    cle: cleBloc(segment, id),
    segment,
    nom: "",
    regle,
    regleBrut: "",
    cours,
    notes: [],
    contenuOuvert: false,
  };
}

function programme(
  blocs: Bloc[],
  creditsTotal: number | null,
  exigences: ExigencesParType | null = null,
): Programme {
  return {
    id: "p",
    nom: "Programme",
    orientation: null,
    segments: ["01"],
    cycle: null,
    faculte: null,
    typeProgramme: null,
    creditsTotal,
    exigences,
    blocs,
    notes: [],
    orientations: [],
    url: "https://exemple.invalid",
    scrapeISO: "1970-01-01T00:00:00.000Z",
  };
}

describe("bornesBloc", () => {
  it("rend les bornes des trois types connus", () => {
    expect(bornesBloc({ type: "obligatoire", bornes: { min: 26, max: 26 } })).toEqual({
      min: 26,
      max: 26,
    });
    expect(bornesBloc({ type: "option", bornes: { min: 12, max: 27 } })).toEqual({
      min: 12,
      max: 27,
    });
    expect(bornesBloc({ type: "choix", bornes: { min: 3, max: 6 } })).toEqual({
      min: 3,
      max: 6,
    });
  });

  it("rend null — et non 0, ni l'infini — pour une règle non interprétée", () => {
    // C'est le point : `0` laisserait croire « aucune exigence » et `Infinity`
    // « aucun plafond ». Les deux sont des affirmations, et on n'en a aucune.
    expect(bornesBloc({ type: "inconnu", brut: "Bloc - voir remarques." })).toBeNull();
  });
});

describe("blocParCle", () => {
  it("distingue deux blocs de même id dans le même segment", () => {
    // La maîtrise en mathématiques porte `MM-Bloc 73A` ET `S-Bloc 73A` dans le
    // segment 73. Chercher par `id` rend le premier des deux, sans erreur.
    const p = programme(
      [
        bloc("73", "MM-Bloc 73A", { type: "option", bornes: { min: 9, max: 15 } }, ["MAT 6000"]),
        bloc("73", "S-Bloc 73A", { type: "option", bornes: { min: 3, max: 9 } }, ["STT 6000"]),
      ],
      45,
    );
    expect(blocParCle(p, "73/MM-Bloc 73A")?.cours).toEqual(["MAT 6000"]);
    expect(blocParCle(p, "73/S-Bloc 73A")?.cours).toEqual(["STT 6000"]);
    expect(p.blocs[0].cle).not.toBe(p.blocs[1].cle);
  });
});

describe("arithmetiqueProgramme", () => {
  /** Les huit blocs vérifiés de l'orientation actuariat. */
  const BLOCS_ACTUARIAT = [
    bloc("01", "01A", { type: "obligatoire", bornes: { min: 26, max: 26 } }),
    bloc("75", "75A", { type: "obligatoire", bornes: { min: 21, max: 21 } }),
    bloc("75", "75B", { type: "obligatoire", bornes: { min: 7, max: 7 } }),
    bloc("75", "75C", { type: "option", bornes: { min: 12, max: 27 } }),
    bloc("75", "75D", { type: "option", bornes: { min: 3, max: 15 } }),
    bloc("75", "75E", { type: "option", bornes: { min: 0, max: 13 } }),
    bloc("75", "75Y", { type: "option", bornes: { min: 3, max: 12 } }),
    bloc("75", "75Z", { type: "choix", bornes: { min: 3, max: 3 } }),
  ];

  it("retrouve l'écart 18 contre 33 de l'actuariat, exigences LUES sur la page", () => {
    const a = arithmetiqueProgramme(
      programme(BLOCS_ACTUARIAT, 90, {
        brut: "54 crédits obligatoires, 33 crédits à option et 3 crédits au choix",
        obligatoire: { min: 54, max: 54 },
        option: { min: 33, max: 33 },
        choix: { min: 3, max: 3 },
      }),
    );
    expect(a.obligatoire).toEqual({ min: 54, max: 54 });
    expect(a.choix).toEqual({ min: 3, max: 3 });
    expect(a.minimumsOption).toBe(18);
    expect(a.exigeOption).toEqual({ min: 33, max: 33 });
    expect(a.origineOption).toBe("page");
    // Le coeur du projet : 33 exigés, 18 réclamés par les blocs.
    expect(a.ecart).toBe(15);
    expect(a.capaciteOption).toBe(27 + 15 + 13 + 12);
    expect(a.capaciteOptionMax).toBe(27);
  });

  it("déduit le total d'option quand la page ne l'écrit pas, et le DIT", () => {
    const a = arithmetiqueProgramme(programme(BLOCS_ACTUARIAT, 90));
    expect(a.exigeOption).toEqual({ min: 33, max: 33 });
    expect(a.origineOption).toBe("deduit");
    expect(a.ecart).toBe(15);
  });

  it("préfère l'INTERVALLE écrit sur la page à toute déduction", () => {
    // Droit : « de 30 à 33 à option ». Une déduction 101 − obligatoire donnerait
    // un seul nombre, et il serait faux.
    const a = arithmetiqueProgramme(
      programme(
        [
          bloc("70", "70A", { type: "obligatoire", bornes: { min: 68, max: 68 } }),
          bloc("70", "70L", { type: "option", bornes: { min: 12, max: 27 } }),
        ],
        101,
        {
          brut: "de 68 à 71 crédits obligatoires, de 30 à 33 crédits à option",
          obligatoire: { min: 68, max: 71 },
          option: { min: 30, max: 33 },
          choix: null,
        },
      ),
    );
    expect(a.exigeOption).toEqual({ min: 30, max: 33 });
    expect(a.origineOption).toBe("page");
    expect(a.ecart).toBe(18);
  });

  it("ne produit jamais NaN quand creditsTotal est null", () => {
    // La v1 faisait `null - 54 - 3` et affichait « NaN crédits ».
    const a = arithmetiqueProgramme(programme(BLOCS_ACTUARIAT, null));
    expect(a.creditsTotal).toBeNull();
    expect(a.exigeOption).toBeNull();
    expect(a.origineOption).toBe("inconnu");
    expect(a.ecart).toBeNull();
    expect(Number.isNaN(a.minimumsOption)).toBe(false);
    expect(Number.isNaN(a.capaciteOption)).toBe(false);
  });

  it("ne déduit PAS quand l'obligatoire de la page est un intervalle", () => {
    // Le piège : 101 − 68 = 33 a l'air d'un nombre, mais l'obligatoire vaut
    // « de 68 à 71 ». Soustraire un intervalle donne un résultat plus large que
    // la réalité, donc un audit trop clément. Le moteur refuse de déduire dans
    // ce cas (`lib/engine/bornes.ts`) ; si l'UI déduisait quand même, la
    // balance afficherait 33 pendant que la liste de problèmes juste en dessous
    // auditerait contre la somme des minimums — deux nombres contradictoires
    // sur le même écran, chacun cohérent avec lui-même.
    const a = arithmetiqueProgramme(
      programme(
        [
          bloc("70", "70A", { type: "obligatoire", bornes: { min: 68, max: 68 } }),
          bloc("70", "70L", { type: "option", bornes: { min: 12, max: 27 } }),
        ],
        101,
        {
          brut: "de 68 à 71 crédits obligatoires",
          obligatoire: { min: 68, max: 71 },
          option: null,
          choix: null,
        },
      ),
    );
    expect(a.exigeOption).toBeNull();
    expect(a.origineOption).toBe("inconnu");
    expect(a.ecart).toBeNull();
  });

  it("ne déduit rien d'absurde quand l'obligatoire dépasse déjà le total", () => {
    const a = arithmetiqueProgramme(
      programme([bloc("01", "01A", { type: "obligatoire", bornes: { min: 40, max: 40 } })], 30),
    );
    // Plutôt qu'un « −10 crédits à option » affiché tel quel.
    expect(a.exigeOption).toBeNull();
    expect(a.origineOption).toBe("inconnu");
  });

  it("fait ressortir les blocs dont la règle n'a pas été lue", () => {
    const a = arithmetiqueProgramme(
      programme(
        [
          bloc("01", "01A", { type: "obligatoire", bornes: { min: 12, max: 12 } }),
          bloc("01", "01B", { type: "inconnu", brut: "Bloc - voir remarques." }),
        ],
        30,
      ),
    );
    expect(a.blocsInconnus.map((b) => b.id)).toEqual(["01B"]);
    // Leurs crédits n'entrent dans aucune somme : ils ne sont pas comptés à 0
    // en silence, ils sont signalés.
    expect(a.obligatoire).toEqual({ min: 12, max: 12 });
  });

  it("traverse les neuf formes de règles sans en avaler une", () => {
    const formes: RegleBloc[] = [
      { type: "obligatoire", bornes: { min: 26, max: 26 } },
      { type: "obligatoire", bornes: { min: 3, max: 3 } },
      { type: "option", bornes: { min: 4, max: 4 } },
      { type: "option", bornes: { min: 12, max: 27 } },
      { type: "option", bornes: { min: 0, max: 13 } },
      { type: "option", bornes: { min: 6, max: 18 } },
      { type: "choix", bornes: { min: 3, max: 3 } },
      { type: "choix", bornes: { min: 0, max: 3 } },
      { type: "choix", bornes: { min: 3, max: 6 } },
    ];
    const a = arithmetiqueProgramme(
      programme(
        formes.map((regle, i) => bloc("01", `01${i}`, regle)),
        90,
      ),
    );
    expect(a.blocsInconnus).toEqual([]);
    expect(a.obligatoire).toEqual({ min: 29, max: 29 });
    expect(a.choix).toEqual({ min: 6, max: 12 });
    expect(a.minimumsOption).toBe(4 + 12 + 0 + 6);
    expect(a.capaciteOption).toBe(4 + 27 + 13 + 18);
  });

  it("marche avec deux blocs comme avec trente", () => {
    const deux = arithmetiqueProgramme(
      programme(
        [
          bloc("01", "01A", { type: "obligatoire", bornes: { min: 27, max: 27 } }),
          bloc("01", "01Z", { type: "choix", bornes: { min: 3, max: 3 } }),
        ],
        30,
      ),
    );
    expect(deux.exigeOption).toEqual({ min: 0, max: 0 });
    expect(deux.minimumsOption).toBe(0);

    const trente = arithmetiqueProgramme(
      programme(
        Array.from({ length: 30 }, (_, i) =>
          bloc("73", `73${i}`, { type: "option", bornes: { min: 1, max: 3 } }),
        ),
        45,
      ),
    );
    expect(trente.minimumsOption).toBe(30);
    expect(trente.capaciteOption).toBe(90);
  });
});

describe("libelleIntervalle", () => {
  it("écrit un nombre exact sans « de … à »", () => {
    expect(libelleIntervalle({ min: 33, max: 33 })).toBe("33");
    expect(libelleIntervalle({ min: 30, max: 33 })).toBe("de 30 à 33");
  });
});
