# Format réel des ICS d'horaire UdeM

Ce que contient vraiment un `.ics` exporté par l'extension `synchro-calendrier`,
pour que le lecteur d'ICS de `udem-plan-ton-bacc` en tire des codes de cours sans
en inventer ni en perdre.

Rédigé le 2026-09-11 à partir de quatre fichiers réels trouvés sur la machine, du
code du générateur, et d'un échantillon produit en exécutant ce générateur.
Chaque affirmation est marquée **[observé]** (lu dans un fichier ou une sortie
réelle) ou **[déduit]** (lu dans le code, pas vu dans un fichier).

Les extraits sont courts et les titres de cours sont ceux de l'horaire réel de
l'utilisateur ; aucun fichier `.ics` personnel n'est copié dans le dépôt.

---

## 0. Le fait le plus important : il y a DEUX formats, pas un

Le générateur a changé de format de `SUMMARY` le **2026-09-09 à 18:40:58**
(commit `f6b0cfa`, « phase9: rappels VALARM, champs ICS v2 et lien Google
Agenda »). Le seul export réel de l'utilisateur qu'on ait, `horaire-udem-A26.ics`,
date du **2026-09-09 à 18:19:44** — soit **21 minutes avant le changement**.

**L'échantillon sur le disque est donc du format v1, et le générateur actuel
produit du v2.** Un lecteur écrit contre le seul échantillon ne lira pas les
exports de demain ; un lecteur écrit contre le seul code ne lira pas le fichier
que l'utilisateur a déjà dans ses téléchargements. **Il faut gérer les deux.**

