import type { NoeudPrealable } from "../types";
import { normaliserCode } from "../codes";

/**
 * Parsing de la ligne « Préalables » d'une fiche de cours UdeM.
 *
 * SOCLE ÉCRIT PAR L'INTÉGRATRICE, puis propriété de la session « moteur ».
 * Il ne couvre volontairement que ce qui a été VÉRIFIÉ sur le site le
 * 2026-09-10 : un code seul, ou des codes reliés par « ET »
 * (ACT-2250 : « ACT1240 ET MAT1720 »).
 *
 * Tout le reste retourne un noeud `opaque` AVEC `complet: false`, pour que
 * l'appelant puisse le consigner dans `Catalogue.prealablesNonParses` et
 * qu'un humain regarde. C'est la différence entre « je ne sais pas lire ça »
 * et « ce cours n'a pas de préalable » : les confondre fabrique un audit faux
 * sans faire échouer un seul test.
 */
export interface ResultatParsing {
  noeud: NoeudPrealable;
  /** false => la ligne contient quelque chose que le parseur n'a pas réduit. */
  complet: boolean;
}

export function parsePrealables(brut: string): ResultatParsing {
  const texte = brut.trim();
  if (texte === "") return { noeud: { genre: "opaque", texte: brut }, complet: false };

  const seul = normaliserCode(texte);
  if (seul) return { noeud: { genre: "cours", code: seul }, complet: true };

  // Uniquement la conjonction homogène « A ET B ET C ». Dès qu'un OU apparaît,
  // la précédence devient ambiguë sans parenthèses : on refuse de deviner.
  if (/\bOU\b/i.test(texte)) {
    return { noeud: { genre: "opaque", texte }, complet: false };
  }
  const morceaux = texte.split(/\bET\b/i).map((m) => m.trim()).filter((m) => m !== "");
  if (morceaux.length >= 2) {
    const codes = morceaux.map(normaliserCode);
    if (codes.every((c): c is string => c !== null)) {
      return {
        noeud: { genre: "et", enfants: codes.map((code) => ({ genre: "cours" as const, code })) },
        complet: true,
      };
    }
  }
  return { noeud: { genre: "opaque", texte }, complet: false };
}
