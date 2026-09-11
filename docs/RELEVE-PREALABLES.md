# Relevé des formes de préalables — orientation actuariat

Relevé produit par la session **scraper** pour la session **moteur** : il dit ce
que `parsePrealables()` doit savoir lire, à partir de ce que le site publie
réellement, et non de ce qu'on imaginait.

**Source** : les 55 fiches référencées par les 8 blocs de l'orientation
actuariat du baccalauréat en mathématiques, récupérées le **2026-09-11**
(`admission.umontreal.ca/cours-et-horaires/cours/<slug>/`). 55 codes demandés,
55 fiches obtenues, aucune erreur HTTP.

**Régénérer** : `npm run scrape` — il imprime en fin de course le relevé des
formes distinctes, la liste des lignes non parsées et le journal des problèmes.
Le même journal est écrit dans `data/catalogue.json`, clé `_journal`.

---

## 1. Où vit la ligne, et à quoi ressemble son étiquette

Le champ est un `<div class="cours-exigence">` dans `section.cours-sommaire`,
toujours **un seul `<p>`**, jamais de `<br>` :

```html
<div class="cours-exigence">
    <h5 class="...">Exigences d&#039;inscription</h5>
    <p>Préalable: ACT1240 ET MAT1720</p>
</div>
```

| Fiches | Constat |
|---|---|
| 38 / 55 | ont un `div.cours-exigence` |
| **17 / 55** | **n'en ont aucun** — le cours n'a pas d'exigence ; `prealablesBrut: null` |

Étiquettes rencontrées dans ce `<p>`, toutes occurrences confondues :

| Occurrences | Étiquette | Remarque |
|---|---|---|
| 21 | `Préalable:` | singulier, **sans espace avant le deux-points** |
| 14 | `Préalables :` / `Préalables:` | pluriel, avec ou sans espace |
| 4 | `Concomitant :` | |
| 1 | `Concomitants:` | |
| 1 | `Restrictions d'inscription:` | **étiquette inconnue** (DMO 1000) |

Trois pièges de forme, tous réels :

- le singulier ne prédit pas le nombre de codes : `Préalable: IFT1025 et IFT1065`
  (IFT 2015) en porte deux ;
- deux exigences peuvent tenir sur **une seule ligne**, séparées par `;` —
  `Préalable : MAT1600; Concomitant : STT2700` (STT 2400), et avec un espace
  avant le `;` chez STT 2105 ;
- le point final colle parfois au code : `Préalable : ACT3251.; Concomitant : STT3790.`
  (ACT 3261).

Le scraper met dans `prealablesBrut` **le texte après le deux-points, verbatim**,
point final compris. Le relevé ci-dessous porte donc exactement ce que le moteur
recevra.

---

## 2. Les 25 formes distinctes de `prealablesBrut`

35 fiches sur 55 ont une ligne de préalables. Elles se réduisent à 25 formes
distinctes, en 6 familles.

### A. Un code seul — 9 formes, **lues** par le parseur actuel

| Forme | Fiches |
|---|---|
| `ACT1240` | ACT 2241, ACT 2242, ACT 2243 |
| `ACT2250` | ACT 2251, ACT 3201 |
| `ECN1000` | ECN 1040 |
| `MAT1000` | MAT 2050, MAT 2100, MAT 2130 |
| `MAT1400` | MAT 1410 |
| `MAT1600` | STT 2400 |
| `MAT1720` | ACT 3251 |
| `STT2700` | STT 2105, STT 3510 |
| `STT3410` | STT 3781 |

### B. Conjonction homogène — 6 formes, **lues** par le parseur actuel

`ET` majuscule et `et` minuscule coexistent ; le parseur actuel est déjà
insensible à la casse, donc les deux passent.

| Forme | Fiches |
|---|---|
| `ACT1240 ET MAT1720` | ACT 2250 |
| `MAT1400 ET MAT1600` | MAT 2115, MAT 2412 |
| `ACT2241 et MAT2717` | ACT 3230 |
| `ACT3251 et STT2700` | ACT 2284 |
| `STT2400 et STT2700` | STT 3220, STT 3260, STT 3410, STT 3790 |
| `IFT1025 et IFT1065` | IFT 2015 — étiquette `Préalable:` au singulier pour deux codes |

