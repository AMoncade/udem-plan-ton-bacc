import type {
  Audit,
  Bloc,
  Catalogue,
  CodeCours,
  Cours,
  DiagnosticCours,
  EtatBloc,
  NoeudPrealable,
  Programme,
} from "../types";
import { cleBloc, normaliserCode } from "../codes";
import {
  arrondi,
  bornesDeRegle,
  cr,
  dedup,
  listerCodes,
  nomBloc,
  resoudreExigences,
  type Bornes,
  type TypeBloc,
} from "./bornes";
import {
  PLAFOND_AFFECTATIONS,
  resoudreAffectation,
  type BlocAffectable,
  type ExigencesTotaux,
} from "./affectation";
import { lireContraintesSigles, verifierContraintesSigles } from "./sigles";

export { parsePrealables } from "./prealables";
export type { ResultatParsing } from "./prealables";
export { bornesDeRegle, resoudreExigences } from "./bornes";
export type { Bornes, ExigencesResolues } from "./bornes";
export { resoudreAffectation, compositions } from "./affectation";
export type { Cout, ResultatAffectation } from "./affectation";
export { lireContraintesSigles, verifierContraintesSigles } from "./sigles";
export type {
  ContrainteSigle,
  EntreeVerification,
  EtatContrainte,
  LectureSigles,
  ProseNonLue,
  ResultatSigle,
  Sigle,
} from "./sigles";

/**
 * MOTEUR — deux fonctions pures, point d'entrée gelé pour la session UI :
 *
 *   diagnostiquerCours(catalogue, faits) -> Map<CodeCours, DiagnosticCours>
 *   auditProgramme(programme, catalogue, faits) -> Audit
 *
 * Aucun accès réseau ni disque, aucune mutation des arguments.
 *
 * PRINCIPE DIRECTEUR (c'est le mode de défaillance principal du projet) :
 * tout ce que le moteur n'a pas su interpréter doit RESSORTIR. Un préalable
 * opaque sort dans `DiagnosticCours.avertissements`, une restriction
 * d'inscription aussi, un cours sans fiche ou une règle de bloc illisible sort
 * dans `Audit.problemes`. Un repli muet rend l'audit faux sans faire échouer un
 * seul test.
 *
 * ---------------------------------------------------------------------------
 * CE QUE LE CONTRAT v2 A CHANGÉ SOUS CE FICHIER
 *
 *  - `RegleBloc` est unifiée : `bornes: {min, max}` au lieu de
 *    `credits` / `min` / `max`. Lecture isolée dans `./bornes.ts`.
 *  - `Bloc.id` n'est PAS unique (`MM-Bloc 73A` et `S-Bloc 73A` coexistent) :
 *    l'identité passe par `Bloc.cle` / `cleBloc()`, l'affichage par `Bloc.id`.
 *  - `Programme.exigences` porte les totaux par type, en INTERVALLES. La
 *    déduction 90 − 54 − 3 = 33 de la v1 survit comme REPLI, et se déclare.
 *  - `Programme.creditsTotal` peut être null : jamais supposer 90.
 *  - `Cours.restrictionsBrut` existe : une restriction d'inscription n'est NI
 *    un préalable NI un concomitant. Jamais évaluée, toujours signalée.
 *  - `segmentDeBloc()` n'existe plus : le segment est lu sur la page.
 *  - L'attribution des cours aux blocs est devenue une AFFECTATION SOUS BORNES
 *    (`./affectation.ts`), parce que 70K ⊂ 70L en droit.
 */

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Crédits exploitables d'une fiche, ou null si la fiche est absente ou porte
 *  une valeur inutilisable. null veut dire « inconnu », jamais « zéro ». */
function creditsDeFiche(fiche: Cours | undefined): number | null {
  if (!fiche) return null;
  const c = fiche.credits;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0) return null;
  return c;
}

/** Index des fiches par code NORMALISÉ. Une clé de catalogue qui n'est pas un
 *  code (bogue de scrape) n'est pas avalée : elle est rapportée. */
function indexerFiches(catalogue: Catalogue): {
  fiches: Map<CodeCours, Cours>;
  clesInvalides: string[];
} {
  const fiches = new Map<CodeCours, Cours>();
  const clesInvalides: string[] = [];
  for (const [cle, fiche] of Object.entries(catalogue.cours ?? {})) {
    const code = normaliserCode(cle);
    if (!code) {
      clesInvalides.push(cle);
      continue;
    }
    fiches.set(code, fiche);
  }
  return { fiches, clesInvalides };
}

/** Normalise l'ensemble des cours faits. « act2250 », « ACT 2250 » et
 *  « ACT-2250 » désignent le même cours ; comparer deux formes différentes ne
 *  lève aucune erreur, ça donne juste un audit à zéro crédit. */
function normaliserEnsemble(codes: Set<CodeCours> | undefined): {
  faits: Set<CodeCours>;
  invalides: string[];
} {
  const faits = new Set<CodeCours>();
  const invalides: string[] = [];
  for (const brut of codes ?? []) {
    const code = normaliserCode(String(brut));
    if (code) faits.add(code);
    else invalides.push(String(brut));
  }
  return { faits, invalides };
}

/** Clé d'un bloc. `Bloc.cle` est fabriquée par le scraper via `cleBloc()` ;
 *  si elle manque (données anciennes), on la refabrique AU MÊME ENDROIT plutôt
 *  que de retomber sur `id`, qui n'est pas unique.
 *
 *  Le NOM fait partie de l'identité depuis que `cleBloc` prend trois arguments
 *  (« Bloc 70D Stage » et « Bloc 70D Travail dirigé » ont même segment, même id
 *  et même règle). `scripts/scrape/structure.ts:477` le passe toujours ; ce
 *  repli doit le passer aussi, sinon les deux endroits fabriquent deux clés
 *  différentes pour un même bloc — sans lever la moindre erreur. */
function cleDe(bloc: Bloc): string {
  const cle = (bloc.cle ?? "").trim();
  return cle !== "" ? cle : cleBloc(bloc.segment ?? "?", bloc.id, bloc.nom);
}

// ---------------------------------------------------------------------------
// 1. Préalables : évaluation de l'arbre
// ---------------------------------------------------------------------------