| | v1 (jusqu'au 2026-09-09 18:40) | v2 (`HEAD` = `52d688f`) |
|---|---|---|
| Séance | `MAT 1400-A Calcul 1 (TH)` | `MAT1400-A — Théorie` |
| Examen | `STT 1700 — Examen intra` | `MAT1400 — Examen intra` |
| Sigle | espacé (`MAT 1400`) | compact (`MAT1400`) |
| Titre du cours | dans le `SUMMARY` | **absent** du `SUMMARY`, passé en `DESCRIPTION` |
| `CATEGORIES` | absent | `Cours` / `Examen` / `Échéance` |
| `VALARM` | absent | présent (rappels) |
| Pliage des lignes | non appliqué | **oui, à 75 octets** |
| `UID` | `A26-MAT1400-A-TH-2-0830@…` | `A26-MAT1400-A-TH-2-0830-20260901@…` (date ajoutée) |

---

## 1. À quoi ressemble exactement un `SUMMARY` — LA réponse

### v1 — format de l'export réel qui existe sur la machine [observé]

`C:\Users\adrie\Downloads\horaire-udem-A26.ics`, `PRODID:-//synchro-calendrier//UdeM//FR` :

```
SUMMARY:MAT 1400-A Calcul 1 (TH)
SUMMARY:MAT 1400-A102 Calcul 1 (TP)
SUMMARY:MAT 1500-A Mathématiques discrètes (TH)
SUMMARY:STT 1700-A103 Introduction à la statistique (TP)
SUMMARY:STT 1700 — Examen intra
SUMMARY:MAT 1400 — Examen final
```

Grammaire : `SIGLE ESPACE NUMÉRO "-" SECTION ESPACE TITRE ESPACE "(" VOLET ")"`,
le volet étant `TH`, `TP`, `LAB` ou `AUTRE`. Confirmé par le code v1
(`expand.ts:79`, `courseLabel`), qui est resté en place pour le popup :

```ts
/** "MAT 1400-A Calcul 1 (TH)". */
export function courseLabel(course: Course): string {
  const section = course.section ? `-${course.section}` : "";
  return `${formatCourseCode(course.code)}${section} ${course.title} (${course.component})`;
}
```

### v2 — ce que produit le générateur actuel [observé, sortie générée]

`src/core/ics.ts:67` :

```ts
/** `MAT1400-A — Théorie`. */
export function courseSummary(course: Course): string {
  const code = compactCode(course.code);
  const head = course.section ? `${code}-${course.section}` : code;
  return `${head} — ${COMPONENT_NAMES[course.component]}`;
}
```

Sortie réelle obtenue en exécutant `generateIcs` au `HEAD` `52d688f` :

```
SUMMARY:MAT1400-A — Théorie
SUMMARY:DRT1151G-A — Théorie
SUMMARY:PSY40001-A102 — Travaux pratiques
SUMMARY:DRT1151G — Examen intra
SUMMARY:PSY40001 — Examen final
```

Les quatre volets possibles sont `Théorie`, `Travaux pratiques`, `Laboratoire`,
`Autre` (`ics.ts:45`). Le séparateur est un **tiret cadratin U+2014 entouré
d'espaces** (`—`), pas un trait d'union.

### Ce qu'il ne faut PAS prendre pour référence

`C:\Users\adrie\study-planner-app\tests\fixtures\horaire_a26.ics` contient un
troisième format :

```
SUMMARY:MAT1400 - Calcul II - Théorie
SUMMARY:IFT-1015 - Programmation 1 - Théorie
```

avec `PRODID:-//Universite de Montreal//Centre etudiant//FR`. **Cette fixture est
inventée.** Elle a été committée le 2026-09-02 (`a16a1d6`), une semaine avant que
le générateur réel existe (2026-09-09, `d7d3840`), et aucun fichier réel ne porte
ce `PRODID`. Le second fichier des téléchargements, `horaire_udem_A26.ics`
(`PRODID:-//Adrien//Horaire UdeM A26//FR`, 2026-09-02), est lui aussi fait à la
main — mais il suit, lui, la convention v1 (`SUMMARY:MAT 1000-A Analyse 1 (TH)`).

Le format `SIGLE - Titre - Volet` avec trait d'union et espaces n'est donc
**attesté nulle part dans un export réel**. Le supporter est un choix de
tolérance, pas une nécessité — et il est coûteux (voir §8).

### Règle recommandée

Extraire le sigle par une expression qui accepte les trois écritures, puis
**couper la section** avant de normaliser :

```
^([A-Za-z]{2,4})[ -]?(\d{4,5}[A-Za-z]?)(?:-([A-Za-z0-9]+))?\b
   groupe 1 = sigle    groupe 2 = numéro (+suffixe)   groupe 3 = SECTION, à jeter
```

---

## 2. Le code de cours est-il ailleurs que dans `SUMMARY` ?

| Propriété | v1 | v2 | Contient le sigle ? |
|---|---|---|---|
| `SUMMARY` | ✔ | ✔ | **oui — source principale** |
| `UID` | ✔ | ✔ | **oui**, en 2ᵉ position : `A26-MAT1400-A-TH-2-0830@synchro-calendrier` |
| `DESCRIPTION` (du `VEVENT`) | ✔ | ✔ | **non** |
| `DESCRIPTION` (dans un `VALARM`) | — | ✔ | **oui** (recopie du `SUMMARY`) |
| `LOCATION` | ✔ | ✔ | non (local de cours) |
| `CATEGORIES` | — | ✔ | non (`Cours`/`Examen`/`Échéance`) |
| `X-…` | `X-WR-CALNAME`, `X-WR-TIMEZONE`, `X-LIC-LOCATION` | idem | non |

**Le `DESCRIPTION` du `VEVENT` ne contient jamais le sigle.** [observé]

v1 : `DESCRIPTION:Théorie — section A — classe nº 1490`
v2 : `DESCRIPTION:Calcul 1\nclasse nº 1490` (titre, puis nº de classe)

C'est un piège : le lecteur de `study-planner-app` fait
`COURSE_CODE_RE.search(summary) or COURSE_CODE_RE.search(description)`
(`ics_import.py:113`). Ce repli ne rattrape rien sur ces fichiers, mais il peut
**inventer** un cours si une note de séance mentionne un autre sigle
(« voir MAT1600 »). Le repli sur `DESCRIPTION` est à éviter ; le repli utile est
le `UID`.

Deux conséquences pour un lecteur qui parcourt les lignes brutes :

1. En v2, le `VALARM` **répète le sigle**. Compter les occurrences ligne à ligne
   double les séances avec rappel. Il faut parser par `VEVENT`, et ignorer
   l'intérieur des blocs `BEGIN:VALARM`…`END:VALARM`.
2. Le `UID` est un bon recours quand le `SUMMARY` est illisible, mais il est
   « nettoyé » : `uidPart()` (`ics.ts:198`) supprime tout sauf `[A-Za-z0-9._-]`.

---

## 3. Forme des dates, et `RRULE`

**Toujours la même forme** dans les quatre fichiers [observé] :

```
DTSTAMP:20260909T221941Z
DTSTART;TZID=America/Toronto:20260901T083000
DTEND;TZID=America/Toronto:20260901T103000
RRULE:FREQ=WEEKLY;UNTIL=20261017T035959Z
EXDATE;TZID=America/Toronto:20261005T153000,20261012T153000
```

- `DTSTART`/`DTEND`/`EXDATE` : **heure locale avec `TZID=America/Toronto`**, jamais
  de `Z`, **jamais `VALUE=DATE`**. Aucun événement « journée entière ».
- `DTSTAMP` et le `UNTIL` de la `RRULE` : **UTC avec `Z`** (imposé par la RFC 5545
  §3.3.10 quand `DTSTART` porte un `TZID`).
- Un `VTIMEZONE` complet pour `America/Toronto` précède les événements. Il contient
  lui aussi des `DTSTART:` et des `RRULE:` — **ceux-là ne sont pas des séances**.
  Un lecteur qui grep `RRULE` sans regarder dans quel bloc il est se trompe.

### Récurrences : `RRULE`, et plusieurs `VEVENT` par cours

**Il y a une `RRULE` hebdomadaire, pas une ligne par séance.** Mais un cours
donne **plusieurs `VEVENT`**, pour trois raisons cumulables :

1. **Un `VEVENT` par jour de la semaine.** MAT 1400-A a lieu mardi et jeudi → deux
   `VEVENT` au même `SUMMARY`.
2. **Un `VEVENT` par section.** `MAT 1400-A` (théorie) et `MAT 1400-A102` (TP) sont
   deux `SUMMARY` différents pour le même cours.
3. **Un `VEVENT` par plage continue.** Synchro coupe une même séance autour de la
   semaine de relâche : dans l'export réel, `MAT 1400-A` du mardi apparaît deux
   fois, `UNTIL=20261017` puis `DTSTART` au `20261027`.

Conséquence : **`MAT 1400` apparaît 6 fois dans l'échantillon réel.** Le lecteur
doit dédupliquer par sigle, et ne jamais déduire un nombre de cours d'un nombre
d'événements. [observé]

Les examens et les échéances, eux, n'ont **pas** de `RRULE` : un `VEVENT` ponctuel.

---

## 4. Lignes repliées (RFC 5545 §3.1)

**Réponse courte : oui en v2, non dans l'échantillon v1 — il faut déplier dans
tous les cas.**

- Dans `horaire-udem-A26.ics` (v1), **aucune ligne ne commence par une espace ou
  une tabulation**, et aucune ne dépasse 75 octets. [observé]
- Dans le fichier fait à la main `horaire_udem_A26.ics`, trois lignes dépassent 75
  octets **sans être pliées** (une `DESCRIPTION` de 108 caractères, deux `EXDATE`
  de 91). Un générateur artisanal ne plie pas. [observé]
- Le générateur actuel **plie**, à 75 **octets** UTF-8 (pas caractères), sans jamais
  couper un caractère multi-octets (`ics.ts:110`, `foldLine`). Sa suite de tests
  exige qu'un export typique contienne au moins une ligne pliée
  (`ics.test.ts:296`). [observé : 34 tests verts au `HEAD` `52d688f`]

Sortie réelle du générateur v2 :

```
LOCATION:Pavillon Roger-Gaudry\, salle Z-110 — Université de Montréal\,
  campus de la montagne\, Montréal (Québec)\, Canada
DESCRIPTION:Séminaire de recherche\nclasse nº 3310 — Apporter la calcul
 atrice\; manuel obligatoire
```

Noter que la continuation coupe **au milieu du mot** (`calcul` / `atrice`) : le
dépliage doit retirer exactement **un** caractère de tête et recoller sans ajouter
d'espace. La deuxième ligne de `LOCATION` commence par deux espaces parce que le
texte d'origine avait déjà une espace à cet endroit.

### Un sigle peut-il être coupé en deux ?

**Dans `SUMMARY`, non** — et c'est démontrable, pas seulement constaté. `SUMMARY:`
fait 8 octets, le sigle le plus long fait ~13 octets (`PSY40001-A102`), donc il
tient toujours dans les 75 premiers octets de la première ligne physique. Même
raisonnement pour `UID:` (le plus long observé fait 48 octets).

**Dans `DESCRIPTION` et `LOCATION`, oui**, un sigle mentionné dans une note peut
être coupé. Comme le sigle ne doit de toute façon pas être cherché là (§2), le
risque est théorique — mais **déplier avant toute recherche** reste obligatoire,
sinon une `DESCRIPTION` longue casse le parsing du `VEVENT`.

### Échappement (RFC 5545 §3.3.11)

Les valeurs `TEXT` sont échappées : `\\`, `\;`, `\,`, `\n` (`ics.ts:93`,
`escapeText`). Visible ci-dessus (`\,` dans `LOCATION`, `\;` et `\n` dans
`DESCRIPTION`) et dans la fixture (`LOCATION:Pav. André-Aisenstadt\, salle 1140`).
**Il faut déséchapper après avoir déplié**, dans cet ordre.

---

## 5. Événements qui ne sont PAS des cours

Oui, il y en a, et ils portent un sigle de cours. C'est le risque d'inventer des
cours réussis.

### Examens [observé, v1 et v2]

L'échantillon réel contient **8 examens sur 27 événements** :

```
BEGIN:VEVENT
UID:A26-STT1700-examen-2026-10-07@synchro-calendrier
DTSTART;TZID=America/Toronto:20261007T133000
SUMMARY:STT 1700 — Examen intra
DESCRIPTION:Examen intra
END:VEVENT
```

### Échéances [déduit du code, v2 seulement]

`ics.ts:355`, `deadlineEvent` : quiz et remises StudiUM, `DTSTART` = `DTEND`,
`CATEGORIES:Échéance`, parfois une `URL:`. Le `SUMMARY` est
`MAT1400 — Quiz-tp3` **ou, sans sigle, le titre nu** :

```
SUMMARY:Rendez-vous TGDE
```

### Événements sans aucun sigle [observé, fixture]

`SUMMARY:Rendez-vous conseiller pédagogique` — aucun code. Un lecteur qui exige un
sigle les écarte tout seul.

### Comment les distinguer

| | Discriminant |
|---|---|
| **v2** | `CATEGORIES:Cours` — **fiable, à privilégier** |
| **v1** | pas de `CATEGORIES`. Deux indices : absence de `RRULE`, et `SUMMARY` de la forme `SIGLE — <mot-clé>`. Le `UID` contient `-examen-`. |

Repli robuste couvrant les deux : **un événement n'est une séance de cours que
s'il a une `RRULE`** (les examens et échéances n'en ont jamais) **et que son
`CATEGORIES`, s'il existe, vaut `Cours`.**

