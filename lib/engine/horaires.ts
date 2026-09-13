import type {
  ApercuTrimestre,
  CodeCours,
  Creneau,
  JourSemaine,
  Seance,
  SectionHoraire,
  Trimestre,
} from "../types";
import { seancesDeSection } from "../horaires";

/**
 * CHEVAUCHEMENTS D'HORAIRE — ce que le moteur constate, et ce qu'il refuse de juger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE MODULE NE REND PAS DE VERDICT DE FAISABILITÉ, ET C'EST DÉLIBÉRÉ
 *
 * Il serait naturel d'écrire `conflit(coursA, coursB): boolean`. Ce serait faux
 * deux fois.
 *
 * D'abord parce qu'un cours n'a pas UN horaire : il publie des sections, et un
 * étudiant en suit UNE. Comparer deux cours reviendrait à empiler leurs
 * sections — `MAT 1400` publie douze sections pour deux tables identiques à
 * l'octet, on signalerait onze conflits du cours AVEC LUI-MÊME. Dédupliquer ne
 * sauverait rien : `ALL 1901` a quatre sections qui divergent réellement, et
 * empiler y resterait faux. L'invariant n'est pas « les doublons sont du
 * bruit », c'est qu'on suit une section par cours — donc on PROJETTE avant de
 * calculer.
 *
 * Ensuite parce que dire « ce cours reste possible, prends une autre section »
 * suppose de savoir ce qu'est une combinaison valide. La page ne le dit jamais :
 * `A`, `A101` et `A102` coexistent sans que rien ne déclare leur relation — le
 * mot « volet » n'apparaît que sur 7 pages du catalogue. Le déduire du libellé
 * serait deviner d'après un nom, ce que `Bloc.contenuOuvert` existe pour
 * refuser ailleurs dans ce projet.
 *
 * Ce module constate donc des chevauchements entre SÉANCES et nomme ce qu'il ne
 * peut pas établir. La synthèse — « ce plan tient » — appartient à l'écran et à
 * l'étudiant, qui savent, eux, si leur laboratoire est au choix.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉSERVE QUI PORTE SUR TOUTE SORTIE DE CE MODULE
 *
 * La page source titre « APERÇU des horaires » et renvoie au Centre étudiant
 * pour l'à-jour. Une absence de chevauchement calculée ici n'est donc PAS une
 * garantie que l'horaire tient : c'est l'absence de chevauchement dans un
 * aperçu. Le dire est la moitié du travail — voir `RESERVE_APERCU`.
 */

/** À afficher partout où une absence de chevauchement pourrait se lire comme
 *  une garantie. La source le dit d'elle-même : « Aperçu des horaires ». */
export const RESERVE_APERCU =
  "Calculé sur l'APERÇU des horaires publié par l'UdeM, qui renvoie lui-même au Centre étudiant pour l'information à jour. " +
  "L'absence de chevauchement ci-dessus n'est donc pas une garantie que votre horaire tient.";

/** Une séance, replacée dans le cours et la section d'où elle vient. */
export interface RefSeance {
  code: CodeCours;
  /** `SectionHoraire.nom`, verbatim : « A », « A101 ». */
  section: string;
  seance: Seance;
}

/**
 * `chevauche` : les deux séances occupent le même jour, à des heures qui se
 * croisent, pendant des dates qui se croisent. C'est un CONSTAT sur l'aperçu.
 *
 * `indetermine` : on ne peut pas conclure, et `raison` dit pourquoi. Ne jamais
 * le replier sur « pas de conflit » — c'est le repli rassurant, celui qui coûte
 * une session à l'étudiant.
 */
export type EtatChevauchement = "chevauche" | "indetermine";

export interface Chevauchement {
  etat: EtatChevauchement;
  a: RefSeance;
  b: RefSeance;
  /** Le recouvrement effectif, pour que l'écran peigne exactement ces minutes
   *  et ces jours-là. Présent seulement quand `etat === "chevauche"`. */
  recouvrement?: {
    jour: JourSemaine;
    debutMin: number;
    finMin: number;
    /** Dates ISO incluses, intersection des deux fenêtres. */
    du: string;
    au: string;
  };
  /** Présent seulement quand `etat === "indetermine"`. */
  raison?: string;
}

/** Un cours et la section que l'étudiant y suit. Le moteur ne prend jamais un
 *  `Cours` : il prendrait alors toutes les sections à la fois. */
