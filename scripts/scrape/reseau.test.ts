/**
 * La clé de cache — la fonction dont dépend toute la reprenabilité.
 *
 * Aucun accès réseau et aucune écriture : seule `cleCache` est pure, et c'est
 * elle qui décide si une relance retrouve une page déjà téléchargée. Deux URLs
 * différentes qui tomberaient sur la même clé, ou la même URL qui changerait de
 * clé d'une exécution à l'autre, ruineraient une course de plusieurs heures sans
 * qu'aucune erreur ne s'affiche : on retéléchargerait tout, ou on servirait la
 * mauvaise page.
 */
import { describe, it, expect } from "vitest";
import { DELAI_DEFAUT_MS, STATUT_HORS_LIGNE, STATUT_PANNE, cleCache } from "./reseau";

describe("cleCache", () => {
  it("est stable pour une même URL", () => {
    const u = "https://admission.umontreal.ca/cours-et-horaires/cours/act-2250/";
    expect(cleCache(u)).toBe(cleCache(u));
  });

  it("reste lisible : le chemin se retrouve dans le nom du fichier", () => {
    // Le cache s'inspecte à la main (c'est comme ça que l'incohérence du bacc. en
    // musique a été confirmée) : un répertoire de hachages purs serait inutilisable.
    expect(cleCache("https://admission.umontreal.ca/cours-et-horaires/cours/act-2250/")).toMatch(
      /^cours-et-horaires_cours_act-2250\.[0-9a-f]{8}$/,
    );
  });

  it("distingue deux cours dont les slugs ne diffèrent que par le suffixe", () => {
    // `cri-1600g` est une fiche DISTINCTE de `cri-1600`. Une collision de clés
    // ferait servir l'une pour l'autre, en silence.
    const a = cleCache("https://admission.umontreal.ca/cours-et-horaires/cours/cri-1600/");
    const b = cleCache("https://admission.umontreal.ca/cours-et-horaires/cours/cri-1600g/");
    expect(a).not.toBe(b);
  });

  it("distingue deux sous-sitemaps qui ne diffèrent que par leur REQUÊTE", () => {
    // Les 16 sous-sitemaps ont tous le même chemin `/sitemap.xml` : seule la
    // requête les sépare. Une clé bâtie sur le chemin seul les ferait tous
    // s'écraser l'un l'autre, et l'inventaire serait celui du dernier récupéré.
    const base = "https://admission.umontreal.ca/sitemap.xml";
    const cles = new Set([
      cleCache(base),
      cleCache(`${base}?sitemap=programmes&cHash=82d0679dd05587373134d2426c3793e6`),
      cleCache(`${base}?page=1&sitemap=programmes&cHash=0f1801988a97094e11401d89f122ad1a`),
      cleCache(`${base}?sitemap=cours&cHash=06e043935f9a5654940690fed48c2495`),
      cleCache(`${base}?page=1&sitemap=cours&cHash=b280c65b0de14c6c4d376d7188c29beb`),
    ]);
    expect(cles.size).toBe(5);
  });

  it("ne produit jamais un nom de fichier vide ni de séparateur de chemin", () => {
    for (const u of [
      "https://admission.umontreal.ca/",
      "https://admission.umontreal.ca/programmes/acces-fac/structure-du-programme/",
      "https://admission.umontreal.ca/sitemap.xml?a=1&b=2",
    ]) {
      const cle = cleCache(u);
      expect(cle.length).toBeGreaterThan(8);
      expect(cle).not.toMatch(/[/\\:?*"<>|]/);
    }
  });
});

describe("statuts conventionnels", () => {
  it("panne et hors-ligne ne sont pas des codes HTTP, et ne se confondent pas", () => {
    // 0 et -1 ne peuvent pas être renvoyés par un serveur : « je n'ai rien
    // demandé » et « la page n'existe pas » ne doivent jamais se confondre, la
    // première se reprend et la seconde est une donnée.
    expect(STATUT_PANNE).toBe(0);
    expect(STATUT_HORS_LIGNE).toBe(-1);
    expect(STATUT_PANNE).not.toBe(STATUT_HORS_LIGNE);
  });

  it("le délai par défaut laisse respirer un serveur universitaire", () => {
    expect(DELAI_DEFAUT_MS).toBeGreaterThanOrEqual(1000);
  });
});
