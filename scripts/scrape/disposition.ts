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

/** Fiche légère d'un programme pour `data/index-programmes.json`. */
export function ficheDeProgramme(programme: Programme, structureLue: boolean): FicheIndex {
  return {
    id: programme.id,
    nom: programme.nom,
    orientation: programme.orientation,
    cycle: programme.cycle,
    faculte: programme.faculte,
    typeProgramme: programme.typeProgramme,
    creditsTotal: programme.creditsTotal,
    nbBlocs: programme.blocs.length,
    structureLue,
  };
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
 * Écrit l'index en FUSIONNANT par `id` avec l'index déjà sur disque, pour qu'une
 * passe partielle (`--limite 30`) n'efface pas les 1 058 autres fiches.
 */
export async function ecrireIndex(
  fiches: FicheIndex[],
  scrapeISO: string,
): Promise<{ chemin: string; total: number }> {
  let parId = new Map<string, FicheIndex>();
  try {
    const ancien = JSON.parse(await readFile(CHEMIN_INDEX, "utf8")) as IndexProgrammes;
    for (const f of ancien.programmes ?? []) parId.set(f.id, f);
  } catch {
    parId = new Map();
  }
  for (const f of fiches) parId.set(f.id, f);
  const programmes = [...parId.values()].sort((a, b) => a.id.localeCompare(b.id, "fr"));
  const index: IndexProgrammes = {
    programmes,
    sujets: await sujetsSurDisque(),
    scrapeISO,
  };
  await ecrireJson(CHEMIN_INDEX, { _avertissement: AVERTISSEMENT, ...index });
  return { chemin: CHEMIN_INDEX, total: programmes.length };
}

/** Écrit `data/journal.json`. Écrasé à chaque passe : il décrit CETTE passe. */
export async function ecrireJournal(entrees: EntreeJournal[]): Promise<string> {
  await ecrireJson(CHEMIN_JOURNAL, entrees);
  return CHEMIN_JOURNAL;
}
