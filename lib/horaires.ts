/**
 * Projection de l'aperçu des horaires — le seul endroit qui choisit une section
 * et le seul qui décide si une séance est active à une date.
 *
 * POURQUOI ICI PLUTÔT QUE CHEZ LE MOTEUR OU L'UI. Les deux en ont besoin, et
 * c'est précisément la fonction où une divergence serait invisible : si l'écran
 * projette une section et que le calcul en projette une autre, l'étudiant voit
 * une grille sans conflit et un verdict qui en annonce un, sans qu'aucun test ne
 * tombe. Même raison que `blocsDuCheminement()` dans `lib/parcours.ts`.
 *
 * L'INVARIANT QUI GOUVERNE TOUT CE FICHIER : **un étudiant suit UNE section par
 * cours.** Les séances de sections différentes ne s'additionnent jamais.
 * Dédupliquer ne suffit pas : ça marcherait sur `MAT 1400`, qui publie douze
 * sections pour deux tables identiques à l'octet, et échouerait sur `ALL 1901`,
 * dont les quatre sections divergent réellement — là il n'y a rien à
 * dédupliquer, et empiler resterait faux. Projeter, jamais agréger.
 */
import type { ApercuTrimestre, Seance, Trimestre } from "./types";

const memeTrimestre = (a: Trimestre, b: Trimestre): boolean =>
  a.saison === b.saison && a.annee === b.annee;

const libelle = (t: Trimestre): string => `${t.saison} ${t.annee}`;

/**
 * Les sections publiées pour ce trimestre, dans l'ordre de la page.
 *
 * Sert au sélecteur de l'UI et au pré-contrôle du moteur : appeler ceci avant
 * `seancesDeSection` évite de provoquer une erreur pour une question qu'on
 * pouvait poser. Rend `[]` quand le trimestre n'a rien de publié — état normal,
 * 43 % des pages portent leur section d'horaire vide.
 */
export function sectionsDuTrimestre(
  apercus: ApercuTrimestre[] | undefined,
  trimestre: Trimestre,
): string[] {
  if (apercus === undefined) return [];
  const a = apercus.find((x) => memeTrimestre(x.trimestre, trimestre));
  return a === undefined ? [] : a.sections.map((s) => s.nom);
}

/**
 * Les séances d'UNE section, pour un trimestre donné.
 *
 * LÈVE plutôt que de rendre `[]` quand la question n'a pas de réponse. Un
 * tableau vide se lirait « aucune séance, donc aucun conflit » — le repli
 * rassurant, qui est le pire des deux : il transforme une ignorance en
 * autorisation. Trois cas distincts, trois messages :
 *
 *  - `apercus` absent  : la fiche est antérieure au champ, on n'a PAS regardé.
 *    Ce n'est pas « ce cours n'a pas d'horaire » ;
 *  - trimestre absent  : rien n'est publié pour ce trimestre — vérifiable avec
 *    `sectionsDuTrimestre`, qui rend `[]` sans lever ;
 *  - section absente   : le nom demandé n'existe pas ici. Les libellés sont
 *    verbatim (`A`, `A1`, `A101`) et ne sont PAS interchangeables ; une
 *    comparaison qui échoue sur une normalisation silencieuse viderait la
 *    grille de l'étudiant sans rien signaler.
 */
export function seancesDeSection(
  apercus: ApercuTrimestre[] | undefined,
  trimestre: Trimestre,
  nomSection: string,
): Seance[] {
  if (apercus === undefined) {
    throw new Error(
      `apercuHoraires absent : cette fiche est antérieure au champ, donc on n'a ` +
        `pas regardé s'il y a des séances. Ce n'est pas « ce cours n'en a pas » — ` +
        `relancer une passe cours avant d'en conclure quoi que ce soit.`,
    );
  }
  const a = apercus.find((x) => memeTrimestre(x.trimestre, trimestre));
  if (a === undefined) {
    throw new Error(
      `aucun horaire publié pour ${libelle(trimestre)} (publiés : ` +
        `${apercus.map((x) => libelle(x.trimestre)).join(", ") || "aucun"}). ` +
        `Utiliser sectionsDuTrimestre() pour poser la question sans lever.`,
    );
  }
  const s = a.sections.find((x) => x.nom === nomSection);
  if (s === undefined) {
    throw new Error(
      `section « ${nomSection} » absente de ${libelle(trimestre)} ` +
        `(sections : ${a.sections.map((x) => x.nom).join(", ") || "aucune"}). ` +
        `Les libellés sont verbatim et ne sont pas interchangeables : « A101 » ` +
        `n'est ni « A1 » ni « A ».`,
    );
  }
  return s.seances;
}

/**
 * Les séances actives à une date donnée.
 *
 * PARCE QUE « LA SEMAINE TYPE » N'EXISTE PAS. Mesuré sur le catalogue : 7 498
 * sections sur 9 344 changent de motif en cours de trimestre, jusqu'à 27
 * fenêtres pour une seule. `MAT 1400` section A tient mardi ET jeudi jusqu'au
 * 16 octobre, puis jeudi seul. Une grille construite sans date de référence est
 * donc fausse une partie du trimestre, et fausse en silence.
 *
 * Les bornes sont INCLUSIVES des deux côtés, et c'est écrit ici plutôt que
 * laissé à chaque appelant : une comparaison exclusive d'un côté et inclusive
 * de l'autre, entre l'écran et le moteur, ferait disparaître un cours le
 * dernier jour de sa plage chez l'un et pas chez l'autre. Un décalage d'un jour
 * ne se voit pas, ne casse aucun test, et donne deux réponses à la même
 * question.
 *
 * `date` au format ISO `AAAA-MM-JJ`, comme `Seance.du` et `Seance.au` : c'est
 * la seule forme qui se compare comme du texte.
 */
export function seancesActives(seances: Seance[], date: string): Seance[] {
  return seances.filter((s) => s.du <= date && date <= s.au);
}
