/**
 * MOTEUR DE DÉMONSTRATION — À JETER.
 *
 * `lib/engine/index.ts` est écrit par une autre session. Sa surface est gelée
 * à deux fonctions, et ce fichier les implémente avec exactement les mêmes
 * signatures pour que l'UI existe avant le moteur :
 *
 *   diagnostiquerCours(catalogue, faits) -> Map<CodeCours, DiagnosticCours>
 *   auditProgramme(programme, catalogue, faits) -> Audit
 *
 * Pour débrancher : voir `app/_demo/moteur.ts`, une ligne. Rien d'autre dans
 * `app/**` ni `components/**` n'importe ce fichier.
 *
 * HYPOTHÈSE EXPLICITE, et c'est la seule : un cours sans fiche n'a pas de
 * crédits connus, et un audit a besoin de nombres. Ce faux moteur les suppose
 * à 3 et le DIT dans `problemes`, ce qui rend le parcours non conforme tant
 * qu'une supposition entre dans le calcul. Mettre 0 à la place serait pire :
 * l'audit afficherait « 0 crédit » avec l'air d'un fait.
 *
 * CONVENTION DE `EtatBloc`, alignée sur le vrai moteur :
 *   creditsAttribues = crédits RETENUS vers le diplôme, déjà plafonnés au
 *                      maximum du bloc ;
 *   creditsPerdus    = le surplus au-delà du plafond ;
 *   brut             = creditsAttribues + creditsPerdus.
 * Empiler 33 crédits d'option dans le seul bloc 75C (plafond 27) n'en retient
 * donc que 27 : les 6 autres sont perdus, et le total d'option reste sous les
 * 33 exigés.
 */
import type {
  Audit,
  Catalogue,
  CodeCours,
  DiagnosticCours,
  EtatBloc,
  Programme,
} from "../../lib/types";
import {
  arithmetiqueProgramme,
  codesReferences,
  creditsDe,
  evaluerNoeud,
  ficheDe,
  maxBloc,
  minBloc,
} from "../_lib/cours";

/** Crédits prêtés à un cours dont la fiche manque. Une hypothèse, pas une donnée. */
export const CREDITS_SUPPOSES_SANS_FICHE = 3;

export function diagnostiquerCours(
  catalogue: Catalogue,
  faits: Set<CodeCours>,
): Map<CodeCours, DiagnosticCours> {
  const diagnostics = new Map<CodeCours, DiagnosticCours>();
  const codes = [...new Set([...codesReferences(catalogue), ...faits])];

  for (const code of codes) {
    const fiche = ficheDe(catalogue, code);

    if (faits.has(code)) {
      diagnostics.set(code, { code, etat: "fait", manquants: [], avertissements: [] });
      continue;
    }

    // Fiche absente : on ne connaît pas ses préalables. Ne jamais verrouiller
    // sur une ignorance, ne jamais la déclarer « disponible » non plus.
    if (fiche === undefined) {
      diagnostics.set(code, {
        code,
        etat: "avertissement",
        manquants: [],
        avertissements: ["Aucune fiche de cours : préalables inconnus."],
      });
      continue;
    }

    const evaluation = evaluerNoeud(fiche.prealables, (prealable) => faits.has(prealable));
    if (!evaluation.satisfait) {
      diagnostics.set(code, {
        code,
        etat: "verrouille",
        manquants: evaluation.manquants,
        avertissements: evaluation.opaques,
      });
      continue;
    }

    diagnostics.set(code, {
      code,
      etat: evaluation.opaques.length > 0 ? "avertissement" : "disponible",
      manquants: [],
      avertissements: evaluation.opaques,
    });
  }

  return diagnostics;
}

interface Ardoise {
  credits: number;
  cours: CodeCours[];
}