Ne pas se fier aux seuls mots-clés (`intra`, `final`, `quiz`, `examen`) : le
champ `exam.label` est libre (`ics.ts:74` : `exam.label || "Examen"`), donc un
`SUMMARY` d'examen peut porter n'importe quel texte — le test du générateur en
donne un : `SUMMARY:MAT1400 — Test 2` (`ics.test.ts:335`).

> **Rappel de fond.** Même un vrai `CATEGORIES:Cours` prouve une *inscription*,
> pas une *réussite*. Un horaire d'automne 2026 ne dit pas que le cours a été
> réussi, ni même terminé. Voir §6.

---

## 6. Trimestres : les distingue-t-on, et sait-on s'ils sont terminés ?

**Un fichier = un trimestre.** Trois porteurs de l'information [observé] :

```
X-WR-CALNAME:UdeM — Automne 2026
UID:A26-MAT1400-A-TH-2-0830@synchro-calendrier
     ^^^ code de trimestre, en tête de chaque UID
```

Le code (`model.ts:44`) est `<lettre><année sur 2 chiffres>` : `A26` = Automne
2026, avec `H` pour Hiver et `E` pour Été (confirmé par `studium.ts:30`,
`[AHE]\d{2}`). Le libellé est `Automne 2026`.

**Rien ne dit qu'un trimestre est terminé.** `Term.start` / `Term.end` existent
dans le modèle mais **ne sont pas écrits dans l'ICS**. Le seul signal disponible
est la dernière date du fichier : le plus grand `UNTIL` de `RRULE` ou `DTSTART`
d'examen final. Dans l'échantillon, `20261217T083000` (examen final de MAT 1400).

