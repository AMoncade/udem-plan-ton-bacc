# Inventaire des programmes UdeM — volume réel à scraper

Mesuré le 2026-09-11 sur `admission.umontreal.ca`.
Échantillon aléatoire de 110 slugs (graine `20260911`, tirage reproductible), base de sondage
de 1 000 slugs, intervalles de Wilson à 95 % avec correction de population finie.

---

## Réponse courte

**~545 pages exploitables sur 1 000** (IC95 : 458–630), et non ~1 088.
Elles portent **~964 chemins de programme distincts** grâce aux orientations, soit **1,77 fois**
plus de programmes que de pages.

**Le scrape complet des 1 000 pages prend 38 minutes à 2 s de délai**, pas 3 à 4 heures.
Le facteur qui domine n'est pas le nombre de pages, c'est que le serveur répond en 0,28 s en moyenne.

Trois corrections aux prémisses du brief, chacune mesurée :

| Prémisse du brief | Ce que la mesure donne |
|---|---|
| 1 088 programmes listés sur deux pages de sitemap | **Le sitemap n'en sert que 1 000.** La pagination n'existe plus (voir §1) |
| Certains programmes n'ont pas de page `/structure-du-programme/` | **Tous en ont une. 110/110 répondent 200.** Le tri se fait sur le contenu, pas sur le statut HTTP |
| `acces-fac` et `annee-preparatoire` n'ont manifestement pas de structure | **Faux, les deux en ont une** : 15 cours / 1 segment et 29 cours / 3 segments |

---

## 1. La base de sondage est de 1 000, pas 1 088

`https://admission.umontreal.ca/sitemap.xml` renvoie aujourd'hui **un `<urlset>` unique de
1 000 URL de programmes** — pas un index de 16 sous-sitemaps.

La chaîne de requête est **entièrement ignorée**. Vérifié sur cinq variantes qui renvoient toutes
le même corps, octet pour octet (MD5 `c739517a1b071eef1a28068996baa288`, 269 166 octets) :

- `?sitemap=programmes&page=0` et `&page=1`
- `?sitemap=pages` (une catégorie différente — même réponse)
- `?type=1533906435` (la route sitemap TYPO3)
- `/?type=1533906435&sitemap=programmes&page=1`

Ce n'est **pas** un effet de cache (`X-Cache: MISS`, `Age: 0` sur des requêtes anti-cache) ni un
filtrage par *user-agent* (un UA Chrome donne le même corps). `/sitemap-programmes-1.xml` renvoie 404.
`robots.txt` ne déclare aucun sitemap.

La liste est triée alphabétiquement et s'arrête net à `stage-postdoctoral-en-hygiene` : le plafond
de 1 000 coupe la queue `st…` → `z…`. Les ~88 slugs manquants du décompte de 1 088 sont donc
probablement réels mais **invisibles depuis le sitemap**, et ils sont concentrés en fin d'alphabet
(`stage-postdoctoral-*`, `technologie*`, `theologie*`, `toxicologie*`, `traduction*`, `urbanisme*`,
`virologie*`…). Cette queue est **fortement biaisée vers les stages postdoctoraux**, qui sont la
catégorie la moins exploitable (0 % dans l'échantillon). **Les chiffres ci-dessous portent sur les
1 000 slugs observés.**

> Pour récupérer les ~88 manquants, il faudra une autre source que le sitemap : l'index A–Z du site,
> ou le répertoire officiel des programmes. Non exploré ici.

---

## 2. Combien ont une page de structure exploitable ?

**Le statut HTTP ne discrimine rien.** Les 110 URL de l'échantillon répondent **200** (borne
inférieure IC95 : 96,7 %). TYPO3 rend la route pour n'importe quel slug de programme valide,
même quand la page ne contient aucun cours. Un `HEAD` aurait donné « 100 % ont une structure » —
une réponse fausse. Le tri doit se faire sur le **contenu**.

