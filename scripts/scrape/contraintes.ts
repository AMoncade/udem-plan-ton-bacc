/**
 * Réduction de la prose d'un bloc « à contenu ouvert » en `ContrainteContenu`.
 *
 * ## Le problème que ce module existe pour dire
 *
 * `contenuOuvert` est posé sur **401 blocs** du catalogue (`structure.ts` :
 * aucun cours énuméré ET de la prose). Le drapeau est exact mais son nom
 * promet « le contenu est décrit ailleurs », et ce n'est vrai que d'une
 * minorité. Mesuré sur les 1 089 programmes régénérés le 2026-09-11 :
 *
 *    85  contrainte de SIGLE      « les crédits au choix ne sont pas de sigle CHM »
 *    72  contrainte de CYCLE      « un cours de 2e cycle dans le répertoire de l'UdeM »
 *    68  AUTORISATION humaine     « approuvé par le directeur de recherche »
 *    45  RENVOI externe           les cours du Centre de langues
 *    12  répartition de crédits   « Cheminement général : 0 crédit; … »
 *     9  RENVOI à d'autres blocs  « … doit être pris dans les blocs 71I ou 71Z »
 *
 * L'axe utile n'est donc pas « ouvert / fermé » mais **« qu'est-ce qui
 * contraint le contenu, et est-ce vérifiable »** : 157 de ces 401 blocs (les
 * sigles et les cycles) portent une contrainte mécanisable que le scrape
 * jetait faute de l'émettre.
 *
 * ## NÉCESSAIRE, PAS SUFFISANT — à lire avant de compter un gain
 *
 * Ce champ ne rend PAS ces 157 blocs vérifiables à lui seul, et il serait
 * malhonnête de le laisser croire. Vérifié dans `lib/engine/index.ts:470` :
 *
 *     estJoker = bornes.type === "choix" && cours.length === 0 && !estOuvert(bloc)
 *
 * Un bloc à contenu ouvert n'est donc jamais joker, et sa liste de cours est
 * vide par définition : le solveur d'affectation reçoit ces 401 blocs sans
 * candidats et **ne leur affecte aujourd'hui aucun cours, zéro sur 401**. Même
 * parfaitement renseignée, la contrainte s'appliquerait à un ensemble vide —
 * un filtre dont le résultat est garanti d'avance, ce qui est la définition
 * d'un contrôle qui ne réfute rien.
 *
 * Ce qui manque ensuite n'est pas une donnée mais une décision de conception
 * côté moteur : autoriser les blocs ouverts à recevoir des candidats, sous le
 * filtre que ce champ décrit. Ça touche la sémantique de l'affectation et de
 * `conforme`, donc ça ne se glisse pas dans un correctif. Émettre la
 * contrainte est la moitié qui relève du scrape ; elle est nécessaire pour que
 * l'autre moitié soit possible.
 *
 * ## Règle de prudence, et pourquoi elle n'est pas négociable
 *
 * **On n'émet que ce qu'on a vraiment su réduire.** Une contrainte absente
 * laisse le moteur faire ce qu'il fait déjà : ne rien vérifier. Une contrainte
 * FAUSSE lui fait rejeter un cours parfaitement valide, et l'étudiant voit un
 * audit qui l'accuse à tort. Les 27 formulations de sigle qui ne se réduisent
 * pas proprement en liste ne produisent donc rien — c'est délibéré, pas un
 * oubli.
 *
 * ## Le piège du vocabulaire, mesuré
 *
 * `Bloc.contrainteContenu` accepte `cycle: string`, mais les fiches de cours ne
 * portent que DEUX valeurs : `"1er cycle"` (2 161 fiches) et
 * `"Cycles supérieurs"` (292). Émettre `cycle: "2e cycle"` en recopiant les
 * mots de la page donnerait une contrainte qu'AUCUN cours du catalogue ne peut
 * satisfaire — vraie au regard du type, inutilisable au regard des données. On
 * traduit donc vers le vocabulaire des fiches, jamais celui de la prose.
 */
import type { ContrainteContenu } from "../../lib/types";

/** Les deux seules valeurs que `Cours.cycle` porte réellement. */
const CYCLE_SUPERIEUR = "Cycles supérieurs";
const CYCLE_PREMIER = "1er cycle";

/**
 * « autre que les sigles COM et POL », « autre que ECN ou POL ».
 *
 * On capture la fin de phrase après « autre que » et on y cherche des sigles :
 * la page écrit tantôt « les sigles X et Y », tantôt « X ou Y », tantôt un seul.
 */