interface Evaluation {
  /** Les conditions mécanisables sont-elles remplies ? Un noeud opaque compte
   *  comme remplie : il ne VERROUILLE jamais, il avertit. */
  satisfait: boolean;
  manquants: CodeCours[];
  opaques: string[];
}

/**
 * Évalue un arbre de préalables contre les cours faits.
 *
 * Règles non négociables :
 *  - un noeud `opaque` ne verrouille jamais, mais son texte ressort toujours ;
 *  - un code cité en préalable et absent du catalogue n'est pas une erreur :
 *    il est simplement « pas fait » tant qu'il n'est pas dans `faits`. Le
 *    catalogue est scrapé incrémentalement, l'absence de fiche ne dit rien sur
 *    ce que l'étudiant a réussi.
 */
export function evaluerPrealables(noeud: NoeudPrealable, faits: Set<CodeCours>): Evaluation {
  switch (noeud.genre) {
    case "cours": {
      const code = normaliserCode(noeud.code) ?? noeud.code;
      const fait = faits.has(code);
      return { satisfait: fait, manquants: fait ? [] : [code], opaques: [] };
    }
    case "et": {
      const enfants = noeud.enfants.map((e) => evaluerPrealables(e, faits));
      return {
        satisfait: enfants.every((e) => e.satisfait),
        manquants: dedup(enfants.flatMap((e) => e.manquants)),
        opaques: dedup(enfants.flatMap((e) => e.opaques)),
      };
    }
    case "ou": {
      const enfants = noeud.enfants.map((e) => evaluerPrealables(e, faits));
      const satisfait = enfants.length === 0 ? true : enfants.some((e) => e.satisfait);
      return {
        satisfait,
        // Non satisfait : on montre TOUTES les branches possibles, sans choisir
        // pour l'étudiant laquelle il devrait prendre.
        manquants: satisfait ? [] : dedup(enfants.flatMap((e) => e.manquants)),
        opaques: dedup(enfants.flatMap((e) => e.opaques)),
      };
    }
    case "opaque":
      return { satisfait: true, manquants: [], opaques: [noeud.texte] };
    default: {
      // Garde d'exhaustivité : si `NoeudPrealable` gagne un genre, le compilateur
      // échoue ici au lieu de laisser le nouveau cas passer en silence.
      const inconnu: never = noeud;
      const texte = `noeud de préalable non interprété : ${JSON.stringify(inconnu)}`;
      return { satisfait: true, manquants: [], opaques: [texte] };
    }
  }
}

// ---------------------------------------------------------------------------
// 2. diagnostiquerCours
// ---------------------------------------------------------------------------

/**
 * État de chaque cours pour un étudiant donné.
 *
 * La map couvre l'UNION de : les fiches du catalogue, les codes cités par les
 * blocs des programmes, les codes cités en préalable, et les cours faits. La
 * fixture référence 55 codes pour 3 fiches : si la map ne contenait que les
 * fiches, l'UI aurait `undefined` sur 52 cases de blocs à afficher.
 *
 * Un cours SANS FICHE est `avertissement`, jamais `disponible` : on ne connaît
 * pas ses préalables, donc on ne peut pas affirmer qu'il est ouvert. Et jamais
 * `verrouille` non plus : on n'a rien qui le prouve.
 */
export function diagnostiquerCours(
  catalogue: Catalogue,
  faits: Set<CodeCours>,
): Map<CodeCours, DiagnosticCours> {
  const { fiches, clesInvalides } = indexerFiches(catalogue);
  const { faits: acquis, invalides } = normaliserEnsemble(faits);

  const univers = new Set<CodeCours>(fiches.keys());
  for (const code of acquis) univers.add(code);
  for (const programme of catalogue.programmes ?? []) {
    for (const bloc of programme.blocs ?? []) {
      for (const brut of bloc.cours ?? []) {
        const code = normaliserCode(brut);
        if (code) univers.add(code);
      }
    }
  }
  for (const fiche of fiches.values()) {
    if (fiche.prealables) for (const code of codesCites(fiche.prealables)) univers.add(code);
  }

  const out = new Map<CodeCours, DiagnosticCours>();
  for (const code of [...univers].sort()) {
    out.set(code, diagnostiquerUn(code, fiches.get(code), acquis));
  }

  // Ce qui n'a pas pu devenir un code propre doit quand même se voir : l'UI
  // affichera une case « code non reconnu » plutôt que de perdre la donnée.
  for (const brut of [...invalides, ...clesInvalides]) {
    if (out.has(brut)) continue;
    out.set(brut, {
      code: brut,
      etat: "avertissement",
      manquants: [],
      avertissements: [`code de cours non reconnu (forme attendue « ABC 1234 ») : « ${brut} »`],
    });
  }
  return out;
}

