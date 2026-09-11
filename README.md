# Plan ton bacc — UdeM

Planifier son baccalauréat à l'Université de Montréal : voir quels cours sont
déverrouillés, ce qu'il manque dans chaque bloc, et **quand les cours sont
réellement offerts**.

Inspiré de `CBC-Mcgill/McGill-Plan-Your-Degree`, mais UdeM expose des données
nettement plus mécanisables.

## État

Fonctionnel de bout en bout sur l'**orientation actuariat** du baccalauréat en
mathématiques (segments 01 et 75, 90 crédits).

```
npm install
npm run dev      # les trois vues sur http://localhost:3000
npm test         # 184 tests
npm run scrape   # régénère data/catalogue.json depuis admission.umontreal.ca
```

Trois vues : l'arbre des préalables (verrouillé / disponible / fait /
à vérifier), l'audit des blocs, et le placement par trimestre. Aucune base de
données, aucun compte : le catalogue est du JSON statique et ton parcours vit
dans le `localStorage` de ton navigateur.

`docs/VALIDATION-AUTRES-PROGRAMMES.md` dit précisément ce qui casse quand on
sort de l'actuariat, et `docs/CONTRAT.md` ce qu'il faudrait changer pour
l'étendre.

## Pourquoi UdeM s'y prête

| | McGill | UdeM |
|---|---|---|
| Préalables | prose à interpréter | codes reliés par `ET`/`OU` (`ACT1240 ET MAT1720`) |
| Exigences | texte de programme | blocs à minimum/maximum de crédits explicites |
| Audit de diplôme | reporté en V2 | calculable dès le départ |
| Offre par trimestre | non modélisée | sur chaque fiche de cours |

Sur les 35 lignes de préalables du programme, **33 sont lues** comme un arbre
`ET`/`OU`. Les 2 autres restent volontairement opaques et signalées à l'écran :
`MAT1400/MAT1600/MAT1720 ou MAT1978`, dont les deux lectures possibles ne
verrouillent pas les mêmes étudiants, et une condition de moyenne cumulative
que les données ne contiennent pas. Un préalable opaque ne verrouille jamais un
cours — il s'affiche comme avertissement.

## Le problème que ça résout vraiment

Pour l'actuariat (54 crédits obligatoires, 33 à option, 3 au choix), les
minimums des quatre blocs d'option ne totalisent que **18** crédits alors qu'il
en faut **33**. Un audit qui vérifie chaque bloc séparément conclut donc « tout
est conforme » sur un parcours qui ne mène pas au diplôme.

Le symétrique est aussi vrai et aussi invisible : 33 crédits d'option tous
empilés dans le bloc 75C, plafonné à 27, n'en donnent que **27**. Les 6 autres
sont réussis et ne comptent pas. L'audit les affiche comme perdus.

Et 26 des 55 cours du programme ne sont offerts qu'à un seul trimestre, ce qui
fait que les options ne sont pas librement réparties dans le temps.

## Données

Pages publiques de `admission.umontreal.ca` (programmes et cours). Le scraper
met en cache sur disque et espace ses requêtes.

Projet personnel, sans affiliation avec l'Université de Montréal ; les données
officielles font foi.
