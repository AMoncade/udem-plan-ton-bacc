/**
 * FUSION AVEC L'ÉTAT EXISTANT — ajouter, jamais écraser.
 *
 * `app/_lib/stockage.ts` appartient à la session UI et n'expose que
 * `lireEtat()` / `ecrire()` / `abonner()` : `ecrire()` prend l'état ENTIER, donc
 * un import distrait qui appelle `ecrire({ faits: choisis, plan: {} })` effacerait
 * le plan par trimestre et tous les cours déjà cochés. Le calcul de la nouvelle
 * liste est isolé ici pour être testé sans navigateur, et pour que le composant
 * n'ait plus qu'à recopier le reste de l'état.
 */
import type { CodeCours } from "../types";

export interface Fusion {
  /** La nouvelle liste complète : l'ancienne, puis les ajouts, dans l'ordre. */
  faits: CodeCours[];
  /** Ce que cette confirmation ajoute vraiment. */
  ajoutes: CodeCours[];
  /** Ce qui était déjà là : à dire, sinon le compte affiché mentirait. */
  dejaLa: CodeCours[];
}

export function fusionnerFaits(existants: CodeCours[], choisis: CodeCours[]): Fusion {
  const deja = new Set(existants);
  const ajoutes: CodeCours[] = [];
  const dejaLa: CodeCours[] = [];
  const vus = new Set<CodeCours>();
  for (const code of choisis) {
    if (vus.has(code)) continue;
    vus.add(code);
    if (deja.has(code)) dejaLa.push(code);
    else ajoutes.push(code);
  }
  // L'ordre d'origine est préservé : les cours déjà cochés ne bougent pas de
  // place, ce qui évite de faire clignoter les autres écrans pour rien.
  return { faits: [...existants, ...ajoutes], ajoutes, dejaLa };
}
