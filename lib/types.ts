/**
 * CONTRAT DE DONNÉES — source unique de vérité. Version 2 : tout l'UdeM.
 *
 * La version 1 décrivait un seul programme (l'orientation actuariat) et a été
 * éprouvée sur sept autres : `docs/VALIDATION-AUTRES-PROGRAMMES.md`. Six choses
 * y cassaient. Cette version les corrige, avec pour chacune la raison et
 * l'exemple qui l'a révélée — sans quoi quelqu'un « simplifiera » plus tard un
 * champ qui existe pour une bonne raison.
 *
 * Portée : 1 088 programmes et 11 888 cours, d'après le sitemap officiel du
 * site (16 requêtes, pas un index paginé à deviner).
 *
 * GELÉ : toute modification passe par la session intégratrice. Un champ renommé
 * ici casse silencieusement trois chantiers.
 */

/**
 * Code de cours NORMALISÉ : trois lettres, espace, quatre ou cinq chiffres, et
 * un suffixe d'une lettre optionnel. « ACT 2250 », « DRT 1151G », « PSY 40001 ».
 *
 * La v1 imposait trois lettres + quatre chiffres. Faux : 199 codes suffixés
 * (152 en musique, 36 au certificat en droit) et quatre à cinq chiffres. Et le
 * suffixe DISTINGUE des cours — `cri-1600g` est une fiche différente de
 * `cri-1600`, pas une coquille. Le perdre fusionne deux cours.
 *
 * UdeM écrit le même cours de trois façons : « ACT 2250 » sur la page de
 * structure, « ACT2250 » dans la ligne de préalables, « act-2250 » dans l'URL.
 * Tout passe par normaliserCode() avant comparaison.
 */
export type CodeCours = string;

export type Saison = "Automne" | "Hiver" | "Été";

export interface Trimestre {
  saison: Saison;
  annee: number;
}

// ---------------------------------------------------------------------------
// Préalables
// ---------------------------------------------------------------------------

/**
 * Arbre de préalables. `opaque` est le filet OBLIGATOIRE : toute condition non
 * mécanisable garde son texte et ne bloque JAMAIS un cours — elle lève un
 * avertissement. Ne jamais la faire disparaître en silence.
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
  /** Verbatim de la ligne « Préalables », ou null si le champ est ABSENT de la
   *  page. Absent est le cas normal, pas une erreur de scrape. */
  prealablesBrut: string | null;
  prealables: NoeudPrealable | null;
  concomitantsBrut: string | null;
  /**
   * « Restrictions d'inscription », séparée des préalables.
   *
   * En v1 cette exigence réelle était piégée dans le journal non typé du
   * scraper et rien ne pouvait l'afficher (DMO 1000 :
   * « Restrictions d'inscription: DMO1000/DMO1010 »). Pire, MUI 1162A n'a QUE
   * des restrictions — un parseur qui les confond avec des préalables y voit
   * vingt cours requis.
   */
  restrictionsBrut: string | null;
  /** Trimestres où le cours est OFFERT. Vide = aucune offre publiée, ce qui
   *  n'est pas « jamais offert ». 26 des 55 cours de l'actuariat n'en ont
   *  qu'un seul : c'est la contrainte qui casse un plan. */
  trimestres: Trimestre[];
  url: string;
  scrapeISO: string;
}

// ---------------------------------------------------------------------------
// Blocs et programmes
// ---------------------------------------------------------------------------

/** Bornes de crédits. Une exigence exacte s'écrit min === max. */
export interface Intervalle {
  min: number;
  max: number;
}

/**
 * Règle de crédits d'un bloc.
 *
 * La v1 avait trois variantes distinctes (obligatoire N / option min-max /
 * choix N) et ne couvrait que 4 des 9 formes réellement écrites sur le site.
 * Manquaient `Option - 4 crédits.` (exact, ni min ni max — et c'est sur la page
 * du bacc en maths), `Choix - Maximum 3 crédits.`, `Choix - Minimum 3 crédits,
 * maximum 6 crédits.`, et des variantes en minuscules.
 *
 * Les neuf formes se réduisent toutes à un type plus des bornes, donc c'est ce
 * que le modèle porte. `inconnu` existe pour qu'une forme jamais vue ne soit
 * pas avalée par un `switch` : un bloc `inconnu` ne peut PAS être déclaré
 * conforme, il ressort dans les problèmes.
 */
export type RegleBloc =
  | { type: "obligatoire" | "option" | "choix"; bornes: Intervalle }
  | { type: "inconnu"; brut: string };

