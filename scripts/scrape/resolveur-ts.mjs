/**
 * Crochet de résolution ESM : permet d'importer `lib/engine/prealables.ts`, qui
 * écrit ses imports relatifs SANS extension (`from "../codes"`).
 *
 * Pourquoi ce fichier existe : `npm run scrape` lance
 * `node --experimental-strip-types scripts/scrape/index.ts`. Le dépouillement
 * de types de Node ne fait pas de résolution « à la TypeScript » : un
 * spécificateur relatif doit porter son extension, sinon ERR_MODULE_NOT_FOUND.
 * `lib/engine/prealables.ts` appartient à la session moteur et `lib/codes.ts`
 * est gelé — donc on ne corrige pas l'import là-bas, on l'absorbe ici.
 *
 * Le crochet ne fait qu'une chose : si la résolution normale échoue, réessayer
 * avec `.ts`, puis `/index.ts`. Il n'invente aucun module : un échec des deux
 * tentatives relance l'erreur d'origine.
 */

export async function resolve(specificateur, contexte, suivant) {
  try {
    return await suivant(specificateur, contexte);
  } catch (erreur) {
    if (!specificateur.startsWith(".") && !specificateur.startsWith("/")) throw erreur;
    for (const suffixe of [".ts", "/index.ts"]) {
      try {
        return await suivant(specificateur + suffixe, contexte);
      } catch {
        // on essaie le suffixe suivant
      }
    }
    throw erreur;
  }
}
