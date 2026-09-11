/**
 * Point d'entrée de `npm run scrape`. Amorceur, volontairement minuscule.
 *
 * Le travail est dans `executer.ts`. Ce fichier ne fait qu'installer le
 * résolveur d'imports sans extension AVANT de le charger, parce que :
 *
 *   - `package.json` lance `node --experimental-strip-types scripts/scrape/index.ts` ;
 *   - le dépouillement de types de Node exige des spécificateurs relatifs
 *     complets (`./html.ts`), alors que tout le dépôt écrit `./html` ;
 *   - écrire `./html.ts` dans les imports ferait échouer `next build`
 *     (TS5097 : extension `.ts` interdite sans `allowImportingTsExtensions`) ;
 *   - et `lib/engine/prealables.ts`, qui importe `"../codes"`, appartient à la
 *     session moteur : on ne le corrige pas, on absorbe le problème ici.
 *
 * Les imports STATIQUES d'un module sont résolus avant l'exécution de son
 * corps : d'où l'import dynamique, qui est le seul moyen d'avoir le crochet
 * actif au moment où la résolution a lieu.
 */
import { register } from "node:module";

register("./resolveur-ts.mjs", import.meta.url);
await import("./executer");
