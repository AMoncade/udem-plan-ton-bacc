# Inventaire des programmes UdeM — volume réel à scraper

Mesuré le 2026-09-11 sur `admission.umontreal.ca`.
Échantillon aléatoire de 110 slugs (graine `20260911`, tirage reproductible) tiré des
1 000 premiers slugs, population totale de 1 088, intervalles de Wilson à 95 % avec correction
de population finie.

---

## Réponse courte

**~545 pages de programme exploitables** (IC95 : 458–630) sur les 1 088 de la population.
Elles portent **~964 chemins de programme distincts** grâce aux orientations, soit **1,77 fois**
plus de programmes que de pages.

**La passe « programmes » prend 41 minutes à 2 s de délai**, pas 3 à 4 heures — le serveur répond
en 0,28 s sur ces pages.

**En revanche la passe « cours » est le vrai gros morceau : 11 888 pages, ~11,4 h à 2 s de délai.**
Les pages de cours répondent en **1,45 s**, cinq fois plus lentement que les pages de programme.
C'est ce poste, et non le nombre de programmes, qui décide de la faisabilité du scrape complet.

Deux corrections aux prémisses du brief, chacune mesurée :

| Prémisse du brief | Ce que la mesure donne |
|---|---|
| Certains programmes n'ont pas de page `/structure-du-programme/` | **Tous en ont une. 110/110 répondent 200.** Le tri se fait sur le contenu, pas sur le statut HTTP |
| `acces-fac` et `annee-preparatoire` n'ont manifestement pas de structure | **Faux, les deux en ont une** : 15 cours / 1 segment et 29 cours / 3 segments |

En revanche les deux décomptes du brief sont **confirmés** : 1 088 programmes et 11 888 cours,
tous deux revérifiés ici en suivant les sous-sitemaps (§1 et §7).

---

## 1. La population est bien de 1 088 — et le sitemap est paginé

> **Correction.** Une première version de ce rapport affirmait que le sitemap ne servait que
> 1 000 URL et que la pagination n'existait plus. **C'était faux**, signalé par la session `adrie-31`
> et vérifié ici. L'index et la pagination existent. Le détail de l'erreur est au §9.

`https://admission.umontreal.ca/sitemap.xml` renvoie un **`<sitemapindex>` de 16 sous-sitemaps**.
Chaque URL de sous-sitemap porte un **jeton `cHash`** :

```
…/sitemap.xml?sitemap=programmes&cHash=82d0679dd05587373134d2426c3793e6        → 1000 URL
…/sitemap.xml?page=1&sitemap=programmes&cHash=0f1801988a97094e11401d89f122ad1a →   88 URL
```

**Règle opérationnelle : il ne faut pas fabriquer ces URL, il faut suivre celles que l'index donne,
avec leur `cHash`.** TYPO3 valide ce jeton contre les paramètres ; mesuré ici, une requête
`?sitemap=programmes` **sans** `cHash` ne renvoie pas la liste des programmes mais **l'index par
défaut** — les paramètres sont ignorés en bloc.

**Vérifié en suivant les URL de l'index :** 1 000 slugs sur la page 0, 88 sur la page 1,
**union distincte = 1 088, chevauchement = 0**. Les plages sont contiguës : la page 0 finit à
`stage-postdoctoral-en-hygiene`, la page 1 va de `stage-en-sciences-infirmieres` à
`stagiaire-de-formation-ou-de-recherche-3e-cycle`.

**La population est donc de 1 088.** L'échantillon de 110 a été tiré du premier millier
uniquement ; les 88 slugs de la page 1 ne sont pas représentés dans la base de sondage.

**Cela ne déplace pas le résultat**, et la raison est mesurée : les 88 se décomposent en
**84 `stage-postdoctoral-*`**, 3 `stagiaire-de-formation-ou-de-recherche-*` et 1
`stage-en-sciences-infirmieres`. Les stages postdoctoraux sont la seule famille mesurée à
**0 % d'exploitabilité** (4/4 vides dans l'échantillon). Ces 88 slugs apportent donc ~0 programme
utile : l'estimation de ~545 pages exploitables et ~964 chemins tient telle quelle, elle porte
simplement sur 1 088 slugs au lieu de 1 000.

---

## 2. Combien ont une page de structure exploitable ?

**Le statut HTTP ne discrimine rien.** Les 110 URL de l'échantillon répondent **200** (borne
inférieure IC95 : 96,7 %). TYPO3 rend la route pour n'importe quel slug de programme valide,
même quand la page ne contient aucun cours. Un `HEAD` aurait donné « 100 % ont une structure » —
une réponse fausse. Le tri doit se faire sur le **contenu**.

