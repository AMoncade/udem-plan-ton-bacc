import type { Bloc, Catalogue, CodeCours, Cours, Programme } from "../types";
import { cleBloc } from "../codes";

/**
 * L'ORIENTATION ACTUARIAT, FIGÉE — importé uniquement par `lib/engine/*.test.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 *
 * `lib/engine/releve.test.ts` lisait `data/catalogue.json` par import statique.
 * Ce fichier disparaît : la disposition v2 le remplace par un index, un fichier
 * par programme et un fichier par sujet. Trois réponses possibles, et la
 * troisième est la bonne :
 *
 *  1. Lire `data/` à l'exécution, comme `tests/coutures.test.ts`. NON pour un
 *     test de moteur : `releve.test.ts` mesure ce que `parsePrealables()` sait
 *     lire, et le brancher sur un fichier GÉNÉRÉ par un scraper qui utilise
 *     `parsePrealables()` fait mesurer l'instrument par lui-même. Cette faute a
 *     déjà été commise deux fois sur ce projet, et elle est documentée en tête
 *     de `releve.test.ts` : quatre tests étaient tombés non pas parce que le
 *     moteur avait régressé, mais parce que la mesure lisait un artefact dérivé
 *     de ce qu'elle mesurait.
 *  2. Inventer des lignes de préalables plausibles. NON : c'est exactement ce
 *     que `CLAUDE.md` interdit, et ces lignes sont la donnée à éprouver.
 *  3. FIGER les vraies lignes, verbatim, dans du code. OUI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROVENANCE ET RÈGLE D'ENTRETIEN
 *
 * Extrait mécaniquement de `data/catalogue.json` (scrapeISO
 * 2026-09-11T03:41:19.066Z, 55 codes demandés et 55 fiches obtenues), lui-même
 * relevé sur `admission.umontreal.ca`. Recoupé avec `docs/RELEVE-PREALABLES.md`,
 * qui est le relevé écrit de ces mêmes pages.
 *
 * C'est un INSTANTANÉ GELÉ, et il doit le rester. Ces chaînes sont ce que les
 * pages disaient le 2026-09-11 ; c'est contre elles que le parseur est éprouvé.
 * Les « rafraîchir » depuis une sortie de scraper ultérieure rendrait à nouveau
 * la mesure circulaire. Si une page change, la bonne démarche est de constater
 * l'écart, de le décrire, puis de modifier CE fichier à la main.
 *
 * Ne sont figés que les champs dont les tests du moteur ont besoin : code,
 * crédits, et les trois lignes d'exigences verbatim. Les autres champs de
 * `Cours` sont remplis de valeurs neutres, pas de valeurs plausibles.
 */

// ---------------------------------------------------------------------------
// Les 55 fiches
// ---------------------------------------------------------------------------

interface FicheFigee {
  code: CodeCours;
  credits: number;
  prealablesBrut?: string;
  concomitantsBrut?: string;
  restrictionsBrut?: string;
}

/**
 * 35 des 55 fiches portent une ligne de préalables, 5 une ligne de
 * concomitants, 1 une ligne de restrictions (DMO 1000, la seule étiquette
 * « Restrictions d'inscription: » du relevé — en v1 elle était piégée dans le
 * `_journal` hors contrat et rien ne pouvait l'afficher).
 */
