"use client";

/**
 * VUE 4 — LA PROCHAINE SESSION.
 *
 * Le seul écran de l'app dont le propos est de RÉPONDRE. Les trois autres
 * montrent un état et disent ce qu'ils ne peuvent pas vérifier ; celui-ci doit
 * dire « prends ces quatre-là ». La demande était explicite, et le mot était en
 * majuscules : voir SIMPLEMENT quels cours prendre.
 *
 * ## Comment on tient les deux bouts
 *
 * « Simplement » et « n'affirme rien de trop » tirent en sens contraires, et
 * quatre bandeaux de prudence rendraient cet écran-ci inutilisable. Le partage
 * retenu :
 *
 *  - **une phrase affirmative en haut**, avec un bouton qui l'applique ;
 *  - **les motifs sur chaque ligne**, courts et factuels, pour qu'on puisse
 *    être en désaccord avec l'ordre sans douter des faits ;
 *  - **les réserves repliées**, dans un `<details>` et dans des marques par
 *    ligne. Replier n'est pas cacher : le résumé porte sa phrase, il s'atteint
 *    au clavier, et ce qui disparaît est l'obligation de le relire à chaque
 *    visite.
 *
 * ## Pourquoi ce n'est pas un onglet de plus sur `/trimestres`
 *
 * `VuePlan` planifie un DIPLÔME : neuf colonnes, une réserve de 82 cours, et
 * l'étudiant décide de tout. C'est le bon outil pour la question « dans quel
 * ordre vais-je tout faire ». Il est mauvais pour « qu'est-ce que je prends en
 * janvier », qui est une décision unique, courte, et qui se reprend chaque
 * session. Les deux écrans écrivent dans le MÊME plan : rien n'est dupliqué,
 * c'est la même donnée vue à deux distances.
 *
 * ## L'état sans horaires n'est pas un cas limite
 *
 * `Cours.apercuHoraires` est optionnel, et l'absence est FRÉQUENTE même
 * maintenant que la collecte tourne : la majorité des fiches à jour rendent un
 * aperçu VIDE, parce que la page de cours ne publie pas d'horaire. L'écran doit
 * donc rester utile sans grille, et le dire — plutôt que d'afficher un
 * quadrillage vide qui ressemble à une panne.
 *
 * Le piège jumeau, et c'est le plus coûteux : « aucun chevauchement sur ce
 * qu'on connaît » et « on ne connaît rien » ne doivent JAMAIS rendre la même
 * couleur. Le second est majoritaire.
 */

import { useMemo, useState } from "react";
import { ficheDe } from "@/app/_lib/cours";
import { pluriel } from "@/app/_lib/francais";
import {
  composer,
  prochainTrimestre,
  suggererPourTrimestre,
  type Motif,
  type Suggestion,
} from "@/app/_lib/prochaine-session";
import { aLaSaison, cleTrimestre, horizon, libelleTrimestre } from "@/app/_lib/trimestres";
import type { CodeCours, Trimestre } from "@/lib/types";
import { GrilleSemaine, choisirSections } from "./GrilleSemaine";
import { TitreCours } from "./Etats";
import { useDonnees, useEtat } from "./ProviderEtat";
import { TeteEcran } from "./TeteEcran";

/** Charges proposées. 15 par défaut : c'est le temps plein usuel au premier
 *  cycle, et l'étudiant qui veut autre chose le voit d'un coup d'œil plutôt que
 *  d'avoir à taper un nombre. */
const CHARGES = [6, 9, 12, 15, 18] as const;

/** « à l'hiver 2027 ». `libelleTrimestre` rend « Hiver 2027 », et le mettre en
 *  minuscules derrière un « à » donne « à hiver 2027 » — les trois saisons
 *  élident, et `aLaSaison` porte déjà cette règle. */
function auTrimestre(t: Trimestre): string {
  return `${aLaSaison(t.saison)} ${t.annee}`;
}

