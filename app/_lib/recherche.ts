/**
 * RECHERCHE ET FILTRES sur l'index des programmes.
 *
 * 1 088 fiches : assez peu pour tout garder en mémoire, assez pour qu'un
 * `filter` naïf à chaque frappe se voie. Ce qui coûte n'est pas la comparaison,
 * c'est le RENDU — d'où trois décisions, chacune pour une raison mesurable :
 *
 *  1. **Pliage une seule fois.** Les accents sont le vrai problème : « bacc
 *     mathematiques » doit trouver « Baccalauréat en mathématiques », et un
 *     étudiant ne tape pas les accents dans un champ de recherche. Plier à
 *     chaque frappe, c'est 1 088 `normalize()` par touche. L'index est donc
 *     plié UNE fois, au chargement.
 *  2. **Tous les mots doivent correspondre, dans n'importe quel ordre.**
 *     « math bacc » trouve le baccalauréat en mathématiques. Une recherche
 *     sous-chaîne sur la phrase entière ne le trouverait pas, et l'étudiant
 *     conclurait que le programme n'existe pas.
 *  3. **Le nombre de résultats rendus est PLAFONNÉ, et le reste est annoncé.**
 *     Une liste tronquée en silence fait croire qu'il n'y a rien d'autre.
 *
 * Le classement compte autant que le filtrage : taper « droit » doit donner le
 * baccalauréat en droit avant un cours de « droit du travail » cité par une
 * faculté. Le rang vient donc du NOM, jamais de la faculté.
 */
import type { FicheIndex, IndexProgrammes } from "../../lib/types";

/** Replie les accents et la casse. « Mathématiques » -> « mathematiques ».
 *
 *  La classe `[̀-ͯ]` plutôt que `\p{Diacritic}` : les échappements
 *  de propriété Unicode exigent une cible ES2018, et ce projet compile en
 *  ES2017. Le résultat est le même pour le français. */
export function plier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface Entree {
  fiche: FicheIndex;
  /** Le nom (plus l'orientation) plié : sert au CLASSEMENT. */
  nom: string;
  /** Nom, orientation, faculté, type, cycle et identifiant pliés : sert à
   *  décider si la fiche correspond. Chercher « génie » doit trouver les
   *  programmes de la faculté de génie même si « génie » n'est pas dans leur
   *  nom. */
  foin: string;
}

export interface IndexPrepare {
  entrees: Entree[];
  cycles: string[];
  facultes: string[];
  types: string[];
  /** Fiches dont la page n'a pas de structure exploitable. */
  nbSansStructure: number;
  scrapeISO: string;
}

function triFr(valeurs: Iterable<string>): string[] {
  return [...new Set(valeurs)].sort((a, b) => a.localeCompare(b, "fr"));
}

export function preparerIndex(index: IndexProgrammes): IndexPrepare {
  const entrees: Entree[] = index.programmes.map((fiche) => {
    const nom = plier(
      fiche.orientation === null ? fiche.nom : `${fiche.nom} ${fiche.orientation}`,
    );
    return {
      fiche,
      nom,
      foin: plier(
        [
          fiche.nom,
          fiche.orientation ?? "",
          fiche.faculte ?? "",
          fiche.typeProgramme ?? "",
          fiche.cycle ?? "",
          fiche.id,
        ].join(" "),
      ),
    };
  });

  return {
    entrees,
    cycles: triFr(
      index.programmes.map((f) => f.cycle).filter((c): c is string => c !== null),
    ),
    facultes: triFr(
      index.programmes.map((f) => f.faculte).filter((f): f is string => f !== null),
    ),
    types: triFr(
      index.programmes.map((f) => f.typeProgramme).filter((t): t is string => t !== null),
    ),
    nbSansStructure: index.programmes.filter((f) => !f.structureLue).length,
    scrapeISO: index.scrapeISO,
  };
}

export interface Filtres {
  texte: string;
  cycle: string | null;
  faculte: string | null;
  typeProgramme: string | null;
  /** Masquer les fiches sans structure exploitable. Faux par défaut : elles
   *  doivent se VOIR et s'expliquer, pas disparaître. */
  masquerSansStructure: boolean;
}

export const FILTRES_VIDES: Filtres = {
  texte: "",
  cycle: null,
  faculte: null,
  typeProgramme: null,
  masquerSansStructure: false,
};

export function filtresActifs(filtres: Filtres): number {
  let n = 0;
  if (filtres.texte.trim() !== "") n += 1;
  if (filtres.cycle !== null) n += 1;
  if (filtres.faculte !== null) n += 1;
  if (filtres.typeProgramme !== null) n += 1;
  if (filtres.masquerSansStructure) n += 1;
  return n;
}

/** Les trois filtres à choix, sans le texte : servent aussi aux facettes. */
function passeLesListes(entree: Entree, filtres: Filtres): boolean {
  if (filtres.cycle !== null && entree.fiche.cycle !== filtres.cycle) return false;
  if (filtres.faculte !== null && entree.fiche.faculte !== filtres.faculte) return false;
  if (
    filtres.typeProgramme !== null &&
    entree.fiche.typeProgramme !== filtres.typeProgramme
  ) {
    return false;
  }
  if (filtres.masquerSansStructure && !entree.fiche.structureLue) return false;
  return true;
}