const SIGLE_AUTRE_QUE = /sigles?\s+autre\s+que\b([^.;]*)/i;

/** « les crédits au choix ne sont pas de sigle CHM ». */
const SIGLE_PAS_DE = /n[e']\s*(?:sont|est)\s+pas\s+de\s+sigle\b([^.;]*)/i;

/** Un sigle est TROIS majuscules isolées — pas un mot capitalisé de la phrase. */
const SIGLES = /\b([A-Z]{3})\b/g;

/** « doit être pris dans les blocs 71I ou 71Z », « dans le bloc 70A ». */
const RENVOI_BLOCS = /\bblocs?\s+([0-9]{2}[A-Z](?:[^.;]*?[0-9]{2}[A-Z])*)/i;
const ID_BLOC = /\b([0-9]{2}[A-Z])\b/g;

/** Le seul renvoi externe mesuré dans le catalogue. */
const RENVOI_EXTERNE = /Centre de langues/i;

const CYCLE_SUP = /niveau des [ée]tudes sup[ée]rieures|\b[23]e\s+cycle\b|cycles?\s+sup[ée]rieurs?/i;
const CYCLE_1ER = /\b(?:1er|premier)\s+cycle\b/i;

const AUTORISATION =
  /approuv[ée]|approbation|avec\s+l['’]\s*(?:accord|autorisation)|autoris[ée]\s+par|permission d[eu]/i;

/**
 * Réduit la prose d'un bloc en contrainte, ou rend `null`.
 *
 * L'ORDRE DES TESTS COMPTE, et pas pour des raisons de style. « Sauf exception
 * autorisée, les crédits au choix ne sont pas de sigle CRI » déclenche à la
 * fois le motif d'autorisation et celui de sigle. Le sigle est la contrainte
 * VÉRIFIABLE et l'autorisation n'est qu'une échappatoire mentionnée en tête de
 * phrase : tester l'autorisation d'abord ferait perdre les 85 contraintes de
 * sigle au profit d'un drapeau sur lequel le moteur ne peut rien faire.
 */
export function lireContrainte(notes: string[]): ContrainteContenu | null {
  const texte = notes.join(" ");
  if (texte.trim() === "") return null;

  const exclus = sigleExclus(texte);
  if (exclus !== null) return { genre: "sigle", exclus };

  const blocs = blocsRenvoyes(texte);
  if (blocs !== null) return { genre: "renvoiBlocs", blocs };

  if (RENVOI_EXTERNE.test(texte)) return { genre: "renvoiExterne" };

  // Le 1er cycle est testé d'abord : « cours de 1er cycle de sigle ACT, MAT ou
  // STT » parle bien du 1er cycle, alors que `CYCLE_SUP` happerait un « 2e
  // cycle » mentionné plus loin dans la même prose de bloc.
  if (CYCLE_1ER.test(texte)) return { genre: "cycle", cycle: CYCLE_PREMIER };
  if (CYCLE_SUP.test(texte)) return { genre: "cycle", cycle: CYCLE_SUPERIEUR };

  if (AUTORISATION.test(texte)) return { genre: "autorisation" };

  return null;
}

/**
 * Liste des sigles exclus, ou `null` si la phrase ne se réduit pas.
 *
 * Rend `null` — et non `[]` — quand le motif est reconnu mais qu'aucun sigle
 * n'en sort : `{ genre: "sigle", exclus: [] }` serait une contrainte qui
 * n'exclut rien, c'est-à-dire un mensonge poli. Mieux vaut ne rien dire et
 * laisser `structure.ts` le journaliser.
 */
function sigleExclus(texte: string): string[] | null {
  const m = SIGLE_AUTRE_QUE.exec(texte) ?? SIGLE_PAS_DE.exec(texte);
  if (!m) return null;
  const trouves = [...m[1].matchAll(SIGLES)].map((x) => x[1]);
  const uniques = [...new Set(trouves)];
  return uniques.length > 0 ? uniques : null;
}

/** Ids de blocs renvoyés, ou `null` si la phrase ne se réduit pas. */
function blocsRenvoyes(texte: string): string[] | null {
  const m = RENVOI_BLOCS.exec(texte);
  if (!m) return null;
  const trouves = [...m[1].matchAll(ID_BLOC)].map((x) => x[1]);
  const uniques = [...new Set(trouves)];
  return uniques.length > 0 ? uniques : null;
}
