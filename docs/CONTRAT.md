# Contrat entre les chantiers

Trois sessions travaillent en parallèle. Le découpage est **par fichier**, pas
par fonctionnalité : un brief exprimé en fonctionnalités (« fais le scraper »,
« fais l'UI ») se rencontre toujours dans un fichier partagé, et l'un des deux
perd son travail au merge.

## Propriété des fichiers

| Fichiers | Propriétaire | Les autres |
|---|---|---|
| `lib/types.ts`, `lib/codes.ts` | **intégratrice** (gelés) | lisent, n'éditent pas |
| `lib/engine/**` | session **moteur** | importent, n'éditent pas |
| `scripts/scrape/**`, `data/catalogue.json` | session **scraper** | lisent le JSON |
| `app/**`, `components/**`, `app/globals.css` | session **UI** | n'y touchent pas |
| `data/fixtures/**` | **intégratrice** | lisent, n'éditent pas |
| `package.json` | **intégratrice** | demandent l'ajout d'une dépendance |

Besoin d'un changement dans un fichier qui n'est pas à vous : **demandez-le**
au propriétaire, ne l'éditez pas. Une session a édité le fichier d'une autre
sur un projet précédent ; le merge était propre et le résultat cassé.

## Les deux seules coutures entre chantiers

1. **`parsePrealables()` — moteur → scraper.** Le scraper remplit
   `Cours.prealablesBrut` (verbatim) puis appelle `parsePrealables()` pour
   remplir `Cours.prealables`. Le moteur possède ce fichier ; le socle actuel
   ne couvre que « un code » et « A ET B ». Quand le moteur l'étend, le
   scraper n'a rien à changer — même signature.
   Toute ligne avec `complet: false` va dans `Catalogue.prealablesNonParses`.

2. **`Catalogue` et `Audit` — contrat → UI.** L'UI se construit contre
   `data/fixtures/actuariat-verifie.fixture.json`, **jamais** contre le
   catalogue scrapé (qui n'existe pas encore). Le jour où le scraper livre,
   seule la source de données change.

## L'arithmétique du programme, vérifiée

Orientation actuariat, baccalauréat en mathématiques (segments 01 + 75), 90 crédits.

| Type | Blocs | Somme des minimums | Exigé par le programme |
|---|---|---|---|
| Obligatoire | 01A (26) + 75A (21) + 75B (7) | **54** | 54 |
| Option | 75C (min 12) + 75D (min 3) + 75E (min 0) + 75Y (min 3) | **18** | **33** |
| Au choix | 75Z | 3 | 3 |

Les deux colonnes concordent pour l'obligatoire et divergent de 15 crédits
pour l'option. C'est le coeur du projet : **il faut 33 crédits d'option alors
que les minimums de blocs n'en imposent que 18**, les 15 restants étant
plaçables dans n'importe quel bloc d'option sous son maximum (capacité totale
27+15+13+12 = 67). Un audit qui traite chaque bloc indépendamment déclare donc
« conforme » un parcours à 18 crédits d'option, qui ne mène pas au diplôme.

## Pièges établis

- **Normalisation des codes.** UdeM écrit `ACT 2250`, `ACT2250`, `act-2250`.
  Comparer deux formes différentes ne lève aucune erreur : le graphe s'affiche
  sans arêtes et l'audit trouve zéro cours fait. Toujours `normaliserCode()`.
- **Absence ≠ vide.** `prealablesBrut: null` veut dire « la page n'a pas de
  champ Préalables » (cas normal : IFT 1015, ECN 2165). Ça n'est pas une
  erreur de scrape, et surtout ça n'est pas « je n'ai pas su lire ».
- **Un bloc peut citer un cours sans fiche.** La fixture le fait exprès :
  55 codes référencés, 3 fiches. À gérer, pas à contourner.
- **Un repli silencieux rend l'audit faux sans faire échouer de test.** Tout
  ce que le code n'a pas su interpréter doit ressortir quelque part
  (`prealablesNonParses`, `avertissements`, `problemes`).

## Sources vérifiées le 2026-09-10

- Structure : `admission.umontreal.ca/programmes/baccalaureat-en-mathematiques/structure-du-programme/`
- Fiche de cours : `admission.umontreal.ca/cours-et-horaires/cours/act-2250/`
  (`Préalables : ACT1240 ET MAT1720`, 3.0 cr, Été 2026 + Automne 2026)
- Sans préalables : `.../ift-1015/`, `.../ecn-2165/` (champ absent)
- Répertoire complet : 11 886 cours, pagination « Voir plus de résultats »,
  endpoint AJAX **non identifié** — inutile pour l'instant, on part des pages
  de structure.
- `robots.txt` : n'interdit que `/fileadmin/fichiers/premium/`.

## Confirmation directe du 54/33/3

Le tableau ci-dessus a d'abord été *déduit* (somme des blocs obligatoires, puis
90 − 54 − 3). Vérification faite ensuite sur la page de structure elle-même, qui
énonce pour l'orientation actuariat, verbatim :

> « 54 crédits obligatoires, 33 crédits à option et 3 crédits au choix »

Les huit règles de blocs y sont également confirmées mot pour mot, y compris
« Option - Maximum 13 crédits » pour 75E, sans minimum. L'écart de 15 crédits
entre les minimums de blocs (18) et le total d'option exigé (33) n'est donc pas
un artefact de lecture : c'est la règle du programme.

## État après le merge des quatre chantiers

Tout est fusionné sur `main`. Ce que le merge a appris, et qui contredit ce
document tel qu'il était écrit plus haut :

- **La couture 1 était mal décrite.** §1 affirmait que l'extension de
  `parsePrealables()` ne demande rien au scraper « même signature ». La
  signature, oui — mais l'extension **périme `data/catalogue.json`** et casse
  les tests du scraper qui épinglaient l'ancienne incapacité. Une couture n'est
  pas qu'une signature : c'est aussi *qui régénère, et quand*. Les deux ont été
  corrigés au merge, et `lib/engine/releve.test.ts` exige maintenant que le
  catalogue généré soit à jour avec le parseur.
- **Les noms de blocs de la fixture étaient inventés** par l'intégratrice, les
  huit. Corrigés depuis le catalogue réel. La règle « ne pas inventer de
  données » a été violée par celle qui l'a écrite — et c'est une session
  subordonnée qui l'a relevé, parce que son brief l'y invitait explicitement.
- **Le `.gitattributes` prévu n'est pas nécessaire** : `git ls-files --eol`
  montre un index uniformément `lf` sur les 73 fichiers. Le risque que la note
  surveillait ne s'est pas matérialisé.
- **Les tests de couture valent mieux que les tests de branche.** `tests/`
  éprouve ce qu'aucun chantier ne peut tester seul. Le plus utile vérifie que
  les crédits des fiches somment à la règle de chaque bloc obligatoire (26, 21,
  7) — deux informations scrapées indépendamment.

## Ce que le contrat ne sait pas encore faire

`docs/VALIDATION-AUTRES-PROGRAMMES.md` a éprouvé ce modèle sur sept programmes.
La forme générale tient partout ; quatre détails sont faux dès qu'on sort de
l'actuariat. Par ordre de coût croissant :

1. **`RegleBloc` ne couvre que 4 des 9 formes écrites.** Manquent
   `Option - 4 crédits.` (exact, sans min ni max — et c'est sur *notre* page, au
   bloc 82B), `Choix - Maximum 3 crédits.`, `Choix - Minimum 3, maximum 6`, et
   des variantes en minuscules. À l'inverse, la forme `min` sans `max` que le
   contrat autorise n'apparaît **nulle part**. Le moteur ne les avale pas en
   silence (`bornes.type !== "inconnu"` l'en empêche), mais il ne peut pas
   auditer ces blocs.
2. **`Programme` ne porte pas les totaux par type**, alors que la page les écrit
   verbatim : « 54 crédits obligatoires, 33 crédits à option et 3 crédits au
   choix ». Le moteur les déduit (90 − 54 − 3), ce qui marche ici ; ailleurs ce
   sont des **intervalles** (droit : « de 30 à 33 à option »), indéductibles.
   Le scraper consigne déjà la phrase dans son journal, faute de champ.
3. **`Catalogue` n'a pas de champ pour le journal du scraper**, qui voyage donc
   dans une clé `_journal` non typée. Une exigence réelle y est piégée et rien
   ne peut l'afficher : `Restrictions d'inscription: DMO1000/DMO1010`. C'est le
   repli silencieux que le projet combat, mais il est dans le contrat, pas dans
   le code.
4. **`Bloc.id` n'est pas unique et le segment ne s'en déduit pas** : la maîtrise
   en mathématiques a `MM-Bloc 73A` **et** `S-Bloc 73A` dans le segment 73.
   `segmentDeBloc()` se trompe dessus.
5. **`CodeCours` n'est pas « trois lettres + quatre chiffres »** : 199 codes
   suffixés (`DRT 1151G`, `MUI 1162A`) et quatre à cinq chiffres (`PSY 40001`).
   `normaliserCode()` renvoie `null` pour eux — ce qui n'est pas silencieux
   (l'UI les liste dans `codesIllisibles`), mais les exclut du graphe.
6. **Le chevauchement entre blocs est réel** hors actuariat : en droit, le bloc
   70K est entièrement contenu dans le 70L. L'attribution devient un problème
   d'affectation sous bornes. L'attribution directe actuelle se trompe alors
   dans un seul sens — elle peut déclarer non conforme un parcours conforme,
   jamais l'inverse.
