/**
 * DATES ICS -> TRIMESTRE UdeM.
 *
 * Aucune dépendance, aucun `Date` local dans les comparaisons : les dates
 * circulent en « AAAA-MM-JJ », qui se compare et se trie par ordre
 * lexicographique. Passer par `new Date("20260901")` donnerait des décalages
 * d'un jour selon le fuseau de la machine, et le bogue serait invisible à
 * Montréal en été.
 */
import type { Saison, Trimestre } from "../types";

export interface DateICS {
  /** « AAAA-MM-JJ ». */
  date: string;
  /** « HH:MM », ou `null` pour une valeur `VALUE=DATE` (journée entière). */
  heure: string | null;
  /** Vrai si la valeur portait le `Z` final, donc exprimée en UTC. */
  utc: boolean;
}

const FORME = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;

/**
 * « 20260901T083000 », « 20261017T035959Z » et « 20260908 » (VALUE=DATE).
 * Rend `null` sur tout le reste — y compris une date de calendrier impossible
 * comme « 20260231 », qu'un `new Date()` accepterait en glissant au 3 mars.
 */
export function analyserDateICS(valeur: string): DateICS | null {
  const m = FORME.exec(valeur.trim());
  if (m === null) return null;
  const [, aa, mm, jj, hh, mi, , z] = m;
  const annee = Number(aa);
  const mois = Number(mm);
  const jour = Number(jj);
  if (mois < 1 || mois > 12 || jour < 1 || jour > joursDansMois(annee, mois)) return null;
  if (hh !== undefined && (Number(hh) > 23 || Number(mi) > 59)) return null;
  return {
    date: `${aa}-${mm}-${jj}`,
    heure: hh === undefined ? null : `${hh}:${mi}`,
    utc: z === "Z",
  };
}

function joursDansMois(annee: number, mois: number): number {
  if (mois === 2) return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0 ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
}

/** « 2026-09-01 » + 7 -> « 2026-09-08 ». Arithmétique en UTC, jamais locale. */
export function ajouterJours(date: string, n: number): string {
  const t = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  return isoDe(new Date(t + n * 86_400_000));
}

/** « AAAA-MM-JJ » d'un instant, lu en UTC. */
function isoDe(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Date du jour en heure locale de la machine, en « AAAA-MM-JJ ».
 * Locale et non UTC : « le trimestre est-il fini » est une question que
 * l'étudiant se pose dans son propre fuseau, et à Montréal `toISOString()`
 * avance d'un jour dès 20 h.
 */
export function dateLocale(maintenant: Date): string {
  const mois = `${maintenant.getMonth() + 1}`.padStart(2, "0");
  const jour = `${maintenant.getDate()}`.padStart(2, "0");
  return `${maintenant.getFullYear()}-${mois}-${jour}`;
}

/**
 * BORNES DES TRIMESTRES — la seule décision arbitraire de ce fichier, donc
 * écrite en clair.
 *
 *   Hiver   : 1er janvier   -> 30 avril
 *   Été     : 1er mai       -> 15 août
 *   Automne : 16 août       -> 31 décembre
 *
 * Le calendrier du registraire relayé par `synchro-calendrier`
 * (`src/core/calendar-udem.ts`) donne Automne 2026 du 2026-09-01 au 2026-12-23
 * et Été 2027 du 2027-05-03 au 2027-08-13. Une règle « septembre à décembre »
 * serait pourtant fausse : l'horaire A26 réellement exporté commence des
 * séances le **2026-08-31** (MAT 1500, MAT 1600, STT 1700). Le 16 août tombe
 * dans le creux entre la fin d'Été et le début d'Automne, et classe donc
 * correctement les deux.
 */
export function saisonDe(date: string): Saison {
  const md = date.slice(5);
  if (md <= "04-30") return "Hiver";
  if (md <= "08-15") return "Été";
  return "Automne";
}

export function trimestreDe(date: string): Trimestre {
  return { saison: saisonDe(date), annee: Number(date.slice(0, 4)) };
}

export function memeTrimestre(a: Trimestre, b: Trimestre): boolean {
  return a.saison === b.saison && a.annee === b.annee;
}

export function libelleTrimestre(t: Trimestre): string {
  return `${t.saison} ${t.annee}`;
}

const SAISON_PAR_MOT: Record<string, Saison> = {
  automne: "Automne",
  hiver: "Hiver",
  été: "Été",
  ete: "Été",
};

/** « UdeM — Automne 2026 » -> { saison: "Automne", annee: 2026 }. */
export function trimestreDansTexte(texte: string): Trimestre | null {
  const m = /(automne|hiver|été|ete)\s+(\d{4})/i.exec(texte);
  if (m === null) return null;
  const saison = SAISON_PAR_MOT[m[1].toLowerCase()];
  if (saison === undefined) return null;
  return { saison, annee: Number(m[2]) };
}

const SAISON_PAR_LETTRE: Record<string, Saison> = {
  A: "Automne",
  H: "Hiver",
  E: "Été",
};

/**
 * Code de trimestre Synchro en tête de chaque UID : « A26 » -> Automne 2026.
 *
 * La forme `[AHE]\d{2}` vient du modèle de l'extension (`Term.code`) et de son
 * module StudiUM. L'année est sur deux chiffres, donc complétée en 20xx : ce
 * planificateur lit des relevés d'études, pas des archives du siècle dernier.
 */
export function trimestreDeCodeTerme(code: string): Trimestre | null {
  const m = /^([AHE])(\d{2})$/.exec(code.toUpperCase());
  if (m === null) return null;
  return { saison: SAISON_PAR_LETTRE[m[1]], annee: 2000 + Number(m[2]) };
}
