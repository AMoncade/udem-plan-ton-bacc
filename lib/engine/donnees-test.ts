import type {
  Bloc,
  Catalogue,
  CodeCours,
  Cours,
  EntreeJournal,
  Intervalle,
  Programme,
  RegleBloc,
} from "../types";
import { cleBloc } from "../codes";

/**
 * DONNÉES DE TEST DU MOTEUR — importé UNIQUEMENT par `lib/engine/*.test.ts`.
 *
 * Ce fichier ne fait pas partie de l'API du moteur : rien dans `app/`,
 * `components/` ou `scripts/` ne doit l'importer. Il existe pour deux raisons.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. UN PONT v1 -> v2, TEMPORAIRE ET BRUYANT
 *
 * `data/fixtures/actuariat-verifie.fixture.json` est écrit dans le contrat v1 et
 * appartient à l'intégratrice. Le moteur, lui, lit le contrat v2. Deux
 * mauvaises réponses possibles, toutes les deux refusées ici :
 *
 * (`data/catalogue.json` passait aussi par ici ; il disparaît avec la
 * disposition v2, et les lignes qu'il portait sont maintenant figées dans
 * `./donnees-actuariat.ts` — voir l'en-tête de ce fichier-là.)
 *
 *   - éditer ces fichiers : ils ne sont pas à moi, et le merge serait propre
 *     avec un résultat cassé ;
 *   - réinventer les données en mémoire : ce serait fabriquer de faux noms de
 *     blocs et de faux codes, ce qui a déjà été fait une fois sur ce projet et
 *     relevé comme une faute.
 *
 * Donc : une TRADUCTION mécanique v1 -> v2 des vraies données, qui
 * `throw` dès qu'elle rencontre une forme qu'elle ne sait pas traduire.
 * Elle ne devine rien, en particulier pas `exigences` (qui n'existe pas en v1 :
 * elle vaut donc `null`, et le moteur doit se rabattre sur la déduction).
 *
 * À SUPPRIMER le jour où le scraper livre des données v2 : `adapterCatalogue()`
 * détecte déjà la forme v2 et la laisse passer telle quelle, et
 * `formeDetectee()` dit laquelle a été lue, pour qu'un test le constate au lieu
 * de le supposer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2. DES PROGRAMMES SYNTHÉTIQUES QUE LES VRAIES DONNÉES NE CONTIENNENT PAS
 *
 * Le chevauchement 70K ⊂ 70L du bacc. en droit n'est dans aucun fichier du
 * dépôt : il est relevé dans `docs/VALIDATION-AUTRES-PROGRAMMES.md` §6. Il est
 * donc reconstruit ici, et la frontière entre RELEVÉ et INVENTÉ est marquée
 * ligne par ligne.
 */

// ---------------------------------------------------------------------------
// Pont v1 -> v2
// ---------------------------------------------------------------------------

export type FormeContrat = "v1" | "v2";

interface RegleV1 {
  type?: string;
  credits?: number | null;
  min?: number | null;
  max?: number | null;
  bornes?: Intervalle;
  brut?: string;
}

/** Quelle forme de contrat porte ce JSON ? Décidé sur la présence de
 *  `regle.bornes`, le champ qui a changé. Jamais supposé. */
export function formeDetectee(brut: unknown): FormeContrat {
  const blocs = (brut as { programmes?: { blocs?: { regle?: RegleV1 }[] }[] })?.programmes?.[0]?.blocs ?? [];
  for (const b of blocs) {
    if (b.regle && typeof b.regle === "object" && "bornes" in b.regle) return "v2";
  }
  return "v1";
}

