# Plan ton bacc — UdeM

Planifier son baccalauréat à l'Université de Montréal : voir quels cours sont
déverrouillés, ce qu'il manque dans chaque bloc, et quand les cours sont
réellement offerts.

> État : en construction. Le squelette, le contrat de données et les fixtures
> vérifiées sont en place ; scraper, moteur et interface sont en cours.

## Pourquoi UdeM s'y prête

| | McGill | UdeM |
|---|---|---|
| Préalables | prose à interpréter | codes reliés par `ET`/`OU` (`ACT1240 ET MAT1720`) |
| Exigences | texte de programme | blocs à minimum/maximum de crédits explicites |
| Audit de diplôme | reporté en V2 | calculable dès le départ |
| Offre par trimestre | non modélisée | sur chaque fiche de cours |

## Le problème que ça résout vraiment

Pour l'orientation actuariat (90 crédits : 54 obligatoires, 33 à option, 3 au
choix), les minimums des quatre blocs d'option ne totalisent que **18** crédits
alors qu'il en faut **33**. Auditer chaque bloc séparément conclut donc « tout
est conforme » sur un parcours qui ne mène pas au diplôme. C'est précisément ce
que cet outil calcule correctement.

## Données

Tirées de `admission.umontreal.ca` (pages publiques de programmes et de cours).
Projet personnel, sans affiliation avec l'Université de Montréal ; les données
officielles font foi.