Pour `udem-plan-ton-bacc`, cela signifie : **le fichier ne permet pas de conclure
qu'un cours est réussi.** Il permet de dire « inscrit à ces cours à ce
trimestre-là ». L'import doit proposer les cours trouvés et laisser l'utilisateur
confirmer la réussite — pas les marquer réussis d'office. Comparer la dernière
date à aujourd'hui donne « trimestre passé », ce qui n'est pas la même chose.

---

## 7. Encodage et fins de ligne

Vérifié au niveau des octets sur `horaire-udem-A26.ics` [observé] :

```
00000000: 4245 4749 4e3a 5643 414c 454e 4441 520d  BEGIN:VCALENDAR.
00000010: 0a56 4552 5349 4f4e 3a32 2e30 0d0a 5052  .VERSION:2.0..PR
00000070: 414c 4e41 4d45 3a55 6465 4d20 e280 9420  ALNAME:UdeM ... 
```

- **UTF-8 sans BOM.** Le fichier commence directement par `BEGIN` (`42 45 47 49 4e`),
  pas par `EF BB BF`.
- **CRLF** (`0d 0a`) partout, y compris une CRLF finale (`ics.ts:420` :
  `.join("\r\n") + "\r\n"`, et `ics.test.ts:288`).
- **Les accents survivent.** `e2 80 94` est le tiret cadratin `—` de
  `UdeM — Automne 2026` ; `Mathématiques discrètes`, `Algèbre linéaire`,
  `nº` et `Québec` sont corrects dans les quatre fichiers.

