/**
 * SOURCE DE DONNÉES — point de bascule unique.
 *
 * L'UI est construite contre la FIXTURE vérifiée, jamais contre
 * `data/catalogue.json` (qui n'existe pas : la session scraper le produit).
 * Le jour où le scraper livre, une seule ligne change ici — l'import — et
 * rien d'autre dans `app/**` ni `components/**`.
 *
 * Les codes sont repassés par `normaliserCode()` à l'entrée, même si la
 * fixture est déjà canonique : le catalogue scrapé, lui, arrivera avec les
 * trois écritures d'UdeM (« ACT 2250 », « ACT2250 », « act-2250 »). Comparer
 * deux formes différentes ne lève aucune erreur, ça vide juste le graphe en
 * silence. Tout code illisible est consigné dans `codesIllisibles` et affiché
 * à l'écran — un repli muet rendrait l'audit faux sans casser un test.
 */
import catalogueBrut from "../../data/catalogue.json";
import { normaliserCode } from "../../lib/codes";
import type {
  Bloc,
  Catalogue,
  CodeCours,
  Cours,
  NoeudPrealable,
  Programme,
} from "../../lib/types";

export interface SourceCatalogue {
  catalogue: Catalogue;
  /** D'où viennent les données, affiché tel quel dans le pied de page. */
  origine: string;
  /** Vrai tant que la source est la fixture partielle et non un vrai scrape. */
  partielle: boolean;
  /** Codes que `normaliserCode()` a refusés, conservés verbatim. */
  codesIllisibles: string[];
}

function chargerSource(): SourceCatalogue {
  const brut = catalogueBrut as unknown as Catalogue;
  const illisibles: string[] = [];

  const norm = (code: string): CodeCours => {
    const propre = normaliserCode(code);
    if (propre === null) {
      if (!illisibles.includes(code)) illisibles.push(code);
      return code.trim();
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
    }
  };

  const cours: Record<CodeCours, Cours> = {};
  for (const fiche of Object.values(brut.cours)) {
    const code = norm(fiche.code);
    cours[code] = {
      ...fiche,
      code,
      prealables: fiche.prealables === null ? null : normNoeud(fiche.prealables),
    };
  }

  const programmes: Programme[] = brut.programmes.map((programme) => ({
    ...programme,
    blocs: programme.blocs.map(
      (bloc): Bloc => ({ ...bloc, cours: [...new Set(bloc.cours.map(norm))] }),
    ),
  }));

  return {
    catalogue: { ...brut, programmes, cours },
    origine: "data/catalogue.json",
    partielle: false,
    codesIllisibles: illisibles,
  };
}

export const source = chargerSource();
export const catalogue = source.catalogue;

/** Le programme affiché. La fixture n'en contient qu'un. */
export const programme = catalogue.programmes[0];