function traduireRegle(regle: RegleV1 | undefined, ou: string): RegleBloc {
  if (!regle || typeof regle !== "object") {
    throw new Error(`${ou} : règle absente, rien à traduire`);
  }
  if ("bornes" in regle && regle.bornes) return regle as RegleBloc; // déjà v2
  const n = (x: number | null | undefined): number | null =>
    typeof x === "number" && Number.isFinite(x) ? x : null;
  switch (regle.type) {
    case "obligatoire":
    case "choix": {
      const c = n(regle.credits);
      if (c === null) throw new Error(`${ou} : règle « ${regle.type} » sans crédits exploitables`);
      return { type: regle.type, bornes: { min: c, max: c } };
    }
    case "option": {
      const min = n(regle.min) ?? 0; // « Option - Maximum 13 crédits » : pas de minimum écrit.
      const max = n(regle.max);
      if (max === null) {
        // La validation note que la forme « minimum sans maximum » n'existe
        // NULLE PART dans l'échantillon. Si elle apparaît, il faut la regarder,
        // pas lui inventer un plafond infini.
        throw new Error(`${ou} : règle « option » sans maximum — forme jamais relevée, à vérifier sur la page`);
      }
      return { type: "option", bornes: { min, max } };
    }
    default:
      throw new Error(`${ou} : type de règle v1 inconnu « ${String(regle.type)} »`);
  }
}

/**
 * Traduit un catalogue v1 en catalogue v2, ou laisse passer un v2.
 *
 * Les champs que la v1 n'avait pas deviennent `null` / `[]` — PAS une valeur
 * plausible. `exigences: null` en particulier : c'est la situation réelle du
 * moteur sur ces fichiers, et elle doit déclencher le repli par déduction.
 */
export function adapterCatalogue(brut: unknown): Catalogue {
  const src = brut as Catalogue & { _journal?: unknown[] };
  if (formeDetectee(brut) === "v2") return src;

  const programmes: Programme[] = (src.programmes ?? []).map((p) => {
    const blocs: Bloc[] = (p.blocs ?? []).map((b) => {
      const segment = b.segment ?? "";
      if (segment === "") throw new Error(`bloc ${b.id} : segment absent, il est LU sur la page en v2`);
      return {
        id: b.id,
        cle: cleBloc(segment, b.id),
        segment,
        nom: b.nom ?? "",
        regle: traduireRegle(b.regle as unknown as RegleV1, `bloc ${b.id}`),
        regleBrut: b.regleBrut ?? "",
        cours: [...(b.cours ?? [])],
        // La v1 n'a AUCUN moyen de dire qu'un bloc décrit son contenu en prose :
        // elle ne distingue pas « ce bloc n'énumère rien » de « je n'ai pas su
        // lire la liste ». `false` est donc la seule lecture honnête d'une
        // donnée v1 — et si un tel bloc s'y trouvait, l'audit le signalerait de
        // toute façon comme un bloc d'option sans cours.
        contenuOuvert: b.contenuOuvert ?? false,
        notes: [], // la v1 n'avait pas ce champ : vide, pas inventé.
      };
    });
    return {
      id: p.id,
      nom: p.nom,
      orientation: p.orientation ?? null,
      segments: [...new Set(blocs.map((b) => b.segment))],
      // La v1 ne distinguait pas une PAGE d'un PARCOURS : son unique champ
      // `orientation` désignait déjà un parcours. Un catalogue v1 traduit est
      // donc un programme DÉJÀ PROJETÉ, d'où `orientations: []` — et non une
      // page dont il resterait des alternatives à choisir.
      orientations: [],
      cycle: null,
      faculte: null,
      typeProgramme: null,
      creditsTotal: typeof p.creditsTotal === "number" ? p.creditsTotal : null,
      exigences: null, // INEXISTANT en v1 : le moteur doit se rabattre et le dire.
      blocs,
      notes: [],
      url: p.url,
      scrapeISO: p.scrapeISO,
    };
  });

  const cours: Record<CodeCours, Cours> = {};
  for (const [code, fiche] of Object.entries(src.cours ?? {})) {
    cours[code] = { ...fiche, restrictionsBrut: fiche.restrictionsBrut ?? null };
  }

  // Le `_journal` hors contrat de la v1 devient le `journal` typé de la v2.
  // C'est là qu'était piégée une exigence réelle que rien ne pouvait afficher.
  const journal: EntreeJournal[] = (src._journal ?? []).map((e) => {
    const o = e as Partial<EntreeJournal>;
    return {
      genre: o.genre ?? "info",
      sujet: o.sujet ?? "?",
      message: o.message ?? JSON.stringify(e),
    };
  });

  return {
    programmes,
    cours,
    prealablesNonParses: [...(src.prealablesNonParses ?? [])],
    journal,
    scrapeISO: src.scrapeISO,
  };
}

