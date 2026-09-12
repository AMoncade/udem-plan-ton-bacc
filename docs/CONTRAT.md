# Contrat entre les chantiers

Trois sessions travaillent en parallèle. Le découpage est **par fichier**, pas
par fonctionnalité : un brief exprimé en fonctionnalités (« fais le scraper »,
« fais l'UI ») se rencontre toujours dans un fichier partagé, et l'un des deux
perd son travail au merge.

## Propriété des fichiers

Le découpage est **par fichier**, pas par fonctionnalité : un brief exprimé en
fonctionnalités se rencontre toujours dans un fichier partagé, et l'un des deux
perd son travail au merge. Éprouvé sur sept chantiers parallèles — **cinq
branches fusionnées sans un seul conflit**.

| Fichiers | Propriétaire | Les autres |
|---|---|---|
| `lib/types.ts`, `lib/codes.ts`, `lib/parcours.ts` | **intégratrice** (gelés) | lisent, n'éditent pas |
| `tests/**` (coutures), `scripts/copier-donnees.mjs` | **intégratrice** | — |
| `lib/engine/**` | session **moteur** | importent, n'éditent pas |
| `scripts/scrape/**`, `data/**` | session **scraper** | lisent |
| `app/**` sauf `app/importer/`, `components/**` sauf `Import*` | session **UI** | — |
| `lib/ics/**`, `app/importer/**`, `components/Import*.tsx` | session **import** | — |
| `electron/**`, `next.config.ts` | session **bureau** | — |
| `package.json` | **intégratrice**, sauf devDependencies et scripts `desktop:` | demandent |

Besoin d'un changement dans un fichier qui n'est pas à vous : **demandez-le**,
ne l'éditez pas. Un merge propre peut produire un résultat cassé.

**Les worktrees des sessions partent de `main`, pas de la branche de travail.**
Chaque session doit donc rapatrier la branche courante elle-même avant de
commencer. Trois sessions sur quatre l'ont découvert seules ; la quatrième a
construit contre le contrat v1 sans s'en apercevoir.

## Les coutures entre chantiers

Une couture n'est pas seulement une signature partagée : c'est aussi **qui
régénère, et quand**. La leçon a coûté une passe entière.

1. **`parsePrealables()` — moteur → scraper.** Le scraper remplit
   `prealablesBrut` verbatim puis appelle le parseur du moteur. Étendre le
   parseur ne change pas la signature, mais **périme `data/`** et casse les
   tests du scraper qui épinglaient l'ancienne incapacité.
2. **`normaliserCode()` / `extraireCodes()` — contrat → tous.** UdeM écrit
   `ACT 2250`, `ACT2250`, `act-2250`. Comparer deux formes ne lève aucune
   erreur : le graphe s'affiche sans arêtes.
3. **`sujetDeCode()` — scraper → UI.** Le scraper découpe `data/cours/` par
   sujet, l'UI charge par sujet. S'ils ne découpent pas pareil, l'UI affiche
   « cours sans fiche » sans qu'aucun test de chantier n'échoue.
4. **`cleParcours()` / `projeterOrientation()` — contrat → scraper et UI.**
   L'index a une entrée par **parcours** ; l'UI projette avant d'appeler le
   moteur. Trois projections différentes donneraient trois audits différents
   pour le même étudiant, sans erreur visible.
5. **`/donnees/...` — UI ↔ web et bureau.** L'UI charge avec `fetch`, qui lit
   une URL et non un chemin. Côté web, `scripts/copier-donnees.mjs` copie
   `data/` vers `public/donnees/` au build. Côté bureau, un schéma applicatif
   sert le même chemin, parce que **Chromium refuse `fetch` sur `file://`**.
6. **`app/_lib/stockage.ts` — UI → import.** La session d'import écrit l'état
   de l'étudiant par `lireEtat()` / `ecrire()` sans éditer le fichier.

## Le motif qui est apparu TROIS fois

Un test qui épingle une **incapacité** du code devient faux quand la capacité
arrive, et il échoue alors pour une raison qui n'est pas une régression :

- le scraper attendait `MAT 2717` opaque, le moteur a appris les parenthèses ;
- le moteur mesurait son progrès en lisant `prealablesNonParses` du catalogue
  **généré**, qui a cessé d'être périmé quand on l'a régénéré ;
- l'import exigeait que `DRT 1151G` soit refusé, le contrat a accepté les codes
  suffixés.

Les trois fois, la bonne réaction était de corriger le test, pas de plier le
code. Et la parade est la même : construire l'état « avant » explicitement, et
ajouter une assertion qui exige que les données générées soient **à jour** avec
le code qui les produit.
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

## Ce que le contrat v2 a corrigé, et ce qui reste

`docs/VALIDATION-AUTRES-PROGRAMMES.md` avait éprouvé le modèle v1 sur sept
programmes et trouvé six choses fausses hors actuariat. Toutes sont traitées :

| Trouvé faux en v1 | Traité par |
|---|---|
| `CodeCours` = 3 lettres + 4 chiffres | 4 ou 5 chiffres + suffixe ; `CRI 1600G` ≠ `CRI 1600` |
| `RegleBloc` ne couvrait que 4 des 9 formes | un type + des bornes, plus `inconnu` jamais conforme |
| `Bloc.id` non unique, segment déduit | `Bloc.cle`, `segment` lu sur la page |
| pas de totaux par type, intervalles ailleurs | `ExigencesParType`, couplés par la somme |
| journal hors contrat, restrictions piégées | `EntreeJournal` typé, `Cours.restrictionsBrut` |
| chevauchement entre blocs | affectation sous bornes (`lib/engine/affectation.ts`) |

Deux choses que la v2 a découvertes en plus, sur de vraies pages :

- **`Programme.orientations`.** Le contrat confondait une PAGE et un PARCOURS.
  La page du bacc en mathématiques énonce treize répartitions de crédits — sept
  par orientation, six par segment — et `exigences` n'avait qu'un emplacement.
  MESURÉ depuis : les 1 089 pages du catalogue portent 1 480 fiches d'index,
  soit 1,36 parcours par page. L'estimation « ~545 pages / ~964 parcours » qui
  figurait ici était une extrapolation d'échantillon, remplacée par un décompte.
- **`Bloc.contenuOuvert`.** Il existe des blocs « catégorie » qui n'énumèrent
  aucun cours et renvoient en prose à un ensemble extérieur (économie et
  politique 71/71G, musique 02/02E : cours du Centre de langues). Invérifiables
  mécaniquement — l'audit doit le dire, ni les déclarer satisfaits ni
  impossibles.

### Ce que les données amont ne garantissent pas

Le bacc en musique annonce « Obligatoire - 15 crédits » au bloc 01/01A et ne
liste que 4 cours à 3 crédits. Vérifié dans le HTML brut : c'est la page qui est
incohérente. Les tests de couture n'exigent donc pas que l'amont soit juste,
mais que **tout écart soit journalisé** — exiger la perfection bloquerait sur ce
qu'on ne maîtrise pas, tolérer en silence est ce que ce projet refuse.

## L'inventaire réel et le budget de scrape

Mesuré, pas supposé (`docs/INVENTAIRE-PROGRAMMES.md`) :

- **1 088 programmes** et **11 888 cours** au sitemap, unions distinctes,
  chevauchement nul. Chaque sous-sitemap porte un `cHash` ; TYPO3 ignore tous
  les paramètres dès que ce jeton ne correspond plus, donc **ne jamais fabriquer
  ces URL** — suivre celles de l'index. Et `/sitemap.xml` lui-même n'est pas
  stable : il sert parfois un `urlset` de programmes au lieu du `sitemapindex`.
- **1 089 pages** portant **1 480 fiches d'index**, et 117 sujets de cours —
  décompté sur `data/`, non extrapolé. L'ancienne estimation (« ~545 pages,
  IC95 458–630, ~964 parcours ») visait les pages EXPLOITABLES ; le décompte
  d'orientation le plus proche donne 581 programmes à ≥ 10 cours, dans
  l'intervalle annoncé. Citer le décompte, pas l'extrapolation.
