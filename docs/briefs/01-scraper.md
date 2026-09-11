# Brief — chantier SCRAPER

## Ce que tu possèdes
`scripts/scrape/**` et la sortie `data/catalogue.json`. Personne d'autre n'y touche.

## Ce que tu ne touches pas
`lib/types.ts`, `lib/codes.ts` (gelés), `lib/engine/**` (session moteur),
`app/**` (session UI), `package.json` (demande l'ajout d'une dépendance).

## Objectif
`npm run scrape` produit un `data/catalogue.json` conforme à l'interface
`Catalogue` de `lib/types.ts`, pour l'orientation **actuariat** du bacc en
mathématiques, puis pour n'importe quel programme passé en argument.

Deux étapes :
1. Lire la page de structure, en tirer les blocs (id, segment, règle de crédits
   verbatim + parsée, liste des codes).
2. Suivre chaque code vers `/cours-et-horaires/cours/<slug>/` (utilise
   `slugUrl()` de `lib/codes.ts`) et en tirer titre, crédits, cycle,
   description, `prealablesBrut` verbatim, concomitants, trimestres offerts.

Pour remplir `Cours.prealables`, appelle `parsePrealables()` de
`lib/engine/prealables.ts`. **Tu ne modifies pas ce fichier** : si son parsing
est insuffisant, c'est normal à ce stade — mets la ligne dans
`Catalogue.prealablesNonParses` et signale-le, la session moteur l'étendra. La
signature ne changera pas.

## Ce que je crois vrai — vérifie, je peux me tromper
J'ai fetché quatre pages le 2026-09-10, pas quarante. Mes affirmations :
- la règle de crédits s'écrit « Obligatoire - 26 crédits », « Option - Minimum
  12 crédits, maximum 27 crédits », « Option - Maximum 13 crédits » (sans
  minimum), « Choix - 3 crédits ». **Il existe probablement d'autres formes.**
- les codes de la page de structure sont hyperliés vers les fiches de cours.
- le champ « Préalables » est **absent** quand il n'y a pas de préalable
  (confirmé sur IFT 1015 et ECN 2165) — absence n'est ni une chaîne vide ni une
  erreur.
- je n'ai **jamais vu** de cas avec « OU », parenthèses, « concomitant » ou
  condition en prose. Ils existent sûrement. Ta première livraison utile est
  justement un échantillonnage : scrape les 55 codes de la fixture et **liste
  toutes les formes distinctes de `prealablesBrut` rencontrées**. Ce relevé
  vaut plus que du code, parce qu'il dit à la session moteur quoi écrire.

Si une de mes affirmations est fausse, dis-le et fais corriger `docs/CONTRAT.md`
par l'intégratrice plutôt que d'adapter le code à une donnée inventée.

## Contraintes
- **Politesse obligatoire** : cache sur disque (un fichier HTML par URL, sous
  `scripts/scrape/.cache/`, déjà ignoré par git), délai entre requêtes, et
  jamais de re-fetch si le cache est frais. `robots.txt` n'interdit que
  `/fileadmin/fichiers/premium/` (vérifié), ce qui permet le scrape mais
  n'autorise pas à marteler un serveur universitaire.
- `scrapeISO` rempli partout. Une donnée scrapée sans date est invérifiable.
- **N'invente jamais un champ.** Un cours dont la page n'a pas livré une
  information est absent du catalogue, ou a le champ à `null` avec une entrée
  dans un journal de problèmes — pas une valeur plausible.
- Tests vitest sur le **parsing du HTML**, avec des extraits de vraies pages
  figés dans `scripts/scrape/__fixtures__/`. Aucun test qui tape sur le réseau.

## Terminé quand
`npm test` vert, `npm run scrape` produit un `data/catalogue.json` qui valide
contre `Catalogue`, les 8 blocs et les ~55 cours sont présents, et ton rapport
liste les formes de préalables rencontrées ainsi que tout ce que le parseur n'a
pas su lire.
