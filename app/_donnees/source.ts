/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LA BASCULE — le seul endroit qui choisit d'où viennent les données.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Deux lignes, et rien d'autre dans `app/**` ni `components/**` ne sait d'où
 * viennent les données.
 *
 * ## Branché sur le VRAI `data/` depuis que le scraper livre
 *
 * Le dépôt de démonstration a servi à écrire toute l'UI avant que les données
 * existent. Elles existent : `data/index-programmes.json`,
 * `data/programmes/<id>.json` et `data/cours/<SUJET>.json` sont produits par le
 * scraper, et `scripts/copier-donnees.mjs` (branché en `prebuild` et `predev`)
 * les publie sous `public/donnees/`, donc à l'URL `/donnees/...` que
 * `depot-fichiers.ts` demande.
 *
 * Le catalogue est encore PARTIEL — le scrape est incrémental. C'est l'état
 * réel du catalogue, et le montrer tel quel vaut mieux que de montrer des
 * centaines de programmes fabriqués : « ne pas inventer de données » est la
 * règle du projet, et un jeu de démonstration branché par défaut la
 * contournerait au moment même où elle devient tenable.
 *
 * ## Pour revenir à la démonstration
 *
 *   1. remplacer `creerDepotFichiers()` par `creerDepotDemo()` ci-dessous ;
 *   2. la bannière « données fabriquées » se rallume d'elle-même, parce
 *      qu'elle est pilotée par `Depot.estFactice` et non par un drapeau séparé
 *      qu'on oublierait de basculer.
 *
 * `app/_demo/` reste dans l'arbre : les tests s'en servent directement pour
 * éprouver la recherche et l'assemblage à une échelle que le scrape partiel
 * n'atteint pas encore (883 parcours contre 57), et pour couvrir des cas que
 * les vraies données ne contiennent pas toutes — blocs homonymes, règle
 * `inconnu`, contenu ouvert.
 */
import { creerDepotDemo } from "../_demo/depot-demo";
import type { Depot } from "../_lib/depot";
import { creerDepotFichiers } from "../_lib/depot-fichiers";

/** Le dépôt en service. ▼▼▼ LA LIGNE À CHANGER ▼▼▼ */
export const depot: Depot = creerDepotFichiers();

/** Gardé référencé exprès : un import inutilisé serait retiré par un
 *  `lint --fix` et la bascule perdrait sa moitié. */
export const depotDemonstration = creerDepotDemo;
