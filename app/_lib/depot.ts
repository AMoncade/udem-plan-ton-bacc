/**
 * CHARGEMENT À LA DEMANDE — un `Catalogue` qui ne contient que ce qui est
 * affiché.
 *
 * Sur disque les données sont découpées exprès :
 *   data/index-programmes.json   fiches légères des 1 088 programmes
 *   data/programmes/<id>.json    un programme avec ses blocs
 *   data/cours/<SUJET>.json      les fiches de cours d'un sujet de 3 lettres
 *
 * Raison : l'app visée est une application de bureau Electron qui embarque tout
 * le catalogue hors ligne, environ 12 Mo. Charger 12 Mo pour afficher une liste
 * de programmes rendrait le démarrage pénible, alors qu'un programme et les
 * trois ou quatre sujets dont il parle pèsent quelques dizaines de kilo-octets.
 *
 * Le moteur n'a pas à le savoir : il reçoit un `Catalogue` ordinaire. Ses deux
 * signatures ne changent pas.
 */
import { normaliserCode, sujetDeCode } from "../../lib/codes";
import type {
  Bloc,
  Catalogue,
  CodeCours,
  Cours,
  EntreeJournal,
  IndexProgrammes,
  NoeudPrealable,
  Programme,
} from "../../lib/types";

/**
 * Une source de données découpée. Deux implémentations : `_lib/depot-fichiers`
 * lit le vrai `data/`, `_demo/depot-demo` fabrique de quoi travailler avant que
 * le scraper livre. La bascule est dans `app/_donnees/source.ts`.
 */
export interface Depot {
  /** D'où viennent les données, affiché tel quel dans le pied de page. */
  readonly origine: string;
  /** Vrai tant que les données sont fabriquées. Allume la bannière. */
  readonly estFactice: boolean;
  chargerIndex(): Promise<IndexProgrammes>;
  /** Rejette si le programme n'existe pas. Une absence n'est pas un programme
   *  vide : un écran vide ressemble à un bogue, une erreur dit ce qui manque. */
  chargerProgramme(id: string): Promise<Programme>;
  /** Les fiches d'un sujet. Un sujet absent rend une liste VIDE sans rejeter :
   *  un bloc peut citer un sujet que le scrape n'a pas encore visité, et c'est
   *  le cas normal du catalogue, pas une panne. */
  chargerSujet(sujet: string): Promise<Cours[]>;
}

/**
 * Nombre maximal de tours d'expansion des sujets.
 *
 * Les préalables franchissent les sujets : un cours d'actuariat exige un cours
 * de mathématiques, qui exige un cours de statistique. On suit donc les
 * préalables de proche en proche jusqu'à ce que rien de nouveau n'apparaisse.
 * Le plafond n'est pas là pour limiter la qualité mais pour qu'une boucle dans
 * les données ne fige pas l'onglet — et s'il est atteint, ça se consigne au
 * journal au lieu de tronquer en silence.
 */
const TOURS_MAX = 6;

/** Sujets cités par les blocs d'un programme. */
export function sujetsDesBlocs(blocs: Bloc[]): string[] {
  const sujets = new Set<string>();
  for (const bloc of blocs) {
    for (const brut of bloc.cours) {
      const code = normaliserCode(brut);
      if (code === null) continue;
      const sujet = sujetDeCode(code);
      if (sujet !== null) sujets.add(sujet);
    }
  }
  return [...sujets].sort();
}

