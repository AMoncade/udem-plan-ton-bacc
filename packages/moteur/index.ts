/**
 * Le moteur de Plan ton bacc, tel qu'un AUTRE client que l'app web le reçoit.
 *
 * ## Une façade, pas une copie
 *
 * Ce fichier ne contient aucune logique : il réexporte les modules de `lib/` et
 * de `app/_lib/` que l'app web importe déjà. Il n'existe donc qu'UNE source pour
 * chaque règle — préalables, audit des blocs, offre, prochaine session,
 * chevauchements. L'extension ClientSide Horaire reçoit la version compilée de
 * ces mêmes fichiers (`npm run moteur:paquet`), figée à un commit.
 *
 * Les fichiers sont laissés à leur place plutôt que déplacés ici : l'app, le
 * scraper, les tests et `lib/empreinte.ts` les désignent par chemin, et un
 * déplacement aurait changé quatre-vingts imports et l'empreinte des données
 * pour un gain nul.
 *
 * ## Ce que la compilation de ce paquet garantit
 *
 * `packages/moteur/tsconfig.json` compile avec `lib: ["ES2022"]` et AUCUN type
 * d'environnement : ni DOM, ni Node. Un module réexporté ici qui toucherait
 * `window`, `localStorage`, `fetch` ou `node:fs` casse ce build. C'est la seule
 * chose qui empêche le moteur partagé de dépendre en silence du navigateur de
 * l'app web, et c'est pourquoi `moteur:build` tourne en CI.
 *
 * ## Ce qui n'est PAS exporté, exprès
 *
 *  - `lib/empreinte.ts` (Node, réservé au scraper et aux tests) ;
 *  - `lib/ics/` : l'extension a son propre lecteur d'horaire ;
 *  - `app/_lib/stockage`, `selection`, `cheminement`, `chargement`,
 *    `depot-fichiers` : `localStorage` et `fetch`, propres à l'app web ;
 *  - les fixtures `lib/engine/donnees-*.ts`.
 */

import contrat from "./contrat.json";

/**
 * Version du contrat de données (`lib/types.ts`) que CE moteur sait lire.
 *
 * Les données publiées la portent aussi (`/donnees/version.json`, écrit par
 * `scripts/copier-donnees.mjs` depuis le même `contrat.json`). Un client figé
 * à une version antérieure — l'extension, qui n'est mise à jour qu'à chaque
 * soumission au Web Store — compare les deux et garde son cache plutôt que de
 * lire des données qu'il interpréterait de travers.
 *
 * À incrémenter quand un champ change de SENS ou disparaît. Un champ optionnel
 * ajouté ne la change pas : un ancien client l'ignore sans se tromper.
 */
export const VERSION_CONTRAT: number = contrat.version;

// Contrat de données et identités.
export * from "../../lib/types";
export * from "../../lib/codes";
export * from "../../lib/parcours";
export * from "../../lib/francais";

// Moteur : préalables, diagnostic, audit des blocs.
export * from "../../lib/engine";

// Horaires publiés et chevauchements.
export * from "../../lib/horaires";
export * from "../../lib/engine/horaires";
export * from "../../lib/engine/combinaisons";

// Planification : offre, trimestres, prochaine session.
export * from "../../app/_lib/cours";
export * from "../../app/_lib/offre";
export * from "../../app/_lib/trimestres";
export * from "../../app/_lib/plan";
export * from "../../app/_lib/prochaine-session";
export * from "../../app/_lib/verdict";

// Recherche sans accents, chargement à la demande, grille de la semaine.
export * from "../../app/_lib/recherche";
export * from "../../app/_lib/depot";
export * from "../../app/_lib/grille-semaine";
