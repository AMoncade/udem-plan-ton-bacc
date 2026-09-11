/**
 * SCÉNARIO DE DÉMONSTRATION — À JETER avec le reste de `app/_demo/`.
 *
 * Un parcours fabriqué, choisi pour que chaque situation que l'interface doit
 * savoir montrer soit présente à l'écran en un clic :
 *
 *  - des cours faits dans cinq blocs différents ;
 *  - ACT 2250 qui passe de verrouillé à disponible, parce que ses deux
 *    préalables (ACT 1240, MAT 1720) sont faits ;
 *  - le bloc 75C exactement à son minimum — donc « conforme » — alors que le
 *    total d'option reste très loin des 33 crédits exigés ;
 *  - le bloc 75D au-delà de son maximum : 18 crédits attribués pour un
 *    plafond de 15, donc 3 crédits PERDUS ;
 *  - des cours planifiés dont la fiche manque, donc placés sous réserve ;
 *  - ECN 2165 laissé libre exprès : c'est le seul cours d'hiver de la fixture
 *    qui ait une fiche, et le refus d'un placement à l'automne se démontre
 *    avec lui.
 */
import type { CodeCours } from "../../lib/types";
import type { Plan } from "../_lib/plan";

export const SCENARIO_FAITS: CodeCours[] = [
  "MAT 1000",
  "MAT 1400",
  "MAT 1500",
  "MAT 1600",
  "MAT 1720",
  "ACT 1240",
  "ACT 2241",
  "ACT 2242",
  "ACT 2251",
  "ACT 2284",
  "STT 2000",
  "STT 2105",
  "STT 3220",
  "STT 3260",
  "STT 3410",
  "STT 3510",
  "DMO 1000",
  "ECN 1000",
];

export const SCENARIO_PLAN: Plan = {
  "ACT 2250": { saison: "Automne", annee: 2026 },
  "IFT 1015": { saison: "Hiver", annee: 2027 },
  "ACT 3201": { saison: "Automne", annee: 2027 },
  "MAT 2717": { saison: "Hiver", annee: 2028 },
};
