"use client";

/**
 * VUE 3 — PLANIFICATEUR PAR TRIMESTRE.
 *
 * La contrainte d'offre est le coeur de cette vue : `Cours.trimestres` dit
 * quand un cours existe réellement. Placer un cours d'hiver à l'automne est
 * REFUSÉ, à l'écran, avec la raison et l'horaire publié. Aucun outil existant
 * ne dit ça à un étudiant d'actuariat, et c'est pourtant décisif : une moitié
 * du bloc 75C n'est offerte qu'à l'hiver, donc les options ne se répartissent
 * pas librement.
 *
 * On place en deux gestes : prendre un cours dans la réserve, puis choisir un
 * trimestre. Pas de glisser-déposer — le même geste doit marcher au clavier et
 * au doigt, et c'est le refus qui doit être spectaculaire, pas le déplacement.
 */

import { useMemo, useState } from "react";
import { catalogue, programme } from "@/app/_donnees/catalogue";
import { codesReferences, creditsDe, ficheDe } from "@/app/_lib/cours";
import { saisonsOffertes, verifierOffre } from "@/app/_lib/offre";
import { chargeTrimestre, coursDuTrimestre, verifierPlan } from "@/app/_lib/plan";
import {
  HORIZON_DEFAUT,
  SAISONS,
  cleTrimestre,
  libelleTrimestre,
  sigleTrimestre,
} from "@/app/_lib/trimestres";
import type { CodeCours, Trimestre } from "@/lib/types";
import { Credits, MarqueEtat, TitreCours } from "./Etats";
import { useEtat } from "./ProviderEtat";

interface Refus {
  code: CodeCours;
  trimestre: Trimestre;
  raison: string;
}

interface Reserve {
  code: CodeCours;
  trimestre: Trimestre;
  raison: string;
}

