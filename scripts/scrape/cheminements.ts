/**
 * Les CHEMINEMENTS d'un segment : deux façons de remplir le même créneau.
 *
 * ## Ce que ce module empêche
 *
 * Le doctorat en pathologie porte deux `Bloc 70A` dans le segment 70 — l'un
 * pour l'accès direct du B. Sc., l'autre pour l'accès de la M. Sc. Ce sont des
 * ALTERNATIVES : un étudiant en suit une. Sans le dire, l'audit additionne les
 * deux et exige le double. Mesuré sur le catalogue : 65 parcours demandent plus
 * de crédits que leur page n'en annonce, et certains pour cette raison.
 *
 * ## LA RÈGLE N'EST PAS « il y a un libellé », ELLE EST « un id est réutilisé »
 *
 * Le piège, mesuré : `dess-en-intervention-en-deficience-visuelle-readaptation`
 * porte le même gabarit — un libellé par bloc — avec « Formation générale »
 * 10 crédits et « Formation spécialisée » 20 crédits. Mais 10 + 20 = 30 = son
 * `creditsTotal` : ce sont des **compléments tous deux exigés**, pas des
 * alternatives. Les traiter comme des cheminements montrerait 10 ou 20 crédits
 * à un étudiant qui en doit 30 — le défaut de l'audit doublé, mais dans l'autre
 * sens : amputer au lieu de gonfler.
 *
 * Le discriminant est donc mécanique et ne lit aucune prose : **un libellé ne
 * compte que si, dans ce segment, un id de bloc est RÉUTILISÉ sous deux
 * libellés.** Réutiliser un numéro est la façon dont la page dit « même
 * créneau, rempli autrement ». Le dess n'en réutilise aucun ; le doctorat en
 * réutilise dans cinq segments.
 *
 * ## LE LIBELLÉ N'EST PAS LE NOM, C'EST LE MARQUEUR EXTRAIT DU NOM
 *
 * `maitrise-en-administration-…-administration-sociale`, 45 crédits :
 *
 *     70A « - ST Méthodologie »  3      70E « - ST Stage »            12
 *     70A « - TD Méthodologie »  3      70E « - TD Travail dirigé »   12
 *     70B « Gestion (ESPUM) »   12      70C « Spécialisation »        15
 *                                       70D « Complément »             3
 *
 * Trois blocs portent un nom et AUCUN cheminement. Avec le marqueur, ST = 45 et
 * TD = 45, égal au total. Sans filtre : 60. **Avec le nom entier comme
 * libellé : 3** — choisir « - ST Méthodologie » élimine les deux variantes de
 * 70E, qui ne correspondent à aucun des deux libellés, et le programme est
 * amputé de 42 crédits. D'où un marqueur court, commun aux groupes.
 *
 * ## CE QUI NE SE RÉDUIT PAS NE S'ÉMET PAS
 *
 * `maitrise-en-evaluation-des-technologies-de-la-sante` porte six libellés pour
 * quatre groupes, dont un où un seul côté est marqué. Émettre à moitié ferait
 * exiger les deux blocs d'un même créneau — le défaut que ce champ corrige,
 * reproduit à l'intérieur de son propre correctif. On n'émet rien et le segment
 * est écarté avec sa raison.
 *
 * Le garde-fou final est celui que le contrat impose, et il rend le module
 * auto-vérifiant : **le plancher de chaque cheminement doit égaler le
 * `creditsTotal` de la page.** Si une extraction de marqueur se trompe, la
 * somme ne tombe pas juste et rien n'est émis. Une erreur de lecture devient
 * donc un silence journalisé, jamais une donnée fausse.
 */
import type { Bloc } from "../../lib/types";

export interface Marquage {
  /** `Bloc.cle` -> marqueur de cheminement. Absent = commun à tous. */
  parCle: Map<string, string>;
  /** Union ordonnée des marqueurs émis. Vide si rien n'est émis. */
  cheminements: string[];
  /** Segments écartés, avec la raison — à journaliser par l'appelant. */
  ecartes: { segment: string; raison: string }[];
}

/** Mêmes normalisations que `cleBloc`, pour que les chaînes se recoupent. */
function propre(t: string): string {
  return t.replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();
}

/** L'id sans le qualificatif que `structure.ts` y a replié. */
function idDeBase(bloc: Bloc): string {
  return propre(bloc.id.split(" — ")[0]);
}

/**
 * Le libellé d'un bloc : le qualificatif replié dans l'id s'il y en a un,
 * sinon son nom. Les deux familles de pages écrivent l'une ou l'autre.
 */
function libelle(bloc: Bloc): string {
  const i = bloc.id.indexOf(" — ");
  return propre(i >= 0 ? bloc.id.slice(i + 3) : bloc.nom);
}

/**
 * Le marqueur d'un libellé.
 *
 * Un sigle court en majuscules (« ST », « TD », « MM ») quand il y en a un : ce
 * sont les axes que la page réutilise d'un groupe à l'autre. Sinon le libellé
 * entier, ce qui suffit quand le segment n'a qu'un seul groupe — « Stage »
 * contre « Travail dirigé » ne demande aucune abréviation.
 */
