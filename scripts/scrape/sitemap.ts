/**
 * Inventaire de l'UdeM par le sitemap officiel.
 *
 * `https://admission.umontreal.ca/sitemap.xml` est un index TYPO3 de 16
 * sous-sitemaps : 1 `pages`, 1 `news`, 2 `programmes`, 12 `cours`. Les deux
 * sous-sitemaps `programmes` donnent 1 000 + 88 = 1 088 URLs, les douze `cours`
 * en donnent 11 888. Seize requêtes, contre un index paginé à deviner.
 *
 * DEUX PIÈGES VÉRIFIÉS LE 2026-09-11. Ils ont la même cause — un cache serveur
 * qui ignore la requête — et la même parade : lire la balise RACINE avant de
 * croire au contenu.
 *
 * 1. Chaque `<loc>` de l'index porte un `cHash` :
 *
 *        …/sitemap.xml?sitemap=programmes&cHash=82d0679dd05587373134d2426c3793e6
 *
 *    Demander `…/sitemap.xml?sitemap=programmes` SANS ce `cHash` ne renvoie pas
 *    une erreur : le site répond **200 avec l'index lui-même**, octet pour
 *    octet. Un scraper qui bâtirait l'URL à la main récolterait 16 liens de
 *    sitemap au lieu de 1 088 programmes, sans qu'aucun statut HTTP ne le dise.
 *
 * 2. Pire, et observé en pleine exécution : `…/sitemap.xml` tout court n'est pas
 *    stable. Il a servi le `<sitemapindex>` de 16 entrées, puis, quelques
 *    minutes plus tard, un `<urlset>` de 1 000 URLs de programmes — la réponse
 *    d'un sous-sitemap servie à la place de l'index, pour toutes les valeurs
 *    d'`Accept` et pour `?L=0`, `?sitemap=`, `?no=1`. Les sous-sitemaps avec
 *    leur cHash, eux, continuaient de répondre juste. Conclusion : l'index ne
 *    peut pas être la seule source de ses propres liens, d'où le repli
 *    `sous-sitemaps.json`.
 *
 * D'où, dans tout ce fichier :
 *   - on suit les `<loc>` d'un index, on ne fabrique jamais l'URL d'un
 *     sous-sitemap ;
 *   - `lireSitemap()` lit la balise racine et refuse de prendre un
 *     `<sitemapindex>` pour un `<urlset>` — ou l'inverse.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type GenreSitemap = "index" | "urls";

export interface Sitemap {
  genre: GenreSitemap;
  locs: string[];
}

const ENTITES_XML: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decoder(texte: string): string {
  return texte.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entier, corps: string) => {
    if (corps.startsWith("#x") || corps.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(corps.slice(2), 16));
    }
    if (corps.startsWith("#")) return String.fromCodePoint(Number.parseInt(corps.slice(1), 10));
    return ENTITES_XML[corps] ?? entier;
  });
}

/**
 * Lit un sitemap et dit CE QU'IL EST avant de dire ce qu'il contient.
 *
 * Lève plutôt que de rendre une liste vide : un inventaire vide se propagerait
 * en « 0 programme trouvé », message qu'on prendrait pour une donnée.
 */
export function lireSitemap(xml: string): Sitemap {
  const racine = /<(sitemapindex|urlset)\b/i.exec(xml);
  if (!racine) {
    throw new Error(
      "ce document n'est ni un <sitemapindex> ni un <urlset> — " +
        `début reçu : ${JSON.stringify(xml.slice(0, 200))}`,
    );
  }
  const genre: GenreSitemap = racine[1].toLowerCase() === "sitemapindex" ? "index" : "urls";
  const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) => decoder(m[1]).trim());
  return { genre, locs };
}

/** Les `<loc>` d'un index, en exigeant que ce soit bien un index. */
export function sousSitemaps(xml: string): string[] {
  const lu = lireSitemap(xml);
  if (lu.genre !== "index") {
    throw new Error("attendu un <sitemapindex>, reçu un <urlset>");
  }
  return lu.locs;
}

