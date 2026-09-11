/**
 * SAISIE À LA MAIN — l'autre chemin vers le même état.
 *
 * Ce fichier n'a rien d'ICS, et vit pourtant dans `lib/ics/` : c'est le seul
 * répertoire de logique que la session IMPORT possède, et cette fonction doit
 * être testée ailleurs que dans un composant React. Si l'intégratrice veut la
 * déplacer dans `lib/` un jour, elle ne dépend que de `lib/codes.ts`.
 *
 * La règle : tout code refusé ressort, tel que l'étudiant l'a tapé, avec la
 * raison. Un import qui avale « MATH 1400 » en silence laisse croire que le
 * cours est entré alors que l'audit, lui, ne le verra jamais.
 */
import { normaliserCode } from "../codes";
import type { CodeCours } from "../types";

export interface CodeRefuse {
  /** Tel que tapé, espaces de bord retirés et rien d'autre. */
  brut: string;
  raison: string;
}

export interface ResultatSaisie {
  /** Codes normalisés, dédoublonnés, dans l'ordre de saisie. */
  acceptes: CodeCours[];
  refuses: CodeRefuse[];
  /** Doublons dans la saisie elle-même, signalés sans être une erreur. */
  doublons: CodeCours[];
}

/**
 * « act-2250, MAT1400 » et un code par ligne mènent au même résultat :
 * `normaliserCode()` accepte les trois écritures d'UdeM, donc la casse, les
 * espaces et les tirets n'ont pas à être imposés à l'étudiant. Les séparateurs
 * acceptés sont le retour de ligne, la virgule, le point-virgule et la
 * tabulation — pas l'espace, qui sépare les lettres des chiffres dans
 * « ACT 2250 ».
 */
export function lireSaisie(texte: string): ResultatSaisie {
  const acceptes: CodeCours[] = [];
  const refuses: CodeRefuse[] = [];
  const doublons: CodeCours[] = [];
  const vus = new Set<CodeCours>();

  for (const morceau of texte.split(/[\n\r,;\t]+/)) {
    const brut = morceau.trim();
    if (brut === "") continue;
    const code = normaliserCode(brut);
    if (code === null) {
      refuses.push({ brut, raison: raisonDuRefus(brut) });
      continue;
    }
    if (vus.has(code)) {
      if (!doublons.includes(code)) doublons.push(code);
      continue;
    }
    vus.add(code);
    acceptes.push(code);
  }
  return { acceptes, refuses, doublons };
}

function raisonDuRefus(brut: string): string {
  if (/^[A-Za-z]{3}[\s\-_]?\d{4}[A-Za-z]$/.test(brut)) {
    return "code suffixé (comme DRT 1151G) : normaliserCode() ne sait pas encore les lire, et lib/codes.ts est gelé.";
  }
  if (/^[A-Za-z]{3}[\s\-_]?\d{5}$/.test(brut)) {
    return "code à cinq chiffres (comme PSY 40001) : normaliserCode() ne sait pas encore les lire, et lib/codes.ts est gelé.";
  }
  if (/^[A-Za-z]{4,}[\s\-_]?\d{4}$/.test(brut)) {
    return "un sigle UdeM a exactement trois lettres (MAT, ACT, STT), pas plus.";
  }
  if (/^[A-Za-z]{1,2}[\s\-_]?\d{4}$/.test(brut)) {
    return "un sigle UdeM a exactement trois lettres, pas moins.";
  }
  if (/^[A-Za-z]{3}[\s\-_]?\d{1,3}$/.test(brut)) {
    return "un numéro de cours UdeM a quatre chiffres (1400, 2250).";
  }
  if (!/\d/.test(brut)) return "aucun chiffre : il manque le numéro du cours.";
  if (!/[A-Za-z]/.test(brut)) return "aucune lettre : il manque le sigle du département.";
  return "forme non reconnue : attendu trois lettres et quatre chiffres, par exemple « ACT 2250 ».";
}