function diagnostiquerUn(
  code: CodeCours,
  fiche: Cours | undefined,
  faits: Set<CodeCours>,
): DiagnosticCours {
  if (faits.has(code)) {
    return { code, etat: "fait", manquants: [], avertissements: [] };
  }
  if (!fiche) {
    return {
      code,
      etat: "avertissement",
      manquants: [],
      avertissements: [
        "aucune fiche de cours dans le catalogue : préalables inconnus, à vérifier sur admission.umontreal.ca",
      ],
    };
  }

  const avertissements: string[] = [];
  let manquants: CodeCours[] = [];
  let satisfait = true;

  if (fiche.prealables) {
    const ev = evaluerPrealables(fiche.prealables, faits);
    satisfait = ev.satisfait;
    manquants = ev.manquants;
    avertissements.push(...ev.opaques);
  } else if (fiche.prealablesBrut != null && fiche.prealablesBrut.trim() !== "") {
    // `prealables: null` avec `prealablesBrut` non nul : la ligne existe mais
    // n'a pas été réduite. Surtout ne pas lire ça comme « aucun préalable ».
    avertissements.push(`préalables non analysés, à lire tel quel : « ${fiche.prealablesBrut.trim()} »`);
  }

  // Les concomitants ne sont pas mécanisés : aucun champ de `Cours` ne porte un
  // arbre de concomitants. Les laisser tomber silencieusement ferait afficher
  // « disponible » sur un cours qui exige un cours en parallèle.
  //
  // AVERTISSEMENT À QUI LES MÉCANISERA : la fiche réelle de STT 2000 publie
  // « Concomitants: STT2000 et STT2700 » — elle se déclare concomitante
  // d'elle-même (vérifié dans data/catalogue.json, relevé §4). Un moteur qui
  // traiterait un concomitant comme un préalable mettrait STT 2000 en attente
  // d'elle-même. Un cycle de longueur 1 existe donc dans les VRAIES données :
  // il faudra un ensemble de codes déjà visités, ou exclure le cours courant de
  // ses propres concomitants, avant d'évaluer quoi que ce soit.
  if (fiche.concomitantsBrut != null && fiche.concomitantsBrut.trim() !== "") {
    avertissements.push(`concomitants non analysés, à lire tel quel : « ${fiche.concomitantsBrut.trim()} »`);
  }

  // RESTRICTIONS D'INSCRIPTION — champ nouveau du contrat v2.
  //
  // Ce n'est NI un préalable NI un concomitant : « Restrictions d'inscription:
  // DMO1000/DMO1010 » veut dire que ces deux cours s'excluent, pas que DMO 1000
  // est requis pour lui-même. MUI 1162A n'a QUE des restrictions, et un parseur
  // qui les confondrait avec des préalables y verrait vingt cours requis.
  //
  // Le moteur ne les évalue donc PAS — il n'a pas de modèle pour « exclusion » —
  // et il ne les laisse pas tomber : elles sortent en avertissement, verbatim.
  // En v1 cette donnée réelle était piégée hors contrat, dans une clé `_journal`
  // que rien ne pouvait afficher.
  if (fiche.restrictionsBrut != null && fiche.restrictionsBrut.trim() !== "") {
    avertissements.push(
      `restriction d'inscription non évaluée (ce n'est ni un préalable ni un concomitant), à lire tel quel : « ${fiche.restrictionsBrut.trim()} »`,
    );
  }

  const etat = !satisfait ? "verrouille" : avertissements.length > 0 ? "avertissement" : "disponible";
  return { code, etat, manquants, avertissements };
}