### C. Disjonction simple — **non lue** (1 forme)

| Forme | Fiches |
|---|---|
| `IFT1015 ou IFT1016` | IFT 1025 |

C'est un `OU` sans parenthèses mais **homogène** : aucune ambiguïté de
précédence, contrairement au cas `A ET B OU C` que le socle refuse à raison.

### D. Parenthèses + mélange ET/OU — **non lue** (4 formes)

| Forme | Fiches |
|---|---|
| `MAT1600 et (MAT1720 ou MAT1978)` | MAT 2717 |
| `(MAT1720 ou MAT1978) et STT1700` | STT 2700 |
| `IFT2015 ET (MAT1978 OU MAT1720 OU PHY2215)` | IFT 3245 |
| `IFT2015 ET (MAT1978 OU MAT1720 OU STT1700)` | IFT 3700 |

Les parenthèses sont **toujours explicites** dans ces quatre cas, et la
disjonction y est binaire ou ternaire. Rien à deviner.

### E. Barre oblique comme séparateur — **non lue** (1 forme)

| Forme | Fiches |
|---|---|
| `MAT1400/MAT1600/MAT1720 ou MAT1978` | STT 3795 |

La seule forme **vraiment ambiguë** du lot. La barre oblique sépare trois codes,
puis un `ou` arrive sans parenthèses : est-ce
`MAT1400 et MAT1600 et (MAT1720 ou MAT1978)`, ou
`MAT1400 ou MAT1600 ou MAT1720 ou MAT1978` ? La même barre oblique sert ailleurs
de « ou » dans une restriction (`DMO1000/DMO1010`, cours équivalents), ce qui
penche pour « ou » — mais ça reste une lecture, pas une donnée.
**Recommandation : rester `opaque`.**

### F. Point final qui colle — **non lue**, alors que le contenu l'est

| Forme | Fiches | Ce qui bloque |
|---|---|---|
| `ACT3251.` | ACT 3261 | le point : sinon famille A |
| `ACT2250 et ACT3251.` | ACT 3253 | le point : sinon famille B |
| `MAT1000 et (MAT1720 ou MAT1978).` | MAT 2719 | le point **et** les parenthèses |

**Recommandation : rogner un point final unique avant de parser.** Ça débloque
2 lignes sur 3 immédiatement, sans rien deviner. Le scraper, lui, garde le
verbatim — à vous de normaliser à l'entrée.

### G. Condition en prose — doit rester `opaque`

| Forme | Fiche |
|---|---|
| `57 crédits complétés dans le baccalauréat en mathématiques 1-190-1-0 avec une moyenne cumulative supérieure à 3.3.` | ACT 4000 |

Un seul cas, et c'est exactement celui que `lib/types.ts` décrit : noeud
`opaque`, jamais bloquant, affiché comme avertissement.

---

## 3. Ce que le parseur actuel ne lit pas : les 10 lignes

Ce sont les entrées de `Catalogue.prealablesNonParses` dans
`data/catalogue.json`. 25 des 35 lignes sont lues ; ces 10-là ne le sont pas :

| Code | `prealablesBrut` | Famille |
|---|---|---|
| MAT 2717 | `MAT1600 et (MAT1720 ou MAT1978)` | D |
| STT 2700 | `(MAT1720 ou MAT1978) et STT1700` | D |
| IFT 3245 | `IFT2015 ET (MAT1978 OU MAT1720 OU PHY2215)` | D |
| IFT 3700 | `IFT2015 ET (MAT1978 OU MAT1720 OU STT1700)` | D |
| MAT 2719 | `MAT1000 et (MAT1720 ou MAT1978).` | D + F |
| IFT 1025 | `IFT1015 ou IFT1016` | C |
| STT 3795 | `MAT1400/MAT1600/MAT1720 ou MAT1978` | E |
| ACT 3253 | `ACT2250 et ACT3251.` | F |
| ACT 3261 | `ACT3251.` | F |
| ACT 4000 | `57 crédits complétés ... supérieure à 3.3.` | G (doit rester opaque) |