export const FICHES_ACTUARIAT: readonly FicheFigee[] = [
  { code: "ACT 1240", credits: 3 },
  { code: "ACT 2241", credits: 3, prealablesBrut: "ACT1240" },
  { code: "ACT 2242", credits: 3, prealablesBrut: "ACT1240" },
  { code: "ACT 2243", credits: 3, prealablesBrut: "ACT1240" },
  { code: "ACT 2250", credits: 3, prealablesBrut: "ACT1240 ET MAT1720" },
  { code: "ACT 2251", credits: 3, prealablesBrut: "ACT2250" },
  { code: "ACT 2284", credits: 3, prealablesBrut: "ACT3251 et STT2700" },
  { code: "ACT 3201", credits: 3, prealablesBrut: "ACT2250" },
  { code: "ACT 3230", credits: 3, prealablesBrut: "ACT2241 et MAT2717" },
  { code: "ACT 3251", credits: 3, prealablesBrut: "MAT1720" },
  { code: "ACT 3253", credits: 3, prealablesBrut: "ACT2250 et ACT3251." },
  { code: "ACT 3261", credits: 3, prealablesBrut: "ACT3251.", concomitantsBrut: "STT3790." },
  { code: "ACT 3282", credits: 3, concomitantsBrut: "ACT3230" },
  { code: "ACT 4000", credits: 3, prealablesBrut: "57 crédits complétés dans le baccalauréat en mathématiques 1-190-1-0 avec une moyenne cumulative supérieure à 3.3." },
  { code: "DMO 1000", credits: 3, restrictionsBrut: "DMO1000/DMO1010" },
  { code: "ECN 1000", credits: 3 },
  { code: "ECN 1040", credits: 3, prealablesBrut: "ECN1000" },
  { code: "ECN 1050", credits: 3 },
  { code: "ECN 2165", credits: 3 },
  { code: "IFT 1015", credits: 3 },
  { code: "IFT 1025", credits: 3, prealablesBrut: "IFT1015 ou IFT1016" },
  { code: "IFT 1174", credits: 3 },
  { code: "IFT 2015", credits: 3, prealablesBrut: "IFT1025 et IFT1065" },
  { code: "IFT 3245", credits: 3, prealablesBrut: "IFT2015 ET (MAT1978 OU MAT1720 OU PHY2215)" },
  { code: "IFT 3700", credits: 3, prealablesBrut: "IFT2015 ET (MAT1978 OU MAT1720 OU STT1700)" },
  { code: "MAT 1000", credits: 4 },
  { code: "MAT 1400", credits: 4 },
  { code: "MAT 1410", credits: 3, prealablesBrut: "MAT1400" },
  { code: "MAT 1500", credits: 4 },
  { code: "MAT 1600", credits: 4 },
  { code: "MAT 1720", credits: 4 },
  { code: "MAT 2000", credits: 3 },
  { code: "MAT 2050", credits: 3, prealablesBrut: "MAT1000" },
  { code: "MAT 2100", credits: 3, prealablesBrut: "MAT1000" },
  { code: "MAT 2115", credits: 3, prealablesBrut: "MAT1400 ET MAT1600" },
  { code: "MAT 2130", credits: 3, prealablesBrut: "MAT1000" },
  { code: "MAT 2412", credits: 3, prealablesBrut: "MAT1400 ET MAT1600" },
  { code: "MAT 2717", credits: 3, prealablesBrut: "MAT1600 et (MAT1720 ou MAT1978)" },
  { code: "MAT 2719", credits: 3, prealablesBrut: "MAT1000 et (MAT1720 ou MAT1978)." },
  { code: "MAT 3000", credits: 3 },
  { code: "MAT 6117", credits: 4 },
  { code: "MAT 6701", credits: 4 },
  { code: "STT 1682", credits: 1 },
  { code: "STT 1700", credits: 3 },
  { code: "STT 2000", credits: 3, concomitantsBrut: "STT2000 et STT2700" },
  { code: "STT 2105", credits: 3, prealablesBrut: "STT2700", concomitantsBrut: "MAT2717" },
  { code: "STT 2400", credits: 3, prealablesBrut: "MAT1600", concomitantsBrut: "STT2700" },
  { code: "STT 2700", credits: 3, prealablesBrut: "(MAT1720 ou MAT1978) et STT1700" },
  { code: "STT 3220", credits: 3, prealablesBrut: "STT2400 et STT2700" },
  { code: "STT 3260", credits: 3, prealablesBrut: "STT2400 et STT2700" },
  { code: "STT 3410", credits: 3, prealablesBrut: "STT2400 et STT2700" },
  { code: "STT 3510", credits: 3, prealablesBrut: "STT2700" },
  { code: "STT 3781", credits: 3, prealablesBrut: "STT3410" },
  { code: "STT 3790", credits: 3, prealablesBrut: "STT2400 et STT2700" },
  { code: "STT 3795", credits: 3, prealablesBrut: "MAT1400/MAT1600/MAT1720 ou MAT1978" },
];

