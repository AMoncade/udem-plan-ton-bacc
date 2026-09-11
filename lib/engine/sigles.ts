import type { CodeCours, Cours, Programme } from "../types";
import { sujetDeCode } from "../codes";

/**
 * CONTRAINTES DE QUOTA PAR SIGLE — R2 de `docs/VALIDATION-AUTRES-PROGRAMMES.md`.
 *
 * Le document les avait classées « reportables » tant qu'un seul programme
 * était chargé. Le catalogue complet l'est désormais, donc elles ne le sont
 * plus : `notes` les conservait, l'UI les affichait en avertissement, et le
 * moteur ne les vérifiait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE LIT DE LA PROSE, ALORS QUE LE PROJET S'EN MÉFIE
 *
 * `Bloc.contenuOuvert` existe précisément pour ne PAS deviner d'après `notes`.
 * Ici c'est différent : il n'existe aucun champ typé porteur de ces quotas, et
 * il n'y en a pas parce que la page ne les écrit QUE en prose. Le choix n'est
 * donc pas « lire la prose ou lire un champ », c'est « lire la prose ou ne rien
 * vérifier ». Ce que ce module refuse, c'est de lire la prose APPROXIMATIVEMENT :
 * il n'applique que les formes dont l'obligation est explicite, et JOURNALISE
 * tout le reste au lieu de l'avaler.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE A MONTRÉ, ET POURQUOI UN REGEX NAÏF ÉTAIT UN PIÈGE
 *
 * Sur les 1 088 pages, douze proses portent le motif « N crédits <SIGLE> ».
 * NEUF ne sont pas des conditions de diplôme :
 *
 *   - « Pour être admissible aux cycles supérieurs en physique … au moins
 *     9 crédits PHY de niveau 3000 » (bacc en physique ×4, et maths-physique) :
 *     c'est une admissibilité EXTERNE, pas une exigence de graduation — le R3
 *     du même document le dit déjà pour une règle voisine ;
 *   - « Possibilité de prendre 3 crédits de cours PLU » (géographie
 *     environnementale) : une faculté, pas une obligation ;
 *   - « Les étudiants peuvent prendre un maximum de 6 crédits de cours POL »
 *     (DESS et maîtrise en études internationales) : un PLAFOND, dont
 *     l'inversion en plancher inventerait une exigence ;
 *   - une ligne de préalables du microprogramme en leadership appliqué à la
 *     santé, qui n'est pas un quota du tout.
 *
 * Un `/(\d+) crédits (?:de cours )?([A-Z]{3})/` appliqué sans discernement
 * aurait donc fabriqué neuf exigences fausses — et neuf parcours faussement
 * bloquants — pour en trouver deux vraies. D'où l'exigence d'un MARQUEUR
 * D'OBLIGATION explicite, et la liste de disqualifiants ci-dessous.
 *
 * Les deux vraies : `baccalaureat-en-economie-et-politique` (33 POL et 33 ECN)
 * et `baccalaureat-en-ecriture-de-scenario-et-creation-litteraire` (42 CIN-ou-JEU
 * et 42 FRA).
 */

/** Sigle de matière : « POL », « ECN ». Trois majuscules, comme `sujetDeCode`. */
export type Sigle = string;

export type ContrainteSigle =
  | {
      genre: "minimum";
      /**
       * Sigles ALTERNATIFS d'un même quota. « 42 crédits de cours CIN ou JEU »
       * est UN quota de 42 que CIN et JEU alimentent ensemble — pas deux quotas
       * de 42. Les séparer doublerait l'exigence.
       */
      sigles: Sigle[];
      credits: number;
      /** Le quota porte sur tout le parcours, cours obligatoires compris. */
      portee: "programme";
      brut: string;
    }
  | {
      genre: "exclusion";
      sigles: Sigle[];
      portee: "bloc";
      cleBloc: string;
      /**
       * La page écrit « Sauf exception autorisée ». La règle admet donc une
       * dérogation facultaire, et un audit qui la transformerait en échec
       * affirmerait plus que la page. Voir `verifierContraintesSigles()` : une
       * exclusion ne fait jamais basculer `conforme`.
       */
      exceptionPossible: boolean;
      brut: string;
    };