export interface Bloc {
  /**
   * Identifiant VERBATIM de la page : « 75C », mais aussi « MM-Bloc 73A ».
   *
   * Il n'est PAS unique dans un programme : la maîtrise en mathématiques porte
   * `MM-Bloc 73A` et `S-Bloc 73A` dans le même segment 73. Un extracteur ancré
   * sur « Bloc » a fusionné 58 cours dans le mauvais bloc pendant la
   * validation, sans lever d'erreur — utiliser `cle` pour identifier.
   */
  id: string;
  /** Clé unique dans le programme : `segment + "/" + id`. */
  cle: string;
  /**
   * Segment LU SUR LA PAGE, jamais déduit de `id`.
   *
   * La v1 le dérivait en retirant les lettres finales de l'id, ce qui marche
   * pour « 75C » et se trompe sur « MM-Bloc 73A ».
   */
  segment: string;
  /** Peut être vide : la page ne nomme ni le bloc 01A ni le bloc 75Z. */
  nom: string;
  regle: RegleBloc;
  /** Verbatim, point final compris (« Obligatoire - 26 crédits. »). */
  regleBrut: string;
  /** Vide pour un bloc « Choix » : n'importe quel cours convient. */
  cours: CodeCours[];
  /**
   * Vrai quand le bloc n'énumère AUCUN cours et décrit son contenu en prose.
   *
   * Ce n'est ni un bloc au choix ni une page mal lue : il existe des blocs
   * « catégorie » dont le contenu renvoie à un ensemble extérieur. Deux cas
   * réels, vérifiés dans le HTML (aucun lien de cours dans le bloc) :
   * `baccalaureat-en-economie-et-politique` 71/71G et `baccalaureat-en-musique`
   * 02/02E, tous deux « Option - maximum 6 crédits » avec pour seule
   * description un renvoi aux cours du Centre de langues.
   *
   * Le distinguer importe parce qu'un tel bloc est INVÉRIFIABLE
   * mécaniquement : l'audit ne doit ni le déclarer satisfait, ni le traiter
   * comme une exigence impossible. Il doit le dire. Sans ce champ, la seule
   * façon de le reconnaître serait de deviner d'après `notes`, c'est-à-dire
   * de coupler deux choses sans le dire.
   */
  contenuOuvert: boolean;
  /**
   * `true` quand la passe a LU ce bloc et n'y a trouvé ni cours ni prose.
   *
   * C'est un CONSTAT, pas un défaut : 50 blocs des 1 088 pages sont réellement
   * vides à cet endroit, surtout dans les certificats d'études individualisées,
   * qui par nature ne listent pas leurs cours. Absent — et non `false` — quand
   * le bloc a du contenu : un `false` sur 5 028 blocs n'apprendrait rien.
   *
   * Pourquoi ce champ plutôt que le journal. L'invariant « tout bloc vide est
   * VU » s'attestait par la présence de la clé dans `data/journal.json`. Or ce
   * journal est ÉCRASÉ à chaque passe, délibérément — il décrit CETTE passe. Le
   * chantier scraper l'a mesuré : une passe « cours » l'a fait tomber de 3 488
   * entrées à 0, puis une autre l'a rempli de 7 794 entrées de cours. Un
   * invariant sur les blocs devenait donc faux sans qu'une ligne de code ait
   * changé. L'attestation doit voyager AVEC ce qu'elle atteste, dans le fichier
   * du programme, dont la passe programmes est le seul écrivain.
   */
  videConstate?: boolean;
  /** Prose normative attachée au bloc, conservée telle quelle. Sans ce champ
   *  elle disparaît au scrape (autorisations, conditions, remarques). */
  notes: string[];
}

/**
 * Exigences de crédits par type, telles que la page les écrit.
 *
 * La v1 n'avait pas ce champ, alors que c'est le coeur du projet : pour
 * l'actuariat la page écrit « 54 crédits obligatoires, 33 crédits à option et
 * 3 crédits au choix », et les minimums des blocs d'option ne totalisent que
 * 18. Le moteur pouvait déduire 33 par 90 − 54 − 3 ; ailleurs c'est impossible
 * parce que ce sont des INTERVALLES : droit écrit « de 30 à 33 à option »,
 * psycho « de 39 à 42 ». Sans ces bornes, `Audit.conforme` n'a rien à comparer.
 */
export interface ExigencesParType {
  brut: string;
  obligatoire: Intervalle | null;
  option: Intervalle | null;
  choix: Intervalle | null;
}