- **Le tri se fait sur le CONTENU, jamais sur le statut** : 110/110 répondent
  200, et 31 % sont vides. Un test par HEAD conclurait « 100 % ont une
  structure ».
- **Passe programmes : 41 min** à 2 s de délai. **Passe cours : ~11,4 h** — une
  fiche de cours répond en 1,45 s, cinq fois une page de programme. Calculer
  `11888 × délai` sans le temps de réponse donne 6,6 h et c'est faux.
- 278 slugs (`des-*`, stages postdoctoraux) sont à rendement nul. Ils sont
  quand même récupérés et marqués `structureLue: false` : « ce programme existe
  et n'a pas de structure exploitable » est une réponse, un trou muet n'en est
  pas une.
- **Une seule session à la fois sur le réseau.** Deux sessions qui scrapent le
  même hôte rendent le délai poli sans objet.

Ordre des passes : `--sans-cours` d'abord, puis `--cours-cites`.

**L'union des codes cités ne doit pas être extrapolée : elle est un sous-produit
gratuit de la passe programmes.** Un `Set` de codes normalisés accumulé pendant
les 41 minutes donne l'union EXACTE sur la population entière, sans une requête
de plus et sans intervalle de confiance à défendre. Normaliser avant d'insérer,
sinon des doublons de forme (`ACT 1240` contre `ACT1240`) la gonflent.

Le seul chiffre connu — 1328 codes sur 26 programmes, dont 6 des 26 derniers
n'ajoutant rien — vient du **scraper** et porte un biais d'échantillon : ces 26
sont de gros programmes de 1er cycle choisis à la main, qui partagent d'énormes
troncs communs, donc l'union y sature **par construction de l'échantillon**. La
queue réelle est faite de microprogrammes, DESS et maîtrises spécialisées dont
les codes de niveau 6000-7000 n'apparaissent nulle part ailleurs. Extrapoler
sous-estimerait l'union — et dans le sens qui arrange, ce qui est le pire cas.
