# Le contrat de données survit-il à d'autres programmes de l'UdeM ?

**Réponse courte : non.** Le modèle tient sur la *forme générale* — « un programme =
des segments, des blocs, une règle de crédits par bloc, une liste de codes » est
vrai partout où j'ai regardé. Mais quatre de ses détails sont faux en dehors de
l'orientation actuariat, et deux d'entre eux sont faux **sur la page même du
baccalauréat en mathématiques**, à quelques segments de notre cas :

1. `RegleBloc` ne couvre que 4 des **9** formes de règles réellement écrites.
2. `Bloc.id` n'est pas unique dans un programme et `segment` ne se déduit pas de `id`
   (`MM-Bloc 73A` / `S-Bloc 73A`).
3. `CodeCours` n'est pas « trois lettres + quatre chiffres » : suffixes de lettre
   (≈ 200 des 1 031 codes relevés) et numéros à **cinq** chiffres.
4. `Programme` n'a aucun endroit pour les totaux par type de crédits — or c'est
   précisément la donnée que `docs/CONTRAT.md` appelle « le coeur du projet », et
   ailleurs ce sont des **intervalles** couplés, pas des nombres.

Et le chevauchement existe : en droit, le bloc 70K est un **sous-ensemble** du bloc
70L. L'attribution des cours aux blocs y est un problème d'affectation sous bornes,
pas un comptage.

---

## Programmes examinés

Tout consulté le **2026-09-10**. Pages de structure (7 requêtes) et 24 fiches de
cours, espacées de 1,5 s. `robots.txt` n'interdit que `/fileadmin/fichiers/premium/`.

| Programme | Ce qu'il apporte au test | URL |
|---|---|---|
| Baccalauréat en mathématiques — 7 orientations, dont **Actuariat COOP** (segments 01+76) | voisin direct ; COOP avec stages ; une orientation sans aucun bloc obligatoire (82) | `https://admission.umontreal.ca/programmes/baccalaureat-en-mathematiques/structure-du-programme/` |
| Baccalauréat en droit (LL. B.), 101 cr. | autre faculté ; cheminement honor ; **chevauchement de blocs** | `https://admission.umontreal.ca/programmes/baccalaureat-en-droit/structure-du-programme/` |
| Baccalauréat en psychologie (campus Montréal), 90 cr. | autre faculté ; cheminement honor ; bloc de langues ; codes à 5 chiffres | `https://admission.umontreal.ca/programmes/baccalaureat-en-psychologie-campus-montreal/structure-du-programme/` |
| Baccalauréat en musique, 90 cr. | autre faculté ; 5 segments ; auditions, tests de classement ; 152 codes suffixés | `https://admission.umontreal.ca/programmes/baccalaureat-en-musique/structure-du-programme/` |
| Baccalauréat en économie et politique, 90 cr. | **bidisciplinaire** : quota par sigle, exclusion par sigle | `https://admission.umontreal.ca/programmes/baccalaureat-en-economie-et-politique/structure-du-programme/` |
| Maîtrise en mathématiques, 45 cr. | **cycles supérieurs** : mémoire, stage, cours hors UdeM, identifiants de blocs préfixés | `https://admission.umontreal.ca/programmes/maitrise-en-mathematiques/structure-du-programme/` |
| Certificat en droit, 30 cr. | **certificat** : 3 orientations, contrainte de séquence | `https://admission.umontreal.ca/programmes/certificat-en-droit/structure-du-programme/` |

