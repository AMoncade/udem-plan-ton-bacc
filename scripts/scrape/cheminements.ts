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

export function lireCheminements(blocs: Bloc[], creditsTotal: number | null): Marquage {
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

    for (const g of groupes) {
      for (const b of g) {
        const m = marqueurDe(libelle(b));
        parCle.set(b.cle, m);
        if (!ordre.includes(m)) ordre.push(m);
      }
    }
  }

  if (ordre.length === 0) return { parCle, cheminements: [], ecartes };

  // GARDE-FOU FINAL : chaque cheminement doit tomber juste sur le total annoncé.
  // Les blocs sans marqueur sont communs, donc comptés dans tous.
  if (creditsTotal !== null) {
    const mauvais = ordre
      .map((m) => ({ m, p: plancher(blocs.filter((b) => (parCle.get(b.cle) ?? m) === m)) }))
      .filter(({ p }) => p !== creditsTotal);
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
              mauvais.map(({ m, p }) => `${m} = ${p}`).join(", ") +
              " — rien n'est émis, la lecture est à revoir",
          },
        ],
      };
    }
  }

  return { parCle, cheminements: ordre, ecartes };
}
