/**
 * LA SEMAINE, EN UNE SEULE GRILLE — et pourquoi une seule.
 *
 * ## Ce que la donnée dit, et ce qu'elle interdit de dessiner
 *
 * `Seance` porte une fenêtre `du`/`au` : un cours ne siège pas tout le
 * trimestre, il siège par blocs de semaines autour des congés. Mesuré sur
 * `data/cours/` le 2026-09-13, automne 2026, charges de cinq cours :
 * **0,1 séance de routine sur 10 couvre cent jours ou plus.** Presque aucune ne
 * court le trimestre entier.
 *
 * Donc une grille MUETTE SUR LES DATES serait fausse à peu près partout : elle
 * promettrait « toutes les semaines » d'un créneau qui s'arrête à la mi-octobre.
 * Chaque case porte ses fenêtres, et c'est ce qui permet de n'en dessiner
 * qu'une.
 *
 * ## Pourquoi une seule grille et non une par période
 *
 * On a d'abord cru qu'il en faudrait quatre ou cinq, une par « forme de
 * semaine ». C'était une erreur de modèle, pas de calcul : **sur les 10,1
 * créneaux de routine d'une charge de cinq cours, 4,8 sont des répétitions du
 * MÊME cours, le même jour, à la même heure** — seules leurs fenêtres diffèrent.
 * Compter les fenêtres revenait à compter les congés du calendrier
 * universitaire. Fusionnées, il reste environ cinq cases occupées et un
 * empilement maximal de 1,4 : une case tient un cours, exceptionnellement deux.
 *
 * ## Trois natures de séance, et aucune ne se perd
 *
 *  - **routine** : créneau attribué, fenêtre d'au moins sept jours. Le critère
 *    se DÉMONTRE et ne se choisit pas — une fenêtre plus courte qu'une semaine
 *    ne peut pas contenir son jour de semaine deux fois, donc ce qui s'y passe
 *    n'a lieu qu'une fois et n'est pas un rendez-vous hebdomadaire ;
 *  - **événement** : créneau attribué, fenêtre plus courte. 40 % des séances
 *    publiées — examens, séances uniques. Mis dans une liste de dates. Les
 *    peindre dans la grille ferait croire à un cours hebdomadaire de plus ;
 *  - **sans créneau** : `nonAttribue` (la page le déclare ainsi) ou `illisible`.
 *    Ceux-là ne sont NI dans la grille NI dans les événements, et c'est
 *    justement pour ça qu'ils doivent ressortir : une séance absente de l'écran
 *    se lit comme une séance qui n'existe pas, et l'étudiant bâtirait sa semaine
 *    autour d'un trou qui n'en est pas un.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne détecte aucun conflit : `lib/engine/horaires.ts` le fait, séance par
 * séance, et rend des constats qui nomment les deux fenêtres exactes. La grille
 * les reçoit et les peint ; elle n'en juge pas. Elle ne choisit pas non plus la
 * section — les sections sont des alternatives, jamais additives, et empiler
 * les douze sections de `MAT 1400` afficherait le cours douze fois le jeudi à
 * 8 h 30 en signalant onze conflits avec lui-même.
 */
import type { CodeCours, JourSemaine, Seance } from "../../lib/types";

/** L'ordre de la semaine. `Date.getDay()` commence au dimanche ; un étudiant
 *  non. Une liste explicite plutôt qu'un calcul, pour que l'ordre affiché ne
 *  dépende ni de la locale ni du fuseau. */
export const JOURS: readonly JourSemaine[] = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

/**
 * Le seuil qui sépare une routine d'un événement, EN JOURS.
 *
 * Sept, et ce n'est pas un réglage. Une fenêtre `du`/`au` de moins de sept
 * jours d'écart ne peut contenir un jour de semaine donné qu'une seule fois :
 * ce qui s'y passe n'a donc lieu qu'une fois. À sept jours d'écart exactement,
 * le jour revient une seconde fois — c'est le premier écart où « hebdomadaire »
 * veut dire quelque chose.
 */
const ECART_HEBDOMADAIRE = 7;

const JOUR_MS = 86_400_000;

/** Écart en jours entre deux dates ISO. `-1` si l'une est illisible : une date
 *  qu'on ne sait pas lire ne doit pas devenir un écart de zéro, qui classerait
 *  la séance en événement sans que rien ne le dise. */
function ecartJours(du: string, au: string): number {
  const a = Date.parse(du);
  const b = Date.parse(au);
  if (Number.isNaN(a) || Number.isNaN(b)) return -1;
  return (b - a) / JOUR_MS;
}

export interface Fenetre {
  du: string;
  au: string;
}

/** Un cours à un créneau hebdomadaire, avec toutes les fenêtres où il y siège.
 *  Les fenêtres sont la RAISON D'ÊTRE de la fusion : elles seules disent quand
 *  la case est vraie. */
