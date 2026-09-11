import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copie jetable de data/, régénérée au build.
    "public/donnees/**",
    /**
     * Les worktrees des sessions parallèles sont des copies complètes du dépôt,
     * artefacts de build compris. Sans cette exclusion, `eslint .` y descend et
     * rend 29 259 problèmes venant de fichiers qui ne sont même pas suivis —
     * un compte qui gonfle avec ce qui traîne sur le disque et qui ne
     * correspond à rien de ce que la CI mesure. Même pollution que celle déjà
     * corrigée pour vitest.
     */
    ".claude/**",
  ]),
  {
    /**
     * `electron/` tourne dans le processus principal d'Electron, en CommonJS —
     * pas dans le navigateur ni dans le bundle Next. Les règles de Next y sont
     * appliquées à tort : `require()` y est la bonne façon de charger un module,
     * et `module.exports` n'est pas la variable `module` que Next surveille.
     *
     * On désactive ces trois règles pour ces fichiers-là seulement, plutôt que
     * de les ignorer en bloc : le reste du linting (variables inutilisées,
     * égalité stricte…) continue de s'y appliquer.
     */
    files: ["electron/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@next/next/no-assign-module-variable": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
]);

export default eslintConfig;