export function VuePlan() {
  const { plan, faits, diagnostics, placer, retirer } = useEtat();
  const tousLesCodes = useMemo(() => codesReferences(catalogue), []);

  const [enMain, setEnMain] = useState<CodeCours | null>(null);
  const [refus, setRefus] = useState<Refus | null>(null);
  const [sousReserve, setSousReserve] = useState<Reserve | null>(null);
  const [recherche, setRecherche] = useState("");
  const [blocFiltre, setBlocFiltre] = useState("tous");
  const [montrerFaits, setMontrerFaits] = useState(false);

  const anomalies = useMemo(
    () => verifierPlan(catalogue, plan, faits),
    [plan, faits],
  );

  const disponiblesDansReserve = tousLesCodes.filter((code) => {
    if (plan[code] !== undefined) return false;
    if (!montrerFaits && faits.has(code)) return false;
    if (blocFiltre !== "tous") {
      const bloc = programme.blocs.find((b) => b.id === blocFiltre);
      if (bloc === undefined || !bloc.cours.includes(code)) return false;
    }
    const terme = recherche.trim().toLowerCase();
    if (terme !== "") {
      const titre = ficheDe(catalogue, code)?.titre ?? "";
      if (!`${code} ${titre}`.toLowerCase().includes(terme)) return false;
    }
    return true;
  });

  function tenterPlacement(code: CodeCours, trimestre: Trimestre) {
    const verdict = verifierOffre(code, ficheDe(catalogue, code), trimestre);
    if (verdict.decision === "refus") {
      setRefus({ code, trimestre, raison: verdict.raison });
      setSousReserve(null);
      return; // Le cours reste en main : le refus n'est pas une perte de geste.
    }
    placer(code, trimestre);
    setEnMain(null);
    setRefus(null);
    setSousReserve(
      verdict.decision === "reserve"
        ? { code, trimestre, raison: verdict.raison }
        : null,
    );
  }

  return (
    <div className="px-5 py-6 sm:px-8">
      <header className="max-w-prose">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          Trimestres
        </h1>
        <p className="mt-2 text-doux">
          Prenez un cours dans la réserve, puis choisissez un trimestre. Un cours qui
          n&apos;est pas offert à cette saison est refusé, avec son horaire publié — c&apos;est
          la contrainte qui décide vraiment de l&apos;ordre d&apos;un parcours.
        </p>
      </header>

      <div
        role="status"
        aria-live="polite"
        className="mt-5 flex min-h-[42px] flex-wrap items-center gap-3 border border-trait bg-relief/50 px-3 py-2"
      >
        {enMain === null ? (
          <p className="text-[13px] text-doux">
            Aucun cours en main. Choisissez-en un dans la réserve.
          </p>
        ) : (
          <>
            <span className="chiffres text-[13px] text-papier">{enMain}</span>
            <span className="text-[13px] text-doux">
              <TitreCours titre={ficheDe(catalogue, enMain)?.titre} />
            </span>
            <span className="text-[12.5px] text-faible">
              {saisonsOffertes(ficheDe(catalogue, enMain)).size === 0
                ? "offre inconnue"
                : `offert ${[...saisonsOffertes(ficheDe(catalogue, enMain))]
                    .map((s) => s.toLowerCase())
                    .join(", ")}`}
            </span>
            <button
              type="button"
              onClick={() => setEnMain(null)}
              className="ml-auto border border-trait px-2 py-0.5 text-[12px] text-doux hover:border-traitfort hover:text-papier"
            >
              Reposer
            </button>
          </>
        )}
      </div>

      {refus !== null ? (
        <p
          role="alert"
          className="mt-3 border-l-2 border-perdu bg-perdu/10 px-3 py-2 text-[13px] text-papier"
        >
          <span className="font-semibold text-perdu">
            Refusé — {libelleTrimestre(refus.trimestre)}.
          </span>{" "}
          {refus.raison}
        </p>
      ) : null}

      {sousReserve !== null ? (
        <p
          role="status"
          className="mt-3 border-l-2 border-avert bg-avert/8 px-3 py-2 text-[13px] text-papier"
        >
          <span className="font-semibold text-avert">Placé sous réserve.</span>{" "}
          {sousReserve.raison}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[304px_minmax(0,1fr)]">
        <section className="border border-trait">
          <header className="border-b border-trait bg-relief px-3 py-2">
            <h2 className="text-[13.5px] font-semibold">Réserve</h2>
            <p className="chiffres mt-0.5 text-[11.5px] text-faible">
              {disponiblesDansReserve.length} cours
            </p>
          </header>

          <div className="space-y-2 border-b border-trait px-3 py-2.5">
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher un code ou un titre"
              aria-label="Chercher un cours"
              className="w-full border border-trait bg-creux px-2 py-1.5 text-[12.5px] placeholder:text-faible focus:border-traitfort focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={blocFiltre}
                onChange={(e) => setBlocFiltre(e.target.value)}
                aria-label="Filtrer par bloc"
                className="min-w-0 flex-1 border border-trait bg-creux px-2 py-1.5 text-[12.5px] focus:border-traitfort focus:outline-none"
              >
                <option value="tous">Tous les blocs</option>
                {programme.blocs.map((bloc) => (
                  <option key={bloc.id} value={bloc.id}>
                    {bloc.id} — {bloc.nom}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-doux">
              <input
                type="checkbox"
                checked={montrerFaits}
                onChange={(e) => setMontrerFaits(e.target.checked)}
                className="accent-dispo"
              />
              Afficher les cours déjà faits
            </label>
          </div>

          <ul className="max-h-[560px] overflow-y-auto">
            {disponiblesDansReserve.length === 0 ? (
              <li className="px-3 py-4 text-[12.5px] text-faible">
                Aucun cours ne correspond. Élargissez la recherche ou le filtre de bloc.
              </li>
            ) : (
              disponiblesDansReserve.map((code) => {
                const fiche = ficheDe(catalogue, code);
                const etat = diagnostics.get(code)?.etat ?? "avertissement";
                return (
                  <li key={code} className="border-b border-trait/60 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEnMain(code);
                        setRefus(null);
                        setSousReserve(null);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-relief ${
                        enMain === code ? "bg-relief" : ""
                      }`}
                    >
                      <MarqueEtat
                        etat={etat}
                        sansFiche={fiche === undefined}
                        taille={11}
                      />
                      <span className="chiffres text-[12.5px] text-papier">{code}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-doux">
                        <TitreCours titre={fiche?.titre} />
                      </span>
                      <SaisonsOffre code={code} />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section>
          <div className="flex gap-2 overflow-x-auto pb-3">
            {HORIZON_DEFAUT.map((trimestre) => (
              <ColonneTrimestre
                key={cleTrimestre(trimestre)}
                trimestre={trimestre}
                enMain={enMain}
                onPlacer={tenterPlacement}
                onRetirer={(code) => {
                  retirer(code);
                  setRefus(null);
                  setSousReserve(null);
                }}
              />
            ))}
          </div>

          <div className="mt-4 border-t border-trait pt-3">
            <h2 className="text-[14px] font-semibold">
              {anomalies.length === 0
                ? "Rien à signaler dans le plan"
                : `À revoir dans le plan (${anomalies.length})`}
            </h2>
            {anomalies.length === 0 ? (
              <p className="mt-1.5 text-[12.5px] text-doux">
                Chaque cours placé est offert à sa saison, et ses préalables connus
                arrivent avant lui.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {anomalies.map((anomalie, i) => (
                  <li
                    key={`${anomalie.code}-${i}`}
                    className={`border-l-2 px-3 py-1.5 text-[12.5px] ${
                      anomalie.gravite === "refus"
                        ? "border-perdu bg-perdu/5"
                        : "border-avert bg-avert/5"
                    }`}
                  >
                    {anomalie.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Les trois saisons, celles où le cours est offert en évidence. */
function SaisonsOffre({ code }: { code: CodeCours }) {
  const fiche = ficheDe(catalogue, code);
  if (fiche === undefined || fiche.trimestres.length === 0) {
    return (
      <span className="chiffres text-[11px] text-faible" title="Offre inconnue">
        ?
      </span>
    );
  }
  const offertes = saisonsOffertes(fiche);
  return (
    <span
      className="chiffres flex shrink-0 gap-px text-[10.5px]"
      title={`Offert : ${[...offertes].join(", ")}`}
    >
      {SAISONS.map((saison) => (
        <span
          key={saison}
          className={`flex h-4 w-4 items-center justify-center ${
            offertes.has(saison) ? "bg-dispo/20 text-dispo" : "text-faible/50"
          }`}
        >
          {saison === "Automne" ? "A" : saison === "Hiver" ? "H" : "É"}
        </span>
      ))}
    </span>
  );
}

function ColonneTrimestre({
  trimestre,
  enMain,
  onPlacer,
  onRetirer,
}: {
  trimestre: Trimestre;
  enMain: CodeCours | null;
  onPlacer: (code: CodeCours, trimestre: Trimestre) => void;
  onRetirer: (code: CodeCours) => void;
}) {
  const { plan, diagnostics } = useEtat();
  const codes = coursDuTrimestre(plan, trimestre);
  const charge = chargeTrimestre(catalogue, plan, trimestre);
  const verdict =
    enMain === null
      ? null
      : verifierOffre(enMain, ficheDe(catalogue, enMain), trimestre);

  return (
    <div className="flex w-[196px] shrink-0 flex-col border border-trait bg-creux">
      <header className="border-b border-trait bg-relief px-2.5 py-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] text-papier">{libelleTrimestre(trimestre)}</h3>
          <span className="chiffres text-[11px] text-faible">
            {sigleTrimestre(trimestre)}
          </span>
        </div>
        <p className="chiffres mt-0.5 text-[11.5px] text-doux">
          {charge.credits} cr
          {charge.coursSansFiche > 0 ? (
            <span className="text-avert"> + {charge.coursSansFiche} ?</span>
          ) : null}
        </p>
      </header>

      <ul className="flex-1 space-y-1 p-1.5">
        {codes.length === 0 ? (
          <li className="px-1 py-2 text-[11.5px] text-faible">Aucun cours.</li>
        ) : (
          codes.map((code) => {
            const fiche = ficheDe(catalogue, code);
            const etat = diagnostics.get(code)?.etat ?? "avertissement";
            const verdictPlace = verifierOffre(code, fiche, trimestre);
            return (
              <li
                key={code}
                className={`border px-2 py-1.5 ${
                  verdictPlace.decision === "refus"
                    ? "border-perdu/60 bg-perdu/10"
                    : fiche === undefined
                      ? "tirete border bg-relief/60"
                      : "border-trait bg-relief/60"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <MarqueEtat etat={etat} sansFiche={fiche === undefined} taille={11} />
                  <span className="chiffres text-[12px] text-papier">{code}</span>
                  <button
                    type="button"
                    onClick={() => onRetirer(code)}
                    aria-label={`Retirer ${code} de ${libelleTrimestre(trimestre)}`}
                    className="ml-auto px-1 text-[13px] leading-none text-faible hover:text-papier"
                  >
                    ×
                  </button>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-doux">
                  <TitreCours titre={fiche?.titre} />
                </p>
                <Credits
                  credits={creditsDe(catalogue, code)}
                  className="text-[10.5px] text-faible"
                />
              </li>
            );
          })
        )}
      </ul>

      {enMain !== null && verdict !== null ? (
        <button
          type="button"
          onClick={() => onPlacer(enMain, trimestre)}
          className={`border-t px-2 py-2 text-[12px] ${
            verdict.decision === "refus"
              ? "border-perdu/40 bg-perdu/5 text-perdu hover:bg-perdu/15"
              : verdict.decision === "reserve"
                ? "border-avert/40 bg-avert/5 text-avert hover:bg-avert/15"
                : "border-dispo/40 bg-dispo/10 text-dispo hover:bg-dispo/20"
          }`}
          title={verdict.decision === "accepte" ? undefined : verdict.raison}
        >
          {verdict.decision === "refus"
            ? "Non offert ici"
            : verdict.decision === "reserve"
              ? "Placer sous réserve"
              : "Placer ici"}
        </button>
      ) : null}
    </div>
  );
}