export interface CaseGrille {
  code: CodeCours;
  section: string;
  jour: JourSemaine;
  debutMin: number;
  finMin: number;
  /** Triées par date de début. Plusieurs parce que la page publie l'horaire par
   *  blocs de semaines ; une seule quand le cours siège d'un trait. */
  fenetres: Fenetre[];
  /**
   * Sous-colonne dans laquelle dessiner la case, à partir de 0.
   *
   * Sans elle, deux cases qui se croisent le même jour se superposeraient et
   * l'une cacherait l'autre — or deux cases qui se croisent est EXACTEMENT ce
   * qu'on veut montrer. Le pire cas serait qu'un conflit d'horaire soit rendu
   * invisible par le fait même qu'il en est un.
   *
   * Le croisement se mesure sur les HEURES seules, sans regarder les dates : la
   * grille est une enveloppe, et deux cours qui occupent le même créneau à des
   * semaines différentes doivent quand même être lisibles tous les deux. C'est
   * le moteur de `lib/engine/horaires.ts` qui dit lesquels se chevauchent
   * VRAIMENT, dates comprises — la mise en page ne juge de rien.
   */
  voie: number;
  /** Vrai quand cette case porte exactement le motif de dates dominant. L'écran
   *  peut alors taire ses dates, puisqu'elles sont annoncées une fois pour
   *  toutes au-dessus de la grille. */
  suitLeMotif: boolean;
}

export interface Evenement {
  code: CodeCours;
  section: string;
  jour: JourSemaine;
  debutMin: number;
  finMin: number;
  du: string;
  au: string;
}

export interface SansCreneau {
  code: CodeCours;
  section: string;
  /** « non attribué » tel que la page le déclare, ou le texte illisible gardé
   *  verbatim. Jamais résumé : c'est tout ce qu'on a. */
  motif: string;
  du: string;
  au: string;
}

export interface Grille {
  cases: CaseGrille[];
  evenements: Evenement[];
  sansCreneau: SansCreneau[];
  /** Bornes en minutes de ce qui est réellement occupé, pour que l'écran ne
   *  dessine pas une journée de 24 h dont 19 sont vides. `null` quand aucune
   *  case n'est occupée. */
  bornes: { debutMin: number; finMin: number } | null;
  /** Les jours à AFFICHER : du premier au dernier occupé, trous compris. Un
   *  mercredi vide entre deux journées pleines est une information — c'est une
   *  journée libre — alors qu'un dimanche vide en bout de semaine n'est que de
   *  la largeur perdue. */
  joursAffiches: JourSemaine[];
  /** Combien de sous-colonnes chaque jour exige. 1 presque toujours : mesuré,
   *  l'empilement maximal d'une charge de cinq cours est de 1,4. */
  voiesParJour: Record<string, number>;
  /**
   * Les fenêtres quand TOUTES les cases portent exactement les mêmes, 
   * sinon.
   *
   * Découvert à l'écran et pas autrement : sur une charge d'hiver, les neuf
   * cases affichaient « 2 périodes » — les mêmes deux, celles que la semaine de
   * relâche découpe pour tout le monde. Neuf répétitions d'un fait unique, dans
   * l'espace le plus rare de l'écran, et le fait lui-même illisible parce que
   * réduit à un compte.
   *
   * PAS « toutes », et c'est une correction. La première version exigeait
   * l'identité complète, et sur la charge d'essai HUIT cases sur neuf
   * portaient le même motif — la neuvième, STT 1682, finissait son premier bloc
   * une semaine plus tôt. L'exigence stricte faisait donc perdre la
   * simplification aux huit à cause de l'une, alors que cette unique différence
   * est justement ce qu'il faut voir.
   *
   * Le motif dominant est annoncé une fois au-dessus de la grille ; les cases
   * qui le suivent se taisent, celles qui s'en écartent portent LEURS dates et
   * ressortent d'autant mieux. Il faut qu'il couvre plus de la moitié des cases
   * et au moins deux : en deçà, ce n'est plus un motif mais une case parmi
   * d'autres, et l'annoncer ferait passer les autres pour des exceptions.
   */
  fenetresDominantes: Fenetre[] | null;
}

/** Ce qu'un appelant fournit par cours : la section CHOISIE et ses séances.
 *  Jamais un `Cours` — il porterait toutes les sections à la fois. */
export interface Inscription {
  code: CodeCours;
  section: string;
  seances: Seance[];
}

