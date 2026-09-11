import type { CodeCours } from "./types";

/**
 * Normalisation des codes de cours. Propriété de la session intégratrice :
 * le scraper ET le moteur en dépendent, donc personne d'autre ne l'édite.
 *
 * UdeM écrit le même cours de trois façons : « ACT 2250 » sur la page de
 * structure, « ACT2250 » dans la ligne de préalables, « act-2250 » dans l'URL.
 * Comparer deux de ces formes sans normaliser donne un graphe de préalables
 * silencieusement vide — aucun test ne le signale, l'arbre s'affiche juste
 * sans arêtes.
 */
const TOLERANT = /^([A-Za-z]{3})[\s\-_]?(\d{4})$/;

/** Forme canonique stricte : exactement « ABC 1234 ». */
const CANONIQUE = /^([A-Z]{3}) (\d{4})$/;

export function normaliserCode(brut: string): CodeCours | null {
  const m = TOLERANT.exec(brut.trim());
  if (!m) return null;
  return `${m[1].toUpperCase()} ${m[2]}`;
}

/** Extrait tous les codes d'un texte libre, dans l'ordre d'apparition. */
export function extraireCodes(texte: string): CodeCours[] {
  const out: CodeCours[] = [];
  for (const m of texte.matchAll(/\b([A-Za-z]{3})[\s\-_]?(\d{4})\b/g)) {
    out.push(`${m[1].toUpperCase()} ${m[2]}`);
  }
  return out;
}

/** Segment d'un code de bloc : « 75C » -> « 75 ». */
export function segmentDeBloc(idBloc: string): string {
  return idBloc.replace(/[A-Z]+$/, "");
}

/**
 * Slug d'URL UdeM pour un code DÉJÀ normalisé : « ACT 2250 » -> « act-2250 ».
 * Exige la forme canonique stricte, pas seulement quelque chose qui y
 * ressemble : un appelant qui a oublié normaliserCode() doit échouer ici,
 * bruyamment, plutôt que de fabriquer une URL plausible qui rendra 404.
 */
export function slugUrl(code: CodeCours): string {
  const m = CANONIQUE.exec(code);
  if (!m) throw new Error(`code non normalisé, passez par normaliserCode(): ${code}`);
  return `${m[1].toLowerCase()}-${m[2]}`;
}
