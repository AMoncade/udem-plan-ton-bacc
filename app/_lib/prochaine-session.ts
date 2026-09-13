/**
 * « QUELS COURS PRENDRE LA SESSION PROCHAINE » — la question que l'app savait
 * déjà résoudre et ne posait nulle part.
 *
 * ## Ce qui manquait n'était pas un calcul
 *
 * Tout est là depuis longtemps, éparpillé sur trois onglets qui répondent
 * chacun à une autre question :
 *
 *   `diagnostiquerCours()`   ce que les préalables autorisent MAINTENANT
 *   `auditProgramme()`       quels blocs ont encore un trou
 *   `verifierOffre()`        ce qui est réellement offert à cette saison
 *
 * L'étudiant qui veut choisir ses quatre cours doit aujourd'hui croiser les
 * trois de tête. Ce module fait ce croisement et rend une liste ORDONNÉE avec,
 * pour chaque cours, la raison pour laquelle il est proposé. Le reste de l'app
 * dit ce qu'elle ne peut pas vérifier ; cet écran-ci doit dire « prends
 * ceux-là ».
 *
 * ## L'ordre est une SUGGESTION, et il le dit
 *
 * Classer, c'est juger — et ce projet se méfie des jugements qu'on ne peut pas
 * justifier. D'où deux règles :
 *
 *  1. **Aucun score opaque.** Le tri est lexicographique sur des critères
 *     nommés, dans cet ordre : pouvoir de déblocage, rareté saisonnière, bloc
 *     presque fini, code. Pas de pondération inventée, donc rien à défendre
 *     qu'on ne puisse relire.
 *  2. **Chaque ligne porte ses motifs**, et ils sont FACTUELS : « offert
 *     seulement à l'hiver », « préalable manquant de 4 autres cours de ce
 *     parcours ». L'étudiant peut être en désaccord avec l'ordre sans avoir à
 *     douter des faits.
 *
 * Les faits sont affirmés, l'ordre est proposé. C'est la seule façon d'être à
 * la fois SIMPLE et honnête : un écran qui n'ose pas trier ne sert à rien, un
 * écran qui trie en secret ne se conteste pas.
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il ne regarde aucun horaire hebdomadaire et ne connaît aucun conflit de
 * séances : cette donnée n'existe pas encore dans le contrat. Une composition
 * rendue ici peut donc être impossible à l'horaire, et c'est écrit dans le type
 * (`Composition.conflitsNonVerifies`) plutôt que laissé à deviner. Le jour où le
 * verdict de conflit arrive, il FILTRE cette liste — il ne la remplace pas.
 */
import type {
  Audit,
  Catalogue,
  CodeCours,
  DiagnosticCours,
  Programme,
  Saison,
  Trimestre,
} from "../../lib/types";
import { blocsDuCours, ficheDe } from "./cours";
import { verifierOffre } from "./offre";
import { ordreTrimestre } from "./trimestres";
import type { Plan } from "./plan";

/**
 * Pourquoi ce cours est proposé. Tous FACTUELS et vérifiables à la main : un
 * motif qu'on ne peut pas recompter depuis l'écran serait un score déguisé.
 */
export type Motif =
  /** Une seule saison dans l'horaire publié. Le manquer coûte un an, et c'est
   *  la contrainte que les étudiants découvrent trop tard. */
  | { genre: "saison-unique"; saison: Saison }
  /** Figure dans les préalables MANQUANTS de `nombre` autres cours cités par ce
   *  parcours. Se recompte depuis l'arbre des préalables. */
  | { genre: "debloque"; nombre: number }
  /** Le bloc auquel il appartient n'a plus que `creditsManquants` à combler. */
  | { genre: "bloc-a-combler"; idBloc: string; cleBloc: string; creditsManquants: number };