export function construireGrille(inscriptions: Inscription[]): Grille {
  const parCle = new Map<string, CaseGrille>();
  const evenements: Evenement[] = [];
  const sansCreneau: SansCreneau[] = [];

  for (const { code, section, seances } of inscriptions) {
    for (const seance of seances) {
      const { creneau } = seance;

      if (creneau.genre === "nonAttribue") {
        sansCreneau.push({
          code,
          section,
          motif: "la page déclare cette séance « non attribuée » : aucun jour ni heure",
          du: seance.du,
          au: seance.au,
        });
        continue;
      }
      if (creneau.genre === "illisible") {
        /* NE PAS DIRE « illisible » À L'ÉTUDIANT, et c'est une correction
           demandée par le chantier scraper. Le genre s'appelle ainsi parce que
           le créneau n'a pas pu être ramené à un jour et des heures — mais sur
           29 lignes du catalogue, la page a été lue sans le moindre problème :
           elle donne les JOURS et ne donne pas l'heure, et aucun genre du
           contrat ne dit ça. Écrire « horaire illisible » accuserait l'outil
           d'un manque qui vient de la source, et enverrait chercher un bogue
           là où il n'y en a pas. Le texte brut est rendu tel quel : il porte
           souvent l'information utile. */
        sansCreneau.push({
          code,
          section,
          motif: `pas de jour et d'heure exploitables pour cette séance ; la page indique : « ${creneau.brut} »`,
          du: seance.du,
          au: seance.au,
        });
        continue;
      }

      const ecart = ecartJours(seance.du, seance.au);
      if (ecart < 0) {
        // Une fenêtre illisible n'est ni une routine ni un événement : la
        // classer d'office en événement lui inventerait une date unique.
        sansCreneau.push({
          code,
          section,
          motif: `dates non analysables (« ${seance.du} » → « ${seance.au} ») : impossible de dire quand ce créneau s'applique`,
          du: seance.du,
          au: seance.au,
        });
        continue;
      }

      if (ecart < ECART_HEBDOMADAIRE) {
        evenements.push({
          code,
          section,
          jour: creneau.jour,
          debutMin: creneau.debutMin,
          finMin: creneau.finMin,
          du: seance.du,
          au: seance.au,
        });
        continue;
      }

      // La fusion. La clé porte la SECTION en plus du code : deux sections d'un
      // même cours au même créneau sont deux choses différentes, et l'appelant
      // n'est pas censé en fournir deux — mais s'il le fait, les confondre
      // masquerait précisément ce qu'il faut lui montrer.
      const cle = `${code}|${section}|${creneau.jour}|${creneau.debutMin}|${creneau.finMin}`;
      const existante = parCle.get(cle);
      if (existante === undefined) {
        parCle.set(cle, {
          code,
          section,
          jour: creneau.jour,
          debutMin: creneau.debutMin,
          finMin: creneau.finMin,
          fenetres: [{ du: seance.du, au: seance.au }],
          voie: 0,
          suitLeMotif: false,
        });
      } else {
        existante.fenetres.push({ du: seance.du, au: seance.au });
      }
    }
  }

  const cases = [...parCle.values()];
  for (const c of cases) c.fenetres.sort((a, b) => a.du.localeCompare(b.du));
  cases.sort(
    (a, b) =>
      JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) ||
      a.debutMin - b.debutMin ||
      a.code.localeCompare(b.code, "fr"),
  );

  evenements.sort(
    (a, b) => a.du.localeCompare(b.du) || a.debutMin - b.debutMin || a.code.localeCompare(b.code, "fr"),
  );
  sansCreneau.sort((a, b) => a.code.localeCompare(b.code, "fr") || a.du.localeCompare(b.du));

  const voiesParJour = poserVoies(cases);
  const dominantes = motifDominant(cases);
  const signatureDominante = dominantes === null ? null : signatureFenetres(dominantes);
  for (const c of cases) {
    c.suitLeMotif =
      signatureDominante !== null && signatureFenetres(c.fenetres) === signatureDominante;
  }

  return {
    cases,
    evenements,
    sansCreneau,
    bornes: bornesDe(cases),
    joursAffiches: joursDe(cases),
    voiesParJour,
    fenetresDominantes: dominantes,
  };
}

/**
 * Range les cases d'un même jour en sous-colonnes, par balayage : chaque case
 * prend la première voie libre à son heure de début.
 *
 * Glouton et suffisant — la mesure donne 1,4 case au maximum sur un même
 * créneau, donc l'optimalité ne se voit jamais. Un algorithme d'intervalles
 * complet serait plus difficile à relire pour un gain qui n'existe pas à cette
 * échelle.
 *
 * Les cases arrivent déjà triées par jour puis par heure de début, ce dont le
 * balayage dépend : une case qui arriverait avant une autre commencée plus tôt
 * se verrait attribuer une voie déjà occupée.
 */
