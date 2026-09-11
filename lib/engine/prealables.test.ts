import { describe, it, expect } from "vitest";
import { parsePrealables } from "./prealables";

describe("parsePrealables — cas vérifiés sur admission.umontreal.ca", () => {
  it("lit la ligne réelle d'ACT-2250", () => {
    expect(parsePrealables("ACT1240 ET MAT1720")).toEqual({
      complet: true,
      noeud: { genre: "et", enfants: [
        { genre: "cours", code: "ACT 1240" },
        { genre: "cours", code: "MAT 1720" },
      ] },
    });
  });
  it("lit un préalable unique", () => {
    expect(parsePrealables("ACT2250")).toEqual({
      complet: true, noeud: { genre: "cours", code: "ACT 2250" },
    });
  });
});

describe("parsePrealables — ce qu'il refuse de deviner", () => {
  it("ne bloque pas sur une condition en prose, mais la signale", () => {
    const r = parsePrealables("autorisation du département");
    expect(r.complet).toBe(false);
    expect(r.noeud).toEqual({ genre: "opaque", texte: "autorisation du département" });
  });

  it("refuse un OU sans parenthèses plutôt que d'inventer une précédence", () => {
    // « A ET B OU C » est ambigu : (A ET B) OU C, ou A ET (B OU C) ?
    // Deviner mal déverrouille un cours que l'étudiant n'a pas le droit de
    // prendre — le genre d'erreur qu'on ne découvre qu'à l'inscription.
    const r = parsePrealables("ACT1240 ET MAT1720 OU STT1700");
    expect(r.complet).toBe(false);
    expect(r.noeud.genre).toBe("opaque");
  });

  it("signale une conjonction dont un membre n'est pas un code", () => {
    const r = parsePrealables("ACT1240 ET autorisation du département");
    expect(r.complet).toBe(false);
    expect(r.noeud.genre).toBe("opaque");
  });

  it("conserve le texte intact dans le noeud opaque", () => {
    const brut = "Avoir réussi 30 crédits";
    const r = parsePrealables(brut);
    expect(r.noeud).toEqual({ genre: "opaque", texte: brut });
  });
});
