"use client";

/**
 * VUE 1 — ARBRE DES PRÉALABLES.
 *
 * Deux lectures du même graphe, parce qu'une seule mentirait :
 *
 *  1. le GRAPHE des relations réellement connues. Quand les fiches chargées ne
 *     déclarent aucun préalable il est vide, et l'écran le DIT au lieu
 *     d'afficher une grande surface vide qui ressemble à un bogue ;
 *  2. la LISTE par bloc, qui montre tous les codes du programme, fiche ou pas.
 *
 * Les états viennent de `DiagnosticCours`, jamais d'un calcul local.
 *
 * En v2 le catalogue n'est plus un module importé mais le résultat d'un
 * chargement : il change quand l'étudiant change de programme. Tout ce qui en
 * dérive est donc mémoïsé SUR le catalogue, et non calculé une fois pour
 * toutes — un graphe construit une seule fois resterait celui du programme
 * précédent, sans qu'aucune erreur ne le signale.
 */

import { useMemo, useState } from "react";
import { blocsDuCours, codesReferences, creditsDe, ficheDe } from "@/app/_lib/cours";
import { horairePublie } from "@/app/_lib/offre";
import type { Catalogue, CodeCours, EtatCours, NoeudPrealable } from "@/lib/types";
import { Credits, HABITS, LegendeEtats, MarqueEtat, TitreCours } from "./Etats";
import { useDonnees, useEtat } from "./ProviderEtat";

const L = 132;
const H = 40;
const ECART_X = 104;
const ECART_Y = 14;

interface Arete {
  source: CodeCours;
  cible: CodeCours;
  lien: "et" | "ou" | "seul";
}