/**
 * Les URLs d'un sous-sitemap, en REFUSANT un index.
 *
 * C'est ici que le piège du `cHash` est arrêté : sans la garde, un index servi
 * à la place d'une liste d'URLs donnerait 16 entrées plausibles.
 */
export function urlsSitemap(xml: string, quoi: string): string[] {
  const lu = lireSitemap(xml);
  if (lu.genre === "index") {
    throw new Error(
      `${quoi} : reçu un <sitemapindex> là où un <urlset> était attendu. ` +
        "Cause connue : URL de sous-sitemap construite à la main, sans son cHash — " +
        "TYPO3 répond alors 200 avec l'index. Suivre les <loc> de l'index.",
    );
  }
  return lu.locs;
}

/** Garde les `<loc>` d'un index qui concernent un jeu donné (`programmes`, `cours`). */
export function sousSitemapsDuJeu(locs: string[], jeu: string): string[] {
  return locs.filter((l) => new RegExp(`[?&]sitemap=${jeu}(?:&|$)`).test(l));
}

/**
 * Slug d'une URL de programme : `…/programmes/<slug>/` -> `<slug>`.
 * Rend null pour toute autre forme, que l'appelant journalise.
 */
export function slugProgramme(url: string): string | null {
  const m = /^https?:\/\/[^/]+\/programmes\/([^/?#]+)\/?$/.exec(url.trim());
  return m ? m[1] : null;
}

/** Slug d'une URL de fiche : `…/cours-et-horaires/cours/<slug>/` -> `<slug>`. */
export function slugCours(url: string): string | null {
  const m = /^https?:\/\/[^/]+\/cours-et-horaires\/cours\/([^/?#]+)\/?$/.exec(url.trim());
  return m ? m[1] : null;
}

/** Dédoublonne en gardant l'ordre du sitemap. */
export function uniques(valeurs: string[]): string[] {
  return [...new Set(valeurs)];
}

// ---------------------------------------------------------------------------
// Repli : la liste des sous-sitemaps, persistée
// ---------------------------------------------------------------------------

export const CHEMIN_SOUS_SITEMAPS = path.join(import.meta.dirname, "sous-sitemaps.json");

export interface FichierSousSitemaps {
  capteLe: string;
  source: string;
  sousSitemaps: string[];
}

/**
 * Lit la liste persistée des sous-sitemaps.
 *
 * Elle existe parce que l'index ne peut pas être la seule source de ses propres
 * liens (piège 2 ci-dessus) : sans elle, une réponse empoisonnée de
 * `/sitemap.xml` rendrait tout le scrape impossible jusqu'à ce que le cache du
 * site se vide, sans qu'on sache pourquoi.
 */
export async function lireSousSitemapsPersistes(): Promise<FichierSousSitemaps | null> {
  try {
    const brut = JSON.parse(await readFile(CHEMIN_SOUS_SITEMAPS, "utf8")) as Partial<FichierSousSitemaps>;
    if (!Array.isArray(brut.sousSitemaps) || brut.sousSitemaps.length === 0) return null;
    return {
      capteLe: brut.capteLe ?? "(inconnu)",
      source: brut.source ?? "(inconnue)",
      sousSitemaps: brut.sousSitemaps,
    };
  } catch {
    return null;
  }
}

/** Réécrit la liste persistée quand on vient d'obtenir un index valide. */
export async function ecrireSousSitemapsPersistes(
  source: string,
  sousSitemapsLus: string[],
): Promise<void> {
  const fichier = {
    _pourquoi:
      "Liste des sous-sitemaps d'admission.umontreal.ca, avec leur cHash. Sert de REPLI quand " +
      "https://admission.umontreal.ca/sitemap.xml ne sert pas son index (vu le 2026-09-11 : le même " +
      "URL a répondu un <sitemapindex> de 16 entrées, puis un <urlset> de 1 000 URLs de programmes). " +
      "Réécrit automatiquement par le scraper dès qu'un vrai index est obtenu ; ne pas éditer à la main.",
    capteLe: new Date().toISOString(),
    source,
    sousSitemaps: sousSitemapsLus,
  };
  await writeFile(CHEMIN_SOUS_SITEMAPS, `${JSON.stringify(fichier, null, 2)}\n`, "utf8");
}