function poserVoies(cases: CaseGrille[]): Record<string, number> {
  const compte: Record<string, number> = {};
  for (const jour of JOURS) {
    const dujour = cases.filter((c) => c.jour === jour);
    /** Heure de fin de la dernière case posée sur chaque voie. */
    const finDeVoie: number[] = [];
    for (const c of dujour) {
      let voie = finDeVoie.findIndex((fin) => fin <= c.debutMin);
      if (voie === -1) {
        voie = finDeVoie.length;
        finDeVoie.push(c.finMin);
      } else {
        finDeVoie[voie] = c.finMin;
      }
      c.voie = voie;
    }
    if (dujour.length > 0) compte[jour] = finDeVoie.length;
  }
  return compte;
}

/** La signature complète d'un jeu de fenêtres. Complète et non partielle : deux
 *  cases qui partagent une fenêtre sur trois ne suivent pas le même motif, et
 *  les confondre annoncerait pour l'une des dates qui sont celles de l'autre. */
function signatureFenetres(fenetres: Fenetre[]): string {
  return fenetres.map((f) => `${f.du}..${f.au}`).join("|");
}

/** Le motif suivi par plus de la moitié des cases, et par au moins deux. */
function motifDominant(cases: CaseGrille[]): Fenetre[] | null {
  if (cases.length < 2) return null;
  const comptes = new Map<string, { n: number; fenetres: Fenetre[] }>();
  for (const c of cases) {
    const cle = signatureFenetres(c.fenetres);
    if (cle === "") continue;
    const vu = comptes.get(cle);
    if (vu === undefined) comptes.set(cle, { n: 1, fenetres: c.fenetres });
    else vu.n += 1;
  }
  let meilleur: { n: number; fenetres: Fenetre[] } | null = null;
  for (const v of comptes.values()) {
    if (meilleur === null || v.n > meilleur.n) meilleur = v;
  }
  if (meilleur === null || meilleur.n < 2) return null;
  return meilleur.n * 2 > cases.length ? meilleur.fenetres : null;
}

function bornesDe(cases: CaseGrille[]): { debutMin: number; finMin: number } | null {
  if (cases.length === 0) return null;
  let debutMin = Infinity;
  let finMin = -Infinity;
  for (const c of cases) {
    debutMin = Math.min(debutMin, c.debutMin);
    finMin = Math.max(finMin, c.finMin);
  }
  return { debutMin, finMin };
}

function joursDe(cases: CaseGrille[]): JourSemaine[] {
  if (cases.length === 0) return [];
  const occupes = new Set(cases.map((c) => c.jour));
  const indices = JOURS.map((j, i) => (occupes.has(j) ? i : -1)).filter((i) => i >= 0);
  const premier = Math.min(...indices);
  const dernier = Math.max(...indices);
  return JOURS.slice(premier, dernier + 1);
}

/**
 * « 15 h 30 ». La page écrit les fins en :29 et :59 — « De 15 h 30 à 16 h 29 » —
 * et c'est ce qui fait que deux créneaux consécutifs ne se touchent pas.
 *
 * NE JAMAIS ARRONDIR POUR LE CALCUL : 16 h 29 arrondi à 16 h 30 transforme tout
 * créneau adjacent en conflit. L'affichage, lui, peut arrondir, et c'est ce que
 * fait `finArrondie` — deux fonctions distinctes pour que l'arrondi cosmétique
 * ne puisse pas fuir dans une comparaison.
 */
export function heure(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** L'heure de fin telle qu'on l'affiche : `16 h 29` devient `16 h 30`. Un
 *  étudiant lit un horaire, pas un intervalle semi-ouvert. Réservé à
 *  l'affichage — voir l'avertissement de `heure`. */
export function finArrondie(minutes: number): string {
  return heure(minutes % 60 === 29 || minutes % 60 === 59 ? minutes + 1 : minutes);
}

/** « du 31 août au 16 octobre ». Sans l'année quand les deux bornes la
 *  partagent : elle est déjà dans le titre du trimestre, et la répéter deux
 *  fois par case pour cinq cases fait dix répétitions d'une information connue. */
export function fenetreLisible(f: Fenetre, avecAnnee = false): string {
  const d = jourLisible(f.du, avecAnnee);
  const a = jourLisible(f.au, avecAnnee);
  return d === a ? `le ${d}` : `du ${d} au ${a}`;
}

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Une date ISO en clair, SANS passer par `new Date()` : `new Date("2026-09-13")`
 *  est interprétée en UTC puis affichée dans le fuseau local, ce qui recule la
 *  date d'un jour à l'ouest de Greenwich. Le découpage de la chaîne n'a pas ce
 *  défaut et ne dépend d'aucun fuseau. */
export function jourLisible(iso: string, avecAnnee = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m === null) return iso;
  const jour = Number(m[3]);
  const mois = MOIS[Number(m[2]) - 1] ?? m[2];
  const debut = `${jour}${jour === 1 ? "er" : ""} ${mois}`;
  return avecAnnee ? `${debut} ${m[1]}` : debut;
}