/** Prose qui porte le motif d'un quota mais qu'on n'a PAS convertie en règle.
 *  Existe pour que l'écart soit journalisé plutôt que silencieux. */
export interface ProseNonLue {
  sujet: string;
  phrase: string;
  raison: string;
}

export interface LectureSigles {
  contraintes: ContrainteSigle[];
  nonLues: ProseNonLue[];
}

/**
 * État d'une contrainte. `indeterminee` est le troisième état indispensable,
 * pour la même raison que pour `contenuOuvert` : ni satisfaite, ni violée.
 *
 * Deux causes distinctes le produisent, et les confondre avec un échec serait
 * faux dans les deux cas :
 *   - des cours retenus n'ont pas de fiche, donc le total compté est un
 *     PLANCHER : on ne peut pas affirmer qu'il manque des crédits ;
 *   - une exclusion porte sur un bloc auquel le moteur n'affecte rien (voir
 *     `verifierContraintesSigles()`), donc il n'y a rien à examiner.
 */
export type EtatContrainte = "satisfaite" | "violee" | "indeterminee";

export interface ResultatSigle {
  contrainte: ContrainteSigle;
  etat: EtatContrainte;
  /** Crédits comptés pour un quota minimum ; 0 pour une exclusion. */
  creditsComptes: number;
  /** Cours qui alimentent le quota, ou qui heurtent l'exclusion. */
  cours: CodeCours[];
  /** Cours retenus dont les crédits sont inconnus : le compte est un plancher. */
  creditsInconnus: CodeCours[];
  message: string;
}

// ---------------------------------------------------------------------------
// Lecture de la prose
// ---------------------------------------------------------------------------

/** Un quota n'est retenu que si la phrase énonce une OBLIGATION. */
const OBLIGATION =
  /devront?\s+avoir\s+[ée]t[ée]\s+compl[ée]t|doi(?:t|vent)\s+compl[ée]ter|doi(?:t|vent)\s+avoir\s+compl[ée]t/i;

/**
 * Disqualifiants : la phrase parle bien de crédits et d'un sigle, mais pas
 * d'une condition de diplôme. Chacun vient d'un cas réel du catalogue.
 */
const DISQUALIFIANTS: { motif: RegExp; raison: string }[] = [
  {
    motif: /admissible|cycles?\s+sup[ée]rieurs?/i,
    raison: "admissibilité à un autre programme, pas une condition de diplôme",
  },
  { motif: /possibilit[ée]\s+de/i, raison: "une possibilité offerte, pas une obligation" },
  { motif: /maximum/i, raison: "un plafond, pas un plancher" },
  { motif: /pr[ée]alables?\s*:/i, raison: "une ligne de préalables, pas un quota de programme" },
];

/** « 33 crédits de cours POL », « 42 crédits de cours CIN ou JEU ». */
const QUOTA = /(\d+)\s+cr[ée]dits?\s+(?:de\s+cours\s+)?([A-Z]{3}(?:\s+ou\s+[A-Z]{3})*)/g;

/** « un sigle autre que le sigle ANG », « … que les sigles ECN ou POL ». */
const EXCLUSION =
  /sigles?\s+autres?\s+que\s+(?:les?\s+sigles?\s+)?([A-Z]{3}(?:\s*(?:,|et|ou)\s*[A-Z]{3})*)/i;

/** « Segment 71 — … » : une note peut ne valoir que pour un segment. */
const PREFIXE_SEGMENT = /^\s*Segment\s+([A-Za-z0-9-]+)\s*[—–-]/;

