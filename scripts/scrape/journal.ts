/**
 * Journal du scrape, TYPÉ par le contrat.
 *
 * En v1 le journal voyageait dans une clé `_journal` hors contrat : invisible
 * pour l'UI, donc exactement le repli silencieux que le projet combat. La v2 lui
 * donne `EntreeJournal` et `Catalogue.journal`, et ce fichier n'est plus qu'un
 * accumulateur commode qui produit ce type-là — plus de forme parallèle.
 *
 * La règle à laquelle ce journal sert : une information que la page n'a pas
 * livrée devient `null` PLUS une entrée ici. Un champ vide sans entrée de
 * journal est un bogue, pas une donnée.
 */
import type { EntreeJournal, GenreEntreeJournal } from "../../lib/types";

export class Journal {
  entrees: EntreeJournal[] = [];

  private pousser(genre: GenreEntreeJournal, sujet: string, message: string): void {
    this.entrees.push({ genre, sujet, message });
  }

  /** Observation utile aux autres chantiers, pas un défaut. */
  info(sujet: string, message: string): void {
    this.pousser("info", sujet, message);
  }

  /** La page n'a pas livré une information attendue : le champ reste `null`. */
  manque(sujet: string, message: string): void {
    this.pousser("manque", sujet, message);
  }

  /** La page a livré une forme que le code ne sait pas réduire. */
  inattendu(sujet: string, message: string): void {
    this.pousser("inattendu", sujet, message);
  }

  /** Le scrape a échoué sur cet objet : rien n'a été produit pour lui. */
  erreur(sujet: string, message: string): void {
    this.pousser("erreur", sujet, message);
  }

  absorber(autre: Journal): void {
    this.entrees.push(...autre.entrees);
  }

  get vide(): boolean {
    return this.entrees.length === 0;
  }

  /** Compte par genre, pour la ligne de résumé du scrape. */
  comptes(): Record<GenreEntreeJournal, number> {
    const out: Record<GenreEntreeJournal, number> = {
      info: 0,
      manque: 0,
      inattendu: 0,
      erreur: 0,
    };
    for (const e of this.entrees) out[e.genre] += 1;
    return out;
  }
}
