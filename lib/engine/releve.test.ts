import { describe, it, expect } from "vitest";
import { parsePrealables, diagnostiquerCours, auditProgramme } from "./index";
import type { Catalogue, Cours, NoeudPrealable } from "../types";
import catalogueBrut from "../../data/catalogue.json";

/**
 * Tests contre le CATALOGUE RÉEL scrapé le 2026-09-11 (55/55 fiches) et contre
 * le relevé de formes de docs/RELEVE-PREALABLES.md.
 *
 * À lire avant de s'étonner : `data/catalogue.json` a été produit par la
 * VERSION PRÉCÉDENTE de parsePrealables(). Ses champs `prealables` portent donc
 * encore 10 noeuds `opaque`, et `prealablesNonParses` compte encore 10 entrées.
 * Le fichier appartient à la session scraper et n'est pas édité ici : il faut
 * un `npm run scrape` pour que le gain arrive dans les données. Ces tests
 * re-parsent donc `prealablesBrut` (exactement ce que le scraper refera) pour
 * mesurer ce que le parseur sait lire aujourd'hui.
 */
const catalogue = catalogueBrut as unknown as Catalogue;
const programme = catalogue.programmes[0];
const fiches = catalogue.cours as Record<string, Cours>;

const cours = (code: string): Cours => {
  const f = fiches[code];
  if (!f) throw new Error(`fiche absente du catalogue réel : ${code}`);
  return f;
};

/**
 * Les 10 codes dont la version précédente du parseur laissait la ligne
 * opaque — le relevé de docs/RELEVE-PREALABLES.md.
 *
 * Cette liste est écrite en dur EXPRÈS. La version précédente de ce fichier
 * la lisait dans `catalogue.prealablesNonParses`, ce qui marchait tant que
 * data/catalogue.json était lui-même périmé. Dès qu'un `npm run scrape` l'a
 * régénéré avec le parseur étendu, cette liste est tombée à 2 et quatre
 * tests ont échoué — non pas parce que le moteur avait régressé, mais parce
 * que l'instrument de mesure lisait un artefact dérivé de ce qu'il mesurait.
 * Les codes, eux, sont un fait historique, et chaque `brut` est relu de la
 * fiche, donc toujours verbatim de la page.
 */
const CODES_DU_RELEVE = [
  "ACT 3253", "ACT 3261", "ACT 4000", "IFT 1025", "IFT 3245",
  "IFT 3700", "MAT 2717", "MAT 2719", "STT 2700", "STT 3795",
] as const;

const LIGNES_NON_PARSEES = CODES_DU_RELEVE.map((code) => ({
  code,
  brut: cours(code).prealablesBrut as string,
}));

/** Le catalogue tel que le parseur v1 le produisait : les 10 lignes du
 *  relevé forcées en `opaque`. Sert d'état « avant » aux comparaisons, pour
 *  qu'elles ne dépendent plus de la fraîcheur du fichier généré. */
function catalogueV1(): Catalogue {
  const coursV1: Record<string, Cours> = { ...fiches };
  for (const { code, brut } of LIGNES_NON_PARSEES) {
    coursV1[code] = { ...cours(code), prealables: { genre: "opaque", texte: brut } };
  }
  return { ...catalogue, cours: coursV1, prealablesNonParses: [...LIGNES_NON_PARSEES] };
}

