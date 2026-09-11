"use client";

/**
 * VUE 2 — AUDIT DES BLOCS.
 *
 * La vue existe pour une raison arithmétique précise. Pour l'actuariat, les
 * minimums des blocs d'option totalisent 18 crédits, alors que le programme en
 * exige 33 : un étudiant peut satisfaire CHAQUE bloc et ne pas diplômer. Un
 * relevé bloc par bloc ne le dit nulle part, donc la balance du haut montre
 * l'écart de 15 crédits comme une aire ouverte, hachurée.
 *
 * Deuxième information introuvable ailleurs : les crédits PERDUS. Au-delà du
 * maximum d'un bloc, un cours réussi ne compte pas vers le diplôme.
 */

import { useState } from "react";
import { catalogue, programme } from "@/app/_donnees/catalogue";
import {
  arithmetiqueProgramme,
  creditsDe,
  ficheDe,
  maxBloc,
  minBloc,
} from "@/app/_lib/cours";
import type { EtatBloc } from "@/lib/types";
import { Credits, TitreCours } from "./Etats";
import { useEtat } from "./ProviderEtat";

const exige = arithmetiqueProgramme(programme);

function pourcent(part: number, tout: number): number {
  if (tout <= 0) return 0;
  return Math.max(0, Math.min(100, (part / tout) * 100));
}

/**
 * Un bloc, dessiné comme une boîte qui a un fond (le minimum), un bord (le
 * plafond) et un débordement. Les crédits perdus sortent LITTÉRALEMENT de la
 * boîte, en rouge, à droite du plafond : c'est la seule façon de montrer
 * qu'ils existent sans compter.
 */
function BarreBloc({
  retenus,
  perdus,
  min,
  plafond,
  reference,
}: {
  retenus: number;
  perdus: number;
  min: number;
  plafond: number | null;
  reference: number;
}) {
  // 78 % de la largeur pour l'échelle, le reste en réserve pour le débordement.
  const echelle = reference > 0 ? 78 / reference : 0;
  const borne = plafond ?? Math.max(min, retenus, 1);
  return (
    <span className="flex h-2.5 w-full items-stretch">
      <span
        className="relative block border border-trait bg-creux"
        style={{ width: `${Math.max(2, borne * echelle)}%` }}
      >
        <span
          className="absolute inset-y-0 left-0 bg-fait/60"
          style={{ width: `${pourcent(retenus, borne)}%` }}
        />
        {min > 0 && plafond !== null && min < plafond ? (
          <span
            className="absolute inset-y-0 w-px bg-papier/70"
            style={{ left: `${pourcent(min, borne)}%` }}
            title={`minimum ${min} crédits`}
          />
        ) : null}
      </span>
      {perdus > 0 ? (
        <span
          className="block border-y border-r border-perdu/60 bg-perdu/50"
          style={{ width: `${Math.max(1.5, perdus * echelle)}%` }}
          title={`${perdus} crédits perdus au-delà du plafond`}
        />
      ) : null}
    </span>
  );
}

