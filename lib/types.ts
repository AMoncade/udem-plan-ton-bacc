/**
 * CONTRAT DE DONNÉES — source unique de vérité.
 *
 * Ce fichier est l'entrée commune du scraper (qui le produit), du moteur
 * (qui le consomme) et de l'UI (qui l'affiche). Il est GELÉ : toute
 * modification doit passer par la session intégratrice, parce qu'un champ
 * renommé ici casse silencieusement deux autres sessions.
 *
 * Sources vérifiées le 2026-09-10 :
 *   - page de cours    https://admission.umontreal.ca/cours-et-horaires/cours/act-2250/
 *   - page de structure https://admission.umontreal.ca/programmes/baccalaureat-en-mathematiques/structure-du-programme/
 */

/** Code de cours NORMALISÉ : trois lettres, espace, quatre chiffres. « ACT 2250 ».
 *  Attention : UdeM écrit le même cours de trois façons selon l'endroit —
 *  « ACT 2250 » (page de structure), « ACT2250 » (ligne de préalables),
 *  « act-2250 » (URL). Tout passe par normaliserCode() avant comparaison. */
export type CodeCours = string;

export type Saison = "Automne" | "Hiver" | "Été";

export interface Trimestre {
  saison: Saison;
  annee: number;
}

/**
 * Arbre de préalables. UdeM écrit des codes propres reliés par ET/OU
 * (ex. ACT-2250 : « ACT1240 ET MAT1720 »), ce qui se parse sans NLP.
 *
 * `opaque` est le filet de sécurité OBLIGATOIRE : toute condition non
 * mécanisable (« autorisation du département », « avoir réussi 30 crédits »)
 * devient un noeud opaque qui conserve le texte. Un noeud opaque ne bloque
 * JAMAIS un cours dans le moteur — il lève un avertissement à l'écran.
 * Ne jamais le faire disparaître en silence : c'est exactement le cas où un
 * repli muet rend l'audit faux sans que rien n'échoue.
 */
export type NoeudPrealable =
  | { genre: "cours"; code: CodeCours }
  | { genre: "et"; enfants: NoeudPrealable[] }
  | { genre: "ou"; enfants: NoeudPrealable[] }
  | { genre: "opaque"; texte: string };

export interface Cours {
  code: CodeCours;
  titre: string;
  credits: number;
  cycle: string;
  faculte: string | null;
  description: string;
  /** Texte verbatim de la ligne « Préalables », ou null si le champ est ABSENT
   *  de la page. Absent est le cas normal (IFT 1015, ECN 2165 n'en ont pas) —
   *  ce n'est pas une erreur de scrape. */
  prealablesBrut: string | null;
  /** Résultat du parsing de prealablesBrut. null <=> prealablesBrut est null. */
  prealables: NoeudPrealable | null;
  concomitantsBrut: string | null;
  /** Trimestres où le cours est OFFERT. Contrainte dure du planificateur :
   *  ACT 2251 n'existe qu'à l'hiver, donc la moitié du bloc 75C n'est pas
   *  librement plaçable. C'est la valeur ajoutée principale du projet. */
  trimestres: Trimestre[];
  url: string;
  /** ISO 8601. Une donnée scrapée sans date de scrape est invérifiable. */
  scrapeISO: string;
}

/** Règle de crédits d'un bloc, telle qu'écrite sur la page de structure.
 *  « Obligatoire - 26 crédits » / « Option - Minimum 12 crédits, maximum 27 crédits »
 *  / « Option - Maximum 13 crédits » (sans minimum) / « Choix - 3 crédits ». */
export type RegleBloc =
  | { type: "obligatoire"; credits: number }
  | { type: "option"; min: number | null; max: number | null }
  | { type: "choix"; credits: number };

export interface Bloc {
  /** « 01A », « 75C ». Unique dans un programme. */
  id: string;
  /** « 01 », « 75 ». */
  segment: string;
  nom: string;
  regle: RegleBloc;
  /** Codes normalisés. Vide pour un bloc « Choix » (n'importe quel cours). */
  cours: CodeCours[];
  regleBrut: string;
}

export interface Programme {
  id: string;
  nom: string;
  orientation: string | null;
  creditsTotal: number;
  blocs: Bloc[];
  url: string;
  scrapeISO: string;
}

/** Ce que le scraper écrit sur disque et ce que l'app lit. */
export interface Catalogue {
  programmes: Programme[];
  cours: Record<CodeCours, Cours>;
  /** Chaque ligne de préalables que le parseur n'a PAS su réduire à des codes.
   *  Doit être vide ou courte et inspectée à la main. Un parseur qui ne
   *  rapporte rien parce qu'il avale tout en `opaque` est un parseur cassé. */
  prealablesNonParses: { code: CodeCours; brut: string }[];
  scrapeISO: string;
}

// ---------------------------------------------------------------------------
// RÉSULTATS D'AUDIT — partagés entre le moteur (qui les produit) et l'UI (qui
// les affiche). Gelés pour que l'UI puisse être écrite avant le moteur.
// ---------------------------------------------------------------------------

/** État d'un cours pour un étudiant donné.
 *  `avertissement` = préalables satisfaits côté codes, mais la fiche porte une
 *  condition opaque (« autorisation du département ») : jamais verrouillé,
 *  toujours signalé. */
export type EtatCours = "fait" | "disponible" | "verrouille" | "avertissement";

export interface DiagnosticCours {
  code: CodeCours;
  etat: EtatCours;
  /** Codes manquants qui expliquent un état `verrouille`. */
  manquants: CodeCours[];
  /** Textes des noeuds opaques rencontrés, pour affichage tel quel. */
  avertissements: string[];
}

export interface EtatBloc {
  idBloc: string;
  /** Crédits effectivement attribués à ce bloc (un cours ne compte que dans un
   *  seul bloc, même s'il apparaît dans plusieurs). */
  creditsAttribues: number;
  /** Crédits qu'il reste à obtenir pour atteindre le minimum du bloc. */
  creditsManquants: number;
  /** Crédits au-delà du maximum du bloc : ils ne comptent pas vers le diplôme. */
  creditsPerdus: number;
  conforme: boolean;
  coursAttribues: CodeCours[];
}

export interface Audit {
  idProgramme: string;
  blocs: EtatBloc[];
  creditsTotal: number;
  creditsObligatoires: number;
  creditsOption: number;
  creditsChoix: number;
  /**
   * Vrai seulement si TOUTES les contraintes tiennent ensemble : chaque bloc
   * dans ses bornes ET les totaux par type de bloc atteints.
   *
   * Le piège central du projet : pour l'actuariat, les minimums des blocs
   * d'option font 18 crédits alors que le programme en exige 33. Un audit
   * bloc-par-bloc conclut « conforme » sur un parcours qui ne diplôme pas.
   */
  conforme: boolean;
  /** Explications lisibles de chaque non-conformité, en français. */
  problemes: string[];
}