Critère retenu : nombre de **codes de cours uniques** (`[A-Z]{3} ?[0-9]{4}`) présents dans le HTML.
Étalonné sur trois témoins : page 404 = 0 code / 152 605 o ; `acces-fac` = 15 codes / 185 096 o ;
`baccalaureat-en-mathematiques` = 117 codes / 1 278 096 o.

| Tranche | n/110 | % | IC95 | Extrapolé sur la base de sondage (1 000) |
|---|---|---|---|---|
| **≥ 10 cours — exploitable** | 60 | **54,5 %** | 45,8–63,0 | **545** (458–630) |
| 1 à 9 cours — marginal | 16 | 14,5 % | — | ~145 |
| **0 cours — page vide** | 34 | **30,9 %** | 23,5–39,6 | **309** (235–396) |

L'extrapolation porte sur les 1 000 slugs de la base de sondage, pas sur les 1 088 de la population :
les 88 slugs de la page 1 ne sont pas représentés dans l'échantillon et leur composition
(84 stages postdoctoraux) interdit de leur appliquer le taux global. En leur attribuant le taux
mesuré de leur propre famille — 0 % — le total sur 1 088 reste **~545**, et le nombre de pages vides
monte à ~397.

Les pages vides ne sont pas réparties au hasard : **21 des 34 sont des `des-*`** (diplômes d'études
spécialisées en médecine) et **4 sont des stages postdoctoraux**. Ces deux familles sont vides à
100 % dans l'échantillon (n=21 et n=4). Hors médecine et postdoc, il ne reste que 9 pages vides
sur 110, par exemple `communication-politique`, `baccalaureats-en-gestion-des-ressources-humaines`
(une page de *famille*, au pluriel), `doctorat-en-etudes-allemandes`.

---

## 3. Répartition par type

Recensement des **1 088 slugs** par préfixe (aucune requête), croisé avec le taux d'exploitabilité
mesuré sur l'échantillon.

| Type | Recensés /1088 | n échant. | ≥10 cours | Exploitables estimés |
|---|---|---|---|---|
| microprogramme | 153 | 11 | 36,4 % | ~56 |
| **des-* (spécialités médicales)** | 148 | 21 | **0 %** | **~0** |
| maîtrise | 142 | 17 | 100 % | ~142 |
| **stage postdoctoral** | 130 | 4 | **0 %** | **~0** |
| baccalauréat | 123 | 13 | 84,6 % | ~104 |
| doctorat | 87 | 11 | 72,7 % | ~63 |
| DESS | 71 | 10 | 40,0 % | ~28 |
| mineure | 58 | 7 | 85,7 % | ~50 |
| certificat | 55 | 6 | 100 % | ~55 |
| autre | 49 | 5 | 20,0 % | ~10 |
| majeure | 40 | 2 | 100 % | ~40 |
| qualification | 12 | 3 | 33,3 % | ~4 |
| diplôme | 9 | 0 | — | non mesuré |
| depa-* (médecine) | 9 | 0 | — | non mesuré |
| année préparatoire | 2 | 0 | — | non mesuré |

Les sous-totaux par type reposent sur de petits n (2 à 21) ; leurs intervalles sont larges.
Seul le total global (545, IC 458–630) est solide. Les 88 slugs de la page 1 du sitemap gonflent la
ligne « stage postdoctoral » de 46 à 130 sans rien ajouter d'exploitable.

**Le gisement à exclure d'emblée : 148 `des-*` + 130 stages postdoctoraux = 278 slugs, soit 26 % de
la liste, pour un rendement mesuré nul.** Les écarter fait tomber le scrape utile à 810 pages.

---

## 4. Premier cycle contre cycles supérieurs

| Cycle | Recensés /1088 | n échant. | ≥10 cours | IC95 |
|---|---|---|---|---|
| 1er cycle | 330 | 32 | **81,3 %** | 64,7–91,1 |
| 2e cycle | 316 | 33 | **72,7 %** | 55,8–84,9 |
| 3e cycle et + | 379 | 37 | **21,6 %** | 11,4–37,2 |
| indéterminé | 63 | 8 | 25,0 % | 7,1–59,1 |

C'est le point de décision le plus net du rapport. **Se limiter au 1er cycle** : 330 slugs, ~268
exploitables, **13 minutes de scrape**. **1er + 2e cycle** : 646 slugs, ~498 exploitables, **25
minutes**. Le 3e cycle coûte 379 requêtes pour ~82 pages utiles — c'est là que se concentre le
gaspillage, et c'est aussi la partie la moins pertinente pour un planificateur de bacc.

