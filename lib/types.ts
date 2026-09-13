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
// Aperçu des horaires
// ---------------------------------------------------------------------------

/** Les sept jours tels que la page les écrit. Mesuré sur ~29 400 séances : ces
 *  sept valeurs et rien d'autre. Un libellé hors liste ne doit PAS être replié
 *  sur le plus proche — il devient un créneau `illisible` qui garde son texte. */
export type JourSemaine =
  | "Lundi" | "Mardi" | "Mercredi" | "Jeudi" | "Vendredi" | "Samedi" | "Dimanche";

/**
 * Le quand d'une séance — trois états que la page distingue et qu'il ne faut
 * pas confondre.
 *
 * `nonAttribue` est un ÉTAT DÉCLARÉ, pas un trou : 1 634 séances sur 29 391
 * (5,6 %) portent « Non attribué » avec une plage de dates connue et aucun
 * créneau. Le représenter par des champs à `null` le rendrait indistinguable de
 * « on n'a pas su lire », et l'UI afficherait la mauvaise phrase — même raison
 * que `prealablesBrut: null`, qui affirme « la page n'a pas ce champ ».
 *
 * `illisible` garde le verbatim plutôt que de jeter la ligne : c'est le même
 * geste que `RegleBloc` de type `inconnu`, qui conserve son `brut` pour qu'on
 * puisse l'ajouter au parseur plus tard au lieu de le perdre.
 */
export type Creneau =
  | { genre: "attribue"; jour: JourSemaine; debutMin: number; finMin: number }
  | { genre: "nonAttribue" }
  | { genre: "illisible"; brut: string };

/**
 * Une ligne de la table d'horaire : un créneau et la FENÊTRE où il s'applique.
 *
 * LA FENÊTRE EST SUR LA SÉANCE, ET C'EST LA NORME, PAS UN RAFFINEMENT. Mesuré :
 * 7 498 sections sur 9 344 (80 %) changent de motif en cours de trimestre, et
 * une section va jusqu'à 27 fenêtres. `MAT 1400` section A tient mardi ET jeudi
 * du 31/08 au 16/10, puis jeudi seul du 26/10 au 09/12.
 *
 * Deux conséquences, et la seconde touche le produit :
 *  - deux séances au même jour et à la même heure sur des fenêtres DISJOINTES
 *    ne sont pas en conflit. Sans `du`/`au` par séance, un calcul de conflit
 *    serait faux sur la majorité du catalogue ;
 *  - **« la semaine type » n'existe pas.** Il existe la semaine d'une DATE.
 *    Un écran qui promet « à quoi ressemble ta semaine » doit dire laquelle.
 *
 * `debutMin`/`finMin` en minutes depuis minuit, pas en texte. La page écrit
 * « De 15 h 30 à 16 h 29 » : les fins sont en :29 et :59, c'est ce qui fait que
 * deux créneaux consécutifs ne se touchent pas et qu'un test d'intersection
 * naïf donne le bon résultat. Un nombre rend impossibles les deux bogues du
 * format texte — l'arrondi cosmétique de 16 h 29 en 16 h 30, qui transforme
 * tout créneau adjacent en conflit, et le « 8:30 » non complété à gauche, qui
 * se compare avant « 16:29 ».
 */
export interface Seance {
  creneau: Creneau;
  /** Date ISO `AAAA-MM-JJ`. La page écrit « 31/08/2026 » : jour/mois/année, et
   *  seule la forme ISO se compare. Une date non analysable se journalise et la
   *  séance n'est pas émise — on n'invente pas un ordre de composants. */
  du: string;
  au: string;
}

/**
 * Une section, telle que l'étudiant s'y inscrit.
 *
 * LES SECTIONS SONT DES ALTERNATIVES : on en suit UNE. Leurs séances ne
 * s'additionnent donc jamais. Mesuré, 774 couples (cours, trimestre) ont des
 * sections porteuses aux horaires DIVERGENTS — `ALL 1901` en a quatre — donc
 * choisir sa section est un vrai choix de créneau, pas une formalité.
 *
 * Et là où elles ne divergent PAS, le piège est symétrique : `MAT 1400` publie
 * douze sections pour deux tables identiques à l'octet. Les rendre toutes
 * afficherait le cours douze fois le jeudi à 8 h 30 en signalant onze conflits
 * du cours AVEC LUI-MÊME. Une grille doit donc projeter sur la section choisie,
 * ou dédupliquer — jamais empiler.
 *
 * `nom` est VERBATIM, sans le mot « Section ». `A`, `A1`, `A101` et `A102`
 * coexistent et ne sont pas interchangeables : replier `A101` sur `A1` ou sur
 * `A` fusionnerait des séances distinctes, sans que rien ne le signale. La
 * relation entre `A` et `A101` n'est PAS déclarée par la page — le mot « volet »
 * n'apparaît que sur 7 pages du catalogue — et la déduire d'un libellé serait
 * deviner d'après un nom.
 */