function aretesDuNoeud(
  noeud: NoeudPrealable,
  lien: Arete["lien"],
): { code: CodeCours; lien: Arete["lien"] }[] {
  switch (noeud.genre) {
    case "cours":
      return [{ code: noeud.code, lien }];
    case "et":
      return noeud.enfants.flatMap((e) => aretesDuNoeud(e, "et"));
    case "ou":
      return noeud.enfants.flatMap((e) => aretesDuNoeud(e, "ou"));
    case "opaque":
      return [];
    default: {
      const jamais: never = noeud;
      throw new Error(`genre de noeud inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}

function construireGraphe(catalogue: Catalogue) {
  const aretes: Arete[] = [];
  for (const fiche of Object.values(catalogue.cours)) {
    if (fiche.prealables === null) continue;
    const racine = fiche.prealables;
    const lien = racine.genre === "cours" ? "seul" : racine.genre === "ou" ? "ou" : "et";
    for (const enfant of aretesDuNoeud(racine, lien)) {
      aretes.push({ source: enfant.code, cible: fiche.code, lien: enfant.lien });
    }
  }

  const noeuds = [...new Set(aretes.flatMap((a) => [a.source, a.cible]))];
  const parents = new Map<CodeCours, CodeCours[]>();
  for (const arete of aretes) {
    parents.set(arete.cible, [...(parents.get(arete.cible) ?? []), arete.source]);
  }

  // Profondeur = plus long chemin depuis une racine. Le `enCours` protège
  // d'un cycle dans les données : un préalable circulaire ne doit pas figer
  // l'onglet, il doit juste s'afficher de travers.
  const profondeurs = new Map<CodeCours, number>();
  const calculer = (code: CodeCours, enCours: Set<CodeCours>): number => {
    const connue = profondeurs.get(code);
    if (connue !== undefined) return connue;
    if (enCours.has(code)) return 0;
    enCours.add(code);
    const liste = parents.get(code) ?? [];
    const valeur =
      liste.length === 0 ? 0 : 1 + Math.max(...liste.map((p) => calculer(p, enCours)));
    enCours.delete(code);
    profondeurs.set(code, valeur);
    return valeur;
  };
  for (const code of noeuds) calculer(code, new Set());

  const colonnes = new Map<number, CodeCours[]>();
  for (const code of [...noeuds].sort((a, b) => a.localeCompare(b, "fr"))) {
    const colonne = profondeurs.get(code) ?? 0;
    colonnes.set(colonne, [...(colonnes.get(colonne) ?? []), code]);
  }

  const positions = new Map<CodeCours, { x: number; y: number }>();
  let hauteur = 0;
  for (const [colonne, codes] of colonnes) {
    codes.forEach((code, rang) => {
      positions.set(code, {
        x: colonne * (L + ECART_X),
        y: rang * (H + ECART_Y),
      });
    });
    hauteur = Math.max(hauteur, codes.length * (H + ECART_Y) - ECART_Y);
  }
  const largeur = (Math.max(...colonnes.keys(), 0) + 1) * (L + ECART_X) - ECART_X;

  return { aretes, noeuds, positions, largeur, hauteur };
}

export function VueArbre() {
  const { faits, basculerFait } = useEtat();
  const { catalogue, programme, diagnostics } = useDonnees();
  const graphe = useMemo(() => construireGraphe(catalogue), [catalogue]);
  const codes = useMemo(() => codesReferences(catalogue), [catalogue]);

  // Sélection d'ouverture : le premier cours qui a une fiche, pour que le
  // panneau montre d'emblée un cas complet plutôt qu'une absence.
  const [choisi, setSelection] = useState<CodeCours | null>(null);
  // Changer de programme change le catalogue, et le cours retenu peut ne plus y
  // figurer. Plutôt qu'un effet qui remet l'état à zéro après coup — donc un
  // rendu avec un cours inexistant — on retombe pendant le rendu.
  const selection =
    choisi !== null && codes.includes(choisi)
      ? choisi
      : (Object.keys(catalogue.cours)[0] ?? codes[0] ?? "");

  const etatDe = (code: CodeCours): EtatCours =>
    diagnostics.get(code)?.etat ?? "avertissement";

  const sansFiche = codes.filter((code) => ficheDe(catalogue, code) === undefined);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_352px]">
      <div className="px-5 py-6 sm:px-8">
        <header className="max-w-prose">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
            Préalables
          </h1>
          <p className="mt-2 text-doux">
            Marquez les cours réussis : les cours qu&apos;ils débloquent changent
            d&apos;état. Un cours dont la fiche n&apos;a pas encore été récupérée
            n&apos;est jamais verrouillé — ses préalables sont simplement inconnus, et
            c&apos;est affiché comme tel.
          </p>
        </header>

        <LegendeEtats className="mt-5" />

        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
            <h2 className="text-[15px] font-semibold">Relations connues</h2>
            <p className="chiffres text-[12px] text-faible">
              {graphe.aretes.length} arête{graphe.aretes.length === 1 ? "" : "s"} pour{" "}
              {codes.length} cours référencés
            </p>
          </div>

          {graphe.aretes.length === 0 ? (
            <p className="mt-4 border border-trait border-dashed px-4 py-6 text-doux">
              Aucune relation de préalable connue : aucune fiche de cours récupérée ne
              déclare de préalable.
            </p>
          ) : (
            <>
              <div className="mt-4 overflow-x-auto pb-2">
                <div
                  className="relative"
                  style={{ width: graphe.largeur, height: graphe.hauteur }}
                >
                  <svg
                    className="absolute inset-0 overflow-visible"
                    width={graphe.largeur}
                    height={graphe.hauteur}
                    aria-hidden="true"
                  >
                    {graphe.aretes.map((arete) => {
                      const a = graphe.positions.get(arete.source);
                      const b = graphe.positions.get(arete.cible);
                      if (a === undefined || b === undefined) return null;
                      const x1 = a.x + L;
                      const y1 = a.y + H / 2;
                      const x2 = b.x;
                      const y2 = b.y + H / 2;
                      const actif = faits.has(arete.source);
                      return (
                        <path
                          key={`${arete.source}->${arete.cible}`}
                          d={`M ${x1} ${y1} C ${x1 + 46} ${y1}, ${x2 - 46} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={actif ? "#49b68a" : "#3d5273"}
                          strokeWidth={actif ? 1.6 : 1.2}
                          strokeDasharray={arete.lien === "ou" ? "4 3" : undefined}
                        />
                      );
                    })}
                    {[...new Set(graphe.aretes.map((a) => a.cible))].map((cible) => {
                      const entrantes = graphe.aretes.filter((a) => a.cible === cible);
                      if (entrantes.length < 2) return null;
                      const b = graphe.positions.get(cible);
                      if (b === undefined) return null;
                      const ys = entrantes.map(
                        (a) => (graphe.positions.get(a.source)?.y ?? 0) + H / 2,
                      );
                      const milieu = (Math.min(...ys) + Math.max(...ys)) / 2;
                      return (
                        <text
                          key={`jonction-${cible}`}
                          x={b.x - 26}
                          y={milieu - 6}
                          fill="#93a4bc"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          {entrantes[0].lien === "ou" ? "OU" : "ET"}
                        </text>
                      );
                    })}
                  </svg>

                  {graphe.noeuds.map((code) => {
                    const position = graphe.positions.get(code)!;
                    const etat = etatDe(code);
                    const habit = HABITS[etat];
                    const fiche = ficheDe(catalogue, code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setSelection(code)}
                        style={{ left: position.x, top: position.y, width: L, height: H }}
                        className={`absolute flex flex-col justify-center border px-2.5 text-left ${habit.bord} ${habit.fond} ${
                          fiche === undefined ? "tirete" : ""
                        } ${selection === code ? "outline outline-papier" : ""}`}
                      >
                        <span className="flex items-center gap-1.5">
                          <MarqueEtat etat={etat} sansFiche={fiche === undefined} />
                          <span className="chiffres text-[12.5px] text-papier">{code}</span>
                        </span>
                        <span className="truncate text-[11px] text-doux">
                          <TitreCours titre={fiche?.titre} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-1 text-[12px] text-faible">
                Trait plein : tous les préalables reliés sont exigés (ET). Trait tireté :
                un seul suffit (OU). Trait vert : préalable déjà fait.
              </p>
            </>
          )}
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
            <h2 className="text-[15px] font-semibold">Cours du programme, par bloc</h2>
            <p className="chiffres text-[12px] text-faible">
              {codes.length - sansFiche.length} fiches sur {codes.length} codes
            </p>
          </div>

          <div className="mt-4 grid gap-5 xl:grid-cols-2">
            {/* Clé `cle` et non `id` : deux blocs d'un même programme peuvent
                porter le même `id` (`MM-Bloc 73A` et `S-Bloc 73A`), et React
                fusionnerait leurs listes de cours sans rien signaler. */}
            {programme.blocs.map((bloc) => (
              <article key={bloc.cle} className="border border-trait">
                <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-trait bg-relief px-3 py-2">
                  <span className="chiffres text-[13px] text-papier">{bloc.id}</span>
                  <h3 className="text-[13px] text-papier">
                    {bloc.nom === "" ? (
                      <span className="text-faible italic">sans nom sur la page</span>
                    ) : (
                      bloc.nom
                    )}
                  </h3>
                  <span className="ml-auto text-[11.5px] text-faible">
                    {bloc.regleBrut === "" ? "règle non publiée" : bloc.regleBrut}
                  </span>
                </header>
                {bloc.notes.length > 0 ? (
                  <ul className="border-b border-trait/60 px-3 py-1.5">
                    {bloc.notes.map((note) => (
                      <li key={note} className="text-[11.5px] leading-relaxed text-doux">
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {bloc.cours.length === 0 ? (
                  <p className="px-3 py-3 text-[12.5px] text-faible">
                    Aucune liste de cours : ce bloc accepte n&apos;importe quel cours.
                  </p>
                ) : (
                  <ul>
                    {bloc.cours.map((code) => {
                      const etat = etatDe(code);
                      const fiche = ficheDe(catalogue, code);
                      return (
                        <li
                          key={code}
                          className="flex items-center border-b border-trait/60 last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => basculerFait(code)}
                            aria-pressed={faits.has(code)}
                            title={
                              faits.has(code)
                                ? `Retirer ${code} des cours faits`
                                : `Marquer ${code} comme fait`
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center border-r border-trait/60 hover:bg-relief"
                          >
                            <MarqueEtat
                              etat={etat}
                              sansFiche={fiche === undefined}
                              taille={13}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelection(code)}
                            className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-left hover:bg-relief ${
                              selection === code ? "bg-relief" : ""
                            }`}
                          >
                            <span className="chiffres text-[12.5px] text-papier">{code}</span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-doux">
                              <TitreCours titre={fiche?.titre} />
                            </span>
                            <Credits
                              credits={creditsDe(catalogue, code)}
                              className="text-[12px] text-doux"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>

      <PanneauCours code={selection} />
    </div>
  );
}

function PanneauCours({ code }: { code: CodeCours }) {
  const { faits, basculerFait } = useEtat();
  const { catalogue, programme, diagnostics } = useDonnees();
  const fiche = ficheDe(catalogue, code);
  const diagnostic = diagnostics.get(code);
  const etat = diagnostic?.etat ?? "avertissement";
  const habit = HABITS[etat];
  const blocs = blocsDuCours(programme, code);

  return (
    <aside className="border-t border-trait px-5 py-6 sm:px-6 lg:sticky lg:top-[108px] lg:self-start lg:border-t-0 lg:border-l">
      <div className="flex items-center gap-2">
        <MarqueEtat etat={etat} sansFiche={fiche === undefined} taille={14} />
        <h2 className="chiffres text-[17px] text-papier">{code}</h2>
        <span className={`ml-auto border px-2 py-0.5 text-[11.5px] ${habit.bord} ${habit.fond} ${habit.texte}`}>
          {habit.nom}
        </span>
      </div>

      <p className="mt-1.5 text-[13.5px] text-doux">
        <TitreCours titre={fiche?.titre} />
      </p>

      <dl className="mt-4 divide-y divide-trait border-y border-trait text-[12.5px]">
        <div className="flex justify-between py-1.5">
          <dt className="text-faible">Crédits</dt>
          <dd>
            <Credits credits={fiche?.credits ?? null} />
          </dd>
        </div>
        <div className="flex justify-between gap-3 py-1.5">
          <dt className="text-faible">Bloc</dt>
          <dd className="text-right">
            {blocs.length === 0 ? (
              <span className="text-faible">aucun</span>
            ) : (
              blocs
                .map((bloc) => (bloc.nom === "" ? bloc.id : `${bloc.id} — ${bloc.nom}`))
                .join(" ; ")
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3 py-1.5">
          <dt className="text-faible">Offert</dt>
          <dd className="text-right">
            {fiche === undefined ? (
              <span className="text-faible">inconnu</span>
            ) : (
              horairePublie(fiche)
            )}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => basculerFait(code)}
        className={`mt-4 w-full border px-3 py-2 text-[13px] transition-colors ${
          faits.has(code)
            ? "border-fait/50 bg-fait/10 text-fait hover:bg-fait/20"
            : "border-traitfort text-papier hover:bg-relief"
        }`}
      >
        {faits.has(code) ? `${code} est fait — retirer` : `Marquer ${code} comme fait`}
      </button>

      <section className="mt-6">
        <h3 className="border-b border-trait pb-1.5 text-[13px] font-semibold">
          Préalables
        </h3>
        {fiche === undefined ? (
          <p className="tirete mt-3 border px-3 py-2.5 text-[12.5px] text-doux">
            Ce cours est cité par un bloc du programme mais sa fiche n&apos;a pas encore
            été récupérée. Ses préalables, son titre et ses crédits sont inconnus — pas
            vides.
          </p>
        ) : fiche.prealables === null ? (
          <p className="mt-3 text-[12.5px] text-doux">
            Aucun préalable. La fiche n&apos;a pas de champ « Préalables », ce qui est le
            cas normal pour plusieurs cours.
          </p>
        ) : (
          <>
            <NoeudVue noeud={fiche.prealables} />
            <p className="chiffres mt-3 border-l-2 border-trait pl-2.5 text-[11.5px] text-faible">
              {fiche.prealablesBrut}
            </p>
          </>
        )}
      </section>

      {/* RESTRICTIONS ET CONCOMITANTS — trois choses DIFFÉRENTES, montrées
          séparément. Une restriction d'inscription n'est ni un préalable ni un
          concomitant : elle ne verrouille pas le cours, elle en réserve
          l'inscription. Les confondre fait voir vingt cours requis là où il n'y
          en a aucun (MUI 1162A n'a QUE des restrictions). */}
      {fiche !== undefined &&
      (fiche.restrictionsBrut !== null || fiche.concomitantsBrut !== null) ? (
        <section className="mt-5">
          <h3 className="border-b border-trait pb-1.5 text-[13px] font-semibold">
            Autres conditions
          </h3>
          {fiche.concomitantsBrut !== null ? (
            <p className="mt-2 text-[12.5px] text-doux">
              <span className="text-faible">Concomitants : </span>
              <span className="chiffres">{fiche.concomitantsBrut}</span> — à suivre en
              même temps, pas avant.
            </p>
          ) : null}
          {fiche.restrictionsBrut !== null ? (
            <p className="mt-2 border-l-2 border-avert/50 pl-2.5 text-[12.5px] text-doux">
              <span className="text-faible">Restriction d&apos;inscription : </span>
              {fiche.restrictionsBrut} — ce n&apos;est pas un préalable. Le cours
              n&apos;est pas verrouillé pour autant ; l&apos;inscription, elle, peut
              l&apos;être.
            </p>
          ) : null}
        </section>
      ) : null}

      {diagnostic !== undefined && diagnostic.manquants.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-[13px] font-semibold">Ce qui manque</h3>
          <p className="chiffres mt-1.5 text-[12.5px] text-verrou">
            {diagnostic.manquants.join(", ")}
          </p>
        </section>
      ) : null}

      {diagnostic !== undefined && diagnostic.avertissements.length > 0 ? (
        <section className="mt-5">
          <h3 className="text-[13px] font-semibold text-avert">À vérifier</h3>
          <ul className="mt-1.5 space-y-1.5 text-[12.5px] text-doux">
            {diagnostic.avertissements.map((texte) => (
              <li key={texte} className="border-l-2 border-avert/50 pl-2.5">
                {texte}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {fiche !== undefined ? (
        <a
          href={fiche.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block border-b border-trait text-[12.5px] text-doux hover:border-papier hover:text-papier"
        >
          Fiche officielle du cours
        </a>
      ) : null}
    </aside>
  );
}

/** L'arbre tel qu'il est écrit dans les données, conjonctions comprises. */
function NoeudVue({ noeud }: { noeud: NoeudPrealable }) {
  const { catalogue, diagnostics } = useDonnees();

  switch (noeud.genre) {
    case "cours": {
      const etat = diagnostics.get(noeud.code)?.etat ?? "avertissement";
      const fiche = ficheDe(catalogue, noeud.code);
      return (
        <p className="mt-2 flex items-center gap-2 text-[12.5px]">
          <MarqueEtat etat={etat} sansFiche={fiche === undefined} />
          <span className="chiffres text-papier">{noeud.code}</span>
          <span className="min-w-0 truncate text-doux">
            <TitreCours titre={fiche?.titre} />
          </span>
        </p>
      );
    }
    case "et":
    case "ou":
      return (
        <div className="mt-2 border-l border-trait pl-3">
          <p className="chiffres text-[11.5px] text-faible">
            {noeud.genre === "et" ? "ET — tous les suivants" : "OU — au moins un des suivants"}
          </p>
          {noeud.enfants.map((enfant, i) => (
            <NoeudVue key={i} noeud={enfant} />
          ))}
        </div>
      );
    case "opaque":
      return (
        <p className="mt-2 border-l-2 border-avert/50 pl-2.5 text-[12.5px] text-doux">
          « {noeud.texte} » — condition que l&apos;outil ne sait pas vérifier. Elle ne
          verrouille pas le cours ; vérifiez-la auprès du département.
        </p>
      );
    default: {
      const jamais: never = noeud;
      throw new Error(`genre de noeud inconnu: ${JSON.stringify(jamais)}`);
    }
  }
}