/**
 * Une orientation : un PARCOURS SUIVABLE à l'intérieur d'une page de programme.
 *
 * Ce type existe parce que le contrat confondait deux choses. Un `Programme`
 * est une page, identifiée par son slug ; mais ce qu'un étudiant choisit, c'est
 * un parcours. La page du baccalauréat en mathématiques énonce SEPT
 * répartitions de crédits, une par orientation, plus six par segment — treize
 * phrases, comptées. Avec un seul emplacement `exigences`, désigner celle de
 * l'actuariat aurait été un choix arbitraire déguisé en donnée.
 *
 * L'échelle le confirme : ~545 pages exploitables portent ~964 parcours
 * distincts, 17,3 % des pages ayant des orientations, jusqu'à dix.
 *
 * Les blocs d'un parcours sont ceux de `Programme.blocs` dont le `segment`
 * figure dans `segments`. `projeterOrientation()` dans `lib/parcours.ts` fait
 * cette projection, et c'est le seul endroit qui la fait.
 */
export interface Orientation {
  /** « Actuariat », « Sciences mathématiques »… tel qu'écrit sur la page. */
  nom: string;
  /** Segments qui composent ce parcours : ["01", "75"]. */
  segments: string[];
  exigences: ExigencesParType | null;
}

export interface Programme {
  /** Slug d'URL, unique : « baccalaureat-en-mathematiques ». */
  id: string;
  nom: string;
  /**
   * Renseigné UNIQUEMENT sur un programme déjà projeté sur une orientation
   * (voir `projeterOrientation()`). Sur un programme lu du disque, il vaut
   * null et c'est `orientations` qui porte l'information.
   */
  orientation: string | null;
  /** Segments du parcours. Sur un programme non projeté : tous ses segments. */
  segments: string[];
  /**
   * Les parcours déclarés par la page. Vide quand le programme n'en a qu'un.
   *
   * Quand ce tableau n'est pas vide, `exigences` vaut null : la page énonce
   * plusieurs répartitions et aucune n'est « celle du programme ».
   */
  orientations: Orientation[];
  cycle: string | null;
  faculte: string | null;
  /** « Baccalauréat », « Certificat », « Maîtrise »… tel qu'écrit. */
  typeProgramme: string | null;
  /** Null si la page ne l'annonce pas. Ne jamais supposer 90. */
  creditsTotal: number | null;
  exigences: ExigencesParType | null;
  blocs: Bloc[];
  notes: string[];
  url: string;
  scrapeISO: string;
}

// ---------------------------------------------------------------------------
// Disposition sur disque
// ---------------------------------------------------------------------------

/**
 * Fiche légère d'un programme, pour le sélecteur parmi 1 088 entrées.
 * Sert `data/index-programmes.json`, qui doit rester petit : l'app embarque
 * tout le catalogue, donc on ne charge jamais 12 Mo pour afficher une liste.
 */
export interface FicheIndex {
  /**
   * Clé unique du PARCOURS : le slug, ou `slug + "#" + orientation` quand la
   * page en porte plusieurs. C'est ce que le sélecteur retient et ce que l'URL
   * porte — plusieurs fiches partagent donc le même `id`.
   */
  cle: string;
  /** Slug du programme, donc nom du fichier `data/programmes/<id>.json`. */
  id: string;
  nom: string;
  orientation: string | null;
  cycle: string | null;
  faculte: string | null;
  typeProgramme: string | null;
  creditsTotal: number | null;
  nbBlocs: number;
  /** false quand la page n'a pas de structure exploitable (année
   *  préparatoire, accès-fac…). Le sélecteur le dit au lieu d'ouvrir un vide. */
  structureLue: boolean;
}

export interface IndexProgrammes {
  programmes: FicheIndex[];
  /** Sujets présents dans data/cours/ : ["ACT", "MAT", …]. */
  sujets: string[];
  scrapeISO: string;
  /**
   * Empreinte du CODE d'extraction qui a produit ces données — somme SHA-256
   * du contenu de `scripts/scrape/*.ts`, écrite par le scraper à chaque passe.
   *
   * POURQUOI CE CHAMP EXISTE. Le 2026-09-11, l'extracteur a appris à lire le
   * qualificatif qui distingue deux blocs homonymes (commit 4cdde1a, 13 h 28)
   * et le scrape n'a pas été relancé : `data/` datait de 13 h 09. La suite est
   * devenue rouge sur « clé de bloc en double 70/70A » — un message qui accuse
   * la page amont ou l'extracteur, alors que les deux étaient justes. Il a
   * fallu re-télécharger la page et rejouer l'extracteur dessus pour voir que
   * seules les DONNÉES étaient en retard.
   *
   * `scrapeISO` ne peut pas le dire : il date la passe, pas le code qui l'a
   * faite. L'empreinte apparie les deux, et `tests/coutures.test.ts` compare
   * celle-ci à celle du code présent sur le disque.
   *
   * Optionnel tant que le chantier scraper ne l'écrit pas : un champ absent
   * laisse le test se taire plutôt que de fabriquer un échec.
   */
  empreinteExtracteur?: string;
}