Les 88 slugs de la page 1 du sitemap tombent tous dans la ligne « 3e cycle et + », ce qui la fait
passer de 295 à 379 sans changer le taux mesuré : ils aggravent le déséquilibre plutôt que de
le corriger.

---

## 5. Formes de slug surprenantes

**Doublons de campus — 22 slugs, 11 familles.** `campus-montreal` (10), `campus-laval` (9),
`campus-brossard` (3). Les 1 088 slugs se réduisent à 1 077 troncs distincts. Ce sont de vrais
programmes distincts (grilles différentes selon le campus), pas des doublons à dédupliquer, mais
le modèle de données doit porter le campus comme attribut. Exemples : `mineure-en-psychologie`,
`baccalaureat-en-travail-social`, `maitrise-en-psychoeducation`.

**Collisions de slug TYPO3 — 11 cas sur les 1 088.** Un slug numéroté coexiste avec son tronc nu,
ce qui trahit un doublon d'édition, pas deux programmes :
`des-en-medecine-veterinaire-2`, `des-en-sciences-cliniques-veterinaires-1`,
`maitrise-en-statistique-1`, `maitrise-individualisee-1`, et sept `stage-postdoctoral-en-*-1`
(géographie, histoire, hygiène, musicologie, psychologie, santé publique, théologie).
**À dédupliquer.** La page 1 du sitemap en ajoute 5 à elle seule — encore des stages postdoctoraux.

**Numérotés légitimes — 7 cas.** Pas de tronc nu, ce sont de vrais programmes distincts :
`certificat-de-traduction-1` / `-2`, `mineure-en-sciences-infirmieres-pratique-infirmiere-1` / `-2`, etc.

**Pages de famille au pluriel — 2 cas.** `baccalaureats-en-gestion-des-ressources-humaines` et
`baccalaureats-4-ans-udem`. Le premier est dans l'échantillon : **0 cours**. Ce sont des pages
d'aiguillage, pas des programmes.

**Non-programmes.** `acces-fac`, `complements-de-formation`, `etudes-libres-*` (6 variantes),
`stage-de-formation-ou-de-recherche`. Ils ont une page de structure mais ne décrivent pas un
cursus au sens du planificateur.

---

## 6. Orientations : le nombre de programmes dépasse le nombre de pages

**Oui, c'est courant, et c'est mesuré.** La structure HTML est explicite et facile à parser :

```html
<h3 id="segment-0">Segment 01 Commun aux sept orientations</h3>
<h3 id="segment-1">Segment 75 Propre à l'orientation Actuariat</h3>
<h3 id="segment-2">Segment 76 Propre à l'orientation Actuariat COOP</h3>
```

**19 pages sur 110 (17,3 %, IC 11,7–25,0) portent au moins une orientation**, avec une moyenne de
**3,5 orientations** sur les pages concernées, jusqu'à 10.

Sur les 60 pages exploitables de l'échantillon, le décompte en *chemins* (une page sans orientation
compte 1 ; une page à k orientations compte k) donne **106 chemins pour 60 pages, soit un facteur
1,77×**.

> **~545 pages exploitables portent ~964 chemins de programme distincts.**

Distribution du nombre d'orientations, pages concernées uniquement :
1 orientation (2 pages), 2 (4), 3 (7), 4 (3), 6 (1), 7 (1), 10 (1).

Têtes de liste : `internat-de-perfectionnement-en-sciences-appliquees-veterinaires` (10 orientations,
196 cours), `baccalaureat-en-mathematiques` (7, conforme au brief), `doctorat-en-litterature` (6),
`doctorat-de-1er-cycle-en-medecine-veterinaire` (4, 203 cours).

Attention : **`segments` et `orientations` ne se confondent pas.** 59 pages ont au moins un segment
sans aucune orientation — le cas ordinaire est un segment unique qui porte tous les cours. La
majorité des pages à contenu (53 sur 76) n'ont **qu'un seul** segment.

En revanche, le segment est un ancrage fiable : dans le passage propre, **aucune page ayant au
moins un cours n'est dépourvue de segment** (0 cas sur 76). L'inverse existe mais est rare :
2 pages ont un segment et zéro cours. Un parseur peut donc s'appuyer sur `<h3 id="segment-N">`
comme unité de découpage.

---

## 7. Temps de scrape révisé

### Passe « programmes »

Mesuré sur les 110 requêtes : **0,28 s en moyenne** par page (médiane 0,23 s), **239 Ko** par page.

