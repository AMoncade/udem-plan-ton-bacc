import type { CodeCours } from "./types";

/**
 * Normalisation des codes de cours et clés partagées. Propriété de la session
 * intégratrice : le scraper, le moteur ET l'UI en dépendent, donc personne
 * d'autre ne l'édite.
 *
 * UdeM écrit le même cours de trois façons : « ACT 2250 » sur la page de
 * structure, « ACT2250 » dans la ligne de préalables, « act-2250 » dans l'URL.
 * Comparer deux de ces formes sans normaliser donne un graphe de préalables
 * silencieusement vide — aucun test ne le signale, l'arbre s'affiche juste
 * sans arêtes.
 */

/**
 * Forme tolérante : trois lettres, séparateur optionnel, 4 ou 5 chiffres, et
 * un suffixe d'une lettre optionnel.
 *
 * La v1 imposait exactement 4 chiffres et aucun suffixe, ce qui rejetait 199
 * codes suffixés (`DRT 1151G`, `MUI 1162A`) et quatre codes à 5 chiffres
 * (`PSY 40001`, `MTE 12041`). Le suffixe est SIGNIFIANT : `CRI 1600G` est une
 * fiche de cours distincte de `CRI 1600`.
 */
const TOLERANT = /^([A-Za-z]{3})[\s\-_]?(\d{4,5})([A-Za-z]?)$/;

/** Forme canonique stricte : exactement « ABC 1234 » ou « ABC 1234A ». */
const CANONIQUE = /^([A-Z]{3}) (\d{4,5})([A-Z]?)$/;

export function normaliserCode(brut: string): CodeCours | null {
  const m = TOLERANT.exec(brut.trim());
  if (!m) return null;
  return `${m[1].toUpperCase()} ${m[2]}${m[3].toUpperCase()}`;
}

/**
 * Extrait tous les codes d'un texte libre, dans l'ordre d'apparition.
 *
 * Le suffixe n'est accepté que s'il est suivi d'une fin de mot, pour ne pas
 * happer la première lettre du mot suivant : dans « MAT1720 ou MAT1978 » il ne
 * doit pas lire « MAT1720O ».
 */
export function extraireCodes(texte: string): CodeCours[] {
  const out: CodeCours[] = [];
  for (const m of texte.matchAll(/\b([A-Za-z]{3})[\s\-_]?(\d{4,5})([A-Za-z])?\b/g)) {
    out.push(`${m[1].toUpperCase()} ${m[2]}${(m[3] ?? "").toUpperCase()}`);
  }
  return out;
}

/**
 * Clé unique d'un bloc dans un programme.
 *
 * Existe parce que `Bloc.id` n'est PAS unique : la maîtrise en mathématiques
 * porte `MM-Bloc 73A` et `S-Bloc 73A` dans le même segment 73. Deux chantiers
 * qui formateraient cette clé différemment produiraient des audits qui ne se
 * recoupent pas, sans erreur visible — d'où un seul endroit pour la fabriquer.
 */
export function cleBloc(segment: string, id: string): string {
  return `${segment}/${id}`;
}

/**
 * Sujet d'un code : « ACT 2250 » -> « ACT ».
 *
 * C'est la clé de découpage de `data/cours/<SUJET>.json`. Le scraper écrit ces
 * fichiers et l'UI les charge à la demande : les deux doivent découper pareil.
 */
export function sujetDeCode(code: CodeCours): string | null {
  const m = CANONIQUE.exec(code);
  return m ? m[1] : null;
}

/**
 * Slug d'URL UdeM pour un code DÉJÀ normalisé : « ACT 2250 » -> « act-2250 »,
 * « DRT 1151G » -> « drt-1151g ».
 *
 * Exige la forme canonique stricte, pas seulement quelque chose qui y
 * ressemble : un appelant qui a oublié normaliserCode() doit échouer ici,
 * bruyamment, plutôt que de fabriquer une URL plausible qui rendra 404.
 */
export function slugUrl(code: CodeCours): string {
  const m = CANONIQUE.exec(code);
  if (!m) throw new Error(`code non normalisé, passez par normaliserCode(): ${code}`);
  return `${m[1].toLowerCase()}-${m[2]}${m[3].toLowerCase()}`;
}
