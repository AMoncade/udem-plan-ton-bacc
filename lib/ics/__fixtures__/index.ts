/**
 * FIXTURES D'HORAIRE — provenance de chacune.
 *
 * Le projet interdit d'inventer des données. Les trois horaires complets ci-
 * dessous sont donc de VRAIS exports, copiés tels quels, et non des ICS écrits
 * pour faire passer les tests. Leur intérêt est précisément qu'ils ne se
 * ressemblent pas : le même cours s'y écrit de trois façons.
 *
 * `horaire-a26-synchro02.ics`
 *   Export réel de l'extension synchro-calendrier 0.2, trouvé dans
 *   `~/Downloads/horaire-udem-A26.ics` (DTSTAMP 2026-09-09T22:19:41Z).
 *   SUMMARY « MAT 1400-A Calcul 1 (TH) » : sigle espacé, titre DANS le résumé.
 *
 * `horaire-a26-v2.ics`
 *   Produit en appelant le générateur actuel de l'extension
 *   (`C:/Users/adrie/synchro-calendrier/src/core/ics.ts`) sur un horaire calqué
 *   sur le précédent. SUMMARY « MAT1400-A — Théorie » : sigle compact, titre
 *   déplacé dans la DESCRIPTION, plus VALARM, CATEGORIES et échéances StudiUM.
 *
 * `horaire-squelette-v2.ics`
 *   Squelette fourni par la session intégratrice
 *   (`udem-v2-ics/docs/FORMAT-ICS-SYNCHRO.md` §9), fabriqué d'après la structure
 *   observée et NON copié d'un horaire personnel. Seul endroit où cohabitent un
 *   sigle suffixé (`DRT1151G-A`), un sigle à cinq chiffres (`PSY40001-A102`), un
 *   évènement v1 et un évènement v2 dans le même fichier, un `CATEGORIES:Examen`
 *   et un cours recoupé par la relâche.
 *
 * `horaire-a26-tiers.ics`
 *   Reprise de `~/study-planner-app/tests/fixtures/horaire_a26.ics`.
 *   ATTENTION : **ce fichier est FABRIQUÉ, pas observé.** Son
 *   `PRODID:-//Universite de Montreal//Centre etudiant//FR` n'existe nulle part,
 *   et il a été committé une semaine avant que le générateur réel existe
 *   (relevé par la session intégratrice, §1). Sa forme
 *   « MAT1400 - Calcul II - Théorie » n'est donc attestée par AUCUN export réel.
 *   Elle est gardée comme forme tierce plausible — un horaire exporté d'ailleurs
 *   que de l'extension — et parce qu'elle est la seule à écrire « IFT-1015 »
 *   avec un trait d'union. Aucune affirmation de ce répertoire ne s'appuie sur
 *   elle pour dire ce que Synchro produit.
 *
 * `cas-tordus.ics`
 *   Écrite à la main, et c'est assumé : elle rassemble les pièges que les
 *   générateurs réels ne produisent pas tous, dont le seul qui fasse vraiment
 *   disparaître un cours — un SUMMARY plié au milieu d'un sigle.
 *   Deux de ses formes ne sont attestées NULLE PART dans un export réel et n'y
 *   sont que par tolérance, parce qu'un étudiant peut aussi exporter depuis
 *   Google Agenda ou Outlook : `DTSTART;VALUE=DATE:` (aucun évènement « journée
 *   entière » dans les horaires UdeM) et `RRULE:FREQ=MONTHLY`.
 *
 * `tronque.ics` — fichier coupé en plein VEVENT (téléchargement interrompu).
 * `vide.ics` — zéro octet.
 * `pas-un-ics.txt` — les 30 premières lignes du texte du Centre étudiant,
 *   repris de `synchro-calendrier/tests/fixtures/centre-etudiant-A26.txt` :
 *   l'erreur de collage la plus probable, et elle contient de vrais sigles.
 *
 * AVERTISSEMENT SUR LES FINS DE LIGNE : `core.autocrlf` vaut `true` sur la
 * machine de développement, donc git réécrit les fins de ligne de ces fichiers
 * à la sortie de l'index. Aucun test ne doit donc supposer qu'un fichier est
 * stocké en CRLF : les tests de fins de ligne construisent leur entrée avec
 * `avecFins()`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function lireFixture(nom: string): string {
  return readFileSync(fileURLToPath(new URL(nom, import.meta.url)), "utf8");
}

/** Réécrit toutes les fins de ligne d'un texte, pour tester CRLF, LF et CR. */
export function avecFins(texte: string, fin: "\r\n" | "\n" | "\r"): string {
  return texte.replace(/\r\n|\n|\r/g, fin);
}
