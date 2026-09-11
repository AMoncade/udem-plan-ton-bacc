import type { NoeudPrealable } from "../types";
import { normaliserCode } from "../codes";

/**
 * Parsing de la ligne « Préalables » d'une fiche de cours UdeM.
 *
 * SOCLE ÉCRIT PAR L'INTÉGRATRICE, puis propriété de la session « moteur ».
 *
 * Tout ce qui n'est pas réduit retourne un noeud `opaque` AVEC
 * `complet: false`, pour que l'appelant le consigne dans
 * `Catalogue.prealablesNonParses` et qu'un humain regarde. C'est la différence
 * entre « je ne sais pas lire ça » et « ce cours n'a pas de préalable » : les
 * confondre fabrique un audit faux sans faire échouer un seul test.
 *
 * ---------------------------------------------------------------------------
 * ÉTAT APRÈS LE RELEVÉ DU SCRAPER (docs/RELEVE-PREALABLES.md, 2026-09-11)
 *
 * Le relevé donne les 25 formes réellement publiées sur les 55 fiches de
 * l'orientation actuariat. Ce parseur couvre maintenant 23 des 25 formes, soit
 * 33 des 35 lignes de préalables. Ce qu'il lit :
 *
 *   - un code seul                        « ACT1240 »
 *   - la conjonction homogène             « ACT1240 ET MAT1720 »
 *   - la disjonction homogène             « IFT1015 ou IFT1016 »
 *   - les parenthèses explicites          « MAT1600 et (MAT1720 ou MAT1978) »
 *                                         « IFT2015 ET (A OU B OU C) »
 *   - le point final qui colle            « ACT3251. »
 *   - les blancs insécables, la casse, les espaces multiples
 *
 * RÈGLE D'AMBIGUÏTÉ, inchangée et non négociable : à un niveau de parenthèses
 * donné, les opérateurs doivent être HOMOGÈNES. « A ET B OU C » sans
 * parenthèses reste `opaque` — (A ET B) OU C et A ET (B OU C) n'ont pas le même
 * sens, et deviner de travers déverrouille un cours auquel l'étudiant n'a pas
 * droit, ce qui ne se découvre qu'à l'inscription. Le relevé confirme qu'aucune
 * fiche de l'actuariat ne porte cette forme : le refus ne coûte aucune ligne.
 *
 * Les parenthèses, elles, LÈVENT l'ambiguïté au lieu de la créer : c'est la
 * page qui écrit la précédence, le parseur ne la devine pas.
 *
 * DEUX FORMES RESTENT `opaque` VOLONTAIREMENT :
 *
 *   1. « MAT1400/MAT1600/MAT1720 ou MAT1978 » (STT 3795). La barre oblique
 *      n'est tranchée par rien : « MAT1400 et MAT1600 et (MAT1720 ou MAT1978) »
 *      et « MAT1400 ou MAT1600 ou MAT1720 ou MAT1978 » sont deux lectures
 *      possibles d'un même texte, et elles ne verrouillent pas les mêmes
 *      étudiants. Le relevé note que la même barre sert ailleurs de « ou »
 *      entre cours équivalents — c'est une présomption, pas une donnée.
 *   2. « 57 crédits complétés ... moyenne cumulative supérieure à 3.3. »
 *      (ACT 4000). Le seuil de crédits serait mécanisable contre le total des
 *      cours faits, mais la moyenne cumulative n'existe dans AUCUN de nos
 *      types. Une condition à moitié évaluée est pire qu'opaque : elle
 *      déverrouillerait le cours pour un étudiant à 57 crédits et 2,1 de
 *      moyenne, qui n'y a pas droit. Opaque avertit ; à moitié lue, elle
 *      affirme faux.
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

/** Rogne UN point final. Les pages en collent un au dernier code
 *  (« ACT3251. », « MAT1000 et (MAT1720 ou MAT1978). ») : c'est de la
 *  ponctuation de phrase, pas de la sémantique. Un seul, jamais en boucle :
 *  « ACT3251.. » n'a jamais été observé et doit rester signalé. */
