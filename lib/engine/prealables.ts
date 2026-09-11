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
 *
 * ---------------------------------------------------------------------------
 * EXTENSION « moteur », 2026-09-10. Ce qui a été ajouté, et strictement rien
 * de plus, parce que le relevé des formes réellement présentes sur le site
 * (session scraper) n'est pas encore arrivé :
 *
 *   1. Normalisation des blancs exotiques (espace insécable U+00A0, espace
 *      fine U+202F, retours de ligne, espaces multiples) avant analyse. Les
 *      pages UdeM en sont pleines ; « ACT1240 ET MAT1720 » est la même
 *      ligne que « ACT1240 ET MAT1720 », pas une ligne illisible.
 *   2. La disjonction HOMOGÈNE « A OU B [OU C] ». C'est le miroir exact du
 *      cas « A ET B » déjà couvert : une suite homogène n'a pas de précédence
 *      à deviner. Le socle refusait tout texte contenant « OU », en justifiant
 *      par l'ambiguïté de précédence — or cette ambiguïté n'existe que dans le
 *      cas MIXTE. Le mélange « A ET B OU C » reste refusé, lui.
 *      Direction de l'erreur si je me trompais quand même sur la sémantique de
 *      « OU » : un noeud `ou` peut VERROUILLER un cours, alors qu'un `opaque`
 *      ne verrouille jamais. Cette extension est donc plus stricte que le
 *      socle, jamais plus permissive — elle ne peut pas déverrouiller un cours
 *      auquel l'étudiant n'a pas droit, qui est le risque que le brief veut
 *      éviter.
 *
 * Ce qui reste délibérément `opaque` (et attend le relevé du scraper) :
 * parenthèses, virgules (« A, B » veut-il dire ET ou OU ? personne ne le
 * sait), mélange ET/OU, prose (« autorisation du département »), conditions de
 * crédits (« avoir réussi 30 crédits »), concomitants.
 */
export interface ResultatParsing {
  noeud: NoeudPrealable;
  /** false => la ligne contient quelque chose que le parseur n'a pas réduit. */
  complet: boolean;
}

/** Blancs vus sur les pages UdeM : insécable, fine insécable, tabulations,
 *  retours de ligne. Les réduire n'invente rien, c'est la même ligne. */
function normaliserBlancs(texte: string): string {
  return texte.replace(/[\s   ⁠]+/g, " ").trim();
}

export function parsePrealables(brut: string): ResultatParsing {
  // Le noeud opaque conserve le texte d'ORIGINE (juste détrimé) : c'est lui qui
  // part dans `prealablesNonParses` pour inspection humaine, il doit être
  // fidèle à la page et non à ma normalisation interne.
  const original = brut.trim();
  const texte = normaliserBlancs(brut);
  if (texte === "") return { noeud: { genre: "opaque", texte: brut }, complet: false };

  const seul = normaliserCode(texte);
  if (seul) return { noeud: { genre: "cours", code: seul }, complet: true };

  const aEt = /\bET\b/i.test(texte);
  const aOu = /\bOU\b/i.test(texte);

  // Mélange ET/OU sans parenthèses : « A ET B OU C » est (A ET B) OU C ou
  // A ET (B OU C) ? Deviner mal déverrouille un cours que l'étudiant n'a pas
  // le droit de prendre — erreur qui ne se découvre qu'à l'inscription.
  if (aEt && aOu) return { noeud: { genre: "opaque", texte: original }, complet: false };

  if (aEt || aOu) {
    const separateur = aEt ? /\bET\b/i : /\bOU\b/i;
    const morceaux = texte.split(separateur).map((m) => m.trim()).filter((m) => m !== "");
    if (morceaux.length >= 2) {
      const codes = morceaux.map(normaliserCode);
      if (codes.every((c): c is string => c !== null)) {
        const enfants = codes.map((code) => ({ genre: "cours" as const, code }));
        return { noeud: { genre: aEt ? "et" : "ou", enfants }, complet: true };
      }
    }
    // Un membre n'est pas un code (prose, parenthèses, virgules) : on ne
    // réduit pas à moitié, on signale la ligne entière.
    return { noeud: { genre: "opaque", texte: original }, complet: false };
  }

  return { noeud: { genre: "opaque", texte: original }, complet: false };
}
