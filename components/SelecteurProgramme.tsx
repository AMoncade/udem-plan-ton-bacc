"use client";

/**
 * LE SÉLECTEUR — un programme parmi plus de mille.
 *
 * Les choix, et ce qui les motive :
 *
 *  - **La recherche ignore les accents et l'ordre des mots.** Personne ne tape
 *    « Baccalauréat en mathématiques » avec l'accent ; « bacc math » doit
 *    suffire. Une recherche sous-chaîne sensible aux accents fait conclure à
 *    l'étudiant que son programme n'est pas là.
 *  - **Le classement vient du NOM, pas de la faculté.** Taper « droit » doit
 *    donner le baccalauréat en droit avant les trente programmes de la Faculté
 *    de droit. La faculté reste cherchable, elle ne porte simplement pas le
 *    rang (voir `_lib/recherche.ts`).
 *  - **Les filtres annoncent leurs effectifs, les autres filtres appliqués.**
 *    Sans ça on choisit « 2e cycle » puis une faculté sans programme de 2e
 *    cycle, et la liste se vide sans expliquer pourquoi.
 *  - **La liste est plafonnée et le dit.** Une troncature muette fait croire
 *    qu'il n'y a rien de plus.
 *  - **Une fiche sans structure exploitable n'est pas cliquable, et dit
 *    pourquoi.** C'est le cas des années préparatoires et des accès-fac : la
 *    page existe, elle n'a pas de blocs. La rendre sélectionnable mènerait à un
 *    écran vide, qui ressemble à une panne.
 *  - **`useDeferredValue` sur la requête.** Le coût n'est pas la comparaison de
 *    1 088 chaînes, c'est le rendu des lignes ; le champ reste donc réactif
 *    pendant que la liste rattrape.
 */

import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import {
  FILTRES_VIDES,
  PLAFOND_RESULTATS,
  chercher,
  facettes,
  filtresActifs,
  libelleFiche,
  type Filtres,
} from "@/app/_lib/recherche";
import type { FicheIndex } from "@/lib/types";
import { useEtat } from "./ProviderEtat";
import { TeteEcran } from "./TeteEcran";

function ListeFiltre({
  etiquette,
  valeur,
  options,
  onChange,
}: {
  etiquette: string;
  valeur: string | null;
  options: { valeur: string; nombre: number }[];
  onChange: (valeur: string | null) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11.5px] text-faible">{etiquette}</span>
      <select
        value={valeur ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="min-w-0 border border-trait bg-creux px-2 py-1.5 text-[12.5px] focus:border-traitfort focus:outline-none"
      >
        <option value="">Tous ({options.reduce((s, o) => s + o.nombre, 0)})</option>
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.valeur} ({option.nombre})
          </option>
        ))}
      </select>
    </label>
  );
}

/** Les crédits d'un programme. `null` s'affiche « non annoncé », jamais « 90 »
 *  ni « NaN » : le contrat v2 dit de ne jamais supposer 90. */
function CreditsProgramme({ fiche }: { fiche: FicheIndex }) {
  if (fiche.creditsTotal === null) {
    return <span className="text-faible italic">crédits non annoncés</span>;
  }
  return (
    <span className="chiffres">
      {fiche.creditsTotal} <span className="text-faible">cr</span>
    </span>
  );
}

