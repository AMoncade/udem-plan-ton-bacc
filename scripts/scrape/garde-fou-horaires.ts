/**
 * Garde-fou de la passe d'horaires : compare deux dossiers `data/cours` (avant,
 * après) et refuse une chute d'horaires qui ressemble à une panne plutôt qu'à un
 * changement de calendrier.
 *
 *   node --experimental-strip-types scripts/scrape/garde-fou-horaires.ts <avant> <après> [--aujourdhui AAAA-MM-JJ]
 *
 * Code de sortie 1 et message qui nomme le trimestre et les chiffres si, pour un
 * trimestre NON TERMINÉ, le nombre de séances ou le nombre de fiches qui en ont
 * au moins une :
 *   - tombe à 0 ;
 *   - ou perd plus de 50 %.
 * Un trimestre nouveau, stable ou en hausse passe.
 *
 * Un trimestre est « terminé » quand la plus grande date `au` de ses séances,
 * dans AVANT, est passée : l'Automne 2026 disparaîtra légitimement des pages en
 * janvier, et le garde-fou ne doit pas crier à ce moment-là.
 *
 * Ce fichier ne dépend d'aucun module relatif (les imports de types sont
 * effacés) : il s'exécute tel quel avec `--experimental-strip-types`, sans le
 * résolveur d'imports de `index.ts`.
 */
import type { Cours } from "../../lib/types";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Part maximale de perte tolérée sur un trimestre non terminé. */
export const PERTE_MAX = 0.5;

/** Le seul morceau d'une fiche que le garde-fou lit. */
export type FicheHoraires = Pick<Cours, "apercuHoraires">;

export interface LigneTrimestre {
  /** « Hiver 2027 » */
  libelle: string;
  seancesAvant: number;
  seancesApres: number;
  fichesAvant: number;
  fichesApres: number;
  /** Plus grande date `au` d'AVANT, ou null si AVANT n'a aucune séance. */
  finAvant: string | null;
  termine: boolean;
}

export interface Verdict {
  lignes: LigneTrimestre[];
  /** Un message par trimestre fautif ; vide = tout va bien. */
  echecs: string[];
}

interface Compte {
  seances: number;
  fiches: number;
  fin: string | null;
}

/** Clé de tri chronologique : l'année, puis Hiver < Été < Automne. */
const RANG_SAISON: Record<string, number> = { Hiver: 1, "Été": 2, Automne: 3 };

function compter(fiches: FicheHoraires[]): Map<string, Compte> {
  const out = new Map<string, Compte>();
  for (const fiche of fiches) {
    for (const apercu of fiche.apercuHoraires ?? []) {
      const cle = `${apercu.trimestre.annee}|${apercu.trimestre.saison}`;
      const c = out.get(cle) ?? { seances: 0, fiches: 0, fin: null };
      let dansCetteFiche = 0;
      for (const section of apercu.sections) {
        for (const seance of section.seances) {
          dansCetteFiche += 1;
          if (c.fin === null || seance.au > c.fin) c.fin = seance.au;
        }
      }
      c.seances += dansCetteFiche;
      // Une fiche compte UNE fois par trimestre, et seulement si elle y a une séance.
      if (dansCetteFiche > 0) c.fiches += 1;
      out.set(cle, c);
    }
  }
  return out;
}

function libelleDe(cle: string): string {
  const [annee, saison] = cle.split("|");
  return `${saison} ${annee}`;
}

function ordre(a: string, b: string): number {
  const [anneeA, saisonA] = a.split("|");
  const [anneeB, saisonB] = b.split("|");
  return Number(anneeA) - Number(anneeB) || (RANG_SAISON[saisonA] ?? 0) - (RANG_SAISON[saisonB] ?? 0);
}

/**
 * Compare AVANT et APRÈS. Pure : `aujourdhui` (AAAA-MM-JJ) est un paramètre pour
 * que les tests ne dépendent pas de l'horloge.
 */