Critère retenu : nombre de **codes de cours uniques** (`[A-Z]{3} ?[0-9]{4}`) présents dans le HTML.
Étalonné sur trois témoins : page 404 = 0 code / 152 605 o ; `acces-fac` = 15 codes / 185 096 o ;
`baccalaureat-en-mathematiques` = 117 codes / 1 278 096 o.

| Tranche | n/110 | % | IC95 | Extrapolé /1000 |
|---|---|---|---|---|
| **≥ 10 cours — exploitable** | 60 | **54,5 %** | 45,8–63,0 | **545** (458–630) |
| 1 à 9 cours — marginal | 16 | 14,5 % | — | ~145 |
| **0 cours — page vide** | 34 | **30,9 %** | 23,5–39,6 | **309** (235–396) |

Les pages vides ne sont pas réparties au hasard : **21 des 34 sont des `des-*`** (diplômes d'études
spécialisées en médecine) et **4 sont des stages postdoctoraux**. Ces deux familles sont vides à
100 % dans l'échantillon (n=21 et n=4). Hors médecine et postdoc, il ne reste que 9 pages vides
sur 110, par exemple `communication-politique`, `baccalaureats-en-gestion-des-ressources-humaines`
(une page de *famille*, au pluriel), `doctorat-en-etudes-allemandes`.

---

## 3. Répartition par type

Recensement des **1 000 slugs** par préfixe (aucune requête), croisé avec le taux d'exploitabilité
mesuré sur l'échantillon.

| Type | Recensés /1000 | n échant. | ≥10 cours | Exploitables estimés |
|---|---|---|---|---|
| microprogramme | 153 | 11 | 36,4 % | ~56 |
| **des-* (spécialités médicales)** | 148 | 21 | **0 %** | **~0** |
| maîtrise | 142 | 17 | 100 % | ~142 |
| baccalauréat | 123 | 13 | 84,6 % | ~104 |
| doctorat | 87 | 11 | 72,7 % | ~63 |
| DESS | 71 | 10 | 40,0 % | ~28 |
| mineure | 58 | 7 | 85,7 % | ~50 |
| certificat | 55 | 6 | 100 % | ~55 |
| **stage postdoctoral** | 46 | 4 | **0 %** | **~0** |
| autre | 45 | 5 | 20,0 % | ~9 |
| majeure | 40 | 2 | 100 % | ~40 |
| qualification | 12 | 3 | 33,3 % | ~4 |
| diplôme | 9 | 0 | — | non mesuré |
| depa-* (médecine) | 9 | 0 | — | non mesuré |
| année préparatoire | 2 | 0 | — | non mesuré |

Les sous-totaux par type reposent sur de petits n (2 à 21) ; leurs intervalles sont larges.
Seul le total global (545, IC 458–630) est solide.

**Le gisement à exclure d'emblée : 148 `des-*` + 46 stages postdoctoraux = 194 slugs, soit 19 % de
la liste, pour un rendement mesuré nul.** Les écarter fait tomber le scrape utile à 806 pages.

---

## 4. Premier cycle contre cycles supérieurs

| Cycle | Recensés /1000 | n échant. | ≥10 cours | IC95 |
|---|---|---|---|---|
| 1er cycle | 330 | 32 | **81,3 %** | 64,7–91,1 |
| 2e cycle | 316 | 33 | **72,7 %** | 55,8–84,9 |
| 3e cycle et + | 295 | 37 | **21,6 %** | 11,4–37,2 |
| indéterminé | 59 | 8 | 25,0 % | 7,1–59,1 |

C'est le point de décision le plus net du rapport. **Se limiter au 1er cycle** : 330 slugs, ~268
exploitables, **13 minutes de scrape**. **1er + 2e cycle** : 646 slugs, ~498 exploitables, **25
minutes**. Le 3e cycle coûte 295 requêtes pour ~64 pages utiles — c'est là que se concentre le
gaspillage, et c'est aussi la partie la moins pertinente pour un planificateur de bacc.

---

## 5. Formes de slug surprenantes

