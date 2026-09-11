/**
 * LECTEUR D'HORAIRE ICS — pur, sans réseau, sans disque, sans dépendance npm.
 *
 * Entrée : le texte d'un fichier .ics (ou du texte collé). Sortie : un
 * `ResultatImportICS`, c'est-à-dire une LISTE DE PROPOSITIONS. Ce module ne
 * touche jamais à l'état de l'étudiant : un horaire atteste qu'un cours a été
 * SUIVI, pas qu'il a été RÉUSSI. Un cours abandonné à la semaine 6 et un cours
 * échoué au final y laissent la même trace qu'un cours réussi.
 *
 * Trois générateurs réels ont servi de référence (voir `libelle.ts` pour leurs
 * SUMMARY) : `synchro-calendrier` 0.2, `synchro-calendrier` actuel, et un export
 * tiers. Les fixtures de `__fixtures__/` en sont tirées telles quelles.
 */
import { extraireCodes } from "../codes";
import type { CodeCours, Trimestre } from "../types";
import { analyserPropriete, deplier, deshapperTexte } from "./deplier";
import {
  analyserDateICS,
  dateLocale,
  libelleTrimestre,
  memeTrimestre,
  trimestreDansTexte,
  trimestreDe,
  trimestreDeCodeTerme,
} from "./dates";
import { choisirLibelle, type SourceLibelle } from "./libelle";
import { analyserRrule, occurrences, type RegleRecurrence } from "./recurrence";
import type { CoursTrouveICS, EvenementIgnoreICS, ResultatImportICS } from "./types";

export interface OptionsLecture {
  /** Injecté pour que « le trimestre est-il terminé » soit testable. */
  maintenant?: Date;
}

/**
 * Sigles qu'UdeM écrit mais que `normaliserCode()` refuse : 199 codes suffixés
 * (« DRT 1151G », « MUI 1162A ») et quatre à cinq chiffres (« PSY 40001 »),
 * d'après `docs/CONTRAT.md`. `lib/codes.ts` est gelé, donc ce lecteur ne peut
 * pas les normaliser — mais il ne les laisse pas disparaître : l'évènement part
 * dans `ignores` avec le jeton en clair.
 */
const JETON_HORS_CONTRAT = /\b[A-Za-z]{3}[\s\-_]?(?:\d{4}[A-Za-z]|\d{5})\b/g;

/**
 * SÉANCE DE COURS OU ÉVÈNEMENT PONCTUEL.
 *
 * Discriminant, dans l'ordre : `CATEGORIES` quand le fichier en porte (format
 * v2 : `Cours`, `Examen`, `Échéance`), sinon la présence d'une `RRULE` — dans
 * l'horaire réel v1, une séance en a toujours une et un examen jamais.
 *
 * Pas les mots-clés du libellé : `Exam.label` est un champ libre chez le
 * générateur (« MAT1400 — Test 2 » figure dans ses propres tests), donc chercher
 * « examen » ou « quiz » dans le SUMMARY classe au hasard.
 */
type GenreEvenement = "cours" | "ponctuel";

interface EvenementBrut {
  rang: number;
  resume: string;
  description: string;
  uid: string;
  categories: string;
  dtstartBrut: string | null;
  dtstart: string | null;
  rrule: RegleRecurrence | null;
  exdates: string[];
  rdates: string[];
}

function genreDe(evenement: EvenementBrut): GenreEvenement {
  const categories = sansAccents(evenement.categories).toLowerCase();
  if (categories !== "") {
    if (categories.includes("cours")) return "cours";
    if (categories.includes("examen") || categories.includes("echeance")) return "ponctuel";
  }
  return evenement.rrule === null ? "ponctuel" : "cours";
}

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

interface Accumulateur {
  code: CodeCours;
  dates: string[];
  nbSeances: number;
  nbPonctuels: number;
  nbEvenements: number;
  resumes: string[];
  pourLibelle: SourceLibelle[];
  remarques: string[];
}

