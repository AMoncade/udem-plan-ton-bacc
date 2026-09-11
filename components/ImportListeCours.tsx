"use client";

/**
 * CE QUE L'HORAIRE PROPOSE — un relevé, pas une carte de produit.
 *
 * Chaque ligne porte de quoi décider : le sigle, le titre quand le fichier en
 * donne un, le trimestre déduit, le nombre de séances, les examens comptés à
 * part, et un signal net quand le trimestre n'est pas terminé. Rien n'est coché
 * d'avance — voir la règle en tête de `ImportEcran`.
 *
 * La couleur appartient aux états : vert pour ce qui est retenu ou déjà fait,
 * ambre pour un doute (trimestre en cours, aucune séance, remarque de lecture),
 * rien ailleurs.
 */

import { libelleTrimestre } from "@/lib/ics/dates";
import type { CoursTrouveICS, ResultatImportICS } from "@/lib/ics/types";
import type { CodeCours } from "@/lib/types";

/** Un cours sur lequel il faut regarder à deux fois avant de cocher. */
function douteux(cours: CoursTrouveICS): boolean {
  return cours.nbSeances === 0 || !cours.trimestreTermine || cours.remarques.length > 0;
}

export function ImportListeCours({
  resultat,
  selection,
  faits,
  onBasculer,
  onToutCocher,
  onRienCocher,
}: {
  resultat: ResultatImportICS;
  selection: Set<CodeCours>;
  faits: Set<CodeCours>;
  onBasculer: (code: CodeCours) => void;
  onToutCocher: (codes: CodeCours[]) => void;
  onRienCocher: (codes: CodeCours[]) => void;
}) {
  const codes = resultat.cours.map((c) => c.code);
  const nbCoches = codes.filter((code) => selection.has(code)).length;

  if (!resultat.estICS || resultat.cours.length === 0) {
    return (
      <section>
        <h2 className="border-b border-trait pb-2 text-[15px] font-semibold">
          Cours trouvés dans l&apos;horaire
        </h2>
        {resultat.problemes.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {resultat.problemes.map((probleme) => (
              <li
                key={probleme}
                className="border-l-2 border-perdu/60 bg-perdu/5 px-3 py-2 text-[13px] leading-relaxed text-papier"
              >
                {probleme}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-doux">Aucun cours dans ce fichier.</p>
        )}
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-trait pb-2">
        <h2 className="text-[15px] font-semibold">
          Cours trouvés dans l&apos;horaire ({resultat.cours.length})
        </h2>
        <div className="flex items-center gap-3">
          <p className="chiffres text-[12px] text-faible">
            {resultat.nbEvenements} évènements lus
            {resultat.calendrier === null ? null : ` · ${resultat.calendrier}`}
          </p>
          <button
            type="button"
            onClick={() => (nbCoches === codes.length ? onRienCocher(codes) : onToutCocher(codes))}
            className="border border-trait px-2.5 py-1 text-[12px] text-doux transition-colors hover:border-traitfort hover:text-papier"
          >
            {nbCoches === codes.length ? "Rien cocher" : "Tout cocher"}
          </button>
        </div>
      </div>

      {resultat.problemes.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {resultat.problemes.map((probleme) => (
            <li
              key={probleme}
              className="border-l-2 border-avert/60 bg-avert/5 px-3 py-1.5 text-[12.5px] text-papier"
            >
              {probleme}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-trait text-left text-[11.5px] text-faible">
              <th className="w-8 py-1.5 pr-2 font-normal">
                <span className="sr-only">Retenir</span>
              </th>
              <th className="py-1.5 pr-3 font-normal">Cours</th>
              <th className="py-1.5 pr-3 font-normal">Trimestre</th>
              <th className="py-1.5 pr-3 text-right font-normal">Séances</th>
              <th className="py-1.5 pr-3 text-right font-normal">Examens</th>
              <th className="py-1.5 pr-3 font-normal">Dates</th>
              <th className="py-1.5 font-normal">Ce que dit le fichier</th>
            </tr>
          </thead>
          <tbody>
            {resultat.cours.map((cours) => (
              <Ligne
                key={cours.code}
                cours={cours}
                coche={selection.has(cours.code)}
                dejaFait={faits.has(cours.code)}
                onBasculer={onBasculer}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-prose text-[12px] leading-relaxed text-faible">
        « Séances » compte les cours réellement datés, récurrences dépliées et semaines de
        relâche retirées — un cours suivi tout un trimestre en a une trentaine. Les examens
        et les échéances sont comptés à part : un intra passé puis un abandon laissent la
        même trace qu&apos;un trimestre complété. Un cours à zéro séance n&apos;apparaît
        dans l&apos;horaire que par son examen.
      </p>
    </section>
  );
}

function Ligne({
  cours,
  coche,
  dejaFait,
  onBasculer,
}: {
  cours: CoursTrouveICS;
  coche: boolean;
  dejaFait: boolean;
  onBasculer: (code: CodeCours) => void;
}) {
  const id = `retenir-${cours.code.replace(/\s/g, "-")}`;
  return (
    <tr
      className={`border-b border-trait/60 align-top ${coche ? "bg-fait/5" : douteux(cours) ? "bg-avert/4" : ""}`}
    >
      <td className="py-2 pr-2">
        <input
          id={id}
          type="checkbox"
          checked={coche}
          onChange={() => onBasculer(cours.code)}
          className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-fait)]"
        />
      </td>
      <td className="py-2 pr-3">
        <label htmlFor={id} className="cursor-pointer">
          <span className="chiffres text-papier">{cours.code}</span>
          {dejaFait ? (
            <span className="ml-2 border border-fait/50 px-1.5 py-px text-[10.5px] text-fait">
              déjà fait
            </span>
          ) : null}
          <span className="block text-[12.5px] text-doux">
            {cours.libelle ?? (
              <span className="text-faible">
                titre absent du fichier — le sigle seul, rien d&apos;inventé
              </span>
            )}
          </span>
        </label>
      </td>
      <td className="py-2 pr-3">
        {cours.trimestre === null ? (
          <span className="text-avert">non déduit</span>
        ) : (
          <span className="text-papier">{libelleTrimestre(cours.trimestre)}</span>
        )}
        <span className="block text-[11.5px]">
          {cours.derniereSeance === null ? (
            <span className="text-avert">dates illisibles</span>
          ) : cours.trimestreTermine ? (
            <span className="text-faible">trimestre terminé</span>
          ) : (
            <span className="text-avert">pas encore terminé</span>
          )}
        </span>
      </td>
      <td className="chiffres py-2 pr-3 text-right">
        {cours.nbSeances === 0 ? (
          <span className="text-avert" title="Aucune séance de cours dans le fichier">
            0
          </span>
        ) : (
          <span className="text-papier">{cours.nbSeances}</span>
        )}
      </td>
      <td className="chiffres py-2 pr-3 text-right">
        {cours.nbPonctuels === 0 ? (
          <span className="text-faible">0</span>
        ) : (
          <span className="text-doux">{cours.nbPonctuels}</span>
        )}
      </td>
      <td className="chiffres py-2 pr-3 text-[11.5px] text-doux">
        {cours.premiereSeance === null ? (
          <span className="text-faible">—</span>
        ) : (
          <>
            {cours.premiereSeance}
            <span className="block text-faible">au {cours.derniereSeance}</span>
          </>
        )}
      </td>
      <td className="py-2 text-[11.5px]">
        {/* Les SUMMARY tels qu'écrits : la pièce justificative de la proposition. */}
        <span className="chiffres block text-doux">{cours.resumes.join(" · ")}</span>
        {cours.remarques.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {cours.remarques.map((remarque) => (
              <li key={remarque} className="text-avert">
                {remarque}
              </li>
            ))}
          </ul>
        ) : null}
      </td>
    </tr>
  );
}