export interface ChoixSection {
  code: CodeCours;
  section: SectionHoraire;
}

// ---------------------------------------------------------------------------

/** Les fenêtres de dates se croisent-elles ? Bornes INCLUSES des deux côtés.
 *  Les dates sont ISO `AAAA-MM-JJ`, donc l'ordre lexical est l'ordre du temps. */
function fenetresSeCroisent(a: Seance, b: Seance): boolean {
  return a.du <= b.au && b.du <= a.au;
}

function intersectionFenetres(a: Seance, b: Seance): { du: string; au: string } {
  return { du: a.du > b.du ? a.du : b.du, au: a.au < b.au ? a.au : b.au };
}

/**
 * Pourquoi un créneau empêche de conclure, ou `null` s'il est exploitable.
 *
 * `switch` exhaustif avec garde `never` : `Creneau` est une union que le
 * scraper étendra, et un genre nouveau qui tomberait dans une branche muette
 * serait traité comme « pas de conflit » — le repli rassurant, invisible.
 */
function empechementDe(creneau: Creneau): string | null {
  switch (creneau.genre) {
    case "attribue":
      return null;
    case "nonAttribue":
      return "la page publie cette séance sans jour ni heure (« Non attribué »)";
    case "illisible":
      return `le créneau de cette séance n'a pas été interprété (« ${creneau.brut} »)`;
    default: {
      const jamais: never = creneau;
      throw new Error(`genre de créneau non traité : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Tous les chevauchements entre les séances d'une sélection.
 *
 * L'entrée est une SÉLECTION — une section par cours — et non une liste de
 * cours. Voir l'en-tête du module pour pourquoi ce n'est pas un détail d'API.
 *
 * Deux séances ne sont comparées que si leurs FENÊTRES DE DATES se croisent.
 * C'est la condition qui porte le plus : 80 % des sections changent de motif en
 * cours de trimestre, et 48 % des séances tiennent en une semaine ou moins
 * (22 % en un seul jour — des examens). Comparer deux séances sur le seul
 * couple jour/heure signalerait des conflits entre un cours de septembre et un
 * examen de décembre.
 */
export function chevauchements(choix: ChoixSection[]): Chevauchement[] {
  const out: Chevauchement[] = [];

  // Un cours cité deux fois est une erreur d'appel, pas une donnée : ses
  // sections sont des alternatives. La signaler bruyamment plutôt que de
  // produire les faux conflits du cours avec lui-même, qui ressemblent à s'y
  // méprendre à de vrais conflits.
  const parCode = new Map<CodeCours, string[]>();
  for (const c of choix) {
    const deja = parCode.get(c.code);
    if (deja) deja.push(c.section.nom);
    else parCode.set(c.code, [c.section.nom]);
  }

  const refs: RefSeance[] = [];
  for (const c of choix) {
    if ((parCode.get(c.code)?.length ?? 0) > 1) continue;
    for (const seance of c.section.seances ?? []) {
      refs.push({ code: c.code, section: c.section.nom, seance });
    }
  }

  for (const [code, sections] of parCode) {
    if (sections.length <= 1) continue;
    const vide: Seance = { creneau: { genre: "nonAttribue" }, du: "", au: "" };
    const ref: RefSeance = { code, section: sections.join(" + "), seance: vide };
    out.push({
      etat: "indetermine",
      a: ref,
      b: ref,
      raison:
        `${code} figure ${sections.length} fois dans la sélection (sections ${sections.join(", ")}). ` +
        `Les sections d'un cours sont des ALTERNATIVES : on en suit une. Ses séances n'ont donc pas été ` +
        `comparées, sans quoi l'écran afficherait des conflits du cours avec lui-même. Choisissez une seule section.`,
    });
  }

  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i];
      const b = refs[j];
      // Deux séances d'un MÊME cours : elles s'additionnent (un cours peut
      // siéger mardi ET jeudi), donc un recouvrement entre elles n'est pas un
      // conflit d'emploi du temps mais une incohérence de la page. Elle est
      // rapportée à ce titre, plus bas.
      if (!fenetresSeCroisent(a.seance, b.seance)) continue;

      const empA = empechementDe(a.seance.creneau);
      const empB = empechementDe(b.seance.creneau);
      if (empA !== null || empB !== null) {
        const quoi = empA !== null ? `${a.code} section ${a.section} : ${empA}` : `${b.code} section ${b.section} : ${empB}`;
        out.push({
          etat: "indetermine",
          a,
          b,
          raison:
            `${quoi}. Leurs dates se croisent, donc un conflit reste possible sans qu'on puisse l'établir. ` +
            `Vérifiez au Centre étudiant.`,
        });
        continue;
      }

      // Les deux sont `attribue` — TypeScript ne le sait pas encore.
      if (a.seance.creneau.genre !== "attribue" || b.seance.creneau.genre !== "attribue") continue;
      const ca = a.seance.creneau;
      const cb = b.seance.creneau;
      if (ca.jour !== cb.jour) continue;
      // Bornes incluses : la page écrit les fins en :29 et :59, donc deux
      // créneaux consécutifs (16 h 29 puis 16 h 30) ne se croisent pas.
      if (ca.debutMin > cb.finMin || cb.debutMin > ca.finMin) continue;

      const { du, au } = intersectionFenetres(a.seance, b.seance);
      out.push({
        etat: "chevauche",
        a,
        b,
        recouvrement: {
          jour: ca.jour,
          debutMin: Math.max(ca.debutMin, cb.debutMin),
          finMin: Math.min(ca.finMin, cb.finMin),
          du,
          au,
        },
      });
    }
  }

  return out;
}