/** ISO du scrape d'où viennent ces chaînes. Figé avec elles : une donnée sans
 *  date de scrape est invérifiable. */
export const SCRAPE_FIGE = "2026-09-11T03:41:19.066Z";

// ---------------------------------------------------------------------------
// Les 8 blocs
// ---------------------------------------------------------------------------

type BlocFige = Pick<Bloc, "id" | "segment" | "nom" | "regle" | "regleBrut" | "cours">;

/** Les huit blocs des segments 01 et 75, verbatim de la page de structure. */
export const BLOCS_ACTUARIAT: readonly BlocFige[] = [
  {
    id: "01A", segment: "01", nom: "",
    regle: { type: "obligatoire", bornes: { min: 26, max: 26 } },
    regleBrut: "Obligatoire - 26 crédits.",
    cours: ["MAT 1000", "MAT 1400", "MAT 1500", "MAT 1600", "MAT 1720", "MAT 2717", "STT 1700"],
  },
  {
    id: "75A", segment: "75", nom: "Actuariat, mathématiques financières et statistique",
    regle: { type: "obligatoire", bornes: { min: 21, max: 21 } },
    regleBrut: "Obligatoire - 21 crédits.",
    cours: ["ACT 1240", "ACT 2243", "ACT 2250", "ACT 3201", "ACT 3251", "STT 2400", "STT 2700"],
  },
  {
    id: "75B", segment: "75", nom: "Outils informatiques de base",
    regle: { type: "obligatoire", bornes: { min: 7, max: 7 } },
    regleBrut: "Obligatoire - 7 crédits.",
    cours: ["IFT 1015", "IFT 1174", "STT 1682"],
  },
  {
    id: "75C", segment: "75", nom: "Compléments d'actuariat",
    regle: { type: "option", bornes: { min: 12, max: 27 } },
    regleBrut: "Option - Minimum 12 crédits, maximum 27 crédits.",
    cours: ["ACT 2241", "ACT 2242", "ACT 2251", "ACT 2284", "ACT 3230", "ACT 3253", "ACT 3261", "ACT 3282", "ACT 4000", "MAT 2000", "MAT 3000"],
  },
  {
    id: "75D", segment: "75", nom: "Compléments de statistique",
    regle: { type: "option", bornes: { min: 3, max: 15 } },
    regleBrut: "Option - Minimum 3 crédits, maximum 15 crédits.",
    cours: ["STT 2000", "STT 2105", "STT 3220", "STT 3260", "STT 3410", "STT 3510", "STT 3781", "STT 3790", "STT 3795"],
  },
  {
    id: "75E", segment: "75", nom: "Compléments de mathématiques",
    // « Option - Maximum 13 crédits. » : aucun minimum écrit, donc min 0. Ce
    // n'est pas une invention, c'est la lecture de l'absence de minimum.
    regle: { type: "option", bornes: { min: 0, max: 13 } },
    regleBrut: "Option - Maximum 13 crédits.",
    cours: ["MAT 1410", "MAT 2050", "MAT 2100", "MAT 2115", "MAT 2130", "MAT 2412", "MAT 2719", "MAT 6117", "MAT 6701"],
  },
  {
    id: "75Y", segment: "75", nom: "Contributions d'autres disciplines",
    regle: { type: "option", bornes: { min: 3, max: 12 } },
    regleBrut: "Option - Minimum 3 crédits, maximum 12 crédits.",
    cours: ["DMO 1000", "ECN 1000", "ECN 1040", "ECN 1050", "ECN 2165", "IFT 1025", "IFT 2015", "IFT 3245", "IFT 3700"],
  },
  {
    id: "75Z", segment: "75", nom: "",
    regle: { type: "choix", bornes: { min: 3, max: 3 } },
    regleBrut: "Choix - 3 crédits.",
    cours: [],
  },
];