export function lireICS(texte: string, options: OptionsLecture = {}): ResultatImportICS {
  const maintenant = options.maintenant ?? new Date();
  const problemes: string[] = [];
  const vide: ResultatImportICS = {
    cours: [],
    ignores: [],
    nbEvenements: 0,
    calendrier: null,
    trimestreDeclare: null,
    estICS: false,
    problemes,
  };

  if (texte.trim() === "") {
    problemes.push("Le fichier est vide : rien à lire.");
    return vide;
  }

  const lignes = deplier(texte);
  const { evenements, calendrier, estICS, illisibles, desequilibre } = parcourir(lignes);

  if (!estICS) {
    problemes.push(
      "Aucune ligne « BEGIN:VCALENDAR » : ce texte n'est pas un fichier ICS. " +
        "Exportez votre horaire depuis l'extension synchro-calendrier, ou collez " +
        "le contenu du fichier .ics.",
    );
    return { ...vide, calendrier, problemes };
  }
  if (illisibles > 0) {
    problemes.push(
      `${illisibles} ligne${illisibles === 1 ? "" : "s"} n'${illisibles === 1 ? "a" : "ont"} pas la forme « NOM:valeur » et ${illisibles === 1 ? "a" : "ont"} été ignorée${illisibles === 1 ? "" : "s"}.`,
    );
  }
  if (desequilibre) {
    problemes.push(
      "Le fichier a des blocs BEGIN/END mal appariés : la lecture a pu manquer des évènements.",
    );
  }
  if (evenements.length === 0) {
    problemes.push("Le fichier est bien de l'ICS, mais ne contient aucun évènement.");
  }

  const trimestreDeclare =
    (calendrier === null ? null : trimestreDansTexte(calendrier)) ?? trimestreDesUid(evenements);
  const ignores: EvenementIgnoreICS[] = [];
  const parCode = new Map<CodeCours, Accumulateur>();

  for (const evenement of evenements) {
    // LE SIGLE SE CHERCHE DANS LE SUMMARY BRUT, déséchappé mais jamais
    // pré-nettoyé. Retirer les tirets pour accepter « act-2250 » transformerait
    // « MAT 1400-A » en « MAT1400A », que normaliserCode() lit comme un cours
    // suffixé parfaitement valide, indiscernable d'un vrai « DRT 1151G » : on
    // fabriquerait un cours qui n'existe pas. C'est extraireCodes() qui coupe la
    // section, pas un replace().
    let codes = [...new Set(extraireCodes(evenement.resume))];
    let venuDeLUid = false;
    if (codes.length === 0) {
      // Recours : l'UID porte le sigle en 2e position
      // (« A26-MAT1400-A-TH-2-0830@synchro-calendrier »). JAMAIS la DESCRIPTION,
      // qui ne contient pas le sigle et peut citer un AUTRE cours (« voir
      // MAT1600 ») — un repli dessus inventerait un cours réussi.
      const deLUid = [...new Set(extraireCodes(evenement.uid))];
      if (deLUid.length > 0) {
        codes = deLUid;
        venuDeLUid = true;
      }
    }
    if (codes.length === 0) {
      ignores.push({
        rang: evenement.rang,
        resume: evenement.resume === "" ? null : evenement.resume,
        debut: evenement.dtstartBrut,
        raison: raisonDeLIgnorance(evenement.resume),
      });
      continue;
    }

    const genre = genreDe(evenement);
    const { dates, remarques } = datesDe(evenement);
    for (const code of codes) {
      let acc = parCode.get(code);
      if (acc === undefined) {
        acc = {
          code,
          dates: [],
          nbSeances: 0,
          nbPonctuels: 0,
          nbEvenements: 0,
          resumes: [],
          pourLibelle: [],
          remarques: [],
        };
        parCode.set(code, acc);
      }
      acc.nbEvenements += 1;
      acc.dates.push(...dates);
      if (genre === "ponctuel") acc.nbPonctuels += 1;
      else acc.nbSeances += Math.max(1, dates.length);
      if (evenement.resume !== "" && !acc.resumes.includes(evenement.resume)) {
        acc.resumes.push(evenement.resume);
      }
      acc.pourLibelle.push({
        resume: evenement.resume,
        description: evenement.description,
        codes,
      });
      for (const remarque of remarques) {
        if (!acc.remarques.includes(remarque)) acc.remarques.push(remarque);
      }
      if (venuDeLUid) {
        ajouter(
          acc.remarques,
          `sigle tiré de l'UID (« ${evenement.uid} ») : le résumé de l'évènement n'en portait aucun.`,
        );
      }
      if (codes.length > 1) {
        const autres = codes.filter((c) => c !== code).join(", ");
        ajouter(
          acc.remarques,
          `l'évènement « ${evenement.resume} » cite aussi ${autres} : les séances sont comptées pour chacun.`,
        );
      }
    }
  }

  const aujourdhui = dateLocale(maintenant);
  const cours = [...parCode.values()]
    .map((acc) => acheverCours(acc, aujourdhui, trimestreDeclare))
    .sort(
      (a, b) =>
        b.nbSeances - a.nbSeances ||
        b.nbPonctuels - a.nbPonctuels ||
        a.code.localeCompare(b.code),
    );

  return {
    cours,
    ignores,
    nbEvenements: evenements.length,
    calendrier,
    trimestreDeclare,
    estICS: true,
    problemes,
  };
}