export interface SectionHoraire {
  nom: string;
  seances: Seance[];
}

/** Les sections publiées pour un trimestre donné. `trimestre` est la même
 *  structure que `Cours.trimestres` et non une chaîne : deux représentations du
 *  même trimestre finiraient par diverger, et rien ne les recouperait. */
export interface ApercuTrimestre {
  trimestre: Trimestre;
  sections: SectionHoraire[];
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
  /**
   * APERÇU des horaires — indicatif, jamais contractuel.
   *
   * Le nom porte la réserve parce qu'un commentaire ne voyage pas jusqu'à
   * l'écran. La page titre « Aperçu des horaires » et renvoie au Centre
   * étudiant pour l'à-jour, sur 100 % des pages examinées. Un consommateur qui
   * écrit `cours.apercuHoraires` ne peut pas croire qu'il tient un horaire
   * officiel ; `cours.horaires` le lui aurait laissé croire.
   *
   * `[]` veut dire LU ET RIEN DE PUBLIÉ, et c'est un état normal et fréquent :
   * beaucoup de pages portent leur section d'horaire vide. ABSENT veut dire que
   * la fiche est antérieure à ce champ — on n'a pas regardé. Les deux ne doivent
   * pas se confondre, pour la même raison que `Creneau.nonAttribue` ne se
   * confond pas avec un champ à `null`.
   *
   * (Une version antérieure de ce commentaire chiffrait « 43 % des pages ». Le
   * chiffre venait du chantier scraper et je l'avais recopié sans son périmètre
   * ni son SHA — 43 % des pages en cache ? des cours du catalogue ? à quelle
   * date ? Un nombre qu'on ne peut pas resituer vaut moins que son absence dans
   * un contrat, parce qu'il se cite ensuite comme s'il avait été mesuré ici.)
   */
  apercuHoraires?: ApercuTrimestre[];
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

/**
 * Ce qui CONTRAINT le contenu d'un bloc dont les cours ne sont pas énumérés.
 *
 * `Bloc.contenuOuvert` dit un fait littéral — aucun cours listé, mais de la
 * prose — et garde exactement ce sens. Il ne dit pas ce que la prose EXIGE, et
 * le moteur ne peut donc rien vérifier. Mesuré par le chantier scraper sur les
 * 401 blocs à contenu ouvert du catalogue : **157 portent une contrainte qu'un
 * programme pourrait vérifier** et qu'il ignore faute de la recevoir — 85 une
 * contrainte de sigle (« les crédits au choix ne sont pas de sigle CHM »), 72
 * une contrainte de cycle (« un cours de 2e cycle du répertoire de l'UdeM »).
 * Les 244 autres se répartissent en autorisation humaine (68), renvoi à une
 * liste hors catalogue (45), répartition de crédits qui ne décrit aucun contenu
 * (12) et renvoi à d'autres blocs (9).
 *
 * Le champ est OPTIONNEL et son absence est le cas normal : elle dit « la prose
 * ne donne rien de mécanisable ». Un genre ne doit être émis que sur une
 * formulation réellement réduite — une liste de sigles devinée ferait échouer
 * un audit sur un cours parfaitement valide, et un champ faux est pire
 * qu'absent. C'est la même règle que pour l'empreinte.
 *
 * ATTENTION À QUI LA CONSOMME : tout `switch` sur `genre` doit porter un
 * `default` avec une garde `never`. Une union qu'on étend est une union dont
 * les `switch` avalent en silence les cas ajoutés plus tard — ce motif a déjà
 * coûté une passe sur ce projet.
 */
export type ContrainteContenu =
  | { genre: "sigle"; exclus: string[] }
  | { genre: "cycle"; cycle: string }
  | { genre: "autorisation" }
  | { genre: "renvoiExterne" }
  | { genre: "renvoiBlocs"; blocs: string[] };

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
  /**
   * Cheminement EXCLUSIF auquel ce bloc appartient, quand la page en déclare un.
   *
   * **Absent = le bloc est COMMUN à tous les cheminements**, jamais orphelin.
   * Vérifié sur `maitrise-en-finance-mathematique-et-computationnelle` : 70A
   * (30 cr) + 70B (3) + 70C (3) sans libellé, plus 70D « Stage » (9) = 45, le
   * `creditsTotal` de la page. Un cœur commun plus un seul créneau alternatif.
   *
   * Le filtre, unique, partagé par le moteur et l'UI (voir `blocsDuCheminement`
   * dans `lib/parcours.ts`) :
   *
   *     b.cheminement === undefined || b.cheminement === choix
   *
   * POURQUOI CE CHAMP. `cleBloc(segment, id, nom)` a réglé l'IDENTITÉ — plus
   * aucune clé en double sur 5 028 blocs. Il n'a rien réglé de l'EXCLUSIVITÉ :
   * des clés uniques disent que deux blocs sont deux, pas qu'ils sont deux
   * ALTERNATIVES. Au segment 70 du doctorat en pathologie, « Accès direct du
   * B. Sc. au Ph. D. » totalise 90 crédits de minimums et « Accès de la M. Sc.
   * au Ph. D. » 90 aussi : un audit qui ne filtre pas en exige **180 pour un
   * doctorat qui en annonce 90**.
   *
   * QUAND L'ÉMETTRE — et le piège est qu'un libellé ne suffit pas. Le DESS en
   * intervention en déficience visuelle porte le même gabarit HTML, un `<small>`
   * par bloc : « Formation générale » 10 cr et « Formation spécialisée » 20 cr.
   * Mais 10 + 20 = 30 = son `creditsTotal` : ce sont des COMPLÉMENTS, tous deux
   * exigés. Les prendre pour des cheminements montrerait 10 ou 20 crédits à un
   * étudiant qui en doit 30 — le 180-contre-90 dans l'autre sens, amputer au
   * lieu de gonfler.
   *
   * Le discriminant est mécanique et sépare proprement les six programmes
   * concernés : **un libellé ne compte comme cheminement que si, dans ce
   * segment, un id de bloc est réutilisé sous deux libellés différents.**
   * Réutiliser un numéro est la façon dont la page dit « même créneau, rempli
   * autrement ». Le DESS a des ids distincts (70A, 70B) : intertitres, pas axe.
   *
   * ET SI LES LIBELLÉS NE FORMENT PAS UN AXE, ne rien émettre pour le segment
   * et le journaliser. `maitrise-en-evaluation-des-technologies-de-la-sante`
   * porte six libellés distincts pour quatre groupes (« MM », « ST‐TD »,
   * « MM Méthodes », « ST‐TD Méthodes », « Gestion », « ST‐TD Gestion ») — dont
   * un groupe, `70/70C`, où un seul côté est marqué. Émettre à moitié ferait
   * exiger les deux blocs d'un même créneau : le défaut que ce champ corrige,
   * reproduit en miniature à l'intérieur de son propre correctif. Un champ
   * absent dit « on n'a pas su lire », ce qui est vrai ; un champ à moitié
   * rempli dit une fausseté qui a l'air d'une réponse.
   */
  cheminement?: string;
  /** Ce que la prose EXIGE du contenu, quand c'est reductible. Voir
   *  ContrainteContenu. Absent = la prose ne donne rien de mecanisable. */
  contrainteContenu?: ContrainteContenu;
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
  /**
   * Les cheminements exclusifs déclarés par ce programme, pour le menu de choix.
   *
   * **DÉRIVÉ, jamais saisi en parallèle** : c'est exactement l'union des
   * `Bloc.cheminement` émis pour ce programme, après la même normalisation que
   * `cleBloc` (tirets Unicode ramenés à l'ASCII, espaces réduits). L'invariant
   * qui compte pour le moteur : **tout `Bloc.cheminement` figure mot pour mot
   * ici**. Sans lui, une divergence d'un caractère — « Travaux dirigés » contre
   * « Travail dirigé », un U+2010 contre un trait d'union — fait qu'un filtre ne
   * garde AUCUN bloc pour ce cheminement, et l'étudiant voit un programme amputé
   * sans qu'aucune erreur ne soit levée.
   *
   * Une seule source de vérité, donc : le champ sur le bloc. La liste des blocs
   * d'un cheminement se dérive (`blocsDuCheminement` dans `lib/parcours.ts`) et
   * ne se stocke pas — une seconde liste pourrait se désaccorder de la première
   * sans que rien ne le signale.
   *
   * `string[]` et non `{ segment, libellés }` : mesuré sur les six programmes
   * concernés, aucun ne porte deux segments à axes INDÉPENDANTS. Le doctorat en
   * pathologie répète les deux mêmes libellés de 70 à 74 — un axe unique — et
   * les cinq autres n'ont qu'un segment touché. Si un scrape futur en
   * introduisait un, une liste plate fusionnerait deux choix distincts en un
   * menu et l'étudiant ne pourrait plus exprimer « Stage » ET « Passerelle » :
   * c'est la forme qu'il faudrait alors changer, pas le filtre.
   *
   * ABSENT ne veut PAS dire « ce programme n'a pas de choix ». Il peut vouloir
   * dire « ses libellés ne se réduisent pas à un axe » — voir `Bloc.cheminement`.
   * Une UI ne doit donc rien affirmer sur ces programmes.
   */
  cheminements?: string[];
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
/**
 * Le vocabulaire des types de programme, mesuré et non inventé.
 *
 * `typeProgramme` valait un FRAGMENT DE NOM : le premier mot pour 1 277 des
 * 1 506 fiches, le nom entier pour le reste — d'où 59 valeurs distinctes et une
 * facette « Type » qui offrait `Actuariat (3)`, `Archéologie classique (3)`,
 * `Année (1)`, `Ph. (1)` comme s'il s'agissait de grades. Et des doublons de
 * casse et de ponctuation : `DES` contre `D.E.S.`, `DESS` contre `D.E.S.S.`,
 * `Baccalauréat` contre `Baccalauréats`, `Stage postdoctoral` contre
 * `stage postdoctoral`.
 *
 * POURQUOI VINGT ET UN ET NON DIX. Une liste des dix grades évidents
 * (baccalauréat, certificat, majeure, mineure, microprogramme, DESS, maîtrise,
 * doctorat, DES, stage postdoctoral) laisse dehors une soixantaine de fiches
 * dont le type est RÉEL : `DEPA` est un diplôme d'études professionnelles
 * approfondies, `Internat` et `Qualification` sont des programmes de médecine
 * et de droit. Les verser dans un `autre` perdrait ce que la page dit.
 *
 * POURQUOI PAS DE `"autre"`. Environ 80 pages n'énoncent aucun grade, ni dans
 * leur nom ni dans leur slug — `actuariat`, `archeologie-classique`,
 * `genetique-moleculaire`. Ce n'est pas un échec de lecture : leur nom n'en
 * porte pas, et plusieurs ressemblent à des pages d'ORIENTATION publiées
 * séparément. `null` le dit ; un fourre-tout de 80 entrées serait un aveu
 * déguisé en type.
 *
 * CE QUE TYPESCRIPT NE PEUT PAS FAIRE ICI, et c'est la limite à connaître : ce
 * vocabulaire arrive par `JSON.parse`, donc le compilateur ne le vérifie
 * jamais. Il documente, il ne valide pas. **C'est au scraper de refuser :
 * toute valeur hors de cette liste devient `null` et se journalise**, comme un
 * jour de la semaine hors des sept devient un créneau `illisible`. Le champ
 * reste déclaré `string | null` pour qu'aucun consommateur n'ait à se
 * restreindre ; qui veut l'exhaustivité prend `TypeProgramme`.
 */
export const TYPES_PROGRAMME = [
  "Baccalauréat", "Certificat", "Majeure", "Mineure", "Microprogramme",
  "DESS", "Maîtrise", "Doctorat", "DES", "Stage postdoctoral",
  "DEPA", "Diplôme complémentaire", "Diplôme", "Programme", "Internat",
  "Qualification", "Études libres", "Actualisation de formation",
  "Année préparatoire", "Accès", "Juris Doctor",
] as const;

export type TypeProgramme = (typeof TYPES_PROGRAMME)[number];

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
  /**
   * Cours dont la PAGE A ÉTÉ LUE et ne porte aucune étiquette « Crédits », avec
   * la date de cette observation.
   *
   * Un code n'entre ici QUE sur une page obtenue et analysée. Un code jamais
   * atteint, ou atteint en erreur — 404, 503, tranche interrompue — n'y figure
   * pas : il reste dans le cas « pas encore », qui est vrai. C'est toute la
   * valeur du champ, et la raison pour laquelle il ne doit pas être déduit par
   * soustraction : « cité, sans fiche, présent au cache » est un MAJORANT qui
   * inclut les échecs d'analyse pour d'autres motifs.
   *
   * POURQUOI IL EXISTE. `PSY 40001` a une page à l'UdeM où les seules
   * occurrences de « crédits » sont les « 90 crédits » des programmes qui citent
   * le cours ; les lire donnerait au cours les crédits de son programme. Le
   * scraper refuse donc d'écrire la fiche, à raison — et les programmes qui
   * citent ce cours ne seront jamais complets. Sans ce champ, l'UI ne peut pas
   * distinguer « aucune collecte n'ajoutera ce cours » de « la prochaine passe
   * le récupérera », et doit énoncer les deux sans trancher.
   *
   * POURQUOI UNE DATE PAR CODE, et non une simple liste. Le champ est CUMULATIF
   * — une passe ne voit que sa tranche, donc le réécrire en bloc ne garderait
   * que la dernière, ce qui est la panne de `data/journal.json`. Mais un cumul
   * sous le seul `scrapeISO` de l'index mentirait sur son âge : les entrées
   * anciennes prétendraient dater de la passe courante. Chaque code porte donc
   * sa propre date d'observation ; la fusion est alors triviale et honnête, la
   * plus récente l'emporte, et un consommateur peut décider ce qui est trop
   * vieux. UdeM peut corriger une page : « vu sans crédits le 11 septembre »
   * reste vrai, « n'a pas de crédits » vieillirait mal.
   *
   * NE FIGER AUCUN COMPTE dans un test : le nombre monte à chaque page
   * récupérée. Ce n'est pas une erreur qu'on corrige, c'est un plancher.
   */
  codesSansCredits?: Record<CodeCours, string>;
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

/**
 * Ce qu'un signal d'audit DEMANDE au lecteur — l'axe qui manque à une liste de
 * phrases.
 *
 * `Audit.problemes` mélangeait des choses qui n'appellent pas la même réaction :
 * « il vous manque 6 crédits » et « la page se contredit » et « choisissez un
 * cheminement » s'affichaient pareil. L'étudiant ne peut rien pour la deuxième
 * et tout pour la première.
 *
 * Les six genres ne sont pas une taxinomie inventée : ils couvrent les 25 sites
 * d'émission du moteur, énumérés un par un. Un même site en émet deux selon le
 * cas — un quota de sigle violé est `bloque`, indéterminé est `nonVerifiable` —
 * donc le genre se calcule PAR SIGNAL, jamais par site.
 *
 * Tout `switch` là-dessus doit porter un `default` avec garde `never` : une
 * union qu'on étend avale en silence les cas ajoutés plus tard.
 */
export type GenreSignal =
  /** Empêche le diplôme, et l'étudiant peut y remédier. */
  | "bloque"
  /** L'audit est suspendu à un choix DE L'ÉTUDIANT — cheminement, orientation.
   *  Ni un succès ni un échec : le quatrième état. */
  | "choixAttendu"
  /** Des crédits réussis ne comptent pas : un bloc plafonné, un surplus. */
  | "perteOuSurplus"
  /** Le moteur ne peut pas établir, et personne n'y peut rien. */
  | "nonVerifiable"
  /** La page ou le catalogue est en défaut — PAS l'étudiant. Le distinguer
   *  évite de lui faire chercher une faute qu'il n'a pas commise. */
  | "donneesAmont"
  /** Explication d'un calcul, sans action attendue. */
  | "informatif";

export interface Signal {
  genre: GenreSignal;
  message: string;
  /**
   * Le bloc visé, quand il y en a un.
   *
   * ABSENT quand le signal n'en vise aucun : un total d'option n'appartient à
   * aucun bloc, et lui en inventer un serait pire que de le laisser au niveau
   * du programme — l'étudiant irait corriger le mauvais endroit.
   */
  cleBloc?: string;
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
  /**
   * Les mêmes constats que `problemes`, mais CLASSÉS — voir `GenreSignal`.
   *
   * OBLIGATOIRE ET NON OPTIONNEL, et c'est mesuré plutôt que choisi. Un `Audit`
   * est toujours frais : `auditProgramme()` en est le seul producteur, appelé à
   * un seul endroit (`ProviderEtat.tsx`), et aucun `Audit` n'est jamais
   * persisté — `localStorage` ne garde que `faits` et `plan`. Un `signaux?`
   * aurait donc une branche `undefined` que personne n'atteindrait jamais.
   *
   * Une garde sans population est pire qu'inutile : elle inviterait à lire
   * « absent » comme « aucun signal », précisément parce que le vrai cas
   * d'absence ne se présenterait jamais pour corriger l'intuition. On a déjà
   * payé ça ailleurs — une branche inatteignable décrite comme un détecteur.
   * Obligatoire, TypeScript signale à la compilation tout producteur futur qui
   * l'oublierait : un garde-fou mécanique plutôt que documentaire.
   *
   * `problemes` reste IDENTIQUE et n'en est pas dérivé. Dériver rendrait la
   * divergence impossible mais déplacerait le risque : reformuler un
   * `Signal.message` changerait le texte de trois écrans sans qu'aucun test ne
   * le dise. L'accord entre les deux listes est éprouvé par un test dédié, qui
   * échoue bruyamment le jour où un site d'émission n'est ajouté que d'un côté.
   */
  signaux: Signal[];
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
