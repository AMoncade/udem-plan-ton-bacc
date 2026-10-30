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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

/**
 * `version.json` : ce qu'un client distant lit AVANT de retélécharger quoi que
 * ce soit.
 *
 * ClientSide Horaire garde en cache le programme de l'étudiant et les fiches
 * qu'il cite. À chaque ouverture de son onglet, il lit ce petit fichier et ne
 * redemande que les sujets dont l'empreinte a bougé — pas les 20 Mo de
 * `cours/`. `contrat` lui dit s'il sait lire ces données (voir
 * `packages/moteur/index.ts`, `VERSION_CONTRAT`).
 *
 * Écrit dans `public/donnees/` seulement : c'est un dérivé de `data/`, pas une
 * source. L'écrire dans `data/` en ferait une attestation qu'on oublierait de
 * régénérer.
 */
const empreinte = (texte) => createHash("sha256").update(texte).digest("hex").slice(0, 16);

const contrat = JSON.parse(
  readFileSync(join(racine, "packages", "moteur", "contrat.json"), "utf8"),
).version;

const sujets = {};
let horairesISO = null;
const dirCours = join(cible, "cours");
if (existsSync(dirCours)) {
  for (const f of (await readdir(dirCours)).filter((x) => x.endsWith(".json")).sort()) {
    const texte = readFileSync(join(dirCours, f), "utf8");
    sujets[f.slice(0, -".json".length)] = empreinte(texte);
    // La fiche rafraîchie le plus récemment par une passe « horaires seulement »
    // date les horaires ; absente tant qu'aucune passe de ce genre n'a tourné.
    for (const m of texte.matchAll(/"horairesISO": "([^"]+)"/g)) {
      if (horairesISO === null || m[1] > horairesISO) horairesISO = m[1];
    }
  }
}

const programmes = createHash("sha256");
const dirProgrammes = join(cible, "programmes");
if (existsSync(dirProgrammes)) {
  for (const f of (await readdir(dirProgrammes)).filter((x) => x.endsWith(".json")).sort()) {
    programmes.update(f);
    programmes.update(readFileSync(join(dirProgrammes, f)));
  }
}

const cheminIndex = join(cible, "index-programmes.json");
const texteIndex = existsSync(cheminIndex) ? readFileSync(cheminIndex, "utf8") : null;

const version = {
  contrat,
  scrapeISO: texteIndex === null ? null : JSON.parse(texteIndex).scrapeISO ?? null,
  horairesISO,
  index: texteIndex === null ? null : empreinte(texteIndex),
  programmes: programmes.digest("hex").slice(0, 16),
  sujets,
};
writeFileSync(join(cible, "version.json"), JSON.stringify(version, null, 2) + "\n");
console.log(
  `copier-donnees : version.json (contrat ${contrat}, ${Object.keys(sujets).length} sujets)`,
);