export interface Suggestion {
  code: CodeCours;
  /** `null` quand la fiche manque : l'inconnu ne vaut pas zéro. */
  credits: number | null;
  motifs: Motif[];
  /**
   * L'offre ne REFUSE pas ce placement, mais ne le confirme pas non plus —
   * fiche absente, ou horaire publié qui ne va pas jusque-là. La raison est
   * celle de `verifierOffre()`, mot pour mot.
   */
  reserve: string | null;
  /**
   * Vrai quand AUCUN bloc de ce cours n'a encore de crédits à combler : le
   * suivre est permis, mais il ne rapprocherait pas du diplôme. Ces cours sont
   * écartés de la proposition et restent visibles à part — les masquer ferait
   * disparaître un cours que l'étudiant cherche peut-être exprès.
   */
  sansEffet: boolean;
  /**
   * Ce que le moteur n'a PAS pu vérifier sur ce cours, verbatim : préalables non
   * analysés, condition opaque, concomitants, restrictions d'inscription,
   * absence de fiche. Repris tels quels de `DiagnosticCours.avertissements`.
   *
   * POURQUOI ÇA COMPTE ICI PLUS QU'AILLEURS. Un préalable opaque ne bloque
   * jamais un cours — c'est une règle du projet, et elle est bonne. Mais elle a
   * pour effet que ces cours-là arrivent dans la liste au même titre que les
   * autres, et cet écran-ci est le seul dont le propos est de dire « prends
   * ceux-là ». Une recommandation confiante sur une condition non vérifiée est
   * pire qu'un silence : l'étudiant s'inscrit et se fait refuser au comptoir.
   *
   * Découvert en essayant le module sur le vrai catalogue : IFT 2425 et STT 3795
   * apparaissaient « suggérables » avec un relevé VIDE, parce que leurs
   * conditions n'avaient pas pu être réduites. Rien à l'écran ne l'aurait dit.
   */
  avertissements: string[];
}

export interface Composition {
  /** Les cours retenus, dans l'ordre des suggestions. */
  codes: CodeCours[];
  credits: number;
  /**
   * NOMBRE de cours retenus dont les crédits sont inconnus. `credits` ne les
   * compte pas : c'est un total ATTESTÉ, pas une estimation. L'écran doit
   * afficher les deux — « 12 crédits, plus 1 cours de crédits inconnus » — parce
   * qu'un total net ferait passer une session de cinq cours pour une de quatre.
   */
  creditsInconnus: number;
  /**
   * NOMBRE de cours retenus portant au moins une condition que le moteur n'a pas
   * pu vérifier. Même raison que `creditsInconnus` : la proposition les inclut —
   * une condition opaque ne bloque jamais un cours dans ce projet — mais l'écran
   * doit pouvoir le dire, sans quoi la confiance affichée dépasse ce qui a été
   * vérifié.
   */
  avecConditionsNonVerifiees: number;
  /**
   * TOUJOURS VRAI pour l'instant, et c'est un rappel volontaire plutôt qu'un
   * drapeau mort : aucune donnée de séance n'existe encore, donc rien ici
   * n'atteste que ces cours tiennent ensemble dans une semaine.
   */
  conflitsNonVerifies: true;
}

/**
 * Les cours que l'étudiant peut suivre au trimestre visé, du plus pressant au
 * moins pressant.
 *
 * Un cours est CANDIDAT s'il remplit les quatre conditions, et le fait qu'elles
 * soient quatre est le motif d'exister de ce module :
 *
 *  1. cité par un bloc du parcours affiché — sinon il ne compte pas au diplôme ;
 *  2. ni déjà fait, ni déjà placé à un AUTRE trimestre du plan ;
 *  3. ses préalables sont satisfaits par les cours faits ET par ceux planifiés
 *     STRICTEMENT AVANT le trimestre visé — planifier un préalable la même
 *     session que son cours ne le satisfait pas ;
 *  4. l'offre ne refuse pas la saison visée.
 */
