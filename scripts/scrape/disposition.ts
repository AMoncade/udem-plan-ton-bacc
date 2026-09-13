/**
 * Écriture de la disposition sur disque, définie par `lib/types.ts`.
 *
 *   data/index-programmes.json   IndexProgrammes  — 1 088 fiches légères
 *   data/programmes/<id>.json    Programme        — un par slug
 *   data/cours/<SUJET>.json      Record<CodeCours, Cours> — découpé par sujet
 *   data/journal.json            EntreeJournal[]
 *
 * POURQUOI DÉCOUPER. L'app devient une application de bureau Electron qui
 * embarque tout le catalogue hors ligne. Un seul JSON de 12 Mo rendrait chaque
 * démarrage pénible ; découpé, on ne charge que le programme affiché et les
 * sujets dont ses blocs ont besoin. C'est aussi ce qui permet au scrape d'être
 * repris par passes : chaque passe réécrit les fichiers qu'elle a produits sans
 * toucher aux autres.
 *
 * LE DÉCOUPAGE DES COURS PASSE PAR `sujetDeCode()` de `lib/codes.ts`, jamais par
 * `code.slice(0,3)` : le scraper écrit ces fichiers et l'UI les charge, et deux
 * découpages différents donneraient des fichiers que personne ne retrouve.
 *
 * FUSION, PAS ÉCRASEMENT, pour `data/cours/<SUJET>.json`. Une passe
 * `--programmes baccalaureat-en-droit` ne connaît qu'une partie des cours DRT.
 * Réécrire le fichier entier effacerait ceux qu'une passe précédente a obtenus ;
 * on relit donc l'existant et on fusionne. L'index et le journal, eux, sont
 * cumulatifs par construction de l'appelant.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  Cours,
  EntreeJournal,
  FicheIndex,
  IndexProgrammes,
  Programme,
} from "../../lib/types";
import { sujetDeCode } from "../../lib/codes";
import { parcoursDe, projeterOrientation } from "../../lib/parcours";

export const RACINE_DEPOT = path.resolve(import.meta.dirname, "..", "..");
export const DOSSIER_DONNEES = path.join(RACINE_DEPOT, "data");
export const DOSSIER_PROGRAMMES = path.join(DOSSIER_DONNEES, "programmes");
export const DOSSIER_COURS = path.join(DOSSIER_DONNEES, "cours");
export const CHEMIN_INDEX = path.join(DOSSIER_DONNEES, "index-programmes.json");
export const CHEMIN_JOURNAL = path.join(DOSSIER_DONNEES, "journal.json");

const AVERTISSEMENT =
  "Fichier GÉNÉRÉ par `npm run scrape`. Ne pas éditer à la main : la prochaine passe l'écrase.";

async function ecrireJson(chemin: string, valeur: unknown): Promise<void> {
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

/**
 * Fiches légères d'un programme : UNE PAR PARCOURS, pas une par page.
 *
 * Ce que le sélecteur propose, ce n'est pas une page mais un parcours suivable :
 * la page du bacc. en mathématiques en porte sept, et « ouvrir le bacc. en
 * mathématiques » n'a pas de sens — ses orientations sont des alternatives dont
 * les blocs ne s'additionnent pas. À l'échelle mesurée, ~545 pages exploitables
 * portent ~964 parcours.
 *
 * La clé vient de `cleParcours()` et l'énumération de `parcoursDe()`, tous deux
 * dans `lib/parcours.ts` : si le scraper et l'UI ne comptaient pas les parcours
 * de la même façon, le sélecteur en proposerait qui ne s'ouvrent pas, ou en
 * cacherait — sans qu'aucune erreur apparaisse. D'où un seul endroit qui compte.
 *
 * `nbBlocs` est celui DU PARCOURS, pas de la page : c'est ce que le sélecteur
 * annonce et ce que l'étudiant ouvrira.
 */
export function fichesDeProgramme(programme: Programme, structureLue: boolean): FicheIndex[] {
  return parcoursDe(programme).map(({ cle, orientation }) => {
    const projete = orientation === null ? programme : projeterOrientation(programme, orientation);
    return {
      cle,
      id: programme.id,
      nom: programme.nom,
      orientation,
      cycle: programme.cycle,
      faculte: programme.faculte,
      typeProgramme: programme.typeProgramme,
      creditsTotal: programme.creditsTotal,
      nbBlocs: projete.blocs.length,
      structureLue,
    };
  });
}

export async function ecrireProgramme(programme: Programme): Promise<string> {
  const chemin = path.join(DOSSIER_PROGRAMMES, `${programme.id}.json`);
  await ecrireJson(chemin, { _avertissement: AVERTISSEMENT, ...programme });
  return chemin;
}

