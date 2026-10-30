"use client";

/**
 * Bandeau de confirmation du lien « Voir l'audit complet → » de ClientSide
 * Horaire (`/audit#import=…`, lu par `app/_lib/import-extension.ts`).
 *
 * Rien n'est écrit avant le clic sur « Importer » : même règle que l'import
 * d'un .ics, un horaire ne prouve pas qu'un cours a été réussi. Les cours EN
 * COURS sont proposés à part, cochés par défaut comme dans l'extension, et
 * l'étudiant peut les écarter. Le fragment est retiré de l'adresse dans les
 * deux cas, pour qu'un rechargement ne repropose pas l'import.
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import { fusionnerFaits, lireImportExtension } from "@/app/_lib/import-extension";
import { choisirCheminement } from "@/app/_lib/cheminement";
import { choisirParcours } from "@/app/_lib/selection";
import { ecrire, lireEtat } from "@/app/_lib/stockage";
import { lireCleParcours } from "@/lib/parcours";

function abonner(rappel: () => void): () => void {
  window.addEventListener("hashchange", rappel);
  return () => window.removeEventListener("hashchange", rappel);
}
const lireHash = (): string => window.location.hash;
const lireHashServeur = (): string => "";

export function ImportExtension() {
  const hash = useSyncExternalStore(abonner, lireHash, lireHashServeur);
  const importe = useMemo(() => lireImportExtension(hash), [hash]);
  const [traite, setTraite] = useState<string | null>(null);
  const [avecEnCours, setAvecEnCours] = useState(true);

  if (importe === null || traite === hash) return null;

  const cle = lireCleParcours(importe.parcours);
  const nettoyer = (): void => {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setTraite(hash);
  };
  const importer = (): void => {
    choisirParcours(importe.parcours);
    if (importe.cheminement !== null) choisirCheminement(importe.parcours, importe.cheminement);
    const etat = lireEtat();
    ecrire({ ...etat, faits: fusionnerFaits(etat.faits, importe, avecEnCours) });
    nettoyer();
  };

  return (
    <section aria-label="Import depuis ClientSide Horaire" className="ecran pt-4">
      <div className="border-l-2 border-avert/70 bg-avert/5 px-4 py-3 text-[13px] leading-relaxed">
        <p className="font-semibold text-papier">ClientSide Horaire propose d&apos;importer :</p>
        <ul className="mt-1 list-disc pl-5 text-doux">
          <li>
            le parcours <span className="font-mono text-papier">{cle?.id ?? importe.parcours}</span>
            {cle?.orientation ? `, orientation ${cle.orientation}` : ""}
            {importe.cheminement ? `, cheminement ${importe.cheminement}` : ""} (il remplace celui affiché) ;
          </li>
          <li>
            {importe.faits.length} cours réussi{importe.faits.length > 1 ? "s" : ""}
            {importe.faits.length > 0 ? " : " : ""}
            <span className="font-mono text-papier">{importe.faits.join(", ")}</span>
          </li>
          {importe.enCours.length > 0 && (
            <li>
              <label className="inline-flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={avecEnCours}
                  onChange={(e) => setAvecEnCours(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  {importe.enCours.length} cours en cours, comptés réussis à la fin du trimestre :{" "}
                  <span className="font-mono text-papier">{importe.enCours.join(", ")}</span>
                </span>
              </label>
            </li>
          )}
          {importe.illisibles.length > 0 && (
            <li>codes non reconnus, ignorés : {importe.illisibles.join(", ")}</li>
          )}
        </ul>
        <p className="mt-1 text-faible">
          Rien n&apos;est écrit avant « Importer ». Les cours déjà cochés ici sont gardés.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={importer}
            className="border border-fait/60 bg-fait/15 px-3 py-1.5 text-[13px] font-medium text-fait transition-colors hover:bg-fait/25"
          >
            Importer
          </button>
          <button
            type="button"
            onClick={nettoyer}
            className="border border-trait px-3 py-1.5 text-[13px] text-doux transition-colors hover:text-papier"
          >
            Ignorer
          </button>
        </div>
      </div>
    </section>
  );
}