describe("relevé du scraper — les 10 lignes laissées opaques par la version précédente", () => {
  it("sont bien les 10 annoncées, et elles viennent du catalogue lui-même", () => {
    expect(LIGNES_NON_PARSEES).toHaveLength(10);
    // Chaque ligne du relevé existe toujours dans les données, verbatim.
    for (const { code, brut } of LIGNES_NON_PARSEES) {
      expect(cours(code).prealablesBrut, code).toBe(brut);
      expect(brut.length, code).toBeGreaterThan(0);
    }
    // Et le catalogue généré est À JOUR avec le parseur : il ne consigne plus
    // que les 2 refus assumés. Si cette assertion tombe, data/catalogue.json
    // vient d'une autre version du parseur — relancer `npm run scrape`.
    expect(catalogue.prealablesNonParses.map((l) => l.code).sort()).toEqual([
      "ACT 4000", "STT 3795",
    ]);
  });

  it("8 des 10 sont maintenant LUES, et exactement 2 restent opaques", () => {
    const lues = LIGNES_NON_PARSEES.filter((l) => parsePrealables(l.brut).complet);
    const opaques = LIGNES_NON_PARSEES.filter((l) => !parsePrealables(l.brut).complet);
    expect(lues.map((l) => l.code).sort()).toEqual([
      "ACT 3253", "ACT 3261", "IFT 1025", "IFT 3245", "IFT 3700",
      "MAT 2717", "MAT 2719", "STT 2700",
    ]);
    expect(opaques.map((l) => l.code)).toEqual(["ACT 4000", "STT 3795"]);
  });

  it("sur les 35 lignes de préalables du catalogue, 33 sont lues et 2 restent opaques", () => {
    const lignes = Object.values(fiches)
      .map((f) => f.prealablesBrut)
      .filter((b): b is string => b != null);
    expect(lignes).toHaveLength(35);
    const nonLues = lignes.filter((b) => !parsePrealables(b).complet);
    expect(nonLues.sort()).toEqual([
      "57 crédits complétés dans le baccalauréat en mathématiques 1-190-1-0 avec une moyenne cumulative supérieure à 3.3.",
      "MAT1400/MAT1600/MAT1720 ou MAT1978",
    ]);
  });
});

describe("relevé — le point final qui colle (famille F)", () => {
  it("ACT 3261 : « ACT3251. » est un code seul", () => {
    expect(parsePrealables(cours("ACT 3261").prealablesBrut!)).toEqual({
      complet: true,
      noeud: { genre: "cours", code: "ACT 3251" },
    });
  });

  it("ACT 3253 : « ACT2250 et ACT3251. » est une conjonction", () => {
    expect(parsePrealables(cours("ACT 3253").prealablesBrut!)).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "cours", code: "ACT 2250" },
        { genre: "cours", code: "ACT 3251" },
      ] },
    });
  });

  it("ne rogne qu'UN point : « ACT3251.. » reste signalé", () => {
    expect(parsePrealables("ACT3251..").complet).toBe(false);
  });

  it("ne touche pas aux points internes : « 3.3 » n'est pas un code", () => {
    const r = parsePrealables("moyenne supérieure à 3.3.");
    expect(r.complet).toBe(false);
    expect(r.noeud).toEqual({ genre: "opaque", texte: "moyenne supérieure à 3.3." });
  });
});

describe("relevé — disjonction homogène sans parenthèses (famille C)", () => {
  it("IFT 1025 : « IFT1015 ou IFT1016 »", () => {
    expect(parsePrealables(cours("IFT 1025").prealablesBrut!)).toEqual({
      complet: true,
      noeud: { genre: "ou", enfants: [
        { genre: "cours", code: "IFT 1015" },
        { genre: "cours", code: "IFT 1016" },
      ] },
    });
  });
});

describe("relevé — parenthèses explicites avec ET/OU imbriqués (famille D)", () => {
  it("MAT 2717 : « MAT1600 et (MAT1720 ou MAT1978) »", () => {
    expect(parsePrealables(cours("MAT 2717").prealablesBrut!)).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "cours", code: "MAT 1600" },
        { genre: "ou", enfants: [
          { genre: "cours", code: "MAT 1720" },
          { genre: "cours", code: "MAT 1978" },
        ] },
      ] },
    });
  });

  it("STT 2700 : groupe EN TÊTE, « (MAT1720 ou MAT1978) et STT1700 »", () => {
    expect(parsePrealables(cours("STT 2700").prealablesBrut!)).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "ou", enfants: [
          { genre: "cours", code: "MAT 1720" },
          { genre: "cours", code: "MAT 1978" },
        ] },
        { genre: "cours", code: "STT 1700" },
      ] },
    });
  });

  it("IFT 3245 : disjonction TERNAIRE dans les parenthèses", () => {
    expect(parsePrealables(cours("IFT 3245").prealablesBrut!)).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "cours", code: "IFT 2015" },
        { genre: "ou", enfants: [
          { genre: "cours", code: "MAT 1978" },
          { genre: "cours", code: "MAT 1720" },
          { genre: "cours", code: "PHY 2215" },
        ] },
      ] },
    });
  });

  it("IFT 3700 : même forme, troisième branche différente", () => {
    const n = parsePrealables(cours("IFT 3700").prealablesBrut!).noeud as Extract<NoeudPrealable, { genre: "et" }>;
    expect(n.genre).toBe("et");
    const ou = n.enfants[1] as Extract<NoeudPrealable, { genre: "ou" }>;
    expect(ou.enfants).toEqual([
      { genre: "cours", code: "MAT 1978" },
      { genre: "cours", code: "MAT 1720" },
      { genre: "cours", code: "STT 1700" },
    ]);
  });

  it("MAT 2719 : parenthèses ET point final (familles D + F ensemble)", () => {
    expect(parsePrealables(cours("MAT 2719").prealablesBrut!)).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "cours", code: "MAT 1000" },
        { genre: "ou", enfants: [
          { genre: "cours", code: "MAT 1720" },
          { genre: "cours", code: "MAT 1978" },
        ] },
      ] },
    });
  });
});