function codesCites(noeud: NoeudPrealable): CodeCours[] {
  switch (noeud.genre) {
    case "cours":
      return [normaliserCode(noeud.code) ?? noeud.code];
    case "et":
    case "ou":
      return noeud.enfants.flatMap(codesCites);
    case "opaque":
      return [];
    default: {
      const inconnu: never = noeud;
      void inconnu;
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// 3. auditProgramme
// ---------------------------------------------------------------------------

interface Calcul {
  bloc: Bloc;
  cle: string;
  bornes: Bornes;
  /** Crédits des cours attribués dont on connaît les crédits. */
  bruts: number;
  /** Crédits retenus vers le diplôme : min(bruts, max). */
  comptes: number;
  /** Crédits au-delà du maximum : attribués mais ne comptent pas. */
  perdus: number;
  manquants: number;
  attribues: CodeCours[];
  /** Cours attribués dont les crédits sont inconnus (aucune fiche). */
  creditsInconnus: CodeCours[];
  /**
   * Somme des crédits des cours que le bloc LISTE — sa capacité réelle.
   * `null` dès qu'une seule fiche manque : la somme ne serait alors qu'un
   * plancher, et déclarer un bloc infaisable sur un plancher reviendrait à
   * accuser la page d'une incohérence qui vient d'un trou dans NOS données.
   */
  capaciteListee: number | null;
}

/**
 * Bloc à CONTENU OUVERT : il n'énumère aucun cours et décrit son contenu en
 * prose, en renvoyant à un ensemble extérieur.
 *
 * Cas réels vérifiés dans le HTML : `baccalaureat-en-economie-et-politique`
 * 71/71G et `baccalaureat-en-musique` 02/02E, « Option - maximum 6 crédits »
 * renvoyant aux cours du Centre de langues, sans aucun lien de cours.
 *
 * Ce n'est ni un bloc au choix, ni une page mal lue — c'est un troisième cas,
 * et c'est pour ça que `Bloc.contenuOuvert` existe plutôt qu'une devinette sur
 * `notes`. Conséquence pour le moteur : ce bloc est INVÉRIFIABLE. Voir
 * `traiterContenuOuvert()` plus bas pour ce que l'audit en fait.
 */
function estOuvert(bloc: Bloc): boolean {
  return bloc.contenuOuvert === true;
}

/**
 * Un bloc « Choix » est celui dont la liste de cours est vide : n'importe quel
 * cours compte. Un bloc d'OPTION à liste vide, lui, est une donnée incomplète
 * (on ne sait pas quels cours l'alimentent) — ce n'est pas un joker.
 *
 * Un bloc à contenu ouvert n'est JAMAIS un joker, même s'il est de type
 * « choix » : sa liste est vide parce que son contenu vit ailleurs, pas parce
 * que n'importe quoi convient. Y verser les cours non cités reviendrait à
 * inventer une appartenance qu'aucune donnée n'atteste.
 */
/**
 * Capacité listée d'un bloc : la somme des crédits des cours qu'il énumère.
 *
 * Retourne `null` si le bloc n'énumère rien, ou si une seule de ses fiches
 * manque. C'est la précaution essentielle : 70 % des cours cités par le
 * catalogue n'ont pas encore de fiche, donc une somme partielle est un
 * PLANCHER. Conclure « ce bloc est infaisable » à partir d'un plancher
 * reprocherait à la page une incohérence produite par notre propre scrape.
 *
 * Les doublons sont écrasés : un bloc qui cite deux fois le même cours ne
 * dispose pas de ses crédits deux fois.
 */
function capaciteDeBloc(bloc: Bloc, fiches: Map<CodeCours, Cours>): number | null {
  const cours = new Set((bloc.cours ?? []).map((brut) => normaliserCode(brut) ?? brut));
  if (cours.size === 0) return null;
  let somme = 0;
  for (const code of cours) {
    const credits = creditsDeFiche(fiches.get(code));
    if (credits === null) return null;
    somme += credits;
  }
  return arrondi(somme);
}

/**
 * Bloc dont la PAGE est incohérente : son minimum dépasse ce que ses propres
 * cours peuvent fournir.
 *
 * Cas réel et vérifié dans le HTML brut : le bacc en musique annonce
 * « Obligatoire - 15 crédits » au bloc 01/01A et n'y liste que 4 cours à
 * 3 crédits. Dix blocs du catalogue sont dans ce cas (mesuré sur les 937 blocs
 * dont toutes les fiches sont connues), tous de type « Obligatoire ».
 *
 * Sans ce diagnostic, l'audit dit à un étudiant qui a réussi les 4 cours du
 * bloc « il vous manque 3 crédits » — une exigence qu'aucune action de sa part
 * ne peut satisfaire, puisque les crédits en question n'existent nulle part
 * dans ces données. Le projet refuse les deux réponses faciles : bloquer sur
 * l'amont (on ne le maîtrise pas) et tolérer en silence.
 */
function pageIncoherente(bloc: Bloc, bornes: Bornes, capacite: number | null): boolean {
  return capacite !== null && capacite < bornes.min && !estOuvert(bloc);
}

function estInfaisable(c: Calcul): boolean {
  return pageIncoherente(c.bloc, c.bornes, c.capaciteListee);
}

/**
 * Clés des blocs dont la PAGE est incohérente — publié pour l'UI.
 *
 * Existe pour que l'affichage n'ait pas à DEVINER le cas par la conjonction
 * `creditsManquants === 0 && !conforme && !contenuOuvert` : cette conjonction
 * avalerait en silence le prochain genre de bloc non conforme ajouté ici, et
 * afficherait alors une cause fausse. Un marqueur explicite se périme
 * bruyamment ; une déduction se périme sans rien dire.
 *
 * Même source de vérité que `auditProgramme` — `capaciteDeBloc` et
 * `pageIncoherente`, jamais une seconde implémentation qui pourrait diverger.
 */
export function clesBlocsIncoherents(programme: Programme, catalogue: Catalogue): string[] {
  const { fiches } = indexerFiches(catalogue);
  const out: string[] = [];
  for (const bloc of programme.blocs ?? []) {
    const bornes = bornesDeRegle(bloc.regle);
    if (pageIncoherente(bloc, bornes, capaciteDeBloc(bloc, fiches))) out.push(cleDe(bloc));
  }
  return out;
}

function estJoker(bloc: Bloc, bornes: Bornes): boolean {
  return bornes.type === "choix" && (bloc.cours ?? []).length === 0 && !estOuvert(bloc);
}

/**
 * Audit d'un programme : bornes de chaque bloc, ET totaux par type de bloc, ET
 * affectation des cours résolue sous ces bornes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE CENTRAL, ET SON SYMÉTRIQUE
 *
 * Actuariat : 90 crédits = 54 obligatoires (01A 26 + 75A 21 + 75B 7) + 3 au
 * choix (75Z) + 33 en option. Les minimums des blocs d'option valent
 * 75C 12 + 75D 3 + 75E 0 + 75Y 3 = 18, pour une capacité (somme des maximums)
 * de 27 + 15 + 13 + 12 = 67.
 *
 * Un audit qui vérifie chaque bloc indépendamment voit 12/12, 3/3, 0/0, 3/3 et
 * déclare « conforme » un parcours à 18 crédits d'option qui ne mène pas au
 * diplôme : il manque 15 crédits. Le symétrique est aussi vrai : 33 crédits
 * empilés dans un bloc plafonné à 27 n'en donnent que 27. `conforme` tient donc
 * les deux niveaux ensemble.
 *
 * Le 33 n'était écrit NULLE PART en v1 : il se déduisait, 90 − 54 − 3. Le
 * contrat v2 porte `Programme.exigences`, donc on l'utilise quand il existe ; la
 * déduction reste comme repli, et elle se DÉCLARE dans `problemes`. Ailleurs la
 * déduction est impossible parce que ce sont des intervalles : le droit écrit
 * « de 30 à 33 crédits à option », la psycho « de 39 à 42 ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AFFECTATION : CE N'EST PLUS UNE HYPOTHÈSE
 *
 * La v1 attribuait chaque cours au premier bloc qui le cite, en documentant que
 * les 55 codes de l'actuariat sont distincts. C'est faux ailleurs : en droit, le
 * bloc 70K (`Option - 3 crédits.`) est ENTIÈREMENT CONTENU dans le bloc 70L
 * (`Option - Maximum 9 crédits.`), onze cours communs. L'attribution directe y
 * déclare non conforme un parcours conforme.
 *
 * `./affectation.ts` résout donc l'affectation, et ses garanties sont écrites
 * là-bas en détail. En résumé : une affectation de coût nul est une PREUVE de
 * conformité ; un verdict négatif est démontré sauf si la recherche a été
 * tronquée, et dans ce cas `problemes` le dit.
 */
export function auditProgramme(
  programme: Programme,
  catalogue: Catalogue,
  faits: Set<CodeCours>,
): Audit {
  const { fiches } = indexerFiches(catalogue);
  const { faits: acquis, invalides } = normaliserEnsemble(faits);
  const blocs = programme.blocs ?? [];
  const problemes: string[] = [];

  // --- préparation des calculs par bloc ------------------------------------
  const calculs: Calcul[] = blocs.map((bloc) => ({
    bloc,
    cle: cleDe(bloc),
    bornes: bornesDeRegle(bloc.regle),
    bruts: 0,
    comptes: 0,
    perdus: 0,
    manquants: 0,
    attribues: [],
    creditsInconnus: [],
    capaciteListee: null,
  }));

  // `Bloc.id` n'est pas unique ; `Bloc.cle` devrait l'être. Si elle ne l'est
  // pas, deux blocs fusionneraient en silence dans l'affectation — exactement
  // le bogue qui a mis 58 cours dans le mauvais bloc pendant la validation.
  const clesVues = new Map<string, number>();
  for (const c of calculs) clesVues.set(c.cle, (clesVues.get(c.cle) ?? 0) + 1);
  const clesDupliquees = [...clesVues.entries()].filter(([, n]) => n > 1).map(([cle]) => cle);

  // --- chevauchements, pour l'explication ----------------------------------
  const blocsParCode = new Map<CodeCours, string[]>();
  for (const c of calculs) {
    for (const brut of c.bloc.cours ?? []) {
      const code = normaliserCode(brut) ?? brut;
      const deja = blocsParCode.get(code);
      if (deja) deja.push(c.bloc.id);
      else blocsParCode.set(code, [c.bloc.id]);
    }
  }
  const chevauchements = [...blocsParCode.entries()].filter(([, ids]) => ids.length > 1);

  // --- exigences par type : page, sinon déduction, sinon minimums ----------
  const exigences = resoudreExigences(programme, calculs);
  const contraintes: ExigencesTotaux = {
    obligatoire: exigences.obligatoire.intervalle,
    option: exigences.option.intervalle,
    choix: exigences.choix.intervalle,
    creditsTotal:
      typeof programme.creditsTotal === "number" && Number.isFinite(programme.creditsTotal)
        ? programme.creditsTotal
        : null,
  };

  // --- affectation sous bornes ---------------------------------------------
  const affectables: BlocAffectable[] = calculs.map((c) => ({
    cle: c.cle,
    id: c.bloc.id,
    bornes: c.bornes,
    cours: new Set((c.bloc.cours ?? []).map((brut) => normaliserCode(brut) ?? brut)),
    joker: estJoker(c.bloc, c.bornes),
  }));
  const affectation = resoudreAffectation(
    affectables,
    [...acquis],
    (code) => creditsDeFiche(fiches.get(code)),
    contraintes,
  );

  // --- report de l'affectation sur les calculs -----------------------------
  const parCle = new Map(calculs.map((c) => [c.cle, c]));
  for (const [cle, codes] of affectation.parCle) {
    const cible = parCle.get(cle);
    if (!cible) continue; // impossible : les clés viennent de `calculs`.
    for (const code of codes) {
      cible.attribues.push(code);
      const credits = creditsDeFiche(fiches.get(code));
      if (credits === null) cible.creditsInconnus.push(code);
      else cible.bruts = arrondi(cible.bruts + credits);
    }
  }
  for (const c of calculs) {
    c.comptes = arrondi(Math.min(c.bruts, c.bornes.max));
    c.perdus = arrondi(c.bruts - c.comptes);
    // Un bloc à contenu ouvert n'a reçu aucun cours et ne pouvait pas en
    // recevoir : lui compter un manque produirait un « il manque 6 crédits dans
    // le bloc 71G » que l'étudiant ne peut pas corriger dans cette application,
    // puisque les cours en question ne sont dans aucune de nos données. Le
    // problème est dit autrement, plus bas.
    c.capaciteListee = capaciteDeBloc(c.bloc, fiches);
    // Ce qui reste à faire se mesure contre ce qui est ATTEIGNABLE, pas contre
    // un minimum que la page elle-même rend inatteignable : sinon l'étudiant
    // lit « il manque 3 crédits » après avoir réussi tout le bloc, sans aucun
    // moyen d'y répondre. L'écart, lui, n'est pas tu — il est journalisé plus
    // bas comme une incohérence de la page.
    const atteignable =
      c.capaciteListee !== null ? Math.min(c.bornes.min, c.capaciteListee) : c.bornes.min;
    c.manquants = estOuvert(c.bloc) ? 0 : arrondi(Math.max(0, atteignable - c.comptes));
  }

  // --- totaux par type ----------------------------------------------------
  const total = (type: TypeBloc, champ: "comptes" | "min" | "max") =>
    arrondi(
      calculs
        .filter((c) => c.bornes.type === type)
        .reduce(
          (s, c) => s + (champ === "comptes" ? c.comptes : champ === "min" ? c.bornes.min : c.bornes.max),
          0,
        ),
    );

  const creditsObligatoires = total("obligatoire", "comptes");
  const creditsOption = total("option", "comptes");
  const creditsChoix = total("choix", "comptes");
  const creditsTotal = arrondi(creditsObligatoires + creditsOption + creditsChoix);
  const obtenus = { obligatoire: creditsObligatoires, option: creditsOption, choix: creditsChoix };

  const minsOption = total("option", "min");
  const capaciteOption = total("option", "max");
  const exigeOption = exigences.option.intervalle.min;

  // --- cohérence des données du programme ---------------------------------
  let donneesIncoherentes = false;
  const incoherence = (message: string) => {
    donneesIncoherentes = true;
    problemes.push(message);
  };

  for (const cle of clesDupliquees) {
    incoherence(
      `deux blocs de ce programme portent la même clé « ${cle} » : ils sont indiscernables, l'affectation des cours entre eux n'est pas fiable.`,
    );
  }
  for (const c of calculs) {
    if (c.bornes.illisible !== null) {
      incoherence(
        `la règle du bloc ${c.bloc.id} n'a pas été interprétée (« ${c.bloc.regleBrut ?? c.bornes.illisible} ») : l'audit de ce bloc n'est pas concluant.`,
      );
    }
    // `contenuOuvert` exclut ce diagnostic : un bloc qui n'énumère rien PARCE
    // QUE la page renvoie à un ensemble extérieur n'est pas une donnée
    // incomplète. C'est exactement la distinction que ce champ sert à faire —
    // sans lui, les deux cas seraient confondus et l'un des deux serait faux.
    if (
      c.bornes.type === "option" &&
      (c.bloc.cours ?? []).length === 0 &&
      c.bornes.min > 0 &&
      !estOuvert(c.bloc)
    ) {
      incoherence(
        `le bloc ${c.bloc.id} exige un minimum de ${cr(c.bornes.min)} mais ne liste aucun cours : données de programme incomplètes, ce bloc ne peut pas être rempli.`,
      );
    }
    // Le bloc liste des cours, toutes leurs fiches sont connues, et leur somme
    // n'atteint pas le minimum annoncé. L'écart est réel et il est AMONT.
    if (estInfaisable(c)) {
      incoherence(
        `le bloc ${nomBloc(c.bloc)} annonce « ${c.bloc.regleBrut} » mais les ${(c.bloc.cours ?? []).length} cours qu'il liste ne totalisent que ${cr(c.capaciteListee ?? 0)} : ` +
          `c'est la PAGE du programme qui est incohérente, pas votre parcours. Même en réussissant tout ce qui y figure, il resterait ${cr(c.bornes.min - (c.capaciteListee ?? 0))} ` +
          `hors d'atteinte. L'audit ne vous les réclame donc pas, mais il ne peut pas non plus déclarer ce bloc conforme — il le signale.`,
      );
    }
  }

  // --- blocs à contenu ouvert : invérifiables, jamais avalés ---------------
  const ouvertsNonAffirmables = traiterContenuOuvert(calculs, problemes);

  // --- quotas par sigle (R2) : vérifiés, plus seulement conservés ----------
  // Ces règles ne se voient PAS bloc par bloc — c'est le piège de l'actuariat
  // (18 vs 33) transposé aux sigles : chaque bloc peut être dans ses bornes
  // sans que « 33 crédits POL et 33 crédits ECN » soit rempli. Voir
  // `sigles.ts` pour ce qui est lu, ce qui est écarté, et pourquoi.
  const { contraintes: contraintesSigles, nonLues: prosesNonLues } =
    lireContraintesSigles(programme);
  const attribuesParBloc = new Map(calculs.map((c) => [c.cle, [...c.attribues]]));
  const retenus = new Set<CodeCours>();
  for (const c of calculs) for (const code of c.attribues) retenus.add(code);
  const resultatsSigles = verifierContraintesSigles(contraintesSigles, {
    attribuesParBloc,
    nonAttribues: [...acquis].filter((code) => !retenus.has(code)),
    fiches,
  });
  // Un quota MINIMUM non atteint est une exigence de diplôme ratée ; un quota
  // indéterminé (des cours retenus n'ont pas de fiche) rend le verdict non
  // affirmable, exactement comme un bloc ouvert à minimum. Une EXCLUSION, elle,
  // ne fait jamais échouer : la page écrit « Sauf exception autorisée ».
  let siglesNonAffirmables = 0;
  for (const r of resultatsSigles) {
    if (r.etat === "satisfaite") continue;
    if (r.contrainte.genre === "minimum") siglesNonAffirmables++;
    problemes.push(r.message);
  }
  for (const p of prosesNonLues) {
    problemes.push(
      `prose de quota NON évaluée (${p.raison}) : « ${p.phrase} ». Le moteur ne l'applique pas — à lire soi-même.`,
    );
  }
  if (exigeOption < 0) {
    incoherence(
      `incohérence des données : les blocs obligatoires (${cr(exigences.obligatoire.intervalle.min)}) et au choix (${cr(exigences.choix.intervalle.min)}) dépassent déjà les ${cr(programme.creditsTotal ?? 0)} du programme.`,
    );
  } else if (exigeOption > 0 && capaciteOption < exigeOption) {
    incoherence(
      `incohérence des données : le programme exige ${cr(exigeOption)} d'option alors que les maximums des blocs d'option n'en autorisent que ${cr(capaciteOption)}.`,
    );
  } else if (exigeOption > 0 && minsOption > exigeOption) {
    incoherence(
      `incohérence des données : les minimums des blocs d'option totalisent ${cr(minsOption)}, soit plus que les ${cr(exigeOption)} d'option exigés par le programme.`,
    );
  }

  // --- niveau 1 : bornes de chaque bloc -----------------------------------
  for (const c of calculs) {
    if (c.manquants > 0) {
      problemes.push(
        `il manque ${cr(c.manquants)} dans le bloc ${nomBloc(c.bloc)} : ${cr(c.comptes)} sur un minimum de ${cr(c.bornes.min)}.`,
      );
    }
  }

  // --- niveau 2 : totaux par type de bloc ---------------------------------
  // C'est ici que le piège 18-contre-33 se fait prendre : tous les blocs
  // d'option peuvent être à leur minimum et le total d'option rester court.
  const libelle = { obligatoire: "de cours obligatoires", option: "de cours d'option", choix: "de cours au choix" } as const;
  const manques = { obligatoire: 0, option: 0, choix: 0 };

  for (const type of ["obligatoire", "option", "choix"] as const) {
    const borne = exigences[type].intervalle;
    const obtenu = obtenus[type];
    const manque = arrondi(Math.max(0, borne.min - obtenu));
    manques[type] = manque;
    if (manque <= 0) continue;

    const exige =
      borne.min === borne.max
        ? `les ${cr(borne.min)} exigés`
        : `le minimum de ${cr(borne.min)} exigé (l'intervalle du programme va de ${cr(borne.min)} à ${cr(borne.max)})`;
    let message = `il manque ${cr(manque)} ${libelle[type]} : ${cr(obtenu)} sur ${exige}`;
    if (exigences[type].source === "deduction") {
      message += ` (${cr(programme.creditsTotal ?? 0)} au total − ${cr(exigences.obligatoire.intervalle.min)} d'obligatoires − ${cr(exigences.choix.intervalle.min)} au choix)`;
    } else if (exigences.brut) {
      message += ` d'après la page (« ${exigences.brut} »)`;
    }
    message += ".";

    if (type === "option") {
      const restantes = calculs
        .filter((c) => c.bornes.type === "option" && c.bornes.max - c.comptes > 0)
        .map((c) => `${c.bloc.id} ${cr(arrondi(c.bornes.max - c.comptes))}`);
      message +=
        ` Les minimums des blocs d'option ne totalisent que ${cr(minsOption)} : atteindre chaque minimum NE SUFFIT PAS.` +
        ` Ajoutez ${cr(manque)} dans n'importe quel bloc d'option encore sous son maximum` +
        (restantes.length > 0 ? ` (place restante : ${restantes.join(", ")}).` : ".");
    }
    if (type === "choix") {
      message +=
        ` N'importe quel cours qui n'est cité par aucun bloc du programme y compte ; un cours d'option en surplus, non.`;
    }
    problemes.push(message);
    problemes.push(...messagesPerdus(calculs, type));
  }

  // --- niveau 2 bis : un total de type qui DÉPASSE son intervalle ---------
  // Le droit écrit « de 30 à 33 crédits à option » : au-delà de 33, les crédits
  // sont réussis mais ne comptent pas vers le diplôme. Ne pas le dire ferait
  // croire que 36 crédits d'option valent 36.
  let retenuApresPlafondType = 0;
  for (const type of ["obligatoire", "option", "choix"] as const) {
    const borne = exigences[type].intervalle;
    const obtenu = obtenus[type];
    const retenu = Math.min(obtenu, borne.max);
    retenuApresPlafondType = arrondi(retenuApresPlafondType + retenu);
    const surplus = arrondi(obtenu - retenu);
    if (surplus > 0) {
      problemes.push(
        `${cr(surplus)} ${libelle[type]} dépassent le maximum de ${cr(borne.max)} que le programme autorise pour ce type : ils sont réussis mais ne comptent pas vers le diplôme.`,
      );
    }
  }

  // --- niveau 3 : le total du programme, qui couple les intervalles -------
  // Le droit : 68 obligatoires + « de 30 à 33 » d'option + « maximum 3 » au
  // choix, pour 101 crédits. Chaque type peut être dans son intervalle sans que
  // la somme atteigne 101 — c'est le couplage, et il ne se vérifie qu'ici.
  const manqueTotal =
    contraintes.creditsTotal === null
      ? 0
      : arrondi(Math.max(0, contraintes.creditsTotal - retenuApresPlafondType));
  if (manqueTotal > 0 && manques.obligatoire === 0 && manques.option === 0 && manques.choix === 0) {
    problemes.push(
      `chaque type de crédits est dans son intervalle, mais il manque ${cr(manqueTotal)} au total du programme : ` +
        `${cr(retenuApresPlafondType)} comptent sur les ${cr(contraintes.creditsTotal ?? 0)} exigés. ` +
        `Les intervalles par type sont couplés par la somme : en être dans chacun ne suffit pas.`,
    );
  }

  // --- limites de l'audit lui-même : jamais avalées -----------------------
  const inconnus = dedup(calculs.flatMap((c) => c.creditsInconnus));
  if (inconnus.length > 0) {
    problemes.push(
      `${inconnus.length === 1 ? "1 cours marqué fait n'a" : `${inconnus.length} cours marqués faits n'ont`} aucune fiche dans le catalogue (${listerCodes(inconnus)}) : ` +
        `crédits inconnus, comptés comme 0. Le verdict ci-dessus est donc au pire trop sévère, jamais trop clément.`,
    );
  }
  if (invalides.length > 0) {
    problemes.push(
      `${invalides.length} code(s) de cours fait(s) non reconnu(s) et ignoré(s) (${listerCodes(invalides)}) : forme attendue « ABC 1234 ».`,
    );
  }
  if (affectation.horsBloc.length > 0) {
    problemes.push(
      `${affectation.horsBloc.length} cours fait(s) n'entre(nt) dans aucun bloc de ce programme (${listerCodes(affectation.horsBloc)}) : leurs crédits ne comptent pas vers le diplôme.`,
    );
  }
  if (chevauchements.length > 0) {
    problemes.push(messageChevauchement(chevauchements, affectation, calculs));
  }
  if (affectation.tronquee) {
    problemes.push(
      `la recherche d'affectation a été TRONQUÉE au plafond de ${PLAFOND_AFFECTATIONS} affectations ` +
        `(${affectation.combinaisons === Infinity ? "plus de 2^53" : affectation.combinaisons} possibles) : ` +
        `une affectation conforme existe peut-être et n'a pas été trouvée. Ce verdict de non-conformité n'est PAS démontré.`,
    );
  }

  // --- les règles que le contrat ne modélise pas : visibles, pas bloquantes
  const nbNotes =
    (programme.notes ?? []).length + calculs.reduce((s, c) => s + (c.bloc.notes ?? []).length, 0);
  if (nbNotes > 0) {
    problemes.push(
      `${nbNotes} note(s) normative(s) de la page ne sont PAS évaluées par le moteur (prose des blocs et du programme : séquences, autorisations, quotas par sigle, « trois cours dans la même discipline »). ` +
        `À lire avant de se fier au verdict ci-dessus.`,
    );
  }
  problemes.push(...exigences.notes);

  // --- verdict -------------------------------------------------------------
  const blocsConformes = calculs.every((c) => c.manquants === 0 && c.bornes.illisible === null);
  const conforme =
    !donneesIncoherentes &&
    blocsConformes &&
    // Un bloc ouvert qui exige un minimum rend le verdict NON AFFIRMABLE : on
    // ne peut ni le déclarer satisfait (rien ne le prouve) ni le déclarer raté
    // (rien ne le prouve non plus). `conforme: false` avec un message qui dit
    // « pas établi » plutôt que « il vous manque des crédits ».
    ouvertsNonAffirmables === 0 &&
    siglesNonAffirmables === 0 &&
    manques.obligatoire === 0 &&
    manques.option === 0 &&
    manques.choix === 0 &&
    manqueTotal === 0;

  const etatsBlocs: EtatBloc[] = calculs.map((c) => ({
    // `cleBloc` identifie (l'id ne suffit pas : `MM-Bloc 73A` et `S-Bloc 73A`),
    // `idBloc` affiche.
    cleBloc: c.cle,
    idBloc: c.bloc.id,
    // Crédits RETENUS vers le diplôme (déjà plafonnés au maximum du bloc) ;
    // le surplus est dans `creditsPerdus`. creditsAttribues + creditsPerdus =
    // total des crédits des cours attribués au bloc.
    creditsAttribues: c.comptes,
    creditsManquants: c.manquants,
    creditsPerdus: c.perdus,
    // Un bloc ouvert sans minimum n'a rien à satisfaire : `true`, il n'échoue
    // pas. Avec un minimum, il n'est pas établi : `false`, et le message dit que
    // c'est faute de pouvoir vérifier, pas faute de crédits.
    // Comme pour un bloc à contenu ouvert, `conforme: false` avec
    // `creditsManquants: 0` : la règle annoncée n'est pas satisfaite, mais rien
    // de ce que l'étudiant peut faire n'y changerait quoi que ce soit.
    conforme:
      c.manquants === 0 &&
      c.bornes.illisible === null &&
      !(estOuvert(c.bloc) && c.bornes.min > 0) &&
      !estInfaisable(c),
    coursAttribues: [...c.attribues],
  }));

  return {
    idProgramme: programme.id,
    blocs: etatsBlocs,
    creditsTotal,
    creditsObligatoires,
    creditsOption,
    creditsChoix,
    conforme,
    problemes,
  };
}

/**
 * Les blocs à contenu ouvert : ce que l'audit en dit, et pourquoi.
 *
 * Un tel bloc renvoie à un ensemble de cours qui n'est PAS dans nos données
 * (« les cours de langues offerts par le Centre de langues »). Trois réponses
 * possibles, et les deux premières sont fausses :
 *
 *  - le déclarer SATISFAIT : c'est affirmer sans preuve, et l'étudiant
 *    découvrirait le contraire à l'inscription ;
 *  - le déclarer IMPOSSIBLE : « il manque 6 crédits dans le bloc 71G » est un
 *    problème qu'il ne peut pas corriger ici, puisque ces cours n'existent nulle
 *    part dans l'application. Répété à chaque audit, ce message ne fait
 *    qu'apprendre à ignorer les messages ;
 *  - le DIRE, en distinguant les deux situations possibles. C'est ce qu'on
 *    fait, et c'est la même famille que la troncature de la recherche
 *    d'affectation : un verdict dont on connaît la limite vaut mieux qu'un
 *    verdict faux.
 *
 * Sans minimum (les deux cas réels relevés sont « maximum 6 crédits », donc
 * minimum 0), il n'y a rien à satisfaire : simple mise en garde, le verdict
 * reste calculable. Avec un minimum, le verdict devient NON AFFIRMABLE et la
 * fonction le compte pour que `conforme` ne puisse pas passer à vrai.
 *
 * @returns le nombre de blocs ouverts qui empêchent d'affirmer la conformité.
 */
function traiterContenuOuvert(calculs: Calcul[], problemes: string[]): number {
  let nonAffirmables = 0;
  for (const c of calculs) {
    if (!estOuvert(c.bloc)) continue;
    const prose = (c.bloc.notes ?? []).map((n) => n.trim()).filter((n) => n !== "");
    const renvoi =
      prose.length > 0
        ? ` La page dit seulement : « ${prose.join(" ")} »`
        : ` La page ne dit pas non plus où les trouver.`;
    if (c.bornes.min > 0) {
      nonAffirmables++;
      problemes.push(
        `le bloc ${nomBloc(c.bloc)} (« ${c.bloc.regleBrut} ») n'énumère aucun cours : son contenu est décrit en prose et renvoie à un ensemble extérieur à ces données. ` +
          `Comme il exige un minimum de ${cr(c.bornes.min)}, l'audit NE PEUT PAS établir la conformité de ce programme — ce n'est pas « il vous manque des crédits », c'est « je ne sais pas vérifier ».` +
          renvoi,
      );
    } else {
      problemes.push(
        `le bloc ${nomBloc(c.bloc)} (« ${c.bloc.regleBrut} ») n'énumère aucun cours : son contenu est décrit en prose et renvoie à un ensemble extérieur à ces données. ` +
          `Il n'impose aucun minimum, donc il n'empêche pas de diplômer, mais l'audit ne peut ni compter ni vérifier ce que vous y avez fait.` +
          renvoi,
      );
    }
  }
  return nonAffirmables;
}

/**
 * Le chevauchement n'est plus une anomalie à signaler « au cas où » : c'est un
 * cas traité, et le message doit dire ce que le solveur a conclu ET sur quelle
 * base, pour que l'étudiant puisse vérifier.
 */
function messageChevauchement(
  chevauchements: [CodeCours, string[]][],
  affectation: { cout: { blocs: number; types: number; total: number }; explorees: number; combinaisons: number; tronquee: boolean; parCle: Map<string, CodeCours[]> },
  calculs: Calcul[],
): string {
  const liste = chevauchements
    .slice(0, 6)
    .map(([code, ids]) => `${code} : ${ids.join(" + ")}`)
    .join(" ; ");
  const reste = chevauchements.length - 6;
  const tete =
    `${chevauchements.length} cours figure(nt) dans plusieurs blocs (${liste}${reste > 0 ? `, … (+${reste})` : ""}) : ` +
    `l'affectation a donc été RÉSOLUE sous bornes, pas attribuée au premier bloc déclaré`;

  const nul = affectation.cout.blocs === 0 && affectation.cout.types === 0 && affectation.cout.total === 0;
  const repartition = calculs
    .filter((c) => c.attribues.some((code) => chevauchements.some(([k]) => k === code)))
    .map((c) => `${c.bloc.id} ← ${c.attribues.filter((code) => chevauchements.some(([k]) => k === code)).join(", ")}`)
    .join(" ; ");

  if (nul) {
    return (
      `${tete}. L'affectation retenue est la PREUVE que le parcours tient : ${repartition}. ` +
      `(${affectation.explorees} affectation(s) examinée(s).)`
    );
  }
  if (affectation.tronquee) {
    return `${tete}, mais la recherche a été tronquée : voir l'avertissement ci-dessous.`;
  }
  return (
    `${tete}. AUCUNE des ${affectation.combinaisons === Infinity ? "très nombreuses" : affectation.combinaisons} affectations possibles ne satisfait toutes les bornes ; ` +
    `la moins mauvaise est retenue ci-dessus pour expliquer ce qui manque (${repartition || "aucun cours de chevauchement n'est fait"}).`
  );
}

/** Crédits au-delà du maximum d'un bloc : ils expliquent souvent à eux seuls
 *  pourquoi un total reste court alors que l'étudiant a « assez de cours ». */
function messagesPerdus(calculs: Calcul[], type: TypeBloc): string[] {
  return calculs
    .filter((c) => c.bornes.type === type && c.perdus > 0)
    .map(
      (c) =>
        `${cr(c.perdus)} dépassent le maximum du bloc ${c.bloc.id} (${cr(c.bornes.max)}) et ne comptent pas vers le diplôme : ` +
        `déplacez ces cours vers un autre bloc du même type encore sous son maximum.`,
    );
}
