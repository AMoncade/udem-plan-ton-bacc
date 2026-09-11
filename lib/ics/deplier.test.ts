import { describe, expect, test } from "vitest";
import { extraireCodes } from "../codes";
import {
  analyserPropriete,
  decouperHorsGuillemets,
  deplier,
  deshapperTexte,
} from "./deplier";

describe("deplier", () => {
  test("recolle une ligne continuée par une espace", () => {
    expect(deplier("SUMMARY:Calcul\r\n 1")).toEqual(["SUMMARY:Calcul1"]);
  });

  test("recolle une ligne continuée par une tabulation", () => {
    expect(deplier("SUMMARY:Calcul\r\n\t1")).toEqual(["SUMMARY:Calcul1"]);
  });

  test("retire UN SEUL blanc de continuation, pas tous", () => {
    // Le deuxième blanc appartient à la valeur : « Pav.  Roger-Gaudry ».
    expect(deplier("LOCATION:Pav.\r\n  Roger-Gaudry")).toEqual(["LOCATION:Pav. Roger-Gaudry"]);
  });

  test("accepte CRLF, LF et CR seul", () => {
    const attendu = ["BEGIN:VCALENDAR", "END:VCALENDAR"];
    expect(deplier("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")).toEqual(attendu);
    expect(deplier("BEGIN:VCALENDAR\nEND:VCALENDAR\n")).toEqual(attendu);
    expect(deplier("BEGIN:VCALENDAR\rEND:VCALENDAR\r")).toEqual(attendu);
  });

  test("retire le BOM UTF-8, qui ferait échouer la reconnaissance du format", () => {
    expect(deplier("\ufeffBEGIN:VCALENDAR\r\n")).toEqual(["BEGIN:VCALENDAR"]);
  });

  /**
   * LE PIÈGE QUI FAIT DISPARAÎTRE UN COURS. Le test vérifie les deux moitiés :
   * que le piège existe (lu ligne par ligne, le code est introuvable) et que le
   * dépliage en sort. Sans la première assertion, le test passerait encore le
   * jour où quelqu'un remplacerait `deplier()` par un `split("\n")`.
   */
  test("un SUMMARY plié au milieu d'un sigle reste lisible après dépliage", () => {
    const brut = "SUMMARY:Atelier de la SOA — ACT 25\r\n 25-A\r\n";
    const naif = brut.split("\r\n").flatMap((ligne) => extraireCodes(ligne));
    expect(naif).toEqual([]);
    expect(deplier(brut).flatMap((ligne) => extraireCodes(ligne))).toEqual(["ACT 2525"]);
  });
});

describe("analyserPropriete", () => {
  test("sépare nom, paramètres et valeur", () => {
    expect(analyserPropriete("DTSTART;TZID=America/Toronto:20260901T083000")).toEqual({
      nom: "DTSTART",
      params: { TZID: "America/Toronto" },
      valeur: "20260901T083000",
    });
  });

  test("met le nom et les clés de paramètres en majuscules", () => {
    const p = analyserPropriete("dtstart;tzid=America/Toronto:20260901");
    expect(p?.nom).toBe("DTSTART");
    expect(p?.params.TZID).toBe("America/Toronto");
  });

  test("garde VALUE=DATE", () => {
    expect(analyserPropriete("DTSTART;VALUE=DATE:20260908")).toEqual({
      nom: "DTSTART",
      params: { VALUE: "DATE" },
      valeur: "20260908",
    });
  });

  test("ne coupe pas sur un deux-points placé entre guillemets", () => {
    const p = analyserPropriete('DTSTART;X-NOTE="heure: 9h00";TZID=America/Toronto:20270115T090000');
    expect(p?.valeur).toBe("20270115T090000");
    expect(p?.params).toEqual({ "X-NOTE": "heure: 9h00", TZID: "America/Toronto" });
  });

  test("une valeur contenant un deux-points n'est pas tronquée", () => {
    const p = analyserPropriete("URL:https://studium.umontreal.ca/mod/quiz/view.php?id=1");
    expect(p?.valeur).toBe("https://studium.umontreal.ca/mod/quiz/view.php?id=1");
  });

  test("refuse une ligne sans deux-points et un nom impossible", () => {
    expect(analyserPropriete("ceci n'est pas une propriété ICS")).toBeNull();
    expect(analyserPropriete("pas un nom:valeur")).toBeNull();
  });

  test("accepte une valeur vide", () => {
    expect(analyserPropriete("SUMMARY:")).toEqual({ nom: "SUMMARY", params: {}, valeur: "" });
  });
});

describe("decouperHorsGuillemets", () => {
  test("ignore les séparateurs entre guillemets", () => {
    expect(decouperHorsGuillemets('A;B="x;y";C', ";")).toEqual(["A", 'B="x;y"', "C"]);
  });
});

describe("deshapperTexte", () => {
  test("rend les quatre échappements de la RFC", () => {
    expect(deshapperTexte("a\\nb")).toBe("a\nb");
    expect(deshapperTexte("a\\Nb")).toBe("a\nb");
    expect(deshapperTexte("a\\,b")).toBe("a,b");
    expect(deshapperTexte("a\\;b")).toBe("a;b");
    expect(deshapperTexte("a\\\\b")).toBe("a\\b");
  });

  /**
   * Le cas qui condamne les `replace()` enchaînés : une contre-oblique littérale
   * suivie d'une virgule échappée. En remplaçant `\,` avant `\\`, on rendrait
   * « C:,dossier » au lieu de « C:\, ».
   */
  test("une contre-oblique littérale suivie d'une virgule échappée", () => {
    expect(deshapperTexte("Chemin C:\\\\dossier\\, puis suite")).toBe(
      "Chemin C:\\dossier, puis suite",
    );
  });

  test("une contre-oblique finale isolée est rendue telle quelle", () => {
    expect(deshapperTexte("fin\\")).toBe("fin\\");
  });
});