export function suggererPourTrimestre(
  programme: Programme,
  catalogue: Catalogue,
  audit: Audit,
  diagnostics: Map<CodeCours, DiagnosticCours>,
  faits: Set<CodeCours>,
  plan: Plan,
  cible: Trimestre,
): Suggestion[] {
  const citesParLeParcours = new Set<CodeCours>();
  for (const bloc of programme.blocs) {
    for (const code of bloc.cours) citesParLeParcours.add(code);
  }

  // Ce qui sera acquis AVANT le trimestre visé : les cours faits, plus ceux que
  // le plan place à un trimestre strictement antérieur. Le « strictement » n'est
  // pas une subtilité — deux cours de la même session ne se servent pas de
  // préalable l'un à l'autre, et l'oublier proposerait une session entière dont
  // l'ordre interne est impossible.
  const acquisAvant = new Set<CodeCours>(faits);
  const ordreCible = ordreTrimestre(cible);
  for (const [code, quand] of Object.entries(plan)) {
    if (ordreTrimestre(quand) < ordreCible) acquisAvant.add(code);
  }

  // Combien d'autres cours DE CE PARCOURS attendent chaque code. Compté sur les
  // `manquants` du diagnostic, qui sont déjà la sortie de l'évaluation des
  // préalables : le recalculer ici ferait deux vérités pour la même question.
  const attendus = new Map<CodeCours, number>();
  for (const code of citesParLeParcours) {
    const diagnostic = diagnostics.get(code);
    if (diagnostic === undefined || diagnostic.etat !== "verrouille") continue;
    for (const manquant of diagnostic.manquants) {
      attendus.set(manquant, (attendus.get(manquant) ?? 0) + 1);
    }
  }

  const manquePourBloc = new Map<string, number>();
  for (const etat of audit.blocs) {
    manquePourBloc.set(etat.cleBloc, etat.creditsManquants);
  }

  const suggestions: Suggestion[] = [];

  for (const code of citesParLeParcours) {
    if (faits.has(code)) continue;
    const place = plan[code];
    if (place !== undefined && ordreTrimestre(place) !== ordreCible) continue;

    const fiche = ficheDe(catalogue, code);
    const verdict = verifierOffre(code, fiche, cible);
    if (verdict.decision === "refus") continue;

    const diagnostic = diagnostics.get(code);
    if (diagnostic !== undefined && diagnostic.etat === "verrouille") {
      // Verrouillé par les cours FAITS seulement. Le plan peut l'avoir débloqué
      // en plaçant le préalable plus tôt : c'est `acquisAvant` qui tranche, et
      // s'en remettre au seul diagnostic écarterait tout ce que le plan prépare.
      const encoreManquants = diagnostic.manquants.filter((m) => !acquisAvant.has(m));
      if (encoreManquants.length > 0) continue;
    }

    const motifs: Motif[] = [];

    const saisons = new Set((fiche?.trimestres ?? []).map((t) => t.saison));
    if (saisons.size === 1) {
      motifs.push({ genre: "saison-unique", saison: [...saisons][0] });
    }

    const nombre = attendus.get(code) ?? 0;
    if (nombre > 0) motifs.push({ genre: "debloque", nombre });

    let sansEffet = true;
    for (const bloc of blocsDuCours(programme, code)) {
      const manque = manquePourBloc.get(bloc.cle);
      if (manque === undefined || manque <= 0) continue;
      sansEffet = false;
      motifs.push({
        genre: "bloc-a-combler",
        idBloc: bloc.id,
        cleBloc: bloc.cle,
        creditsManquants: manque,
      });
    }

    suggestions.push({
      code,
      credits: fiche?.credits ?? null,
      motifs,
      reserve: verdict.decision === "reserve" ? verdict.raison : null,
      sansEffet,
      avertissements: diagnostic?.avertissements ?? [],
    });
  }

  return suggestions.sort(comparer);
}

/** Le plus petit nombre de crédits encore exigés parmi les blocs du cours.
 *  `Infinity` quand aucun motif de bloc n'a été retenu, pour que ces cours
 *  passent après tous ceux qui comblent quelque chose. */
function urgenceBloc(s: Suggestion): number {
  let plus = Infinity;
  for (const motif of s.motifs) {
    if (motif.genre === "bloc-a-combler") plus = Math.min(plus, motif.creditsManquants);
  }
  return plus;
}

function debloque(s: Suggestion): number {
  for (const motif of s.motifs) {
    if (motif.genre === "debloque") return motif.nombre;
  }
  return 0;
}

/**
 * Tri lexicographique sur des critères NOMMÉS, jamais sur une somme pondérée.
 * Une somme obligerait à défendre des coefficients qu'on ne peut pas mesurer ;
 * un ordre de priorités se relit et se conteste critère par critère.
 *
 * L'ordre, et pourquoi celui-là :
 *  1. ce qui rapproche du diplôme avant ce qui n'y change rien ;
 *  2. le pouvoir de déblocage, décroissant : un préalable pris tard bloque tout
 *     ce qui le suit ;
 *  3. la rareté saisonnière — le manquer coûte un AN ;
 *  4. le bloc le plus près d'être comblé ;
 *  5. le code, pour que deux exécutions donnent le même écran.
 *
 * LA RARETÉ ÉTAIT EN TÊTE, ET C'ÉTAIT FAUX. Essayé sur le bacc en mathématiques,
 * orientation Statistique, relevé vide : la liste proposait IFT 2425, STT 3795
 * et ECN 2165 — trois cours de niveau 2000-3000 — avant MAT 1000, MAT 1400 et
 * MAT 1600, qui débloquent respectivement 5, 9 et 12 autres cours du parcours.
 * La composition à 15 crédits ne contenait AUCUN cours de première année. Pour
 * un étudiant qui commence, c'est un mauvais conseil, et il avait l'air motivé.
 *
 * Le raisonnement qui avait mis la rareté en tête — « c'est la seule contrainte
 * dont le coût est un an » — est juste sur le coût et faux sur l'ordre : un
 * cours rare qu'on ne peut pas construire ne fait pas avancer, et le prendre à
 * la place d'un préalable RETARDE tout ce qui en dépend. La rareté reste un
 * motif affiché, elle cesse d'être le premier critère.
 *
 * L'ordre s'adapte de lui-même au moment du parcours, et c'est ce qui le rend
 * défendable aux deux bouts : au début presque tout est verrouillé, donc le
 * déblocage domine ; à la fin il ne reste rien à débloquer, les comptes tombent
 * à zéro, et c'est la rareté qui décide. Aucune règle spéciale pour ça.
 */