export function SelecteurProgramme() {
  const router = useRouter();
  const { index, selection, choisir } = useEtat();
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [survol, setSurvol] = useState(0);
  const champ = useRef<HTMLInputElement>(null);

  // Le champ garde la valeur immédiate ; la liste se recalcule sur la valeur
  // différée. C'est ce qui garde la frappe fluide à 1 088 entrées.
  const requeteDifferee = useDeferredValue(filtres.texte);
  const filtresDifferes = useMemo<Filtres>(
    () => ({ ...filtres, texte: requeteDifferee }),
    [filtres, requeteDifferee],
  );

  const prepare = index.phase === "pret" ? index.prepare : null;

  const resultat = useMemo(
    () =>
      prepare === null
        ? { fiches: [], total: 0, tronques: 0 }
        : chercher(prepare, filtresDifferes),
    [prepare, filtresDifferes],
  );

  const optionsCycle = useMemo(
    () => (prepare === null ? [] : facettes(prepare, filtresDifferes, "cycle")),
    [prepare, filtresDifferes],
  );
  const optionsFaculte = useMemo(
    () => (prepare === null ? [] : facettes(prepare, filtresDifferes, "faculte")),
    [prepare, filtresDifferes],
  );
  const optionsType = useMemo(
    () => (prepare === null ? [] : facettes(prepare, filtresDifferes, "typeProgramme")),
    [prepare, filtresDifferes],
  );

  if (index.phase === "erreur") {
    return (
      <div className="ecran py-6">
        <div className="max-w-prose border border-perdu/50 bg-perdu/5 px-4 py-4">
          <h1 className="text-[17px] font-semibold">
            L&apos;index des programmes n&apos;a pas pu être lu
          </h1>
          <p className="chiffres mt-2 text-[12.5px] text-papier">{index.message}</p>
        </div>
      </div>
    );
  }

  if (prepare === null) {
    return (
      <div className="ecran py-6">
        <p className="text-doux">Lecture de l&apos;index des programmes…</p>
      </div>
    );
  }

  const selectionnables = resultat.fiches.filter((f) => f.structureLue);

  function ouvrir(fiche: FicheIndex): void {
    if (!fiche.structureLue) return;
    choisir(fiche.cle);
    router.push("/");
  }

  /** Flèches pour parcourir, Entrée pour ouvrir, Échap pour vider. Les fiches
   *  sans structure sont sautées : elles ne sont pas ouvrables. */
  function auClavier(evenement: React.KeyboardEvent): void {
    if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
      evenement.preventDefault();
      const pas = evenement.key === "ArrowDown" ? 1 : -1;
      setSurvol((courant) => {
        if (selectionnables.length === 0) return 0;
        const suivant = courant + pas;
        if (suivant < 0) return selectionnables.length - 1;
        if (suivant >= selectionnables.length) return 0;
        return suivant;
      });
      return;
    }
    if (evenement.key === "Enter") {
      const cible = selectionnables[survol];
      if (cible !== undefined) {
        evenement.preventDefault();
        ouvrir(cible);
      }
      return;
    }
    if (evenement.key === "Escape") {
      setFiltres((f) => ({ ...f, texte: "" }));
      setSurvol(0);
    }
  }

  const nbActifs = filtresActifs(filtres);

  return (
    <div className="ecran py-6">
      <TeteEcran
        titre="Programmes"
        fait={
          <>
            <span className="chiffres">
              {prepare.entrees.length.toLocaleString("fr-CA")}
            </span>{" "}
            parcours au catalogue.
          </>
        }
        aide={
          <p>
            Cherchez par nom — les accents et l&apos;ordre des mots n&apos;ont pas
            d&apos;importance — ou réduisez par cycle, faculté et type. Un même
            programme peut porter plusieurs parcours : une page à sept orientations
            en vaut sept, et ils n&apos;ont ni les mêmes blocs ni la même répartition
            de crédits.
          </p>
        }
      />

      <section className="mt-5 border border-trait bg-relief/30 p-3 sm:p-4">
        <label className="block">
          <span className="text-[11.5px] text-faible">Nom du programme</span>
          <input
            ref={champ}
            type="search"
            value={filtres.texte}
            onChange={(e) => {
              setFiltres((f) => ({ ...f, texte: e.target.value }));
              setSurvol(0);
            }}
            onKeyDown={auClavier}
            /* Le champ est la raison d'être de la page : on y arrive pour
               chercher. Le focus automatique épargne une tabulation et ne
               déplace pas le focus hors d'un contexte attendu. */
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="liste-programmes"
            aria-autocomplete="list"
            placeholder="actuariat, bacc math, droit…"
            className="mt-1 w-full border border-trait bg-creux px-3 py-2 text-[14px] placeholder:text-faible focus:border-traitfort focus:outline-none"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <ListeFiltre
            etiquette="Cycle"
            valeur={filtres.cycle}
            options={optionsCycle}
            onChange={(valeur) => {
              setFiltres((f) => ({ ...f, cycle: valeur }));
              setSurvol(0);
            }}
          />
          <ListeFiltre
            etiquette="Faculté"
            valeur={filtres.faculte}
            options={optionsFaculte}
            onChange={(valeur) => {
              setFiltres((f) => ({ ...f, faculte: valeur }));
              setSurvol(0);
            }}
          />
          <ListeFiltre
            etiquette="Type"
            valeur={filtres.typeProgramme}
            options={optionsType}
            onChange={(valeur) => {
              setFiltres((f) => ({ ...f, typeProgramme: valeur }));
              setSurvol(0);
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-doux">
            <input
              type="checkbox"
              checked={filtres.masquerSansStructure}
              onChange={(e) => {
                setFiltres((f) => ({ ...f, masquerSansStructure: e.target.checked }));
                setSurvol(0);
              }}
              className="accent-dispo"
            />
            Masquer les {prepare.nbSansStructure} fiches sans structure exploitable
          </label>
          {nbActifs > 0 ? (
            <button
              type="button"
              onClick={() => {
                setFiltres(FILTRES_VIDES);
                setSurvol(0);
                champ.current?.focus();
              }}
              className="border border-trait px-2.5 py-1 text-[12.5px] text-doux hover:border-traitfort hover:text-papier"
            >
              Tout réafficher
            </button>
          ) : null}
        </div>
      </section>

      <p
        className="mt-4 flex flex-wrap items-baseline gap-x-2 border-b border-trait pb-2 text-[12.5px] text-doux"
        role="status"
        aria-live="polite"
      >
        <span className="chiffres text-papier">
          {resultat.total.toLocaleString("fr-CA")}
        </span>
        programme{resultat.total === 1 ? "" : "s"} trouvé
        {resultat.total === 1 ? "" : "s"}
        {resultat.tronques > 0 ? (
          <span className="text-avert">
            — {resultat.tronques.toLocaleString("fr-CA")} de plus ne sont pas affichés
            (limite de {PLAFOND_RESULTATS} lignes) ; précisez la recherche.
          </span>
        ) : null}
      </p>

      {resultat.total === 0 ? (
        <p className="mt-4 border border-dashed border-trait px-4 py-6 text-doux">
          Aucun programme ne correspond. Les filtres se combinent en ET — essayez
          d&apos;en retirer un, ou de raccourcir la recherche.
        </p>
      ) : (
        <ul id="liste-programmes" role="listbox" className="mt-1">
          {resultat.fiches.map((fiche) => {
            const rangSelectionnable = selectionnables.indexOf(fiche);
            const pointe = rangSelectionnable >= 0 && rangSelectionnable === survol;
            const courant = fiche.cle === selection;
            return (
              <li
                key={fiche.cle}
                role="option"
                aria-selected={courant}
                aria-disabled={!fiche.structureLue}
                className={`border-b border-trait/60 ${pointe ? "bg-relief" : ""}`}
              >
                {fiche.structureLue ? (
                  <button
                    type="button"
                    onClick={() => ouvrir(fiche)}
                    onMouseEnter={() => setSurvol(Math.max(0, rangSelectionnable))}
                    /* Une grille, pas un `flex-wrap` : dans un registre, les
                       colonnes s'alignent d'une ligne à l'autre. En flex, la
                       faculté commençait à une abscisse différente à chaque
                       ligne selon la longueur du nom, et l'œil devait rechercher
                       sa colonne à chaque fois. */
                    className={`ligne-registre w-full px-3 py-2 text-left hover:bg-relief ${
                      courant ? "border-l-2 border-papier pl-2.5" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate text-[13.5px] text-papier">
                      {libelleFiche(fiche)}
                      {courant ? (
                        <span className="ml-2 border border-trait px-1.5 py-px text-[11px] text-doux">
                          affiché
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 truncate text-[12px] text-doux">
                      {[fiche.typeProgramme, fiche.cycle, fiche.faculte]
                        .filter((part): part is string => part !== null)
                        .join(" · ")}
                    </span>
                    <span className="chiffres shrink-0 whitespace-nowrap text-[12px] text-doux md:text-right">
                      <CreditsProgramme fiche={fiche} />
                      <span className="text-faible">
                        {" · "}
                        {fiche.nbBlocs} bloc{fiche.nbBlocs === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                ) : (
                  /* Pas un bouton : rien à ouvrir. Le filet tireté et le mot
                     « sans structure » portent l'état sans dépendre de la
                     couleur. */
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-dashed border-avert/70 px-3 py-2 pl-2.5">
                    <span className="min-w-0 flex-1 text-[13.5px] text-doux">
                      {libelleFiche(fiche)}
                    </span>
                    <span className="text-[12px] text-avert">
                      sans structure exploitable
                    </span>
                    <span className="w-full text-[12px] text-faible">
                      {fiche.typeProgramme ?? "type non annoncé"} — la page n&apos;a ni
                      blocs ni règles de crédits, il n&apos;y a donc rien à auditer.
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-[12px] leading-relaxed text-faible">
        Flèches pour parcourir, Entrée pour ouvrir, Échap pour vider la recherche. Le
        programme choisi est retenu d&apos;une visite à l&apos;autre ; les cours marqués
        comme faits ne le sont pas par programme, donc en changer ne les efface pas.
      </p>
    </div>
  );
}
