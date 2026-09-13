import { describe, it, expect } from "vitest";
import { pluriel, s } from "./francais";

describe("accord en nombre", () => {
  it("zéro et un prennent le singulier", () => {
    // C'est la règle du français, et c'est aussi l'état des écrans vides — celui
    // qu'on lit avant d'avoir rien saisi. Un `n !== 1` mettrait zéro au pluriel,
    // donc se tromperait précisément là où on le voit le plus.
    expect(s(0)).toBe("");
    expect(s(1)).toBe("");
    expect(pluriel(0, "cité", "cités")).toBe("cité");
    expect(pluriel(1, "cité", "cités")).toBe("cité");
  });

  it("deux et plus prennent le pluriel", () => {
    expect(s(2)).toBe("s");
    expect(s(27)).toBe("s");
    expect(pluriel(2, "entre", "entrent")).toBe("entrent");
  });

  it("UNE DÉCIMALE SOUS DEUX PREND LE SINGULIER — « 1,5 crédit »", () => {
    // Le cas qui n'était pas couvert et que le module ratait. La première
    // version testait `n > 1`, donc `s(1.5)` rendait « s » : « 1,5 crédits ».
    //
    // Ce n'était pas une subtilité théorique. Les crédits UdeM ont des demis, et
    // `cr()` dans `lib/engine/bornes.ts` accorde le même genre de phrase avec
    // `arrondi(x) >= 2`, qui a toujours été correct. Le dépôt portait donc deux
    // accords qui divergeaient sur exactement ce cas — deux réponses à la même
    // question, à l'écran, sans qu'aucun test ne le dise.
    expect(s(1.5)).toBe("");
    expect(s(1.9)).toBe("");
    expect(pluriel(1.5, "crédit", "crédits")).toBe("crédit");
  });
});
