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
 *
 * ## Et les décimales : `>= 2`, pas `> 1`
 *
 * La règle exacte est **tout ce qui est strictement inférieur à 2 prend le
 * singulier, décimales comprises** : « 1,5 crédit », pas « 1,5 crédits ».
 *
 * La première version écrivait `n > 1`, ce qui est juste pour 0 et 1 et FAUX
 * pour 1,5 — mesuré, `s(1.5)` rendait « s ». Le dépôt portait donc deux accords
 * qui divergeaient sur les décimales : celui-ci et `cr()` dans
 * `lib/engine/bornes.ts`, dont le `arrondi(x) >= 2` a toujours été correct. Les
 * crédits UdeM ont des demis — c'est exactement le cas où les deux se seraient
 * contredits à l'écran, sans qu'aucun test ne le dise.
 *
 * ## Pourquoi dans `lib/` et non dans `app/_lib/`
 *
 * Écrit d'abord sous `app/_lib/`, déplacé ici parce que `lib/engine` en a
 * besoin et que **`lib/` n'importe JAMAIS `app/`** — vérifié, zéro occurrence
 * sur tout le répertoire. Faire dépendre le moteur de la couche d'écran
 * inverserait la dépendance, et rien n'empêcherait ensuite cette inversion de
 * s'étendre.
 *
 * Il y avait déjà DEUX endroits qui accordent le français : ce module et
 * `cr()` dans `lib/engine/bornes.ts`, qui rend « 1 crédit » / « 9 crédits » et
 * traite « 1,5 crédit » correctement par `arrondi(x) >= 2`. En écrire un
 * troisième dans `lib/engine` aurait été le motif qu'on ferme partout ailleurs
 * — `cleBloc`, `blocsDuCheminement`, `seancesDeSection` : une implémentation,
 * chez le propriétaire du contrat. `app/_lib/francais.ts` reste un ré-export
 * pour ne casser aucun appelant, et pourra disparaître quand personne ne sera
 * en train d'éditer ces fichiers.
 */

/** L'accord d'un mot qui ne prend qu'un `s`. « cours » et « fois » sont
 *  invariables : leur passer `s()` ne casse rien, mais `pluriel()` est plus
 *  clair quand la forme change vraiment. */
export function s(n: number): string {
  return n >= 2 ? "s" : "";
}

/** L'accord d'un mot dont les deux formes s'écrivent différemment — « a » et
 *  « ont », « celle » et « celles ». */
export function pluriel(n: number, singulier: string, plurielMot: string): string {
  return n >= 2 ? plurielMot : singulier;
}