export function marqueurDe(libelleBrut: string): string {
  const l = propre(libelleBrut);
  const m = /\b([A-Z]{2,3})\b/.exec(l);
  return m ? m[1] : l;
}

function plancher(blocs: Bloc[]): number {
  let somme = 0;
  for (const b of blocs) {
    if (b.regle.type !== "obligatoire" && b.regle.type !== "option") continue;
    somme += b.regle.bornes.min;
  }
  return somme;
}

/**
 * Les libellés qui servent d'AXE dans au moins un segment.
 *
 * Un segment a un axe dès qu'un de ses ids est réutilisé sous deux libellés.
 * La réutilisation **active l'axe du segment** ; elle ne désigne pas les blocs
 * un par un. Preuve arithmétique, sur le doctorat en pathologie : « Accès
 * direct » ne totalise 90 que si `70C` et `70D` sont marqués, alors que leurs
 * ids n'apparaissent qu'une fois. Les laisser communs les comptait dans les
 * DEUX voies et faisait monter la voie M. Sc. à 265.
 *
 * Exporté parce que `structure.ts` en a besoin AVANT de construire les
 * orientations : un segment dont l'entête nomme l'un de ces libellés n'est pas
 * un tronc commun (voir `lireCheminements`).
 */
export function marqueursDeCheminement(blocs: Bloc[]): Set<string> {
  const marqueurs = new Set<string>();
  const parSegment = new Map<string, Bloc[]>();
  for (const b of blocs) {
    const seau = parSegment.get(b.segment) ?? [];
    seau.push(b);
    parSegment.set(b.segment, seau);
  }
  for (const duSegment of parSegment.values()) {
    for (const jeu of axeDuSegment(duSegment)) marqueurs.add(jeu);
  }
  return marqueurs;
}

/**
 * Les marqueurs qui forment l'AXE d'un segment : ceux portés par un id
 * RÉUTILISÉ sous deux libellés distincts.
 *
 * C'est la frontière entre « nommé » et « marqué », et elle a coûté deux
 * essais. Marquer tout bloc libellé d'un segment à axe actif casse
 * `administration sociale` : son segment 70 réutilise `70A` sous « - ST
 * Méthodologie » / « - TD Méthodologie » (l'axe ST/TD), mais porte aussi
 * `70B « Gestion (ESPUM) »`, `70C « Spécialisation »`, `70D « Complément de
 * formation »` — des noms descriptifs, pas des cheminements. Les marquer
 * fabrique trois faux cheminements et ampute le programme.
 *
 * Ne marquer que les blocs d'un groupe réutilisé rate l'inverse : `70C` et
 * `70D` du doctorat en pathologie portent « Accès direct » avec un id unique,
 * et les laisser communs les compte dans les DEUX voies.
 *
 * La règle qui satisfait les deux : **l'axe est l'ensemble des marqueurs d'un
 * id réutilisé, et un bloc est marqué si SON marqueur appartient à cet
 * ensemble** — quel que soit son id.
 */
function axeDuSegment(duSegment: Bloc[]): Set<string> {
  const parId = new Map<string, Set<string>>();
  for (const b of duSegment) {
    const jeu = parId.get(idDeBase(b)) ?? new Set<string>();
    const m = marqueurDe(libelle(b));
    if (m !== "") jeu.add(m);
    parId.set(idDeBase(b), jeu);
  }
  const axe = new Set<string>();
  for (const jeu of parId.values()) if (jeu.size > 1) for (const m of jeu) axe.add(m);
  return axe;
}