Fiches de cours consultées (délibérément **hors** ACT, MAT, STT, IFT, ECN, DMO, pour
ne pas refaire le relevé de la session scraper) : ANG 1903, BIO 2041, CHM 1301,
CRI 1600G, CRI 3318, DRT 1151G, DRT 3910, DRT 3940, DRT 3999, GEO 2122, MTE 1100,
MUI 1162A, MUS 1213, MUS 4000, PHY 2215, POL 1803, POL 3240, POL 3241, POL 3904,
PSY 2007, PSY 3204, PSY 40002, SOL 2020. (PHI 2015 → HTTP 404, ce code n'existe pas.)

---

## 1. Règles de crédits hors des trois formes — **le modèle casse**

### 1a. Cinq formes de règle de bloc que `RegleBloc` ne sait pas écrire

J'ai relevé **toutes** les lignes de règle des 7 pages, numéros masqués. Il y en a
neuf formes distinctes :

```
Obligatoire - N crédits.                        <- couverte
Option - Maximum N crédits.                     <- couverte
Option - Minimum N crédits, maximum N crédits.  <- couverte
Choix - N crédits.                              <- couverte
Option - N crédits.                             <- NON couverte
Option - maximum N crédits.                     <- NON couverte (minuscule)
Option - minimum N crédits, maximum N crédits.  <- NON couverte (minuscule)
Choix - Maximum N crédits.                      <- NON couverte
Choix - Minimum N crédits, maximum N crédits.   <- NON couverte
```

Citations, verbatim :

- **`Option - N crédits.`** — un nombre exact, sans minimum ni maximum. Trois
  occurrences, dont une sur notre propre page :
  - bacc. mathématiques, orientation Sciences mathématiques : `Bloc 82B Outils informatiques de base` / `Option - 4 crédits.`
  - bacc. droit : `Bloc 70K Formation pratique` / `Option - 3 crédits.`
  - bacc. droit : `Bloc 70W Cheminement honor` / `Option - 12 crédits.`
- **`Choix - Maximum N crédits.`** — cinq occurrences : `Bloc 70Z` / `Choix - Maximum 3 crédits.`
  (droit), idem pour 70Z/71Z/72Z du certificat en droit, `Bloc 71Z` / `Choix - Maximum 3 crédits.`
  (économie et politique), `Bloc 70B ...` / `Choix - Maximum 4 crédits.` et
  `Choix - Maximum 6 crédits.` / `Choix - Maximum 9 crédits.` (maîtrise).
- **`Choix - Minimum N crédits, maximum N crédits.`** — bacc. psychologie :
  `Bloc 71Z` / `Choix - Minimum 3 crédits, maximum 6 crédits.`
- **Minuscules** — bacc. économie et politique : `Bloc 71F Expérience pratique` /
  `Option - maximum 6 crédits.` ; `Bloc 71H Économie 1` / `Option - minimum 9 crédits, maximum 12 crédits.` ;
  maîtrise : `S-Bloc 73A Cheminement avec stage` / `Option - minimum 15 crédits, maximum 24 crédits.`
  Un parseur avec `/Minimum (\d+)/` y retourne `null` sans rien signaler.

À l'inverse : la forme `{ type: "option", min: 12, max: null }` que le contrat
autorise **n'apparaît nulle part** dans mon échantillon. Aucun bloc n'a de minimum
sans maximum.

### 1b. Une règle portant sur un nombre de COURS, à travers DEUX blocs

Bacc. mathématiques, segment 79 (orientation Statistique), texte placé entre le
total du segment et le premier bloc :

> « Afin d'obtenir l'accréditation de la Société statistique du Canada au niveau
> A-Stat, l'étudiant doit prendre trois cours du bloc 79 H ou du bloc 79 Y dans la
> même discipline. »

Et le segment 80 (Statistique COOP) :

> « Les étudiants doivent aussi réussir un stage hors programme MAT 3001 (Stage 3).
> Afin d'obtenir l'accréditation de la Société statistique du Canada au niveau
> A-Stat, l'étudiant doit prendre trois cours du bloc 80H ou du bloc 80 Y dans la
> même discipline. »

C'est exactement la forme que tu soupçonnais : **un nombre de cours** (« trois
cours »), **une portée multi-blocs** (« du bloc 79 H ou du bloc 79 Y »), et **un
prédicat supplémentaire** (« dans la même discipline »). Noter au passage
l'orthographe des identifiants dans cette seule phrase : `79 H`, `80H`, `80 Y`.

Même genre en musique, `Bloc 01V Cheminement Honor` :

> « L'étudiant doit faire 12 crédits pour compléter le cheminement Honor, lesquels
> se répartissent comme suit :
> - 2 ou 3 séminaires choisis dans la banque de séminaires offerts du deuxième cycle ;
> - 1 ou 2 travaux dirigés (20 à 30 pages chacun) sous la direction d'un professeur. »

### 1c. Une règle conditionnelle au cheminement, dans le bloc lui-même

Bacc. droit, `Bloc 70W Cheminement honor` / `Option - 12 crédits.`, suivi de :

> « Cheminement régulier : 0 crédit
> Cheminement Honor : 12 crédits »

Bacc. psychologie, `Bloc 71V Propre au cheminement honor` / `Option - Maximum 9 crédits.`,
suivi de :

> « Cheminement régulier: 0 crédit; cheminement honor : 9 crédits.
> (Pour compléter le cheminement honor, les étudiants devront avoir aussi réussi les
> cours PSY 2007 et PSY 3204 du bloc 71K). »

La règle du bloc dépend donc d'un attribut de l'étudiant, et la seconde impose en
plus deux cours nommés **d'un autre bloc**. `RegleBloc` n'a aucune place pour ça.

### 1d. Un quota par sigle de discipline, qui traverse tous les blocs

Bacc. économie et politique (bidisciplinaire), segment 71 :

> « Ce programme totalise 27 crédits de cours obligatoire, un minimum de 60 crédits
> à option et un maximum de 3 crédits au choix. Quels que soient les cours à option
> choisis, 33 crédits de cours POL et 33 crédits de cours ECN devront avoir été
> complétés, incluant les cours obligatoires. »

Et dans l'en-tête du programme : « Le baccalauréat comporte 90 crédits, dont
minimalement 33 en science politique et 33 en sciences économiques. »

C'est une contrainte sur le **préfixe du code de cours**, globale au programme. Un
audit bloc-par-bloc, même corrigé pour les totaux par type, la rate complètement.

### 1e. Une exigence par DOMAINE, ni bloc ni liste de codes

Maîtrise en mathématiques, segment 70 (Mathématiques pures), juste après le total
du segment :

> « Au moins 3 crédits de cours de niveau des études supérieures dans trois des
> domaines suivants : algèbre, analyse, théorie des nombres, topologie, géométrie,
> probabilités. »

Segment 71 (Mathématiques appliquées), même forme avec une autre liste de domaines
(« algèbre, analyse, analyse numérique, équations différentielles, probabilités,
biomathématiques, science des données »). Les « domaines » ne correspondent à aucun
bloc et à aucun sigle : l'information n'est pas sur la page.

### 1f. Un maximum imbriqué dans un bloc, sur une catégorie de cours

Maîtrise, `S-Bloc 73B Complément de formation et cours d'autres disciplines ou hors UdeM`
/ `Choix - Maximum 9 crédits.` :

> « Cours de cycles supérieurs d'autres disciplines ou d'autres universités et/ou un
> maximum de 6 crédits de cours de 1er cycle de sigle ACT, MAT ou STT et de 2e ou 3e
> année avec l'approbation du responsable de programme. »

