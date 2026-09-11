"use client";

/**
 * RENSEIGNER LES COURS RÉUSSIS — deux chemins, un seul état.
 *
 * LA RÈGLE QUI GOUVERNE TOUT L'ÉCRAN : un horaire atteste qu'un cours a été
 * SUIVI, pas qu'il a été RÉUSSI. Un cours abandonné à la semaine 6 et un cours
 * échoué au final laissent exactement la même trace dans un export Synchro qu'un
 * cours réussi. Rien n'est donc coché d'avance : l'import PROPOSE, l'étudiant
 * COCHE. Un audit faux ne se découvre qu'au moment de s'inscrire, trop tard.
 *
 * COUTURE AVEC LA SESSION UI : l'état de l'étudiant vit dans
 * `app/_lib/stockage.ts`, qui ne nous appartient pas. On s'en sert par ses trois
 * exports — `abonner()`, `lireEtat()`, `ecrire()` — et on n'y touche pas.
 * `ecrire()` prend l'état ENTIER : le plan par trimestre est donc recopié tel
 * quel, sinon un import effacerait silencieusement le placement des cours.
 *
 * SANS SERVEUR : lecture par `File.text()`, aucun `fetch`, aucune route d'API.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { abonner, ecrire, lireEtat, lireEtatServeur } from "@/app/_lib/stockage";
import { fusionnerFaits, type Fusion } from "@/lib/ics/fusion";
import { lireICS } from "@/lib/ics/lire";
import type { ResultatImportICS } from "@/lib/ics/types";
import type { CodeCours } from "@/lib/types";
import { ImportIgnores } from "./ImportIgnores";
import { ImportListeCours } from "./ImportListeCours";
import { ImportSaisie } from "./ImportSaisie";
import { ImportSource } from "./ImportSource";

export function ImportEcran() {
  const stocke = useSyncExternalStore(abonner, lireEtat, lireEtatServeur);
  const faits = useMemo(() => new Set(stocke.faits), [stocke.faits]);

  const [resultat, setResultat] = useState<ResultatImportICS | null>(null);
  const [origine, setOrigine] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<CodeCours>>(new Set());
  const [aLaMain, setALaMain] = useState<CodeCours[]>([]);
  const [bilan, setBilan] = useState<Fusion | null>(null);

  const recevoirTexte = useCallback((texte: string, nom: string) => {
    setResultat(lireICS(texte));
    setOrigine(nom);
    setSelection(new Set());
    setBilan(null);
  }, []);

  const basculer = useCallback((code: CodeCours) => {
    setBilan(null);
    setSelection((courant) => {
      const suivant = new Set(courant);
      if (suivant.has(code)) suivant.delete(code);
      else suivant.add(code);
      return suivant;
    });
  }, []);

  const ajouterALaMain = useCallback((codes: CodeCours[]) => {
    setBilan(null);
    setALaMain((courant) => [...courant, ...codes.filter((c) => !courant.includes(c))]);
    setSelection((courant) => new Set([...courant, ...codes]));
  }, []);

  const oublier = useCallback((code: CodeCours) => {
    setBilan(null);
    setALaMain((courant) => courant.filter((c) => c !== code));
    setSelection((courant) => {
      const suivant = new Set(courant);
      suivant.delete(code);
      return suivant;
    });
  }, []);

  const choisis = [...selection];
  // Ce que la confirmation changerait vraiment, calculé AVANT d'écrire, pour que
  // le bouton annonce le bon nombre.
  const apercu = fusionnerFaits(stocke.faits, choisis);

  const confirmer = useCallback(() => {
    const courant = lireEtat();
    const fusion = fusionnerFaits(courant.faits, [...selection]);
    // `plan` recopié tel quel : on ajoute aux cours faits, on n'écrase pas l'état.
    ecrire({ ...courant, faits: fusion.faits });
    setBilan(fusion);
    setSelection(new Set());
    setALaMain([]);
  }, [selection]);

  return (
    <div className="px-5 py-6 sm:px-8">
      <header className="max-w-prose">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          Renseigner les cours réussis
        </h1>
        <p className="mt-2 text-doux">
          Deux chemins : importer l&apos;horaire exporté par l&apos;extension{" "}
          <code className="text-papier">synchro-calendrier</code>, ou taper les sigles à la
          main. Les deux remplissent la même liste, que vous confirmez ensuite.
        </p>
        {/* La règle, écrite là où la décision se prend — pas dans une aide. */}
        <p className="mt-3 border-l-2 border-avert/70 bg-avert/5 px-3 py-2 text-[13px] leading-relaxed text-papier">
          <strong className="font-semibold text-avert">
            Un horaire dit que vous avez suivi un cours. Il ne dit pas que vous l&apos;avez
            réussi.
          </strong>{" "}
          Un abandon de novembre et un échec au final y laissent la même trace
          qu&apos;une note de A. Rien n&apos;est donc coché d&apos;avance : l&apos;import
          propose, vous cochez. Un cours coché par erreur rend l&apos;audit faux, et ça ne
          se découvre qu&apos;au moment de s&apos;inscrire.
        </p>
      </header>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-7">
          <ImportSource origine={origine} onTexte={recevoirTexte} />

          {resultat === null ? null : (
            <>
              <ImportListeCours
                resultat={resultat}
                selection={selection}
                faits={faits}
                onBasculer={basculer}
                onToutCocher={(codes) => {
                  setBilan(null);
                  setSelection((courant) => new Set([...courant, ...codes]));
                }}
                onRienCocher={(codes) => {
                  setBilan(null);
                  setSelection((courant) => {
                    const suivant = new Set(courant);
                    for (const code of codes) suivant.delete(code);
                    return suivant;
                  });
                }}
              />
              <ImportIgnores resultat={resultat} />
            </>
          )}

          <ImportSaisie dejaChoisis={selection} faits={faits} onAjouter={ajouterALaMain} />
        </div>

        <Panier
          choisis={choisis}
          aLaMain={aLaMain}
          apercu={apercu}
          bilan={bilan}
          onOublier={oublier}
          onConfirmer={confirmer}
          nbFaits={faits.size}
        />
      </div>
    </div>
  );
}

