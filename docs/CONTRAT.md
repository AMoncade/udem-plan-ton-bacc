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
