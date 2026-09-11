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
  RegleBloc,
} from "../types";
import { normaliserCode } from "../codes";

export { parsePrealables } from "./prealables";
export type { ResultatParsing } from "./prealables";

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
 * opaque sort dans `DiagnosticCours.avertissements`, un cours sans fiche ou une
 * règle de bloc illisible sort dans `Audit.problemes`. Un repli muet rend
 * l'audit faux sans faire échouer un seul test.
 */

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Les crédits UdeM ne sont pas tous entiers (des cours valent 1 ou 1,5
 *  crédit). Additionner des flottants fabrique des 17,999999999999996 qui
 *  feraient échouer une comparaison au minimum d'un bloc. */
function arrondi(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function nb(x: number): string {
  return String(arrondi(x)).replace(".", ",");
}

/** « 9 crédits », « 1 crédit », « 1,5 crédit », « 0 crédit ». */
function cr(x: number): string {
  return `${nb(x)} ${arrondi(x) >= 2 ? "crédits" : "crédit"}`;
}

/** « 75C (Compléments d'actuariat) », ou « 01A » tout court : le catalogue réel
 *  a deux blocs sans nom (01A et 75Z, la page de structure ne leur en donne
 *  pas), et « le bloc 01A () » est un message cassé. */
function nomBloc(bloc: Bloc): string {
  const nom = (bloc.nom ?? "").trim();
  return nom === "" ? bloc.id : `${bloc.id} (${nom})`;
}

function listerCodes(codes: readonly string[], maximum = 10): string {
  const visibles = codes.slice(0, maximum).join(", ");
  const reste = codes.length - maximum;
  return reste > 0 ? `${visibles}, … (+${reste})` : visibles;
}

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

function dedup<T>(xs: T[]): T[] {
  return [...new Set(xs)];
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

type TypeBloc = "obligatoire" | "option" | "choix" | "inconnu";

interface Bornes {
  type: TypeBloc;
  min: number;
  /** Infinity quand la règle ne pose pas de maximum. */
  max: number;
}

function bornesDeRegle(regle: RegleBloc | undefined): Bornes {
  if (!regle || typeof regle !== "object") return { type: "inconnu", min: 0, max: Infinity };
  switch (regle.type) {
    case "obligatoire":
      // « Obligatoire - 26 crédits » : tous les cours du bloc sont requis et
      // totalisent 26. Min et max confondus.
      return { type: "obligatoire", min: regle.credits, max: regle.credits };
    case "choix":
      return { type: "choix", min: regle.credits, max: regle.credits };
    case "option":
      return { type: "option", min: regle.min ?? 0, max: regle.max ?? Infinity };
    default: {
      // Garde d'exhaustivité : une règle inconnue ne doit pas être auditée comme
      // si elle était vide. Elle sort dans `Audit.problemes` et interdit de
      // déclarer le programme conforme.
      const inconnu: never = regle;
      void inconnu;
      return { type: "inconnu", min: 0, max: Infinity };
    }
  }
}

/** Un bloc « Choix » est celui dont la liste de cours est vide : n'importe quel
 *  cours compte. Un bloc d'OPTION à liste vide, lui, est une donnée incomplète
 *  (on ne sait pas quels cours l'alimentent) — ce n'est pas un joker. */
function estJoker(bloc: Bloc, bornes: Bornes): boolean {
  return bornes.type === "choix" && (bloc.cours ?? []).length === 0;
}

interface Calcul {
  bloc: Bloc;
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
}

/**
 * Audit d'un programme : bornes de chaque bloc ET totaux par type de bloc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE CENTRAL (vérifié sur data/fixtures/actuariat-verifie.fixture.json)
 *
 * Actuariat : 90 crédits = 54 obligatoires (01A 26 + 75A 21 + 75B 7) + 3 au
 * choix (75Z) + le reste en option. Les minimums des blocs d'option valent
 * 75C 12 + 75D 3 + 75E 0 + 75Y 3 = 18, pour une capacité (somme des maximums)
 * de 27 + 15 + 13 + 12 = 67.
 *
 * Les 33 crédits d'option exigés ne sont écrits NULLE PART dans les données :
 * ils se DÉDUISENT, 90 − 54 − 3 = 33. C'est pour ça que ce code les calcule au
 * lieu de les coder en dur — un autre programme aura d'autres nombres.
 *
 * Un audit qui vérifie chaque bloc indépendamment voit 12/12, 3/3, 0/0, 3/3 et
 * déclare « conforme » un parcours à 18 crédits d'option qui ne mène pas au
 * diplôme : il manque 15 crédits, plaçables dans n'importe quel bloc d'option
 * encore sous son maximum. `conforme` tient donc les deux niveaux ensemble.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ATTRIBUTION — hypothèse documentée
 *
 * Un cours ne compte que dans UN SEUL bloc. Vérifié sur la fixture : les huit
 * blocs de l'actuariat citent 55 codes et ces 55 codes sont DISTINCTS, aucun
 * chevauchement. Une attribution directe (chaque cours vers son bloc) suffit
 * donc, sans solveur d'affectation sous bornes.
 *
 * Le chevauchement est quand même DÉTECTÉ à l'exécution, pour le jour où le
 * scraper livrera un programme qui en contient : il ressort dans
 * `problemes`. Et l'erreur d'une attribution directe est à sens unique — elle
 * peut sous-estimer un bloc et déclarer non conforme un parcours conforme,
 * jamais l'inverse : quand elle conclut « conforme », l'attribution qu'elle a
 * trouvée est elle-même la preuve qu'une attribution valide existe.
 *
 * Cas particulier du bloc « Choix » (75Z, liste de cours vide) : il accepte
 * n'importe quel cours, donc il chevauche formellement tous les autres blocs.
 * Décision prise ici : un cours cité par un bloc va TOUJOURS dans ce bloc, et
 * seuls les cours cités par aucun bloc alimentent le bloc « Choix ». Un cours
 * d'option excédentaire n'est donc pas recyclé en cours au choix — c'est
 * l'interprétation stricte, et elle est dite explicitement dans le message de
 * `problemes` quand le bloc de choix est incomplet.
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

  // --- index code -> blocs qui le citent (détection du chevauchement) -------
  const blocsParCode = new Map<CodeCours, string[]>();
  for (const bloc of blocs) {
    for (const brut of bloc.cours ?? []) {
      const code = normaliserCode(brut) ?? brut;
      const deja = blocsParCode.get(code);
      if (deja) deja.push(bloc.id);
      else blocsParCode.set(code, [bloc.id]);
    }
  }
  const chevauchements = [...blocsParCode.entries()].filter(([, ids]) => ids.length > 1);

  // --- préparation des calculs par bloc ------------------------------------
  const calculs: Calcul[] = blocs.map((bloc) => ({
    bloc,
    bornes: bornesDeRegle(bloc.regle),
    bruts: 0,
    comptes: 0,
    perdus: 0,
    manquants: 0,
    attribues: [],
    creditsInconnus: [],
  }));
  const parId = new Map(calculs.map((c) => [c.bloc.id, c]));
  const jokers = calculs.filter((c) => estJoker(c.bloc, c.bornes));

  // --- attribution ---------------------------------------------------------
  // Ordre alphabétique : l'audit ne doit pas dépendre de l'ordre d'insertion
  // dans le Set que l'UI nous passe.
  const horsBloc: CodeCours[] = [];
  for (const code of [...acquis].sort()) {
    const ids = blocsParCode.get(code);
    let cible: Calcul | undefined;
    if (ids && ids.length > 0) {
      cible = parId.get(ids[0]); // attribution directe, ordre de déclaration
    } else if (jokers.length > 0) {
      // Premier bloc de choix encore sous son maximum, sinon le premier : le
      // surplus devient des crédits perdus, visibles, plutôt que disparus.
      cible = jokers.find((j) => j.bruts < j.bornes.max) ?? jokers[0];
    }
    if (!cible) {
      horsBloc.push(code);
      continue;
    }
    cible.attribues.push(code);
    const credits = creditsDeFiche(fiches.get(code));
    if (credits === null) cible.creditsInconnus.push(code);
    else cible.bruts = arrondi(cible.bruts + credits);
  }

  // --- bornes de chaque bloc ----------------------------------------------
  for (const c of calculs) {
    c.comptes = arrondi(Math.min(c.bruts, c.bornes.max));
    c.perdus = arrondi(c.bruts - c.comptes);
    c.manquants = arrondi(Math.max(0, c.bornes.min - c.comptes));
  }

  // --- totaux par type ----------------------------------------------------
  const total = (type: TypeBloc, champ: "comptes" | "min") =>
    arrondi(
      calculs
        .filter((c) => c.bornes.type === type)
        .reduce((s, c) => s + (champ === "comptes" ? c.comptes : c.bornes.min), 0),
    );

  const creditsObligatoires = total("obligatoire", "comptes");
  const creditsOption = total("option", "comptes");
  const creditsChoix = total("choix", "comptes");
  const creditsTotal = arrondi(creditsObligatoires + creditsOption + creditsChoix);

  const exigeObligatoire = total("obligatoire", "min");
  const exigeChoix = total("choix", "min");
  // Le nombre qui n'est écrit nulle part : 90 − 54 − 3 = 33.
  const exigeOption = arrondi((programme.creditsTotal ?? 0) - exigeObligatoire - exigeChoix);
  const minsOption = total("option", "min");
  const capaciteOption = arrondi(
    calculs.filter((c) => c.bornes.type === "option").reduce((s, c) => s + c.bornes.max, 0),
  );

  // --- cohérence des données du programme ---------------------------------
  let donneesIncoherentes = false;
  for (const c of calculs) {
    if (c.bornes.type === "inconnu") {
      donneesIncoherentes = true;
      problemes.push(
        `la règle du bloc ${c.bloc.id} n'a pas été interprétée (« ${c.bloc.regleBrut ?? "?"} ») : l'audit de ce bloc n'est pas concluant.`,
      );
    }
    if (c.bornes.type === "option" && (c.bloc.cours ?? []).length === 0 && c.bornes.min > 0) {
      donneesIncoherentes = true;
      problemes.push(
        `le bloc ${c.bloc.id} exige un minimum de ${cr(c.bornes.min)} mais ne liste aucun cours : données de programme incomplètes, ce bloc ne peut pas être rempli.`,
      );
    }
  }
  if (exigeOption < 0) {
    donneesIncoherentes = true;
    problemes.push(
      `incohérence des données : les blocs obligatoires (${cr(exigeObligatoire)}) et au choix (${cr(exigeChoix)}) dépassent déjà les ${cr(programme.creditsTotal ?? 0)} du programme.`,
    );
  } else if (exigeOption > 0 && capaciteOption < exigeOption) {
    donneesIncoherentes = true;
    problemes.push(
      `incohérence des données : le programme exige ${cr(exigeOption)} d'option alors que les maximums des blocs d'option n'en autorisent que ${cr(capaciteOption)}.`,
    );
  } else if (exigeOption > 0 && minsOption > exigeOption) {
    donneesIncoherentes = true;
    problemes.push(
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
  const manqueObligatoire = arrondi(Math.max(0, exigeObligatoire - creditsObligatoires));
  const manqueOption = arrondi(Math.max(0, exigeOption - creditsOption));
  const manqueChoix = arrondi(Math.max(0, exigeChoix - creditsChoix));

  if (manqueObligatoire > 0) {
    problemes.push(
      `il manque ${cr(manqueObligatoire)} de cours obligatoires : ${cr(creditsObligatoires)} sur les ${cr(exigeObligatoire)} exigés.`,
    );
    problemes.push(...messagesPerdus(calculs, "obligatoire"));
  }
  if (manqueOption > 0) {
    const restantes = calculs
      .filter((c) => c.bornes.type === "option" && c.bornes.max - c.comptes > 0)
      .map((c) =>
        c.bornes.max === Infinity
          ? `${c.bloc.id} sans maximum`
          : `${c.bloc.id} ${cr(arrondi(c.bornes.max - c.comptes))}`,
      );
    problemes.push(
      `il manque ${cr(manqueOption)} de cours d'option : ${cr(creditsOption)} sur les ${cr(exigeOption)} exigés par le programme ` +
        `(${cr(programme.creditsTotal ?? 0)} au total − ${cr(exigeObligatoire)} d'obligatoires − ${cr(exigeChoix)} au choix). ` +
        `Les minimums des blocs d'option ne totalisent que ${cr(minsOption)} : atteindre chaque minimum NE SUFFIT PAS. ` +
        `Ajoutez ${cr(manqueOption)} dans n'importe quel bloc d'option encore sous son maximum` +
        (restantes.length > 0 ? ` (place restante : ${restantes.join(", ")}).` : "."),
    );
    problemes.push(...messagesPerdus(calculs, "option"));
  }
  if (manqueChoix > 0) {
    problemes.push(
      `il manque ${cr(manqueChoix)} de cours au choix : ${cr(creditsChoix)} sur les ${cr(exigeChoix)} exigés. ` +
        `N'importe quel cours qui n'est cité par aucun bloc du programme y compte ; un cours d'option en surplus, non.`,
    );
    problemes.push(...messagesPerdus(calculs, "choix"));
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
  if (horsBloc.length > 0) {
    problemes.push(
      `${horsBloc.length} cours fait(s) n'entre(nt) dans aucun bloc de ce programme (${listerCodes(horsBloc)}) : leurs crédits ne comptent pas vers le diplôme.`,
    );
  }
  if (chevauchements.length > 0) {
    problemes.push(
      `${chevauchements.length} cours figure(nt) dans plusieurs blocs (${chevauchements.map(([code, ids]) => `${code} : ${ids.join(" + ")}`).join(" ; ")}) : ` +
        `l'attribution est directe (premier bloc déclaré), ce qui peut sous-estimer un autre bloc et rendre le verdict de non-conformité trop strict.`,
    );
  }

  const blocsConformes = calculs.every((c) => c.manquants === 0 && c.bornes.type !== "inconnu");
  const conforme =
    !donneesIncoherentes &&
    blocsConformes &&
    manqueObligatoire === 0 &&
    manqueOption === 0 &&
    manqueChoix === 0;

  const etatsBlocs: EtatBloc[] = calculs.map((c) => ({
    idBloc: c.bloc.id,
    // Crédits RETENUS vers le diplôme (déjà plafonnés au maximum du bloc) ;
    // le surplus est dans `creditsPerdus`. creditsAttribues + creditsPerdus =
    // total des crédits des cours attribués au bloc.
    creditsAttribues: c.comptes,
    creditsManquants: c.manquants,
    creditsPerdus: c.perdus,
    conforme: c.manquants === 0 && c.bornes.type !== "inconnu",
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
