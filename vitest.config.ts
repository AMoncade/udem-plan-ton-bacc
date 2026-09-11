import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * `exclude` REMPLACE les valeurs par défaut de vitest, donc il faut
     * reconduire node_modules et dist en plus de nos ajouts.
     *
     * `.claude/worktrees/` contient les copies complètes du dépôt dans
     * lesquelles travaillent les sessions parallèles. Sans cette exclusion,
     * `npm test` ramasse leurs fichiers de test : 19 fichiers et 250 tests au
     * lieu de 4 et 67. Le nombre devient faux dans les deux sens — il gonfle
     * avec du code non commité, et il ne correspond plus à ce que la CI
     * mesure sur un checkout neuf. Un « tous les tests passent » qui dépend
     * de ce qui traîne sur le disque ne prouve rien.
     */
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".claude/**",
      ".next/**",
    ],
  },
});