/** Un cours et la section choisie, AVANT projection — ce que l'écran a en main. */
export interface ChoixCours {
  code: CodeCours;
  apercus: ApercuTrimestre[] | undefined;
  trimestre: Trimestre;
  nomSection: string;
}

/**
 * Comme `chevauchements()`, mais en projetant soi-même par
 * `seancesDeSection()` — et en convertissant ses refus en verdicts.
 *
 * `seancesDeSection()` LÈVE sur une fiche sans `apercuHoraires`, sur un
 * trimestre absent et sur une section inconnue. Ces gardes sont justes : rendre
 * un tableau vide y donnerait « aucune séance, donc aucun conflit », le repli
 * rassurant. Mais cette fonction est appelée pendant un rendu, où une exception
 * remplace un écran par une page blanche. On fait donc ici ce que
 * `auditProgramme` fait des gardes de `blocsDuCheminement()` : on les traduit
 * en `indetermine` portant le message d'origine, pour que la garde continue de
 * parler sans faire tomber l'écran.
 */
export function chevauchementsDeSelection(choix: ChoixCours[]): Chevauchement[] {
  const projetes: ChoixSection[] = [];
  const refus: Chevauchement[] = [];

  for (const c of choix) {
    try {
      projetes.push({
        code: c.code,
        section: { nom: c.nomSection, seances: seancesDeSection(c.apercus, c.trimestre, c.nomSection) },
      });
    } catch (erreur) {
      const vide: Seance = { creneau: { genre: "nonAttribue" }, du: "", au: "" };
      const ref: RefSeance = { code: c.code, section: c.nomSection, seance: vide };
      refus.push({
        etat: "indetermine",
        a: ref,
        b: ref,
        raison:
          `${c.code} : horaire non projetable, ce cours n'entre donc dans AUCUNE comparaison ci-dessus — ` +
          `son absence de conflit ne veut rien dire. ` +
          `${erreur instanceof Error ? erreur.message : String(erreur)}`,
      });
    }
  }

  return [...refus, ...chevauchements(projetes)];
}

/**
 * Les chevauchements qui opposent DEUX COURS DIFFÉRENTS — ce qu'un étudiant
 * appelle un conflit.
 *
 * Séparé de `chevauchements()` parce que deux séances d'un même cours qui se
 * recouvrent ne sont pas un conflit d'emploi du temps : c'est la page qui se
 * contredit, et l'étudiant n'y peut rien. Les confondre lui ferait renoncer à
 * un cours pour une incohérence d'amont.
 */
export function conflitsEntreCours(tous: Chevauchement[]): Chevauchement[] {
  return tous.filter((c) => c.a.code !== c.b.code);
}

/** Les recouvrements internes à un cours : une incohérence de la page, à
 *  signaler comme telle et jamais comme un choix à faire. */
export function incoherencesDeCours(tous: Chevauchement[]): Chevauchement[] {
  return tous.filter((c) => c.a.code === c.b.code && c.etat === "chevauche");
}