function ajouter(liste: string[], texte: string): void {
  if (!liste.includes(texte)) liste.push(texte);
}

/**
 * Trimestre déclaré par les UID, quand `X-WR-CALNAME` ne dit rien : Synchro
 * préfixe chaque UID de son code de trimestre (« A26-… »). Le plus fréquent
 * gagne ; à égalité, rien n'est déclaré.
 */
function trimestreDesUid(evenements: EvenementBrut[]): Trimestre | null {
  const comptes = new Map<string, { trimestre: Trimestre; compte: number }>();
  for (const evenement of evenements) {
    const prefixe = evenement.uid.split("-")[0];
    const trimestre = trimestreDeCodeTerme(prefixe);
    if (trimestre === null) continue;
    const cle = libelleTrimestre(trimestre);
    const entree = comptes.get(cle);
    if (entree === undefined) comptes.set(cle, { trimestre, compte: 1 });
    else entree.compte += 1;
  }
  const classees = [...comptes.values()].sort((a, b) => b.compte - a.compte);
  if (classees.length === 0) return null;
  if (classees.length > 1 && classees[1].compte === classees[0].compte) return null;
  return classees[0].trimestre;
}

function raisonDeLIgnorance(resume: string): string {
  if (resume.trim() === "") return "évènement sans SUMMARY : aucun sigle à y lire.";
  const jetons = [...new Set(resume.match(JETON_HORS_CONTRAT) ?? [])];
  if (jetons.length > 0) {
    return (
      `« ${jetons.join(" », « ")} » ressemble à un sigle, mais normaliserCode() le refuse : ` +
      "lib/codes.ts ne couvre ni les codes suffixés (DRT 1151G) ni ceux à cinq " +
      "chiffres (PSY 40001), et il est gelé. À entrer à la main."
    );
  }
  return "aucun sigle de cours dans le résumé (examen hors cours, rendez-vous, évènement personnel).";
}

/** Occurrences datées d'un évènement, RRULE dépliée et EXDATE retirées. */
function datesDe(evenement: EvenementBrut): { dates: string[]; remarques: string[] } {
  if (evenement.dtstart === null) {
    const brut = evenement.dtstartBrut;
    return {
      dates: [],
      remarques: [
        brut === null
          ? "un évènement n'a pas de DTSTART : il compte comme une séance sans date."
          : `date de début illisible (« ${brut} ») : l'évènement compte comme une séance sans date.`,
      ],
    };
  }
  const resultat = occurrences(evenement.dtstart, evenement.rrule, evenement.exdates);
  const dates = [...new Set([...resultat.dates, ...evenement.rdates])].sort();
  return { dates, remarques: resultat.remarques };
}