/**
 * Le panier, et le seul bouton qui écrit. Il annonce d'avance ce qu'il va
 * changer — combien de cours s'ajoutent, combien étaient déjà là — parce qu'un
 * bouton qui dit « Ajouter 7 cours » et en ajoute 4 est un bouton qui ment.
 */
function Panier({
  choisis,
  aLaMain,
  apercu,
  bilan,
  onOublier,
  onConfirmer,
  nbFaits,
}: {
  choisis: CodeCours[];
  aLaMain: CodeCours[];
  apercu: Fusion;
  bilan: Fusion | null;
  onOublier: (code: CodeCours) => void;
  onConfirmer: () => void;
  nbFaits: number;
}) {
  return (
    <aside className="xl:sticky xl:top-[72px]">
      <div className="border border-trait bg-relief/40">
        <div className="flex items-baseline justify-between border-b border-trait px-3.5 py-2.5">
          <h2 className="text-[14px] font-semibold">À confirmer</h2>
          <p className="chiffres text-[12px] text-faible">
            {nbFaits} déjà fait{nbFaits === 1 ? "" : "s"}
          </p>
        </div>

        <div className="px-3.5 py-3">
          {choisis.length === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-doux">
              Rien de coché. Cochez les cours que vous avez bel et bien{" "}
              <strong className="font-medium text-papier">réussis</strong>, ou tapez leurs
              sigles à la main.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1.5">
                {choisis.map((code) => (
                  <li
                    key={code}
                    className={`flex items-center gap-1.5 border px-2 py-1 text-[12px] ${
                      aLaMain.includes(code)
                        ? "border-dispo/50 bg-dispo/10"
                        : "border-fait/50 bg-fait/10"
                    }`}
                  >
                    <span className="chiffres text-papier">{code}</span>
                    <button
                      type="button"
                      onClick={() => onOublier(code)}
                      aria-label={`Retirer ${code}`}
                      className="text-faible transition-colors hover:text-perdu"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-doux">
                <span className="chiffres text-papier">{apercu.ajoutes.length}</span> à
                ajouter
                {apercu.dejaLa.length > 0 ? (
                  <>
                    ,{" "}
                    <span className="chiffres text-faible">{apercu.dejaLa.length}</span>{" "}
                    déjà dans vos cours faits
                  </>
                ) : null}
                .
              </p>
            </>
          )}

          <button
            type="button"
            onClick={onConfirmer}
            disabled={apercu.ajoutes.length === 0}
            className="mt-3 w-full border border-fait/60 bg-fait/15 px-3 py-2 text-[13px] font-medium text-fait transition-colors hover:bg-fait/25 disabled:border-trait disabled:bg-transparent disabled:text-faible disabled:hover:bg-transparent"
          >
            {apercu.ajoutes.length === 0
              ? "Aucun cours à ajouter"
              : `Ajouter ${apercu.ajoutes.length} cours aux cours réussis`}
          </button>

          {bilan === null ? null : (
            <div
              role="status"
              className="mt-3 border-l-2 border-fait/60 bg-fait/5 px-3 py-2 text-[12.5px] leading-relaxed"
            >
              <p className="text-fait">
                <span className="chiffres">{bilan.ajoutes.length}</span> cours ajouté
                {bilan.ajoutes.length === 1 ? "" : "s"}
                {bilan.dejaLa.length > 0 ? (
                  <>
                    , <span className="chiffres">{bilan.dejaLa.length}</span> déjà présent
                    {bilan.dejaLa.length === 1 ? "" : "s"}
                  </>
                ) : null}
                .
              </p>
              {bilan.ajoutes.length > 0 ? (
                <p className="chiffres mt-1 text-doux">{bilan.ajoutes.join(", ")}</p>
              ) : null}
              {bilan.dejaLa.length > 0 ? (
                <p className="mt-1 text-faible">
                  Déjà là : <span className="chiffres">{bilan.dejaLa.join(", ")}</span> —
                  rien n&apos;a été dupliqué, et votre plan par trimestre n&apos;a pas
                  bougé.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-faible">
        Tout reste sur cet appareil : les cours faits vivent dans le stockage local du
        navigateur, rien n&apos;est envoyé nulle part. Le fichier .ics est lu sur place et
        n&apos;est pas conservé.
      </p>
    </aside>
  );
}