**Doublons de campus — 22 slugs, 11 familles.** `campus-montreal` (10), `campus-laval` (9),
`campus-brossard` (3). Les 1 000 slugs se réduisent à 989 troncs distincts. Ce sont de vrais
programmes distincts (grilles différentes selon le campus), pas des doublons à dédupliquer, mais
le modèle de données doit porter le campus comme attribut. Exemples : `mineure-en-psychologie`,
`baccalaureat-en-travail-social`, `maitrise-en-psychoeducation`.

**Collisions de slug TYPO3 — 6 cas.** Un slug numéroté coexiste avec son tronc nu, ce qui trahit
un doublon d'édition, pas deux programmes :
`des-en-medecine-veterinaire-2`, `des-en-sciences-cliniques-veterinaires-1`,
`maitrise-en-statistique-1`, `maitrise-individualisee-1`, `stage-postdoctoral-en-geographie-1`,
`stage-postdoctoral-en-histoire-1`. **À dédupliquer.**

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

Mesuré sur les 110 requêtes : **0,28 s en moyenne** par page (médiane 0,23 s), **239 Ko** par page.

| Délai entre requêtes | s/page | 1 000 pages | 806 (sans médecine/postdoc) | 330 (1er cycle) |
|---|---|---|---|---|
| 1 s | 1,28 | 21 min | 17 min | 7 min |
| **2 s (recommandé)** | **2,28** | **38 min** | **31 min** | **13 min** |
| 3 s | 3,28 | 55 min | 44 min | 18 min |

Volume total : **~0,23 Go** pour 1 000 pages.

**Recommandation : 2 secondes, séquentiel, aucun parallélisme.** Le raisonnement : le serveur répond
en 0,28 s, donc 2 s de délai le laisse inoccupé 88 % du temps — un rapport de charge d'environ 1
pour 8. C'est plus prudent que le `Crawl-delay: 1` que la plupart des sites universitaires
publieraient, et `robots.txt` n'impose ici aucune contrainte hors `/fileadmin/fichiers/premium/`.
Le coût de cette prudence est de 17 minutes sur la course complète — négligeable. Descendre à 1 s
reste défendable ; monter à 3 s n'achète rien.

**L'estimation « 3 à 4 heures » du brief était trop pessimiste d'environ un facteur 5.** Elle
supposait ~13 000 pages (programmes + cours). Pour les seules pages de programme, le budget réel
est inférieur à l'heure.

---

## 8. Non vérifié

Ce qui suit n'a **pas** été mesuré. Aucun chiffre de ce rapport n'en dépend.

- **Les 11 888 cours.** `?sitemap=cours` est ignoré comme toutes les autres variantes de chaîne de
  requête ; le décompte des cours n'a pas pu être reproduit ni infirmé. **Le budget temps de la
  passe « cours » reste inconnu** et c'est de loin le plus gros poste du scrape total.
- **Les ~88 slugs au-delà du plafond de 1 000.** Absents de la base de sondage. Vu le tri
  alphabétique, ils sont probablement à dominante `stage-postdoctoral-*`, donc à rendement faible,
  mais ce n'est pas mesuré.
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

**Échantillonnage.** 110 slugs tirés sans remise parmi 1 000, `srand(20260911)`, reproductible.
Intervalles de Wilson à 95 %, correction de population finie `√((N−n)/(N−1))` = 0,944.

**Trois incidents, corrigés avant de produire un chiffre.** Ils sont consignés parce qu'ils ont
chacun failli produire un rapport confiant et faux :

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

**Charge imposée au serveur.** ~290 requêtes au total (158 pendant l'incident de concurrence,
110 pour le passage propre, une vingtaine de sondes et de sitemaps), étalées sur environ 25 minutes. À noter : une autre session Claude exécutait `npm run scrape` sur le même hôte pendant la
mesure. Les temps de réponse relevés (0,28 s) intègrent donc cette charge concurrente — ils sont
si loin de toute saturation que la conclusion ne change pas, mais un scrape de production devrait
s'assurer qu'une seule session tourne à la fois.