/**
 * Rang d'une correspondance, du plus au moins pertinent. Calculé sur le NOM
 * seulement : une fiche trouvée par sa faculté ne doit pas passer devant une
 * fiche dont le nom commence par ce que l'étudiant tape.
 */
const RANG_DEBUT_NOM = 0;
const RANG_DEBUT_MOT = 1;
const RANG_DANS_NOM = 2;
const RANG_AILLEURS = 3;

function rang(entree: Entree, requete: string): number {
  if (requete === "") return RANG_DANS_NOM;
  if (entree.nom.startsWith(requete)) return RANG_DEBUT_NOM;
  const position = entree.nom.indexOf(requete);
  if (position < 0) return RANG_AILLEURS;
  // Début de mot : le caractère précédent n'est ni une lettre ni un chiffre.
  return /[a-z0-9]/.test(entree.nom[position - 1] ?? " ")
    ? RANG_DANS_NOM
    : RANG_DEBUT_MOT;
}

export interface Resultat {
  /** Les fiches à afficher, déjà plafonnées. */
  fiches: FicheIndex[];
  /** Combien correspondent en tout. */
  total: number;
  /** Combien ne sont pas affichées faute de place. Jamais masqué à l'écran. */
  tronques: number;
}

/**
 * Plafond de rendu. 60 lignes, c'est déjà plus que ce qu'un écran montre ;
 * au-delà, l'étudiant précise sa recherche au lieu de dérouler 1 088 entrées.
 */
export const PLAFOND_RESULTATS = 60;

export function chercher(
  prepare: IndexPrepare,
  filtres: Filtres,
  plafond: number = PLAFOND_RESULTATS,
): Resultat {
  const requete = plier(filtres.texte.trim());
  const mots = requete.split(/\s+/).filter((mot) => mot !== "");

  const retenus: { entree: Entree; rang: number }[] = [];
  for (const entree of prepare.entrees) {
    if (!passeLesListes(entree, filtres)) continue;
    // Tous les mots, dans n'importe quel ordre.
    if (!mots.every((mot) => entree.foin.includes(mot))) continue;
    retenus.push({ entree, rang: rang(entree, requete) });
  }

  retenus.sort((a, b) => {
    if (a.rang !== b.rang) return a.rang - b.rang;
    // À rang égal, l'ordre alphabétique français : stable et prévisible, donc
    // la liste ne sautille pas quand on ajoute une lettre.
    const parNom = a.entree.fiche.nom.localeCompare(b.entree.fiche.nom, "fr");
    if (parNom !== 0) return parNom;
    return (a.entree.fiche.orientation ?? "").localeCompare(
      b.entree.fiche.orientation ?? "",
      "fr",
    );
  });

  return {
    fiches: retenus.slice(0, plafond).map((r) => r.entree.fiche),
    total: retenus.length,
    tronques: Math.max(0, retenus.length - plafond),
  };
}

export interface Facette {
  valeur: string;
  nombre: number;
}

/**
 * Valeurs disponibles pour un filtre, avec leur nombre — les AUTRES filtres
 * étant appliqués. Sans ça, les listes déroulantes proposent des culs-de-sac :
 * choisir « 2e cycle » puis une faculté qui n'a aucun programme de 2e cycle
 * donne une liste vide sans expliquer pourquoi.
 */
export function facettes(
  prepare: IndexPrepare,
  filtres: Filtres,
  dimension: "cycle" | "faculte" | "typeProgramme",
): Facette[] {
  const requete = plier(filtres.texte.trim());
  const mots = requete.split(/\s+/).filter((mot) => mot !== "");
  // La dimension qu'on énumère est neutralisée : on compte ce qu'on POURRAIT
  // choisir, pas ce qui est déjà choisi. Écrit champ par champ plutôt qu'avec
  // une clé calculée, pour que le compilateur vérifie les trois noms.
  const autres: Filtres = {
    ...filtres,
    cycle: dimension === "cycle" ? null : filtres.cycle,
    faculte: dimension === "faculte" ? null : filtres.faculte,
    typeProgramme: dimension === "typeProgramme" ? null : filtres.typeProgramme,
  };

  const comptes = new Map<string, number>();
  for (const entree of prepare.entrees) {
    if (!passeLesListes(entree, autres)) continue;
    if (!mots.every((mot) => entree.foin.includes(mot))) continue;
    const valeur = entree.fiche[dimension];
    if (valeur === null) continue;
    comptes.set(valeur, (comptes.get(valeur) ?? 0) + 1);
  }

  return [...comptes.entries()]
    .map(([valeur, nombre]) => ({ valeur, nombre }))
    .sort((a, b) => a.valeur.localeCompare(b.valeur, "fr"));
}

export function ficheParId(
  prepare: IndexPrepare,
  id: string,
): FicheIndex | undefined {
  return prepare.entrees.find((entree) => entree.fiche.id === id)?.fiche;
}

/** « Baccalauréat en mathématiques — orientation actuariat ». */
export function libelleFiche(fiche: FicheIndex): string {
  return fiche.orientation === null
    ? fiche.nom
    : `${fiche.nom} — orientation ${fiche.orientation.toLowerCase()}`;
}
