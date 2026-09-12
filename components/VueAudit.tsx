"use client";

/**
 * VUE 2 — AUDIT DES BLOCS.
 *
 * La vue existe pour une raison arithmétique précise. Pour l'actuariat, les
 * minimums des blocs d'option totalisent 18 crédits alors que le programme en
 * exige 33 : un étudiant peut satisfaire CHAQUE bloc et ne pas diplômer. Aucun
 * relevé ne le dit, donc la balance du haut montre l'écart comme une aire
 * ouverte, hachurée.
 *
 * Deuxième information introuvable ailleurs : les crédits PERDUS. Au-delà du
 * maximum d'un bloc, un cours réussi ne compte pas vers le diplôme.
 *
 * ## Ce qui change en v2, et pourquoi
 *
 * La v1 écrivait « les quatre blocs d'option », « 90 − 54 − 3 » et « le seul
 * bloc 75C » en dur. C'était juste pour un programme et faux pour les 1 087
 * autres : certains ont deux blocs, d'autres trente, certains n'annoncent pas
 * de total de crédits, et beaucoup écrivent leurs exigences en INTERVALLES
 * (« de 30 à 33 à option »). Tout ce qui était un nombre écrit à la main est
 * maintenant calculé, et tout ce qui peut manquer a un affichage pour son
 * absence — « non annoncé », jamais 0, jamais « NaN ».
 */

import { useMemo, useState } from "react";
import {
  arithmetiqueProgramme,
  blocParCle,
  bornesBloc,
  creditsDe,
  ficheDe,
  libelleIntervalle,
  natureListe,
  type ArithmetiqueProgramme,
} from "@/app/_lib/cours";
import type { Bloc, Catalogue, EtatBloc, Intervalle, Programme } from "@/lib/types";
import { Credits, TitreCours } from "./Etats";
import { useDonnees } from "./ProviderEtat";

function pourcent(part: number, tout: number): number {
  if (!Number.isFinite(tout) || tout <= 0) return 0;
  return Math.max(0, Math.min(100, (part / tout) * 100));
}

/** Prose normative d'un bloc ou d'un programme, rendue VERBATIM.
 *  Elle existe dans le contrat pour être montrée : sans ce champ elle
 *  disparaissait au scrape, et avec un champ qu'on n'affiche pas elle
 *  disparaîtrait quand même. */
