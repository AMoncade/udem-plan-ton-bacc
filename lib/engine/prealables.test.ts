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

// ---------------------------------------------------------------------------
// Extension « moteur ». Deux ajouts seulement, et rien pour des formes
// imaginaires : le relevé des formes réellement présentes sur le site (session
// scraper) n'est pas encore arrivé.
// ---------------------------------------------------------------------------

describe("parsePrealables — blancs exotiques des pages UdeM", () => {
  it("lit la ligne d'ACT-2250 écrite avec des espaces insécables", () => {
    const r = parsePrealables("ACT1240 ET MAT1720");
    expect(r.complet).toBe(true);
    expect(r.noeud).toEqual({ genre: "et", enfants: [
      { genre: "cours", code: "ACT 1240" },
      { genre: "cours", code: "MAT 1720" },
    ] });
  });

  it("tolère espaces multiples, retours de ligne et minuscules", () => {
    const r = parsePrealables("  act 1240   et \n mat-1720  ");
    expect(r.complet).toBe(true);
    expect(r.noeud).toEqual({ genre: "et", enfants: [
      { genre: "cours", code: "ACT 1240" },
      { genre: "cours", code: "MAT 1720" },
    ] });
  });
});

describe("parsePrealables — disjonction homogène « A OU B »", () => {
  // Seule forme ajoutée au socle, parce qu'elle est le miroir exact de « A ET B » :
  // une suite homogène n'a AUCUNE précédence à deviner. Et l'erreur éventuelle
  // va dans le sens sûr : un noeud `ou` peut verrouiller un cours, là où un
  // `opaque` ne verrouille jamais — cette extension ne peut donc pas
  // déverrouiller un cours auquel l'étudiant n'a pas droit.
  it("réduit « A OU B » à un noeud ou", () => {
    expect(parsePrealables("STT1700 OU MAT2717")).toEqual({
      complet: true,
      noeud: { genre: "ou", enfants: [
        { genre: "cours", code: "STT 1700" },
        { genre: "cours", code: "MAT 2717" },
      ] },
    });
  });

  it("réduit une disjonction de trois codes", () => {
    const r = parsePrealables("STT1700 OU MAT2717 OU ACT1240");
    expect(r.complet).toBe(true);
    expect(r.noeud).toEqual({ genre: "ou", enfants: [
      { genre: "cours", code: "STT 1700" },
      { genre: "cours", code: "MAT 2717" },
      { genre: "cours", code: "ACT 1240" },
    ] });
  });

  it("ne confond pas le « ou » de la prose avec une disjonction de codes", () => {
    const r = parsePrealables("autorisation du département ou du responsable");
    expect(r.complet).toBe(false);
    expect(r.noeud.genre).toBe("opaque");
  });

  it("ne découpe pas un mot contenant ET ou OU", () => {
    // « ETH 1000 » ne doit pas être coupé sur « ET ».
    expect(parsePrealables("ETH1000")).toEqual({
      complet: true, noeud: { genre: "cours", code: "ETH 1000" },
    });
  });
});

describe("parsePrealables — lu depuis le relevé du scraper (docs/RELEVE-PREALABLES.md)", () => {
  // Ces trois formes étaient refusées tant qu'on ne savait pas si elles
  // existaient. Le relevé du 2026-09-11 les a trouvées sur de vraies fiches,
  // avec des parenthèses TOUJOURS explicites : la précédence est écrite par la
  // page, pas devinée par le parseur. Détail et données réelles dans
  // lib/engine/releve.test.ts.
  it("groupe en tête : « (A OU B) ET C »", () => {
    expect(parsePrealables("(ACT1240 OU MAT1720) ET STT1700").complet).toBe(true);
  });
  it("groupe en queue : « A ET (B OU C) »", () => {
    expect(parsePrealables("ACT1240 ET (MAT1720 OU STT1700)").complet).toBe(true);
  });
  it("point final collé au code", () => {
    expect(parsePrealables("ACT1240.")).toEqual({
      complet: true, noeud: { genre: "cours", code: "ACT 1240" },
    });
  });
});

describe("parsePrealables — ce qui reste opaque après le relevé", () => {
  const aRefuser: [string, string][] = [
    ["ACT1240, MAT1720", "une virgule ne dit pas si c'est ET ou OU"],
    ["ACT1240 MAT1720", "deux codes sans connecteur"],
    ["ACT1240 ET MAT1720 OU STT1700", "mélange ET/OU sans parenthèses"],
    ["Avoir réussi 30 crédits", "condition de crédits, en prose"],
    ["ACT1240 concomitant MAT1720", "concomitant : pas encore mécanisé"],
    ["ACT1240..", "deux points : forme jamais observée, on n'en rogne qu'un"],
  ];
  for (const [brut, pourquoi] of aRefuser) {
    it(`reste opaque et signalé : « ${brut} » (${pourquoi})`, () => {
      const r = parsePrealables(brut);
      expect(r.complet).toBe(false);
      expect(r.noeud.genre).toBe("opaque");
      if (r.noeud.genre === "opaque") expect(r.noeud.texte).toBe(brut.trim());
    });
  }

  it("une ligne vide est signalée, jamais lue comme « aucun préalable »", () => {
    const r = parsePrealables("   ");
    expect(r.complet).toBe(false);
    expect(r.noeud.genre).toBe("opaque");
  });
});