| Délai entre requêtes | s/page | 1 088 pages | 894 (sans médecine/postdoc) | 330 (1er cycle) |
|---|---|---|---|---|
| 1 s | 1,28 | 23 min | 19 min | 7 min |
| **2 s (recommandé)** | **2,28** | **41 min** | **34 min** | **13 min** |
| 3 s | 3,28 | 59 min | 49 min | 18 min |

Volume : **~0,25 Go** pour 1 088 pages.

### Passe « cours » — le poste dominant

**11 888 cours**, vérifiés ici : les 12 sous-sitemaps `cours` donnent 11 × 1 000 + 888 URL, et leur
**union distincte vaut exactement 11 888, sans un seul doublon**.

Échantillon de 12 pages de cours tirées au hasard : **1,45 s** en moyenne (médiane 1,40 s,
min 0,15 s, max 3,12 s), **151 Ko** par page. Les pages de cours sont donc **cinq fois plus lentes**
que les pages de programme — l'hypothèse naturelle qu'elles seraient plus légères est fausse.

| Délai | s/page | 11 888 cours | Total avec les programmes |
|---|---|---|---|
| 0,5 s | 1,95 | 6,5 h | 6,7 h |
| 1 s | 2,45 | 8,1 h | 8,5 h |
| **2 s** | **3,45** | **11,4 h** | **12,1 h** |
| 3 s | 4,45 | 14,7 h | 15,7 h |

Volume : **~1,7 Go** pour les cours.

> Estimation à n=12, avec une forte dispersion (0,15 s à 3,12 s) : à prendre comme un ordre de
> grandeur, pas comme un chiffre serré. Un budget calculé sur le seul délai, en ignorant le temps
> de réponse, sous-estime d'environ 40 % (6,6 h au lieu de 11,4 h à 2 s).

**Conséquence pratique : la passe « cours » ne tient pas dans une session interactive.** Elle doit
être reprenable, avec un cache sur disque et une reprise après interruption. C'est là qu'il faut
investir, pas dans l'optimisation des 41 minutes de la passe « programmes ».

**Recommandation : 2 secondes, séquentiel, aucun parallélisme.** Le raisonnement : le serveur répond
en 0,28 s, donc 2 s de délai le laisse inoccupé 88 % du temps — un rapport de charge d'environ 1
pour 8. C'est plus prudent que le `Crawl-delay: 1` que la plupart des sites universitaires
publieraient, et `robots.txt` n'impose ici aucune contrainte hors `/fileadmin/fichiers/premium/`.
Le coût de cette prudence est de 17 minutes sur la course complète — négligeable. Descendre à 1 s
reste défendable ; monter à 3 s n'achète rien.

**L'estimation « 3 à 4 heures » du brief était en fait trop optimiste d'un facteur ~3** pour le
scrape complet : ~12,1 h à 2 s de délai. Elle avait le bon ordre de grandeur pour le nombre de pages
(~13 000) mais supposait des pages uniformément rapides. Ce sont les 11 888 pages de cours à 1,45 s
qui dominent le budget — la passe « programmes », elle, tient bien en moins d'une heure.

---

## 8. Non vérifié

Ce qui suit n'a **pas** été mesuré. Aucun chiffre de ce rapport n'en dépend.

- **L'exploitabilité des 88 slugs de la page 1 du sitemap.** Ils sont dans la population mais pas
  dans la base de sondage : aucun des 110 tirages n'en provient. Leur composition est connue
  (84 stages postdoctoraux, 3 stagiaires, 1 stage), et la famille « stage postdoctoral » est
  mesurée à 0 % sur n=4 — mais aucun de ces 88 n'a été ouvert individuellement.
- **Le contenu des pages de cours.** Les 12 pages échantillonnées ont servi à mesurer le temps de
  réponse et la taille, rien d'autre : ni structure, ni préalables, ni crédits n'ont été extraits.
- **Les libellés de type du §3** sont déduits du préfixe du slug, pas lus dans la page. Le
  comportement très tranché par famille (0 % pour `des-*`, 100 % pour `maitrise`) est cohérent avec
  ces étiquettes, mais aucune page n'a été ouverte pour confirmer qu'un slug `maitrise-*` est bien
  une maîtrise.
- **Les types `diplome` (9), `depa-medical` (9) et `annee-preparatoire` (2)** n'ont aucun tirage
  dans l'échantillon ; leur taux d'exploitabilité est inconnu. (`annee-preparatoire` a été testé
  hors échantillon : 29 cours, 3 segments.)
- **La qualité du contenu.** « ≥ 10 codes de cours » mesure la présence de cours, pas
  l'exactitude des crédits, des préalables ou des blocs. Aucun cours n'a été extrait ni validé.
