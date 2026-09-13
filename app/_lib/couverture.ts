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
 * Mesuré en PARCOURS — l'unité du sélecteur : une page à sept orientations vaut
 * sept parcours, et `data/index-programmes.json` porte 1 507 fiches pour 1 089
 * fichiers de programme.
 *
 * Les trois colonnes qui vivaient ici — une par passe de scrape, avec la
 * consigne de refaire la mesure plutôt que d'en ajouter une quatrième — ont été
 * REFAITES et remplacées. Le scrape a fini le 2026-09-13 à 06 h 43
 * (`index.scrapeISO`), et voici l'état, mesuré en projetant chaque orientation :
 *
 *   parcours projetés                                  1 507
 *     ne citant aucun cours (sans objet)                 478
 *     entièrement couverts                               691
 *     à qui il manque au moins une fiche                 338
 *
 *   codes cités (union, après projection)              9 834
 *     avec fiche                                       9 478
 *     sans fiche                                         356   ← tous stériles
 *
 * CE QUI A CHANGÉ DE NATURE, et c'est le motif de la réécriture : les 356 codes
 * sans fiche sont MAINTENANT tous dans `index.codesSansCredits`, c'est-à-dire
 * tous vus sur une page réellement lue qui ne porte aucune étiquette
 * « Crédits ». Zéro indéterminé. Le manque a cessé d'être un retard de collecte
 * pour devenir une propriété de la source, et les 338 parcours concernés ne se
 * fermeront jamais.
 *
 * MAIS AUCUN DE CES NOMBRES N'EST LU PAR UNE LIGNE DE CODE, et la fonction plus
 * bas refait le partage à l'exécution sur le parcours affiché. C'est la
 * différence qui compte : le jour où une passe reprend, le commentaire ment et
 * le code non. Ne réintroduisez pas de colonne — refaites la mesure.
 *
 * La session scraper mesure le même trou en PROGRAMMES et trouve 416 couverts
 * sur 581, 165 définitivement incomplets. Les taux de couverture concordent
 * (0,67 en parcours contre 0,72 en programmes, l'écart étant le poids des
 * orientations), et les deux comptes sont justes dans leur unité. D'où la règle
 * pour tout ce qui sort d'ici : écrire le mot « parcours » dans la phrase.
 * Un nombre sans son unité sera lu dans l'autre, et quelqu'un finira par
 * « corriger » un chiffre juste.
 *
 * Un écart entre les deux séries est attendu et n'est pas une erreur : 4 des
 * 360 codes de `codesSansCredits` ne sont cités par AUCUN parcours projeté —
 * ils vivent dans des blocs dont le segment n'appartient à aucune orientation.
 * D'où 356 ici et 360 là-bas.
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
 * ## La troisième absence, celle qui ne se répare pas du tout
 *
 * Les deux ci-dessus disent OÙ la fiche manque. Elles ne disent pas si elle
 * arrivera, et c'est la question que se pose l'étudiant. Certaines pages de
 * cours de l'UdeM ne portent aucune étiquette « Crédits » : les seules
 * occurrences du mot y sont les « 90 crédits » des programmes qui citent le
 * cours, et les lire donnerait au cours les crédits de son programme. Le
 * scraper refuse alors d'écrire la fiche — à raison — et consigne le code dans
 * `IndexProgrammes.codesSansCredits` avec la date où la page a été lue.
 *
 * Ce champ est la SEULE chose qui permette de distinguer « aucune collecte
 * n'ajoutera ce cours » de « la prochaine passe le récupérera ». Il ne se
 * déduit surtout pas par soustraction : « cité, sans fiche » est un majorant
 * qui inclut les pages jamais atteintes et les échecs d'analyse. Un code n'y
 * entre que sur une page effectivement obtenue.
 *
 * Conséquence pour l'appelant : le paramètre est OPTIONNEL, et son absence vaut
 * « je ne sais pas », jamais « aucun ». Sans table, tout manque tombe dans
 * `sansFicheIndetermine` et l'écran énonce les deux issues sans trancher —
 * exactement ce qu'il faisait avant que le champ existe. Un défaut de câblage
 * rend donc l'écran plus prudent, pas plus faux.
 *
 * La date voyage avec le compte, parce que « vu sans crédits le 13 septembre »
 * reste vrai pour toujours alors que « n'a pas de crédits » vieillit mal :
 * l'UdeM peut corriger une page.
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
   * Sujets dont le dépôt n'a rendu AUCUNE fiche **et que ce parcours cite**,
   * triés. L'appartenance au journal est autoritative sur « ce fichier n'existe
   * pas » et ne se déduit jamais des codes (voir l'en-tête) ; le CROISEMENT avec
   * les codes cités, lui, est indispensable.
   *
   * Pourquoi : `assembler()` charge aussi les sujets atteints par les
   * PRÉALABLES, de proche en proche, et inscrit un `manque` pour chacun d'eux
   * qui ne rend rien. Mesuré sur le bacc en criminologie (orientation
   * Intervention) : le bandeau annonçait « aucun fichier pour le sigle NRL »
   * alors que la page ne cite AUCUN code NRL — il venait d'un préalable. La
   * phrase était vraie sur les données et fausse sur ce qu'elle prétendait
   * expliquer, ce qui est la pire des deux erreurs : elle désignait une cause.
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
  /**
   * Codes sans fiche dont la PAGE A ÉTÉ LUE et ne porte aucune étiquette
   * « Crédits ». Ceux-là n'arriveront jamais, quel que soit le nombre de passes.
   */
  sansFicheSansCredits: number;
  /**
   * Codes sans fiche dont on ne sait pas pourquoi : page jamais atteinte,
   * atteinte en erreur, ou table `codesSansCredits` non fournie. Le seul cas où
   * « pas encore » reste une phrase défendable — et encore, sans promesse.
   */
  sansFicheIndetermine: number;
  /**
   * Bornes des dates d'observation des codes stériles de CE parcours, ISO.
   * `null` quand il n'y en a aucun. Deux bornes et non une seule : les codes
   * d'un même parcours sont vus lors de tranches différentes, et afficher la
   * plus récente pour tous leur prêterait une fraîcheur qu'ils n'ont pas.
   */
  observeDu: string | null;
  observeAu: string | null;
  /**
   * Ce qu'on peut DIRE du manque — orthogonal à `niveau`, qui n'en dit que
   * l'ampleur. Un parcours peut être `aucune` et `definitif`, ou `partielle` et
   * `indetermine` : ce sont deux questions différentes, et les fondre en un
   * seul axe obligerait à choisir laquelle taire.
   */
  nature: NatureManque;
}

