/**
 * Copie `data/` vers `public/donnees/` avant le build.
 *
 * POURQUOI CE PONT EXISTE. L'UI charge le catalogue à la demande avec `fetch`,
 * et `fetch` lit une URL, pas un chemin de disque. Il ne peut donc pas lire
 * `data/` directement. Et un `import()` dynamique ne marcherait pas non plus :
 * il construirait un module de contexte sur `data/programmes/*.json` À LA
 * COMPILATION, alors que ces fichiers sont produits par un scrape et peuvent
 * être absents — la compilation échouerait.
 *
 * Chromium refuse par ailleurs `fetch` sur `file://` quel que soit le montage,
 * donc l'application de bureau a de toute façon besoin d'un schéma applicatif
 * qui serve `/donnees/`. Ce script est le pendant web du même contrat d'URL :
 * des deux côtés, l'UI demande `/donnees/...` et ne sait pas qui répond.
 *
 * `data/` reste la source canonique — c'est ce que le contrat décrit et ce que
 * les tests de couture lisent. `public/donnees/` est une copie jetable, ignorée
 * par git : y écrire à la main serait perdu au prochain build.
 */
import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(racine, "data");
const cible = join(racine, "public", "donnees");

if (!existsSync(source)) {
  // Pas une erreur : on peut vouloir bâtir l'interface avant le premier scrape.
  // Mais le dire, parce qu'une app sans données qui se construit en silence est
  // exactement le genre de succès trompeur que ce projet refuse.
  console.warn(
    "copier-donnees : data/ est absent, rien à copier. " +
      "L'app se construira sans catalogue — lancer `npm run scrape`.",
  );
  process.exit(0);
}

await rm(cible, { recursive: true, force: true });
await mkdir(cible, { recursive: true });
await cp(source, cible, { recursive: true });

// Compter ce qui a été copié plutôt que d'annoncer « terminé » : un pont vide
// ressemble à un pont qui marche jusqu'au moment où l'écran reste blanc.
async function compter(dossier) {
  let n = 0;
  for (const e of await readdir(dossier, { withFileTypes: true })) {
    n += e.isDirectory() ? await compter(join(dossier, e.name)) : 1;
  }
  return n;
}

console.log(`copier-donnees : ${await compter(cible)} fichier(s) vers public/donnees/`);