export function lireCheminements(
  blocs: Bloc[],
  creditsTotal: number | null,
  orientations: { nom: string; segments: string[] }[] = [],
  /** Segment -> cheminement auquel il appartient EN ENTIER (entête qui le nomme). */
  segmentsDeCheminement: Map<string, string> = new Map(),
): Marquage {
  const parCle = new Map<string, string>();
  const ecartes: { segment: string; raison: string }[] = [];
  const ordre: string[] = [];

  const parSegment = new Map<string, Bloc[]>();
  for (const b of blocs) {
    const seau = parSegment.get(b.segment) ?? [];
    seau.push(b);
    parSegment.set(b.segment, seau);
  }

  for (const [segment, duSegment] of parSegment) {
    const parId = new Map<string, Bloc[]>();
    for (const b of duSegment) {
      const seau = parId.get(idDeBase(b)) ?? [];
      seau.push(b);
      parId.set(idDeBase(b), seau);
    }
    const groupes = [...parId.values()].filter((g) => g.length > 1);
    if (groupes.length === 0) continue; // aucun id réutilisé : pas de cheminement

    // Chaque bloc d'un groupe doit porter un marqueur, et les groupes doivent
    // s'accorder sur le MÊME jeu de marqueurs — sinon les libellés ne se
    // recoupent pas et choisir un cheminement amputerait les autres groupes.
    const jeux = groupes.map((g) => g.map((b) => marqueurDe(libelle(b))));
    const manqueUnMarqueur = jeux.some((j) => j.some((m) => m === ""));
    const reference = [...jeux[0]].sort().join("|");
    const discordant = jeux.some((j) => [...j].sort().join("|") !== reference);
    const doublon = jeux.some((j) => new Set(j).size !== j.length);

    if (manqueUnMarqueur || discordant || doublon) {
      ecartes.push({
        segment,
        raison: manqueUnMarqueur
          ? "un bloc d'un créneau réutilisé n'a aucun libellé — l'axe est incomplet"
          : doublon
            ? "deux blocs d'un même créneau donnent le même marqueur — ils ne se distinguent pas"
            : `les créneaux réutilisés ne s'accordent pas sur un axe commun (${jeux
                .map((j) => j.join("+"))
                .join(" contre ")})`,
      });
      continue;
    }

    // Un bloc est marqué si SON marqueur appartient à l'axe du segment — pas
    // s'il est simplement nommé, et pas seulement s'il est dans un groupe
    // réutilisé. Voir `axeDuSegment` : c'est la seule règle qui satisfait à la
    // fois `70C`/`70D` du doctorat (marqués malgré un id unique) et les blocs
    // descriptifs de l'administration sociale (laissés communs).
    const axe = axeDuSegment(duSegment);
    for (const b of duSegment) {
      const m = marqueurDe(libelle(b));
      if (m === "" || !axe.has(m)) continue;
      parCle.set(b.cle, m);
      if (!ordre.includes(m)) ordre.push(m);
    }
  }

  // UN SEGMENT PEUT ÊTRE UN CHEMINEMENT TOUT ENTIER.
  //
  // Le doctorat en pathologie écrit « Segment 01 - Accès de la M. Sc. au
  // Ph. D. », et cette chaîne est EXACTEMENT un libellé de bloc des segments 70
  // à 74. Le signal est donc mécanique — égalité de chaîne, pas
  // interprétation : ce segment n'est pas un tronc commun, c'est la modalité
  // « Accès de la M. Sc. » en entier, alternative aux segments d'option.
  //
  // `structure.ts` l'exclut aussi des segments COMMUNS des orientations. Sans
  // ça la voie M. Sc. compterait le segment 01 (90) plus sa reprise dans le
  // segment d'option (90) et vaudrait 180 — mesuré.
  for (const [segment, cheminement] of segmentsDeCheminement) {
    for (const b of blocs) {
      if (b.segment !== segment) continue;
      parCle.set(b.cle, cheminement);
      if (!ordre.includes(cheminement)) ordre.push(cheminement);
    }
  }

  if (ordre.length === 0) return { parCle, cheminements: [], ecartes };

  // GARDE-FOU FINAL : chaque cheminement doit tomber juste sur le total annoncé,
  // ET LA SOMME SE FAIT PAR ORIENTATION, pas sur le programme entier.
  //
  // Troisième fois que sommer sans projeter fabrique un chiffre faux — les deux
  // premières étaient dans mes propres mesures, celle-ci était dans le
  // garde-fou écrit pour les attraper. Mesuré sur
  // `maitrise-en-sciences-veterinaires-…-sans-memoire` (total 45) : le plancher
  // programme-entier donnait 88 pour chaque cheminement et refusait tout, alors
  // que projeté sur l'orientation qui les porte il donne 45 et 45, pile juste.
  // Les blocs de deux orientations ne s'additionnent pas : ce sont des
  // alternatives, et l'axe de cheminement ne vit souvent que dans l'une d'elles.
  //
  // Une orientation dont AUCUN bloc ne porte de marqueur est ignorée : il n'y a
  // pas de cheminement à y valider, et l'exiger ferait refuser un axe
  // parfaitement lu ailleurs (segment 80 des vétérinaires, sans marqueur).
  if (creditsTotal !== null) {
    const portees: { nom: string; blocs: Bloc[] }[] =
      orientations.length > 0
        ? orientations.map((o) => ({
            nom: o.nom,
            blocs: blocs.filter((b) => o.segments.includes(b.segment)),
          }))
        : [{ nom: "—", blocs }];

    const mauvais: string[] = [];
    for (const portee of portees) {
      const marqueursIci = ordre.filter((m) => portee.blocs.some((b) => parCle.get(b.cle) === m));
      if (marqueursIci.length === 0) continue;
      for (const m of marqueursIci) {
        const p = plancher(portee.blocs.filter((b) => (parCle.get(b.cle) ?? m) === m));
        if (p !== creditsTotal) mauvais.push(`${portee.nom} / ${m} = ${p}`);
      }
    }

    if (mauvais.length > 0) {
      return {
        parCle: new Map(),
        cheminements: [],
        ecartes: [
          ...ecartes,
          {
            segment: "—",
            raison:
              `les cheminements lus ne tombent pas sur le total annoncé (${creditsTotal}) : ` +
              mauvais.join(", ") +
              " — rien n'est émis, la lecture est à revoir",
          },
        ],
      };
    }
  }

  return { parCle, cheminements: ordre, ecartes };
}