**Par ordre de rendement pour le moteur** : rogner le point final (2 lignes),
accepter le `OU` homogène sans parenthèses (1 ligne), puis parenthèses avec
`ET`/`OU` imbriqués (5 lignes). Restent 2 lignes qui doivent rester `opaque` :
la prose d'ACT 4000 et la barre oblique de STT 3795.

Aucune occurrence, dans ces 55 fiches, de `A ET B OU C` sans parenthèses — la
précédence ambiguë que le socle refuse de deviner **n'existe pas ici**. Le refus
reste juste par prudence, mais il ne coûte aucune ligne.

---

## 4. Concomitants (5 fiches)

`concomitantsBrut` est rempli verbatim et **n'est pas parsé** : aucun champ de
`Cours` ne porte un arbre de concomitants.

| Code | `concomitantsBrut` |
|---|---|
| STT 2400 | `STT2700` |
| STT 2105 | `MAT2717` |
| ACT 3282 | `ACT3230` |
| ACT 3261 | `STT3790.` |
| STT 2000 | `STT2000 et STT2700` |

**Anomalie de la source** : la fiche de STT 2000 se déclare concomitante
d'elle-même. C'est ce que la page publie, vérifiable dans le cache ; ce n'est
pas une erreur de lecture. Un moteur qui traiterait les concomitants comme des
préalables mettrait STT 2000 en attente de lui-même — interblocage.

---

## 5. Codes cités en exigence mais absents du programme

Ces codes apparaissent dans une ligne de préalables mais n'ont aucune fiche dans
`data/catalogue.json`, parce qu'aucun bloc de l'orientation ne les référence :

`IFT 1016`, `IFT 1065`, `MAT 1978`, `PHY 2215`

(plus `DMO 1010`, cité dans la restriction d'inscription de DMO 1000.)

Le moteur doit donc gérer un **noeud de préalable pointant vers un cours
inconnu** — cas structurel, pas un trou de scrape. `MAT 1978` est le plus
fréquent : il revient dans 5 des 10 lignes non parsées, toujours en alternative
à `MAT 1720`.

---

## 6. Règles de crédits des blocs — formes réellement présentes

Relevé sur les **59 blocs** de la page de structure (les sept orientations), pas
seulement sur les 8 de l'actuariat :

| Occurrences | Forme |
|---|---|
| 23 | `Option - Minimum N crédits, maximum N crédits.` |
| 17 | `Obligatoire - N crédits.` |
| 13 | `Option - Maximum N crédits.` |
| 5 | `Choix - N crédits.` |
| **1** | **`Option - N crédits.`** (bloc 82B, orientation Sciences mathématiques) |

Les quatre premières étaient annoncées par le brief. La cinquième ne l'était pas
et elle est **ambiguë** : ni minimum ni maximum n'est écrit. Le scraper la lit
`{ type: "option", min: N, max: N }` et **journalise l'interprétation**
(`gravite: "inattendu"`). Elle ne touche pas l'actuariat. À confirmer par
l'intégratrice avant que le moteur s'y fie.

Toutes ces règles finissent par un **point** sur la page. `regleBrut` le garde,
comme le veut « telle qu'écrite sur la page ».

---

## 7. Deux affirmations du brief qui sont fausses

1. « Je n'ai jamais vu de cas avec OU, des parenthèses, concomitant ou une
   condition en prose. » — **les quatre existent**, dès la 6e fiche scrapée
   (MAT 2717). Détail dans les familles C, D, G et la section 4.
2. « Le champ Préalables s'écrit `Préalables : ` » — **l'étiquette majoritaire
   est `Préalable:` au singulier et sans espace** (21 occurrences contre 14).
   Un parseur qui attendrait la forme du brief raterait 21 lignes sur 35.

L'affirmation « le champ est ABSENT quand le cours n'a pas de préalable » est,
elle, **confirmée** : 17 fiches sur 55 n'ont pas de `div.cours-exigence`, dont
IFT 1015 et ECN 2165.
