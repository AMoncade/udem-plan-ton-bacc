/**
 * DÉPLIAGE DES RÉCURRENCES — juste assez pour compter des séances.
 *
 * Pourquoi c'est nécessaire, et pourquoi le brief se trompait dessus :
 * `synchro-calendrier` écrit UN SEUL VEVENT par plage horaire, avec
 * `RRULE:FREQ=WEEKLY;UNTIL=…` et des `EXDATE` pour la relâche. Compter les
 * VEVENT donnerait donc 4 « séances » pour MAT 1400 (deux jours de semaine ×
 * deux plages, avant et après la relâche) au lieu des 26 réelles — et 1 pour un
 * cours dont seul l'examen figure au fichier. Le signal « un cours à une seule
 * séance est plus douteux qu'un cours à trente » n'existe qu'après dépliage.
 *
 * Ce module ne prétend pas implémenter la RFC 5545 §3.8.5.3. Il déplie FREQ
 * WEEKLY et DAILY, les seules que produisent les horaires UdeM, et signale par
 * une remarque tout ce qu'il n'a pas su déplier. Jamais de repli muet.
 */
import { ajouterJours, analyserDateICS } from "./dates";

export interface RegleRecurrence {
  freq: string;
  interval: number;
  /** « AAAA-MM-JJ » issu de UNTIL, ou `null`. */
  until: string | null;
  count: number | null;
  /** Parties de la règle que ce module ignore (BYMONTH, WKST, …). */
  ignorees: string[];
}

/** Garde-fou : une règle sans UNTIL ni COUNT ne doit pas boucler. */
export const PLAFOND_OCCURRENCES = 200;

export function analyserRrule(valeur: string): RegleRecurrence {
  const regle: RegleRecurrence = {
    freq: "",
    interval: 1,
    until: null,
    count: null,
    ignorees: [],
  };
  for (const partie of valeur.split(";")) {
    const egal = partie.indexOf("=");
    if (egal === -1) continue;
    const cle = partie.slice(0, egal).trim().toUpperCase();
    const val = partie.slice(egal + 1).trim();
    switch (cle) {
      case "FREQ":
        regle.freq = val.toUpperCase();
        break;
      case "INTERVAL": {
        const n = Number(val);
        if (Number.isInteger(n) && n > 0) regle.interval = n;
        else regle.ignorees.push(partie);
        break;
      }
      case "UNTIL": {
        const d = analyserDateICS(val);
        if (d === null) regle.ignorees.push(partie);
        else regle.until = d.date;
        break;
      }
      case "COUNT": {
        const n = Number(val);
        if (Number.isInteger(n) && n > 0) regle.count = n;
        else regle.ignorees.push(partie);
        break;
      }
      default:
        regle.ignorees.push(partie);
    }
  }
  return regle;
}

export interface Occurrences {
  /** Dates « AAAA-MM-JJ », triées, EXDATE déjà retirées. */
  dates: string[];
  remarques: string[];
}

/**
 * Dates des séances d'un évènement.
 *
 * Sur la comparaison à UNTIL : `DTSTART` est en heure locale (`TZID=America/
 * Toronto`) alors que `UNTIL` doit être en UTC (RFC 5545 §3.3.10), donc
 * « 23:59:59 le 16 octobre » s'écrit « 20261017T035959Z » — la veille du point
 * de vue du fuseau. On compare ici la DATE locale de l'occurrence à la DATE UTC
 * de UNTIL, bornes incluses. C'est exact pour les trois générateurs observés,
 * parce que `UNTIL` y est toujours calé sur une date qui EST une occurrence : le
 * lendemain n'en est jamais une (7 ≠ 1). Le cas limite théorique — une
 * occurrence qui tomberait le lendemain de la fin voulue — surcompterait d'une
 * séance sur un compteur de confiance, ce qui reste sans conséquence.
 */
export function occurrences(
  debut: string,
  regle: RegleRecurrence | null,
  exdates: string[],
): Occurrences {
  const remarques: string[] = [];
  if (regle === null) return { dates: [debut], remarques };

  let pas: number;
  if (regle.freq === "WEEKLY") pas = 7 * regle.interval;
  else if (regle.freq === "DAILY") pas = regle.interval;
  else {
    remarques.push(
      `récurrence « FREQ=${regle.freq || "?"} » non dépliée : une seule séance comptée.`,
    );
    return { dates: [debut], remarques };
  }

  const brutes: string[] = [];
  let date = debut;
  for (let i = 0; i < PLAFOND_OCCURRENCES; i += 1) {
    if (regle.count !== null && i >= regle.count) break;
    if (regle.until !== null && date > regle.until) break;
    brutes.push(date);
    date = ajouterJours(date, pas);
  }
  if (brutes.length === PLAFOND_OCCURRENCES) {
    remarques.push(
      `récurrence sans fin lisible : compte arrêté à ${PLAFOND_OCCURRENCES} séances.`,
    );
  }

  const exclues = new Set(exdates);
  const dates = brutes.filter((d) => !exclues.has(d));

  // Une EXDATE qui ne tombe sur aucune occurrence veut dire que la règle a été
  // mal comprise. Le dire plutôt que de rendre un compte faussement propre.
  const orphelines = exdates.filter((d) => !brutes.includes(d));
  if (orphelines.length > 0) {
    remarques.push(
      `${orphelines.length} date d'exclusion hors de la série (${orphelines.join(", ")}).`,
    );
  }
  if (regle.ignorees.length > 0) {
    remarques.push(`parties de récurrence ignorées : ${regle.ignorees.join(", ")}.`);
  }
  return { dates, remarques };
}
