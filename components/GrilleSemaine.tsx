"use client";

/**
 * LA SEMAINE, DESSINÉE — la seconde moitié de ce qu'Adrien a demandé.
 *
 * « Voir à quoi ça ressemblerait sur un horaire de 7 jours, vérifier conflits
 * d'horaire. » La grille répond à la première partie, le moteur de
 * `lib/engine/horaires.ts` à la seconde, et ce composant les met côte à côte.
 *
 * ## Il ne lit pas les séances lui-même, et c'est une couture, pas une manie
 *
 * Deux projections différentes de la même donnée donneraient une grille SANS
 * conflit et un verdict qui en annonce un — sans qu'aucun test ne tombe, parce
 * que chacun serait juste de son côté. Le choix de section passe donc par
 * `seancesDeSection()` de `lib/horaires.ts`, le seul endroit qui projette, et le
 * moteur de conflits reçoit exactement le même nom de section.
 *
 * `seancesDeSection()` LÈVE plutôt que de rendre `[]` — sa garde est juste, un
 * tableau vide se lirait « aucune séance, donc aucun conflit ». Mais une
 * exception pendant un rendu remplace l'écran par une page blanche. On ne
 * l'appelle donc QUE sur une section que `sectionsDuTrimestre()` vient de
 * nommer : la question est posée avant, jamais provoquée.
 *
 * ## Ce que la grille ne dira jamais
 *
 * « Aucun chevauchement sur ce qu'on connaît » et « on ne connaît rien » ne
 * rendent pas la même couleur, et c'est la règle qui a le plus compté ici. La
 * majorité des fiches à jour rendent un aperçu VIDE — la page de cours ne
 * publie pas d'horaire — donc le cas « rien à dessiner » est le cas courant, pas
 * la marge. Une grille vide silencieuse se lirait comme un horaire sans
 * conflit.
 */

import { useMemo } from "react";
import {
  construireGrille,
  fenetreLisible,
  finArrondie,
  heure,
  jourLisible,
  type CaseGrille,
  type Fenetre,
  type Inscription,
} from "@/app/_lib/grille-semaine";
import { sectionsDuTrimestre, seancesDeSection } from "@/lib/horaires";
import {
  RESERVE_APERCU,
  chevauchementsDeSelection,
  conflitsEntreCours,
  incoherencesDeCours,
  type Chevauchement,
} from "@/lib/engine/horaires";
import type { CodeCours, Cours, Trimestre } from "@/lib/types";

/** Hauteur d'une tranche de trente minutes. Assez pour qu'un cours de deux
 *  heures porte son code, sa section et ses dates sans rogner. */
const PAS_MIN = 30;
const HAUTEUR_PAS = 22;

export interface Choix {
  code: CodeCours;
  fiche: Cours | undefined;
  section: string | null;
  sections: string[];
}

/**
 * Les sections disponibles par cours, et celle qui est retenue.
 *
 * `null` quand aucune section n'est publiée pour ce trimestre — un état
 * distinct de « la première », parce qu'il veut dire qu'il n'y a rien à
 * projeter. Le calcul est ici et non dans le composant d'affichage pour que
 * `VueSession` puisse le passer au moteur de conflits sans le refaire.
 */
export function choisirSections(
  codes: CodeCours[],
  fiche: (code: CodeCours) => Cours | undefined,
  trimestre: Trimestre,
  retenues: Record<string, string>,
): Choix[] {
  return codes.map((code) => {
    const f = fiche(code);
    const sections = sectionsDuTrimestre(f?.apercuHoraires, trimestre);
    const demandee = retenues[code];
    // La section retenue doit exister ICI : les libellés sont verbatim et ne
    // sont pas interchangeables, donc un nom mémorisé d'un autre trimestre ne
    // se replie sur rien. On retombe sur la première publiée plutôt que de
    // lever, et l'écran montre le sélecteur.
    const section =
      demandee !== undefined && sections.includes(demandee)
        ? demandee
        : (sections[0] ?? null);
    return { code, fiche: f, section, sections };
  });
}

