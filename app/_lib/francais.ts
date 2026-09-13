/**
 * Ré-export de `lib/francais.ts`, où l'accord en nombre vit désormais.
 *
 * Déplacé là-bas parce que `lib/engine` en a besoin et que `lib/` n'importe
 * jamais `app/` : le moteur ne doit pas dépendre de la couche d'écran. Ce
 * fichier reste pour que les appelants existants — `depot.ts`, `PiedApp.tsx`,
 * `VueSession.tsx` et leur test — continuent de fonctionner sans être modifiés
 * pendant que d'autres sessions les éditent.
 *
 * Un ré-export n'est pas une seconde implémentation : c'est la même liaison
 * sous deux noms, donc elle ne peut pas diverger. À supprimer quand personne
 * ne sera chaud sur ces quatre fichiers.
 */
// Chemin RELATIF et non `@/lib/francais` : `vitest.config.mts` ne déclare
// aucun alias, donc `@/` ne résout pas sous les tests. `tsc` et `lint` passaient
// tous les deux — ni l'un ni l'autre ne vérifie la résolution à l'exécution.
export { pluriel, s } from "../../lib/francais";
