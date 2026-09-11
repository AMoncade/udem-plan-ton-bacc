import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Export statique : `next build` écrit `out/`, un dossier de HTML/CSS/JS
   * servable sans serveur. C'est ce que l'app de bureau empaquette.
   *
   * Tenable parce que l'app n'a ni route d'API, ni rendu serveur dynamique :
   * le catalogue est du JSON et le plan de l'étudiant vit dans `localStorage`
   * (CLAUDE.md). Vérifié sur l'arbre : aucun `route.ts`, aucun `"use server"`,
   * aucun appel à `cookies()`/`headers()`.
   *
   * Conséquence à connaître : `next start` est incompatible avec
   * `output: "export"` — le script `npm start` de `package.json` ne peut plus
   * servir ce build. `next dev` n'est pas affecté.
   */
  output: "export",

  images: {
    /**
     * L'optimiseur d'images de Next a besoin d'un serveur, qui n'existe pas
     * dans un export. Aucun `next/image` n'est utilisé aujourd'hui, mais sans
     * ce réglage le jour où quelqu'un en ajoute un, c'est le BUILD qui casse,
     * avec un message qui ne pointe pas vers ici.
     */
    unoptimized: true,
  },

  typescript: {
    /**
     * Échappatoire explicite, éteinte par défaut.
     *
     * Elle existe parce que le commit `5465cd5` (« Contrat v2 ») a changé
     * `lib/types.ts` et `lib/codes.ts` sans que `app/**`, `lib/engine/**`,
     * `scripts/**` ni `tests/**` aient suivi : sur le tip de
     * `v2-tous-les-programmes` (5465cd5), `next build` échoue au type-check
     * sur 45 erreurs — jeu d'erreurs IDENTIQUE avec et sans `output: "export"`,
     * donc aucune n'est imputable à l'export. Cette variable permet
     * de produire un `out/` et de vérifier la chaîne bureau pendant que la
     * migration du contrat est en vol.
     *
     * `npm run build` reste STRICT : sans la variable, rien ne change.
     * À supprimer quand la migration du contrat aura atterri.
     */
    ignoreBuildErrors: process.env.DESKTOP_IGNORER_ERREURS_TS === "1",
  },
};

export default nextConfig;