export function VueSession() {
  const { plan, faits, placer, retirer } = useEtat();
  const { catalogue, programme, audit, diagnostics } = useDonnees();

  // L'horloge entre par la porte : `prochainTrimestre` la prend en paramètre, et
  // `useState` ne la relit pas à chaque rendu. Un `new Date()` dans le corps
  // rendrait ce composant non déterministe entre deux rendus de la même seconde.
  const [cible, setCible] = useState<Trimestre>(() => prochainTrimestre(new Date()));
  const [charge, setCharge] = useState<number>(15);
  /* La section retenue par cours. Locale et non persistée : elle ne vaut que
     pour le trimestre affiché, et une section mémorisée d'un autre trimestre ne
     se replie sur rien — les libellés sont verbatim et ne sont pas
     interchangeables. `choisirSections` retombe sur la première publiée quand
     le nom retenu n'existe pas ici. */
  const [sections, setSections] = useState<Record<string, string>>({});

  const choix = useMemo(() => horizon(cible, 6), [cible]);

  const suggestions = useMemo(
    () =>
      suggererPourTrimestre(programme, catalogue, audit, diagnostics, faits, plan, cible),
    [programme, catalogue, audit, diagnostics, faits, plan, cible],
  );

  const utiles = suggestions.filter((s) => !s.sansEffet);
  const sansEffet = suggestions.filter((s) => s.sansEffet);

  // Ce que l'étudiant a DÉJÀ retenu pour ce trimestre : lu du plan, jamais d'un
  // état local. Un état local ferait diverger cet écran de `/trimestres`, et
  // deux écrans qui se contredisent sur le même plan sont pires qu'un seul.
  const retenus = suggestions.filter((s) => plan[s.code] !== undefined);
  const creditsRetenus = retenus.reduce((somme, s) => somme + (s.credits ?? 0), 0);
  const retenusSansCredits = retenus.filter((s) => s.credits === null).length;

  const choixSections = useMemo(
    () =>
      choisirSections(
        retenus.map((s) => s.code),
        (code) => ficheDe(catalogue, code),
        cible,
        sections,
      ),
    [retenus, catalogue, cible, sections],
  );

  const proposition = useMemo(() => composer(utiles, charge), [utiles, charge]);
  const propositionNeuve = proposition.codes.filter((code) => plan[code] === undefined);

  function appliquer() {
    for (const code of proposition.codes) {
      if (plan[code] === undefined) placer(code, cible);
    }
  }

  function basculer(code: CodeCours) {
    if (plan[code] === undefined) placer(code, cible);
    else retirer(code);
  }

  return (
    <div className="ecran py-6">
      <TeteEcran
        titre="Prochaine session"
        fait={
          <>
            {programme.nom}
            {programme.orientation === null ? "" : ` — ${programme.orientation}`} ·{" "}
            <span className="chiffres">{utiles.length}</span> cours possibles{" "}
            {auTrimestre(cible)}
          </>
        }
        aide={
          <>
            <p>
              Un cours n&apos;apparaît ici que si les quatre conditions sont réunies : il
              est cité par un bloc de ce parcours, il n&apos;est ni fait ni déjà placé
              ailleurs, ses préalables sont satisfaits par ce qui est fait ou planifié{" "}
              <strong>avant</strong> cette session, et il est offert à cette saison.
            </p>
            <p className="mt-2">
              L&apos;ordre est une suggestion, pas un verdict : d&apos;abord ce qui
              débloque le plus d&apos;autres cours du parcours, puis ce qui n&apos;est
              offert qu&apos;à une seule saison, puis le bloc le plus près d&apos;être
              comblé. Chaque ligne porte ses motifs pour que vous puissiez être en
              désaccord avec l&apos;ordre sans douter des faits.
            </p>
            <p className="mt-2">
              Cocher un cours l&apos;inscrit dans le plan, exactement comme
              l&apos;onglet Trimestres — c&apos;est le même plan vu de plus près.
            </p>
          </>
        }
        actions={
          <label className="flex items-center gap-2 text-[12.5px] text-doux">
            Session
            <select
              value={cleTrimestre(cible)}
              onChange={(e) => {
                const trouve = choix.find((t) => cleTrimestre(t) === e.target.value);
                if (trouve !== undefined) setCible(trouve);
              }}
              aria-label="Trimestre à planifier"
              className="border border-trait bg-creux px-2 py-1 text-[12.5px] focus:border-traitfort focus:outline-none"
            >
              {choix.map((t) => (
                <option key={cleTrimestre(t)} value={cleTrimestre(t)}>
                  {libelleTrimestre(t)}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <Proposition
        proposition={proposition}
        neuve={propositionNeuve.length}
        charge={charge}
        onCharge={setCharge}
        onAppliquer={appliquer}
        aucune={utiles.length === 0}
        cible={cible}
      />

      <PanneauHoraire codes={retenus.map((s) => s.code)} cible={cible} />

      {retenus.length > 0 ? (
        <GrilleSemaine
          choix={choixSections}
          trimestre={cible}
          onSection={(code, section) =>
            setSections((avant) => ({ ...avant, [code]: section }))
          }
        />
      ) : null}

      <div className="mt-8">
        <section>
          <div className="flex items-baseline justify-between border-b border-trait pb-2">
            <h2 className="text-[14px] font-semibold">Cours possibles</h2>
            <p className="chiffres text-[11.5px] text-faible">
              {retenus.length} retenu{retenus.length === 1 ? "" : "s"} ·{" "}
              {creditsRetenus} crédit{creditsRetenus === 1 ? "" : "s"}
              {retenusSansCredits > 0
                ? ` + ${retenusSansCredits} sans crédits connus`
                : ""}
            </p>
          </div>

          {utiles.length === 0 ? (
            <p className="mt-3 text-[13px] text-doux">
              Aucun cours de ce parcours n&apos;est à la fois offert{" "}
              {auTrimestre(cible)} et débloqué par ce qui est déjà
              fait ou planifié. Essayez une autre session, ou vérifiez le relevé.
            </p>
          ) : (
            <ul className="mt-1">
              {utiles.map((s) => (
                <Ligne
                  key={s.code}
                  suggestion={s}
                  titre={ficheDe(catalogue, s.code)?.titre}
                  retenu={plan[s.code] !== undefined}
                  onBasculer={() => basculer(s.code)}
                />
              ))}
            </ul>
          )}

          {sansEffet.length > 0 ? (
            <details className="mt-4 border-t border-trait pt-3">
              <summary className="cursor-pointer list-none text-[12.5px] text-faible hover:text-doux [&::-webkit-details-marker]:hidden">
                {sansEffet.length} autre{sansEffet.length === 1 ? "" : "s"} cours
                offert{sansEffet.length === 1 ? "" : "s"} à cette session, mais dont les
                blocs sont déjà comblés →
              </summary>
              <p className="mt-2 text-[12px] leading-relaxed text-faible">
                Les suivre est permis ; leurs crédits ne compteraient pas vers le
                diplôme. Ils restent visibles parce que quelqu&apos;un les cherche
                peut-être exprès — les masquer déciderait à sa place.
              </p>
              <ul className="mt-2">
                {sansEffet.map((s) => (
                  <Ligne
                    key={s.code}
                    suggestion={s}
                    titre={ficheDe(catalogue, s.code)?.titre}
                    retenu={plan[s.code] !== undefined}
                    onBasculer={() => basculer(s.code)}
                  />
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/**
 * LA RÉPONSE, EN HAUT, AFFIRMATIVE.
 *
 * Une phrase et un bouton. C'est la seule partie de l'app qui prend une
 * décision à la place de l'étudiant, et elle ne la prend qu'en la lui rendant :
 * le bouton inscrit les cours dans le plan, où ils se décochent un par un.
 *
 * Les deux réserves qui comptent — crédits inconnus, conditions non vérifiées —
 * sont dans la phrase et non dans un bandeau. Un bandeau se lit une fois puis
 * devient du décor ; un chiffre dans la phrase se relit à chaque changement.
 */
function Proposition({
  proposition,
  neuve,
  charge,
  onCharge,
  onAppliquer,
  aucune,
  cible,
}: {
  proposition: ReturnType<typeof composer>;
  neuve: number;
  charge: number;
  onCharge: (n: number) => void;
  onAppliquer: () => void;
  aucune: boolean;
  cible: Trimestre;
}) {
  const n = proposition.codes.length;

  return (
    <section className="mt-5 border border-trait bg-relief/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[13.5px] font-semibold text-papier">
          {aucune || n === 0
            ? "Rien à proposer pour cette session"
            : `Proposition : ${n} cours ${auTrimestre(cible)}`}
        </h2>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-faible">
          Charge visée
          <select
            value={charge}
            onChange={(e) => onCharge(Number(e.target.value))}
            aria-label="Charge de crédits visée"
            className="chiffres border border-trait bg-creux py-0.5 pl-1.5 pr-6 text-[12px] focus:border-traitfort focus:outline-none"
          >
            {CHARGES.map((c) => (
              <option key={c} value={c}>
                {c} crédits
              </option>
            ))}
          </select>
        </label>
        {n > 0 ? (
          <button
            type="button"
            onClick={onAppliquer}
            disabled={neuve === 0}
            className="border border-traitfort px-2.5 py-1 text-[12.5px] text-papier transition-colors hover:bg-relief disabled:border-trait disabled:text-faible"
          >
            {neuve === 0 ? "Déjà au plan" : `Prendre ces ${n} cours`}
          </button>
        ) : null}
      </div>

      {n > 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-doux">
          <span className="chiffres text-papier">{proposition.codes.join(", ")}</span> —{" "}
          <span className="chiffres text-papier">{proposition.credits}</span> crédits
          {proposition.creditsInconnus > 0 ? (
            <>
              , plus{" "}
              <span className="chiffres text-papier">{proposition.creditsInconnus}</span>{" "}
              cours dont les crédits ne sont pas publiés
            </>
          ) : null}
          .{" "}
          {proposition.avecConditionsNonVerifiees > 0 ? (
            <>
              <span className="chiffres text-papier">
                {proposition.avecConditionsNonVerifiees}
              </span>{" "}
              {proposition.avecConditionsNonVerifiees === 1
                ? "porte une condition"
                : "portent une condition"}{" "}
              que l&apos;outil n&apos;a pas pu vérifier — marquée sur la ligne.{" "}
            </>
          ) : null}
          Les premiers de la liste qui tiennent dans la charge visée ; à vous de
          décocher.
        </p>
      ) : null}
    </section>
  );
}

/** Un motif, en trois mots. Les phrases longues appartiennent à l'aide repliée :
 *  ici ce sont des étiquettes qu'on balaie du regard sur vingt lignes. */
function EtiquetteMotif({ motif }: { motif: Motif }) {
  const texte =
    motif.genre === "saison-unique"
      ? `seulement à l'${motif.saison.toLowerCase() === "été" ? "été" : motif.saison.toLowerCase()}`
      : motif.genre === "debloque"
        ? `débloque ${motif.nombre} cours`
        : `bloc ${motif.idBloc} : ${motif.creditsManquants} cr à combler`;

  // La rareté prend l'ambre, le reste est neutre. Une étiquette sur deux en
  // couleur ne signale plus rien.
  const rare = motif.genre === "saison-unique";
  return (
    <span
      className={`whitespace-nowrap border px-1.5 py-px text-[11px] ${
        rare ? "border-avert/50 text-avert" : "border-trait text-faible"
      }`}
    >
      {texte}
    </span>
  );
}

function Ligne({
  suggestion,
  titre,
  retenu,
  onBasculer,
}: {
  suggestion: Suggestion;
  titre: string | undefined;
  retenu: boolean;
  onBasculer: () => void;
}) {
  const { code, credits, motifs, reserve, avertissements } = suggestion;
  const incertain = avertissements.length > 0 || reserve !== null;

  return (
    <li className="border-b border-trait/60 last:border-b-0">
      <label className="flex cursor-pointer items-start gap-2.5 py-2 hover:bg-relief/50">
        <input
          type="checkbox"
          checked={retenu}
          onChange={onBasculer}
          className="mt-0.5 accent-dispo"
          aria-label={`Retenir ${code} pour cette session`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="chiffres text-[12.5px] text-papier">{code}</span>
            <span className="chiffres text-[11.5px] text-faible">
              {credits === null ? "? cr" : `${credits} cr`}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-doux">
              <TitreCours titre={titre} />
            </span>
          </span>
          {motifs.length > 0 ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {motifs.map((motif, i) => (
                <EtiquetteMotif key={i} motif={motif} />
              ))}
            </span>
          ) : null}
          {incertain ? (
            /* Jamais masqué derrière un repli : c'est précisément sur CET écran
               qu'une condition non vérifiée coûte cher, puisqu'il recommande. */
            <span className="mt-1 block border-l-2 border-avert/50 pl-2 text-[11.5px] leading-snug text-faible">
              {reserve !== null ? <span className="block">{reserve}</span> : null}
              {avertissements.map((texte, i) => (
                <span key={i} className="block">
                  {texte}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </label>
    </li>
  );
}

/**
 * L'HORAIRE — et aujourd'hui, son absence.
 *
 * Quatre états que le contrat interdit de confondre, et l'écran les distingue :
 *
 *   pas de fiche          on ne sait rien de ce cours
 *   champ ABSENT          la fiche est antérieure à la collecte des horaires
 *   `[]`                  lu, et la page ne publie aucun horaire
 *   non vide              des séances existent, la grille se dessine
 *
 * AUCUN POURCENTAGE ICI, et c'est une correction. Ce commentaire portait
 * « 43 % des cas » à côté de `[]`, recopié du contrat de `Cours.apercuHoraires`
 * où `adrie-78` l'avait elle-même posé sans périmètre ni date — 43 % de quoi,
 * mesuré quand ? Elle l'a retiré de son contrat (`38f817a`) en écrivant qu'un
 * nombre irrésituable posé dans un contrat « se cite ensuite comme s'il avait
 * été mesuré là ». C'est exactement ce qui s'est passé : il avait atterri ici en
 * quelques heures. Le fait QUALITATIF suffit et ne se périme pas — l'aperçu vide
 * est fréquent, c'est pour ça qu'on le distingue du champ absent.
 *
 * ## La forme de la grille, et pourquoi le problème qu'on redoutait n'existe pas
 *
 * MESURÉ sur `data/cours/` le 2026-09-13, automne 2026, 2 441 fiches à horaire,
 * 400 tirages de charges de cinq cours, UNE section par cours. La passe de
 * collecte tournait pendant la mesure : les comptes de couverture bougeaient
 * donc, mais les rapports ci-dessous portent sur la structure interne de chaque
 * horaire et n'en dépendent pas.
 *
 * PORTÉE DE CE QUI SUIT, parce qu'elle explique un écart avec les chiffres qui
 * circulent : les cinq cours sont tirés dans TOUT le catalogue et non dans un
 * même programme. `adrie-71`, sur une charge réaliste — cinq cours d'un même
 * programme — trouve sept périodes brutes et quatre d'au moins une semaine. Son
 * premier chiffre, seize, empilait les séances de toutes les sections d'un
 * cours ; elle l'a corrigé elle-même. Les ordres de grandeur concordent une fois
 * les deux populations nommées, et c'est la SIENNE qui décrit un étudiant.
 *
 * On craignait de devoir dessiner une grille par période — de quoi rendre
 * l'écran illisible. Deux raisons pour lesquelles ce n'est pas nécessaire :
 *
 *  1. **40 % des séances ont une fenêtre de moins de sept jours.** Une fenêtre
 *     plus courte qu'une semaine ne peut pas contenir son jour deux fois : ce
 *     n'est pas une routine, c'est un ÉVÉNEMENT DATÉ — un examen, une séance
 *     unique. Le critère est exact et non un seuil choisi. Ces séances-là
 *     n'appartiennent pas à une grille hebdomadaire ; elles appartiennent à une
 *     liste de dates. À elles seules elles découpaient le trimestre deux fois
 *     par journée d'examen.
 *  2. **Près de la moitié des créneaux de routine sont des RÉPÉTITIONS du même
 *     cours, le même jour, à la même heure** — 4,8 sur 10,1 — seules leurs
 *     fenêtres diffèrent, parce que la page publie l'horaire par blocs de
 *     semaines autour des congés. `MAT 1400` tient mardi ET jeudi jusqu'au
 *     16/10 puis jeudi seul : deux formes de semaine, mais UN seul créneau du
 *     mardi. Compter les fenêtres revient à compter des périodes là où
 *     l'étudiant ne voit qu'une case.
 *
 * Une fois ces répétitions fusionnées, une charge de cinq cours occupe environ
 * **cinq cellules** (jour + heure distincts) et l'empilement maximal tombe à
 * **1,4** — une cellule tient un cours, exceptionnellement deux. C'est une
 * grille de sept jours parfaitement lisible, et c'est exactement ce qui a été
 * demandé.
 *
 * Aucun de ces nombres n'est lu par une ligne de code, et aucun ne doit être
 * écrit à l'écran : la forme robuste de l'énoncé est « environ quatre formes de
 * semaine, plus autant d'événements datés ». Elle survit aux corrections de
 * mesure, dont il y a déjà eu deux.
 *
 * LA GRILLE PORTE DONC SES DATES DANS SES CELLULES. 0,1 routine sur 10 couvre
 * cent jours ou plus : presque aucune séance ne court tout le trimestre, donc
 * une grille muette sur les dates affirmerait « toutes les semaines » et serait
 * fausse à peu près partout. Chaque bloc dit quand il a lieu, et la grille ne
 * promet jamais une semaine type — elle montre l'enveloppe, datée.
 *
 * Rien de tout ça n'est encore dessiné : la collecte était en cours au moment
 * où ces lignes sont écrites, et une grille éprouvée sur un horaire à moitié
 * écrit ne prouverait rien.
 */
function PanneauHoraire({ codes, cible }: { codes: CodeCours[]; cible: Trimestre }) {
  const { catalogue } = useDonnees();

  const etat = useMemo(() => {
    let publie = 0;
    let videConstate = 0;
    let jamaisRegarde = 0;
    let sansFiche = 0;
    for (const code of codes) {
      const f = ficheDe(catalogue, code);
      if (f === undefined) sansFiche += 1;
      else if (f.apercuHoraires === undefined) jamaisRegarde += 1;
      else if (f.apercuHoraires.length === 0) videConstate += 1;
      else publie += 1;
    }
    return { publie, videConstate, jamaisRegarde, sansFiche };
  }, [catalogue, codes]);

  if (codes.length === 0) {
    return (
      <p className="mt-6 border-t border-trait pt-3 text-[12.5px] text-doux">
        Retenez des cours pour voir ce qu&apos;ils donnent {auTrimestre(cible)}.
      </p>
    );
  }

  return (
    <p className="mt-6 border-t border-trait pt-3 text-[12px] leading-relaxed text-doux">
      Sur <span className="chiffres text-papier">{codes.length}</span> cours retenus :{" "}
      <span className="chiffres text-papier">{etat.publie}</span>{" "}
      {pluriel(etat.publie, "publie", "publient")} un aperçu d&apos;horaire,{" "}
      <span className="chiffres text-papier">{etat.videConstate}</span> n&apos;en{" "}
      {pluriel(etat.videConstate, "publie", "publient")} aucun,{" "}
      <span className="chiffres text-papier">{etat.jamaisRegarde}</span>{" "}
      {pluriel(etat.jamaisRegarde, "n'a", "n'ont")} pas été{" "}
      {pluriel(etat.jamaisRegarde, "regardé", "regardés")}
      {etat.sansFiche > 0 ? (
        <>
          , <span className="chiffres text-papier">{etat.sansFiche}</span>{" "}
          {pluriel(etat.sansFiche, "n'a", "n'ont")} pas de fiche
        </>
      ) : null}
      .{" "}
      {etat.videConstate + etat.jamaisRegarde + etat.sansFiche > 0 ? (
        <span className="text-faible">
          Ceux-là n&apos;apparaissent nulle part dans la semaine ci-dessous, et leur
          absence de conflit ne veut rien dire.
        </span>
      ) : null}
    </p>
  );
}
