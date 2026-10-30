/**
 * IMPORT DEPUIS CLIENTSIDE HORAIRE — le lien « Voir l'audit complet → » de
 * l'extension.
 *
 * L'extension ouvre `/audit#import=<JSON encodé>`. Le parcours et les cours
 * voyagent dans le FRAGMENT, que le navigateur n'envoie jamais au serveur :
 * Vercel ne voit qu'une visite de `/audit`. Rien n'est écrit sans que
 * l'étudiant confirme (`components/ImportExtension.tsx`), et l'adresse est
 * nettoyée ensuite.
 *
 * Forme, version 1 :
 *   { v: 1, parcours: "slug#orientation", cheminement: string | null,
 *     faits: CodeCours[], enCours: CodeCours[] }
 *
 * `faits` sont les cours que l'étudiant a cochés réussis ; `enCours` ceux de
 * son horaire actuel, que l'extension compte réussis à la fin du trimestre.
 * Ils restent séparés pour que l'écran de confirmation puisse le dire : un
 * cours en cours n'est pas un cours réussi, et l'importer comme tel doit être
 * une décision de l'étudiant.
 *
 * Tout code passe par `normaliserCode()` ; ceux qu'il refuse sont rendus à
 * part plutôt qu'avalés.
 */
import { normaliserCode } from "../../lib/codes";
import { lireCleParcours } from "../../lib/parcours";
import type { CodeCours } from "../../lib/types";

export interface ImportExtension {
  parcours: string;
  cheminement: string | null;
  faits: CodeCours[];
  enCours: CodeCours[];
  /** Codes refusés par `normaliserCode()`, montrés tels quels. */
  illisibles: string[];
}

const PREFIXE = "#import=";

function codes(brut: unknown, illisibles: string[]): CodeCours[] | null {
  if (!Array.isArray(brut)) return null;
  const sortie: CodeCours[] = [];
  for (const x of brut) {
    if (typeof x !== "string") return null;
    const code = normaliserCode(x);
    if (code === null) illisibles.push(x);
    else if (!sortie.includes(code)) sortie.push(code);
  }
  return sortie;
}

/**
 * Lit `location.hash`. `null` quand il ne porte pas d'import, ou un import
 * qu'on ne sait pas lire : mieux vaut ne rien proposer que proposer de travers.
 */
export function lireImportExtension(hash: string): ImportExtension | null {
  if (!hash.startsWith(PREFIXE)) return null;
  let valeur: unknown;
  try {
    valeur = JSON.parse(decodeURIComponent(hash.slice(PREFIXE.length)));
  } catch {
    return null;
  }
  if (typeof valeur !== "object" || valeur === null) return null;
  const v = valeur as Record<string, unknown>;
  if (v.v !== 1 || typeof v.parcours !== "string" || lireCleParcours(v.parcours) === null) return null;
  if (v.cheminement !== null && typeof v.cheminement !== "string") return null;
  const illisibles: string[] = [];
  const faits = codes(v.faits, illisibles);
  const enCours = codes(v.enCours ?? [], illisibles);
  if (faits === null || enCours === null) return null;
  return {
    parcours: v.parcours,
    cheminement: v.cheminement,
    faits,
    enCours: enCours.filter((c) => !faits.includes(c)),
    illisibles,
  };
}

/** Les cours faits APRÈS import : l'union, sans rien retirer de ce qui était coché. */
export function fusionnerFaits(actuels: CodeCours[], importe: ImportExtension, avecEnCours: boolean): CodeCours[] {
  const sortie = [...actuels];
  for (const code of [...importe.faits, ...(avecEnCours ? importe.enCours : [])]) {
    if (!sortie.includes(code)) sortie.push(code);
  }
  return sortie;
}