describe("relevé — les deux formes qui DOIVENT rester opaques", () => {
  it("STT 3795 : la barre oblique n'est tranchée par rien", () => {
    // « MAT1400 et MAT1600 et (MAT1720 ou MAT1978) » et
    // « MAT1400 ou MAT1600 ou MAT1720 ou MAT1978 » sont deux lectures du même
    // texte, et elles ne verrouillent pas les mêmes étudiants.
    const brut = cours("STT 3795").prealablesBrut!;
    expect(brut).toBe("MAT1400/MAT1600/MAT1720 ou MAT1978");
    const r = parsePrealables(brut);
    expect(r.complet).toBe(false);
    expect(r.noeud).toEqual({ genre: "opaque", texte: brut });
  });

  it("ACT 4000 : la moyenne cumulative n'existe dans aucun de nos types", () => {
    // Lire les « 57 crédits » et ignorer la moyenne déverrouillerait le cours
    // pour un étudiant à 57 crédits et 2,1 de moyenne. À moitié lue, la
    // condition affirme faux ; opaque, elle avertit.
    const brut = cours("ACT 4000").prealablesBrut!;
    const r = parsePrealables(brut);
    expect(r.complet).toBe(false);
    expect(r.noeud).toEqual({ genre: "opaque", texte: brut });
    expect(brut).toMatch(/moyenne cumulative/);
  });
});

describe("parsePrealables — la précédence reste refusée, parenthèses ou pas", () => {
  const refuses = [
    ["ACT1240 ET MAT1720 OU STT1700", "mélange ET/OU au même niveau"],
    ["MAT1000 ou MAT1400 et MAT1600", "mélange dans l'autre sens"],
    ["MAT1600 et (MAT1720 ou MAT1978", "parenthèse jamais fermée"],
    ["MAT1600 et MAT1720) ou MAT1978", "parenthèse fermée sans ouverture"],
    ["(MAT1720) (MAT1978)", "deux groupes sans connecteur"],
    ["MAT1600 et ()", "groupe vide"],
    ["MAT1600 et (MAT1720 ou autorisation)", "un membre du groupe n'est pas un code"],
    ["MAT1400/MAT1600", "barre oblique seule"],
  ] as const;
  for (const [brut, pourquoi] of refuses) {
    it(`opaque et signalé : « ${brut} » (${pourquoi})`, () => {
      const r = parsePrealables(brut);
      expect(r.complet).toBe(false);
      expect(r.noeud).toEqual({ genre: "opaque", texte: brut });
    });
  }

  it("un mélange ET/OU à l'intérieur d'un groupe est refusé aussi, pas juste au niveau 0", () => {
    expect(parsePrealables("MAT1000 et (MAT1720 ou MAT1978 et MAT1400)").complet).toBe(false);
  });

  it("lit des parenthèses imbriquées quand chaque niveau est homogène", () => {
    // Forme non observée sur le site, mais gratuite : la récursion la gère déjà,
    // et la tester documente que la profondeur n'est pas limitée à 1.
    expect(parsePrealables("MAT1000 et (MAT1720 ou (MAT1400 et MAT1600))")).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "cours", code: "MAT 1000" },
        { genre: "ou", enfants: [
          { genre: "cours", code: "MAT 1720" },
          { genre: "et", enfants: [
            { genre: "cours", code: "MAT 1400" },
            { genre: "cours", code: "MAT 1600" },
          ] },
        ] },
      ] },
    });
  });

  it("un groupe qui englobe toute la ligne est lu", () => {
    expect(parsePrealables("(ACT1240 et MAT1720)")).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "cours", code: "ACT 1240" },
        { genre: "cours", code: "MAT 1720" },
      ] },
    });
  });
});