/** Regroupe des fiches de cours par sujet de trois lettres. */
export function grouperParSujet(cours: Cours[]): {
  parSujet: Map<string, Record<string, Cours>>;
  sansSujet: string[];
} {
  const parSujet = new Map<string, Record<string, Cours>>();
  const sansSujet: string[] = [];
  for (const c of cours) {
    const sujet = sujetDeCode(c.code);
    if (sujet === null) {
      // `sujetDeCode` exige la forme canonique : un code qui n'en a pas n'a
      // nulle part où aller, et le taire le ferait disparaître du catalogue.
      sansSujet.push(c.code);
      continue;
    }
    const seau = parSujet.get(sujet) ?? {};
    seau[c.code] = c;
    parSujet.set(sujet, seau);
  }
  return { parSujet, sansSujet };
}

/**
 * Écrit `data/cours/<SUJET>.json` en FUSIONNANT avec ce qui s'y trouve déjà.
 * Rend les sujets touchés.
 *
 * AUCUNE clé `_avertissement` ici, contrairement à l'index et aux programmes.
 * Le contrat dit `Record<CodeCours, Cours>` : TOUTES les clés sont des codes de
 * cours, et les tests de couture vérifient que chacune passe `normaliserCode()`
 * à l'identique. Une clé de commentaire y ferait échouer la vérification la plus
 * utile du lot — et pour l'UI, ce serait un « cours » de plus dans le fichier.
 * (L'entrée existante est quand même filtrée à la relecture, pour absorber un
 * fichier écrit par une version antérieure.)
 */
export async function ecrireCours(cours: Cours[]): Promise<{ sujets: string[]; sansSujet: string[] }> {
  const { parSujet, sansSujet } = grouperParSujet(cours);
  await mkdir(DOSSIER_COURS, { recursive: true });
  for (const [sujet, fiches] of parSujet) {
    const chemin = path.join(DOSSIER_COURS, `${sujet}.json`);
    let existant: Record<string, Cours> = {};
    try {
      const brut = JSON.parse(await readFile(chemin, "utf8")) as Record<string, unknown>;
      for (const [code, valeur] of Object.entries(brut)) {
        if (code.startsWith("_")) continue;
        existant[code] = valeur as Cours;
      }
    } catch {
      existant = {};
    }
    await ecrireJson(chemin, { ...existant, ...fiches });
  }
  return { sujets: [...parSujet.keys()], sansSujet };
}

/** Tous les sujets présents sur le disque, pour `IndexProgrammes.sujets`. */
export async function sujetsSurDisque(): Promise<string[]> {
  try {
    const fichiers = await readdir(DOSSIER_COURS);
    return fichiers
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Tous les codes de cours DÉJÀ en fiche sur le disque.
 *
 * Sert la reprise de la passe « cours » (`--reprendre`). Le cache réseau rend
 * une reprise gratuite en requêtes, mais PAS en temps : relire 8 600 fiches
 * depuis le cache coûte quand même des minutes, et surtout `--limite-cours N`
 * reprend les N PREMIERS codes de l'union — sans cette lecture, découper la
 * passe en tranches refait éternellement la même tranche.
 *
 * On lit les clés, pas les valeurs : la question est « ai-je une fiche pour ce
 * code », et désérialiser 1 314 fiches pour y répondre serait du gaspillage.
 * Les clés de commentaire (`_avertissement`) sont écartées comme partout
 * ailleurs, pour absorber un fichier écrit par une version antérieure.
 */
export async function codesSurDisque(dossier: string = DOSSIER_COURS): Promise<Set<string>> {
  const codes = new Set<string>();
  let fichiers: string[];
  try {
    fichiers = (await readdir(dossier)).filter((f) => f.endsWith(".json"));
  } catch {
    return codes;
  }
  for (const f of fichiers) {
    try {
      const texte = await readFile(path.join(dossier, f), "utf8");
      // ON NE DÉSÉRIALISE PAS — et ce n'est pas une micro-optimisation.
      //
      // `JSON.parse` construit tout le graphe d'objets : 6 800 fiches avec leurs
      // descriptions, leurs trimestres et leurs arbres de préalables, pour n'en
      // lire que les CLÉS. Ce coût CROÎT à chaque tranche, et le système a tué
      // le scraper quatre fois de suite pendant cette passe. C'est le seul poste
      // dont la taille augmente à mesure qu'on avance : plus on récolte, plus la
      // tranche suivante paie cher pour savoir ce qu'elle a déjà.
      //
      // Les fichiers de sujet sont écrits par `ecrireJson`, donc indentés de deux
      // espaces : une clé de premier niveau est le seul endroit où une VRAIE
      // fin de ligne est suivie de deux espaces et d'un guillemet. Dans une
      // valeur de chaîne, JSON échappe le saut de ligne en `\n` littéral, donc
      // le motif ne peut pas s'y présenter.
      let trouve = false;
      for (const m of texte.matchAll(/^ {2}"((?:[^"\\]|\\.)*)":/gm)) {
        trouve = true;
        const code = m[1];
        if (!code.startsWith("_")) codes.add(code);
      }
      // Repli si le fichier n'a pas cette forme (écrit par une autre version, ou
      // réindenté) : mieux vaut payer le parse que rendre des codes absents et
      // refaire tout le travail.
      if (!trouve && texte.trim() !== "" && texte.trim() !== "{}") {
        const brut = JSON.parse(texte) as Record<string, unknown>;
        for (const code of Object.keys(brut)) if (!code.startsWith("_")) codes.add(code);
      }
    } catch {
      // Un fichier de sujet illisible ne doit pas faire sauter la passe : ses
      // codes sont simplement considérés absents, donc redemandés. Le pire cas
      // est de refaire du travail, jamais d'en escamoter.
    }
  }
  return codes;
}