export type NatureManque =
  /** Rien ne manque. */
  | "sans-manque"
  /** Tous les manquants ont une page lue sans crédits : c'est définitif. */
  | "definitif"
  /** Aucun manquant n'est expliqué : on ne sait pas, et on ne promet pas. */
  | "indetermine"
  /** Les deux à la fois. L'écran doit dire les deux comptes, pas le plus gros. */
  | "mixte";

export function couvertureFiches(
  assemble: CatalogueAssemble,
  /** Codes vus sur une page sans étiquette « Crédits », date d'observation en
   *  valeur — `IndexPrepare.codesSansCredits`. Omis vaut « je ne sais pas » :
   *  voir l'en-tête, § « La troisième absence ». */
  codesSansCredits: ReadonlyMap<string, string> = new Map(),
): Couverture {
  // Le journal est autoritatif sur « ce sujet n'a rendu aucune fiche ».
  // `genre: "manque"` porte un sujet ; les autres genres portent la clé du
  // parcours dans le même champ, d'où le filtre sur le genre.
  //
  // Ce que le journal NE dit pas, c'est si ce parcours cite ce sujet :
  // `assembler()` étend les sujets de proche en proche par les PRÉALABLES, et
  // inscrit un `manque` pour chacun de ceux-là aussi. Le croisement se fait donc
  // plus bas, sur les codes réellement cités et réellement manquants.
  const muets = new Set(
    assemble.catalogue.journal
      .filter((entree) => entree.genre === "manque")
      .map((entree) => entree.sujet),
  );
  const sujetsCitesMuets = new Set<string>();

  // Sur les codes DISTINCTS : un cours cité par trois blocs est un seul titre
  // manquant à l'écran, pas trois. Compter les citations gonflerait le manque
  // des programmes qui répètent un tronc commun dans plusieurs blocs.
  const cites = new Set<string>();
  for (const bloc of assemble.programme.blocs) {
    for (const code of bloc.cours) cites.add(code);
  }

  let avecFiche = 0;
  let sansFicheSujetPresent = 0;
  let sansFicheSansCredits = 0;
  let observeDu: string | null = null;
  let observeAu: string | null = null;

  for (const code of cites) {
    if (assemble.catalogue.cours[code] !== undefined) {
      avecFiche += 1;
      continue;
    }
    const sujet = sujetDeCode(code);
    // Un code que `sujetDeCode()` refuse est déjà signalé comme illisible par
    // `assembler()` ; l'imputer à un fichier de données ferait accuser celui-ci
    // d'un défaut de forme du code.
    if (sujet !== null) {
      if (muets.has(sujet)) sujetsCitesMuets.add(sujet);
      else sansFicheSujetPresent += 1;
    }

    // La table est consultée pour les seuls codes RÉELLEMENT sans fiche. Un
    // code qui y figure et dont la fiche est pourtant là a été corrigé depuis
    // l'observation : c'est la fiche qui fait foi, pas la note d'absence.
    const observeISO = codesSansCredits.get(code);
    if (observeISO !== undefined) {
      sansFicheSansCredits += 1;
      if (observeDu === null || observeISO < observeDu) observeDu = observeISO;
      if (observeAu === null || observeISO > observeAu) observeAu = observeISO;
    }
  }

  const total = cites.size;
  const sansFiche = total - avecFiche;
  const sansFicheIndetermine = sansFiche - sansFicheSansCredits;

  const niveau: NiveauCouverture =
    total === 0
      ? "sans-objet"
      : avecFiche === 0
        ? "aucune"
        : sansFiche === 0
          ? "complete"
          : "partielle";

  const nature: NatureManque =
    sansFiche === 0
      ? "sans-manque"
      : sansFicheIndetermine === 0
        ? "definitif"
        : sansFicheSansCredits === 0
          ? "indetermine"
          : "mixte";

  return {
    cites: total,
    avecFiche,
    sansFiche,
    sujetsSansFichier: [...sujetsCitesMuets].sort(),
    sansFicheSujetPresent,
    part: total === 0 ? null : avecFiche / total,
    niveau,
    sansFicheSansCredits,
    sansFicheIndetermine,
    observeDu,
    observeAu,
    nature,
  };
}
