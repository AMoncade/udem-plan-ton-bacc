/**
 * Briques pures de la passe `--horaires-seulement` (aucun réseau, aucun disque).
 *
 * La passe hebdomadaire réécrit DEUX champs de chaque fiche existante —
 * `trimestres` et `apercuHoraires` — plus la date de capture `horairesISO`.
 * Tout le reste d'une fiche (préalables, crédits, description…) vient d'une
 * passe complète et ne bouge pas : relire un préalable depuis une page
 * qu'on ne vient lire que pour ses horaires ferait dépendre une donnée
 * stable d'un jour de réseau capricieux.
 */
import type { ApercuTrimestre, Cours, Trimestre } from "../../lib/types";
import { sujetDeCode } from "../../lib/codes";

/**
 * Lit la spécification de `--sujets`.
 *
 * Deux formes, mélangeables, séparées par des virgules :
 *   - un sujet : `ACT`, `MAT` (casse indifférente) ;
 *   - un intervalle de PREMIÈRE LETTRE : `A-F`, bornes comprises.
 * `ACT,MAT` et `A-F` sont les deux usages prévus ; `A-C,MAT` se lit sans
 * surprise comme l'union des deux.
 *
 * Lève sur une spécification qu'on ne sait pas lire : un filtre mal tapé qui
 * laisserait tout passer (ou rien) donnerait une passe de quatre heures sur les
 * mauvais cours, sans qu'une ligne ne le dise.
 */
export function lireSpecSujets(spec: string): (sujet: string) => boolean {
  const morceaux = spec
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== "");
  if (morceaux.length === 0) throw new Error(`--sujets : liste vide (reçu « ${spec} »)`);

  const sujets = new Set<string>();
  const intervalles: [string, string][] = [];
  for (const m of morceaux) {
    const intervalle = /^([A-Z])-([A-Z])$/.exec(m);
    if (intervalle) {
      if (intervalle[1] > intervalle[2]) {
        throw new Error(`--sujets : intervalle à l'envers « ${m} » (attendu ${intervalle[2]}-${intervalle[1]})`);
      }
      intervalles.push([intervalle[1], intervalle[2]]);
    } else if (/^[A-Z]{3}$/.test(m)) {
      sujets.add(m);
    } else {
      throw new Error(
        `--sujets : « ${m} » n'est ni un sujet de trois lettres (ACT) ni un intervalle de première lettre (A-F)`,
      );
    }
  }
  return (sujet: string): boolean => {
    const s = sujet.toUpperCase();
    return sujets.has(s) || intervalles.some(([de, a]) => s[0] >= de && s[0] <= a);
  };
}

/**
 * Garde les codes dont le sujet passe le filtre. Un code sans sujet canonique
 * est ÉCARTÉ, pas gardé : `sujetDeCode` exige la forme canonique, et un code
 * qui n'en a pas ne peut de toute façon pas avoir de fiche sur disque.
 */
export function filtrerParSujets(codes: string[], spec: string): string[] {
  const passe = lireSpecSujets(spec);
  return codes.filter((code) => {
    const sujet = sujetDeCode(code);
    return sujet !== null && passe(sujet);
  });
}

/** Ce que la passe lit sur la page. */
export interface HorairesLus {
  trimestres: Trimestre[];
  apercuHoraires: ApercuTrimestre[];
  /** Date de capture RÉELLE de la page (pas celle d'une relecture du cache). */
  horairesISO: string;
}

/**
 * Fusionne les horaires lus dans la fiche existante : trois champs, rien d'autre.
 *
 * La fiche d'entrée n'est pas modifiée. `{ ...ancienne, … }` garde l'ordre des
 * clés de la fiche existante, donc un diff de fichier ne montre que ce qui a
 * vraiment changé.
 */
export function fusionnerHoraires(ancienne: Cours, lus: HorairesLus): Cours {
  return {
    ...ancienne,
    trimestres: lus.trimestres,
    apercuHoraires: lus.apercuHoraires,
    horairesISO: lus.horairesISO,
  };
}

/**
 * La page ressemble-t-elle à une page de cours qui publie sa section d'horaires ?
 *
 * Mesuré sur le cache : la section existe sur 100 % des pages de cours, et
 * 43 % la portent VIDE. Vide est donc un état normal qu'on écrit tel quel ; mais
 * une page SANS la section (maintenance, gabarit refondu, réponse tronquée) n'a
 * rien dit sur les horaires, et la lire comme « aucun horaire » reviendrait à
 * transformer une panne en liste vide.
 */
export function pagePorteSectionHoraires(html: string): boolean {
  return html.includes('<section class="cours-horaires">');
}