export function comparerHoraires(
  avant: FicheHoraires[],
  apres: FicheHoraires[],
  aujourdhui: string,
): Verdict {
  const cAvant = compter(avant);
  const cApres = compter(apres);
  const cles = [...new Set([...cAvant.keys(), ...cApres.keys()])].sort(ordre);

  const lignes: LigneTrimestre[] = [];
  const echecs: string[] = [];

  for (const cle of cles) {
    const a = cAvant.get(cle) ?? { seances: 0, fiches: 0, fin: null };
    const p = cApres.get(cle) ?? { seances: 0, fiches: 0, fin: null };
    // Terminé = on SAIT que la dernière séance est passée. Sans date dans AVANT
    // (aucune séance), on ne peut pas le prouver ; mais alors il n'y a rien à perdre.
    const termine = a.fin !== null && a.fin < aujourdhui;
    const ligne: LigneTrimestre = {
      libelle: libelleDe(cle),
      seancesAvant: a.seances,
      seancesApres: p.seances,
      fichesAvant: a.fiches,
      fichesApres: p.fiches,
      finAvant: a.fin,
      termine,
    };
    lignes.push(ligne);
    if (termine) continue;

    const verifier = (nom: string, avantN: number, apresN: number): void => {
      if (avantN === 0) return;
      if (apresN === 0) {
        echecs.push(`${ligne.libelle} : ${nom} passent de ${avantN} à 0 (le trimestre n'est pas terminé).`);
      } else if (apresN < avantN * (1 - PERTE_MAX)) {
        const perte = Math.round((1 - apresN / avantN) * 100);
        echecs.push(
          `${ligne.libelle} : ${nom} passent de ${avantN} à ${apresN} (-${perte} %, seuil ${Math.round(PERTE_MAX * 100)} %).`,
        );
      }
    };
    verifier("les séances", a.seances, p.seances);
    verifier("les fiches avec séances", a.fiches, p.fiches);
  }
  return { lignes, echecs };
}

/** Lit toutes les fiches d'un dossier `data/cours` (un `<SUJET>.json` par sujet). */
export function lireDossierCours(dossier: string): FicheHoraires[] {
  const fiches: FicheHoraires[] = [];
  for (const f of readdirSync(dossier).filter((n) => n.endsWith(".json")).sort()) {
    const brut = JSON.parse(readFileSync(path.join(dossier, f), "utf8")) as Record<string, FicheHoraires>;
    for (const [code, fiche] of Object.entries(brut)) {
      if (!code.startsWith("_")) fiches.push(fiche);
    }
  }
  return fiches;
}

/** Tableau lisible, pour la console et le résumé de job. */
export function formaterVerdict(v: Verdict): string {
  const sortie = ["Trimestre            séances (avant -> après)   fiches (avant -> après)"];
  for (const l of v.lignes) {
    sortie.push(
      `${l.libelle.padEnd(20)} ${`${l.seancesAvant} -> ${l.seancesApres}`.padEnd(26)} ` +
        `${`${l.fichesAvant} -> ${l.fichesApres}`.padEnd(24)}${l.termine ? ` terminé le ${l.finAvant}, ignoré` : ""}`,
    );
  }
  return sortie.join("\n");
}

function principal(argv: string[]): number {
  const positionnels: string[] = [];
  let aujourdhui = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--aujourdhui") {
      const valeur = argv[i + 1];
      if (valeur === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
        console.error("--aujourdhui attend une date AAAA-MM-JJ");
        return 2;
      }
      aujourdhui = valeur;
      i += 1;
    } else {
      positionnels.push(argv[i]);
    }
  }
  if (positionnels.length !== 2) {
    console.error("usage : garde-fou-horaires.ts <dossier-avant> <dossier-après> [--aujourdhui AAAA-MM-JJ]");
    return 2;
  }
  const verdict = comparerHoraires(
    lireDossierCours(positionnels[0]),
    lireDossierCours(positionnels[1]),
    aujourdhui,
  );
  console.log(`Garde-fou des horaires (aujourd'hui : ${aujourdhui})\n${formaterVerdict(verdict)}`);
  if (verdict.echecs.length > 0) {
    console.error(`\nÉCHEC du garde-fou :\n${verdict.echecs.map((e) => `  - ${e}`).join("\n")}`);
    return 1;
  }
  console.log("\nGarde-fou : aucun trimestre en cours n'a chuté.");
  return 0;
}

// N'agit que lancé directement : vitest importe ce module pour tester `comparerHoraires`.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = principal(process.argv.slice(2));
}
