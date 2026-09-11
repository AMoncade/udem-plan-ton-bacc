/**
 * CONTRAT DE L'IMPORT ICS.
 *
 * Ces types devaient se trouver à la fin de `lib/types.ts` d'après le brief de
 * la session IMPORT ; ils n'y sont pas (vérifié sur 37d8cb7). `lib/types.ts`
 * étant GELÉ, ils vivent ici, dans le seul répertoire que cette session
 * possède. Le jour où l'intégratrice veut les remonter dans le contrat commun,
 * la copie se fait par couper-coller : rien ici ne dépend de `lib/ics`.
 *
 * LA RÈGLE QUI GOUVERNE TOUT LE RESTE — un horaire atteste qu'un cours a été
 * SUIVI, jamais qu'il a été RÉUSSI. Un cours abandonné au mois d'octobre et un
 * cours échoué au final laissent exactement la même trace dans un horaire
 * Synchro qu'un cours réussi. L'import PROPOSE donc, et l'étudiant COCHE.
 * Aucune fonction de ce répertoire n'écrit dans l'état de l'étudiant.
 */
import type { CodeCours, Trimestre } from "../types";

/** Un cours repéré dans un horaire : une PROPOSITION, pas un acquis. */
export interface CoursTrouveICS {
  /** Normalisé par `extraireCodes()` : « MAT 1400 ». */
  code: CodeCours;
  /**
   * Titre reconnaissable, tiré du SUMMARY ou de la DESCRIPTION selon le
   * générateur (les deux formes existent dans la nature, voir `lire.ts`).
   * `null` quand le fichier ne porte que le sigle : on n'invente pas un titre.
   */
  libelle: string | null;
  /**
   * Séances de COURS réellement datées, RRULE dépliée et EXDATE retirées.
   * Sert à jauger : zéro séance et un seul examen, c'est douteux ; vingt-six
   * séances, le cours a été suivi.
   *
   * Un évènement sans date lisible compte pour une séance, faute de mieux.
   */
  nbSeances: number;
  /**
   * Évènements PONCTUELS : examens, échéances StudiUM, rendez-vous. Comptés à
   * part parce qu'un examen atteste encore moins qu'une séance — un étudiant
   * peut se présenter à l'intra et abandonner ensuite. Huit des 27 évènements de
   * l'horaire réel observé sont des examens.
   *
   * Distingués par `CATEGORIES` quand le fichier en porte (format v2), sinon par
   * l'absence de `RRULE` (format v1, où les séances en ont toujours une et les
   * examens jamais). Une vraie séance unique sans récurrence tombe donc ici :
   * c'est pourquoi l'écran montre les deux nombres ET les SUMMARY, plutôt qu'un
   * verdict.
   */
  nbPonctuels: number;
  /** Nombre de VEVENT qui ont mené à ce cours, avant dépliage des récurrences. */
  nbEvenements: number;
  /** Déduit des DTSTART. `null` si aucune date lisible ou si elles se contredisent. */
  trimestre: Trimestre | null;
  /**
   * Vrai quand la dernière séance datée est passée. Faux veut dire « le
   * trimestre n'est pas fini » : la note n'existe pas encore, cocher « fait »
   * serait une affirmation sur l'avenir.
   */
  trimestreTermine: boolean;
  /**
   * Première et dernière date du fichier pour ce cours, « AAAA-MM-JJ »,
   * EXAMENS COMPRIS : la fin réelle d'un trimestre est l'examen final, pas la
   * dernière séance.
   */
  premiereSeance: string | null;
  derniereSeance: string | null;
  /**
   * Les SUMMARY distincts qui ont mené à ce code, tels qu'écrits dans le
   * fichier. C'est la pièce justificative : quand `libelle` est `null`, c'est
   * tout ce que l'étudiant a pour reconnaître le cours, et dans tous les cas il
   * peut vérifier que la proposition ne sort pas de nulle part.
   */
  resumes: string[];
  /** Tout ce que la lecture a dû supposer ou n'a pas su déplier, en français. */
  remarques: string[];
}

/**
 * Un évènement écarté. Il n'y a PAS de sortie silencieuse : un import qui
 * jette la moitié du fichier sans le dire est pire qu'un import qui échoue.
 */
export interface EvenementIgnoreICS {
  /** Rang du VEVENT dans le fichier, 1 pour le premier. */
  rang: number;
  /** SUMMARY tel quel, déséchappé. `null` si la propriété manque. */
  resume: string | null;
  /** Valeur brute de DTSTART, telle qu'écrite. */
  debut: string | null;
  raison: string;
}

export interface ResultatImportICS {
  /** Trié par nombre de séances décroissant : le plus crédible en haut. */
  cours: CoursTrouveICS[];
  ignores: EvenementIgnoreICS[];
  /** Total des VEVENT rencontrés. `cours` + `ignores` doivent l'expliquer en entier. */
  nbEvenements: number;
  /** X-WR-CALNAME tel quel (« UdeM — Automne 2026 »), `null` si absent. */
  calendrier: string | null;
  /** Trimestre déclaré par le nom du calendrier, s'il s'y lit. */
  trimestreDeclare: Trimestre | null;
  /** Faux quand le texte n'est pas de l'ICS : aucun BEGIN:VCALENDAR trouvé. */
  estICS: boolean;
  /** Problèmes portant sur le fichier entier, en français, à afficher. */
  problemes: string[];
}
