/**
 * COUVERTURE DES FICHES DE COURS — ce que l'écran sait, et ce qu'il ignore.
 *
 * ## Le problème que ce fichier existe pour dire
 *
 * Les blocs d'un programme CITENT des codes de cours ; les fiches de ces cours
 * vivent ailleurs, dans `data/cours/<SUJET>.json`, et la passe « cours » du
 * scrape est indépendante de la passe « programmes ». Les deux n'avancent pas
 * au même rythme, et rien dans le contrat ne les oblige à être d'accord.
 *
 * Mesuré le 2026-09-11 sur `data/` à 82 fichiers de sujets, en PARCOURS
 * (l'unité du sélecteur : une page à sept orientations vaut sept parcours, et
 * `data/index-programmes.json` porte 1 480 fiches pour 1 089 fichiers de
 * programme) :
 *
 *   1 027 parcours ont une structure exploitable ;
 *     499 d'entre eux n'ont AUCUNE fiche de cours — pas une seule ;
 *     274 en ont moins du quart ;
 *      55 sont complets.
 *
 * CES QUATRE NOMBRES SONT PÉRIMABLES, et ils périment vite : la passe « cours »
 * du scrape tournait pendant qu'ils étaient pris, et elle a livré ARC, AME, APA
 * et URB dans l'heure — les sigles mêmes de l'exemple ci-dessous. Ils disent
 * l'ORDRE DE GRANDEUR qui a motivé ce module, pas l'état d'aujourd'hui ; rien
 * dans le code ne les lit. Pour les refaire : assembler chaque parcours à
 * structure et compter, la mesure tient en une trentaine de lignes.
 *
 * La session scraper mesure le même trou en PROGRAMMES et trouve 222 sans
 * aucune fiche sur 581 : le rapport ~1,8 entre les deux séries est le facteur
 * orientations, et les deux comptes sont justes dans leur unité. D'où la règle
 * pour tout ce qui sort d'ici : écrire le mot « parcours » dans la phrase.
 * Un nombre sans son unité sera lu dans l'autre, et quelqu'un finira par
 * « corriger » un chiffre juste.
 *
 * ## Deux absences qui ne se réparent pas pareil
 *
 * Un cours sans fiche relève de l'un ou l'autre de deux états, et les
 * confondre ferait afficher une phrase fausse :
 *
 *  - **le fichier du sujet n'existe pas** : `data/cours/ARC.json` est absent,
 *    donc rien de ce sigle n'est disponible ;
 *  - **le fichier existe et il lui manque des cours** : `data/cours/DRT.json`
 *    porte 160 fiches et n'a toujours pas celle que ce bloc cite.
 *
 * Le second est le cas le PLUS courant, et il le devient davantage à mesure que
 * le scrape avance : 4 192 des codes manquants appartiennent à un sujet dont le
 * fichier est déjà là. On ne peut donc surtout pas déduire « aucun fichier pour
 * ce sigle » de « aucun code cité de ce sigle n'a de fiche » — un fichier bien
 * présent dont ce parcours ne cite aucune entrée produirait exactement la même
 * observation. C'est le JOURNAL du dépôt qui tranche : `assembler()` inscrit une
 * entrée `manque` quand le dépôt ne rend rien pour un sujet, et c'est la seule
 * source qui distingue « pas de fichier » de « fichier incomplet ».
 *
 * ## Pourquoi ce n'est pas déjà couvert ailleurs
 *
 * Le moteur signale bien les crédits inconnus — mais SEULEMENT pour les cours
 * que l'étudiant a marqués faits (`lib/engine/index.ts`, « limites de l'audit
 * lui-même »). Quelqu'un qui arrive sur un parcours et n'a encore rien marqué
 * ne déclenche aucun de ces messages : il n'a donc rien du tout. Le pied de
 * page tient le journal du chargement, qui dit « aucune fiche pour le sujet
 * ARC » — au bas de l'écran, en petit, une ligne par sujet. Ni l'un ni l'autre
 * ne répond à la question qu'on se pose en haut de la page.
 *
 * Ce module ne juge rien et ne masque rien : il COMPTE. La décision de ce qu'on
 * en affiche est dans `components/CouvertureCours.tsx`.
 */
import { sujetDeCode } from "../../lib/codes";
import type { CatalogueAssemble } from "./depot";

export type NiveauCouverture =
  /** Le parcours ne cite aucun cours : il n'y a rien à couvrir. Un programme
   *  entièrement fait de blocs au choix ou à contenu ouvert est dans ce cas, et
   *  ce n'est pas un manque. */
  | "sans-objet"
  /** Des cours cités, aucune fiche. L'écran est exact mais illisible. */
  | "aucune"
  | "partielle"
  | "complete";

export interface Couverture {
  /** Codes distincts cités par les blocs du parcours PROJETÉ. */
  cites: number;
  avecFiche: number;
  sansFiche: number;
  /**
   * Sujets dont le dépôt n'a rendu AUCUNE fiche, triés — lus du journal, jamais
   * déduits des codes cités (voir l'en-tête). Leur fichier n'existe pas encore.
   */
  sujetsSansFichier: string[];
  /**
   * Codes sans fiche dont le sujet a pourtant répondu : le fichier est là, ce
   * cours-ci n'y est pas. C'est ce que « il manque un fichier » ne dit pas.
   */
  sansFicheSujetPresent: number;
  /** Part des codes cités qui ont une fiche, entre 0 et 1. `null` quand rien
   *  n'est cité — surtout pas 0, qui se lirait « aucune fiche ». */
  part: number | null;
  niveau: NiveauCouverture;
}

export function couvertureFiches(assemble: CatalogueAssemble): Couverture {
  // Le journal est autoritatif sur « ce sujet n'a rendu aucune fiche ».
  // `genre: "manque"` porte un sujet ; les autres genres portent la clé du
  // parcours dans le même champ, d'où le filtre sur le genre.
  const sujetsSansFichier = [
    ...new Set(
      assemble.catalogue.journal
        .filter((entree) => entree.genre === "manque")
        .map((entree) => entree.sujet),
    ),
  ].sort();
  const muets = new Set(sujetsSansFichier);

  // Sur les codes DISTINCTS : un cours cité par trois blocs est un seul titre
  // manquant à l'écran, pas trois. Compter les citations gonflerait le manque
  // des programmes qui répètent un tronc commun dans plusieurs blocs.
  const cites = new Set<string>();
  for (const bloc of assemble.programme.blocs) {
    for (const code of bloc.cours) cites.add(code);
  }

  let avecFiche = 0;
  let sansFicheSujetPresent = 0;

  for (const code of cites) {
    if (assemble.catalogue.cours[code] !== undefined) {
      avecFiche += 1;
      continue;
    }
    const sujet = sujetDeCode(code);
    // Un code que `sujetDeCode()` refuse est déjà signalé comme illisible par
    // `assembler()` ; l'imputer à un fichier de données ferait accuser celui-ci
    // d'un défaut de forme du code.
    if (sujet !== null && !muets.has(sujet)) sansFicheSujetPresent += 1;
  }

  const total = cites.size;
  const sansFiche = total - avecFiche;

  const niveau: NiveauCouverture =
    total === 0
      ? "sans-objet"
      : avecFiche === 0
        ? "aucune"
        : sansFiche === 0
          ? "complete"
          : "partielle";

  return {
    cites: total,
    avecFiche,
    sansFiche,
    sujetsSansFichier,
    sansFicheSujetPresent,
    part: total === 0 ? null : avecFiche / total,
    niveau,
  };
}
