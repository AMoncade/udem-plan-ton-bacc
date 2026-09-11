"use client";

/**
 * SAISIE À LA MAIN — l'autre chemin, et le seul qui marche toujours.
 *
 * Un étudiant qui a fait trois ans avant d'installer l'extension n'a pas
 * d'horaire pour ses anciens trimestres ; un sigle que `normaliserCode()` refuse
 * ne sortira jamais d'un import. La saisie est donc de plein droit, pas un
 * repli : tolérante sur la casse, les espaces et les tirets puisque
 * `normaliserCode()` accepte les trois écritures d'UdeM.
 *
 * Tout code refusé est affiché TEL QUE TAPÉ, avec la raison. Avaler « MATH 1400 »
 * en silence laisserait croire que le cours est entré alors que l'audit ne le
 * verra jamais.
 */

import { useState } from "react";
import { lireSaisie } from "@/lib/ics/saisie";
import type { CodeCours } from "@/lib/types";

export function ImportSaisie({
  dejaChoisis,
  faits,
  onAjouter,
}: {
  dejaChoisis: Set<CodeCours>;
  faits: Set<CodeCours>;
  onAjouter: (codes: CodeCours[]) => void;
}) {
  const [texte, setTexte] = useState("");
  const resultat = lireSaisie(texte);
  const nouveaux = resultat.acceptes.filter((code) => !dejaChoisis.has(code));

  return (
    <section>
      <h2 className="border-b border-trait pb-2 text-[15px] font-semibold">
        Ou entrer les sigles à la main
      </h2>

      <label htmlFor="saisie-codes" className="mt-3 block text-[12.5px] text-doux">
        Un sigle par ligne, ou séparés par des virgules. La casse, les espaces et les
        tirets n&apos;ont pas d&apos;importance : <code className="text-papier">ACT 2250</code>,{" "}
        <code className="text-papier">act-2250</code> et{" "}
        <code className="text-papier">ACT2250</code> désignent le même cours.
      </label>
      <textarea
        id="saisie-codes"
        value={texte}
        onChange={(evenement) => setTexte(evenement.target.value)}
        rows={4}
        spellCheck={false}
        placeholder={"ACT 2250\nMAT 1400, STT 1700\nift-1015"}
        className="chiffres mt-2 w-full max-w-xl resize-y border border-trait bg-creux px-2.5 py-2 text-[13px] text-papier placeholder:text-faible/70"
      />

      {texte.trim() === "" ? null : (
        <div className="mt-2 max-w-xl space-y-2">
          {resultat.acceptes.length > 0 ? (
            <div>
              <p className="text-[12px] text-faible">
                {resultat.acceptes.length} sigle{resultat.acceptes.length === 1 ? "" : "s"}{" "}
                reconnu{resultat.acceptes.length === 1 ? "" : "s"} :
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {resultat.acceptes.map((code) => (
                  <li
                    key={code}
                    className={`chiffres border px-2 py-0.5 text-[12px] ${
                      faits.has(code)
                        ? "border-fait/50 bg-fait/10 text-fait"
                        : dejaChoisis.has(code)
                          ? "border-dispo/50 bg-dispo/10 text-dispo"
                          : "border-trait text-papier"
                    }`}
                    title={
                      faits.has(code)
                        ? "déjà dans vos cours faits"
                        : dejaChoisis.has(code)
                          ? "déjà dans la liste à confirmer"
                          : undefined
                    }
                  >
                    {code}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {resultat.doublons.length > 0 ? (
            <p className="text-[12px] text-doux">
              Écrit deux fois, compté une seule :{" "}
              <span className="chiffres">{resultat.doublons.join(", ")}</span>.
            </p>
          ) : null}

          {/* Le point qui compte : rien n'est avalé. */}
          {resultat.refuses.length > 0 ? (
            <div className="border-l-2 border-perdu/60 bg-perdu/5 px-3 py-2">
              <p className="text-[12px] text-papier">
                {resultat.refuses.length} ligne{resultat.refuses.length === 1 ? "" : "s"} non
                retenue{resultat.refuses.length === 1 ? "" : "s"} :
              </p>
              <ul className="mt-1 space-y-1">
                {resultat.refuses.map((refuse) => (
                  <li key={refuse.brut} className="text-[12px] leading-relaxed">
                    <code className="text-perdu">{refuse.brut}</code>{" "}
                    <span className="text-doux">— {refuse.raison}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              onAjouter(resultat.acceptes);
              setTexte("");
            }}
            disabled={nouveaux.length === 0}
            className="border border-trait px-3 py-1.5 text-[12.5px] text-papier transition-colors hover:border-traitfort disabled:text-faible disabled:hover:border-trait"
          >
            {nouveaux.length === 0
              ? "Rien de nouveau à ajouter"
              : `Ajouter ${nouveaux.length} sigle${nouveaux.length === 1 ? "" : "s"} à la liste`}
          </button>
        </div>
      )}
    </section>
  );
}
