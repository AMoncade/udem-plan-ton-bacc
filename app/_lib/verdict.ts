/**
 * CE QUE L'ÉCRAN DIT D'UN AUDIT — et ce qu'il refuse de dire quand rien n'a
 * encore été saisi.
 *
 * ## Le défaut que ce module existe pour retirer
 *
 * Un étudiant qui choisissait son programme et n'avait encore rien saisi voyait
 * ceci, mesuré le 2026-09-13 sur le bacc en mathématiques (Statistique) :
 *
 *     0 / 90 crédits     [ Non conforme ]
 *     Ce que l'audit signale (13)
 *     il manque 26 crédits dans le bloc 01A : 0 crédit sur un minimum de 26.
 *     il manque 18 crédits dans le bloc 79A : 0 crédit sur un minimum de 18.
 *     … dix de plus
 *
 * Rien n'est faux là-dedans. `conforme: false` est exact — un relevé vide ne
 * satisfait aucun minimum. Mais un verdict d'échec et treize constats rouges
 * adressés à quelqu'un qui n'a rien fait de mal n'enseignent qu'une chose :
 * que le badge ne veut rien dire. Un avertissement qui s'allume avant le
 * premier geste cesse d'être lu, et il emporte avec lui ceux qui comptent.
 *
 * ## La coupe est possible parce que les signaux portent un GENRE
 *
 * Sur les treize constats, **douze sont `bloque`** et tous de la forme « 0
 * crédit sur un minimum de N » : ils ne disent rien d'autre que « vous n'avez
 * rien saisi », douze fois. Le treizième est `nonVerifiable` — « 12 notes
 * normatives de la page ne sont pas évaluées par le moteur » — et celui-là est
 * vrai du PROGRAMME, indépendamment de ce que l'étudiant a fait. Le taire
 * effacerait une information sur la fiabilité de l'écran.
 *
 * D'où la règle : à relevé vide, on masque ce qui ne parle que du relevé —
 * `bloque` et `perteOuSurplus` — et on garde tout ce qui parle du programme.
 * C'est une coupe par genre, jamais par motif de phrase : le même site
 * d'émission produit `bloque` ou `nonVerifiable` selon le cas, donc deviner
 * d'après le texte se tromperait.
 *
 * Cette distinction n'existait pas il y a deux heures. L'écran d'audit portait
 * la phrase « le moteur ne les distingue pas dans sa liste, donc cet écran ne
 * le prétend pas » — honnête à l'époque, fausse depuis que `Audit.signaux`
 * existe.
 *
 * ## Pourquoi un TROISIÈME verdict et pas un badge masqué
 *
 * Masquer « Non conforme » à relevé vide laisserait un trou là où l'étudiant a
 * appris à lire un état. Le troisième verdict dit ce qui est vrai — rien n'a
 * été saisi — et porte l'action suivante. C'est la même famille que les états
 * qu'on a passé la journée à séparer : « je ne sais pas » n'est ni un succès
 * ni un échec, et lui donner la couleur de l'un ou de l'autre est le défaut,
 * pas l'absence de couleur.
 */
import type { Audit, CodeCours, Signal } from "../../lib/types";

export type VerdictAffiche =
  /** Aucun cours réussi n'a été saisi : l'audit n'a rien à juger. */
  | "rien-saisi"
  | "conforme"
  | "non-conforme";

/**
 * Le relevé, et LUI SEUL, décide si l'audit a matière à juger.
 *
 * Pas le plan : `auditProgramme` ne lit que les cours faits, donc un étudiant
 * qui a planifié dix cours sans en avoir réussi un seul est dans le même état
 * qu'un écran vierge. Faire dépendre le verdict du plan le ferait basculer
 * sans qu'aucun chiffre de l'audit ne bouge.
 */
export function verdictAffiche(audit: Audit, faits: ReadonlySet<CodeCours>): VerdictAffiche {
  if (faits.size === 0) return "rien-saisi";
  return audit.conforme ? "conforme" : "non-conforme";
}

/** Les genres qui ne parlent QUE du relevé. À relevé vide ils se réduisent tous
 *  à « vous n'avez rien saisi », et le répéter douze fois enterre le reste. */
const DEPENDENT_DU_RELEVE: ReadonlySet<Signal["genre"]> = new Set([
  "bloque",
  "perteOuSurplus",
]);

/**
 * Les signaux à afficher.
 *
 * À relevé vide, seuls restent ceux qui parlent du PROGRAMME : une note
 * normative que le moteur n'évalue pas, une page qui se contredit, un
 * cheminement à choisir. Ils sont vrais avant le premier geste et le resteront
 * après.
 *
 * Dès qu'un seul cours est saisi, tout revient. « Il manque 26 crédits » cesse
 * alors d'être une paraphrase du vide et devient un reste à parcourir.
 */
export function signauxAMontrer(
  audit: Audit,
  faits: ReadonlySet<CodeCours>,
): Signal[] {
  if (faits.size > 0) return audit.signaux;
  return audit.signaux.filter((s) => !DEPENDENT_DU_RELEVE.has(s.genre));
}
