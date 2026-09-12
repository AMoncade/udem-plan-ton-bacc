"use client";

/**
 * LE PIED DE PAGE — la provenance des données, et tout ce que le chargement
 * n'a pas su lire.
 *
 * Il est client parce que la provenance dépend maintenant de ce qui est chargé
 * (un programme, des sujets), pas d'un fichier connu à la compilation. Rien ici
 * ne disparaît en silence : un code refusé par `normaliserCode()` casse le
 * graphe de préalables sans lever d'erreur, donc il doit se voir.
 */

import { depot } from "@/app/_donnees/source";
import { useEtat } from "./ProviderEtat";

export function PiedApp() {
  const { donnees, index } = useEtat();

  return (
    <footer className="border-t border-trait">
      <div className="ecran py-4 text-[12px] leading-relaxed text-faible">
      <p>
        Projet personnel sans affiliation avec aucun établissement. Les données sont
        reprises de pages publiques d&apos;admission et peuvent être périmées ou
        incomplètes ; le relevé officiel reste celui du registraire.
      </p>
      <p className="mt-1">
        Source des données : <code className="text-doux">{depot.origine}</code>
        {index.phase === "pret"
          ? ` — ${index.prepare.entrees.length.toLocaleString("fr-CA")} programmes dans l'index`
          : null}
        {donnees === null
          ? null
          : ` ; ${donnees.sujets.length} sujet${donnees.sujets.length === 1 ? "" : "s"} de cours chargé${donnees.sujets.length === 1 ? "" : "s"} (${donnees.sujets.join(", ")}), ${Object.keys(donnees.catalogue.cours).length} fiches.`}
      </p>

      {donnees !== null && donnees.codesIllisibles.length > 0 ? (
        <p className="mt-1 text-avert">
          Codes non normalisables, conservés tels quels :{" "}
          <code>{donnees.codesIllisibles.join(", ")}</code>
        </p>
      ) : null}

      {/* Le journal du chargement est TYPÉ dans le contrat v2 exprès : en v1 il
          voyageait dans une clé hors contrat, donc invisible à l'écran. */}
      {donnees !== null && donnees.catalogue.journal.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {donnees.catalogue.journal.map((entree, i) => (
            <li
              key={`${entree.sujet}-${i}`}
              className={entree.genre === "info" ? "text-faible" : "text-avert"}
            >
              <span className="chiffres">[{entree.genre}]</span> {entree.sujet} —{" "}
              {entree.message}
            </li>
          ))}
        </ul>
      ) : null}

      {donnees !== null && donnees.catalogue.prealablesNonParses.length > 0 ? (
        <p className="mt-1 text-avert">
          {donnees.catalogue.prealablesNonParses.length} ligne(s) de préalables non
          réduite(s) en codes, affichée(s) telle(s) quelle(s) sur la fiche du cours
          concerné.
        </p>
      ) : null}
      </div>
    </footer>
  );
}