export function GrilleSemaine({
  choix,
  trimestre,
  onSection,
}: {
  choix: Choix[];
  trimestre: Trimestre;
  onSection: (code: CodeCours, section: string) => void;
}) {
  const inscriptions = useMemo<Inscription[]>(
    () =>
      choix.flatMap((c) =>
        c.section === null
          ? []
          : [
              {
                code: c.code,
                section: c.section,
                // Sûr : `c.section` vient de `sectionsDuTrimestre`, donc la
                // garde de `seancesDeSection` ne peut pas se déclencher.
                seances: seancesDeSection(c.fiche?.apercuHoraires, trimestre, c.section),
              },
            ],
      ),
    [choix, trimestre],
  );

  const grille = useMemo(() => construireGrille(inscriptions), [inscriptions]);

  const tous = useMemo(
    () =>
      chevauchementsDeSelection(
        choix
          .filter((c) => c.section !== null)
          .map((c) => ({
            code: c.code,
            apercus: c.fiche?.apercuHoraires,
            trimestre,
            nomSection: c.section as string,
          })),
      ),
    [choix, trimestre],
  );
  const conflits = useMemo(() => conflitsEntreCours(tous), [tous]);
  const incoherences = useMemo(() => incoherencesDeCours(tous), [tous]);
  const indetermines = useMemo(() => tous.filter((c) => c.etat === "indetermine"), [tous]);

  /** Les codes impliqués dans un conflit, pour peindre leurs cases. Un `Set` de
   *  `code|section|jour|debut` plutôt que du code seul : un cours en conflit le
   *  mardi ne l'est pas forcément le jeudi, et teindre toutes ses cases ferait
   *  chercher le problème au mauvais endroit. */
  const enConflit = useMemo(() => {
    const marques = new Set<string>();
    for (const c of conflits) {
      if (c.etat !== "chevauche") continue;
      for (const ref of [c.a, c.b]) {
        const cr = ref.seance.creneau;
        if (cr.genre !== "attribue") continue;
        marques.add(`${ref.code}|${ref.section}|${cr.jour}|${cr.debutMin}`);
      }
    }
    return marques;
  }, [conflits]);

  const sansSection = choix.filter((c) => c.section === null);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-trait pb-2">
        <h2 className="text-[14px] font-semibold">Semaine</h2>
        <p className="text-[11.5px] text-faible">
          {grille.cases.length === 0
            ? "aucun créneau hebdomadaire à dessiner"
            : `${grille.cases.length} créneau${grille.cases.length === 1 ? "" : "x"} hebdomadaire${grille.cases.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <Verdict
        conflits={conflits}
        incoherences={incoherences}
        indetermines={indetermines}
        aDesCases={grille.cases.length > 0}
      />

      {grille.cases.length > 0 && grille.bornes !== null ? (
        <>
          {grille.fenetresDominantes !== null ? (
            <p className="mt-3 text-[12px] text-doux">
              La plupart de ces créneaux ont lieu{" "}
              <span className="text-papier">
                {grille.fenetresDominantes.map((f: Fenetre) => fenetreLisible(f)).join(", puis ")}
              </span>
              . Seules les cases qui s&apos;en écartent portent leurs propres dates.
            </p>
          ) : null}
          <Quadrillage grille={grille} enConflit={enConflit} />
          <DatesAPart grille={grille} />
        </>
      ) : null}

      <Sections choix={choix} onSection={onSection} />

      {grille.evenements.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-[13px] font-semibold text-papier">
            Séances à date fixe ({grille.evenements.length})
          </h3>
          <p className="mt-1 text-[11.5px] text-faible">
            Elles n&apos;ont lieu qu&apos;une fois — examens, séances uniques — donc
            elles ne sont pas dans la grille : une case hebdomadaire leur prêterait un
            rendez-vous qui ne revient pas.
          </p>
          <ul className="mt-2 space-y-1">
            {grille.evenements.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 text-[12px] text-doux">
                <span className="chiffres text-papier">{e.code}</span>
                <span className="text-faible">section {e.section}</span>
                <span>
                  {e.jour} {jourLisible(e.du)}
                  {e.du === e.au ? "" : ` – ${jourLisible(e.au)}`}
                </span>
                <span className="chiffres text-faible">
                  {heure(e.debutMin)} – {finArrondie(e.finMin)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {grille.sansCreneau.length > 0 ? (
        <div className="mt-5 border-l-2 border-avert/50 pl-3">
          <h3 className="text-[13px] font-semibold text-papier">
            {grille.sansCreneau.length} séance
            {grille.sansCreneau.length === 1 ? "" : "s"} sans jour ni heure
          </h3>
          <p className="mt-1 text-[11.5px] leading-relaxed text-faible">
            Elles existent et ne sont nulle part ci-dessus. Les taire ferait croire à
            une semaine plus légère qu&apos;elle ne l&apos;est.
          </p>
          <ul className="mt-2 space-y-1">
            {grille.sansCreneau.map((s, i) => (
              <li key={i} className="text-[12px] leading-snug text-doux">
                <span className="chiffres text-papier">{s.code}</span>{" "}
                <span className="text-faible">section {s.section}</span> — {s.motif}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sansSection.length > 0 ? (
        <p className="mt-4 text-[12px] leading-relaxed text-faible">
          <span className="chiffres text-papier">{sansSection.length}</span> cours ne
          publie{sansSection.length === 1 ? "" : "nt"} aucune section pour ce
          trimestre :{" "}
          <span className="chiffres">{sansSection.map((c) => c.code).join(", ")}</span>.
          Ils n&apos;entrent dans aucune comparaison ci-dessus — leur absence de conflit
          ne veut donc rien dire.
        </p>
      ) : null}

      <p className="mt-4 border-t border-trait pt-2 text-[11.5px] leading-relaxed text-faible">
        {RESERVE_APERCU}
      </p>
    </section>
  );
}

/**
 * LE VERDICT, EN UNE LIGNE — et trois lignes possibles, jamais deux.
 *
 * « Aucun chevauchement » n'est pas « rien à comparer ». Le second est le cas
 * majoritaire, et lui donner la couleur du premier serait le repli rassurant :
 * celui qui coûte une session à l'étudiant.
 */
function Verdict({
  conflits,
  incoherences,
  indetermines,
  aDesCases,
}: {
  conflits: Chevauchement[];
  incoherences: Chevauchement[];
  indetermines: Chevauchement[];
  aDesCases: boolean;
}) {
  const durs = conflits.filter((c) => c.etat === "chevauche");

  return (
    <div className="mt-3 space-y-2">
      {durs.length > 0 ? (
        <div className="border-l-2 border-perdu bg-perdu/10 px-3 py-2">
          <p className="text-[13px] font-semibold text-perdu">
            {durs.length} chevauchement{durs.length === 1 ? "" : "s"} entre deux cours
          </p>
          <ul className="mt-1 space-y-1">
            {durs.map((c, i) => (
              <li key={i} className="text-[12px] leading-snug text-doux">
                <span className="chiffres text-papier">
                  {c.a.code} {c.a.section}
                </span>{" "}
                et{" "}
                <span className="chiffres text-papier">
                  {c.b.code} {c.b.section}
                </span>
                {c.recouvrement !== undefined ? (
                  <>
                    {" "}
                    — {c.recouvrement.jour.toLowerCase()} de{" "}
                    <span className="chiffres">{heure(c.recouvrement.debutMin)}</span> à{" "}
                    <span className="chiffres">{finArrondie(c.recouvrement.finMin)}</span>
                    , {fenetreLisible({ du: c.recouvrement.du, au: c.recouvrement.au })}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : aDesCases && indetermines.length === 0 ? (
        <p className="border-l-2 border-fait/60 px-3 py-1.5 text-[12.5px] text-doux">
          Aucun chevauchement entre ces cours dans l&apos;aperçu publié.
        </p>
      ) : null}

      {incoherences.length > 0 ? (
        <div className="border-l-2 border-avert/60 px-3 py-1.5">
          <p className="text-[12.5px] text-doux">
            <span className="chiffres text-papier">{incoherences.length}</span> séance
            {incoherences.length === 1 ? "" : "s"} d&apos;un même cours se recouvre
            {incoherences.length === 1 ? "" : "nt"}.
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-faible">
            Ce n&apos;est pas un choix à faire : c&apos;est la page du cours qui se
            contredit, et vous n&apos;y pouvez rien. Renoncer au cours pour ça serait
            renoncer pour une erreur d&apos;amont.
          </p>
          <ul className="mt-1 space-y-0.5">
            {incoherences.map((c, i) => (
              <li key={i} className="chiffres text-[11.5px] text-faible">
                {c.a.code} — sections {c.a.section} et {c.b.section}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {indetermines.length > 0 ? (
        <div className="border-l-2 border-verrou px-3 py-1.5">
          <p className="text-[12.5px] text-doux">
            <span className="chiffres text-papier">{indetermines.length}</span> point
            {indetermines.length === 1 ? "" : "s"} que la comparaison ne tranche pas.
          </p>
          <ul className="mt-1 space-y-0.5">
            {indetermines.map((c, i) => (
              <li key={i} className="text-[11.5px] leading-snug text-faible">
                {c.raison}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Les créneaux dont les dates ne suivent pas le motif annoncé au-dessus — ou,
 * quand aucun motif ne domine, tous les créneaux.
 *
 * Sous la grille et non dedans : c'est là qu'il y a la place de les lire. Dans
 * la case, « 2 périodes » tenait mais ne disait rien, et les dates réelles ne
 * tenaient pas.
 */
function DatesAPart({ grille }: { grille: ReturnType<typeof construireGrille> }) {
  const apart = grille.cases.filter((c) => !c.suitLeMotif);
  if (apart.length === 0) return null;
  const domine = grille.fenetresDominantes !== null;

  return (
    <div className="mt-3">
      <h3 className="text-[12.5px] font-semibold text-papier">
        {domine
          ? `Dates particulières (${apart.length})`
          : "Dates de chaque créneau"}
      </h3>
      <ul className="mt-1 space-y-0.5">
        {apart.map((c, i) => (
          <li key={i} className="text-[12px] leading-snug text-doux">
            <span className="chiffres text-papier">{c.code}</span>{" "}
            <span className="chiffres text-faible">
              {c.jour.toLowerCase()} {heure(c.debutMin)}
            </span>{" "}
            — {c.fenetres.map((f) => fenetreLisible(f)).join(", puis ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Le quadrillage lui-même. Les heures en colonne de gauche, un jour par
 *  colonne, et chaque case positionnée à la minute près par `grid-row`. */
function Quadrillage({
  grille,
  enConflit,
}: {
  grille: ReturnType<typeof construireGrille>;
  enConflit: Set<string>;
}) {
  const bornes = grille.bornes;
  if (bornes === null) return null;

  // Arrondi AUX PAS ENTIERS, vers l'extérieur : une case qui commence à 8 h 40
  // doit avoir une ligne qui commence au plus tard à 8 h 30, sinon elle
  // déborderait par le haut.
  const debut = Math.floor(bornes.debutMin / PAS_MIN) * PAS_MIN;
  const fin = Math.ceil(bornes.finMin / PAS_MIN) * PAS_MIN;
  const pas = (fin - debut) / PAS_MIN;

  const ligne = (minutes: number) => Math.round((minutes - debut) / PAS_MIN) + 1;

  // Chaque jour vaut autant de colonnes qu'il a de voies. Presque toujours une.
  const colonnesDuJour = grille.joursAffiches.map((j) => grille.voiesParJour[j] ?? 1);
  const depart = new Map<string, number>();
  let curseur = 2; // la colonne 1 porte les heures
  grille.joursAffiches.forEach((j, i) => {
    depart.set(j, curseur);
    curseur += colonnesDuJour[i];
  });

  return (
    <div className="mt-4 overflow-x-auto">
      <div
        className="grid min-w-[560px] gap-px bg-trait/40"
        style={{
          gridTemplateColumns: `44px ${colonnesDuJour.map((n) => `repeat(${n}, minmax(64px, 1fr))`).join(" ")}`,
          gridTemplateRows: `auto repeat(${pas}, ${HAUTEUR_PAS}px)`,
        }}
      >
        <div className="bg-encre" style={{ gridColumn: 1, gridRow: 1 }} />
        {grille.joursAffiches.map((j, i) => (
          <div
            key={j}
            className="bg-relief px-2 py-1 text-[11.5px] font-semibold text-doux"
            style={{ gridColumn: `${depart.get(j)} / span ${colonnesDuJour[i]}`, gridRow: 1 }}
          >
            {j}
          </div>
        ))}

        {/* Les heures pleines. Une ligne sur deux porte son libellé ; les
            demi-heures restent muettes, sinon la colonne devient une liste. */}
        {Array.from({ length: pas }, (_, k) => {
          const minutes = debut + k * PAS_MIN;
          return (
            <div
              key={`h${k}`}
              className="bg-encre pr-1.5 text-right text-[10.5px] leading-none text-faible"
              style={{ gridColumn: 1, gridRow: k + 2, paddingTop: 2 }}
            >
              {minutes % 60 === 0 ? heure(minutes) : ""}
            </div>
          );
        })}

        {/* Le fond des journées, pour que les colonnes se lisent même vides. */}
        {grille.joursAffiches.map((j, i) =>
          Array.from({ length: colonnesDuJour[i] }, (_, v) => (
            <div
              key={`f${j}${v}`}
              /* Un liseré à la PREMIÈRE voie de chaque jour. Sans lui, un jour à
                 deux voies se lit comme deux journées — vu à l'écran : la
                 seconde voie du mardi passait pour la colonne du mercredi. */
              className={v === 0 ? "border-l-2 border-traitfort bg-creux" : "bg-creux"}
              style={{ gridColumn: (depart.get(j) ?? 2) + v, gridRow: `2 / span ${pas}` }}
            />
          )),
        )}

        {grille.cases.map((c, i) => (
          <Case
            key={i}
            c={c}
            colonne={(depart.get(c.jour) ?? 2) + c.voie}
            ligneDebut={ligne(c.debutMin)}
            ligneFin={ligne(c.finMin + 1)}
            enConflit={enConflit.has(`${c.code}|${c.section}|${c.jour}|${c.debutMin}`)}
            avecDates={!c.suitLeMotif}
          />
        ))}
      </div>
    </div>
  );
}

function Case({
  c,
  colonne,
  ligneDebut,
  ligneFin,
  enConflit,
  avecDates,
}: {
  c: CaseGrille;
  colonne: number;
  ligneDebut: number;
  ligneFin: number;
  enConflit: boolean;
  avecDates: boolean;
}) {
  return (
    <div
      className={`overflow-hidden border-l-2 px-1.5 py-1 text-[11px] leading-tight ${
        enConflit ? "border-perdu bg-perdu/15" : "border-dispo/70 bg-dispo/10"
      }`}
      style={{
        gridColumn: colonne,
        gridRow: `${ligneDebut + 1} / ${Math.max(ligneFin + 1, ligneDebut + 2)}`,
      }}
    >
      <div className="chiffres truncate text-papier">{c.code}</div>
      <div className="chiffres truncate text-[10px] text-faible">
        {heure(c.debutMin)}–{finArrondie(c.finMin)} · {c.section}
      </div>
      {/* LES DATES SONT DANS LA CASE, et c'est la raison pour laquelle il n'y a
          qu'une grille : 0,1 séance de routine sur 10 couvre tout le trimestre,
          donc une case muette promettrait « toutes les semaines » et mentirait
          presque partout. */}
      {avecDates ? (
        /* Une MARQUE, pas les dates. Une case d'une heure fait 44 px et porte déjà
           son code et son heure ; « 2 périodes » y tenait mais ne disait rien, et
           les vraies dates n'y tiennent pas. Elles sont listées sous la grille,
           où elles ont la place d'être lues. */
        <div
          className="mt-0.5 truncate text-[10px] text-avert"
          title={c.fenetres.map((f) => fenetreLisible(f)).join(" · ")}
        >
          dates à part ↓
        </div>
      ) : null}
    </div>
  );
}

/** Le choix de section, seulement là où il y en a un. Un sélecteur à une seule
 *  option est du bruit ; `MAT 1400` en publie douze et là il est décisif. */
function Sections({
  choix,
  onSection,
}: {
  choix: Choix[];
  onSection: (code: CodeCours, section: string) => void;
}) {
  const aChoisir = choix.filter((c) => c.sections.length > 1);
  if (aChoisir.length === 0) return null;

  return (
    <div className="mt-4 border-t border-trait pt-3">
      <h3 className="text-[12.5px] font-semibold text-papier">
        Sections ({aChoisir.length} cours en publient plusieurs)
      </h3>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faible">
        On suit UNE section : leurs séances ne s&apos;additionnent pas. Certaines ont
        des horaires identiques, d&apos;autres non — changer de section peut supprimer
        un chevauchement. La page ne dit pas comment les sections se combinent entre
        elles, donc l&apos;écran ne le devine pas.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {aChoisir.map((c) => (
          <label key={c.code} className="flex items-center gap-1.5 text-[12px] text-doux">
            <span className="chiffres text-papier">{c.code}</span>
            <select
              value={c.section ?? ""}
              onChange={(e) => onSection(c.code, e.target.value)}
              aria-label={`Section de ${c.code}`}
              className="chiffres border border-trait bg-creux py-0.5 pl-1.5 pr-5 text-[12px] focus:border-traitfort focus:outline-none"
            >
              {c.sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