/**
 * Les exigences VÉRIFIÉES de l'orientation actuariat, pour éprouver le chemin
 * « `exigences` existe » en plus du chemin « repli par déduction ».
 *
 * Source : `docs/CONTRAT.md`, section « Confirmation directe du 54/33/3 », qui
 * cite la page de structure verbatim. Ce ne sont donc PAS des nombres inventés,
 * contrairement aux crédits de cours plus bas.
 */
export const EXIGENCES_ACTUARIAT_VERIFIEES = {
  brut: "54 crédits obligatoires, 33 crédits à option et 3 crédits au choix",
  obligatoire: { min: 54, max: 54 },
  option: { min: 33, max: 33 },
  choix: { min: 3, max: 3 },
} as const;

export function avecExigences(
  programme: Programme,
  exigences: Programme["exigences"],
): Programme {
  return { ...programme, exigences };
}

// ---------------------------------------------------------------------------
// Fiches synthétiques
// ---------------------------------------------------------------------------

export function ficheTest(code: CodeCours, credits: number, extra: Partial<Cours> = {}): Cours {
  return {
    code,
    titre: `Cours ${code}`,
    credits,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    prealablesBrut: null,
    prealables: null,
    concomitantsBrut: null,
    restrictionsBrut: null,
    trimestres: [],
    url: `https://exemple.test/${code}`,
    scrapeISO: "2026-09-10T00:00:00.000Z",
    ...extra,
  };
}