Un plafond de 9 crédits pour le bloc, dont au plus 6 d'une sous-catégorie.

### 1g. Les totaux par type ne sont pas des nombres, ce sont des intervalles couplés

`Programme` n'a que `creditsTotal`. Il n'a **aucun champ** pour « 54 crédits
obligatoires, 33 crédits à option et 3 crédits au choix » — la donnée même dont
`docs/CONTRAT.md` dit qu'elle est « le coeur du projet ». Hors de l'actuariat, ce
ne sont d'ailleurs plus trois nombres :

- droit : « Les crédits du baccalauréat sont répartis de la façon suivante : 68
  crédits obligatoires, de 30 à 33 crédits à option et un maximum de 3 crédits au
  choix. » (et 101 crédits au total : l'intervalle d'option et le maximum au choix
  sont **couplés** par la somme)
- psychologie : « 45 crédits obligatoires, de 39 à 42 crédits à option et 3 à 6
  crédits au choix. » (90 au total : 45+39+6 = 45+42+3 = 90)
- certificat en droit, segments 70/71/72 : « 9 crédits obligatoires, de 6 à 9
  crédits à option et un maximum de 3 crédits au choix. »
- maîtrise, segment 73 : « - cheminement avec mémoire (MM) : 29 crédits obligatoires
  attribués à la recherche, de 10 à 16 crédits à option et un maximum de 6 crédits
  au choix. / - cheminement avec stage (S) : 21 crédits obligatoires attribués à un
  stage, de 15 à 24 crédits à option et un maximum de 9 crédits au choix. »

Et ces totaux sont énoncés **par segment**, pas par programme : musique écrit « Le
segment comporte 15 crédits obligatoires et un minimum de 30 crédits à option. »
(segment 01), « Le segment comporte un minimum de 6 crédits à option et 6 crédits au
choix. » (02), « L'Orientation comporte de 3 à 13 crédits à option. » (83).

---

## 2. Identifiants de blocs et de segments — **le modèle casse**

`Bloc.id` est documenté « « 01A », « 75C ». Unique dans un programme. » et
`Bloc.segment` « « 01 », « 75 » » — le code déduit le segment des deux premiers
caractères. Les deux affirmations sont fausses.

**Maîtrise en mathématiques, segment 73 (option Actuariat)** — les blocs sont
préfixés par le cheminement, et le même identifiant `73A` apparaît **deux fois dans
le même segment** :

> « MM-Bloc 73A Cheminement avec mémoire »
> « MM-Bloc 73B Complément de formation et cours d'autres disciplines ou hors UdeM »
> « MM-Bloc 73C Recherche et mémoire »
> « S-Bloc 73A Cheminement avec stage »
> « S-Bloc 73B Complément de formation et cours d'autres disciplines ou hors UdeM »
> « S-Bloc 73C Stage »

Conséquence concrète, vécue pendant cette enquête : mon premier extracteur ancré sur
`^Bloc ` a **silencieusement fusionné** les 58 cours du segment 73 dans le bloc 71C
de la maîtrise (« Obligatoire - 29 crédits », qui ne contient en réalité que
MAT 6916), et m'a fabriqué un faux chevauchement de 30 cours que j'ai failli
rapporter. C'est le repli muet que `CLAUDE.md` décrit : rien n'échoue, le résultat
est faux.

Dans les renvois en prose, les identifiants s'écrivent encore autrement : « du bloc
79 H ou du bloc 79 Y », « du bloc 80H ou du bloc 80 Y » (bacc. mathématiques), et en
droit « aux cours DRT1911 et DRT1912 du **bloc C** » — le bloc 70C désigné par sa
seule lettre.

Les identifiants de **segments** ne sont pas uniques entre programmes non plus : le
segment `71` existe en psychologie, en économie et politique, dans la maîtrise en
mathématiques et dans le certificat en droit, avec des blocs `71A` différents à
chaque fois. Ce n'est pas un problème tant que les blocs restent sous leur
`Programme`, mais toute table globale indexée par `idBloc` collisionne.

---

## 3. Blocs qui ne sont pas une liste de codes — **le modèle casse**