function acheverCours(
  acc: Accumulateur,
  aujourdhui: string,
  trimestreDeclare: Trimestre | null,
): CoursTrouveICS {
  const dates = [...new Set(acc.dates)].sort();
  const premiereSeance = dates[0] ?? null;
  const derniereSeance = dates.length > 0 ? dates[dates.length - 1] : null;
  const remarques = [...acc.remarques];

  const { trimestre, remarque } = deduireTrimestre(dates, trimestreDeclare);
  if (remarque !== null) remarques.push(remarque);

  const libelle = choisirLibelle(acc.pourLibelle);
  if (libelle === null) {
    remarques.push(
      "le fichier ne donne aucun titre, seulement le sigle et le type de séance.",
    );
  }
  if (acc.nbSeances === 0 && acc.nbPonctuels > 0) {
    remarques.push(
      "aucune séance de cours dans le fichier, seulement un évènement ponctuel : " +
        "un examen ou une échéance n'atteste même pas d'avoir suivi le cours.",
    );
  }

  return {
    code: acc.code,
    libelle,
    nbSeances: acc.nbSeances,
    nbPonctuels: acc.nbPonctuels,
    nbEvenements: acc.nbEvenements,
    trimestre,
    trimestreTermine: derniereSeance !== null && derniereSeance < aujourdhui,
    premiereSeance,
    derniereSeance,
    resumes: acc.resumes,
    remarques,
  };
}

/**
 * Trimestre d'un cours : celui de la majorité de ses séances.
 *
 * Le mode plutôt que la première date, parce qu'un examen final de décembre et
 * une séance du 31 août appartiennent au même trimestre d'automne, et qu'une
 * seule date aberrante ne doit pas déplacer le cours. À égalité parfaite entre
 * deux trimestres, on ne tranche pas : `null`, et l'écran le dit.
 */
function deduireTrimestre(
  dates: string[],
  declare: Trimestre | null,
): { trimestre: Trimestre | null; remarque: string | null } {
  if (dates.length === 0) {
    if (declare === null) return { trimestre: null, remarque: null };
    return {
      trimestre: declare,
      remarque: `trimestre repris du nom du calendrier (${libelleTrimestre(declare)}), faute de date lisible.`,
    };
  }

  const comptes = new Map<string, { trimestre: Trimestre; compte: number }>();
  for (const date of dates) {
    const trimestre = trimestreDe(date);
    const cle = libelleTrimestre(trimestre);
    const entree = comptes.get(cle);
    if (entree === undefined) comptes.set(cle, { trimestre, compte: 1 });
    else entree.compte += 1;
  }

  const classees = [...comptes.values()].sort((a, b) => b.compte - a.compte);
  const tete = classees[0];
  if (classees.length > 1 && classees[1].compte === tete.compte) {
    return {
      trimestre: null,
      remarque: `séances réparties à égalité entre ${classees.map((c) => libelleTrimestre(c.trimestre)).join(" et ")} : trimestre non déduit.`,
    };
  }
  if (classees.length > 1) {
    const autres = classees
      .slice(1)
      .map((c) => `${c.compte} en ${libelleTrimestre(c.trimestre)}`)
      .join(", ");
    return {
      trimestre: tete.trimestre,
      remarque: `séances hors du trimestre retenu : ${autres}.`,
    };
  }
  if (declare !== null && !memeTrimestre(declare, tete.trimestre)) {
    return {
      trimestre: tete.trimestre,
      remarque: `le nom du calendrier annonce ${libelleTrimestre(declare)}, les dates donnent ${libelleTrimestre(tete.trimestre)} : ce sont les dates qui tranchent.`,
    };
  }
  return { trimestre: tete.trimestre, remarque: null };
}

interface Parcours {
  evenements: EvenementBrut[];
  calendrier: string | null;
  estICS: boolean;
  illisibles: number;
  desequilibre: boolean;
}