- **La stabilité dans le temps.** Une seule mesure, le 2026-09-11.

---

## 9. Méthode et incidents

**Instrument.** `curl` séquentiel, `User-Agent` identifiant le projet et une adresse de contact,
2 s entre requêtes, redirections non suivies. Extraction par `grep` sur le HTML brut :
codes de cours `\b[A-Z]{3}[ -]?[0-9]{4}[A-Z]?\b` dédoublonnés ; segments via
`<h3 id="segment-[0-9]+">` ; orientations = segments dont le titre contient `Propre`.

**Échantillonnage.** 110 slugs tirés sans remise parmi les 1 000 de la page 0 du sitemap,
`srand(20260911)`, reproductible. Intervalles de Wilson à 95 %, correction de population finie
`√((N−n)/(N−1))` = 0,944 avec N = 1 000. La base de sondage couvre 92 % de la population de 1 088 ;
les 88 slugs non couverts sont décrits au §1.

**Quatre incidents.** Les trois premiers ont été corrigés avant publication ; le quatrième ne l'a
pas été et a dû être rattrapé après coup. Ils sont consignés parce qu'ils ont chacun failli
produire — ou ont effectivement produit — un chiffre confiant et faux :

1. **`curl -X HEAD` sans `-I`** — curl attend un corps que le serveur n'envoie jamais. La sonde
   se bloquait à 120 s. Remplacé par `-I`.
2. **Mauvais sélecteur de segment** — la première version cherchait `<h2>`, alors que le balisage
   est `<h3 id="segment-N">`, et comparait `Propre à` avec un `.` là où `à` occupe deux octets dans
   cette locale. L'extraction renvoyait **0 segment et 0 orientation sur toutes les pages, y compris
   le bacc en mathématiques** dont on savait qu'il en a sept. Détecté en validant l'instrument sur
   un témoin connu.
3. **Course entre processus** — un premier passage signalé « tué » par le système ne l'était pas ;
   douze boucles `bash` ont continué en parallèle et écrasé mutuellement un fichier temporaire
   partagé. Résultat : 158 lignes pour seulement 94 slugs distincts, avec 50 contradictions sur
   `segments`/`orientations`. La colonne `codes` était identique dans **toutes** les comparaisons
   de doublons (0 désaccord sur 64) — donc non touchée — mais le jeu de données a quand même été **jeté et remesuré
   intégralement** en un passage sérialisé, sans état partagé. **Les chiffres de ce rapport
   proviennent exclusivement de ce passage propre** (110 lignes, 110 slugs distincts).
4. **Conclusion fausse sur le sitemap, publiée puis corrigée.** La première version affirmait que
   la chaîne de requête était « entièrement ignorée » et qu'il n'existait ni index ni pagination.
   Cinq variantes d'URL renvoyaient bien le même corps, mais l'inférence était fausse : l'index
   existe, la pagination existe, et la population est de 1 088. Erreur signalée par la session
   `adrie-31`, puis revérifiée ici avant réécriture.

   **La faute de méthode est précise et vaut d'être retenue.** Pour écarter l'hypothèse du cache,
   j'avais lu `X-Cache: MISS` et `Age: 0` — mais sur des URL `?nocache=<aléatoire>`, qui sont
   **MISS par construction**. Ce test ne pouvait rien réfuter : j'ai interrogé un instrument dont
   la réponse était garantie d'avance, et j'en ai tiré une conclusion négative. Le bon test est
   celui du §1 : demander la même ressource **avec** puis **sans** le `cHash` valide et comparer
   les corps.

   Ce qui reste **non établi** : pourquoi mes requêtes de l'époque renvoyaient le corps
   *programmes* plutôt que le corps *index*. Le mécanisme du `cHash`, mesuré aujourd'hui, fait
   servir l'**index** quand le jeton manque — il n'explique donc pas à lui seul ce que j'ai
   observé. Je n'ai pas d'explication vérifiée à proposer et je n'en invente pas.

**Charge imposée au serveur.** ~350 requêtes au total : 158 pendant l'incident de concurrence,
110 pour le passage propre, 24 sous-sitemaps et 12 pages de cours pour la vérification du §1 et du
§7, plus une trentaine de sondes. Étalées sur environ 40 minutes. À noter : une autre session Claude exécutait `npm run scrape` sur le même hôte pendant la
mesure. Les temps de réponse relevés (0,28 s) intègrent donc cette charge concurrente — ils sont
si loin de toute saturation que la conclusion ne change pas, mais un scrape de production devrait
s'assurer qu'une seule session tourne à la fois.