/** Codes cités par un arbre de préalables. */
function codesDuNoeud(noeud: NoeudPrealable | null): CodeCours[] {
  if (noeud === null) return [];
  switch (noeud.genre) {
    case "cours":
      return [noeud.code];
    case "et":
    case "ou":
      return noeud.enfants.flatMap(codesDuNoeud);
    case "opaque":
      return [];
    default: {
      const jamais: never = noeud;
      throw new Error(`genre de noeud inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

/** Sujets cités par les préalables et les concomitants d'un lot de fiches. */
export function sujetsDesPrealables(fiches: Cours[]): string[] {
  const sujets = new Set<string>();
  const ajouter = (brut: string): void => {
    const code = normaliserCode(brut);
    if (code === null) return;
    const sujet = sujetDeCode(code);
    if (sujet !== null) sujets.add(sujet);
  };
  for (const fiche of fiches) {
    for (const code of codesDuNoeud(fiche.prealables)) ajouter(code);
    // Les concomitants et les restrictions sont du texte libre : on n'en tire
    // que des codes, pour savoir quel sujet charger. Rien ici ne les
    // interprète comme des préalables.
    for (const texte of [fiche.concomitantsBrut, fiche.restrictionsBrut]) {
      if (texte === null) continue;
      for (const trouve of texte.matchAll(/[A-Za-z]{3}[\s\-_]?\d{4,5}[A-Za-z]?/g)) {
        ajouter(trouve[0]);
      }
    }
  }
  return [...sujets].sort();
}

export interface CatalogueAssemble {
  catalogue: Catalogue;
  programme: Programme;
  /** Sujets effectivement chargés, pour pouvoir le dire à l'écran. */
  sujets: string[];
  /** Codes que `normaliserCode()` a refusés, conservés verbatim. */
  codesIllisibles: string[];
}

/**
 * Assemble en mémoire le `Catalogue` du programme demandé.
 *
 * Les codes sont repassés par `normaliserCode()` à l'entrée : UdeM écrit
 * « ACT 2250 », « ACT2250 » et « act-2250 » pour le même cours, et comparer
 * deux formes différentes ne lève AUCUNE erreur — ça vide juste le graphe de
 * préalables en silence. Tout code refusé va dans `codesIllisibles`, qui
 * s'affiche.
 */
export async function assembler(
  depot: Depot,
  id: string,
): Promise<CatalogueAssemble> {
  const journal: EntreeJournal[] = [];
  const programme = await depot.chargerProgramme(id);

  const illisibles: string[] = [];
  const norm = (brut: string): CodeCours => {
    const propre = normaliserCode(brut);
    if (propre === null) {
      if (!illisibles.includes(brut)) illisibles.push(brut);
      return brut.trim();
    }
    return propre;
  };
  const normNoeud = (noeud: NoeudPrealable): NoeudPrealable => {
    switch (noeud.genre) {
      case "cours":
        return { genre: "cours", code: norm(noeud.code) };
      case "et":
        return { genre: "et", enfants: noeud.enfants.map(normNoeud) };
      case "ou":
        return { genre: "ou", enfants: noeud.enfants.map(normNoeud) };
      case "opaque":
        return noeud;
      default: {
        const jamais: never = noeud;
        throw new Error(`genre de noeud inconnu: ${JSON.stringify(jamais)}`);
      }
    }
  };

  const blocs: Bloc[] = programme.blocs.map((bloc) => ({
    ...bloc,
    cours: [...new Set(bloc.cours.map(norm))],
  }));

  // --- expansion des sujets, de proche en proche --------------------------
  const charges = new Set<string>();
  const fiches = new Map<CodeCours, Cours>();
  let aCharger = sujetsDesBlocs(blocs);
  let tours = 0;

  while (aCharger.length > 0) {
    if (tours >= TOURS_MAX) {
      journal.push({
        genre: "inattendu",
        sujet: id,
        message:
          `les préalables s'étendent au-delà de ${TOURS_MAX} tours de chargement ; ` +
          `sujets non chargés : ${aCharger.join(", ")}. Les cours de ces sujets ` +
          `s'afficheront sans fiche.`,
      });
      break;
    }
    tours += 1;

    const lots = await Promise.all(
      aCharger.map(async (sujet) => ({ sujet, cours: await depot.chargerSujet(sujet) })),
    );
    const nouvelles: Cours[] = [];
    for (const lot of lots) {
      charges.add(lot.sujet);
      if (lot.cours.length === 0) {
        journal.push({
          genre: "manque",
          sujet: lot.sujet,
          message: `aucune fiche de cours pour le sujet ${lot.sujet} : les cours de ce sujet s'afficheront sans titre ni crédits.`,
        });
        continue;
      }
      for (const brute of lot.cours) {
        const code = norm(brute.code);
        const fiche: Cours = {
          ...brute,
          code,
          prealables:
            brute.prealables === null ? null : normNoeud(brute.prealables),
        };
        fiches.set(code, fiche);
        nouvelles.push(fiche);
      }
    }

    aCharger = sujetsDesPrealables(nouvelles).filter((sujet) => !charges.has(sujet));
  }

  // --- lignes de préalables non réduites ----------------------------------
  // Le scraper tient cette liste pour tout le catalogue ; ici on ne voit que
  // les fiches chargées, donc on la RECALCULE sur elles plutôt que de rendre
  // une liste vide qui laisserait croire que le parseur n'a rien raté.
  const prealablesNonParses = [...fiches.values()]
    .filter(
      (fiche) =>
        fiche.prealables === null &&
        fiche.prealablesBrut !== null &&
        fiche.prealablesBrut.trim() !== "",
    )
    .map((fiche) => ({ code: fiche.code, brut: fiche.prealablesBrut as string }));

  if (illisibles.length > 0) {
    journal.push({
      genre: "inattendu",
      sujet: id,
      message: `${illisibles.length} code(s) de cours non normalisable(s), conservé(s) tels quels : ${illisibles.join(", ")}.`,
    });
  }

  const programmeNormalise: Programme = { ...programme, blocs };
  return {
    catalogue: {
      programmes: [programmeNormalise],
      cours: Object.fromEntries(fiches),
      prealablesNonParses,
      journal,
      scrapeISO: programme.scrapeISO,
    },
    programme: programmeNormalise,
    sujets: [...charges].sort(),
    codesIllisibles: illisibles,
  };
}
