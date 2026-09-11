/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  DONNÉES FABRIQUÉES. AUCUNE DE CES VALEURS N'A ÉTÉ LUE SUR UN SITE.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les noms de programmes, les noms de facultés, les codes de cours, les titres,
 * les crédits, les préalables et les horaires de ce fichier sont INVENTÉS. Ils
 * ressemblent à des données d'UdeM pour que la recherche et les filtres soient
 * éprouvés à l'échelle réelle, et c'est précisément ce qui les rend dangereux :
 * rien ici ne doit jamais être pris pour un scrape.
 *
 * Trois garde-fous, repris de la v1 :
 *  1. tous les identifiants de programme commencent par `demo-`, donc aucun ne
 *     peut passer pour un slug d'UdeM ;
 *  2. `Depot.estFactice` vaut `true`, ce qui allume une bannière visible sur
 *     tous les écrans tant que ce dépôt est branché ;
 *  3. le débranchement tient en deux lignes dans `app/_donnees/source.ts`.
 *
 * Rien n'est écrit dans `data/` : ce dossier appartient à la session scraper,
 * qui produit les vraies données en parallèle.
 *
 * ## Ce que ce jeu de démonstration éprouve exprès
 *
 * Il ne suffit pas qu'il soit gros ; il doit contenir les cas qui cassent.
 *  - des programmes à 2 blocs et des programmes à 30 ;
 *  - `creditsTotal: null` (le contrat v2 l'autorise, et la v1 affichait « NaN
 *    crédits ») ;
 *  - les neuf formes de `RegleBloc`, plus une règle `inconnu` ;
 *  - `Programme.exigences` en INTERVALLES (« de 30 à 33 à option »), pas
 *    seulement en valeurs exactes ;
 *  - `structureLue: false` (année préparatoire, accès-fac) ;
 *  - deux blocs de même `id` dans un même segment (`MM-Bloc 73A` et
 *    `S-Bloc 73A`), qui est la raison d'être de `Bloc.cle` ;
 *  - des cours cités par un bloc SANS fiche de cours ;
 *  - des codes suffixés (`DRT 1151G`) et à cinq chiffres (`PSY 40001`) ;
 *  - des cours offerts à une seule saison, qui est la contrainte qui casse un
 *    plan ;
 *  - des préalables `ET`, `OU` et `opaque`, et des lignes de préalables non
 *    réduites ;
 *  - `restrictionsBrut`, qui n'est NI un préalable NI un concomitant ;
 *  - une réplique de l'arithmétique vérifiée de l'actuariat (54 / 33 / 3 avec
 *    des minimums de blocs à 18), pour que la balance de l'audit montre l'écart
 *    de 15 crédits sur un cas dont on connaît la réponse.
 */
import { cleBloc } from "../../lib/codes";
import { cleParcours } from "../../lib/parcours";
import type {
  Bloc,
  Cours,
  ExigencesParType,
  FicheIndex,
  IndexProgrammes,
  Intervalle,
  NoeudPrealable,
  Orientation,
  Programme,
  RegleBloc,
  Saison,
  Trimestre,
} from "../../lib/types";

/** Date de « scrape » de la démonstration : l'époque Unix, pour qu'une donnée
 *  fabriquée ne puisse pas se faire passer pour une donnée fraîche. */
const ISO_DEMO = "1970-01-01T00:00:00.000Z";

/** Générateur déterministe (mulberry32). Une graine fixe, donc deux
 *  rechargements donnent exactement le même catalogue : sans ça le sélecteur
 *  changerait de contenu à chaque visite et rien ne serait reproductible. */