export function catalogueTest(programmes: Programme[], fiches: Cours[]): Catalogue {
  return {
    programmes,
    cours: Object.fromEntries(fiches.map((f) => [f.code, f])),
    prealablesNonParses: [],
    journal: [],
    scrapeISO: "2026-09-10T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Le programme de chevauchement : 70K ⊂ 70L
// ---------------------------------------------------------------------------

/**
 * RELEVÉ, pas inventé — `docs/VALIDATION-AUTRES-PROGRAMMES.md` §6, page de
 * structure du baccalauréat en droit consultée le 2026-09-10 :
 *
 *   Bloc 70K Formation pratique              / « Option - 3 crédits. »
 *   Bloc 70L Formation pratique complémentaire / « Option - Maximum 9 crédits. »
 *
 * Les onze cours de 70K sont TOUS dans 70L : 70K est un sous-ensemble strict.
 */
export const COURS_70K: CodeCours[] = [
  "DRT 3910", "DRT 3911", "DRT 3912", "DRT 3913", "DRT 3914", "DRT 3915",
  "DRT 3916", "DRT 3918", "DRT 3940", "DRT 3941", "DRT 3999",
];

export const COURS_70L: CodeCours[] = [
  ...COURS_70K,
  "DRT 3947", "DRT 3948", "DRT 3951", "DRT 3965", "DRT 3966", "DRT 3990", "DRT 3991",
];

/**
 * /!\ CRÉDITS REPRIS DU DOC DE VALIDATION, PAS RELUS SUR LES FICHES.
 *
 * Le doc écrit « DRT 3910, 3911, 3912 et 3913 (12 crédits) », donc 3 crédits
 * par cours. Aucune fiche DRT n'a été ouverte ici pour le revérifier. Si un
 * cours de formation pratique vaut 6 crédits, l'arithmétique de CES TESTS change
 * — pas le comportement du moteur, qui lit les crédits des fiches.
 */
export const CREDITS_DRT_SUPPOSES = 3;

/**
 * /!\ PROGRAMME SYNTHÉTIQUE, CE N'EST PAS LE BACC. EN DROIT.
 *
 * Le vrai bacc. en droit fait 101 crédits, avec « 68 crédits obligatoires, de
 * 30 à 33 crédits à option et un maximum de 3 crédits au choix » — et je n'ai
 * pas la liste de ses blocs obligatoires, donc je ne la fabrique pas.
 *
 * Ce qui est RÉEL ici : les blocs 70K et 70L (identifiants, noms, règles
 * verbatim, listes de cours), c'est-à-dire exactement la structure qui rend
 * l'affectation non triviale.
 *
 * Ce qui est INVENTÉ et marqué comme tel : le bloc obligatoire 70A et ses deux
 * cours DRT 1001 / DRT 1002, le total de 18 crédits, et les exigences par type.
 * Ils existent pour que le programme soit arithmétiquement clos et que l'audit
 * ait quelque chose à comparer.
 */
export function programmeChevauchement(): Programme {
  const bloc = (
    id: string,
    nom: string,
    regle: RegleBloc,
    regleBrut: string,
    cours: CodeCours[],
    contenuOuvert = false,
  ): Bloc => ({
    id,
    cle: cleBloc("70", id),
    segment: "70",
    nom,
    regle,
    regleBrut,
    cours,
    contenuOuvert,
    notes: [],
  });

  return {
    id: "test-chevauchement-70K-dans-70L",
    nom: "Programme SYNTHÉTIQUE de chevauchement (blocs 70K/70L réels du bacc. en droit)",
    orientation: null,
    segments: ["70"],
    // Déjà projeté : ce programme est un parcours, pas une page à alternatives.
    orientations: [],
    cycle: "1er cycle",
    faculte: "Droit",
    typeProgramme: "Baccalauréat",
    creditsTotal: 18, // INVENTÉ : 6 obligatoires + 12 d'option.
    exigences: {
      // INVENTÉ, pour clore l'arithmétique. Le vrai droit écrit 68 / 30-33 / max 3.
      brut: "6 crédits obligatoires, 12 crédits à option et un maximum de 3 crédits au choix (SYNTHÉTIQUE)",
      obligatoire: { min: 6, max: 6 },
      option: { min: 12, max: 12 },
      choix: { min: 0, max: 3 },
    },
    blocs: [
      bloc(
        "70A",
        "Tronc commun INVENTÉ",
        { type: "obligatoire", bornes: { min: 6, max: 6 } },
        "Obligatoire - 6 crédits.",
        ["DRT 1001", "DRT 1002"],
      ),
      // 70K est déclaré AVANT 70L, donc l'attribution directe de la v1 y
      // enverrait tous les cours communs : c'est le cas qui la fait échouer.
      bloc(
        "70K",
        "Formation pratique",
        { type: "option", bornes: { min: 3, max: 3 } },
        "Option - 3 crédits.",
        [...COURS_70K],
      ),
      bloc(
        "70L",
        "Formation pratique complémentaire",
        { type: "option", bornes: { min: 0, max: 9 } },
        "Option - Maximum 9 crédits.",
        [...COURS_70L],
      ),
      bloc(
        "70Z",
        "",
        { type: "choix", bornes: { min: 0, max: 3 } },
        "Choix - Maximum 3 crédits.",
        [],
      ),
    ],
    notes: [],
    url: "https://exemple.test/programme-synthetique-chevauchement",
    scrapeISO: "2026-09-10T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Un bloc à CONTENU OUVERT : le bloc « catégorie » qui n'énumère rien
// ---------------------------------------------------------------------------

/**
 * /!\ PROGRAMME SYNTHÉTIQUE, minimal, autour d'un cas RÉEL.
 *
 * Ce qui est réel : la forme du bloc. Le contrat cite deux occurrences
 * vérifiées dans le HTML (aucun lien de cours dans le bloc) —
 * `baccalaureat-en-economie-et-politique` 71/71G et `baccalaureat-en-musique`
 * 02/02E, toutes deux « Option - maximum 6 crédits » avec pour seule
 * description un renvoi aux cours du Centre de langues. On reprend ici le
 * couple segment 71 / bloc 71G, sa règle en MINUSCULE (une des cinq formes que
 * la v1 ne savait pas lire) et son minimum de 0.
 *
 * Ce qui est inventé et marqué : le bloc obligatoire 71A, ses quatre cours, le
 * bloc d'option ORDINAIRE 71H, le total de 12 crédits et les exigences par type.
 *
 * 71H existe pour une raison précise, découverte par test de mutation : sans un
 * second bloc d'option, ORDINAIRE celui-là, le total du type « option » ne peut
 * jamais être atteint quand 71G exige un minimum, et c'est ce total qui refuse
 * la conformité — pas le contrôle du bloc invérifiable. Le test passait alors
 * par le mauvais chemin. Avec 71H, l'étudiant peut satisfaire le TYPE tout en
 * laissant 71G invérifié, ce qui isole exactement la règle à éprouver.
 *
 * `minimumLangues` permet d'éprouver le cas HYPOTHÉTIQUE d'un bloc ouvert qui
 * exige un minimum : là, l'audit ne peut plus affirmer la conformité, et il doit
 * le dire au lieu de déclarer le bloc satisfait.
 */
export function programmeContenuOuvert(minimumLangues = 0): Programme {
  const bloc = (
    id: string,
    nom: string,
    regle: RegleBloc,
    regleBrut: string,
    cours: CodeCours[],
    contenuOuvert = false,
    notes: string[] = [],
  ): Bloc => ({
    id,
    cle: cleBloc("71", id),
    segment: "71",
    nom,
    regle,
    regleBrut,
    cours,
    contenuOuvert,
    notes,
  });

  return {
    id: "test-contenu-ouvert-71G",
    nom: "Programme SYNTHÉTIQUE à bloc de contenu ouvert (forme réelle du bloc 71G)",
    orientation: null,
    segments: ["71"],
    orientations: [],
    cycle: "1er cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Baccalauréat",
    creditsTotal: 12, // INVENTÉ
    exigences: {
      brut: "12 crédits obligatoires et de 0 à 12 crédits à option, dont au plus 6 de langues (SYNTHÉTIQUE)",
      obligatoire: { min: 12, max: 12 },
      option: { min: minimumLangues, max: 12 },
      choix: { min: 0, max: 0 },
    },
    blocs: [
      bloc(
        "71A",
        "Tronc commun INVENTÉ",
        { type: "obligatoire", bornes: { min: 12, max: 12 } },
        "Obligatoire - 12 crédits.",
        ["POL 1001", "POL 1002", "ECN 1001", "ECN 1002"],
      ),
      bloc(
        "71H",
        "Option ORDINAIRE INVENTÉE",
        { type: "option", bornes: { min: 0, max: 6 } },
        "Option - maximum 6 crédits.",
        ["POL 2001", "POL 2002"],
      ),
      bloc(
        "71G",
        "Cours de langues",
        { type: "option", bornes: { min: minimumLangues, max: 6 } },
        "Option - maximum 6 crédits.",
        [], // la page n'énumère AUCUN cours : c'est le point du test
        true,
        ["L'étudiant choisit ses cours parmi les cours de langues offerts par le Centre de langues."],
      ),
    ],
    notes: [],
    url: "https://exemple.test/programme-synthetique-contenu-ouvert",
    scrapeISO: "2026-09-10T00:00:00.000Z",
  };
}

export function catalogueContenuOuvert(minimumLangues = 0): Catalogue {
  return catalogueTest(
    [programmeContenuOuvert(minimumLangues)],
    ["POL 1001", "POL 1002", "ECN 1001", "ECN 1002", "POL 2001", "POL 2002", "ZZZ 9001"].map((c) =>
      ficheTest(c, 3),
    ),
  );
}

/** Catalogue synthétique couvrant le programme de chevauchement. */
export function catalogueChevauchement(): Catalogue {
  const codes = [...new Set(["DRT 1001", "DRT 1002", ...COURS_70L])];
  return catalogueTest(
    [programmeChevauchement()],
    codes.map((c) => ficheTest(c, CREDITS_DRT_SUPPOSES)),
  );
}
