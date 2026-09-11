/**
 * Porte d'entrée du lecteur d'horaire. L'écran d'import n'importe que d'ici ;
 * le découpage interne en modules reste libre de bouger.
 */
export type {
  CoursTrouveICS,
  EvenementIgnoreICS,
  ResultatImportICS,
} from "./types";
export { lireICS, type OptionsLecture } from "./lire";
export { lireSaisie, type CodeRefuse, type ResultatSaisie } from "./saisie";
export { fusionnerFaits, type Fusion } from "./fusion";
export { libelleTrimestre, trimestreDansTexte } from "./dates";