`Bloc.cours` est documenté « Codes normalisés. Vide pour un bloc « Choix »
(n'importe quel cours). » Quatre contre-exemples, dont un bloc **à option** vide :

**Un bloc à option dont le contenu est une catégorie, sans un seul code.**
Bacc. musique, `Bloc 02E Cours de langue` / `Option - Maximum 6 crédits.` —
aucun code de cours, seulement :

> « Les cours de langues peuvent être choisis parmi la liste des cours offerts par
> le Centre de langues de l'Université de Montréal : allemand, anglais, arabe,
> chinois, coréen, catalan, espagnol, grec moderne, innu, italien, japonais,
> portugais, russe et autres. Plusieurs niveaux sont offerts.
> Consultez l'information sur le site du Centre de langues »

Identique en économie et politique, `Bloc 71G Langues` / `Option - maximum 6 crédits.`
(même texte, zéro code). Avec le modèle actuel, ces blocs deviennent
`{ regle: option max 6, cours: [] }` : un bloc à option impossible à remplir.

Le même contenu est traité autrement ailleurs : en psychologie, `Bloc 71Y Ouverture
disciplinaire et cours de langues` / `Option - Minimum 3 crédits, maximum 15 crédits.`
porte ce **même paragraphe** *et* 164 codes explicites (ABK 1901, etc.). La
prose n'est donc pas redondante avec la liste : tantôt elle la complète, tantôt elle
la remplace.

**Un bloc dont le contenu inclut des cours hors UdeM et une plage de niveaux.**
Maîtrise, `Bloc 70B Complément de formation et cours d'autres disciplines ou hors UdeM`
/ `Choix - Maximum 4 crédits.` :

> « Cours de cycle supérieurs d'autres disciplines ou d'autres universités ou cours
> de 1er cycle de sigle MAT de 2e ou 3e année avec l'approbation du responsable de
> programme. »

C'est littéralement le « tout cours de niveau 3000 du département » que tu cherchais,
plus « d'autres universités », plus une autorisation.

**Un bloc « Choix » qui n'est pas « n'importe quel cours » — il est restreint.**
Bacc. économie et politique, `Bloc 71Z` / `Choix - Maximum 3 crédits.` :

> « Sauf exception autorisée, les cours au choix doivent être choisis parmi les cours
> identifiés par un sigle autre que les sigles ECN ou POL. »

Contrainte **négative** : un cours ECN ou POL placé au choix ne compte pas. Avec
`cours: []` interprété comme « n'importe quel cours », l'audit valide un parcours
qui ne diplôme pas.

Certificat en droit, blocs 70Z / 71Z / 72Z, `Choix - Maximum 3 crédits.` :

> « À choisir parmi les cours offerts à la Faculté ou ailleurs à l'Université. Ce
> choix est sujet à l'approbation du responsable du Certificat. »

**Une contrainte de séquence attachée au bloc.** Certificat en droit, `Bloc 01A` /
`Obligatoire - 12 crédits.` :

> « Les cours DRT 1151G Introduction à l'étude du droit, et DRT 1901G Développement
> des habiletés du juriste, doivent être suivis en début de programme, avant tout
> autre cours, ou de façon concomitante si l'étudiant est à temps plein. »

---

## 4. Structures que le modèle ignore complètement

Inventaire, chaque ligne avec sa citation.

**Cheminements mutuellement exclusifs.** Maîtrise, segment 73 : `MM-Bloc 73A/B/C`
(mémoire) et `S-Bloc 73A/B/C` (stage) décrivent deux parcours dont un seul
s'applique, et l'en-tête du programme le dit : « l'option Actuariat, cheminement avec
mémoire ou avec stage (segment 73) ». Rien dans `Programme` ne dit « ces blocs
s'excluent ». Même situation, plus douce, pour les cheminements honor de droit,
psychologie et musique.

**Admission sur dossier avec seuil de moyenne.** Bacc. musique, `Bloc 01V Cheminement Honor` :

> « NOTE : L'étudiant est admis dans ce segment du programme sur analyse du dossier.
> Il doit en faire la demande par écrit auprès du responsable de programme. Sa
> moyenne doit être de 3,7 minimum, et il doit avoir complété au moins 45 crédits du
> programme. »

**Cours hors programme obligatoires, non comptés dans les crédits.** Bacc.
mathématiques, en-tête : « L'étudiant inscrit dans une orientation COOP, doit aussi
s'inscrire à un stage hors programme. » ; segment 76 (Actuariat COOP) : « Les
étudiants doivent aussi réussir un stage hors programme MAT 3001 (Stage 3). »
MAT 3001 n'apparaît dans **aucun** bloc du segment 76, mais il est exigé pour
diplômer.

**Crédits supplémentaires imposables.** Maîtrise, en-tête : « Outre les 45 crédits,
jusqu'à 9 crédits de cours complémentaires peuvent être imposés à l'étudiant, soit
pour parfaire ses connaissances de base en mathématiques, statistique ou
informatique, soit pour l'initier à un domaine d'application particulier. »

**Exigence sans crédits.** Maîtrise, en-tête : « Le département s'attend à ce que
l'étudiant participe régulièrement, et ce tout au long de ses études, au séminaire
des étudiants de 2e et 3e cycles de mathématiques. »

**Mémoire et stage : bonne nouvelle, le modèle tient.** Ils sont publiés comme des
cours ordinaires. Maîtrise, `Bloc 70C Recherche et mémoire` / `Obligatoire - 29 crédits.`
contient `MAT 6916 / Mémoire / 29.0 Crédits` ; `S-Bloc 73C Stage` /
`Obligatoire - 21 crédits.` contient `MAT 6908 / Stage / 21.0 Crédits` ; bacc.
mathématiques `Bloc 76F Stages` / `Obligatoire - 6 crédits.` contient MAT 2000
(Stage 1) et MAT 3000 (Stage 2) ; bacc. mathématiques `Bloc 79G Mémoire de fin
d'études et stages` contient `STT 4000 / Mémoire de fin d'études`. Aucun champ
nouveau nécessaire : seulement des cours à 29, 21 ou 6 crédits. Je n'ai vu **aucun**
examen de synthèse ni exigence de langue formelle hors des blocs de cours de langue.

**Auditions et tests de classement, qui conditionnent l'inscription.**
Bacc. musique, `Bloc 03A Petits ensembles` : « Note : Pour les cours de ce bloc, les
étudiants doivent passer une audition et/ou rencontrer le professeur responsable. » ;
segment 83 : « NOTE : Les cours de ce bloc sont accessibles sur audition. Un étudiant
ne peut s'inscrire qu'au cours pour lequel il a été admis. Tout changement
d'instrument doit faire l'objet d'une demande écrite et doit être autorisé par la
vice-doyenne aux études en interprétation. » ; `Bloc 01B` : « NOTE : L'inscription
aux cours MUS 1011 à 1016, MUS 1213 & 1214 et MTE 1100 & 1120 nécessite une
prescription obtenue à la suite des tests de classement. » — noter la plage
« MUS 1011 à 1016 », qui n'est pas une liste de codes.

**Équivalences de cours, enfouies dans les descriptions.** Bacc. droit, description
de DRT 2002 (bloc 70B) : « Équivalent: DRT 2002 / DRT2012G » ; de DRT 2233 (bloc
70B) : « Équivalents: DRT2231/DRT2231G/DRT2233/DRT2233G » ; bacc. psychologie,
PSY 6028 (bloc 71V) : « Cours équivalent : PSY6026 ». Deux cours équivalents ne
doivent pas compter deux fois, et l'un satisfait le préalable de l'autre. Aucun
champ pour ça.

**Exclusions par programme, dans la description du cours.** Bacc. psychologie, bloc
71Y, description de ALL 1901 : « Remarque : Ce cours ne peut pas être reconnu comme
cours au choix dans les programmes suivants : 108510, 108520. » Le cours est listé
dans le bloc mais inadmissible pour certains programmes, désignés par un numéro
(`108510`) qui n'est pas le numéro de programme des pages de structure (`1-220-1-0`).

**Un cours à 0 crédit dans un bloc à option.** Bacc. musique, `Bloc 01E Analyse` /
`Option - Minimum 6 crédits, maximum 12 crédits.` contient `MTE 12041 / Analyse du
discours harmonique tonal 1 / 0.0 Crédits`. `credits: number` l'accepte, mais le
planificateur montrera un cours suivi qui n'avance à rien.

---

## 5. Préalables — **le modèle casse là où tu le pressentais**

`NoeudPrealable` prévoit déjà `ou` et `opaque`, et le commentaire du contrat est
honnête (« UdeM écrit des codes propres reliés par ET/OU, ce qui se parse sans
NLP »). Mais la réalité hors ACT/MAT/STT/IFT/ECN/DMO est plus dure que ça, et le
champ lui-même n'est pas ce que le contrat croit.

Le bloc s'intitule **« Exigences d'inscription »** sur la fiche, et tient en un seul
nœud de texte. Verbatim, copié des fiches :

| Cours | Ligne verbatim |
|---|---|
| **GEO 2122** | `Préalable: ((GEO1112 ou GEO1122 ou GEO1130) et (GEO1212 ou GEO1222)) ou 18 crédits de cours BIO, CHM, GEO, MAT, MCB et PHY` |
| **CRI 3318** | `Préalables: CRI1006 ou CRI1006G ou CRI 1600 ou CRI1600 G ou (SOL1018 et SOL1020) ou (PSY1004 et PSY1006); Restrictions d'inscription:CRI3318/SOL2020` |
| **SOL 2020** | `Préalable: CRI1600 ou CRI1600G ou POL1803 ou PSY1004 ou SOL1020 ou STT1995; Restrictions d'inscription:CRI3318/SOL2020` |
| **ANG 1903** | `Préalable: ANG1902 ou compétence équivalente.; Restrictions d'inscription:ANG1903/ANG1967` |
| **PSY 3204** | `Préalable: PSY1004; Restrictions d'inscription:PSY6019/PSY3204` |
| **PSY 2007** | `Préalables: PSY1004 ET PSY1006` |
| **PSY 40002** | `Préalable : PSY40001` |
| **DRT 3910**, **DRT 3940** | `Préalable: DRT1911 et DRT1912` |
| **DRT 3999** | `Préalable: DRT2923` |
| **CRI 1600G** | `Préalables : CRI1200 ou CRI1200G; Restrictions d'inscription: CRI1600G/SOL1020` |
| **PHY 2215** | `Préalable: MAT1400` |
| **MUI 1162A** | `Restrictions d'inscription: MUI1062A/MUI1063A/MUI1064A/V/MUI1065V/MUI1152A/...` (aucun préalable) |
| POL 1803, POL 3240, POL 3241, POL 3904, MUS 4000, MTE 1100, BIO 2041, CHM 1301, DRT 1151G | champ absent |

Ce qui casse :

1. **Parenthèses imbriquées sur deux niveaux** — GEO 2122 : `((A ou B ou C) et (D ou E))`.
   Un parseur « un code » / « A ET B » n'en tire rien.
2. **Une branche en prose dans un OU** — GEO 2122 : `... ou 18 crédits de cours BIO,
   CHM, GEO, MAT, MCB et PHY`. C'est le « avoir réussi N crédits » que tu cherchais,
   et il est **en alternative** à des codes. Le réduire à un seul nœud `opaque`
   détruit la branche mécanisable ; garder seulement les codes rend le cours
   faussement verrouillé pour l'étudiant qui a les 18 crédits. Il faut
   `ou[ et[...], opaque("18 crédits de cours BIO, CHM, GEO, MAT, MCB et PHY") ]`.
   Idem ANG 1903 : `ou compétence équivalente.`
3. **« Restrictions d'inscription » est collé dans le même texte**, séparé par un
   point-virgule. Si le scraper prend le bloc « Exigences d'inscription » comme
   `prealablesBrut`, il enregistre une restriction comme un préalable. MUI 1162A est
   le cas pur : *seulement* des restrictions, aucun préalable — le parseur y verrait
   une vingtaine de codes « requis », et le cours serait verrouillé à jamais.
4. **Trois orthographes de l'étiquette** : `Préalable:`, `Préalables:`, `Préalable :`
   (PSY 40002), `Préalables :` (CRI 1600G).
5. **Le connecteur est tantôt `ET`/`ou` tantôt `et`** : PSY 2007 écrit `ET`, DRT 3910
   écrit `et`, tous les `ou` relevés sont en minuscules. Une comparaison sensible à
   la casse avale la moitié des arbres.
6. **Les codes cités ne sont pas normalisables par une seule règle.** Dans la *même
   ligne* de CRI 3318 : `CRI1006`, `CRI1006G`, `CRI 1600` (avec espace) et
   `CRI1600 G` (espace **avant** la lettre de suffixe). Et PSY 40002 cite `PSY40001`,
   cinq chiffres.
7. **`prealablesBrut: null` ne veut pas dire « aucun préalable ».** MUS 1213 n'a
   aucun champ « Exigences d'inscription », et sa **description** dit :
   > « Comprendre, entendre, solfier et assimiler les éléments de base tels que les
   > intervalles, les accords, les gammes et les progressions d'accords. Préalable:
   > test de classement. Remarque : Les étudiant inscrit dans le programme de
   > Baccalauréat en musique – Interprétation jazz (1-605-1-6) seront admis en
   > priorité. »

   Le contrat affirme que « `prealablesBrut: null` est une affirmation forte (« ce
   cours n'a aucun préalable ») ». Pour MUS 1213, cette affirmation est fausse.
8. **Hors sujet pour `types.ts` mais à signaler au scraper : l'en-tête des trimestres
   passe au singulier quand il n'y en a qu'un.** DRT 3999 affiche `Trimestre` /
   `Hiver 2027`, alors que POL 3240 affiche `Trimestres` / `Été 2026, Automne 2026,
   Hiver 2027`. Un sélecteur ancré sur « Trimestres » produit `trimestres: []` pour
   tous les cours offerts à un seul trimestre — c'est-à-dire « jamais offert », la
   contrainte la plus dure du planificateur, fausse et muette.

Pour le reste, la forme `Saison Année` est uniforme sur les 23 fiches consultées :
`Été 2026`, `Automne 2026`, `Hiver 2027`. `Trimestre { saison, annee }` tient.

---

## 6. Chevauchement : un cours dans deux blocs — **oui, et c'est décisif**

**Bacc. droit, blocs 70K et 70L.** Onze cours sont dans les deux :

- `Bloc 70K Formation pratique` / `Option - 3 crédits.` :
  DRT 3910, 3911, 3912, 3913, 3914, 3915, 3916, 3918, 3940, 3941, 3999 (11 cours)
- `Bloc 70L Formation pratique complémentaire` / `Option - Maximum 9 crédits.` :
  DRT 3910, 3911, 3912, 3913, 3914, 3915, 3916, 3918, 3940, 3941, 3947, 3948, 3951,
  3965, 3966, 3990, 3991, 3999 (18 cours)

70K est **entièrement contenu** dans 70L. Un étudiant qui suit DRT 3910, 3911, 3912
et 3913 (12 crédits) doit voir 3 crédits attribués à 70K — exactement, c'est un
`Option - 3 crédits.` — et au plus 9 à 70L. L'attribution n'est plus un comptage :
c'est une affectation sous bornes, et le choix de l'affectation change le verdict de
conformité. C'est le cas que `EtatBloc.creditsAttribues` anticipe (« un cours ne
compte que dans un seul bloc, même s'il apparaît dans plusieurs ») sans que rien,
dans `Programme`, ne permette au moteur de savoir quand ça se produit.

**Résultats négatifs, explicitement :** aucun chevauchement à l'intérieur d'une même
orientation du bacc. en mathématiques (les 7 orientations testées, chacune avec son
tronc commun 01 : 0 cours en double), ni en psychologie, ni en économie et politique,
ni en musique, ni au certificat en droit, ni dans les segments 70 et 71 de la
maîtrise. Les listes des 7 orientations de mathématiques se recoupent massivement
**entre elles** (MAT 2000 est dans 75C, 76F, 77D, 79G, 80G, 81F, 82C), mais deux
orientations ne se suivent jamais ensemble : ce n'est pas un chevauchement.

**Cas limite à ne pas confondre :** en maîtrise, `MM-Bloc 73A` et `S-Bloc 73A`
partagent 28 cours, mais ces blocs appartiennent à deux cheminements exclusifs. Le
problème n'est pas l'attribution, c'est que les deux blocs portent le même
identifiant `73A`.

---

## Changements recommandés à `lib/types.ts`

### Nécessaires MAINTENANT — sinon trois chantiers construisent sur du faux

**N1. `RegleBloc` : ajouter les formes manquantes, et accepter min+max partout.**
Les trois types actuels interdisent `Option - 4 crédits.` (qui est sur notre propre
page, segment 82) et `Choix - Minimum 3 crédits, maximum 6 crédits.`. Le moteur et
l'UI font actuellement un `switch` sur `regle.type` avec trois cas : la quatrième
forme y sera avalée en silence au premier autre programme. La forme minimale qui
couvre les 9 cas relevés :

```ts
export type RegleBloc =
  | { type: "obligatoire"; credits: number }
  | { type: "option"; min: number | null; max: number | null; exact?: number }
  | { type: "choix"; min: number | null; max: number | null; exact?: number };
```

ou, si tu préfères garder trois constructeurs lisibles, un champ commun
`{ min, max }` où `Option - 4 crédits.` devient `min: 4, max: 4`. Dans les deux cas
le **`regleBrut` reste la source de vérité** et tout `switch` doit avoir sa garde
`never`. C'est urgent parce que c'est le champ sur lequel les trois chantiers
branchent leur logique.

**N2. `Bloc.id` : ne plus présumer que le segment s'en déduit, ni qu'il est unique.**
`MM-Bloc 73A` / `S-Bloc 73A` cassent les deux à la fois. Concrètement :

```ts
export interface Bloc {
  /** Tel qu'écrit : « 01A », « 75C », « MM-73A ». Unique dans un (programme,
   *  cheminement), PAS dans un programme : la maîtrise en mathématiques a
   *  « MM-Bloc 73A » et « S-Bloc 73A » dans le même segment. */
  id: string;
  /** Lu sur la ligne « Segment NN », JAMAIS déduit de `id`. */
  segment: string;
  /** Préfixe de cheminement quand la page en met un (« MM », « S »), sinon null. */
  cheminement: string | null;
  ...
}
```

Urgent parce que c'est une ligne de code dans le scraper (`id.slice(0,2)`) et une clé
d'identité dans le moteur et l'UI : corrigé après coup, il faut retoucher les trois.

**N3. `CodeCours` : élargir le format, et le documenter.** « Trois lettres, espace,
quatre chiffres » est faux. Relevé sur les 7 pages (1 031 codes distincts à quatre
chiffres, plus les quatre à cinq chiffres ci-dessous) :

- suffixe d'une lettre : `DRT 1151G`, `DRT 6830B`, `DRT 6845A`, `DRT 6965C`,
  `MUI 1162A`, `MUI 1162B`, `MAT 6129A`, `STT 6705V`, `VIO 2012D` — 199 codes
  distincts par page, répartis ainsi : 152 au bacc. en musique, 36 au certificat en
  droit, 7 à la maîtrise, 3 au bacc. en droit, 1 au bacc. en psychologie, 0 au bacc.
  en mathématiques et 0 en économie et politique. Ce ne sont pas des variantes
  d'écriture : `https://admission.umontreal.ca/cours-et-horaires/cours/cri-1600g/`
  est une fiche à part entière, distincte de `cri-1600`.
- **cinq** chiffres : `PSY 40001`, `PSY 40002` (bloc 71V de psychologie),
  `MTE 12041`, `MTE 12042` (bloc 01E de musique). La page de POL 3240 l'écrit
  elle-même : « Dans le champ au-dessous, entrez les 4 ou 5 chiffres du sigle
  (ex. 1101) ».

`normaliserCode()` vit dans `lib/codes.ts`, gelé comme `types.ts`, et est appelé
partout : c'est exactement le bogue muet décrit dans `CLAUDE.md` (« le graphe
s'affiche simplement sans arêtes »). À corriger avant que les trois chantiers
accumulent des comparaisons.

**N4. `Programme` : un endroit pour les totaux par type, sous forme d'intervalles.**
Aujourd'hui le 54/33/3 de l'actuariat n'existe que dans `docs/CONTRAT.md` et dans
`Audit`, qui le *calcule* sans pouvoir le *comparer* à rien. Or c'est la contrainte
centrale du projet, et ailleurs c'est un intervalle :

```ts
export interface ExigenceCredits { min: number; max: number | null; brut: string; }

export interface Programme {
  ...
  /** Totaux exigés par type, tels qu'énoncés sur la page. Pour l'actuariat :
   *  obligatoire 54/54, option 33/33, choix 3/3. Pour le droit : obligatoire
   *  68/68, option 30/33, choix 0/3. `null` si la page ne les énonce pas. */
  exigences: { obligatoire: ExigenceCredits; option: ExigenceCredits; choix: ExigenceCredits } | null;
}
```

Urgent parce que `Audit.conforme` est censé vérifier « les totaux par type de bloc
atteints » et que la donnée de référence n'est nulle part : le moteur est en train
d'écrire ce test contre une constante codée en dur ou contre rien.

**N5. `Bloc` : un champ pour la prose normative, qui force sa visibilité.**
Une grande partie de ce qui précède est du texte entre la règle et la liste de
cours. Il ne faut pas le modéliser maintenant (trop de formes), mais il faut
**l'enregistrer et le faire remonter**, sinon il disparaît au scrape et personne ne
saura qu'il a existé :

```ts
export interface Bloc {
  ...
  /** Texte normatif attaché au bloc, verbatim, dans l'ordre de la page.
   *  Ex. « Cheminement régulier : 0 crédit », « Sauf exception autorisée, les
   *  cours au choix doivent être choisis parmi les cours identifiés par un sigle
   *  autre que les sigles ECN ou POL. » Jamais interprété par le moteur ; toujours
   *  affiché comme avertissement par l'UI. */
  notes: string[];
}
```

Et le même champ sur `Programme` (en-tête + notes de segment), parce que « trois
cours du bloc 79 H ou du bloc 79 Y », « 33 crédits de cours POL et 33 crédits de
cours ECN » et « un stage hors programme MAT 3001 » sont des exigences de diplôme
qui ne vivent dans aucun bloc. Urgent au même titre que le reste : `Catalogue` a
déjà `prealablesNonParses` pour ne rien avaler en silence ; `notes` est son
équivalent du côté des règles de programme. Sans lui, l'UI affichera « conforme »
sur un parcours de droit qui ne diplôme pas, et il n'y aura aucune trace expliquant
pourquoi.

**N6. `Cours.prealablesBrut` : séparer les préalables des restrictions, et ne plus
écrire `null` comme une affirmation.** Le bloc « Exigences d'inscription » contient
`Préalable: ...; Restrictions d'inscription:...` en un seul texte ; MUI 1162A n'a
que des restrictions. Deux champs, et une nuance sur `null` :

```ts
  /** Tout le bloc « Exigences d'inscription », verbatim, non découpé. */
  exigencesBrut: string | null;
  /** La partie après « Préalable(s) » uniquement. null si l'étiquette est absente
   *  — ce qui NE veut PAS dire « aucun préalable » : MUS 1213 n'a pas de bloc
   *  « Exigences d'inscription » et sa description dit « Préalable: test de
   *  classement. ». */
  prealablesBrut: string | null;
  /** La partie après « Restrictions d'inscription », verbatim. Jamais un préalable. */
  restrictionsBrut: string | null;
```

Urgent : c'est la couture scraper → moteur (`parsePrealables()`), et c'est la
différence entre « cours verrouillé à tort » et « cours disponible ». Le type
`NoeudPrealable`, lui, **n'a pas besoin de changer** : `ou`, `et` imbriqués et
`opaque` suffisent à représenter GEO 2122 et ANG 1903. C'est le parseur du moteur
qui doit apprendre les parenthèses et les branches opaques à l'intérieur d'un `ou`,
pas le contrat.

### Reportables — à faire quand un deuxième programme sera réellement chargé

- **R1. Cheminements exclusifs** (`MM`/`S`, honor/régulier). Il faudra un
  `Programme.cheminements` et un filtre de blocs. Reportable parce que notre
  orientation actuariat n'en a pas et que le champ `Bloc.cheminement` de N2 suffit à
  ne pas perdre l'information d'ici là.
- **R2. Contraintes de quota par sigle** (« 33 crédits POL et 33 crédits ECN »,
  « un sigle autre que ECN ou POL »). Reportable : `notes` les conserve, l'UI les
  affiche comme avertissements, le moteur ne les vérifie pas encore.
- **R3. Règles portant sur un nombre de cours** (« trois cours du bloc 79 H ou du
  bloc 79 Y »). Reportable : c'est une accréditation externe, pas une condition de
  diplôme.
- **R4. Blocs dont le contenu est une catégorie** (blocs de langues, cours hors
  UdeM). Reportable, mais attention : un bloc `option` avec `cours: []` est
  aujourd'hui indistinguable d'une erreur de scrape. Un booléen
  `contenuOuvert: boolean` suffirait et pourrait venir avec N5.
- **R5. Équivalences de cours** (`Équivalent: DRT 2002 / DRT2012G`,
  `Cours équivalent : PSY6026`). Reportable tant qu'on ne traite qu'un programme,
  mais c'est la prochaine source de faux négatifs d'audit.
- **R6. Exigences hors crédits** (stage hors programme MAT 3001, auditions, tests de
  classement, moyenne de 3,7, séminaire obligatoire). `notes` les porte ; le moteur
  n'a pas à les modéliser avant d'avoir un vrai besoin.
- **R7. Cours à 0 crédit** (MTE 12041). Pas de changement de type, juste un
  avertissement d'UI éventuel.

---

## Ce que je n'ai pas pu vérifier

- **Les sciences infirmières** : je n'ai pas trouvé le slug de l'URL
  (`baccalaureat-en-sciences-infirmieres`, `...-formation-initiale`,
  `...-formation-integree` renvoient 404 ou 301) et je n'ai pas voulu deviner en
  multipliant les requêtes. Les programmes à stages intensifs et à grilles par année
  (infirmières, enseignement, médecine) sont le gisement le plus probable de
  structures que je n'ai pas vues — notamment des grilles **par trimestre imposé**,
  qui changeraient la nature du planificateur.
- **Les majeures et mineures** : `majeure-en-psychologie` et `mineure-en-mathematiques`
  répondent 200, je ne les ai pas ouvertes. Le baccalauréat par cumul (majeure +
  deux mineures) n'est sans doute pas décrit par des blocs du tout, mais je ne l'ai
  pas vérifié. Je n'affirme rien là-dessus.
- **Un doctorat**, et donc l'examen de synthèse : je n'en ai ouvert aucun. Je n'ai
  **pas** trouvé d'examen de synthèse dans la maîtrise consultée, et je ne prétends
  pas qu'il n'en existe pas ailleurs.
- **« Autorisation du département » dans une ligne de préalables** : je ne l'ai pas
  trouvée sur les 23 fiches consultées. L'autorisation existe bel et bien, mais dans
  le **texte des blocs** (« avec l'approbation du responsable de programme »,
  « sujet à l'approbation du responsable du Certificat »). Les formes non
  mécanisables que j'ai vues dans un champ Préalables sont « ou compétence
  équivalente. » (ANG 1903), « test de classement. » (MUS 1213, dans la description)
  et « ou 18 crédits de cours BIO, CHM, GEO, MAT, MCB et PHY » (GEO 2122).
- **La fréquence réelle des formes rares.** « 9 formes de règles » et « ≈ 200 codes
  suffixés » valent pour ces 7 programmes seulement. L'UdeM en compte plusieurs
  centaines ; je n'ai pas balayé le répertoire et je ne sais pas s'il existe une
  dixième forme.
- **L'arithmétique des programmes autres que l'actuariat.** Je n'ai pas vérifié que
  la somme des blocs concorde avec les totaux annoncés ailleurs qu'en droit
  (68+33 = 101 et 68+30+3 = 101) et en psychologie (45+39+6 = 45+42+3 = 90). Je cite
  les totaux tels qu'écrits, sans les avoir recoupés partout.
- **Les champs `cycle` et `faculte`** de `Cours` : les fiches affichent bien
  « 1er cycle » et « Faculté des arts et des sciences, Science politique », mais je
  n'ai pas cherché de contre-exemple (programme conjoint, cours de cycle mixte).
