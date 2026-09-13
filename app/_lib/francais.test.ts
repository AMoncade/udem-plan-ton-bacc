/**
 * L'ACCORD EN NOMBRE.
 *
 * Un seul cas mérite un test, et c'est celui que `n !== 1` rate : ZÉRO prend le
 * singulier en français. C'est aussi le nombre le plus affiché de cette app —
 * l'état vide est ce qu'on voit avant d'avoir rien saisi.
 */
import { describe, expect, it } from "vitest";
import { pluriel, s } from "./francais";

describe("l'accord en nombre", () => {
  it("zéro prend le SINGULIER", () => {
    expect(s(0)).toBe("");
    expect(pluriel(0, "publie", "publient")).toBe("publie");
  });

  it("un prend le singulier, deux le pluriel", () => {
    expect(s(1)).toBe("");
    expect(s(2)).toBe("s");
    expect(pluriel(1, "a", "ont")).toBe("a");
    expect(pluriel(2, "a", "ont")).toBe("ont");
  });
});