/**
 * La phrase d'exigences par type, VERBATIM de la page de structure.
 *
 * Le scraper l'avait consignée dans son journal faute de champ pour la porter
 * (`data/catalogue.json`, `_journal[0]`), et `docs/CONTRAT.md` la confirme à la
 * section « Confirmation directe du 54/33/3 ». Le contrat v2 lui donne enfin un
 * emplacement : c'est donc le chemin NORMAL, et la déduction 90 − 54 − 3 de la
 * v1 redevient ce qu'elle aurait toujours dû être, une exception.
 */
export const EXIGENCES_ACTUARIAT = {
  brut: "orientation Actuariat (segments 01 et 75) avec 54 crédits obligatoires, 33 crédits à option et 3 crédits au choix.",
  obligatoire: { min: 54, max: 54 },
  option: { min: 33, max: 33 },
  choix: { min: 3, max: 3 },
} as const;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function ficheComplete(f: FicheFigee): Cours {
  return {
    code: f.code,
    titre: `Cours ${f.code}`,
    credits: f.credits,
    cycle: "1er cycle",
    faculte: null,
    description: "",
    // `undefined` dans la table figée veut dire « la page n'a pas ce champ »,
    // ce qui est exactement ce que `null` signifie dans le contrat.
    prealablesBrut: f.prealablesBrut ?? null,
    prealables: null, // rempli par le test, avec le parseur qu'il éprouve
    concomitantsBrut: f.concomitantsBrut ?? null,
    restrictionsBrut: f.restrictionsBrut ?? null,
    trimestres: [], // non figé : aucun test du moteur n'en dépend
    url: `https://admission.umontreal.ca/cours-et-horaires/cours/${f.code.toLowerCase().replace(" ", "-")}/`,
    scrapeISO: SCRAPE_FIGE,
  };
}

/**
 * Le programme actuariat tel qu'un appelant l'obtiendrait APRÈS
 * `projeterOrientation()` : une page réduite à un parcours. `orientations` est
 * donc vide et `orientation` nommée, comme le veut le contrat — le moteur ne
 * projette pas, il reçoit un programme déjà réduit.
 */
export function programmeActuariat(): Programme {
  return {
    id: "baccalaureat-en-mathematiques",
    nom: "Baccalauréat en mathématiques",
    orientation: "Actuariat",
    segments: ["01", "75"],
    orientations: [],
    cycle: "1er cycle",
    faculte: "Faculté des arts et des sciences",
    typeProgramme: "Baccalauréat",
    creditsTotal: 90,
    exigences: {
      brut: EXIGENCES_ACTUARIAT.brut,
      obligatoire: { ...EXIGENCES_ACTUARIAT.obligatoire },
      option: { ...EXIGENCES_ACTUARIAT.option },
      choix: { ...EXIGENCES_ACTUARIAT.choix },
    },
    blocs: BLOCS_ACTUARIAT.map((b) => ({
      ...b,
      cle: cleBloc(b.segment, b.id, b.nom),
      cours: [...b.cours],
      // Aucun de ces huit blocs ne décrit son contenu en prose : 75Z est un
      // bloc au choix (liste vide ET type « choix »), les sept autres énumèrent.
      contenuOuvert: false,
      notes: [],
    })),
    notes: [],
    url: "https://admission.umontreal.ca/programmes/baccalaureat-en-mathematiques/structure-du-programme/",
    scrapeISO: SCRAPE_FIGE,
  };
}

/** Le même programme sans `exigences` : le chemin de REPLI, où le moteur doit
 *  déduire 90 − 54 − 3 = 33 et le déclarer. Sert à garder ce chemin testé
 *  maintenant qu'il n'est plus le chemin normal. */
export function programmeActuariatSansExigences(): Programme {
  return { ...programmeActuariat(), exigences: null };
}

export function catalogueActuariat(): Catalogue {
  return {
    programmes: [programmeActuariat()],
    cours: Object.fromEntries(FICHES_ACTUARIAT.map((f) => [f.code, ficheComplete(f)])),
    prealablesNonParses: [],
    journal: [],
    scrapeISO: SCRAPE_FIGE,
  };
}