export function VueAudit() {
  const { audit, faits } = useEtat();
  const totalPerdus = audit.blocs.reduce((somme, bloc) => somme + bloc.creditsPerdus, 0);

  const segments = [
    {
      cle: "obligatoire",
      nom: "Obligatoire",
      exige: exige.obligatoire,
      compte: audit.creditsObligatoires,
    },
    {
      cle: "option",
      nom: "Option",
      exige: exige.exigeOption,
      compte: audit.creditsOption,
    },
    { cle: "choix", nom: "Au choix", exige: exige.choix, compte: audit.creditsChoix },
  ];

  return (
    <div className="px-5 py-6 sm:px-8">
      <header className="max-w-prose">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          Audit des blocs
        </h1>
        <p className="mt-2 text-doux">
          Ce que chaque bloc a reçu, ce qui lui manque, et ce qui dépasse son maximum —
          les crédits perdus, que les relevés ne comptent pas vers le diplôme.
        </p>
      </header>

      {/* LA BALANCE — le geste central de l'interface. */}
      <section className="mt-7 border border-trait bg-relief/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">
            Les {programme.creditsTotal} crédits du programme
          </h2>
          <p className="text-[12.5px] text-doux">
            <span className="chiffres text-papier">{audit.creditsTotal}</span> comptés,{" "}
            <span className="chiffres text-papier">
              {Math.max(0, programme.creditsTotal - audit.creditsTotal)}
            </span>{" "}
            à obtenir
            {totalPerdus > 0 ? (
              <>
                ,{" "}
                <span
                  className="chiffres text-perdu"
                  title="Crédits réussis au-delà du maximum d'un bloc : ils ne comptent pas vers le diplôme"
                >
                  {totalPerdus} perdus
                </span>
              </>
            ) : null}
          </p>
        </div>

        <div className="mt-4 flex items-stretch gap-1.5">
          {segments.map((segment) => (
            <div key={segment.cle} style={{ flexGrow: segment.exige, flexBasis: 0 }}>
              <p className="flex items-baseline gap-1.5 text-[11.5px]">
                <span className="min-w-0 truncate text-doux">{segment.nom}</span>
                <span className="chiffres shrink-0 text-papier">
                  {segment.compte}
                  <span className="text-faible">/{segment.exige}</span>
                </span>
              </p>
              <div
                className="relative mt-1 h-9 border border-trait bg-creux"
                title={`${segment.nom} : ${segment.compte} crédits comptés sur ${segment.exige} exigés`}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-fait/30 border-r border-fait/70"
                  style={{ width: `${pourcent(segment.compte, segment.exige)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Deuxième étage, aligné sous le segment « Option » : ce que les blocs
            réclament vraiment, et l'écart que personne ne réclame. */}
        <div className="mt-1.5 flex items-stretch gap-1.5">
          <div style={{ flexGrow: exige.obligatoire, flexBasis: 0 }} />
          <div style={{ flexGrow: exige.exigeOption, flexBasis: 0 }}>
            <div className="flex h-6">
              <div
                style={{ flexGrow: exige.minimumsOption, flexBasis: 0 }}
                className="flex items-center overflow-hidden border-l-2 border-traitfort bg-relief px-1.5"
                title={`Minimums des blocs d'option : ${exige.minimumsOption} crédits`}
              >
                <span className="truncate text-[10.5px] text-doux">
                  minimums des blocs : {exige.minimumsOption}
                </span>
              </div>
              <div
                style={{ flexGrow: exige.ecart, flexBasis: 0 }}
                className="hachure flex items-center overflow-hidden border-x border-avert/60 px-1.5"
                title={`${exige.ecart} crédits d'option exigés qu'aucun minimum de bloc ne réclame`}
              >
                <span className="truncate text-[10.5px] text-avert">
                  + {exige.ecart} sans minimum
                </span>
              </div>
            </div>
          </div>
          <div style={{ flexGrow: exige.choix, flexBasis: 0 }} />
        </div>

        <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-doux">
          Les quatre blocs d&apos;option n&apos;exigent ensemble que{" "}
          <span className="chiffres text-papier">{exige.minimumsOption}</span> crédits,
          alors que le programme en demande{" "}
          <span className="chiffres text-papier">{exige.exigeOption}</span> (
          {programme.creditsTotal} − {exige.obligatoire} obligatoires − {exige.choix} au
          choix). Les{" "}
          <span className="chiffres text-avert">{exige.ecart}</span> crédits de
          différence se placent dans n&apos;importe quel bloc d&apos;option resté sous son
          maximum. C&apos;est pourquoi « chaque bloc est conforme » ne veut pas dire
          « le diplôme est atteint ».
        </p>
      </section>

      {/* LES PLAFONDS — l'information que rien d'autre ne donne à l'étudiant :
          un bloc ne retient jamais plus que son maximum. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
          <h2 className="text-[15px] font-semibold">Plafonds des blocs d&apos;option</h2>
          <p className="chiffres text-[12px] text-faible">
            capacité {exige.capaciteOption} crédits pour {exige.exigeOption} à placer
          </p>
        </div>

        <ul className="mt-3 space-y-2.5">
          {programme.blocs
            .filter((bloc) => bloc.regle.type === "option")
            .map((bloc) => {
              const etat = audit.blocs.find((e) => e.idBloc === bloc.id);
              if (etat === undefined) return null;
              return (
                <li key={bloc.id} className="grid gap-x-3 gap-y-1 sm:grid-cols-[190px_1fr]">
                  <p className="text-[12.5px]">
                    <span className="chiffres text-papier">{bloc.id}</span>{" "}
                    <span className="text-doux">{bloc.nom}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <BarreBloc
                      retenus={etat.creditsAttribues}
                      perdus={etat.creditsPerdus}
                      min={minBloc(bloc.regle)}
                      plafond={maxBloc(bloc.regle)}
                      reference={exige.capaciteOptionMax}
                    />
                    <p className="chiffres shrink-0 text-[11.5px] text-doux">
                      {etat.creditsAttribues}
                      <span className="text-faible">/{maxBloc(bloc.regle) ?? "∞"}</span>
                      {etat.creditsPerdus > 0 ? (
                        <span className="text-perdu"> +{etat.creditsPerdus} perdus</span>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
        </ul>

        <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-doux">
          Les quatre blocs peuvent accueillir {exige.capaciteOption} crédits en tout,
          largement de quoi couvrir les {exige.exigeOption} exigés — mais aucun bloc ne
          retient plus que son propre maximum. Les {exige.exigeOption} crédits
          d&apos;option placés dans le seul bloc 75C n&apos;en donneraient que 27 vers le
          diplôme : les 6 autres seraient réussis, payés, et perdus. Le trait vertical
          marque le minimum du bloc, la barre rouge ce qui dépasse son plafond.
        </p>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
          <h2 className="text-[15px] font-semibold">
            {audit.conforme ? "Aucun problème" : `Problèmes (${audit.problemes.length})`}
          </h2>
          <p className="text-[12px] text-faible">
            {faits.size} cours marqué{faits.size === 1 ? "" : "s"} comme fait
            {faits.size === 1 ? "" : "s"}
          </p>
        </div>
        {audit.conforme ? (
          <p className="mt-3 border-l-2 border-fait/60 bg-fait/5 px-3 py-2 text-[13px] text-fait">
            Toutes les contraintes tiennent ensemble : chaque bloc dans ses bornes, et
            les totaux par type atteints.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {audit.problemes.map((probleme) => (
              <li
                key={probleme}
                className="border-l-2 border-perdu/60 bg-perdu/5 px-3 py-1.5 text-[13px] text-papier"
              >
                {probleme}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-9">
        <h2 className="border-b border-trait pb-2 text-[15px] font-semibold">
          Bloc par bloc
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[800px] max-w-[1120px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-trait text-left text-[11.5px] text-faible">
                <th className="py-1.5 pr-3 font-normal">Bloc</th>
                <th className="py-1.5 pr-3 font-normal">Règle publiée</th>
                <th className="py-1.5 pr-3 text-right font-normal">Placés</th>
                <th className="py-1.5 pr-3 text-right font-normal">Retenus</th>
                <th className="py-1.5 pr-3 font-normal">Remplissage</th>
                <th className="py-1.5 pr-3 text-right font-normal">Manquants</th>
                <th className="py-1.5 pr-3 text-right font-normal">Perdus</th>
                <th className="py-1.5 font-normal">Conformité</th>
              </tr>
            </thead>
            {programme.blocs.map((bloc) => {
              const etat = audit.blocs.find((e) => e.idBloc === bloc.id);
              if (etat === undefined) return null;
              return <LigneBloc key={bloc.id} idBloc={bloc.id} etat={etat} />;
            })}
          </table>
        </div>
        <p className="mt-2 max-w-prose text-[12px] text-faible">
          Un cours ne compte que dans un seul bloc. « Placés » est le total des cours
          rangés dans le bloc ; « retenus » est ce que le bloc donne vraiment au diplôme,
          une fois son plafond appliqué. Ouvrez une ligne pour voir les cours attribués.
        </p>
      </section>
    </div>
  );
}

function LigneBloc({ idBloc, etat }: { idBloc: string; etat: EtatBloc }) {
  const [ouvert, setOuvert] = useState(false);
  const bloc = programme.blocs.find((b) => b.id === idBloc)!;
  const min = minBloc(bloc.regle);
  const plafond = maxBloc(bloc.regle);
  const sansFiche = etat.coursAttribues.filter(
    (code) => ficheDe(catalogue, code) === undefined,
  ).length;

  return (
    <tbody className="border-b border-trait/60 align-top">
      <tr className={ouvert ? "bg-relief/60" : undefined}>
        <td className="py-2 pr-3">
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            aria-expanded={ouvert}
            className="text-left hover:text-papier"
          >
            <span className="chiffres text-papier">{idBloc}</span>
            <span className="block text-[12px] text-doux">{bloc.nom}</span>
          </button>
        </td>
        <td className="py-2 pr-3 text-[12px] text-doux">{bloc.regleBrut}</td>
        <td className="chiffres py-2 pr-3 text-right text-doux">
          {etat.creditsAttribues + etat.creditsPerdus}
        </td>
        <td className="chiffres py-2 pr-3 text-right text-papier">
          {etat.creditsAttribues}
        </td>
        <td className="w-[150px] py-2 pr-3">
          <BarreBloc
            retenus={etat.creditsAttribues}
            perdus={etat.creditsPerdus}
            min={min}
            plafond={plafond}
            reference={Math.max(plafond ?? min, min, 1)}
          />
        </td>
        <td className="chiffres py-2 pr-3 text-right">
          {etat.creditsManquants === 0 ? (
            <span className="text-faible">0</span>
          ) : (
            <span className="text-avert">{etat.creditsManquants}</span>
          )}
        </td>
        <td className="chiffres py-2 pr-3 text-right">
          {etat.creditsPerdus === 0 ? (
            <span className="text-faible">0</span>
          ) : (
            <span
              className="text-perdu"
              title="Crédits au-delà du maximum du bloc : ils ne comptent pas vers le diplôme"
            >
              {etat.creditsPerdus}
            </span>
          )}
        </td>
        <td className="py-2">
          <span
            className={`border px-2 py-0.5 text-[11.5px] ${
              etat.conforme
                ? "border-fait/50 bg-fait/10 text-fait"
                : "border-perdu/50 bg-perdu/10 text-perdu"
            }`}
          >
            {etat.conforme ? "dans ses bornes" : "hors bornes"}
          </span>
        </td>
      </tr>
      {ouvert ? (
        <tr className="bg-relief/60">
          <td colSpan={8} className="px-0 pb-3">
            {etat.coursAttribues.length === 0 ? (
              <p className="text-[12.5px] text-faible">
                Aucun cours attribué à ce bloc.
                {bloc.cours.length > 0
                  ? ` ${bloc.cours.length} cours y sont admissibles.`
                  : " Ce bloc accepte n'importe quel cours."}
              </p>
            ) : (
              <>
                <ul className="flex flex-wrap gap-1.5">
                  {etat.coursAttribues.map((code) => (
                    <li
                      key={code}
                      className={`flex items-center gap-2 border px-2 py-1 text-[12px] ${
                        ficheDe(catalogue, code) === undefined
                          ? "tirete border"
                          : "border-trait"
                      }`}
                    >
                      <span className="chiffres text-papier">{code}</span>
                      <span className="text-doux">
                        <TitreCours titre={ficheDe(catalogue, code)?.titre} />
                      </span>
                      <Credits
                        credits={creditsDe(catalogue, code)}
                        className="text-faible"
                      />
                    </li>
                  ))}
                </ul>
                {etat.creditsPerdus > 0 ? (
                  <p className="mt-2 border-l-2 border-perdu/60 pl-2.5 text-[12px] text-papier">
                    Ces cours totalisent{" "}
                    <span className="chiffres">
                      {etat.creditsAttribues + etat.creditsPerdus}
                    </span>{" "}
                    crédits, pour un plafond de <span className="chiffres">{plafond}</span>
                    . <span className="chiffres text-perdu">{etat.creditsPerdus}</span>{" "}
                    crédits réussis ne comptent pas vers le diplôme, et aucun relevé ne le
                    dira : il faut déplacer un cours vers un autre bloc d&apos;option, ou
                    accepter de les avoir payés pour rien.
                  </p>
                ) : null}
                {sansFiche > 0 ? (
                  <p className="mt-2 text-[12px] text-avert">
                    {sansFiche} de ces cours {sansFiche === 1 ? "n'a" : "n'ont"} pas de
                    fiche : {sansFiche === 1 ? "son poids" : "leur poids"} en crédits est
                    supposé, pas connu.
                  </p>
                ) : null}
              </>
            )}
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
