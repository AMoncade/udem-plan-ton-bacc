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
 * Existe parce que `Bloc.id` n'est PAS unique — et le segment ne suffit pas non
 * plus à le rendre unique. Trois familles d'homonymes, toutes MESURÉES sur les
 * pages de l'UdeM, pas supposées :
 *
 *  1. le préfixe de cheminement est DANS l'id : `MM-Bloc 73A` et `S-Bloc 73A`
 *     coexistent au segment 73 de la maîtrise en mathématiques. `parseTitreBloc`
 *     le garde, donc l'id les sépare déjà ;
 *  2. un `<small>` QUALIFIE le bloc : le doctorat en pathologie porte deux
 *     `Bloc 70A` au segment 70, « Accès direct du B. Sc. au Ph. D. » et « Accès
 *     de la M. Sc. au Ph. D. ». Le scraper replie ce qualificatif dans l'id ;
 *  3. le NOM seul discrimine : « Bloc 70D Stage » et « Bloc 70D Travail
 *     dirigé », même segment, même id, même règle (« Obligatoire - 9 crédits »).
 *     Quatre programmes en vivent — maîtrise en finance mathématique et
 *     computationnelle, en évaluation des technologies de la santé, en
 *     administration des services de santé option administration sociale, en
 *     sciences vétérinaires option santé publique sans mémoire.
 *
 * D'où le `nom` dans la clé. Il y est TOUJOURS, pas seulement quand une
 * collision existe : une identité qu'on ne fabrique que lorsqu'un doublon se
 * présente dépend de ce que la page contient ce jour-là, et change sous les
 * données à la première correction en amont.
 *
 * CE QUE ÇA COÛTE, ET POURQUOI C'EST PAYÉ : 3 628 des 5 028 blocs portent un
 * nom, donc la clé change pour 72 % d'entre eux. Aucun état d'étudiant n'en
 * dépend — `app/_lib/stockage.ts` garde des codes de cours (`faits`, `plan`) et
 * `app/_lib/selection.ts` une clé de PARCOURS, jamais une clé de bloc. Le seul
 * coût est de régénérer `data/`, qui l'est de toute façon.
 *
 * Les tirets Unicode sont ramenés à l'ASCII et les espaces réduits : la maîtrise
 * en évaluation des technologies de la santé écrit « Bloc 70A ST‐TD » avec un
 * U+2010, qui se lit comme un trait d'union et n'en est pas un. Sans ça, deux
 * scrapes de la même page peuvent donner deux clés pour un seul bloc.
 */
export function cleBloc(segment: string, id: string, nom: string): string {
  const propre = (t: string): string =>
    t.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
  const suffixe = propre(nom) !== "" ? ` — ${propre(nom)}` : "";
  return `${segment}/${propre(id)}${suffixe}`;
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