function rognerPointFinal(texte: string): string {
  return texte.endsWith(".") ? texte.slice(0, -1).trim() : texte;
}

interface Coupure {
  debut: number;
  fin: number;
  op: "et" | "ou";
}

/**
 * Opérateurs situés AU NIVEAU 0 de parenthèses. Retourne null si les
 * parenthèses sont déséquilibrées — auquel cas on ne lit rien du tout plutôt
 * que de lire la moitié de la ligne.
 */
function operateursNiveau0(texte: string): Coupure[] | null {
  const coupures: Coupure[] = [];
  let profondeur = 0;
  for (const m of texte.matchAll(/\(|\)|\bET\b|\bOU\b/gi)) {
    const jeton = m[0];
    const i = m.index ?? 0;
    if (jeton === "(") profondeur++;
    else if (jeton === ")") {
      profondeur--;
      if (profondeur < 0) return null;
    } else if (profondeur === 0) {
      coupures.push({ debut: i, fin: i + jeton.length, op: jeton.toLowerCase() === "et" ? "et" : "ou" });
    }
  }
  return profondeur === 0 ? coupures : null;
}

/** Contenu de parenthèses qui englobent TOUTE l'expression, sinon null.
 *  « (A ou B) » -> « A ou B » ; « (A) et (B) » -> null (ce n'est pas un
 *  groupe englobant, le premier « ( » ferme avant la fin). */
function contenuEnglobant(texte: string): string | null {
  if (!texte.startsWith("(") || !texte.endsWith(")")) return null;
  let profondeur = 0;
  for (let i = 0; i < texte.length; i++) {
    if (texte[i] === "(") profondeur++;
    else if (texte[i] === ")") {
      profondeur--;
      if (profondeur === 0) return i === texte.length - 1 ? texte.slice(1, -1) : null;
    }
  }
  return null;
}

/**
 * Descente récursive. Retourne null dès que QUOI QUE CE SOIT n'est pas réduit,
 * et l'appelant rend alors la ligne entière opaque : jamais d'arbre partiel.
 * Un arbre à moitié juste est le pire des trois résultats possibles — il a
 * l'air exploitable et il verrouille ou déverrouille au hasard.
 */
function analyser(texte: string): NoeudPrealable | null {
  const t = texte.trim();
  if (t === "") return null;

  const coupures = operateursNiveau0(t);
  if (!coupures) return null;

  if (coupures.length > 0) {
    // Mélange ET/OU au MÊME niveau de parenthèses : précédence indécidable.
    if (new Set(coupures.map((c) => c.op)).size > 1) return null;

    const membres: string[] = [];
    let curseur = 0;
    for (const c of coupures) {
      membres.push(t.slice(curseur, c.debut));
      curseur = c.fin;
    }
    membres.push(t.slice(curseur));

    const enfants: NoeudPrealable[] = [];
    for (const membre of membres) {
      const n = analyser(membre);
      if (!n) return null;
      enfants.push(n);
    }
    return { genre: coupures[0].op, enfants };
  }

  const code = normaliserCode(t);
  if (code) return { genre: "cours", code };

  const interieur = contenuEnglobant(t);
  if (interieur !== null) return analyser(interieur);

  return null;
}

export function parsePrealables(brut: string): ResultatParsing {
  // Le noeud opaque conserve le texte d'ORIGINE (juste détrimé) : c'est lui qui
  // part dans `prealablesNonParses` pour inspection humaine, il doit être
  // fidèle à la page et non à ma normalisation interne.
  const original = brut.trim();
  if (original === "") return { noeud: { genre: "opaque", texte: brut }, complet: false };

  const noeud = analyser(rognerPointFinal(normaliserBlancs(brut)));
  if (noeud) return { noeud, complet: true };
  return { noeud: { genre: "opaque", texte: original }, complet: false };
}
