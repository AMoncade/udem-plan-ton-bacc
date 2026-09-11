"use client";

/**
 * L'ÉTAT DE L'APPLICATION — ce que l'étudiant a fait, et quel programme est
 * affiché.
 *
 * Quatre magasins EXTERNES, jamais un `useState` rempli dans un effet :
 *   `_lib/stockage`    cours faits et plan par trimestre (localStorage)
 *   `_lib/selection`   programme choisi, retenu entre les visites
 *   `_lib/chargement`  l'index, puis le programme chargé à la demande
 *
 * Raison commune : le rendu serveur ne voit ni `localStorage` ni une réponse
 * asynchrone. Un `useState` initialisé depuis l'un ou l'autre donnerait deux
 * HTML différents et React abandonnerait l'hydratation. Chaque magasin expose
 * donc un instantané serveur stable, et l'écran bascule après l'hydratation.
 *
 * Le diagnostic et l'audit sont calculés ICI, une seule fois, et distribués aux
 * trois vues : elles doivent toutes lire le même verdict, sinon l'arbre et
 * l'audit se contrediraient à l'écran.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { depot } from "@/app/_donnees/source";
import {
  abonnerIndex,
  abonnerProgramme,
  demanderIndex,
  demanderProgramme,
  lireIndex,
  lireIndexServeur,
  lireProgramme,
  lireProgrammeServeur,
  type EtatIndex,
  type EtatProgramme,
} from "@/app/_lib/chargement";
import type { CatalogueAssemble } from "@/app/_lib/depot";
import { auditProgramme, diagnostiquerCours } from "@/app/_lib/moteur";
import type { Plan } from "@/app/_lib/plan";
import { ficheParCle } from "@/app/_lib/recherche";
import {
  abonnerSelection,
  choisirParcours,
  lireSelection,
  lireSelectionServeur,
} from "@/app/_lib/selection";
import { abonner, ecrire, lireEtat, lireEtatServeur } from "@/app/_lib/stockage";
import type {
  Audit,
  Catalogue,
  CodeCours,
  DiagnosticCours,
  Programme,
  Trimestre,
} from "@/lib/types";

/** Tout ce qui n'existe QUE lorsqu'un programme est chargé. Regroupé dans un
 *  seul objet nullable, pour qu'aucune vue ne puisse lire un audit sans
 *  catalogue ni un catalogue sans audit. */
export interface DonneesProgramme extends CatalogueAssemble {
  catalogue: Catalogue;
  programme: Programme;
  diagnostics: Map<CodeCours, DiagnosticCours>;
  audit: Audit;
}

interface ValeurEtat {
  // --- l'étudiant ---------------------------------------------------------
  faits: Set<CodeCours>;
  plan: Plan;
  basculerFait: (code: CodeCours) => void;
  placer: (code: CodeCours, trimestre: Trimestre) => void;
  retirer: (code: CodeCours) => void;
  remplacer: (faits: CodeCours[], plan: Plan) => void;
  toutEffacer: () => void;

  // --- le programme affiché -----------------------------------------------
  index: EtatIndex;
  chargement: EtatProgramme;
  selection: string | null;
  choisir: (id: string | null) => void;
  /** `null` tant qu'aucun programme n'est prêt. Les vues passent par
   *  `<CadreProgramme>` et reçoivent la version non nulle. */
  donnees: DonneesProgramme | null;
}

const Contexte = createContext<ValeurEtat | null>(null);

export function ProviderEtat({ children }: { children: ReactNode }) {
  const stocke = useSyncExternalStore(abonner, lireEtat, lireEtatServeur);
  const selection = useSyncExternalStore(
    abonnerSelection,
    lireSelection,
    lireSelectionServeur,
  );
  const index = useSyncExternalStore(abonnerIndex, lireIndex, lireIndexServeur);
  const chargement = useSyncExternalStore(
    abonnerProgramme,
    lireProgramme,
    lireProgrammeServeur,
  );

  // L'index d'abord : petit, et il dit si une fiche a une structure
  // exploitable. Le demander dans un effet et non pendant le rendu — un effet
  // ne s'exécute pas au serveur, donc rien n'est lancé pendant le rendu HTML.
  useEffect(() => {
    demanderIndex(depot);
  }, []);

  // Le programme ensuite, et seulement une fois l'index prêt : sans la fiche,
  // on ne saurait pas distinguer « page sans structure » de « panne ».
  useEffect(() => {
    if (index.phase !== "pret") return;
    demanderProgramme(
      depot,
      selection,
      selection === null ? undefined : ficheParCle(index.prepare, selection),
    );
  }, [index, selection]);

  const faits = useMemo(() => new Set(stocke.faits), [stocke.faits]);

  const donnees = useMemo<DonneesProgramme | null>(() => {
    if (chargement.phase !== "pret") return null;
    const { catalogue, programme } = chargement.assemble;
    return {
      ...chargement.assemble,
      diagnostics: diagnostiquerCours(catalogue, faits),
      audit: auditProgramme(programme, catalogue, faits),
    };
  }, [chargement, faits]);

  const basculerFait = useCallback((code: CodeCours) => {
    const courant = lireEtat();
    ecrire({
      ...courant,
      faits: courant.faits.includes(code)
        ? courant.faits.filter((c) => c !== code)
        : [...courant.faits, code],
    });
  }, []);

  const placer = useCallback((code: CodeCours, trimestre: Trimestre) => {
    const courant = lireEtat();
    ecrire({ ...courant, plan: { ...courant.plan, [code]: trimestre } });
  }, []);

  const retirer = useCallback((code: CodeCours) => {
    const courant = lireEtat();
    const plan = { ...courant.plan };
    delete plan[code];
    ecrire({ ...courant, plan });
  }, []);

  const remplacer = useCallback((nouveauxFaits: CodeCours[], nouveauPlan: Plan) => {
    ecrire({ faits: nouveauxFaits, plan: nouveauPlan });
  }, []);

  const toutEffacer = useCallback(() => {
    ecrire({ faits: [], plan: {} });
  }, []);

  const choisir = useCallback((cle: string | null) => {
    choisirParcours(cle);
  }, []);

  const valeur = useMemo<ValeurEtat>(
    () => ({
      faits,
      plan: stocke.plan,
      basculerFait,
      placer,
      retirer,
      remplacer,
      toutEffacer,
      index,
      chargement,
      selection,
      choisir,
      donnees,
    }),
    [
      faits,
      stocke.plan,
      basculerFait,
      placer,
      retirer,
      remplacer,
      toutEffacer,
      index,
      chargement,
      selection,
      choisir,
      donnees,
    ],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useEtat(): ValeurEtat {
  const valeur = useContext(Contexte);
  if (valeur === null) throw new Error("useEtat() hors de <ProviderEtat>");
  return valeur;
}

/**
 * Les données du programme affiché, garanties présentes.
 *
 * Jette plutôt que de rendre `null` : une vue qui s'autoriserait un catalogue
 * absent finirait par afficher des zéros et des listes vides à la place d'un
 * message, et c'est exactement l'écran qu'on ne veut pas. Le garde est
 * `<CadreProgramme>`, qui ne rend ses enfants qu'une fois les données prêtes.
 */
export function useDonnees(): DonneesProgramme {
  const { donnees } = useEtat();
  if (donnees === null) {
    throw new Error("useDonnees() hors de <CadreProgramme> : aucun programme chargé");
  }
  return donnees;
}
