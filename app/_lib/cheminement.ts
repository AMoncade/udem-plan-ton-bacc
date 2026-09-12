/**
 * LE CHEMINEMENT CHOISI — un magasin externe, indexé PAR PARCOURS.
 *
 * Troisième axe du choix de l'étudiant, après le parcours et les cours faits.
 * L'orientation dit quels SEGMENTS s'appliquent — c'est une propriété de la
 * page. Le cheminement dit quels BLOCS à l'intérieur de ces segments — c'est un
 * choix de l'étudiant. Axes orthogonaux, donc stockage distinct.
 *
 * ## Pourquoi pas un champ dans `EtatStocke`
 *
 * Mesuré avant de décider : `ProviderEtat.tsx` construit l'état SANS spread à
 * deux endroits — `remplacer()` et `toutEffacer()` écrivent
 * `{ faits, plan }` en clair. Or `remplacer()` est précisément ce que l'écran
 * d'import appelle pour appliquer un relevé. Un champ ajouté à `EtatStocke`
 * serait donc effacé au premier import, sans erreur et sans trace. Que
 * `ImportEcran` fasse correctement `{ ...courant }` ne sauve rien : un appelant
 * sur trois suffit à perdre la donnée.
 *
 * Une clé `localStorage` à part coûte zéro migration — absente, elle rend un
 * objet vide — et ne touche pas la couture d'import.
 *
 * ## Pourquoi indexé par parcours et non à plat
 *
 * Contrairement aux `faits`, qui sont des codes de cours et valent partout,
 * un cheminement ne veut RIEN dire hors du parcours où il a été choisi. À plat,
 * « Stage » choisi sur une maîtrise en finance s'appliquerait silencieusement au
 * parcours suivant. C'est le même défaut qu'une identité qui voyage là où elle
 * n'a pas de sens.
 *
 * Même raison que `selection.ts` pour le magasin externe : le rendu serveur ne
 * voit pas `localStorage`, donc lire pendant le rendu casserait l'hydratation.
 */
const CLE = "plan-ton-bacc.cheminements.v1";

type Table = Record<string, string>;

const VIDE: Table = {};

let table: Table = VIDE;
let lu = false;
const abonnes = new Set<() => void>();

function prevenir(): void {
  for (const abonne of abonnes) abonne();
}

function relire(): void {
  try {
    const brut = window.localStorage.getItem(CLE);
    if (brut === null) {
      table = VIDE;
      return;
    }
    const valeur: unknown = JSON.parse(brut);
    if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) {
      table = VIDE;
      return;
    }
    // Filtré plutôt que cru : une entrée dont la valeur n'est pas une chaîne
    // viendrait d'une autre version et ferait filtrer le moteur sur une valeur
    // qui n'est le libellé d'aucun bloc.
    const propre: Table = {};
    for (const [cle, choix] of Object.entries(valeur as Record<string, unknown>)) {
      if (typeof choix === "string" && choix !== "") propre[cle] = choix;
    }
    table = propre;
  } catch {
    table = VIDE;
  }
}

export function abonnerCheminements(rappel: () => void): () => void {
  abonnes.add(rappel);
  if (!lu) {
    lu = true;
    relire();
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (evenement) => {
        if (evenement.key === CLE) {
          relire();
          prevenir();
        }
      });
    }
    queueMicrotask(prevenir);
  }
  return () => {
    abonnes.delete(rappel);
  };
}

/** Instantané stable : `useSyncExternalStore` compare par identité. */
export function lireCheminements(): Table {
  return table;
}

/** Le serveur ne connaît aucun choix, et n'en devine pas. */
export function lireCheminementsServeur(): Table {
  return VIDE;
}

/** Le cheminement retenu pour un parcours, ou `null` si l'étudiant n'a pas choisi. */
export function cheminementDe(cleParcours: string | null): string | null {
  if (cleParcours === null) return null;
  return table[cleParcours] ?? null;
}

/** Choisir, ou effacer le choix en passant `null`. */
export function choisirCheminement(cleParcours: string, choix: string | null): void {
  const suivant: Table = { ...table };
  if (choix === null) delete suivant[cleParcours];
  else suivant[cleParcours] = choix;
  table = suivant;
  try {
    window.localStorage.setItem(CLE, JSON.stringify(suivant));
  } catch {
    // Navigation privée ou quota plein : le choix reste valable en mémoire.
  }
  prevenir();
}