export type GenreEntreeJournal = "info" | "manque" | "inattendu" | "erreur";

/** Entrée de journal TYPÉE. En v1 le journal voyageait dans une clé `_journal`
 *  hors contrat, donc invisible pour l'UI : exactement le repli silencieux que
 *  le projet combat. */
export interface EntreeJournal {
  genre: GenreEntreeJournal;
  /** Programme, bloc ou code de cours concerné. */
  sujet: string;
  message: string;
}

/**
 * Catalogue ASSEMBLÉ EN MÉMOIRE — ce que le moteur consomme.
 *
 * Sur disque, les données sont découpées (index + un fichier par programme +
 * un fichier par sujet de cours) pour qu'aucun chargement ne soit énorme.
 * L'appelant assemble un Catalogue qui ne contient que le programme affiché et
 * les sujets dont il a besoin. Le moteur, lui, n'a pas à le savoir.
 */
export interface Catalogue {
  programmes: Programme[];
  cours: Record<CodeCours, Cours>;
  /** Lignes de préalables que le parseur n'a pas réduites. Doit rester courte
   *  et inspectée : un parseur qui ne rapporte rien parce qu'il avale tout en
   *  `opaque` est un parseur cassé. */
  prealablesNonParses: { code: CodeCours; brut: string }[];
  journal: EntreeJournal[];
  scrapeISO: string;
}

// ---------------------------------------------------------------------------
// Résultats d'audit
// ---------------------------------------------------------------------------

/** `avertissement` = préalables satisfaits côté codes, mais une condition
 *  opaque subsiste, ou le cours n'a pas de fiche. Jamais verrouillé, toujours
 *  signalé. */
export type EtatCours = "fait" | "disponible" | "verrouille" | "avertissement";

export interface DiagnosticCours {
  code: CodeCours;
  etat: EtatCours;
  manquants: CodeCours[];
  avertissements: string[];
}

export interface EtatBloc {
  /** `Bloc.cle`, pas `Bloc.id` : l'id n'est pas unique. */
  cleBloc: string;
  idBloc: string;
  /** Crédits RETENUS vers le diplôme, déjà plafonnés au maximum du bloc. */
  creditsAttribues: number;
  creditsManquants: number;
  /** Crédits au-delà du maximum : réussis, mais qui ne comptent pas. */
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
   * dans ses bornes ET les totaux par type dans les leurs.
   *
   * Le piège central : pour l'actuariat, les minimums des blocs d'option font
   * 18 crédits alors que le programme en exige 33. Un audit bloc-par-bloc
   * déclare « conforme » un parcours qui ne diplôme pas. Le symétrique est
   * aussi vrai : 33 crédits empilés dans un bloc plafonné à 27 n'en donnent
   * que 27.
   */
  conforme: boolean;
  problemes: string[];
}

// ---------------------------------------------------------------------------
// Import d'un relevé
// ---------------------------------------------------------------------------

/**
 * Cours trouvé dans un fichier ICS (export d'horaire Synchro).
 *
 * Un horaire atteste qu'un cours a été SUIVI, pas qu'il a été RÉUSSI. Rien ici
 * ne doit donc marquer un cours comme fait sans confirmation : l'import
 * propose, l'étudiant coche. Affirmer une réussite à sa place produit un audit
 * faux qu'il ne découvrira qu'au moment de s'inscrire.
 */
export interface CoursTrouveICS {
  code: CodeCours;
  /** Libellé de l'évènement d'où le code a été tiré, pour que l'étudiant
   *  reconnaisse de quoi on parle. */
  libelle: string;
  /** Trimestre déduit des dates des évènements, si déductible. */
  trimestre: Trimestre | null;
  /** Nombre d'évènements portant ce code : un cours à une seule séance est
   *  plus douteux qu'un cours à trente. */
  nbSeances: number;
  /** Vrai si le dernier évènement est antérieur à aujourd'hui. */
  trimestreTermine: boolean;
}

export interface ResultatImportICS {
  trouves: CoursTrouveICS[];
  /** Évènements dont aucun code n'a pu être tiré, conservés pour affichage :
   *  l'étudiant doit pouvoir voir ce qui a été ignoré. */
  ignores: string[];
  nbEvenements: number;
}