export function auditProgramme(
  programme: Programme,
  catalogue: Catalogue,
  faits: Set<CodeCours>,
): Audit {
  const ardoises = new Map<string, Ardoise>(
    programme.blocs.map((bloc) => [bloc.id, { credits: 0, cours: [] }]),
  );
  const supposes: CodeCours[] = [];
  const horsProgramme: CodeCours[] = [];
  const blocChoix = programme.blocs.find((bloc) => bloc.regle.type === "choix");

  // Un cours ne compte que dans un seul bloc. À défaut de règle publiée par
  // UdeM, l'attribution remplit d'abord les minimums, puis la capacité
  // restante, et n'écrase jamais un bloc obligatoire.
  for (const code of [...faits].sort((a, b) => a.localeCompare(b, "fr"))) {
    const credits = creditsDe(catalogue, code);
    if (credits === null) supposes.push(code);
    const poids = credits ?? CREDITS_SUPPOSES_SANS_FICHE;

    const candidats = programme.blocs.filter((bloc) => bloc.cours.includes(code));
    const rang = (type: string) => (type === "obligatoire" ? 0 : type === "choix" ? 1 : 2);
    const tries = [...candidats].sort(
      (a, b) => rang(a.regle.type) - rang(b.regle.type) || a.id.localeCompare(b.id),
    );

    const sousMinimum = tries.find(
      (bloc) => ardoises.get(bloc.id)!.credits < minBloc(bloc.regle),
    );
    const sousMaximum = tries.find((bloc) => {
      const plafond = maxBloc(bloc.regle);
      return plafond === null || ardoises.get(bloc.id)!.credits < plafond;
    });
    let choisi = sousMinimum ?? sousMaximum ?? tries[0];

    if (choisi === undefined) {
      // Aucun bloc ne liste ce cours. Le bloc « Choix » accepte n'importe quel
      // cours — c'est sa définition, sa liste est vide exprès.
      if (blocChoix !== undefined) {
        const plafond = maxBloc(blocChoix.regle);
        if (plafond === null || ardoises.get(blocChoix.id)!.credits < plafond) {
          choisi = blocChoix;
        }
      }
      if (choisi === undefined) {
        horsProgramme.push(code);
        continue;
      }
    }

    const ardoise = ardoises.get(choisi.id)!;
    ardoise.credits += poids;
    ardoise.cours.push(code);
  }

  const problemes: string[] = [];
  const blocs: EtatBloc[] = programme.blocs.map((bloc) => {
    const ardoise = ardoises.get(bloc.id)!;
    const min = minBloc(bloc.regle);
    const plafond = maxBloc(bloc.regle);

    // `creditsAttribues` est PLAFONNÉ : c'est ce que le bloc retient vers le
    // diplôme. Le surplus va dans `creditsPerdus`, et brut = les deux.
    const brut = ardoise.credits;
    const creditsAttribues = plafond === null ? brut : Math.min(brut, plafond);
    const creditsPerdus = brut - creditsAttribues;
    const creditsManquants = Math.max(0, min - creditsAttribues);

    if (creditsManquants > 0) {
      problemes.push(
        `Bloc ${bloc.id} (${bloc.nom}) : ${min} crédits exigés au minimum, ${creditsAttribues} retenus — ${creditsManquants} manquants.`,
      );
    }
    if (creditsPerdus > 0) {
      problemes.push(
        `Bloc ${bloc.id} (${bloc.nom}) : maximum ${plafond} crédits, ${brut} placés — ${creditsPerdus} crédits perdus, ils ne comptent pas vers le diplôme.`,
      );
    }

    return {
      idBloc: bloc.id,
      creditsAttribues,
      creditsManquants,
      creditsPerdus,
      conforme: creditsManquants === 0 && creditsPerdus === 0,
      coursAttribues: ardoise.cours,
    };
  });

  const comptes = (type: string) =>
    programme.blocs.reduce((somme, bloc) => {
      if (bloc.regle.type !== type) return somme;
      return somme + blocs.find((e) => e.idBloc === bloc.id)!.creditsAttribues;
    }, 0);

  const creditsObligatoires = comptes("obligatoire");
  const creditsOption = comptes("option");
  const creditsChoix = comptes("choix");
  const creditsTotal = creditsObligatoires + creditsOption + creditsChoix;
  const exige = arithmetiqueProgramme(programme);

  // Le piège central : chaque bloc d'option peut être conforme et le total
  // d'option rester sous ce que le programme exige.
  if (creditsObligatoires < exige.obligatoire) {
    problemes.push(
      `Crédits obligatoires : ${exige.obligatoire} exigés, ${creditsObligatoires} comptés.`,
    );
  }
  if (creditsOption < exige.exigeOption) {
    problemes.push(
      `Crédits d'option : ${exige.exigeOption} exigés par le programme, ${creditsOption} comptés. Les minimums des blocs d'option ne totalisent que ${exige.minimumsOption} crédits — satisfaire chaque bloc ne suffit donc pas à diplômer.`,
    );
  }
  if (creditsChoix < exige.choix) {
    problemes.push(`Crédits au choix : ${exige.choix} exigés, ${creditsChoix} comptés.`);
  }
  if (creditsTotal < programme.creditsTotal) {
    problemes.push(
      `Total : ${programme.creditsTotal} crédits exigés, ${creditsTotal} comptés.`,
    );
  }
  for (const code of horsProgramme) {
    problemes.push(`${code} n'est rattaché à aucun bloc du programme.`);
  }
  if (supposes.length > 0) {
    problemes.push(
      `${supposes.length} cours faits n'ont pas de fiche : leurs crédits sont supposés à ${CREDITS_SUPPOSES_SANS_FICHE} (${supposes.join(", ")}). Tant qu'une supposition entre dans le calcul, l'audit ne peut pas être certifié.`,
    );
  }

  return {
    idProgramme: programme.id,
    blocs,
    creditsTotal,
    creditsObligatoires,
    creditsOption,
    creditsChoix,
    conforme: problemes.length === 0,
    problemes,
  };
}
