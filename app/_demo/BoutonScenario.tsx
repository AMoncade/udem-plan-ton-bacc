"use client";

/** DÉMO — À JETER avec `app/_demo/`. Un seul usage, dans `EnteteApp.tsx`. */
import { useEtat } from "@/components/ProviderEtat";
import { SCENARIO_FAITS, SCENARIO_PLAN } from "./scenario";

export function BoutonScenario() {
  const { remplacer } = useEtat();
  return (
    <button
      type="button"
      onClick={() => remplacer(SCENARIO_FAITS, SCENARIO_PLAN)}
      title="Remplace l'état courant par un parcours fabriqué qui montre chaque cas : crédits perdus, bloc conforme mais total insuffisant, cours sans fiche"
      className="border border-trait px-2.5 py-1 text-[12.5px] text-doux transition-colors hover:border-traitfort hover:text-papier"
    >
      Charger un scénario
    </button>
  );
}
