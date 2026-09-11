/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LA BASCULE — le seul endroit qui choisit d'où viennent les données.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Deux lignes, et rien d'autre dans `app/**` ni `components/**` ne sait d'où
 * viennent les données.
 *
 * POUR DÉBRANCHER LA DÉMONSTRATION quand la session scraper aura livré
 * `data/index-programmes.json`, `data/programmes/` et `data/cours/` :
 *
 *   1. remplacer `creerDepotDemo()` par `creerDepotFichiers()` ci-dessous ;
 *   2. supprimer l'import de `../_demo/depot-demo`.
 *
 * Le dossier `app/_demo/` devient alors du code mort et peut partir d'un bloc.
 * La bannière qui prévient que les données sont fabriquées s'éteint d'elle-même
 * parce qu'elle est pilotée par `Depot.estFactice`, pas par un drapeau séparé
 * qu'on oublierait de basculer.
 */
import { creerDepotDemo } from "../_demo/depot-demo";
import type { Depot } from "../_lib/depot";
import { creerDepotFichiers } from "../_lib/depot-fichiers";

/** Le dépôt en service. ▼▼▼ LA LIGNE À CHANGER ▼▼▼ */
export const depot: Depot = creerDepotDemo();

/** Gardé référencé exprès : un import inutilisé serait retiré par un
 *  `lint --fix` et la bascule perdrait sa moitié. */
export const depotReel = creerDepotFichiers;
