/**
 * Journal des problèmes de scrape.
 *
 * `Catalogue` (gelé) n'a pas de champ pour ça : il n'expose que
 * `prealablesNonParses`. Or la règle du projet est qu'une information que la
 * page n'a pas livrée devient `null` PLUS une entrée dans un journal — un repli
 * muet rend l'audit faux sans faire échouer un seul test.
 *
 * Donc le journal voyage à deux endroits : la sortie console du scrape, et la
 * clé `_journal` de `data/catalogue.json`. Cette clé supplémentaire ne casse
 * pas le contrat (un objet avec des clés en plus reste assignable à
 * `Catalogue`) et suit le précédent de `_avertissement` dans la fixture de
 * l'intégratrice. Si l'intégratrice préfère un champ typé, il faudra ajouter
 * `problemes: string[]` à `Catalogue` — demandé dans le rapport.
 */

export type GraviteProbleme = "manque" | "inattendu" | "info";

export interface Probleme {
  gravite: GraviteProbleme;
  /** Où : un code de cours, un id de bloc, une URL. */
  ou: string;
  /** Quoi, en français, assez précis pour être vérifié à la main. */
  quoi: string;
}

export class Journal {
  entrees: Probleme[] = [];

  /** La page n'a pas livré une information attendue : champ à `null`. */
  manque(ou: string, quoi: string): void {
    this.entrees.push({ gravite: "manque", ou, quoi });
  }

  /** La page a livré une forme que le code ne sait pas réduire. */
  inattendu(ou: string, quoi: string): void {
    this.entrees.push({ gravite: "inattendu", ou, quoi });
  }

  /** Observation utile aux autres chantiers, pas un défaut. */
  info(ou: string, quoi: string): void {
    this.entrees.push({ gravite: "info", ou, quoi });
  }

  get vide(): boolean {
    return this.entrees.length === 0;
  }
}