function phrases(texte: string): string[] {
  return texte
    .split(/(?<=\.)\s+|\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

function sigles(liste: string): Sigle[] {
  return [...liste.matchAll(/[A-Z]{3}/g)].map((m) => m[0]);
}

/**
 * Lit les contraintes de sigle d'un programme.
 *
 * Le filtre par segment n'est pas une précaution théorique : les notes de
 * `baccalaureat-en-ecriture-de-scenario-et-creation-litteraire` sont préfixées
 * « Segment 71 — ». Appliquée à un parcours projeté sur d'autres segments, la
 * règle porterait sur des blocs qui ne sont pas les siens.
 */
export function lireContraintesSigles(programme: Programme): LectureSigles {
  const contraintes: ContrainteSigle[] = [];
  const nonLues: ProseNonLue[] = [];
  const segments = new Set((programme.segments ?? []).map((s) => s.trim()));

  for (const note of programme.notes ?? []) {
    const m = PREFIXE_SEGMENT.exec(note);
    if (m && segments.size > 0 && !segments.has(m[1])) continue;

    for (const phrase of phrases(note)) {
      QUOTA.lastIndex = 0;
      const trouves = [...phrase.matchAll(QUOTA)];
      if (trouves.length === 0) continue;

      const disqualifiant = DISQUALIFIANTS.find((d) => d.motif.test(phrase));
      if (disqualifiant) {
        nonLues.push({ sujet: programme.id, phrase, raison: disqualifiant.raison });
        continue;
      }
      if (!OBLIGATION.test(phrase)) {
        nonLues.push({
          sujet: programme.id,
          phrase,
          raison:
            "aucun marqueur d'obligation (« devront avoir été complétés », « doit compléter »)",
        });
        continue;
      }
      for (const q of trouves) {
        contraintes.push({
          genre: "minimum",
          sigles: sigles(q[2]),
          credits: Number(q[1]),
          portee: "programme",
          brut: phrase,
        });
      }
    }
  }

  for (const bloc of programme.blocs ?? []) {
    for (const note of bloc.notes ?? []) {
      for (const phrase of phrases(note)) {
        const m = EXCLUSION.exec(phrase);
        if (!m) continue;
        contraintes.push({
          genre: "exclusion",
          sigles: sigles(m[1]),
          portee: "bloc",
          cleBloc: bloc.cle,
          exceptionPossible: /sauf\s+exception\s+autoris/i.test(phrase),
          brut: phrase,
        });
      }
    }
  }

  return { contraintes, nonLues };
}

// ---------------------------------------------------------------------------
// Vérification
// ---------------------------------------------------------------------------

export interface EntreeVerification {
  /** Cours RETENUS vers le diplôme, par clé de bloc. */
  attribuesParBloc: Map<string, CodeCours[]>;
  /** Cours réussis qu'aucun bloc ne retient. */
  nonAttribues: CodeCours[];
  fiches: Map<CodeCours, Cours>;
}

function creditsDe(fiche: Cours | undefined): number | null {
  if (!fiche) return null;
  const c = fiche.credits;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0) return null;
  return c;
}

const cr = (n: number) => `${n} crédit${n === 1 ? "" : "s"}`;

/**
 * Vérifie les contraintes lues contre un audit déjà calculé.
 *
 * QUOTA MINIMUM — on compte les cours RETENUS vers le diplôme, pas tous les
 * cours réussis. La page dit « 33 crédits de cours POL … incluant les cours
 * obligatoires » : le quota vit à l'intérieur du programme. Compter aussi les
 * cours hors programme gonflerait le total et déclarerait satisfait un quota
 * qui ne l'est pas.
 *
 * EXCLUSION — constat mesuré, et il est gênant : les 47 blocs du catalogue qui
 * portent une exclusion de sigle ont TOUS `contenuOuvert: true`, parce que
 * c'est cette prose même qui les rend « décrits en prose sans aucun cours ».
 * Or `estJoker()` exclut les blocs ouverts, donc le moteur ne leur affecte
 * JAMAIS de cours. Vérifier « les cours affectés à ce bloc ne sont ni ECN ni
 * POL » porterait sur un ensemble vide par construction : un contrôle dont la
 * réponse est garantie d'avance ne prouve rien.
 *
 * Ce qui est réellement examinable, c'est l'ensemble des cours réussis
 * qu'aucun bloc ne retient — ce sont eux, et eux seuls, qui pourraient remplir
 * ce bloc au choix. L'état reste `indeterminee` : le moteur signale les
 * candidats qui heurtent l'exclusion, il n'affirme pas que l'étudiant les y a
 * placés, et « Sauf exception autorisée » lui interdit de conclure à l'échec.
 */
export function verifierContraintesSigles(
  contraintes: ContrainteSigle[],
  entree: EntreeVerification,
): ResultatSigle[] {
  const retenus: CodeCours[] = [];
  for (const liste of entree.attribuesParBloc.values()) retenus.push(...liste);

  return contraintes.map((contrainte) => {
    if (contrainte.genre === "minimum") {
      const vises = retenus.filter((code) => {
        const s = sujetDeCode(code);
        return s !== null && contrainte.sigles.includes(s);
      });
      const inconnus = vises.filter((code) => creditsDe(entree.fiches.get(code)) === null);
      const comptes = vises.reduce((t, code) => t + (creditsDe(entree.fiches.get(code)) ?? 0), 0);
      const nom = contrainte.sigles.join(" ou ");

      if (comptes >= contrainte.credits) {
        return {
          contrainte,
          etat: "satisfaite" as const,
          creditsComptes: comptes,
          cours: vises,
          creditsInconnus: inconnus,
          message: `quota de sigle ${nom} : ${cr(comptes)} retenus pour un minimum de ${cr(contrainte.credits)}.`,
        };
      }
      if (inconnus.length > 0) {
        return {
          contrainte,
          etat: "indeterminee" as const,
          creditsComptes: comptes,
          cours: vises,
          creditsInconnus: inconnus,
          message:
            `quota de sigle ${nom} : ${cr(comptes)} comptés pour un minimum de ${cr(contrainte.credits)}, mais ` +
            `${inconnus.length} cours retenus n'ont pas de fiche (${inconnus.join(", ")}) — le compte est un PLANCHER, ` +
            `l'audit ne peut donc pas affirmer qu'il manque des crédits. « ${contrainte.brut} »`,
        };
      }
      return {
        contrainte,
        etat: "violee" as const,
        creditsComptes: comptes,
        cours: vises,
        creditsInconnus: inconnus,
        message:
          `quota de sigle non atteint : ${cr(comptes)} de cours ${nom} retenus pour un minimum de ${cr(contrainte.credits)}. ` +
          `Cette exigence porte sur tout le programme et NE SE VOIT PAS bloc par bloc — chaque bloc peut être dans ses ` +
          `bornes sans qu'elle soit remplie. « ${contrainte.brut} »`,
      };
    }

    const heurtent = entree.nonAttribues.filter((code) => {
      const s = sujetDeCode(code);
      return s !== null && contrainte.sigles.includes(s);
    });
    const nom = contrainte.sigles.join(", ");
    const suffixe = contrainte.exceptionPossible
      ? " La page écrit « Sauf exception autorisée » : une dérogation reste possible, donc ceci n'est pas un échec."
      : "";
    return {
      contrainte,
      etat: "indeterminee" as const,
      creditsComptes: 0,
      cours: heurtent,
      creditsInconnus: [],
      message:
        heurtent.length > 0
          ? `le bloc ${contrainte.cleBloc} exclut les sigles ${nom}, et ${heurtent.length} cours réussi(s) qu'aucun bloc ne ` +
            `retient portent un de ces sigles (${heurtent.join(", ")}) : ils ne peuvent donc pas y être versés.${suffixe}`
          : `le bloc ${contrainte.cleBloc} exclut les sigles ${nom}. Le moteur n'affecte aucun cours à ce bloc (son contenu ` +
            `est ouvert), il ne peut donc pas vérifier cette règle — il la rapporte.${suffixe}`,
    };
  });
}
