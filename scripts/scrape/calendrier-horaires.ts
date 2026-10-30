/**
 * Faut-il lancer la passe d'horaires CE lundi ? Décision du job « decider » de
 * `.github/workflows/scrape-horaires.yml`.
 *
 *   PERIODES_INSCRIPTION="03-01:09-15,10-15:01-31" FORCER=false \
 *     node --experimental-strip-types scripts/scrape/calendrier-horaires.ts [AAAA-MM-JJ]
 *
 * Écrit `executer=true|false` et `raison=…` dans `$GITHUB_OUTPUT` quand il est
 * défini, et sur la sortie standard dans tous les cas.
 *
 * Pourquoi un script testé plutôt que du bash dans le YAML : la décision tient à
 * un intervalle qui peut chevaucher le Nouvel An, et une erreur ici se manifeste
 * par une passe qui ne tourne jamais — sans qu'aucun travail n'échoue. Un cron
 * silencieux ne se voit pas.
 *
 * Aucun import relatif : exécutable tel quel avec `--experimental-strip-types`.
 */
import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface Periode {
  /** « MM-JJ » */
  de: string;
  /** « MM-JJ » */
  a: string;
}

/**
 * Lit « 03-01:09-15,10-15:01-31 ». Une période dont `de` > `a` chevauche le
 * Nouvel An (ex. `12-15:01-10`). Lève sur une forme illisible : une période mal
 * recopiée dans le YAML ne doit pas se lire comme « jamais ».
 */
export function lirePeriodes(spec: string): Periode[] {
  const periodes: Periode[] = [];
  for (const morceau of spec.split(",").map((s) => s.trim()).filter((s) => s !== "")) {
    const m = /^(\d{2}-\d{2}):(\d{2}-\d{2})$/.exec(morceau);
    if (!m || !moisJourValide(m[1]) || !moisJourValide(m[2])) {
      throw new Error(`période illisible « ${morceau} » (attendu MM-JJ:MM-JJ, ex. 03-01:09-15)`);
    }
    periodes.push({ de: m[1], a: m[2] });
  }
  return periodes;
}

function moisJourValide(mj: string): boolean {
  const [mois, jour] = mj.split("-").map(Number);
  return mois >= 1 && mois <= 12 && jour >= 1 && jour <= 31;
}

/** `dateISO` (AAAA-MM-JJ) tombe-t-elle dans une des périodes, bornes comprises ? */
export function enPeriode(dateISO: string, periodes: Periode[]): boolean {
  const mj = dateISO.slice(5, 10);
  return periodes.some((p) => (p.de <= p.a ? mj >= p.de && mj <= p.a : mj >= p.de || mj <= p.a));
}

/** Premier lundi du mois : un lundi dont le quantième est de 1 à 7. */
export function premierLundiDuMois(dateISO: string): boolean {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return d.getUTCDay() === 1 && d.getUTCDate() <= 7;
}

export interface Decision {
  executer: boolean;
  raison: string;
}

export function decider(dateISO: string, periodesSpec: string, forcer: boolean): Decision {
  if (forcer) return { executer: true, raison: "lancement forcé" };
  if (enPeriode(dateISO, lirePeriodes(periodesSpec))) {
    return { executer: true, raison: `${dateISO} tombe dans une période d'inscription (${periodesSpec})` };
  }
  if (premierLundiDuMois(dateISO)) {
    return { executer: true, raison: `${dateISO} est le premier lundi du mois` };
  }
  return {
    executer: false,
    raison: `${dateISO} : hors période d'inscription (${periodesSpec}) et pas le premier lundi du mois`,
  };
}

function principal(argv: string[]): number {
  const dateISO = argv[0] ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    console.error(`date illisible « ${dateISO} » (attendu AAAA-MM-JJ)`);
    return 2;
  }
  const periodes = process.env.PERIODES_INSCRIPTION ?? "";
  const forcer = (process.env.FORCER ?? "").toLowerCase() === "true";
  let d: Decision;
  try {
    d = decider(dateISO, periodes, forcer);
  } catch (cause) {
    console.error(String(cause instanceof Error ? cause.message : cause));
    return 2;
  }
  console.log(`executer=${d.executer}\nraison=${d.raison}`);
  const sortie = process.env.GITHUB_OUTPUT;
  if (sortie) appendFileSync(sortie, `executer=${d.executer}\nraison=${d.raison}\n`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = principal(process.argv.slice(2));
}
