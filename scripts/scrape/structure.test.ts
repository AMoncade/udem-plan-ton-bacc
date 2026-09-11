/**
 * Tests de lecture de la page de structure, sur un EXTRAIT FIGÉ d'une vraie
 * page (`__fixtures__/structure-bacc-mathematiques.html`). Aucun accès réseau.
 *
 * L'extrait garde les segments 01 (commun), 75 (Actuariat) et 76 (Actuariat
 * COOP). Le 76 est là exprès : c'est le piège qui ferait entrer les blocs d'une
 * autre orientation dans le programme si la sélection se faisait par préfixe.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { parseRegleBloc, parseStructure, parseTitreBloc, parseTitreSegment } from "./structure";

const HTML = readFileSync(
  path.join(import.meta.dirname, "__fixtures__", "structure-bacc-mathematiques.html"),
  "utf8",
);
const URL_PAGE =
  "https://admission.umontreal.ca/programmes/baccalaureat-en-mathematiques/structure-du-programme/";
const ISO = "2026-09-11T03:00:15.143Z";

function lire(orientation: string | null) {
  return parseStructure(HTML, { id: "essai", url: URL_PAGE, orientation }, ISO);
}

describe("parseRegleBloc — les 5 formes réellement présentes sur la page", () => {
  it("lit « Obligatoire - 26 crédits. »", () => {
    expect(parseRegleBloc("Obligatoire - 26 crédits.")).toEqual({
      regle: { type: "obligatoire", credits: 26 },
      note: null,
    });
  });

  it("lit « Option - Minimum 12 crédits, maximum 27 crédits. »", () => {
    expect(parseRegleBloc("Option - Minimum 12 crédits, maximum 27 crédits.")).toEqual({
      regle: { type: "option", min: 12, max: 27 },
      note: null,
    });
  });

  it("lit « Option - Maximum 13 crédits. » — minimum ABSENT, pas zéro", () => {
    // min: null dit « la page n'impose pas de minimum ». Mettre 0 affirmerait
    // un minimum de 0 crédit, ce que la page n'écrit nulle part.
    expect(parseRegleBloc("Option - Maximum 13 crédits.")).toEqual({
      regle: { type: "option", min: null, max: 13 },
      note: null,
    });
  });

  it("lit « Choix - 3 crédits. »", () => {
    expect(parseRegleBloc("Choix - 3 crédits.")).toEqual({
      regle: { type: "choix", credits: 3 },
      note: null,
    });
  });

  it("signale la forme ambiguë « Option - 4 crédits. » (bloc 82B) au lieu de la gober", () => {
    const lu = parseRegleBloc("Option - 4 crédits.");
    expect(lu?.regle).toEqual({ type: "option", min: 4, max: 4 });
    expect(lu?.note).toMatch(/ambigu/);
  });

  it("tolère l'absence du point final et la casse", () => {
    expect(parseRegleBloc("obligatoire - 7 CRÉDITS")?.regle).toEqual({
      type: "obligatoire",
      credits: 7,
    });
  });

  it("rend null sur une règle inconnue plutôt qu'une règle plausible", () => {
    expect(parseRegleBloc("Obligatoire - tous les cours")).toBeNull();
    expect(parseRegleBloc("")).toBeNull();
  });
});

describe("parseTitreBloc / parseTitreSegment", () => {
  it("sépare l'id du nom, en écrasant le double espace de la page", () => {
    expect(parseTitreBloc("Bloc 75A  Actuariat, mathématiques financières et statistique")).toEqual({
      id: "75A",
      nom: "Actuariat, mathématiques financières et statistique",
    });
  });

  it("rend un nom vide quand la page n'en donne pas (blocs 01A et 75Z)", () => {
    expect(parseTitreBloc("Bloc 01A")).toEqual({ id: "01A", nom: "" });
  });

  it("rend null sur un titre qui n'est pas un bloc", () => {
    expect(parseTitreBloc("Liste des cours")).toBeNull();
  });

  it("lit un segment commun et un segment d'orientation", () => {
    expect(parseTitreSegment("Segment 01 Commun aux sept orientations")).toEqual({
      numero: "01",
      libelle: "Commun aux sept orientations",
      orientation: null,
    });
    expect(parseTitreSegment("Segment 75 Propre à l'orientation Actuariat")).toEqual({
      numero: "75",
      libelle: "Propre à l'orientation Actuariat",
      orientation: "Actuariat",
    });
  });
});

describe("parseStructure — orientation Actuariat", () => {
  const { programme, journal } = lire("Actuariat");

  it("lit le programme et son total de crédits", () => {
    expect(programme.nom).toBe("Baccalauréat en mathématiques");
    expect(programme.creditsTotal).toBe(90);
    expect(programme.orientation).toBe("Actuariat");
    expect(programme.url).toBe(URL_PAGE);
    expect(programme.scrapeISO).toBe(ISO);
  });

  it("retient les 8 blocs des segments 01 et 75, dans l'ordre de la page", () => {
    expect(programme.blocs.map((b) => b.id)).toEqual([
      "01A",
      "75A",
      "75B",
      "75C",
      "75D",
      "75E",
      "75Y",
      "75Z",
    ]);
  });

  it("n'avale AUCUN bloc de l'orientation « Actuariat COOP »", () => {
    // Le piège : une sélection par préfixe ferait entrer les blocs 76x, et
    // l'audit compterait des crédits d'un autre programme.
    expect(programme.blocs.filter((b) => b.segment === "76")).toEqual([]);
  });

  it("garde la règle de crédits VERBATIM, point final compris", () => {
    const b75c = programme.blocs.find((b) => b.id === "75C");
    expect(b75c?.regleBrut).toBe("Option - Minimum 12 crédits, maximum 27 crédits.");
    expect(b75c?.regle).toEqual({ type: "option", min: 12, max: 27 });
    expect(b75c?.segment).toBe("75");
  });

  it("lit les 7 codes du bloc 01A, normalisés et dans l'ordre de la page", () => {
    // Liste vérifiée sur la page ET identique à celle de
    // `data/fixtures/actuariat-verifie.fixture.json`. MAT 2717 EST dans le
    // tronc commun et ACT 1240 n'y est pas : c'est 75A qui ouvre sur ACT 1240.
    expect(programme.blocs.find((b) => b.id === "01A")?.cours).toEqual([
      "MAT 1000",
      "MAT 1400",
      "MAT 1500",
      "MAT 1600",
      "MAT 1720",
      "MAT 2717",
      "STT 1700",
    ]);
  });

  it("laisse le bloc « Choix » sans aucun cours", () => {
    expect(programme.blocs.find((b) => b.id === "75Z")?.cours).toEqual([]);
  });

  it("journalise les deux blocs auxquels la page ne donne pas de nom", () => {
    const sansNom = programme.blocs.filter((b) => b.nom === "").map((b) => b.id);
    expect(sansNom).toEqual(["01A", "75Z"]);
    for (const id of sansNom) {
      expect(journal.entrees.some((e) => e.ou === `bloc ${id}` && e.gravite === "manque")).toBe(true);
    }
  });

  it("journalise verbatim la phrase des exigences par type (54 / 33 / 3)", () => {
    // `Programme` n'a pas de champ pour ça, et c'est le coeur de l'audit :
    // les minimums des blocs d'option ne font que 18 des 33 crédits exigés.
    const info = journal.entrees.find((e) => e.gravite === "info");
    expect(info?.quoi).toContain("54 crédits obligatoires, 33 crédits à option");
  });

  it("ne journalise rien d'inattendu sur cette page", () => {
    expect(journal.entrees.filter((e) => e.gravite === "inattendu")).toEqual([]);
  });
});

describe("parseStructure — autres orientations", () => {
  it("retient les blocs d'Actuariat COOP quand c'est elle qu'on demande", () => {
    const { programme } = lire("Actuariat COOP");
    expect(programme.blocs.map((b) => b.id)).toEqual([
      "01A",
      "76A",
      "76B",
      "76C",
      "76D",
      "76E",
      "76F",
      "76Y",
    ]);
  });

  it("garde tous les segments de la page quand aucune orientation n'est demandée", () => {
    const { programme } = lire(null);
    expect(programme.orientation).toBeNull();
    // Le segment 76 (Actuariat COOP) a 7 blocs : il a un bloc de stages (76F)
    // mais aucun bloc « au choix », contrairement au segment 75.
    expect(programme.blocs.map((b) => b.segment)).toEqual([
      "01",
      ...Array(7).fill("75"),
      ...Array(7).fill("76"),
    ]);
  });

  it("journalise l'absence d'une orientation qui n'est pas sur la page", () => {
    const { programme, journal } = lire("Gastronomie moléculaire");
    expect(programme.blocs.map((b) => b.id)).toEqual(["01A"]);
    expect(journal.entrees.some((e) => e.quoi.includes("aucun segment"))).toBe(true);
  });
});

describe("parseStructure — indépendance aux fins de ligne", () => {
  it("donne exactement le même résultat sur la fixture convertie en CRLF", () => {
    // Le dépôt est en `core.autocrlf=true` : le prochain clone livrera ces
    // fixtures en CRLF. Un parseur sensible au \r rendrait des titres et des
    // règles de crédits avec un retour chariot collé, sans rien faire échouer.
    const crlf = HTML.replace(/\r?\n/g, "\r\n");
    const attendu = lire("Actuariat");
    const obtenu = parseStructure(crlf, { id: "essai", url: URL_PAGE, orientation: "Actuariat" }, ISO);
    expect(obtenu.programme).toEqual(attendu.programme);
    expect(obtenu.journal.entrees).toEqual(attendu.journal.entrees);
  });
});

describe("parseStructure — page qui n'est pas celle attendue", () => {
  it("ne fabrique ni nom ni crédits, et le dit", () => {
    const { programme, journal } = parseStructure(
      "<html><body><p>Page de maintenance</p></body></html>",
      { id: "essai", url: URL_PAGE, orientation: "Actuariat" },
      ISO,
    );
    expect(programme.blocs).toEqual([]);
    expect(programme.nom).toBe("");
    expect(programme.creditsTotal).toBe(0);
    expect(journal.entrees.filter((e) => e.gravite === "manque").length).toBeGreaterThanOrEqual(3);
  });
});
