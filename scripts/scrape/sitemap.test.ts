/**
 * Lecture du sitemap, sur des EXTRAITS FIGÉS du vrai XML. Aucun accès réseau.
 *
 * Les deux tests qui comptent ici sont ceux qui REFUSENT : le site a servi un
 * `<sitemapindex>` là où un `<urlset>` était attendu, et l'inverse, toujours
 * avec un 200. Sans la garde sur la balise racine, le scraper récolterait 16
 * liens de sitemap au lieu de 1 088 programmes, ou 1 000 programmes au lieu de
 * 16 sous-sitemaps — dans les deux cas sans aucune erreur visible.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  lireSitemap,
  slugCours,
  slugProgramme,
  sousSitemaps,
  sousSitemapsDuJeu,
  uniques,
  urlsSitemap,
} from "./sitemap";

function fixture(nom: string): string {
  return readFileSync(path.join(import.meta.dirname, "__fixtures__", nom), "utf8");
}

const INDEX = fixture("sitemap-index.xml");
const PROGRAMMES = fixture("sitemap-programmes.xml");
const COURS = fixture("sitemap-cours.xml");

describe("lireSitemap — dire ce que c'est avant de dire ce qu'il y a dedans", () => {
  it("reconnaît un index", () => {
    const lu = lireSitemap(INDEX);
    expect(lu.genre).toBe("index");
    expect(lu.locs).toHaveLength(6);
  });

  it("reconnaît une liste d'URLs", () => {
    expect(lireSitemap(PROGRAMMES).genre).toBe("urls");
    expect(lireSitemap(COURS).genre).toBe("urls");
  });

  it("décode les entités : le `&amp;` des cHash redevient `&`", () => {
    // Sans ça, l'URL du sous-sitemap porterait « &amp;cHash= » et le site
    // répondrait autre chose que ce qu'on croit demander.
    const lu = lireSitemap(INDEX);
    expect(lu.locs[2]).toBe(
      "https://admission.umontreal.ca/sitemap.xml?sitemap=programmes&cHash=82d0679dd05587373134d2426c3793e6",
    );
    expect(lu.locs.some((l) => l.includes("&amp;"))).toBe(false);
  });

  it("lève sur un document qui n'est ni l'un ni l'autre, plutôt que de rendre []", () => {
    // Une liste vide se propagerait en « 0 programme trouvé », message qu'on
    // prendrait pour une donnée.
    expect(() => lireSitemap("<html><body>Erreur 500</body></html>")).toThrow(/ni un <sitemapindex>/);
  });
});

describe("les deux refus qui évitent un inventaire faux", () => {
  it("urlsSitemap refuse un index servi à la place d'une liste d'URLs", () => {
    // Cause vérifiée : une URL de sous-sitemap construite à la main, sans son
    // cHash. Le site répond 200 avec l'index.
    expect(() => urlsSitemap(INDEX, "?sitemap=programmes")).toThrow(
      /reçu un <sitemapindex> là où un <urlset> était attendu/,
    );
  });

  it("sousSitemaps refuse une liste d'URLs servie à la place de l'index", () => {
    // Cause vérifiée en pleine exécution : `…/sitemap.xml` tout court a servi le
    // <urlset> de 1 000 programmes au lieu de son propre index.
    expect(() => sousSitemaps(PROGRAMMES)).toThrow(/attendu un <sitemapindex>/);
  });
});

describe("sousSitemapsDuJeu", () => {
  it("sépare les sous-sitemaps par jeu, pages et news exclus", () => {
    const locs = lireSitemap(INDEX).locs;
    expect(sousSitemapsDuJeu(locs, "programmes")).toHaveLength(2);
    expect(sousSitemapsDuJeu(locs, "cours")).toHaveLength(2);
    expect(sousSitemapsDuJeu(locs, "pages")).toHaveLength(1);
    expect(sousSitemapsDuJeu(locs, "inexistant")).toEqual([]);
  });

  it("ne confond pas `sitemap=cours` avec un autre jeu qui commencerait pareil", () => {
    expect(sousSitemapsDuJeu(["https://x/sitemap.xml?sitemap=coursX&cHash=1"], "cours")).toEqual([]);
  });
});

describe("slugProgramme / slugCours", () => {
  it("tire les slugs des URLs de programmes", () => {
    expect(urlsSitemap(PROGRAMMES, "fixture").map(slugProgramme)).toEqual([
      "acces-fac",
      "actualisation-de-formation-en-enseignement",
      "actualisation-de-formation-en-psychoeducation-campus-laval",
      "actualisation-de-formation-en-psychoeducation-campus-montreal",
    ]);
  });

  it("tire les slugs des URLs de cours", () => {
    const slugs = urlsSitemap(COURS, "fixture").map(slugCours);
    expect(slugs).toEqual(["ang-6130", "ang-1034", "geo-6205"]);
  });

  it("rend null sur une URL d'un autre rayon, au lieu d'inventer un slug", () => {
    expect(slugProgramme("https://admission.umontreal.ca/cours-et-horaires/cours/act-2250/")).toBeNull();
    expect(slugCours("https://admission.umontreal.ca/programmes/acces-fac/")).toBeNull();
    expect(slugProgramme("https://admission.umontreal.ca/programmes/a/b/")).toBeNull();
  });

  it("accepte un slug suffixé ou à cinq chiffres, qui sont des fiches distinctes", () => {
    // `cri-1600g` n'est pas une coquille de `cri-1600` : c'est une autre fiche.
    expect(slugCours("https://admission.umontreal.ca/cours-et-horaires/cours/cri-1600g/")).toBe("cri-1600g");
    expect(slugCours("https://admission.umontreal.ca/cours-et-horaires/cours/psy-40001/")).toBe("psy-40001");
  });
});

describe("uniques", () => {
  it("dédoublonne en gardant l'ordre du sitemap", () => {
    expect(uniques(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });
});