// ---------------------------------------------------------------------------
// Le catalogue réel dans le moteur
// ---------------------------------------------------------------------------

/** Le catalogue tel que le scraper le réécrira quand il relancera le parseur :
 *  mêmes fiches, champ `prealables` reconstruit à partir de `prealablesBrut`. */
function catalogueReparse(): Catalogue {
  const coursReparses: Record<string, Cours> = {};
  const nonParses: { code: string; brut: string }[] = [];
  for (const [code, f] of Object.entries(fiches)) {
    if (f.prealablesBrut == null) {
      coursReparses[code] = f;
      continue;
    }
    const r = parsePrealables(f.prealablesBrut);
    if (!r.complet) nonParses.push({ code, brut: f.prealablesBrut });
    coursReparses[code] = { ...f, prealables: r.noeud };
  }
  return { ...catalogue, cours: coursReparses, prealablesNonParses: nonParses };
}

describe("catalogue réel — ce que le re-parsing change pour le moteur", () => {
  it("après re-parsing, il ne reste que 2 lignes non parsées au lieu de 10", () => {
    expect(catalogueReparse().prealablesNonParses.map((l) => l.code).sort()).toEqual([
      "ACT 4000", "STT 3795",
    ]);
  });

  it("MAT 2717 passe d'avertissement à verrouillé, avec ses vraies alternatives", () => {
    const cat = catalogueReparse();
    // Avant : noeud opaque -> avertissement, aucun manquant, aucune arête dans
    // le graphe. Après : le OU est lisible, donc le cours se verrouille.
    const avant = diagnostiquerCours(catalogueV1(), new Set()).get("MAT 2717");
    expect(avant?.etat).toBe("avertissement");
    expect(avant?.manquants).toEqual([]);

    const apres = diagnostiquerCours(cat, new Set()).get("MAT 2717");
    expect(apres?.etat).toBe("verrouille");
    expect(apres?.manquants).toEqual(["MAT 1600", "MAT 1720", "MAT 1978"]);

    // Et une seule des deux alternatives suffit à l'ouvrir.
    const ouvert = diagnostiquerCours(cat, new Set(["MAT 1600", "MAT 1978"])).get("MAT 2717");
    expect(ouvert?.etat).toBe("disponible");
    expect(diagnostiquerCours(cat, new Set(["MAT 1600", "MAT 1720"])).get("MAT 2717")?.etat).toBe("disponible");
    // Mais pas le groupe seul sans MAT 1600.
    expect(diagnostiquerCours(cat, new Set(["MAT 1978"])).get("MAT 2717")?.etat).toBe("verrouille");
  });

  it("les codes cités en préalable mais sans fiche apparaissent, sans planter", () => {
    // Relevé §5 : IFT 1016, IFT 1065, MAT 1978, PHY 2215 n'ont aucune fiche.
    // Trois d'entre eux n'étaient même pas VISIBLES avant, parce qu'ils
    // n'existaient qu'à l'intérieur des lignes restées opaques.
    const cat = catalogueReparse();
    const d = diagnostiquerCours(cat, new Set());
    for (const code of ["IFT 1016", "IFT 1065", "MAT 1978", "PHY 2215"]) {
      expect(fiches[code], `${code} ne doit pas avoir de fiche`).toBeUndefined();
      expect(d.get(code)?.etat, code).toBe("avertissement");
      expect(d.get(code)?.avertissements.join(" "), code).toMatch(/aucune fiche de cours/);
    }
    // 55 fiches + les 4 codes cités sans fiche.
    expect(d.size).toBe(59);
    expect(diagnostiquerCours(catalogueV1(), new Set()).size).toBe(56); // avant : seul IFT 1065 était visible
  });

  it("un préalable qui se cite lui-même ne boucle pas", () => {
    // STT 2000 se déclare concomitante d'elle-même dans les vraies données
    // (relevé §4) ; le même cycle de longueur 1 dans un PRÉALABLE doit
    // simplement verrouiller le cours, pas faire déborder la pile.
    const cat: Catalogue = {
      ...catalogue,
      cours: {
        "STT 2000": {
          ...cours("STT 2000"),
          prealablesBrut: "STT2000 et STT2700",
          prealables: parsePrealables("STT2000 et STT2700").noeud,
        },
      },
    };
    const d = diagnostiquerCours(cat, new Set(["STT 2700"]));
    expect(d.get("STT 2000")?.etat).toBe("verrouille");
    expect(d.get("STT 2000")?.manquants).toEqual(["STT 2000"]);
  });

  it("la concomitance de STT 2000 avec elle-même ressort en avertissement et ne verrouille rien", () => {
    const d = diagnostiquerCours(catalogue, new Set());
    expect(cours("STT 2000").concomitantsBrut).toBe("STT2000 et STT2700");
    const stt = d.get("STT 2000");
    expect(stt?.etat).toBe("avertissement");
    expect(stt?.avertissements.join(" ")).toMatch(/concomitants non analysés.*STT2000 et STT2700/);
  });
});