/**
 * Écrit l'index en FUSIONNANT par `id` avec l'index déjà sur disque, pour qu'une
 * passe partielle (`--limite 30`) n'efface pas les 1 058 autres fiches.
 */
export async function ecrireIndex(
  fiches: FicheIndex[],
  scrapeISO: string,
  empreinte: string | null,
  sansCredits: Record<string, string> = {},
): Promise<{ chemin: string; total: number }> {
  // Fusion par CLÉ DE PARCOURS, pas par id : plusieurs fiches partagent le même
  // id (une par orientation de la même page). Fusionner par id n'en garderait
  // qu'une, et le sélecteur perdrait six des sept orientations du bacc en maths.
  let parCle = new Map<string, FicheIndex>();
  let empreinteHeritee: string | undefined;
  // CUMULATIF, et daté par code. Une passe cours ne voit que sa tranche : si
  // `codesSansCredits` était réécrit à chaque passe, il ne porterait que les
  // codes de la dernière — le défaut de `data/journal.json`, reproduit. La
  // fusion est triviale parce que chaque entrée porte SA date : la plus récente
  // l'emporte, et rien ne présente une observation de trois semaines comme
  // fraîche sous le `scrapeISO` de l'index.
  let sansCreditsCumules: Record<string, string> = {};
  try {
    const ancien = JSON.parse(await readFile(CHEMIN_INDEX, "utf8")) as IndexProgrammes;
    for (const f of ancien.programmes ?? []) parCle.set(f.cle, f);
    empreinteHeritee = ancien.empreinteExtracteur;
    sansCreditsCumules = { ...(ancien.codesSansCredits ?? {}) };
  } catch {
    parCle = new Map();
  }
  for (const [code, iso] of Object.entries(sansCredits)) {
    const connu = sansCreditsCumules[code];
    if (connu === undefined || connu < iso) sansCreditsCumules[code] = iso;
  }
  // Une page rescrapée peut avoir PERDU une orientation : ses anciennes fiches
  // doivent disparaître, sinon l'index garderait un parcours que plus aucun
  // fichier de programme ne déclare, et le test de couture le verrait.
  const idsReecrits = new Set(fiches.map((f) => f.id));
  for (const [cle, f] of [...parCle]) if (idsReecrits.has(f.id)) parCle.delete(cle);
  for (const f of fiches) parCle.set(f.cle, f);
  const programmes = [...parCle.values()].sort((a, b) => a.cle.localeCompare(b.cle, "fr"));
  // L'EMPREINTE NE SE RECALCULE PAS À CHAQUE PASSE — elle se TRANSMET.
  //
  // Premier réflexe, et c'était une erreur : la calculer ici, pour qu'aucune
  // passe ne puisse l'omettre. Mais l'empreinte affirme « les données de data/
  // ont été produites par ce code-là ». Une passe cours ne reproduit pas
  // data/programmes/ ; y estampiller le code courant attesterait une fraîcheur
  // qu'on n'a pas produite, et le test de fraîcheur se TAIRAIT justement dans
  // le cas qu'il existe pour attraper. Le champ serait passé d'absent (« je ne
  // sais pas ») à faux (« tout va bien »), ce qui est pire.
  //
  // D'où : `empreinte` non nulle seulement quand l'appelant a régénéré TOUTES
  // les structures ; nulle sinon, et on reporte alors ce que l'index portait
  // déjà. Ça satisfait les deux exigences — jamais effacée par une passe
  // partielle, jamais affirmée par une passe qui ne l'a pas méritée.
  const index: IndexProgrammes = {
    programmes,
    sujets: await sujetsSurDisque(),
    scrapeISO,
    ...(empreinte !== null
      ? { empreinteExtracteur: empreinte }
      : empreinteHeritee !== undefined
        ? { empreinteExtracteur: empreinteHeritee }
        : {}),
    ...(Object.keys(sansCreditsCumules).length > 0
      ? { codesSansCredits: sansCreditsCumules }
      : {}),
  };
  await ecrireJson(CHEMIN_INDEX, { _avertissement: AVERTISSEMENT, ...index });
  return { chemin: CHEMIN_INDEX, total: programmes.length };
}

/** Écrit `data/journal.json`. Écrasé à chaque passe : il décrit CETTE passe. */
export async function ecrireJournal(entrees: EntreeJournal[]): Promise<string> {
  await ecrireJson(CHEMIN_JOURNAL, entrees);
  return CHEMIN_JOURNAL;
}
