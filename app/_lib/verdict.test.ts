/**
 * LE VERDICT AFFICHÉ.
 *
 * Ce qui est surveillé : qu'un relevé vide ne produise NI un échec ni un
 * succès, et que le silence de l'écran s'arrête aux signaux qui parlent du
 * relevé. Un signal qui parle du PROGRAMME est vrai avant le premier geste, et
 * le taire effacerait une information sur la fiabilité de l'écran.
 */
import { describe, expect, it } from "vitest";
import type { Audit, Signal } from "../../lib/types";
import { signauxAMontrer, verdictAffiche } from "./verdict";

function audit(signaux: Signal[], conforme = false): Audit {
  return {
    idProgramme: "p",
    blocs: [],
    creditsTotal: 0,
    creditsObligatoires: 0,
    creditsOption: 0,
    creditsChoix: 0,
    conforme,
    signaux,
    problemes: signaux.map((s) => s.message),
  };
}

const bloque: Signal = {
  genre: "bloque",
  message: "il manque 26 crédits dans le bloc 01A : 0 crédit sur un minimum de 26 crédits.",
};
const perte: Signal = {
  genre: "perteOuSurplus",
  message: "6 crédits dépassent le maximum du bloc : réussis mais non comptés.",
};
const amont: Signal = {
  genre: "nonVerifiable",
  message: "12 notes normatives de la page ne sont PAS évaluées par le moteur.",
};
const donnees: Signal = {
  genre: "donneesAmont",
  message: "le bloc 70A annonce 9 crédits et ses cours n'en totalisent que 6.",
};
const choix: Signal = {
  genre: "choixAttendu",
  message: "ce programme offre 2 cheminements exclusifs et aucun n'est choisi.",
};

describe("verdictAffiche", () => {
  it("relevé vide : NI conforme NI non conforme", () => {
    // Le défaut mesuré : « Non conforme » s'affichait avant le premier geste.
    // Un verdict d'échec adressé à quelqu'un qui n'a rien fait de mal
    // n'enseigne qu'une chose — que le badge ne veut rien dire.
    expect(verdictAffiche(audit([bloque]), new Set())).toBe("rien-saisi");
  });

  it("un seul cours saisi suffit à rendre le verdict", () => {
    expect(verdictAffiche(audit([bloque]), new Set(["MAT 1000"]))).toBe("non-conforme");
    expect(verdictAffiche(audit([], true), new Set(["MAT 1000"]))).toBe("conforme");
  });

  it("« rien saisi » ne dépend PAS d'un audit conforme par accident", () => {
    // Un programme sans aucune exigence mécanisable peut rendre `conforme:
    // true` sur un relevé vide. Afficher « Conforme » à quelqu'un qui n'a rien
    // saisi serait la faute symétrique, et plus coûteuse : il croirait avoir
    // son diplôme.
    expect(verdictAffiche(audit([], true), new Set())).toBe("rien-saisi");
  });
});

describe("signauxAMontrer", () => {
  it("relevé vide : masque ce qui ne parle que du relevé", () => {
    const a = audit([bloque, perte, amont]);
    expect(signauxAMontrer(a, new Set())).toEqual([amont]);
  });

  it("relevé vide : GARDE ce qui parle du programme", () => {
    // Ceux-là sont vrais avant le premier geste et le resteront après. Les
    // taire effacerait ce que l'écran ne peut pas vérifier — exactement ce que
    // le reste de l'app passe son temps à rendre visible.
    const a = audit([bloque, amont, donnees, choix]);
    expect(signauxAMontrer(a, new Set()).map((s) => s.genre)).toEqual([
      "nonVerifiable",
      "donneesAmont",
      "choixAttendu",
    ]);
  });

  it("un cours saisi : tout revient, dans l'ordre du moteur", () => {
    // « Il manque 26 crédits » cesse alors d'être une paraphrase du vide et
    // devient un reste à parcourir.
    const a = audit([bloque, perte, amont]);
    expect(signauxAMontrer(a, new Set(["MAT 1000"]))).toEqual([bloque, perte, amont]);
  });

  it("ne coupe pas sur le TEXTE mais sur le genre", () => {
    // Le même site d'émission produit `bloque` ou `nonVerifiable` selon le cas :
    // un quota de sigle violé bloque, indéterminé ne se vérifie pas. Deviner
    // d'après le motif de phrase se tromperait sur l'un des deux.
    const memeTexte = "le bloc 01/01Z exclut les sigles IFT.";
    const a = audit([
      { genre: "bloque", message: memeTexte },
      { genre: "nonVerifiable", message: memeTexte },
    ]);
    expect(signauxAMontrer(a, new Set()).map((s) => s.genre)).toEqual(["nonVerifiable"]);
  });

  it("relevé vide sans aucun signal de programme : liste vide, pas de repli", () => {
    expect(signauxAMontrer(audit([bloque, perte]), new Set())).toEqual([]);
  });
});