function comparer(a: Suggestion, b: Suggestion): number {
  if (a.sansEffet !== b.sansEffet) return a.sansEffet ? 1 : -1;

  const dA = debloque(a);
  const dB = debloque(b);
  if (dA !== dB) return dB - dA;

  const rareA = a.motifs.some((m) => m.genre === "saison-unique");
  const rareB = b.motifs.some((m) => m.genre === "saison-unique");
  if (rareA !== rareB) return rareA ? -1 : 1;

  const uA = urgenceBloc(a);
  const uB = urgenceBloc(b);
  if (uA !== uB) return uA - uB;

  return a.code.localeCompare(b.code, "fr");
}

/**
 * La réponse courte : les premiers cours de la liste qui tiennent dans une
 * charge visée.
 *
 * Glouton et assumé comme tel — l'ordre ci-dessus EST la décision, et une
 * optimisation combinatoire par-dessus rendrait le résultat inexplicable pour
 * un gain qui n'intéresse personne. L'étudiant garde la main : il coche et
 * décoche, la composition n'est qu'un point de départ.
 *
 * Un cours dont les crédits sont INCONNUS n'est jamais compté pour zéro : le
 * compter pour zéro ferait entrer cinq cours là où il n'y a la place que pour
 * quatre, et c'est exactement la manière dont une session se surcharge sans que
 * personne l'ait décidé. Il OCCUPE donc `CREDITS_STANDARD` dans le budget, sans
 * entrer dans `credits` — le budget est une prudence, le total est une
 * attestation, et les confondre ferait afficher des crédits que rien n'atteste.
 */
export function composer(
  suggestions: Suggestion[],
  creditsVises: number,
): Composition {
  const codes: CodeCours[] = [];
  let credits = 0;
  let creditsInconnus = 0;
  let avecConditionsNonVerifiees = 0;
  let budget = 0;

  for (const s of suggestions) {
    if (s.sansEffet) continue;
    const cout = s.credits ?? CREDITS_STANDARD;
    if (budget + cout > creditsVises) continue;
    budget += cout;
    codes.push(s.code);
    if (s.avertissements.length > 0) avecConditionsNonVerifiees += 1;
    if (s.credits === null) creditsInconnus += 1;
    else credits += s.credits;
  }

  return {
    codes,
    credits,
    creditsInconnus,
    avecConditionsNonVerifiees,
    conflitsNonVerifies: true,
  };
}

/**
 * Ce qu'un cours de crédits inconnus RÉSERVE dans le budget — le cours standard
 * de l'UdeM. C'est une hypothèse, elle est nommée ici plutôt que dispersée, et
 * elle ne sort jamais dans un total affiché : `Composition.creditsInconnus` dit
 * combien de cours en dépendent, pour que l'écran puisse le montrer.
 */
export const CREDITS_STANDARD = 3;

/**
 * Le trimestre que l'écran propose par défaut : le premier de l'horizon publié
 * qui n'est pas déjà commencé.
 *
 * `aujourdhui` est un PARAMÈTRE et non un `new Date()` interne. Une fonction qui
 * lit l'horloge ne se teste que le jour où on l'écrit, et ce projet a déjà payé
 * une fixture plus vieille que son générateur.
 *
 * Les bornes sont celles de l'UdeM : l'automne commence en septembre, l'hiver en
 * janvier, l'été en mai. Un étudiant qui ouvre l'app le 15 octobre planifie
 * l'hiver, pas l'automne où il est déjà.
 */
export function prochainTrimestre(aujourdhui: Date): Trimestre {
  const annee = aujourdhui.getFullYear();
  const mois = aujourdhui.getMonth(); // 0 = janvier

  if (mois <= 3) return { saison: "Été", annee }; // janvier–avril → été suivant
  if (mois <= 7) return { saison: "Automne", annee }; // mai–août → automne
  return { saison: "Hiver", annee: annee + 1 }; // septembre–décembre → hiver
}
