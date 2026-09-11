/**
 * TITRE RECONNAISSABLE D'UN COURS, tiré d'un évènement d'horaire.
 *
 * L'étudiant coche « MAT 1400 » ou « Calcul 1 » ? Les deux : le sigle ne se
 * reconnaît pas après trois ans, et c'est lui qu'on écrit dans l'état. Il faut
 * donc sortir le titre du fichier — or il ne se trouve pas au même endroit
 * selon le générateur. TROIS formes ont été relevées dans de vrais exports :
 *
 *   A. « SUMMARY:MAT 1400-A Calcul 1 (TH) »
 *      DESCRIPTION:Théorie — section A — classe nº 1490
 *      (synchro-calendrier 0.2, `~/Downloads/horaire-udem-A26.ics`)
 *   B. « SUMMARY:MAT1400-A — Théorie »
 *      DESCRIPTION:Calcul 1\nclasse nº 1490
 *      (synchro-calendrier actuel, `src/core/ics.ts` : le titre est passé dans
 *      la DESCRIPTION pour désencombrer la tuile d'agenda)
 *   C. « SUMMARY:MAT1400 - Calcul II - Théorie », sans DESCRIPTION
 *
 * En A le titre est dans le SUMMARY, en B dans la DESCRIPTION. Lire l'un des
 * deux seulement rend « Théorie » comme titre de cours la moitié du temps. D'où
 * la règle : on nettoie les deux, on rejette ce qui n'est qu'un volet ou de la
 * métadonnée, et on garde ce qui reste.
 */
import type { CodeCours } from "../types";

/**
 * Vocabulaire qui N'EST PAS un titre de cours : volets, types d'évaluation,
 * métadonnées de section. Comparé sans accents ni casse.
 */
const MOTS_GENERIQUES = new Set([
  "th",
  "tp",
  "lab",
  "exi",
  "exf",
  "theorie",
  "travaux pratiques",
  "laboratoire",
  "travail pratique",
  "autre",
  "cours",
  "seance",
  "examen",
  "intra",
  "final",
  "finale",
  // Relevés dans un export tiers, en DESCRIPTION : « Section A - Cours
  // magistral », « Travaux pratiques ».
  "cours magistral",
  "magistral",
  "travaux diriges",
]);

const DEBUTS_GENERIQUES = ["examen", "quiz", "evaluation", "intra", "final"];

/**
 * Un volet suivi de son groupe : « TP A », « TH 02 », « LAB B », « groupe 3 ».
 * La limite de mot évite d'avaler un vrai titre : « Théorie des nombres » ne
 * commence pas par « th » suivi d'une limite de mot.
 */
const PREFIXES_GENERIQUES = /^(th|tp|lab|exi|exf|gr|groupe|section|volet)\b/;

/** Fragments qui trahissent de la métadonnée, pas un titre. */
const FRAGMENTS_META = [
  "classe n",
  "section ",
  "source :",
  "ouvert du",
  "ajoute a la main",
  "ajoutee a la main",
];

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Vrai quand le fragment ne peut pas être le titre d'un cours. */
export function estGenerique(fragment: string): boolean {
  const nu = sansAccents(fragment).toLowerCase().trim();
  if (nu === "") return true;
  if (MOTS_GENERIQUES.has(nu)) return true;
  if (PREFIXES_GENERIQUES.test(nu)) return true;
  if (DEBUTS_GENERIQUES.some((debut) => nu.startsWith(debut))) return true;
  if (FRAGMENTS_META.some((meta) => nu.includes(meta))) return true;
  return false;
}

/** Échappe un code pour l'injecter dans une expression régulière. */
function motifDuCode(code: CodeCours): RegExp {
  const lettres = code.slice(0, 3);
  const chiffres = code.slice(4);
  // Les trois écritures d'UdeM, plus le suffixe de section que Synchro accole
  // au sigle (« MAT 1400-A », « STT 1700-A103 »).
  return new RegExp(`${lettres}[\\s\\-_]?${chiffres}(?:-[A-Za-z0-9]+)?`, "gi");
}

