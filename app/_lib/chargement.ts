/**
 * LES CHARGEMENTS EN COURS — deux magasins externes, un pour l'index et un
 * pour le programme affiché.
 *
 * Pourquoi un magasin externe et pas un `useState` rempli dans un effet : le
 * serveur rend d'abord, et un `useState(() => lire())` verrait `undefined` au
 * serveur et des données au client, ce qui casse l'hydratation. Ici les deux
 * côtés voient la même valeur initiale (`ATTENTE`, `AUCUN`), et l'écran bascule
 * après l'hydratation. C'est ce qui avait bien marché en v1 ; le chargement
 * asynchrone ne change pas le raisonnement, il ajoute seulement des phases.
 *
 * Les phases sont explicites et toutes affichées. Pas de « données ou rien » :
 * un chargement qui échoue doit dire pourquoi, et une fiche sans structure
 * exploitable doit le dire aussi, au lieu d'ouvrir un écran vide.
 */
import type { FicheIndex } from "../../lib/types";
import { assembler, type CatalogueAssemble, type Depot } from "./depot";
import { preparerIndex, type IndexPrepare } from "./recherche";

export type EtatIndex =
  | { phase: "attente" }
  | { phase: "chargement" }
  | { phase: "pret"; prepare: IndexPrepare }
  | { phase: "erreur"; message: string };

export type EtatProgramme =
  | { phase: "aucun" }
  | { phase: "chargement"; cle: string }
  | { phase: "pret"; cle: string; assemble: CatalogueAssemble }
  /** La fiche existe mais sa page n'a pas de structure exploitable. Ce n'est
   *  pas une erreur de chargement : c'est un fait sur le programme. */
  | { phase: "sans-structure"; cle: string; fiche: FicheIndex }
  /**
   * La clé retenue d'une visite précédente ne figure plus dans l'index.
   *
   * Distinguée de `erreur` parce que ce n'est PAS une panne : le catalogue a
   * bougé sous un choix valide. Le cas arrive pour de vrai — un programme qu'on
   * lisait sans orientation se révèle en porter dix, et sa clé nue
   * `« baccalaureat-en-chimie »` est remplacée par dix clés `id#Orientation`.
   * 36 programmes sont dans ce cas à la prochaine passe du scraper.
   *
   * L'étudiant n'a rien fait de mal, rien n'a échoué, et le rendre en rouge
   * sous le titre « n'a pas pu être chargé » lui ferait croire à une panne dont
   * il chercherait la cause. C'est le même motif que les blocs invérifiables :
   * un état qui n'est ni un succès ni un échec.
   */
  | { phase: "disparu"; cle: string }
  | { phase: "erreur"; cle: string; message: string };

/** Instantanés stables : `useSyncExternalStore` compare par identité, donc une
 *  nouvelle valeur à chaque appel ferait boucler le rendu. */
const ATTENTE: EtatIndex = { phase: "attente" };
const AUCUN: EtatProgramme = { phase: "aucun" };

let etatIndex: EtatIndex = ATTENTE;
let etatProgramme: EtatProgramme = AUCUN;

const abonnesIndex = new Set<() => void>();
const abonnesProgramme = new Set<() => void>();

function poserIndex(nouvel: EtatIndex): void {
  etatIndex = nouvel;
  for (const abonne of abonnesIndex) abonne();
}

function poserProgramme(nouvel: EtatProgramme): void {
  etatProgramme = nouvel;
  for (const abonne of abonnesProgramme) abonne();
}

export function abonnerIndex(rappel: () => void): () => void {
  abonnesIndex.add(rappel);
  return () => {
    abonnesIndex.delete(rappel);
  };
}

export function abonnerProgramme(rappel: () => void): () => void {
  abonnesProgramme.add(rappel);
  return () => {
    abonnesProgramme.delete(rappel);
  };
}

export function lireIndex(): EtatIndex {
  return etatIndex;
}
export function lireIndexServeur(): EtatIndex {
  return ATTENTE;
}
export function lireProgramme(): EtatProgramme {
  return etatProgramme;
}
export function lireProgrammeServeur(): EtatProgramme {
  return AUCUN;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Lance le chargement de l'index, une seule fois. */
export function demanderIndex(depot: Depot): void {
  if (etatIndex.phase !== "attente") return;
  poserIndex({ phase: "chargement" });
  depot
    .chargerIndex()
    .then((index) => {
      poserIndex({ phase: "pret", prepare: preparerIndex(index) });
    })
    .catch((cause: unknown) => {
      poserIndex({ phase: "erreur", message: message(cause) });
    });
}

/**
 * Identifiant du chargement en cours. Sert à écarter une réponse tardive :
 * l'étudiant peut changer de programme pendant qu'un premier se charge, et la
 * réponse du premier ne doit pas écraser l'écran du second. Sans ce garde, le
 * bogue n'apparaît qu'avec de la latence, donc jamais en développement local.
 */
let demandeCourante: string | null = null;

/**
 * PRÉCONDITION : l'index doit être prêt avant d'appeler ceci, et `fiche` doit
 * être la fiche de `cle` dans cet index. C'est pour ça que `fiche: undefined`
 * peut être interprété sans ambiguïté comme « ce parcours n'est pas dans
 * l'index » — le cas d'un choix retenu d'une visite précédente dont le
 * parcours a disparu du catalogue depuis.
 */
export function demanderProgramme(
  depot: Depot,
  cle: string | null,
  fiche: FicheIndex | undefined,
): void {
  if (cle === null) {
    demandeCourante = null;
    if (etatProgramme.phase !== "aucun") poserProgramme(AUCUN);
    return;
  }
  if (demandeCourante === cle) return;
  demandeCourante = cle;

  if (fiche === undefined) {
    poserProgramme({ phase: "disparu", cle });
    return;
  }

  // Une fiche sans structure exploitable n'est pas chargée du tout : la page
  // n'a rien à en tirer, et l'écran doit le dire au lieu de se vider.
  if (!fiche.structureLue) {
    poserProgramme({ phase: "sans-structure", cle, fiche });
    return;
  }

  poserProgramme({ phase: "chargement", cle });
  assembler(depot, cle)
    .then((assemble) => {
      if (demandeCourante !== cle) return;
      poserProgramme({ phase: "pret", cle, assemble });
    })
    .catch((cause: unknown) => {
      if (demandeCourante !== cle) return;
      poserProgramme({ phase: "erreur", cle, message: message(cause) });
    });
}

/** Remet les deux magasins à zéro. N'existe que pour les tests : deux tests qui
 *  partagent un module gardent sinon l'état du précédent. */
export function reinitialiserChargements(): void {
  etatIndex = ATTENTE;
  etatProgramme = AUCUN;
  demandeCourante = null;
}