Donc : lire en **UTF-8 explicite**, ne pas se fier à l'encodage par défaut de la
plateforme (sur Windows, `cp1252` massacrerait tous les titres), et **tolérer un
BOM en entrée** au cas où l'utilisateur ferait passer le fichier par Excel ou le
Bloc-notes.

---

## 8. Pièges vérifiés — à traiter comme des cas de test

### 8.1 Sigles à suffixe et à cinq chiffres : perdus en silence

Le lecteur existant utilise `COURSE_CODE_RE = re.compile(r"\b([A-Z]{2,4})[ -]?(\d{4})\b")`
(`ics_import.py:33`). **Testé, pas supposé** :

```
OK    'MAT 1400-A Calcul 1 (TH)'             -> MAT1400
OK    'MAT 1400-A102 Calcul 1 (TP)'          -> MAT1400
OK    'MAT1400-A — Théorie'                  -> MAT1400
OK    'IFT-1015 - Programmation 1 - Théorie' -> IFT1015
RATÉ  'DRT 1151G-A Fondements du droit (TH)' -> AUCUN
RATÉ  'DRT1151G-A — Théorie'                 -> AUCUN
RATÉ  'PSY 40001-A Séminaire (TH)'           -> AUCUN
RATÉ  'PSY40001 — Théorie'                   -> AUCUN
```

Cause : le `\b` final. Dans `DRT1151G`, il n'y a pas de frontière de mot entre `1`
et `G` ; dans `PSY40001`, `\d{4}` capture `4000` puis bute sur le `1`. Les deux
formes que le brief signale sont donc **silencieusement jetées** — l'événement
part dans `ignored`, et un cours disparaît sans erreur.

Le générateur, lui, les traite sans broncher (sortie réelle) :

```
SUMMARY:DRT1151G-A — Théorie
SUMMARY:PSY40001-A102 — Travaux pratiques
```

Correctif : `(\d{4,5}[A-Za-z]?)` et ancrer par `(?![A-Za-z0-9])` plutôt que `\b`.

### 8.2 Le piège de la normalisation : la section devient un suffixe

Pour accepter `act-2250`, on est tenté de normaliser en retirant espaces **et**
traits d'union. Testé :

```
'MAT 1400-A'    -> MAT1400A      ← FAUX : ressemble à un sigle suffixé
'MAT 1400-A102' -> MAT1400A102   ← FAUX
'DRT 1151G'     -> DRT1151G      ← vrai sigle suffixé
'act-2250'      -> ACT2250       ← correct
```

