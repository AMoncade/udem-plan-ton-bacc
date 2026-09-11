"use client";

/**
 * L'ÉTAT DE L'ÉTUDIANT — cours faits et plan par trimestre.
 *
 * Pas de base de données, pas d'authentification : tout vit dans
 * `localStorage`, derrière le petit magasin de `app/_lib/stockage.ts` (qui
 * explique pourquoi ce n'est pas un `useState` rempli dans un effet).
 *
 * Le diagnostic et l'audit sont calculés ICI, une seule fois, et distribués
 * aux trois vues : elles doivent toutes lire le même verdict, sinon l'arbre et
 * l'audit se contrediraient à l'écran.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { catalogue, programme } from "@/app/_donnees/catalogue";
import { auditProgramme, diagnostiquerCours } from "@/app/_lib/moteur";
import type { Plan } from "@/app/_lib/plan";
import { abonner, ecrire, lireEtat, lireEtatServeur } from "@/app/_lib/stockage";
import type { Audit, CodeCours, DiagnosticCours, Trimestre } from "@/lib/types";

interface ValeurEtat {
  faits: Set<CodeCours>;
  plan: Plan;
  diagnostics: Map<CodeCours, DiagnosticCours>;
  audit: Audit;
  basculerFait: (code: CodeCours) => void;
  placer: (code: CodeCours, trimestre: Trimestre) => void;
  retirer: (code: CodeCours) => void;
  remplacer: (faits: CodeCours[], plan: Plan) => void;
  toutEffacer: () => void;
}

const Contexte = createContext<ValeurEtat | null>(null);

export function ProviderEtat({ children }: { children: ReactNode }) {
  const stocke = useSyncExternalStore(abonner, lireEtat, lireEtatServeur);

  const faits = useMemo(() => new Set(stocke.faits), [stocke.faits]);
  const diagnostics = useMemo(() => diagnostiquerCours(catalogue, faits), [faits]);
  const audit = useMemo(() => auditProgramme(programme, catalogue, faits), [faits]);

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

  const valeur = useMemo<ValeurEtat>(
    () => ({
      faits,
      plan: stocke.plan,
      diagnostics,
      audit,
      basculerFait,
      placer,
      retirer,
      remplacer,
      toutEffacer,
    }),
    [
      faits,
      stocke.plan,
      diagnostics,
      audit,
      basculerFait,
      placer,
      retirer,
      remplacer,
      toutEffacer,
    ],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useEtat(): ValeurEtat {
  const valeur = useContext(Contexte);
  if (valeur === null) throw new Error("useEtat() hors de <ProviderEtat>");
  return valeur;
}
