# Brief — chantier MOTEUR

## Ce que tu possèdes
`lib/engine/**`, y compris `lib/engine/prealables.ts` dont j'ai écrit le socle.

## Ce que tu ne touches pas
`lib/types.ts`, `lib/codes.ts` (gelés — demande à l'intégratrice), `scripts/**`,
`app/**`.

## Objectif
Deux fonctions, sorties typées par `lib/types.ts` (déjà gelé, ne le redéfinis pas) :

```ts
// lib/engine/index.ts
export function diagnostiquerCours(catalogue: Catalogue, faits: Set<CodeCours>): Map<CodeCours, DiagnosticCours>
export function auditProgramme(programme: Programme, catalogue: Catalogue, faits: Set<CodeCours>): Audit
```

1. **Étendre `parsePrealables()`** aux formes que la session scraper va
   rapporter (OU, parenthèses, conditions en prose, concomitants). Le socle
   refuse délibérément de deviner la précédence de « A ET B OU C » et renvoie
   `opaque` : garde ce réflexe. Une précédence devinée de travers déverrouille
   un cours que l'étudiant n'a pas le droit de prendre, et ça ne se découvre
   qu'à l'inscription. **Attends son relevé de formes réelles avant d'écrire un
   parseur général** — sinon tu écris pour des cas imaginaires.
2. **`diagnostiquerCours`** : évalue l'arbre. Un noeud `opaque` ne verrouille
   jamais — il produit l'état `avertissement` et son texte va dans
   `avertissements`. Un code cité en préalable mais absent du catalogue ne doit
   pas faire planter.
3. **`auditProgramme`** — le vrai morceau.

## Le piège central, chiffré
Actuariat, 90 crédits = 54 obligatoires + 33 option + 3 choix.
Minimums des blocs d'option : 75C≥12, 75D≥3, 75E≥0, 75Y≥3, **somme 18**, alors
que le programme exige **33** crédits d'option. Les 15 crédits restants se
placent librement dans n'importe quel bloc d'option sous son maximum
(75C≤27, 75D≤15, 75E≤13, 75Y≤12, capacité totale 67).

Conséquence : un audit bloc-par-bloc déclare **conforme** un parcours à 18
crédits d'option qui ne diplôme pas. `Audit.conforme` doit tenir les deux
niveaux ensemble — bornes de chaque bloc **et** totaux par type de bloc.

Deuxième difficulté : **un cours ne compte que dans un seul bloc**. S'il figure
dans deux blocs, l'attribution devient un problème d'affectation sous bornes, et
une attribution gloutonne peut déclarer non conforme un parcours qui l'est. Je
crois qu'il n'y a **aucun chevauchement** entre les blocs de l'actuariat —
**vérifie-le** sur la fixture avant de décider. S'il n'y en a pas, une
attribution directe suffit et tu documentes l'hypothèse ; s'il y en a, dis-le
avant d'écrire un solveur.

## Contraintes
- Tu construis contre `data/fixtures/actuariat-verifie.fixture.json`. Elle est
  **partielle exprès** : 55 codes référencés, 3 fiches de cours. Un bloc qui
  cite un cours sans fiche est un cas normal, pas une exception.
- Fonctions pures, aucun accès réseau ni disque.
- Les messages de `Audit.problemes` sont en français et disent quoi faire :
  « il manque 9 crédits dans le bloc 75C », pas « contrainte 75C violée ».
- Tests vitest exhaustifs sur l'arithmétique. Inclus le cas qui piège : un
  parcours à 54 obligatoires + 18 option + 3 choix doit sortir **non conforme**
  avec un problème explicite sur le total d'option.

## Terminé quand
`npm test` vert, et un test nommé démontre le cas 18-contre-33.