`MAT 1400-A` normalisé donne `MAT1400A`, **indiscernable d'un vrai sigle suffixé
comme `DRT1151G`**. Le cours ne serait rattaché à rien, ou pire, à un mauvais
cours. **Il faut couper la section avant de normaliser**, avec le groupe 3 de
l'expression du §1 — et ne jamais appliquer un `replace("-", "")` global au
`SUMMARY` entier.

### 8.3 Ne pas compter les événements

`MAT 1400` apparaît 6 fois dans l'échantillon réel (§3). Dédupliquer par sigle.

### 8.4 Ne pas lire le `VTIMEZONE` comme un événement

Il contient `DTSTART:19700308T020000` et deux `RRULE:FREQ=YEARLY`. Parser par
blocs `BEGIN:VEVENT`…`END:VEVENT`, pas par lignes.

### 8.5 Ordre des opérations

**déplier → découper en `VEVENT` → déséchapper → chercher le sigle.** Inverser
déplier et déséchapper transforme un `\n` échappé en vraie coupure de ligne.

---

## 9. Squelette pour construire une fixture de test

Fabriqué à partir de la structure observée, **pas copié** de l'horaire de
l'utilisateur. Couvre : les deux formats, un sigle suffixé, un sigle à cinq
chiffres, une ligne pliée, un examen, un événement sans sigle, un cours coupé par
la relâche.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//synchro-calendrier//UdeM//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:UdeM — Automne 2026
X-WR-TIMEZONE:America/Toronto
BEGIN:VTIMEZONE
TZID:America/Toronto
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:A26-ACT2250-A-TH-2-0830-20260901@synchro-calendrier
DTSTAMP:20260911T120000Z
DTSTART;TZID=America/Toronto:20260901T083000
DTEND;TZID=America/Toronto:20260901T103000
RRULE:FREQ=WEEKLY;UNTIL=20261017T035959Z
EXDATE;TZID=America/Toronto:20261005T083000
SUMMARY:ACT2250-A — Théorie
LOCATION:E-310\, Pavillon Roger-Gaudry
DESCRIPTION:Mathématiques financières\nclasse nº 1490
CATEGORIES:Cours
END:VEVENT
BEGIN:VEVENT
UID:A26-ACT2250-A-TH-2-0830-20261027@synchro-calendrier
DTSTAMP:20260911T120000Z
DTSTART;TZID=America/Toronto:20261027T083000
DTEND;TZID=America/Toronto:20261027T103000
RRULE:FREQ=WEEKLY;UNTIL=20261210T045959Z
SUMMARY:ACT2250-A — Théorie
LOCATION:E-310\, Pavillon Roger-Gaudry
DESCRIPTION:Mathématiques financières\nclasse nº 1490
CATEGORIES:Cours
END:VEVENT
BEGIN:VEVENT
UID:A26-DRT1151G-A-TH-3-1330-20260902@synchro-calendrier
DTSTAMP:20260911T120000Z
DTSTART;TZID=America/Toronto:20260902T133000
DTEND;TZID=America/Toronto:20260902T153000
RRULE:FREQ=WEEKLY;UNTIL=20261210T045959Z
SUMMARY:DRT1151G-A — Théorie
LOCATION:B-0215\, Pavillon J.-Brillant
DESCRIPTION:Fondements du droit\nclasse nº 2201
CATEGORIES:Cours
END:VEVENT
BEGIN:VEVENT
UID:A26-PSY40001-A102-TP-4-1900-20260903@synchro-calendrier
DTSTAMP:20260911T120000Z
DTSTART;TZID=America/Toronto:20260903T190000
DTEND;TZID=America/Toronto:20260903T220000
RRULE:FREQ=WEEKLY;UNTIL=20261211T045959Z
SUMMARY:PSY40001-A102 — Travaux pratiques
LOCATION:Pavillon Roger-Gaudry\, salle Z-110 — Université de Montréal\,
  campus de la montagne\, Montréal (Québec)\, Canada
DESCRIPTION:Séminaire de recherche\nclasse nº 3310 — Apporter la calcul
 atrice\; manuel obligatoire