function Notes({ notes, titre }: { notes: string[]; titre: string }) {
  if (notes.length === 0) return null;
  return (
    <section className="mt-3">
      <h3 className="text-[12px] text-faible">{titre}</h3>
      <ul className="mt-1 space-y-1">
        {notes.map((note) => (
          <li
            key={note}
            className="border-l-2 border-trait pl-2.5 text-[12.5px] leading-relaxed text-doux"
          >
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
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
  bornes,
  reference,
}: {
  retenus: number;
  perdus: number;
  /** `null` quand la règle du bloc n'a pas été interprétée. */
  bornes: Intervalle | null;
  reference: number;
}) {
  if (bornes === null) {
    // Pas de bornes lues : pas de barre inventée. Un filet tireté dit
    // « inconnu », là où une barre vide dirait « zéro ».
    return (
      <span className="flex h-2.5 w-full items-center">
        <span className="tirete block h-2.5 w-full border" title="règle non interprétée" />
      </span>
    );
  }
  // 78 % de la largeur pour l'échelle, le reste en réserve pour le débordement.
  const echelle = reference > 0 ? 78 / reference : 0;
  const borne = Math.max(bornes.max, bornes.min, retenus, 1);
  return (
    <span className="flex h-2.5 w-full items-stretch">
      <span
        className="relative block border border-trait bg-creux"
        style={{ width: `${Math.max(2, bornes.max * echelle)}%` }}
      >
        <span
          className="absolute inset-y-0 left-0 bg-fait/60"
          style={{ width: `${pourcent(retenus, borne)}%` }}
        />
        {bornes.min > 0 && bornes.min < bornes.max ? (
          <span
            className="absolute inset-y-0 w-px bg-papier/70"
            style={{ left: `${pourcent(bornes.min, borne)}%` }}
            title={`minimum ${bornes.min} crédits`}
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

interface SegmentBalance {
  cle: string;
  nom: string;
  /** `null` quand rien n'annonce l'exigence de ce type. */
  exige: Intervalle | null;
  compte: number;
}

function LaBalance({
  programme,
  exige,
  segments,
  totalPerdus,
  comptes,
}: {
  programme: Programme;
  exige: ArithmetiqueProgramme;
  segments: SegmentBalance[];
  totalPerdus: number;
  comptes: number;
}) {
  // Largeur d'un segment : son exigence si elle est connue, sinon ce qui y est
  // compté. Jamais 0, sinon la colonne disparaît et l'étiquette avec elle.
  const poids = (segment: SegmentBalance): number =>
    Math.max(1, segment.exige?.max ?? segment.compte);

  const resteAObtenir =
    programme.creditsTotal === null ? null : Math.max(0, programme.creditsTotal - comptes);

  return (
    <section className="mt-7 border border-trait bg-relief/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">
          {programme.creditsTotal === null
            ? "Les crédits du programme (total non annoncé)"
            : `Les ${programme.creditsTotal} crédits du programme`}
        </h2>
        <p className="text-[12.5px] text-doux">
          <span className="chiffres text-papier">{comptes}</span> comptés
          {resteAObtenir === null ? null : (
            <>
              , <span className="chiffres text-papier">{resteAObtenir}</span> à obtenir
            </>
          )}
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
          <div key={segment.cle} style={{ flexGrow: poids(segment), flexBasis: 0 }}>
            <p className="flex items-baseline gap-1.5 text-[11.5px]">
              <span className="min-w-0 truncate text-doux">{segment.nom}</span>
              <span className="chiffres shrink-0 text-papier">
                {segment.compte}
                <span className="text-faible">
                  /{segment.exige === null ? "?" : libelleIntervalle(segment.exige)}
                </span>
              </span>
            </p>
            <div
              className={`relative mt-1 h-9 border bg-creux ${
                segment.exige === null ? "tirete" : "border-trait"
              }`}
              title={
                segment.exige === null
                  ? `${segment.nom} : ${segment.compte} crédits comptés ; aucune exigence annoncée`
                  : `${segment.nom} : ${segment.compte} crédits comptés sur ${libelleIntervalle(segment.exige)} exigés`
              }
            >
              {segment.exige === null ? null : (
                <div
                  className="absolute inset-y-0 left-0 border-r border-fait/70 bg-fait/30"
                  style={{ width: `${pourcent(segment.compte, segment.exige.min)}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Deuxième étage, aligné sous « Option » : ce que les blocs réclament
          vraiment, et l'écart que personne ne réclame bloc par bloc. */}
      {exige.ecart !== null && exige.ecart > 0 && exige.exigeOption !== null ? (
        <EtageEcart ecart={exige.ecart} exige={exige} segments={segments} poids={poids} />
      ) : null}

      <ExplicationEcart programme={programme} exige={exige} />
    </section>
  );
}

/** L'étage de l'écart, extrait pour que `ecart` soit un `number` prouvé et non
 *  un `number | null` réduit à la main dans un attribut de style. */
function EtageEcart({
  ecart,
  exige,
  segments,
  poids,
}: {
  ecart: number;
  exige: ArithmetiqueProgramme;
  segments: SegmentBalance[];
  poids: (segment: SegmentBalance) => number;
}) {
  return (
    <div className="mt-1.5 flex items-stretch gap-1.5">
          {segments.map((segment) =>
            segment.cle === "option" ? (
              <div key={segment.cle} style={{ flexGrow: poids(segment), flexBasis: 0 }}>
                <div className="flex h-6">
                  <div
                    style={{ flexGrow: Math.max(1, exige.minimumsOption), flexBasis: 0 }}
                    className="flex items-center overflow-hidden border-l-2 border-traitfort bg-relief px-1.5"
                    title={`Minimums des blocs d'option : ${exige.minimumsOption} crédits`}
                  >
                    <span className="truncate text-[10.5px] text-doux">
                      minimums des blocs : {exige.minimumsOption}
                    </span>
                  </div>
                  <div
                    style={{ flexGrow: ecart, flexBasis: 0 }}
                    className="hachure flex items-center overflow-hidden border-x border-avert/60 px-1.5"
                    title={`${ecart} crédits d'option exigés qu'aucun minimum de bloc ne réclame`}
                  >
                    <span className="truncate text-[10.5px] text-avert">
                      + {ecart} sans minimum
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={segment.cle}
                style={{ flexGrow: poids(segment), flexBasis: 0 }}
              />
            ),
      )}
    </div>
  );
}

/** Le texte qui dit l'écart — généré, jamais recopié. La v1 écrivait « les
 *  quatre blocs d'option » et « 90 − 54 − 3 » en dur. */
function ExplicationEcart({
  programme,
  exige,
}: {
  programme: Programme;
  exige: ArithmetiqueProgramme;
}) {
  const nbOption = programme.blocs.filter((b) => b.regle.type === "option").length;

  if (exige.exigeOption === null) {
    return (
      <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-doux">
        Ce programme n&apos;annonce ni total de crédits ni exigence par type, et la page
        ne dit donc pas combien de crédits d&apos;option sont requis. Les minimums de ses{" "}
        {nbOption} bloc{nbOption === 1 ? "" : "s"} d&apos;option totalisent{" "}
        <span className="chiffres text-papier">{exige.minimumsOption}</span> crédits,
        mais ce nombre n&apos;est pas l&apos;exigence du programme — on ne peut pas le
        déduire, et il n&apos;est pas inventé ici.
      </p>
    );
  }

  if (exige.ecart === null || exige.ecart <= 0) {
    return (
      <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-doux">
        Les minimums des {nbOption} bloc{nbOption === 1 ? "" : "s"} d&apos;option
        totalisent <span className="chiffres text-papier">{exige.minimumsOption}</span>{" "}
        crédits, pour{" "}
        <span className="chiffres text-papier">
          {libelleIntervalle(exige.exigeOption)}
        </span>{" "}
        exigés : satisfaire chaque bloc suffit donc à atteindre le total d&apos;option.
        {exige.origineOption === "deduit"
          ? " Cette exigence est déduite du total de crédits, pas lue sur la page."
          : null}
      </p>
    );
  }

  return (
    <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-doux">
      Les {nbOption} blocs d&apos;option n&apos;exigent ensemble que{" "}
      <span className="chiffres text-papier">{exige.minimumsOption}</span> crédits, alors
      que le programme en demande{" "}
      <span className="chiffres text-papier">{libelleIntervalle(exige.exigeOption)}</span>{" "}
      {exige.origineOption === "page" ? (
        <>
          (tel qu&apos;écrit sur la page :{" "}
          <span className="text-doux">« {programme.exigences?.brut} »</span>)
        </>
      ) : (
        <>
          ({programme.creditsTotal} au total − {exige.obligatoire.min} d&apos;obligatoires
          − {exige.choix.min} au choix — <em>déduit</em>, la page ne l&apos;écrit pas)
        </>
      )}
      . Les <span className="chiffres text-avert">{exige.ecart}</span> crédits de
      différence se placent dans n&apos;importe quel bloc d&apos;option resté sous son
      maximum. C&apos;est pourquoi « chaque bloc est conforme » ne veut pas dire « le
      diplôme est atteint ».
    </p>
  );
}

export function VueAudit() {
  const { catalogue, programme, audit, blocsIncoherents } = useDonnees();
  const exige = useMemo(() => arithmetiqueProgramme(programme), [programme]);

  const totalPerdus = audit.blocs.reduce((somme, bloc) => somme + bloc.creditsPerdus, 0);
  const blocsOption = programme.blocs.filter((bloc) => bloc.regle.type === "option");

  const segments: SegmentBalance[] = [
    {
      cle: "obligatoire",
      nom: "Obligatoire",
      exige: programme.exigences?.obligatoire ?? exige.obligatoire,
      compte: audit.creditsObligatoires,
    },
    {
      cle: "option",
      nom: "Option",
      exige: exige.exigeOption,
      compte: audit.creditsOption,
    },
    {
      cle: "choix",
      nom: "Au choix",
      exige: programme.exigences?.choix ?? exige.choix,
      compte: audit.creditsChoix,
    },
  ];

  return (
    <div className="px-5 py-6 sm:px-8">
      <header className="max-w-prose">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          Audit des blocs
        </h1>
        <p className="mt-1.5 text-[13px] text-doux">
          {programme.nom}
          {programme.orientation === null
            ? ""
            : `, orientation ${programme.orientation.toLowerCase()}`}{" "}
          — <span className="chiffres">{programme.blocs.length}</span> bloc
          {programme.blocs.length === 1 ? "" : "s"} sur{" "}
          <span className="chiffres">{programme.segments.length}</span> segment
          {programme.segments.length === 1 ? "" : "s"} (
          {programme.segments.join(", ") || "non annoncés"}).
        </p>
        <p className="mt-2 text-doux">
          Ce que chaque bloc a reçu, ce qui lui manque, et ce qui dépasse son maximum —
          les crédits perdus, que les relevés ne comptent pas vers le diplôme.
        </p>
      </header>

      {programme.exigences !== null ? (
        <p className="mt-4 max-w-prose border-l-2 border-traitfort pl-2.5 text-[12.5px] text-doux">
          Exigences telles qu&apos;écrites sur la page :{" "}
          <span className="text-papier">« {programme.exigences.brut} »</span>
        </p>
      ) : null}

      <LaBalance
        programme={programme}
        exige={exige}
        segments={segments}
        totalPerdus={totalPerdus}
        comptes={audit.creditsTotal}
      />

      {/* LES RÈGLES NON LUES — un bloc dont la règle n'a pas été interprétée ne
          disparaît pas d'une somme en silence. */}
      {exige.blocsInconnus.length > 0 ? (
        <section className="mt-8">
          <h2 className="border-b border-avert/40 pb-2 text-[15px] font-semibold text-avert">
            {exige.blocsInconnus.length} bloc
            {exige.blocsInconnus.length === 1 ? "" : "s"} dont la règle n&apos;a pas été
            lue
          </h2>
          <ul className="mt-3 space-y-1.5">
            {exige.blocsInconnus.map((bloc) => (
              <li key={bloc.cle} className="text-[12.5px]">
                <span className="chiffres text-papier">{bloc.id}</span>{" "}
                <span className="text-doux">
                  règle publiée : « {bloc.regleBrut || "aucune"} »
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-prose text-[12px] text-faible">
            Leurs crédits n&apos;entrent dans aucun total ci-dessus, et le programme ne
            peut pas être déclaré conforme tant qu&apos;ils sont là. C&apos;est voulu :
            une règle inconnue traitée comme « aucune exigence » rendrait l&apos;audit
            faux sans qu&apos;aucun test échoue.
          </p>
        </section>
      ) : null}

      {/* LES PLAFONDS — l'information que rien d'autre ne donne à l'étudiant :
          un bloc ne retient jamais plus que son maximum. */}
      {blocsOption.length > 0 ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
            <h2 className="text-[15px] font-semibold">
              Plafonds des {blocsOption.length} bloc{blocsOption.length === 1 ? "" : "s"}{" "}
              d&apos;option
            </h2>
            <p className="chiffres text-[12px] text-faible">
              capacité {exige.capaciteOption} crédits pour{" "}
              {exige.exigeOption === null
                ? "un total non annoncé"
                : `${libelleIntervalle(exige.exigeOption)} à placer`}
            </p>
          </div>

          <ul className="mt-3 space-y-2.5">
            {blocsOption.map((bloc) => {
              const etat = audit.blocs.find((e) => e.cleBloc === bloc.cle);
              if (etat === undefined) return null;
              const bornes = bornesBloc(bloc.regle);
              return (
                <li
                  key={bloc.cle}
                  className="grid gap-x-3 gap-y-1 sm:grid-cols-[190px_1fr]"
                >
                  <p className="text-[12.5px]">
                    <span className="chiffres text-papier">{bloc.id}</span>{" "}
                    <span className="text-doux">
                      {bloc.nom === "" ? (
                        <span className="text-faible italic">sans nom sur la page</span>
                      ) : (
                        bloc.nom
                      )}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <BarreBloc
                      retenus={etat.creditsAttribues}
                      perdus={etat.creditsPerdus}
                      bornes={bornes}
                      reference={exige.capaciteOptionMax}
                    />
                    <p className="chiffres shrink-0 text-[11.5px] text-doux">
                      {etat.creditsAttribues}
                      <span className="text-faible">/{bornes?.max ?? "?"}</span>
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
            Ces blocs peuvent accueillir {exige.capaciteOption} crédits en tout, mais
            aucun ne retient plus que son propre maximum. Empiler tous les crédits
            d&apos;option dans le bloc le plus large n&apos;en donnerait que{" "}
            <span className="chiffres">{exige.capaciteOptionMax}</span> vers le diplôme :
            le reste serait réussi, payé, et perdu. Le trait vertical marque le minimum
            du bloc, la barre rouge ce qui dépasse son plafond.
          </p>
        </section>
      ) : null}

      {/* LE VERDICT, PUIS CE QUE L'AUDIT SIGNALE — et les deux ne sont pas la
          même chose.

          Cette section rendait `problemes` UNIQUEMENT quand l'audit n'était pas
          conforme, et affichait « Aucun problème » sinon. Or `Audit.problemes`
          n'est pas une liste d'échecs : le moteur y verse aussi ce qu'il n'a pas
          su vérifier — blocs à contenu ouvert, cours faits sans fiche (crédits
          comptés 0), exclusions de sigle que 47 programmes portent et qu'une
          dérogation peut lever. Un parcours parfaitement conforme peut donc en
          porter plusieurs, et elles étaient AVALÉES précisément au moment où
          l'écran disait que tout allait bien. C'est le défaut qui revient dans
          ce projet : un vert qui recouvre un « invérifiable ».

          Le verdict garde donc sa couleur, et la liste s'affiche dans les deux
          cas. Elle n'est pas colorée en rouge : le moteur ne distingue pas dans
          `problemes` ce qui bloque de ce qu'il n'a pas pu vérifier, et l'écran
          ne prétend pas le savoir — il le dit. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
          <h2 className="text-[15px] font-semibold">
            {audit.problemes.length === 0
              ? "Rien à signaler"
              : `Ce que l'audit signale (${audit.problemes.length})`}
          </h2>
          <p className="text-[12px] text-faible">
            {audit.blocs.length} bloc{audit.blocs.length === 1 ? "" : "s"} audité
            {audit.blocs.length === 1 ? "" : "s"}
          </p>
        </div>

        <p
          className={`mt-3 border-l-2 px-3 py-2 text-[13px] ${
            audit.conforme
              ? "border-fait/60 bg-fait/5 text-fait"
              : "border-perdu/60 bg-perdu/5 text-papier"
          }`}
        >
          {audit.conforme
            ? "Toutes les contraintes tiennent ensemble : chaque bloc dans ses bornes, et les totaux par type atteints."
            : "Au moins une contrainte ne tient pas : un bloc hors de ses bornes, ou un total par type non atteint."}
        </p>

        {audit.problemes.length > 0 ? (
          <>
            <p className="mt-3 max-w-prose text-[12.5px] leading-relaxed text-doux">
              {audit.conforme
                ? "Le verdict ci-dessus est favorable, et ces points restent à vérifier vous-même : l'audit les a rencontrés sans pouvoir conclure."
                : "Ces lignes mélangent ce qui bloque et ce que l'audit n'a pas pu vérifier."}{" "}
              Le moteur ne les distingue pas dans sa liste, donc cet écran ne le
              prétend pas : lisez-les une par une plutôt que de les compter.
            </p>
            <ul className="mt-2 space-y-1.5">
              {audit.problemes.map((probleme) => (
                <li
                  key={probleme}
                  className="border-l-2 border-avert/60 bg-avert/5 px-3 py-1.5 text-[13px] text-papier"
                >
                  {probleme}
                </li>
              ))}
            </ul>
          </>
        ) : null}
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
            {/* Clé et recherche par `cle`, jamais par `id` : deux blocs d'un même
                programme peuvent porter le même `id` (`MM-Bloc 73A` et
                `S-Bloc 73A`), et React comme `find` prendraient le premier des
                deux sans rien signaler. */}
            {audit.blocs.map((etat) => {
              const bloc = blocParCle(programme, etat.cleBloc);
              if (bloc === undefined) return null;
              return (
                <LigneBloc
                  key={etat.cleBloc}
                  bloc={bloc}
                  etat={etat}
                  catalogue={catalogue}
                  incoherent={blocsIncoherents.has(etat.cleBloc)}
                />
              );
            })}
          </table>
        </div>
        <p className="mt-2 max-w-prose text-[12px] text-faible">
          Un cours ne compte que dans un seul bloc. « Placés » est le total des cours
          rangés dans le bloc ; « retenus » est ce que le bloc donne vraiment au diplôme,
          une fois son plafond appliqué. Ouvrez une ligne pour voir les cours attribués
          et les remarques de la page.
        </p>
      </section>

      <Notes notes={programme.notes} titre="Remarques de la page du programme" />
    </div>
  );
}

function LigneBloc({
  bloc,
  etat,
  catalogue,
  incoherent,
}: {
  bloc: Bloc;
  etat: EtatBloc;
  catalogue: Catalogue;
  /** La PAGE de ce bloc annonce un minimum que ses propres cours ne peuvent pas
   *  atteindre. Vient du marqueur `clesBlocsIncoherents()` du moteur, jamais
   *  d'une déduction locale : toute conjonction sur `conforme` et
   *  `creditsManquants` qui « se trouve » discriminante aujourd'hui avalerait en
   *  silence le prochain cas. Le marqueur s'abstient quand c'est une FICHE qui
   *  nous manque — on n'accuse pas la page d'un trou de notre scrape. */
  incoherent: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const bornes = bornesBloc(bloc.regle);
  const nature = natureListe(bloc);
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
            <span className="chiffres text-papier">{bloc.id}</span>
            <span className="block text-[12px] text-doux">
              {bloc.nom === "" ? (
                <span className="text-faible italic">sans nom</span>
              ) : (
                bloc.nom
              )}
            </span>
            <span className="chiffres block text-[11px] text-faible">
              segment {bloc.segment}
            </span>
          </button>
        </td>
        <td className="py-2 pr-3 text-[12px] text-doux">
          {bloc.regleBrut === "" ? (
            <span className="text-faible italic">aucune règle publiée</span>
          ) : (
            bloc.regleBrut
          )}
          {bornes === null ? (
            <span className="mt-0.5 block text-[11.5px] text-avert">
              règle non interprétée
            </span>
          ) : null}
          {/* Un bloc à contenu ouvert est INVÉRIFIABLE : l'audit ne doit ni le
              déclarer satisfait, ni le traiter comme une exigence impossible.
              Il doit le dire — le filet tireté porte l'état sans la couleur. */}
          {nature === "ouvert" ? (
            <span className="tirete mt-1 inline-block border px-1.5 py-px text-[11.5px] text-avert">
              contenu décrit en prose — invérifiable
            </span>
          ) : null}
        </td>
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
            bornes={bornes}
            reference={Math.max(bornes?.max ?? 1, 1)}
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
          {/* Un bloc à contenu ouvert n'est NI conforme NI non conforme : il est
              invérifiable. Le moteur, lui, le voit comme un bloc d'option sans
              cours ; quand son minimum est 0 il le déclare « dans ses bornes »,
              en vert. Afficher ce vert à côté de « invérifiable » serait se
              contredire sur la même ligne, et c'est le vert que l'étudiant
              retiendrait.

              MÊME RAISON POUR « page incohérente », le troisième état non
              binaire de cette colonne. Le motif dépend du relevé, et c'est ce
              qui rend cet état nécessaire dans LES DEUX cas.

              Le moteur plafonne la dette à ce que le bloc peut réellement
              donner : `min(annoncé, capacité) − acquis`. Musique 01/01A annonce
              15 crédits et n'en offre que 12, donc il réclame 12 sur un relevé
              vide et 0 sur un relevé complet. Mesuré sur les 14 blocs marqués
              du catalogue, relevé vide : aucun ne réclame 0 — c'est l'état par
              défaut de cet écran.

              Les deux bouts sont illisibles pour la même raison de fond, et
              aucun ne se répare en s'inscrivant à quoi que ce soit :

                relevé vide     « Obligatoire - 15 crédits » dans la colonne
                                voisine, 12 réclamés ici, et rien n'explique
                                l'écart — l'étudiant lit une dette qu'il croit
                                pouvoir combler, alors que le bloc n'offre rien
                                de plus ;
                relevé complet  0 réclamé à côté d'une croix rouge — « rien ne
                                manque, et pourtant c'est raté ».

              La faute est à la page, qui exige plus que ses propres cours ne
              totalisent, et la ligne doit le dire là où on la lit — pas
              seulement dans la liste globale, vingt lignes plus haut. */}
          <span
            className={`border px-2 py-0.5 text-[11.5px] ${
              bornes === null || nature === "ouvert" || incoherent
                ? "tirete border text-avert"
                : etat.conforme
                  ? "border-fait/50 bg-fait/10 text-fait"
                  : "border-perdu/50 bg-perdu/10 text-perdu"
            }`}
            title={
              incoherent
                ? "Le minimum annoncé par la page dépasse ce que les cours du bloc totalisent : c'est la page qui est incohérente, pas votre parcours."
                : undefined
            }
          >
            {bornes === null
              ? "non concluant"
              : nature === "ouvert"
                ? "invérifiable"
                : incoherent
                  ? "page incohérente"
                  : etat.conforme
                    ? "dans ses bornes"
                    : "hors bornes"}
          </span>
        </td>
      </tr>
      {ouvert ? (
        <tr className="bg-relief/60">
          <td colSpan={8} className="px-0 pb-3">
            {etat.coursAttribues.length === 0 ? (
              <p className="text-[12.5px] text-faible">
                Aucun cours attribué à ce bloc.
                {nature === "enumere"
                  ? ` ${bloc.cours.length} cours y sont admissibles.`
                  : nature === "joker"
                    ? " Ce bloc accepte n'importe quel cours."
                    : nature === "ouvert"
                      ? " Son contenu n'est décrit qu'en prose : voyez les remarques ci-dessous."
                      : " Aucun cours n'y est listé et la page n'en dit rien : données incomplètes."}
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
                    crédits, pour un plafond de{" "}
                    <span className="chiffres">{bornes?.max ?? "?"}</span>.{" "}
                    <span className="chiffres text-perdu">{etat.creditsPerdus}</span>{" "}
                    crédits réussis ne comptent pas vers le diplôme, et aucun relevé ne
                    le dira : il faut déplacer un cours vers un autre bloc d&apos;option,
                    ou accepter de les avoir payés pour rien.
                  </p>
                ) : null}
                {sansFiche > 0 ? (
                  <p className="mt-2 text-[12px] text-avert">
                    {sansFiche} de ces cours {sansFiche === 1 ? "n'a" : "n'ont"} pas de
                    fiche : {sansFiche === 1 ? "son poids" : "leur poids"} en crédits est
                    inconnu, donc compté comme 0 — le verdict est au pire trop sévère.
                  </p>
                ) : null}
              </>
            )}
            <Notes notes={bloc.notes} titre="Remarques de la page pour ce bloc" />
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