function graine(valeur: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < valeur.length; i += 1) {
    h ^= valeur.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entier(dé: () => number, min: number, max: number): number {
  return min + Math.floor(dé() * (max - min + 1));
}

function choisir<T>(dé: () => number, liste: readonly T[]): T {
  return liste[Math.floor(dé() * liste.length)];
}

function slug(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Vocabulaire de façade
// ---------------------------------------------------------------------------

type Cycle = "1er cycle" | "2e cycle" | "3e cycle";

interface TypeProgramme {
  nom: string;
  cycle: Cycle;
  /** Crédits usuels. `null` signifie « la page ne l'annonce pas ». */
  credits: number | null;
  blocs: Intervalle;
}

const TYPES: readonly TypeProgramme[] = [
  { nom: "Baccalauréat", cycle: "1er cycle", credits: 90, blocs: { min: 5, max: 12 } },
  { nom: "Certificat", cycle: "1er cycle", credits: 30, blocs: { min: 2, max: 5 } },
  { nom: "Majeure", cycle: "1er cycle", credits: 60, blocs: { min: 3, max: 8 } },
  { nom: "Mineure", cycle: "1er cycle", credits: 30, blocs: { min: 2, max: 4 } },
  { nom: "Microprogramme", cycle: "1er cycle", credits: 15, blocs: { min: 2, max: 3 } },
  { nom: "Maîtrise", cycle: "2e cycle", credits: 45, blocs: { min: 4, max: 30 } },
  { nom: "Maîtrise professionnelle", cycle: "2e cycle", credits: 45, blocs: { min: 3, max: 9 } },
  { nom: "DESS", cycle: "2e cycle", credits: 30, blocs: { min: 2, max: 6 } },
  { nom: "Microprogramme de 2e cycle", cycle: "2e cycle", credits: 15, blocs: { min: 2, max: 3 } },
  { nom: "Doctorat", cycle: "3e cycle", credits: null, blocs: { min: 2, max: 6 } },
];

interface Discipline {
  nom: string;
  /** Sujet de trois lettres — la clé de découpage de `data/cours/`. */
  sujet: string;
  faculte: string;
  /** Sujets voisins : les préalables franchissent les sujets, et c'est ce qui
   *  fait que l'assemblage doit suivre les préalables de proche en proche. */
  voisins: string[];
}

const DISCIPLINES: readonly Discipline[] = [
  { nom: "actuariat", sujet: "ACT", faculte: "Arts et sciences", voisins: ["MAT", "STT"] },
  { nom: "mathématiques", sujet: "MAT", faculte: "Arts et sciences", voisins: ["STT"] },
  { nom: "statistique", sujet: "STT", faculte: "Arts et sciences", voisins: ["MAT"] },
  { nom: "informatique", sujet: "IFT", faculte: "Arts et sciences", voisins: ["MAT"] },
  { nom: "physique", sujet: "PHY", faculte: "Arts et sciences", voisins: ["MAT"] },
  { nom: "chimie", sujet: "CHM", faculte: "Arts et sciences", voisins: ["PHY"] },
  { nom: "biologie", sujet: "BIO", faculte: "Arts et sciences", voisins: ["CHM"] },
  { nom: "biochimie", sujet: "BCM", faculte: "Médecine", voisins: ["CHM", "BIO"] },
  { nom: "microbiologie", sujet: "MCB", faculte: "Médecine", voisins: ["BCM"] },
  { nom: "sciences économiques", sujet: "ECN", faculte: "Arts et sciences", voisins: ["MAT", "STT"] },
  { nom: "démographie", sujet: "DMO", faculte: "Arts et sciences", voisins: ["STT"] },
  { nom: "géographie", sujet: "GEO", faculte: "Arts et sciences", voisins: ["DMO"] },
  { nom: "science politique", sujet: "POL", faculte: "Arts et sciences", voisins: ["SOL"] },
  { nom: "sociologie", sujet: "SOL", faculte: "Arts et sciences", voisins: ["ANT"] },
  { nom: "anthropologie", sujet: "ANT", faculte: "Arts et sciences", voisins: ["SOL"] },
  { nom: "criminologie", sujet: "CRI", faculte: "Arts et sciences", voisins: ["SOL", "PSY"] },
  { nom: "psychologie", sujet: "PSY", faculte: "Arts et sciences", voisins: ["STT"] },
  { nom: "philosophie", sujet: "PHI", faculte: "Arts et sciences", voisins: [] },
  { nom: "histoire", sujet: "HST", faculte: "Arts et sciences", voisins: ["PHI"] },
  { nom: "histoire de l'art", sujet: "HAR", faculte: "Arts et sciences", voisins: ["HST"] },
  { nom: "études cinématographiques", sujet: "CIN", faculte: "Arts et sciences", voisins: ["HAR"] },
  { nom: "linguistique", sujet: "LNG", faculte: "Arts et sciences", voisins: [] },
  { nom: "traduction", sujet: "TRA", faculte: "Arts et sciences", voisins: ["LNG"] },
  { nom: "études françaises", sujet: "FRA", faculte: "Arts et sciences", voisins: ["LNG"] },
  { nom: "études anglaises", sujet: "ANG", faculte: "Arts et sciences", voisins: ["LNG"] },
  { nom: "études hispaniques", sujet: "ESP", faculte: "Arts et sciences", voisins: ["LNG"] },
  { nom: "études classiques", sujet: "GRE", faculte: "Arts et sciences", voisins: ["HST"] },
  { nom: "études allemandes", sujet: "ALL", faculte: "Arts et sciences", voisins: ["LNG"] },
  { nom: "études est-asiatiques", sujet: "ASI", faculte: "Arts et sciences", voisins: ["HST"] },
  { nom: "sciences des religions", sujet: "SCR", faculte: "Arts et sciences", voisins: ["PHI"] },
  { nom: "théologie", sujet: "THL", faculte: "Arts et sciences", voisins: ["SCR"] },
  { nom: "communication", sujet: "COM", faculte: "Arts et sciences", voisins: ["SOL"] },
  { nom: "journalisme", sujet: "JOU", faculte: "Arts et sciences", voisins: ["COM"] },
  { nom: "bibliothéconomie", sujet: "BLT", faculte: "Arts et sciences", voisins: ["COM"] },
  { nom: "travail social", sujet: "SVS", faculte: "Arts et sciences", voisins: ["PSY"] },
  { nom: "relations industrielles", sujet: "REI", faculte: "Arts et sciences", voisins: ["ECN"] },
  { nom: "droit", sujet: "DRT", faculte: "Droit", voisins: ["POL"] },
  { nom: "médecine", sujet: "MMD", faculte: "Médecine", voisins: ["BCM", "PHA"] },
  { nom: "sciences infirmières", sujet: "SOI", faculte: "Sciences infirmières", voisins: ["BIO"] },
  { nom: "pharmacie", sujet: "PHA", faculte: "Pharmacie", voisins: ["CHM"] },
  { nom: "médecine dentaire", sujet: "DEN", faculte: "Médecine dentaire", voisins: ["BIO"] },
  { nom: "médecine vétérinaire", sujet: "MVE", faculte: "Médecine vétérinaire", voisins: ["BIO"] },
  { nom: "optométrie", sujet: "OPM", faculte: "Optométrie", voisins: ["PHY"] },
  { nom: "nutrition", sujet: "NUT", faculte: "Médecine", voisins: ["BCM"] },
  { nom: "kinésiologie", sujet: "KIN", faculte: "Médecine", voisins: ["BIO"] },
  { nom: "orthophonie", sujet: "ORA", faculte: "Médecine", voisins: ["LNG"] },
  { nom: "physiothérapie", sujet: "PHT", faculte: "Médecine", voisins: ["KIN"] },
  { nom: "ergothérapie", sujet: "ERG", faculte: "Médecine", voisins: ["KIN"] },
  { nom: "santé publique", sujet: "MSO", faculte: "Médecine", voisins: ["STT", "DMO"] },
  { nom: "sciences biomédicales", sujet: "SBM", faculte: "Médecine", voisins: ["BCM"] },
  { nom: "psychoéducation", sujet: "PSE", faculte: "Arts et sciences", voisins: ["PSY"] },
  { nom: "éducation", sujet: "EDU", faculte: "Sciences de l'éducation", voisins: ["PSY"] },
  { nom: "psychopédagogie", sujet: "PPA", faculte: "Sciences de l'éducation", voisins: ["EDU"] },
  { nom: "didactique", sujet: "DID", faculte: "Sciences de l'éducation", voisins: ["EDU"] },
  { nom: "administration de l'éducation", sujet: "ETA", faculte: "Sciences de l'éducation", voisins: ["EDU"] },
  { nom: "musique", sujet: "MUS", faculte: "Musique", voisins: [] },
  { nom: "interprétation musicale", sujet: "MUI", faculte: "Musique", voisins: ["MUS"] },
  { nom: "composition musicale", sujet: "MCM", faculte: "Musique", voisins: ["MUS"] },
  { nom: "architecture", sujet: "ARC", faculte: "Aménagement", voisins: ["URB"] },
  { nom: "urbanisme", sujet: "URB", faculte: "Aménagement", voisins: ["GEO"] },
  { nom: "architecture de paysage", sujet: "APA", faculte: "Aménagement", voisins: ["ARC"] },
  { nom: "design industriel", sujet: "DIN", faculte: "Aménagement", voisins: ["ARC"] },
  { nom: "urbanisme et mobilité", sujet: "AME", faculte: "Aménagement", voisins: ["URB"] },
];

/** Les 9 formes de règle réellement écrites sur le site, plus l'inconnue. */
interface FormeRegle {
  brut: string;
  regle: RegleBloc;
}

function formesPour(dé: () => number): FormeRegle[] {
  const n = entier(dé, 3, 9);
  const m = entier(dé, 9, 21);
  return [
    { brut: `Obligatoire - ${m} crédits.`, regle: { type: "obligatoire", bornes: { min: m, max: m } } },
    { brut: `obligatoire - ${n} crédits.`, regle: { type: "obligatoire", bornes: { min: n, max: n } } },
    { brut: `Option - ${n} crédits.`, regle: { type: "option", bornes: { min: n, max: n } } },
    { brut: `Option - Minimum ${n} crédits, maximum ${n + 6} crédits.`, regle: { type: "option", bornes: { min: n, max: n + 6 } } },
    { brut: `Option - Maximum ${n + 3} crédits.`, regle: { type: "option", bornes: { min: 0, max: n + 3 } } },
    { brut: `option - minimum ${n} crédits, maximum ${n + 9} crédits.`, regle: { type: "option", bornes: { min: n, max: n + 9 } } },
    { brut: "Choix - 3 crédits.", regle: { type: "choix", bornes: { min: 3, max: 3 } } },
    { brut: "Choix - Maximum 3 crédits.", regle: { type: "choix", bornes: { min: 0, max: 3 } } },
    { brut: "Choix - Minimum 3 crédits, maximum 6 crédits.", regle: { type: "choix", bornes: { min: 3, max: 6 } } },
  ];
}

const NOTES_BLOC = [
  "L'inscription à ce bloc requiert l'autorisation du responsable de programme.",
  "Un maximum de 6 crédits peut être suivi hors de la Faculté.",
  "Les cours de ce bloc ne sont pas offerts tous les ans.",
  "L'étudiant qui a déjà suivi un cours équivalent doit le remplacer par un cours au choix.",
] as const;

const NOTES_PROGRAMME = [
  "Le programme est contingenté ; l'admission ne garantit pas le choix d'orientation.",
  "La moyenne cumulative exigée pour la poursuite des études est de 2,0 sur 4,3.",
  "Un stage crédité peut remplacer jusqu'à 6 crédits de cours à option.",
] as const;

// ---------------------------------------------------------------------------
// L'index
// ---------------------------------------------------------------------------

/** Fiches hors structure : la page existe mais n'a rien d'exploitable. C'est le
 *  cas que le sélecteur doit NOMMER au lieu d'ouvrir un écran vide. */
const SANS_STRUCTURE: readonly { nom: string; type: string; cycle: Cycle }[] = [
  { nom: "Année préparatoire en sciences", type: "Année préparatoire", cycle: "1er cycle" },
  { nom: "Année préparatoire en sciences humaines", type: "Année préparatoire", cycle: "1er cycle" },
  { nom: "Accès-fac — Arts et sciences", type: "Accès-fac", cycle: "1er cycle" },
  { nom: "Accès-fac — Sciences de la santé", type: "Accès-fac", cycle: "1er cycle" },
  { nom: "Propédeutique en linguistique", type: "Propédeutique", cycle: "2e cycle" },
  { nom: "Propédeutique en informatique", type: "Propédeutique", cycle: "2e cycle" },
  { nom: "Stage postdoctoral en sciences biomédicales", type: "Stage postdoctoral", cycle: "3e cycle" },
];

/** Orientations données à certains baccalauréats, pour que le sélecteur ait à
 *  distinguer deux fiches de même nom — ce que `Programme.orientation` sert à
 *  faire, et que la recherche doit afficher sans ambiguïté. */
const ORIENTATIONS: Record<string, string[]> = {
  MAT: ["Actuariat", "Mathématiques appliquées", "Mathématiques pures", "Statistique"],
  IFT: ["Génie logiciel", "Intelligence artificielle", "Bio-informatique"],
  PSY: ["Recherche", "Clinique"],
  COM: ["Communication organisationnelle", "Médias et culture"],
  MUS: ["Musicologie", "Écriture", "Musiques numériques"],
  DRT: [],
};

export interface Fabrique {
  index: IndexProgrammes;
  programme(id: string): Programme | null;
  sujet(sujet: string): Cours[];
}

/** Noms d'orientations génériques, pour que la proportion de pages à parcours
 *  multiples approche celle mesurée sur le vrai site (17,3 %, jusqu'à dix). */
const ORIENTATIONS_GENERIQUES = [
  "Général",
  "Honor",
  "COOP",
  "Cheminement international",
  "Avec stages",
  "Recherche",
  "Professionnel",
  "Enseignement au secondaire",
  "Cheminement intensif",
  "Bidisciplinaire",
] as const;

/**
 * Les orientations d'une page, ou une liste vide.
 *
 * UNE seule définition, parce que l'index et le programme doivent s'accorder :
 * une orientation présente dans l'un et absente de l'autre ferait échouer
 * `projeterOrientation()` — bruyamment, heureusement, mais sur un écran.
 */
function orientationsDe(discipline: Discipline, type: TypeProgramme): string[] {
  const nommees = ORIENTATIONS[discipline.sujet];
  if (type.nom === "Baccalauréat" && nommees !== undefined) return nommees;
  // Les baccalauréats et les maîtrises portent souvent des orientations ; les
  // certificats et microprogrammes, jamais.
  if (type.nom !== "Baccalauréat" && !type.nom.startsWith("Maîtrise")) return [];
  // Calibré pour approcher la mesure du vrai site : ~17 % des PAGES portent
  // des orientations, et l'index compte alors nettement plus de parcours que
  // de pages. C'est l'échelle à laquelle la recherche doit rester vive.
  const dé = graine(`orientations/${discipline.sujet}/${type.nom}`);
  if (dé() >= 0.5) return [];
  return ORIENTATIONS_GENERIQUES.slice(0, entier(dé, 2, ORIENTATIONS_GENERIQUES.length));
}

/** Segment propre à la n-ième orientation d'une page. Le commun est « 01 ». */
function segmentOrientation(rang: number): string {
  return String(75 + rang);
}

/**
 * Les fiches d'index d'UNE page.
 *
 * Une page à orientations en produit PLUSIEURS, qui partagent le même `id` —
 * le nom du fichier `data/programmes/<id>.json` — et se distinguent par `cle`.
 * C'est le point du contrat : l'étudiant choisit un PARCOURS, pas une page. Le
 * bacc en mathématiques est une seule page et quatre parcours exclusifs, dont
 * chacun a ses segments et sa propre répartition de crédits.
 */
function fichesDe(discipline: Discipline, type: TypeProgramme): FicheIndex[] {
  const orientations = orientationsDe(discipline, type);
  const base = `${type.nom} en ${discipline.nom}`;
  const id = `demo-${slug(base)}`;

  const construire = (orientation: string | null): FicheIndex => {
    const dé = graine(cleParcours(id, orientation));
    // Un doctorat n'annonce pas toujours un total de crédits ; un microprogramme
    // non plus. `creditsTotal: null` doit traverser toute l'UI sans « NaN ».
    const credits = type.credits === null || dé() < 0.08 ? null : type.credits;
    return {
      cle: cleParcours(id, orientation),
      id,
      nom: base,
      orientation,
      cycle: type.cycle,
      faculte: discipline.faculte,
      typeProgramme: type.nom,
      creditsTotal: credits,
      nbBlocs: entier(dé, type.blocs.min, type.blocs.max),
      structureLue: true,
    };
  };

  return orientations.length > 0
    ? orientations.map((orientation) => construire(orientation))
    : [construire(null)];
}

/** Un type de programme existe-t-il pour cette discipline ? Toutes les
 *  combinaisons n'ont pas de sens, et un index où tout se combine donnerait une
 *  recherche trop régulière pour éprouver quoi que ce soit. */
function existe(discipline: Discipline, type: TypeProgramme): boolean {
  // Le baccalauréat en mathématiques est garanti : c'est lui qui porte
  // l'orientation actuariat, dont l'arithmétique 54/33/3 est la seule dont on
  // connaisse la bonne réponse. Un tirage aléatoire pourrait le faire
  // disparaître de l'index, et avec lui le cas de référence.
  if (discipline.sujet === "MAT" && type.nom === "Baccalauréat") return true;
  const dé = graine(`${discipline.sujet}/${type.nom}`);
  if (type.nom === "Baccalauréat") return dé() < 0.9;
  if (type.nom === "Doctorat") return dé() < 0.72;
  if (type.nom === "Maîtrise") return dé() < 0.86;
  return dé() < 0.7;
}

function construireIndex(): IndexProgrammes {
  const programmes: FicheIndex[] = [];

  for (const discipline of DISCIPLINES) {
    for (const type of TYPES) {
      if (!existe(discipline, type)) continue;
      programmes.push(...fichesDe(discipline, type));
    }
  }

  for (const hors of SANS_STRUCTURE) {
    const id = `demo-${slug(hors.nom)}`;
    programmes.push({
      cle: cleParcours(id, null),
      id,
      nom: hors.nom,
      orientation: null,
      cycle: hors.cycle,
      faculte: "Études supérieures et postdoctorales",
      typeProgramme: hors.type,
      creditsTotal: null,
      nbBlocs: 0,
      structureLue: false,
    });
  }

  // Les répliques nommées, pour que les cas connus soient atteignables.
  programmes.push({
    cle: cleParcours(ID_MAITRISE_DOUBLE, null),
    id: ID_MAITRISE_DOUBLE,
    nom: "Maîtrise en mathématiques",
    orientation: null,
    cycle: "2e cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Maîtrise",
    creditsTotal: 45,
    nbBlocs: 4,
    structureLue: true,
  });
  programmes.push({
    cle: cleParcours(ID_DROIT_INTERVALLE, null),
    id: ID_DROIT_INTERVALLE,
    nom: "Baccalauréat en droit",
    orientation: null,
    cycle: "1er cycle",
    faculte: "Droit",
    typeProgramme: "Baccalauréat",
    creditsTotal: 101,
    nbBlocs: 6,
    structureLue: true,
  });
  // La page à CONTENU OUVERT : un bloc décrit en prose, que l'outil ne peut
  // pas vérifier. Ce n'est ni un bloc au choix ni une erreur.
  programmes.push({
    cle: cleParcours(ID_MUSIQUE_OUVERT, null),
    id: ID_MUSIQUE_OUVERT,
    nom: "Baccalauréat en musique — écriture",
    orientation: null,
    cycle: "1er cycle",
    faculte: "Musique",
    typeProgramme: "Baccalauréat",
    creditsTotal: 90,
    nbBlocs: 4,
    structureLue: true,
  });

  return {
    programmes,
    sujets: DISCIPLINES.map((d) => d.sujet).sort(),
    scrapeISO: ISO_DEMO,
  };
}

/** La PAGE du bacc en mathématiques : un seul fichier, quatre parcours. */
export const ID_PAGE_MATHS = "demo-baccalaureat-en-mathematiques";
/** Le PARCOURS actuariat de cette page — ce que le sélecteur retient. */
export const CLE_ACTUARIAT = cleParcours(ID_PAGE_MATHS, "Actuariat");
export const ID_MAITRISE_DOUBLE = "demo-maitrise-en-mathematiques-blocs-homonymes";
export const ID_DROIT_INTERVALLE = "demo-baccalaureat-en-droit-intervalle";
export const ID_MUSIQUE_OUVERT = "demo-baccalaureat-en-musique-ecriture";

// ---------------------------------------------------------------------------
// Les programmes
// ---------------------------------------------------------------------------

function bloc(
  segment: string,
  id: string,
  nom: string,
  regleBrut: string,
  regle: RegleBloc,
  cours: string[],
  notes: string[] = [],
  contenuOuvert = false,
): Bloc {
  return {
    id,
    cle: cleBloc(segment, id),
    segment,
    nom,
    regle,
    regleBrut,
    cours,
    notes,
    contenuOuvert,
  };
}

/**
 * Codes FABRIQUÉS de toutes pièces, qui n'ont donc aucune fiche.
 *
 * Réservé au niveau 7000, que `coursDuSujet` ne produit jamais : c'est ainsi
 * qu'un bloc cite un cours sans fiche, qui est l'état NORMAL du catalogue et
 * doit s'afficher « titre inconnu », jamais « undefined ».
 */
function codesSansFiche(sujet: string, combien: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < combien; i += 1) out.push(`${sujet} ${7000 + i * 10}`);
  return out;
}

function niveauDe(code: string): number {
  return Math.floor(Number.parseInt(code.slice(4), 10) / 1000) * 1000;
}

/**
 * Codes d'un sujet à un niveau donné QUI EXISTENT VRAIMENT.
 *
 * Ils sont lus dans les fiches que la fabrique produira, et non recomposés
 * à partir du numéro. La version précédente les recomposait, et se trompait
 * pour les sujets à suffixe : `coursDuSujet("DRT")` produit parfois
 * « DRT 2010B », jamais « DRT 2010 ». Les blocs citaient donc des codes
 * inexistants, et un bloc obligatoire de 21 crédits ne trouvait que 19 crédits
 * de fiches — une incohérence qu'aucune erreur ne signalait, et que seul le
 * test de couture sur les sommes a fait apparaître.
 */
function codesExistants(
  sujet: string,
  niveau: number,
  combien: number,
  décalage = 0,
): string[] {
  return coursDuSujet(sujet)
    .filter((fiche) => niveauDe(fiche.code) === niveau)
    .slice(décalage, décalage + combien)
    .map((fiche) => fiche.code);
}

/** Un code à suffixe qui existe : `CRI 1600G` est une fiche DISTINCTE de
 *  `CRI 1600`, et l'UI doit le montrer tel quel. */
function codeSuffixe(sujet: string): string[] {
  const trouve = coursDuSujet(sujet).find((fiche) => /[A-Za-z]$/.test(fiche.code));
  return trouve === undefined ? [] : [trouve.code];
}

/**
 * Crédits des fiches que la fabrique produira pour ces codes.
 *
 * Les fiches de cours sont fabriquées par sujet, indépendamment des blocs. Sans
 * ce pont, un bloc « Obligatoire - 26 crédits » listerait des cours totalisant
 * 24 ou 29, et l'audit afficherait des crédits manquants ou perdus sur un bloc
 * OBLIGATOIRE — ce qui est incohérent et se lirait comme un bogue de l'audit
 * plutôt que comme une donnée fabriquée de travers. Le vrai catalogue, lui,
 * vérifie cette égalité : c'est même le test de couture le plus utile du projet
 * (les crédits des fiches somment à la règle de chaque bloc obligatoire).
 */
function creditsConnus(pool: string[]): Map<string, number> {
  const table = new Map<string, number>();
  for (const sujet of new Set(pool.map((code) => code.slice(0, 3)))) {
    for (const fiche of coursDuSujet(sujet)) table.set(fiche.code, fiche.credits);
  }
  return table;
}

/**
 * Sous-ensemble de `pool` dont les crédits somment EXACTEMENT à `cible`.
 *
 * Recherche exhaustive avec élagage : les pools font une quinzaine de codes et
 * les cibles une trentaine de crédits, donc c'est instantané. Déterministe, car
 * elle parcourt le pool dans l'ordre donné.
 */
function pourTotal(pool: string[], cible: number): string[] {
  const table = creditsConnus(pool);
  const items = pool.filter((code) => table.has(code));
  const solution: string[] = [];
  const chercher = (i: number, reste: number): boolean => {
    if (reste === 0) return true;
    if (reste < 0 || i >= items.length) return false;
    solution.push(items[i]);
    if (chercher(i + 1, reste - (table.get(items[i]) as number))) return true;
    solution.pop();
    return chercher(i + 1, reste);
  };
  if (chercher(0, cible)) return solution;
  // Aucune combinaison exacte : on rend le pool entier. Le bloc affichera un
  // écart, ce qui est au moins visible — plutôt qu'une sélection arbitraire
  // qui prétendrait tomber juste.
  return items;
}

/**
 * LA PAGE du baccalauréat en mathématiques : un seul fichier, QUATRE parcours
 * exclusifs.
 *
 * C'est le cas qui a fait bouger le contrat. Une page n'est pas un parcours :
 * celle-ci porte le segment commun 01 et un segment par orientation (75
 * actuariat, 76 appliquées, 77 pures, 78 statistique). Les additionner
 * exigerait à la fois le 75 et le 76, ce qui est impossible — d'où
 * `projeterOrientation()`, qui réduit la page à un parcours avant tout audit.
 *
 * Le parcours ACTUARIAT reproduit l'arithmétique vérifiée : 54 obligatoires,
 * 33 à option, 3 au choix pour 90 crédits, alors que les minimums des blocs
 * d'option ne totalisent que 18. L'écart de 15 crédits est le geste central de
 * la vue d'audit, et il se vérifie sur un cas dont on connaît la réponse.
 */
function programmeMaths(): Programme {
  /** Les blocs d'un parcours secondaire : un obligatoire et deux à option. */
  const parcoursSecondaire = (segment: string, sujet: string): Bloc[] => [
    bloc(segment, `${segment}A`, "", "Obligatoire - 18 crédits.", { type: "obligatoire", bornes: { min: 18, max: 18 } },
      pourTotal([...codesExistants(sujet, 2000, 8), ...codesExistants(sujet, 3000, 4)], 18)),
    bloc(segment, `${segment}C`, "", "Option - Minimum 15 crédits, maximum 24 crédits.", { type: "option", bornes: { min: 15, max: 24 } },
      [...codesExistants(sujet, 3000, 5, 4), ...codesExistants(sujet, 4000, 5)]),
    bloc(segment, `${segment}Z`, "", "Choix - 3 crédits.", { type: "choix", bornes: { min: 3, max: 3 } }, []),
  ];

  return {
    id: ID_PAGE_MATHS,
    nom: "Baccalauréat en mathématiques",
    // `orientation` reste null sur une page NON projetée : c'est
    // `orientations` qui porte l'information. Le contrat est explicite.
    orientation: null,
    segments: ["01", "75", "76", "77", "78"],
    cycle: "1er cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Baccalauréat",
    creditsTotal: 90,
    // Sur une page à orientations, les exigences sont PAR orientation.
    exigences: null,
    orientations: [
      {
        nom: "Actuariat",
        segments: ["01", "75"],
        exigences: {
          brut: "54 crédits obligatoires, 33 crédits à option et 3 crédits au choix",
          obligatoire: { min: 54, max: 54 },
          option: { min: 33, max: 33 },
          choix: { min: 3, max: 3 },
        },
      },
      {
        nom: "Mathématiques appliquées",
        segments: ["01", "76"],
        exigences: {
          brut: "44 crédits obligatoires, de 43 à 46 crédits à option et 3 crédits au choix",
          obligatoire: { min: 44, max: 44 },
          option: { min: 43, max: 46 },
          choix: { min: 3, max: 3 },
        },
      },
      {
        nom: "Mathématiques pures",
        segments: ["01", "77"],
        exigences: null,
      },
      {
        nom: "Statistique",
        segments: ["01", "78"],
        exigences: {
          brut: "44 crédits obligatoires, 43 crédits à option et 3 crédits au choix",
          obligatoire: { min: 44, max: 44 },
          option: { min: 43, max: 43 },
          choix: { min: 3, max: 3 },
        },
      },
    ],
    blocs: [
      // `nom: ""` est volontaire : le contrat dit que la page ne nomme ni le
      // bloc 01A ni le bloc 75Z, et inventer un nom de bloc est exactement la
      // faute que ce projet a déjà commise une fois.
      // Les trois blocs obligatoires listent des cours dont les crédits
      // somment EXACTEMENT à leur règle : 26 + 21 + 7 = 54.
      bloc("01", "01A", "", "Obligatoire - 26 crédits.", { type: "obligatoire", bornes: { min: 26, max: 26 } },
        pourTotal([...codesExistants("MAT", 1000, 8), ...codesExistants("STT", 1000, 3), ...codesExistants("IFT", 1000, 3)], 26)),
      bloc("75", "75A", "", "Obligatoire - 21 crédits.", { type: "obligatoire", bornes: { min: 21, max: 21 } },
        pourTotal([...codesExistants("ACT", 1000, 5), ...codesExistants("ACT", 2000, 5)], 21)),
      bloc("75", "75B", "", "Obligatoire - 7 crédits.", { type: "obligatoire", bornes: { min: 7, max: 7 } },
        pourTotal([...codesExistants("ACT", 3000, 2), ...codesExistants("MAT", 2000, 4), ...codesExistants("STT", 3000, 1)], 7)),
      bloc("75", "75C", "", "Option - Minimum 12 crédits, maximum 27 crédits.", { type: "option", bornes: { min: 12, max: 27 } },
        [...codesExistants("ACT", 3000, 6, 2), ...codesExistants("ACT", 4000, 5)],
        ["Au moins 6 crédits doivent être choisis parmi les cours de niveau 4000."]),
      bloc("75", "75D", "", "Option - Minimum 3 crédits, maximum 15 crédits.", { type: "option", bornes: { min: 3, max: 15 } },
        [...codesExistants("STT", 3000, 5, 1), ...codesExistants("MAT", 3000, 4)]),
      bloc("75", "75E", "", "Option - Maximum 13 crédits.", { type: "option", bornes: { min: 0, max: 13 } },
        [...codesExistants("ECN", 2000, 4), ...codesExistants("IFT", 2000, 3)]),
      bloc("75", "75Y", "", "Option - Minimum 3 crédits, maximum 12 crédits.", { type: "option", bornes: { min: 3, max: 12 } },
        // Trois cours de niveau 7000 : cités par le bloc, sans fiche. C'est le
        // cas normal du catalogue, et il doit s'afficher comme tel.
        [...codesSansFiche("ACT", 3), ...codesExistants("MAT", 4000, 3)]),
      bloc("75", "75Z", "", "Choix - 3 crédits.", { type: "choix", bornes: { min: 3, max: 3 } }, []),

      // Les trois autres parcours de la MÊME page. Leurs segments sont
      // exclusifs de 75 : c'est ce que la projection démêle.
      ...parcoursSecondaire("76", "MAT"),
      ...parcoursSecondaire("77", "MAT"),
      ...parcoursSecondaire("78", "STT"),
    ],
    notes: [
      "L'orientation actuariat prépare aux examens de la Society of Actuaries ; la réussite d'un cours ne dispense d'aucun examen professionnel.",
      "Le passage d'une orientation à une autre se fait sur demande au responsable de programme.",
    ],
    url: "https://exemple.invalid/demo/baccalaureat-en-mathematiques",
    scrapeISO: ISO_DEMO,
  };
}

/**
 * La page à BLOC OUVERT : le bloc 02E n'énumère aucun cours et décrit son
 * contenu en prose (renvoi aux cours du Centre de langues).
 *
 * Ce n'est PAS un bloc au choix et ce n'est pas une donnée manquante : c'est un
 * bloc que l'outil ne peut pas vérifier, et l'étudiant doit le savoir. Sans le
 * drapeau `contenuOuvert`, la seule façon de le reconnaître serait de deviner
 * d'après `notes`.
 */
function programmeMusique(): Programme {
  return {
    id: ID_MUSIQUE_OUVERT,
    nom: "Baccalauréat en musique — écriture",
    orientation: null,
    segments: ["02"],
    cycle: "1er cycle",
    faculte: "Musique",
    typeProgramme: "Baccalauréat",
    creditsTotal: 90,
    exigences: {
      brut: "60 crédits obligatoires, de 24 à 30 crédits à option",
      obligatoire: { min: 60, max: 60 },
      option: { min: 24, max: 30 },
      choix: null,
    },
    orientations: [],
    blocs: [
      bloc("02", "02A", "Écriture et analyse", "Obligatoire - 24 crédits.", { type: "obligatoire", bornes: { min: 24, max: 24 } },
        pourTotal(codesExistants("MUS", 1000, 12), 24)),
      bloc("02", "02B", "Interprétation", "Obligatoire - 36 crédits.", { type: "obligatoire", bornes: { min: 36, max: 36 } },
        pourTotal([...codesExistants("MUI", 1000, 12), ...codesExistants("MUI", 2000, 12)], 36)),
      bloc("02", "02D", "Répertoire", "Option - Minimum 18 crédits, maximum 24 crédits.", { type: "option", bornes: { min: 18, max: 24 } },
        codesExistants("MUS", 2000, 8)),
      bloc("02", "02E", "Langues", "Option - Maximum 6 crédits.", { type: "option", bornes: { min: 0, max: 6 } },
        // Aucun cours énuméré, et ce n'est pas une omission.
        [],
        [
          "Les cours de langue offerts par le Centre de langues peuvent être crédités à ce bloc, jusqu'à concurrence de 6 crédits.",
          "Le choix des cours doit être approuvé par le responsable de programme avant l'inscription.",
        ],
        true,
      ),
    ],
    notes: [],
    url: "https://exemple.invalid/demo/musique-ecriture",
    scrapeISO: ISO_DEMO,
  };
}

/** Deux blocs `73A` dans le même segment 73 — la raison d'être de `Bloc.cle`.
 *  Un extracteur ou un affichage ancré sur `id` fusionne les deux sans lever
 *  d'erreur, et 58 cours atterrissent dans le mauvais bloc. */
function programmeMaitriseDouble(): Programme {
  return {
    id: ID_MAITRISE_DOUBLE,
    nom: "Maîtrise en mathématiques",
    orientation: null,
    orientations: [],
    segments: ["70", "73"],
    cycle: "2e cycle",
    faculte: "Arts et sciences",
    typeProgramme: "Maîtrise",
    creditsTotal: 45,
    exigences: {
      brut: "21 crédits obligatoires et de 18 à 24 crédits à option",
      obligatoire: { min: 21, max: 21 },
      option: { min: 18, max: 24 },
      choix: null,
    },
    blocs: [
      bloc("70", "70A", "Mémoire", "Obligatoire - 21 crédits.", { type: "obligatoire", bornes: { min: 21, max: 21 } },
        // Pool large exprès : `pourTotal` cherche une somme EXACTE, et six
        // cours n'y suffisaient pas — il rendait alors le pool entier
        // (19 crédits), ce que le test de couture a attrapé.
        pourTotal([...codesExistants("MAT", 6000, 6, 5), ...codesExistants("MAT", 4000, 6)], 21)),
      bloc("73", "MM-Bloc 73A", "Mathématiques — cours avancés", "Option - Minimum 9 crédits, maximum 15 crédits.", { type: "option", bornes: { min: 9, max: 15 } },
        codesExistants("MAT", 6000, 5)),
      bloc("73", "S-Bloc 73A", "Statistique — cours avancés", "Option - Minimum 3 crédits, maximum 9 crédits.", { type: "option", bornes: { min: 3, max: 9 } },
        codesExistants("STT", 6000, 4)),
      // Une règle jamais vue : elle ne doit pas être avalée par un `switch`.
      bloc("73", "73B", "Séminaire", "Séminaire - à déterminer avec le directeur de recherche.", { type: "inconnu", brut: "Séminaire - à déterminer avec le directeur de recherche." },
        codesExistants("MAT", 6000, 1, 11),
        ["Le séminaire se fait sous la direction du directeur de recherche."]),
    ],
    notes: ["Le mémoire est évalué par un jury de trois membres."],
    url: "https://exemple.invalid/demo/maitrise-mathematiques",
    scrapeISO: ISO_DEMO,
  };
}

/** Exigences en INTERVALLE : droit écrit « de 30 à 33 à option ». C'est ce qui
 *  rend la déduction 90 − 54 − 3 impossible hors actuariat. */
function programmeDroit(): Programme {
  return {
    id: ID_DROIT_INTERVALLE,
    nom: "Baccalauréat en droit",
    orientation: null,
    orientations: [],
    segments: ["70"],
    cycle: "1er cycle",
    faculte: "Droit",
    typeProgramme: "Baccalauréat",
    creditsTotal: 101,
    exigences: {
      brut: "de 68 à 71 crédits obligatoires, de 30 à 33 crédits à option",
      obligatoire: { min: 68, max: 71 },
      option: { min: 30, max: 33 },
      choix: null,
    },
    blocs: [
      // Chaque bloc obligatoire puise dans un NIVEAU distinct, pour que les
      // sommes tombent juste sans chevauchement involontaire : 32 + 21 + 15 = 68.
      bloc("70", "70A", "Fondements", "Obligatoire - 32 crédits.", { type: "obligatoire", bornes: { min: 32, max: 32 } },
        pourTotal(codesExistants("DRT", 1000, 12), 32)),
      bloc("70", "70B", "Droit privé", "Obligatoire - 21 crédits.", { type: "obligatoire", bornes: { min: 21, max: 21 } },
        pourTotal(codesExistants("DRT", 2000, 12), 21)),
      bloc("70", "70C", "Droit public", "Obligatoire - 15 crédits.", { type: "obligatoire", bornes: { min: 15, max: 15 } },
        pourTotal(codesExistants("DRT", 4000, 12), 15)),
      // Chevauchement RÉEL : 70K est entièrement contenu dans 70L, constaté en
      // droit pendant la validation du contrat. L'attribution directe du moteur
      // se trompe alors dans un seul sens, et elle le dit.
      bloc("70", "70K", "Droit international", "Option - Minimum 6 crédits, maximum 12 crédits.", { type: "option", bornes: { min: 6, max: 12 } },
        codesExistants("DRT", 3000, 4)),
      bloc("70", "70L", "Cours à option", "Option - Minimum 12 crédits, maximum 27 crédits.", { type: "option", bornes: { min: 12, max: 27 } },
        [
          ...codesExistants("DRT", 3000, 4),
          ...codesExistants("DRT", 6000, 6),
          // Un code à suffixe, qui est une fiche DISTINCTE du code sans suffixe.
          ...codeSuffixe("DRT"),
        ]),
      bloc("70", "70Z", "", "Choix - Maximum 3 crédits.", { type: "choix", bornes: { min: 0, max: 3 } }, []),
    ],
    notes: [
      "Le baccalauréat en droit donne accès à l'École du Barreau ; l'admission au Barreau relève du Barreau du Québec.",
    ],
    url: "https://exemple.invalid/demo/droit",
    scrapeISO: ISO_DEMO,
  };
}

/** Les blocs d'UN segment. Extrait pour qu'une page à orientations puisse en
 *  fabriquer un jeu par parcours, chacun dans son propre segment. */
function blocsDuSegment(
  dé: () => number,
  segment: string,
  sujets: string[],
  cycle: string | null,
  combien: number,
  formes: FormeRegle[],
  avecChoixFinal: boolean,
): Bloc[] {
  const lettres = "ABCDEFGHIJKLMNOPQRSTUVWXY";
  const blocs: Bloc[] = [];
  for (let i = 0; i < combien; i += 1) {
    const id = `${segment}${lettres[i % lettres.length]}`;
    // Le premier bloc est toujours obligatoire ; le dernier au choix quand on
    // le demande.
    const forme =
      i === 0
        ? formes[0]
        : avecChoixFinal && i === combien - 1
          ? formes[6]
          : choisir(dé, formes.slice(1, 6));
    const sujet = choisir(dé, sujets);
    // Pas de niveau 7000 ici : `coursDuSujet` n'en produit aucun, donc un bloc
    // d'option à ce niveau ne listerait AUCUN cours — ce que le moteur signale
    // à juste titre comme des données de programme incomplètes. Une moitié des
    // programmes de 2e cycle dans cet état aurait noyé le signal.
    const niveau =
      cycle === "1er cycle"
        ? choisir(dé, [1000, 2000, 3000])
        : choisir(dé, [4000, 6000]);
    const liste =
      forme.regle.type === "choix" && forme.brut.startsWith("Choix - 3")
        ? []
        : [
            ...codesExistants(sujet, niveau, entier(dé, 3, 9), entier(dé, 0, 4)),
            // Un bloc sur dix cite un cours sans fiche : l'état normal d'un
            // scrape incrémental, qui doit s'afficher « titre inconnu ».
            ...(dé() < 0.1 ? codesSansFiche(sujet, 1) : []),
          ];
    blocs.push(
      bloc(segment, id, dé() < 0.45 ? "" : choisir(dé, NOMS_BLOC), forme.brut, forme.regle, liste,
        dé() < 0.25 ? [choisir(dé, NOTES_BLOC)] : []),
    );
  }
  return blocs;
}

function sommeObligatoire(blocs: Bloc[]): number {
  return blocs.reduce(
    (s, b) => s + (b.regle.type === "obligatoire" ? b.regle.bornes.min : 0),
    0,
  );
}

/** Exigences parfois absentes, parfois exactes, parfois en intervalle. Les
 *  trois cas doivent traverser l'UI sans « NaN » ni nombre inventé. */
function exigencesPour(dé: () => number, oblig: number): ExigencesParType | null {
  const annonce = dé();
  if (annonce < 0.35) return null;
  const exact = annonce < 0.7;
  return {
    brut: exact
      ? `${oblig} crédits obligatoires et le reste à option`
      : `de ${oblig} à ${oblig + 3} crédits obligatoires, de 24 à 27 crédits à option`,
    obligatoire: exact ? { min: oblig, max: oblig } : { min: oblig, max: oblig + 3 },
    option: exact ? null : { min: 24, max: 27 },
    choix: null,
  };
}

/**
 * Le programme d'une PAGE, tous parcours compris.
 *
 * Prend toutes les fiches qui partagent l'identifiant, pas une seule : une page
 * à orientations n'est qu'UN fichier `data/programmes/<id>.json`, et ses
 * parcours y sont décrits par `orientations`. Chaque orientation reçoit son
 * propre segment, exclusif des autres, plus le segment commun « 01 » — c'est
 * exactement la forme que `projeterOrientation()` sait démêler.
 */
function programmeGenerique(fiches: FicheIndex[]): Programme {
  const premiere = fiches[0];
  const dé = graine(`programme/${premiere.id}`);
  const discipline =
    DISCIPLINES.find((d) => premiere.nom.endsWith(d.nom)) ?? DISCIPLINES[0];
  const sujets = [discipline.sujet, ...discipline.voisins];
  const formes = formesPour(dé);
  const nomsOrientations = fiches
    .map((f) => f.orientation)
    .filter((o): o is string => o !== null);

  if (nomsOrientations.length === 0) {
    const segments = premiere.cycle === "1er cycle" ? ["01", "70"] : ["70", "73"];
    const blocs = [
      ...blocsDuSegment(dé, segments[0], sujets, premiere.cycle, Math.max(1, premiere.nbBlocs - 1), formes, false),
      ...blocsDuSegment(dé, segments[1], sujets, premiere.cycle, 1, formes, true),
    ];
    // Une règle `inconnu` de temps en temps : une forme jamais vue ne doit pas
    // être avalée, elle doit ressortir dans les problèmes.
    if (dé() < 0.12 && blocs.length > 1) {
      const cible = entier(dé, 1, blocs.length - 1);
      const brut = "Bloc - voir les remarques au bas de la page.";
      blocs[cible] = { ...blocs[cible], regleBrut: brut, regle: { type: "inconnu", brut } };
    }
    return {
      id: premiere.id,
      nom: premiere.nom,
      orientation: null,
      orientations: [],
      segments,
      cycle: premiere.cycle,
      faculte: premiere.faculte,
      typeProgramme: premiere.typeProgramme,
      creditsTotal: premiere.creditsTotal,
      exigences: exigencesPour(dé, sommeObligatoire(blocs)),
      blocs,
      notes: dé() < 0.4 ? [choisir(dé, NOTES_PROGRAMME)] : [],
      url: `https://exemple.invalid/demo/${premiere.id}`,
      scrapeISO: ISO_DEMO,
    };
  }

  // Tronc commun, partagé par tous les parcours de la page.
  const communs = blocsDuSegment(dé, "01", sujets, premiere.cycle, 2, formes, false);
  const blocs: Bloc[] = [...communs];
  const orientations: Orientation[] = [];

  nomsOrientations.forEach((nom, rang) => {
    const segment = segmentOrientation(rang);
    const fiche = fiches[rang];
    const propres = blocsDuSegment(
      dé,
      segment,
      sujets,
      premiere.cycle,
      Math.max(2, fiche.nbBlocs - communs.length),
      formes,
      true,
    );
    blocs.push(...propres);
    orientations.push({
      nom,
      segments: ["01", segment],
      exigences: exigencesPour(dé, sommeObligatoire([...communs, ...propres])),
    });
  });

  return {
    id: premiere.id,
    nom: premiere.nom,
    // Jamais renseigné sur une page non projetée : le contrat est explicite.
    orientation: null,
    orientations,
    segments: ["01", ...orientations.map((o) => o.segments[1])],
    cycle: premiere.cycle,
    faculte: premiere.faculte,
    typeProgramme: premiere.typeProgramme,
    creditsTotal: premiere.creditsTotal,
    // Les exigences sont PAR orientation sur une telle page.
    exigences: null,
    blocs,
    notes: dé() < 0.4 ? [choisir(dé, NOTES_PROGRAMME)] : [],
    url: `https://exemple.invalid/demo/${premiere.id}`,
    scrapeISO: ISO_DEMO,
  };
}

const NOMS_BLOC = [
  "Cours de base",
  "Fondements disciplinaires",
  "Méthodes quantitatives",
  "Cours avancés",
  "Séminaires et travaux dirigés",
  "Ouverture hors discipline",
  "Stage et projet d'intégration",
] as const;

// ---------------------------------------------------------------------------
// Les cours, par sujet
// ---------------------------------------------------------------------------

const TITRES = [
  "Introduction", "Fondements", "Méthodes", "Analyse", "Théorie", "Modèles",
  "Pratique", "Atelier", "Séminaire", "Problèmes choisis", "Sujets spéciaux",
  "Lectures dirigées", "Projet intégrateur", "Stage", "Histoire", "Éthique",
] as const;

const COMPLEMENTS = [
  "I", "II", "III", "avancée", "appliquée", "comparée", "et société",
  "et données", "quantitative", "contemporaine", "et politiques publiques",
] as const;

const SAISONS_TOUTES: readonly Saison[] = ["Automne", "Hiver", "Été"];

function trimestresDe(dé: () => number): Trimestre[] {
  const tirage = dé();
  // 8 % des cours n'ont AUCUN horaire publié : ce n'est pas « jamais offert »,
  // c'est inconnu, et le planificateur doit le placer « sous réserve ».
  if (tirage < 0.08) return [];
  // Près de la moitié n'existent qu'à une seule saison : c'est la contrainte
  // qui casse un plan, et la valeur ajoutée du projet.
  const saisons: Saison[] =
    tirage < 0.55
      ? [choisir(dé, SAISONS_TOUTES)]
      : tirage < 0.85
        ? ["Automne", "Hiver"]
        : [...SAISONS_TOUTES];
  const out: Trimestre[] = [];
  for (const annee of [2026, 2027]) {
    for (const saison of saisons) {
      // L'horaire publié ne couvre que les trimestres proches.
      if (annee === 2026 && saison === "Hiver") continue;
      if (annee === 2027 && saison === "Automne") continue;
      out.push({ saison, annee });
    }
  }
  return out;
}

/**
 * Les fiches d'un sujet. Les niveaux 1000 à 6000 en ont une ; le niveau 7000
 * n'en a JAMAIS, pour que les blocs qui le citent produisent le cas « cours
 * sans fiche » — titre et crédits inconnus, jamais « undefined », et jamais
 * verrouillé puisque ses préalables ne sont pas connus.
 */
/**
 * Mémoïsation des fiches par sujet.
 *
 * `coursDuSujet` est appelé en cascade par `codesExistants` et `pourTotal` :
 * une page à dix orientations le rappelle des centaines de fois, et chaque
 * appel refabriquait une soixantaine de fiches avec leur générateur. Le
 * résultat étant déterministe, le recalculer ne changeait rien d'autre que le
 * temps — assez pour figer l'onglet une fois les orientations ajoutées.
 */
const memoSujets = new Map<string, Cours[]>();

function coursDuSujet(sujet: string): Cours[] {
  const connu = memoSujets.get(sujet);
  if (connu !== undefined) return connu;
  const calcule = fabriquerCoursDuSujet(sujet);
  memoSujets.set(sujet, calcule);
  return calcule;
}

function fabriquerCoursDuSujet(sujet: string): Cours[] {
  const discipline = DISCIPLINES.find((d) => d.sujet === sujet);
  if (discipline === undefined) return [];

  const out: Cours[] = [];
  const niveaux = [1000, 2000, 3000, 4000, 6000];

  for (const niveau of niveaux) {
    for (let i = 0; i < 12; i += 1) {
      const numero = niveau + i * 10;
      const dé = graine(`${sujet}/${numero}`);
      // 199 codes suffixés existent vraiment (musique, certificat en droit) et
      // le suffixe DISTINGUE des cours : `CRI 1600G` n'est pas `CRI 1600`.
      const suffixe = (sujet === "MUI" || sujet === "DRT") && dé() < 0.22
        ? choisir(dé, ["A", "B", "G"])
        : "";
      const code = `${sujet} ${numero}${suffixe}`;

      // Préalables : un ou deux cours du niveau inférieur, parfois un cours
      // d'un sujet voisin (ce qui force l'assemblage à suivre les préalables
      // d'un sujet à l'autre), parfois une condition opaque.
      let prealables: NoeudPrealable | null = null;
      let prealablesBrut: string | null = null;
      if (niveau > 1000) {
        const precedent = `${sujet} ${niveau - 1000 + entier(dé, 0, 5) * 10}`;
        const tirage = dé();
        if (tirage < 0.2 && discipline.voisins.length > 0) {
          const voisin = `${choisir(dé, discipline.voisins)} ${niveau - 1000 + entier(dé, 0, 5) * 10}`;
          prealablesBrut = `${precedent.replace(" ", "")} ET ${voisin.replace(" ", "")}`;
          prealables = {
            genre: "et",
            enfants: [
              { genre: "cours", code: precedent },
              { genre: "cours", code: voisin },
            ],
          };
        } else if (tirage < 0.4) {
          const autre = `${sujet} ${niveau - 1000 + entier(dé, 6, 11) * 10}`;
          prealablesBrut = `${precedent.replace(" ", "")} OU ${autre.replace(" ", "")}`;
          prealables = {
            genre: "ou",
            enfants: [
              { genre: "cours", code: precedent },
              { genre: "cours", code: autre },
            ],
          };
        } else if (tirage < 0.5) {
          const texte = "autorisation du département";
          prealablesBrut = `${precedent.replace(" ", "")} ET ${texte}`;
          prealables = {
            genre: "et",
            enfants: [
              { genre: "cours", code: precedent },
              { genre: "opaque", texte },
            ],
          };
        } else if (tirage < 0.56) {
          // Ligne présente mais NON réduite : `prealables: null` avec
          // `prealablesBrut` non nul. Surtout pas lu comme « aucun préalable ».
          prealablesBrut = "avoir réussi 30 crédits du programme";
        } else if (tirage < 0.85) {
          prealablesBrut = precedent.replace(" ", "");
          prealables = { genre: "cours", code: precedent };
        }
      }

      out.push({
        code,
        titre: `${choisir(dé, TITRES)}${dé() < 0.55 ? ` — ${discipline.nom}` : ""} ${choisir(dé, COMPLEMENTS)}`
          .replace(/\s+/g, " ")
          .trim(),
        credits: choisir(dé, [1, 2, 3, 3, 3, 3, 4, 6]),
        cycle: niveau >= 6000 ? "2e cycle" : "1er cycle",
        faculte: discipline.faculte,
        description: `Cours fabriqué pour la démonstration. Aucun contenu réel. Sujet ${sujet}, niveau ${niveau}.`,
        prealablesBrut,
        prealables,
        concomitantsBrut: dé() < 0.1 ? `${sujet}${numero + 10}`.replace(" ", "") : null,
        // Une restriction d'inscription n'est NI un préalable NI un
        // concomitant : elle n'empêche pas le cours d'être disponible, elle
        // réserve l'inscription. MUI 1162A n'a QUE des restrictions.
        restrictionsBrut:
          dé() < 0.14
            ? `Restrictions d'inscription: réservé aux étudiants du ${discipline.nom}`
            : null,
        trimestres: trimestresDe(dé),
        url: `https://exemple.invalid/demo/cours/${slug(code)}`,
        scrapeISO: ISO_DEMO,
      });
    }
  }

  // Quatre codes à cinq chiffres, parce qu'il en existe (`PSY 40001`) et que
  // `normaliserCode()` doit les accepter.
  if (sujet === "PSY") {
    for (const numero of [40001, 40002]) {
      const dé = graine(`${sujet}/${numero}`);
      out.push({
        code: `${sujet} ${numero}`,
        titre: `Séminaire doctoral ${choisir(dé, COMPLEMENTS)}`,
        credits: 3,
        cycle: "3e cycle",
        faculte: "Arts et sciences",
        description: "Cours fabriqué pour la démonstration. Aucun contenu réel.",
        prealablesBrut: null,
        prealables: null,
        concomitantsBrut: null,
        restrictionsBrut: "Restrictions d'inscription: réservé aux étudiants du doctorat",
        trimestres: trimestresDe(dé),
        url: `https://exemple.invalid/demo/cours/${sujet.toLowerCase()}-${numero}`,
        scrapeISO: ISO_DEMO,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// La fabrique
// ---------------------------------------------------------------------------

let indexMemo: IndexProgrammes | null = null;

export function fabrique(): Fabrique {
  if (indexMemo === null) indexMemo = construireIndex();
  const index = indexMemo;

  return {
    index,
    /** Rend LA PAGE, tous parcours compris. C'est l'appelant qui projette
     *  ensuite sur une orientation — le découpage sur disque est par page. */
    programme(id: string): Programme | null {
      if (id === ID_PAGE_MATHS) return programmeMaths();
      if (id === ID_MAITRISE_DOUBLE) return programmeMaitriseDouble();
      if (id === ID_DROIT_INTERVALLE) return programmeDroit();
      if (id === ID_MUSIQUE_OUVERT) return programmeMusique();
      // Toutes les fiches de cet identifiant : une page à orientations en a
      // plusieurs, et elles décrivent ensemble un seul fichier.
      const fiches = index.programmes.filter((f) => f.id === id);
      if (fiches.length === 0) return null;
      // Une fiche sans structure lue n'a pas de programme à rendre : c'est au
      // sélecteur de le dire, pas au dépôt d'inventer un programme vide.
      if (!fiches[0].structureLue) return null;
      return programmeGenerique(fiches);
    },
    sujet(sujet: string): Cours[] {
      return coursDuSujet(sujet);
    },
  };
}
