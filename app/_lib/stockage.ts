/**
 * L'état de l'étudiant sur disque — un petit magasin externe plutôt qu'un
 * `useState` rempli dans un effet.
 *
 * Raison : le rendu serveur ne voit pas `localStorage`. Lire le stockage
 * pendant le rendu produirait deux HTML différents (serveur vide, client
 * rempli) et React abandonnerait l'hydratation. Le magasin donne donc
 * DEUX instantanés : `ETAT_VIDE` pour le serveur et pour le premier rendu
 * client — identiques, donc l'hydratation passe — puis le contenu réel dès
 * que le premier abonnement a lu le disque.
 *
 * Le `storage` du navigateur nous prévient aussi quand un autre onglet écrit :
 * deux onglets ouverts sur le même parcours restent d'accord.
 */
import type { CodeCours, Trimestre } from "../../lib/types";
import type { Plan } from "./plan";
import { SAISONS } from "./trimestres";

export interface EtatStocke {
  faits: CodeCours[];
  plan: Plan;
}

const CLE_FAITS = "plan-ton-bacc.faits.v1";
const CLE_PLAN = "plan-ton-bacc.plan.v1";

export const ETAT_VIDE: EtatStocke = { faits: [], plan: {} };

let etat: EtatStocke = ETAT_VIDE;
let lu = false;
const abonnes = new Set<() => void>();

function prevenir(): void {
  for (const abonne of abonnes) abonne();
}

function lireFaits(): CodeCours[] {
  try {
    const brut = window.localStorage.getItem(CLE_FAITS);
    if (brut === null) return [];
    const valeur: unknown = JSON.parse(brut);
    if (!Array.isArray(valeur)) return [];
    return valeur.filter((code): code is string => typeof code === "string");
  } catch {
    return [];
  }
}

function lirePlan(): Plan {
  try {
    const brut = window.localStorage.getItem(CLE_PLAN);
    if (brut === null) return {};
    const valeur: unknown = JSON.parse(brut);
    if (typeof valeur !== "object" || valeur === null) return {};
    const plan: Plan = {};
    for (const [code, trimestre] of Object.entries(valeur as Record<string, unknown>)) {
      if (typeof trimestre !== "object" || trimestre === null) continue;
      const { saison, annee } = trimestre as { saison?: unknown; annee?: unknown };
      // Un trimestre illisible est écarté, pas réparé : inventer une saison
      // déplacerait un cours sans le dire.
      if (typeof annee !== "number" || !Number.isInteger(annee)) continue;
      if (!SAISONS.includes(saison as never)) continue;
      plan[code] = { saison: saison as Trimestre["saison"], annee };
    }
    return plan;
  } catch {
    return {};
  }
}

function relire(): void {
  etat = { faits: lireFaits(), plan: lirePlan() };
}

export function abonner(rappel: () => void): () => void {
  abonnes.add(rappel);
  if (!lu) {
    lu = true;
    relire();
    // Le premier abonnement arrive après l'hydratation : prévenir maintenant
    // fait basculer l'écran de l'état vide à l'état réel.
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (evenement) => {
        if (evenement.key === CLE_FAITS || evenement.key === CLE_PLAN) {
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

export function lireEtat(): EtatStocke {
  return etat;
}

/** Instantané du rendu serveur : toujours vide, jamais deviné. */
export function lireEtatServeur(): EtatStocke {
  return ETAT_VIDE;
}

export function ecrire(nouvel: EtatStocke): void {
  etat = nouvel;
  try {
    window.localStorage.setItem(CLE_FAITS, JSON.stringify(nouvel.faits));
    window.localStorage.setItem(CLE_PLAN, JSON.stringify(nouvel.plan));
  } catch {
    // Navigation privée ou quota plein : l'app reste utilisable en mémoire.
  }
  prevenir();
}