CATEGORIES:Cours
END:VEVENT
BEGIN:VEVENT
UID:H26-STT1700-A-TH-1-1330-20260112@synchro-calendrier
DTSTAMP:20260911T120000Z
DTSTART;TZID=America/Toronto:20260112T133000
DTEND;TZID=America/Toronto:20260112T153000
RRULE:FREQ=WEEKLY;UNTIL=20260421T035959Z
SUMMARY:STT 1700-A Introduction à la statistique (TH)
LOCATION:B-0215 Pav. 3200 J.-Brillant
DESCRIPTION:Théorie — section A — classe nº 1628
END:VEVENT
BEGIN:VEVENT
UID:A26-ACT2250-examen-2026-12-17@synchro-calendrier
DTSTAMP:20260911T120000Z
DTSTART;TZID=America/Toronto:20261217T083000
DTEND;TZID=America/Toronto:20261217T113000
SUMMARY:ACT2250 — Examen final
LOCATION:B-0215\, Pavillon J.-Brillant
DESCRIPTION:Examen final
CATEGORIES:Examen
END:VEVENT
BEGIN:VEVENT
UID:A26-echeance-rdv@synchro-calendrier
DTSTAMP:20260911T120000Z
DTSTART;TZID=America/Toronto:20260910T140000
DTEND;TZID=America/Toronto:20260910T140000
SUMMARY:Rendez-vous TGDE
DESCRIPTION:Ajouté à la main
CATEGORIES:Échéance
END:VEVENT
END:VCALENDAR
```

Attendu : **4 cours** — `ACT2250`, `DRT1151G`, `PSY40001` (A26) et `STT1700` (H26,
format v1). Pas 5, pas 7. L'examen, l'échéance et le doublon de relâche
n'ajoutent rien. Le fichier doit être écrit en **UTF-8 sans BOM avec des CRLF**,
sinon il ne teste pas ce qu'on croit.

---

## 10. Ce que je n'ai pas pu vérifier

- **Les échéances (`CATEGORIES:Échéance`, `URL:`) ne sont vues que dans le code et
  les tests du générateur**, jamais dans un export réel — la fonctionnalité date du
  2026-09-10 (`dc89547`), après le seul export disponible.
- **Aucun export réel au format v2 n'existe sur la machine.** Les extraits v2 de ce
  document viennent d'une exécution de `generateIcs` au `HEAD` `52d688f` avec des
  données de test que j'ai écrites, pas d'un fichier exporté par l'utilisateur.
  La *forme* est donc authentique, le *contenu* est fabriqué.
- **Aucun sigle suffixé ni à cinq chiffres n'apparaît dans un fichier réel.** Les
  horaires disponibles ne contiennent que `MAT`, `STT`, `IFT` à quatre chiffres.
  Que `DRT1151G` et `PSY40001` traversent le générateur intact est vérifié ; qu'ils
  existent bien sous cette forme dans Synchro vient du brief, pas de mon
  observation.
- **Je n'ai pas vu Synchro lui-même.** Tout ce qui concerne la source (découpage
  autour de la relâche, sections `A102`) est lu dans les données exportées et dans
  les commentaires du code, pas dans le centre étudiant.
- **Un `.ics` v1 sans `CATEGORIES` mais avec des échéances** ne peut pas exister
  (les deux sont arrivés ensemble), donc le repli « `RRULE` obligatoire » du §5 est
  sûr sur tout l'historique observé.

---

## Sources

| Source | Nature |
|---|---|
| `C:\Users\adrie\Downloads\horaire-udem-A26.ics` | export réel, v1, 2026-09-09 18:19:44, 27 événements |
| `C:\Users\adrie\Downloads\horaire_udem_A26.ics` | fait à la main, 2026-09-02, convention v1 |
| `study-planner-app\tests\fixtures\horaire_a26.ics` | fixture **inventée**, 2026-09-02, format non attesté |
| `synchro-calendrier\src\core\ics.ts` | générateur, `HEAD` `52d688f` |
| `synchro-calendrier\src\core\expand.ts` | `courseLabel` / `examLabel`, libellés v1 |
| `synchro-calendrier\tests\ics.test.ts` | 34 tests verts au `52d688f` |
| `study-planner-app\src\planner\core\ics_import.py` | lecteur existant, écrit contre la fixture inventée |
