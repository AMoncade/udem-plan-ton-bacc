/**
 * L'ACCORD EN NOMBRE, à un seul endroit.
 *
 * Ce module existe parce que l'app écrivait « 8 note(s) normative(s) », « 27
 * cours figure(nt) », « 3 ligne(s) de préalables non réduite(s) en codes,
 * affichée(s) telle(s) quelle(s) ». Cette dernière phrase porte CINQ
 * parenthèses. Ce n'est pas une faute de français, c'est un aveu : l'écran
 * refuse de choisir et laisse le lecteur faire l'accord.
 *
 * Le reste de l'application ne s'y résout nulle part ailleurs — elle écrit « 1
 * cours cité », « 2 cours cités ». La forme entre parenthèses ne survivait que
 * dans les messages venus du moteur, qui les compose sans savoir où ils
 * s'afficheront. C'est une raison de les composer ici, pas de les laisser tels
 * quels.
 *
 * ## Zéro prend le SINGULIER
 *
 * « 0 cours cité », pas « 0 cours cités ». C'est la règle du français, et c'est
 * aussi le cas le plus fréquent des écrans d'état vide — celui qu'on voit avant
 * d'avoir rien saisi. D'où `n > 1` et jamais `n !== 1` : la seconde forme met
 * zéro au pluriel, ce qui est faux précisément là où on le lit le plus.
 */

/** L'accord d'un mot qui ne prend qu'un `s`. « cours » et « fois » sont
 *  invariables : leur passer `s()` ne casse rien, mais `pluriel()` est plus
 *  clair quand la forme change vraiment. */
export function s(n: number): string {
  return n > 1 ? "s" : "";
}

/** L'accord d'un mot dont les deux formes s'écrivent différemment — « a » et
 *  « ont », « celle » et « celles ». */
export function pluriel(n: number, singulier: string, plurielMot: string): string {
  return n > 1 ? plurielMot : singulier;
}