const SEPARATEURS = /\s+[—–·:|/-]+\s+/;
const BORDS = /^[\s\-—–·:|,/]+|[\s\-—–·:|,/]+$/g;

/**
 * Retire le sigle, la section et le volet d'un SUMMARY, et rend ce qui ressemble
 * encore à un titre. Chaîne vide si rien ne reste.
 */
export function titreDepuisResume(resume: string, codes: CodeCours[]): string {
  let reste = resume;
  for (const code of codes) reste = reste.replace(motifDuCode(code), " ");

  // « Calcul 1 (TH) » : la parenthèse finale est un volet, pas une précision.
  reste = reste.replace(/\(([^)]{1,30})\)\s*$/, (tout, dedans: string) =>
    estGenerique(dedans) ? "" : tout,
  );

  const gardes = reste
    .split(SEPARATEURS)
    .map((morceau) => morceau.replace(BORDS, ""))
    .filter((morceau) => morceau !== "" && !estGenerique(morceau));
  return gardes.join(" - ").trim();
}

/** Première ligne utile d'une DESCRIPTION déséchappée. */
export function titreDepuisDescription(description: string): string {
  for (const ligne of description.split("\n")) {
    const propre = ligne.trim();
    if (propre === "") continue;
    // La forme A met tout le volet et la section sur la première ligne, séparés
    // par des tirets ; aucun de ces morceaux n'est un titre.
    const gardes = propre
      .split(SEPARATEURS)
      .map((morceau) => morceau.replace(BORDS, ""))
      .filter((morceau) => morceau !== "" && !estGenerique(morceau));
    if (gardes.length > 0) return gardes.join(" - ");
    return "";
  }
  return "";
}

/** Un évènement tel que le choix du titre le voit. */
export interface SourceLibelle {
  resume: string;
  description: string;
  /** TOUS les codes cités par cet évènement, pas seulement celui qu'on traite :
   *  un SUMMARY « ACT 2121 / ACT 2151 — séance commune » laisserait sinon le
   *  sigle de l'autre cours dans le titre du premier. */
  codes: CodeCours[];
}

/**
 * Meilleur titre pour un code, parmi tous ses évènements. `null` quand le
 * fichier ne porte que le sigle : on n'invente pas un titre, et l'écran montre
 * alors les SUMMARY tels quels pour que l'étudiant reconnaisse quand même.
 */
export function choisirLibelle(evenements: SourceLibelle[]): string | null {
  const desResumes: string[] = [];
  const desDescriptions: string[] = [];
  for (const evenement of evenements) {
    const duResume = titreDepuisResume(evenement.resume, evenement.codes);
    if (duResume !== "") desResumes.push(duResume);
    const deLaDescription = titreDepuisDescription(evenement.description);
    if (deLaDescription !== "") desDescriptions.push(deLaDescription);
  }
  // Le SUMMARY d'abord, la DESCRIPTION seulement s'il n'a rien donné. Ordre et
  // non mélange : dans l'export tiers, la DESCRIPTION de MAT 1400 dit « Section
  // A - Cours magistral » et son SUMMARY « Calcul II ». Départager au plus
  // fréquent sur le tas mélangé donnait « Cours magistral » comme titre de
  // cours, parce qu'il revient deux fois.
  return meilleur(desResumes.length > 0 ? desResumes : desDescriptions);
}

/** Le plus fréquent ; à égalité, le plus long, qui est le plus informatif. */
function meilleur(candidats: string[]): string | null {
  if (candidats.length === 0) return null;
  const comptes = new Map<string, number>();
  for (const candidat of candidats) comptes.set(candidat, (comptes.get(candidat) ?? 0) + 1);
  let retenu = candidats[0];
  for (const [candidat, compte] of comptes) {
    const actuel = comptes.get(retenu) ?? 0;
    if (compte > actuel || (compte === actuel && candidat.length > retenu.length)) {
      retenu = candidat;
    }
  }
  return retenu;
}
