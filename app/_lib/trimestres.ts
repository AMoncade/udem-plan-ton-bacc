/**
 * Les trimestres, et leur ORDRE. L'année universitaire d'UdeM s'ouvre à
 * l'automne, mais à l'intérieur d'une année civile l'ordre chronologique est
 * Hiver → Été → Automne. Un planificateur qui classe par saison alphabétique
 * annonce qu'un préalable d'hiver 2027 est satisfait pour un cours d'automne
 * 2026 : faux, et rien ne le signale.
 */
import type { Saison, Trimestre } from "../../lib/types";

/** Ordre chronologique à l'intérieur d'une année civile. */
export const SAISONS: readonly Saison[] = ["Hiver", "Été", "Automne"] as const;

export function ordreTrimestre(t: Trimestre): number {
  return t.annee * 3 + SAISONS.indexOf(t.saison);
}

export function cleTrimestre(t: Trimestre): string {
  return `${t.annee}-${t.saison}`;
}

export function memeTrimestre(a: Trimestre, b: Trimestre): boolean {
  return a.annee === b.annee && a.saison === b.saison;
}

export function libelleTrimestre(t: Trimestre): string {
  return `${t.saison} ${t.annee}`;
}

/** Forme compacte pour un en-tête de colonne : « H27 », « E27 », « A26 ». */
export function sigleTrimestre(t: Trimestre): string {
  const lettre = t.saison === "Automne" ? "A" : t.saison === "Hiver" ? "H" : "E";
  return `${lettre}${String(t.annee).slice(2)}`;
}

/** « à l'automne », « à l'hiver », « à l'été » — les trois élident. */
export function aLaSaison(saison: Saison): string {
  return `à l'${saison.toLowerCase()}`;
}

export function trimestreSuivant(t: Trimestre): Trimestre {
  const i = SAISONS.indexOf(t.saison);
  return i === SAISONS.length - 1
    ? { saison: SAISONS[0], annee: t.annee + 1 }
    : { saison: SAISONS[i + 1], annee: t.annee };
}

/** Suite de `nombre` trimestres à partir de `debut`, inclus. */
export function horizon(debut: Trimestre, nombre: number): Trimestre[] {
  const suite: Trimestre[] = [];
  let courant = debut;
  for (let i = 0; i < nombre; i += 1) {
    suite.push(courant);
    courant = trimestreSuivant(courant);
  }
  return suite;
}

/**
 * Horizon par défaut du planificateur : trois ans à partir de l'automne 2026,
 * qui est le premier trimestre couvert par l'horaire de la fixture.
 */
export const HORIZON_DEFAUT: Trimestre[] = horizon({ saison: "Automne", annee: 2026 }, 9);
