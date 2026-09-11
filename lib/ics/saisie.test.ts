import { describe, expect, test } from "vitest";
import { lireSaisie } from "./saisie";

describe("lireSaisie", () => {
  test("un code par ligne", () => {
    expect(lireSaisie("ACT 2250\nMAT 1400\nSTT 1700").acceptes).toEqual([
      "ACT 2250",
      "MAT 1400",
      "STT 1700",
    ]);
  });

  test("séparés par des virgules, des points-virgules ou des tabulations", () => {
    expect(lireSaisie("ACT 2250, MAT 1400; STT 1700\tIFT 1015").acceptes).toEqual([
      "ACT 2250",
      "MAT 1400",
      "STT 1700",
      "IFT 1015",
    ]);
  });

  /** Les trois écritures d'UdeM mènent au même code : c'est tout l'objet de
   *  `normaliserCode()`, et l'étudiant n'a donc pas à choisir la bonne. */
  test("tolère la casse, les espaces et les tirets", () => {
    expect(lireSaisie("act-2250\n  MAT1400  \nstt_1700").acceptes).toEqual([
      "ACT 2250",
      "MAT 1400",
      "STT 1700",
    ]);
  });

  test("les lignes vides et les séparateurs en série ne produisent rien", () => {
    expect(lireSaisie("\n\n ACT 2250 ,,\n\n")).toEqual({
      acceptes: ["ACT 2250"],
      refuses: [],
      doublons: [],
    });
  });

  test("un doublon est signalé, pas compté deux fois", () => {
    const r = lireSaisie("ACT 2250\nact-2250\nMAT 1400");
    expect(r.acceptes).toEqual(["ACT 2250", "MAT 1400"]);
    expect(r.doublons).toEqual(["ACT 2250"]);
  });

  test("un code refusé ressort tel que tapé, jamais avalé", () => {
    const r = lireSaisie("MATH 1400\nACT 225\nbonjour\nACT 2250");
    expect(r.acceptes).toEqual(["ACT 2250"]);
    expect(r.refuses.map((x) => x.brut)).toEqual(["MATH 1400", "ACT 225", "bonjour"]);
    for (const refuse of r.refuses) expect(refuse.raison.length).toBeGreaterThan(10);
  });

  test("chaque forme de refus reçoit sa propre explication", () => {
    const raison = (brut: string) => lireSaisie(brut).refuses[0].raison;
    expect(raison("DRT 1151G")).toContain("suffixé");
    expect(raison("PSY 40001")).toContain("cinq chiffres");
    expect(raison("MATH 1400")).toContain("pas plus");
    expect(raison("MA 1400")).toContain("pas moins");
    expect(raison("ACT 225")).toContain("quatre chiffres");
    expect(raison("Calcul")).toContain("aucun chiffre");
    expect(raison("1400")).toContain("aucune lettre");
  });

  /**
   * L'espace ne sépare pas deux codes : il sépare les lettres des chiffres à
   * l'intérieur d'un code. « ACT 2250 MAT 1400 » sur une ligne est donc une
   * saisie refusée, pas deux codes — et elle est montrée telle quelle plutôt
   * que découpée au hasard.
   */
  test("l'espace n'est pas un séparateur de codes", () => {
    const r = lireSaisie("ACT 2250 MAT 1400");
    expect(r.acceptes).toEqual([]);
    expect(r.refuses).toHaveLength(1);
    expect(r.refuses[0].brut).toBe("ACT 2250 MAT 1400");
  });

  test("une saisie vide ne produit rien", () => {
    expect(lireSaisie("")).toEqual({ acceptes: [], refuses: [], doublons: [] });
    expect(lireSaisie("   \n  ")).toEqual({ acceptes: [], refuses: [], doublons: [] });
  });
});