describe("audit sur le catalogue réel — crédits vrais, plus aucun inventé", () => {
  const bloc = (id: string) => {
    const b = programme.blocs.find((x) => x.id === id);
    if (!b) throw new Error(`bloc absent : ${id}`);
    return b;
  };
  const credits = (codes: string[]) => codes.reduce((s, c) => s + cours(c).credits, 0);

  it("les crédits réels des blocs obligatoires tombent sur les nombres de la page", () => {
    // Vérification de cohérence des données : si la somme des fiches ne donnait
    // pas le total du bloc, aucun parcours ne pourrait le satisfaire.
    expect(credits(bloc("01A").cours)).toBe(26);
    expect(credits(bloc("75A").cours)).toBe(21);
    expect(credits(bloc("75B").cours)).toBe(7);
  });

  it("LE PIÈGE 18-CONTRE-33, sur les vraies données cette fois", () => {
    const obligatoires = [...bloc("01A").cours, ...bloc("75A").cours, ...bloc("75B").cours];
    // 12 crédits dans 75C (4 cours à 3), 3 dans 75D, 3 dans 75Y = les minimums.
    const option18 = [...bloc("75C").cours.slice(0, 4), bloc("75D").cours[0], bloc("75Y").cours[0]];
    expect(credits(option18)).toBe(18);
    const a = auditProgramme(programme, catalogue, new Set([...obligatoires, ...option18]));

    for (const b of a.blocs) {
      if (b.idBloc === "75Z") continue; // 3 crédits au choix non faits
      expect(b.creditsManquants, `bloc ${b.idBloc}`).toBe(0);
    }
    expect(a.creditsObligatoires).toBe(54);
    expect(a.creditsOption).toBe(18);
    expect(a.conforme).toBe(false);
    expect(a.problemes.join("\n")).toMatch(/il manque 15 crédits de cours d'option : 18 crédits sur les 33 crédits exigés/);
  });

  it("un parcours complet sur les vraies données est conforme", () => {
    const faits = [
      ...bloc("01A").cours, ...bloc("75A").cours, ...bloc("75B").cours,
      ...bloc("75C").cours.slice(0, 9), // 27 crédits, le maximum du bloc
      bloc("75D").cours[0], bloc("75Y").cours[0], // 3 + 3
      "PHI 1968", // cours au choix, hors de tout bloc
    ];
    const cat: Catalogue = {
      ...catalogue,
      cours: { ...fiches, "PHI 1968": { ...cours("IFT 1015"), code: "PHI 1968", credits: 3 } },
    };
    const a = auditProgramme(programme, cat, new Set(faits));
    expect(a.creditsOption).toBe(33);
    expect(a.creditsTotal).toBe(90);
    expect(a.problemes).toEqual([]);
    expect(a.conforme).toBe(true);
  });

  it("un bloc sans nom ne produit pas « le bloc 01A () »", () => {
    // La page de structure ne nomme ni 01A ni 75Z : le catalogue réel porte
    // nom: "". Le message doit rester lisible.
    expect(bloc("01A").nom).toBe("");
    const a = auditProgramme(programme, catalogue, new Set());
    expect(a.problemes.join("\n")).toMatch(/il manque 26 crédits dans le bloc 01A : /);
    expect(a.problemes.join("\n")).not.toMatch(/\(\)/);
  });
});