/**
 * Parcourt les lignes logiques et ramasse les VEVENT.
 *
 * La pile de composants n'est pas un luxe : un VEVENT du générateur actuel
 * contient des sous-blocs VALARM dont la DESCRIPTION vaut le SUMMARY de
 * l'évènement. À plat, cette DESCRIPTION écraserait le titre du cours par
 * « MAT1400-A — Théorie », et le cours s'afficherait sans titre. De même,
 * VTIMEZONE contient des DTSTART et des RRULE qui ne sont pas des séances.
 */
function parcourir(lignes: string[]): Parcours {
  const evenements: EvenementBrut[] = [];
  let calendrier: string | null = null;
  let estICS = false;
  let illisibles = 0;
  let desequilibre = false;
  const pile: string[] = [];
  let courant: EvenementBrut | null = null;
  let rang = 0;

  for (const ligne of lignes) {
    if (ligne.trim() === "") continue;
    const propriete = analyserPropriete(ligne);
    if (propriete === null) {
      illisibles += 1;
      continue;
    }
    const { nom, params, valeur } = propriete;

    if (nom === "BEGIN") {
      const composant = valeur.trim().toUpperCase();
      pile.push(composant);
      if (composant === "VCALENDAR") estICS = true;
      if (composant === "VEVENT" && pile.filter((c) => c === "VEVENT").length === 1) {
        rang += 1;
        courant = {
          rang,
          resume: "",
          description: "",
          uid: "",
          categories: "",
          dtstartBrut: null,
          dtstart: null,
          rrule: null,
          exdates: [],
          rdates: [],
        };
      }
      continue;
    }
    if (nom === "END") {
      const composant = valeur.trim().toUpperCase();
      if (pile.length === 0 || pile[pile.length - 1] !== composant) desequilibre = true;
      else pile.pop();
      if (composant === "VEVENT" && courant !== null) {
        evenements.push(courant);
        courant = null;
      }
      continue;
    }

    // Hors de tout VEVENT : seul le nom du calendrier nous intéresse.
    if (courant === null) {
      if (nom === "X-WR-CALNAME") calendrier = deshapperTexte(valeur);
      continue;
    }
    // Dans un sous-bloc du VEVENT (VALARM) : rien à prendre.
    if (pile[pile.length - 1] !== "VEVENT") continue;

    switch (nom) {
      case "SUMMARY":
        courant.resume = deshapperTexte(valeur).trim();
        break;
      case "DESCRIPTION":
        courant.description = deshapperTexte(valeur);
        break;
      case "UID":
        courant.uid = valeur.trim();
        break;
      case "CATEGORIES":
        courant.categories = deshapperTexte(valeur).trim();
        break;
      case "DTSTART": {
        courant.dtstartBrut = params.TZID === undefined ? valeur : `${valeur} (${params.TZID})`;
        courant.dtstart = analyserDateICS(valeur)?.date ?? null;
        break;
      }
      case "RRULE":
        courant.rrule = analyserRrule(valeur);
        break;
      case "EXDATE":
        courant.exdates.push(...datesDeListe(valeur));
        break;
      case "RDATE":
        courant.rdates.push(...datesDeListe(valeur));
        break;
      default:
        break;
    }
  }

  if (pile.length > 0) desequilibre = true;
  // Un VEVENT ouvert et jamais fermé : gardé quand même, pour ne pas perdre un
  // cours à cause d'un fichier tronqué.
  if (courant !== null) evenements.push(courant);

  return { evenements, calendrier, estICS, illisibles, desequilibre };
}

/** « 20261005T153000,20261012T153000 » -> ["2026-10-05", "2026-10-12"]. */
function datesDeListe(valeur: string): string[] {
  const out: string[] = [];
  for (const morceau of valeur.split(",")) {
    const date = analyserDateICS(morceau);
    if (date !== null) out.push(date.date);
  }
  return out;
}
