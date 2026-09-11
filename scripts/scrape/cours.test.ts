/**
 * Tests de lecture des fiches de cours, sur des EXTRAITS FIGÉS de vraies pages
 * (`__fixtures__/cours-*.html`). Aucun accès réseau.
 *
 * Chaque fixture est là pour UN piège constaté sur le site le 2026-09-11 ; le
 * commentaire de chaque test dit lequel.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { parsePrealables } from "../../lib/engine/prealables";
import { Journal } from "./journal";
import { parseExigences, parseFicheCours, parseTrimestres } from "./cours";

const ISO = "2026-09-11T03:00:18.452Z";

function fiche(slug: string) {
  const html = readFileSync(
    path.join(import.meta.dirname, "__fixtures__", `cours-${slug}.html`),
    "utf8",
  );
  const url = `https://admission.umontreal.ca/cours-et-horaires/cours/${slug}/`;
  return parseFicheCours(html, url, ISO, parsePrealables);
}

describe("parseExigences", () => {
  it("rend null, null quand la page n'a PAS de bloc d'exigences", () => {
    // Absence du div = « ce cours n'a aucune exigence ». Ce n'est ni une chaîne
    // vide, ni une erreur de scrape, ni « je n'ai pas su lire ».
    expect(parseExigences(null)).toEqual({
      prealablesBrut: null,
      concomitantsBrut: null,
      autres: [],
    });
  });

  it("accepte « Préalable: » et « Préalables : », singulier comme pluriel", () => {
    expect(parseExigences("<p>Préalable: ACT1240</p>").prealablesBrut).toBe("ACT1240");
    expect(parseExigences("<p>Préalables : ACT3251 et STT2700</p>").prealablesBrut).toBe(
      "ACT3251 et STT2700",
    );
  });

  it("sépare deux exigences réunies sur une ligne par un point-virgule", () => {
    const e = parseExigences("<p>Préalable : MAT1600; Concomitant : STT2700</p>");
    expect(e.prealablesBrut).toBe("MAT1600");
    expect(e.concomitantsBrut).toBe("STT2700");
  });

  it("ne prend pas l'entête « Exigences d'inscription » pour une exigence", () => {
    const e = parseExigences(
      "<h5>Exigences d&#039;inscription</h5><p>Préalable: ACT1240</p>",
    );
    expect(e.prealablesBrut).toBe("ACT1240");
    expect(e.autres).toEqual([]);
  });

  it("range une étiquette inconnue dans `autres`, jamais dans les préalables", () => {
    const e = parseExigences("<p>Restrictions d'inscription: DMO1000/DMO1010</p>");
    expect(e.prealablesBrut).toBeNull();
    expect(e.autres).toEqual([
      { etiquette: "Restrictions d'inscription", texte: "DMO1000/DMO1010" },
    ]);
  });
});

describe("parseTrimestres", () => {
  it("lit la liste séparée par des virgules", () => {
    const j = new Journal();
    expect(parseTrimestres("Été 2026, Automne 2026, Hiver 2027", "X", j)).toEqual([
      { saison: "Été", annee: 2026 },
      { saison: "Automne", annee: 2026 },
      { saison: "Hiver", annee: 2027 },
    ]);
    expect(j.vide).toBe(true);
  });

  it("signale une saison inconnue au lieu de l'inventer", () => {
    const j = new Journal();
    expect(parseTrimestres("Printemps 2026", "X", j)).toEqual([]);
    expect(j.entrees[0].quoi).toContain("saison inconnue");
  });
});

describe("parseFicheCours — ACT 2250, la fiche de référence du contrat", () => {
  const { cours, prealablesComplet, journal } = fiche("act-2250");

  it("lit tous les champs, avec « ACT1240 ET MAT1720 » verbatim", () => {
    expect(cours).toEqual({
      code: "ACT 2250",
      titre: "Mathématiques de l'assurance-vie 1",
      credits: 3,
      cycle: "1er cycle",
      faculte: "Faculté des arts et des sciences",
      description:
        "Assurances à long terme, fonction de survie, probabilités de décès, force de mortalité, " +
        "tables de mortalité, hypothèses pour âges fractionnaires, assurance-vie, rentes viagères, " +
        "perte de l'assureur, calcul des primes périodiques nettes et brutes.",
      prealablesBrut: "ACT1240 ET MAT1720",
      prealables: {
        genre: "et",
        enfants: [
          { genre: "cours", code: "ACT 1240" },
          { genre: "cours", code: "MAT 1720" },
        ],
      },
      concomitantsBrut: null,
      trimestres: [
        { saison: "Été", annee: 2026 },
        { saison: "Automne", annee: 2026 },
      ],
      url: "https://admission.umontreal.ca/cours-et-horaires/cours/act-2250/",
      scrapeISO: ISO,
    });
  });

  it("retire la virgule qui sépare la faculté du département sur la page", () => {
    // La page écrit « Faculté des arts et des sciences, » puis le département.
    expect(cours?.faculte?.endsWith("sciences")).toBe(true);
  });

  it("n'a rien à journaliser", () => {
    expect(prealablesComplet).toBe(true);
    expect(journal.entrees).toEqual([]);
  });
});

describe("parseFicheCours — une fiche SANS exigence (IFT 1015)", () => {
  const { cours, prealablesComplet, journal } = fiche("ift-1015");

  it("affirme l'absence de préalables avec null, et ne journalise rien", () => {
    expect(cours?.prealablesBrut).toBeNull();
    expect(cours?.prealables).toBeNull();
    expect(cours?.concomitantsBrut).toBeNull();
    expect(prealablesComplet).toBeNull();
    expect(journal.entrees).toEqual([]);
  });

  it("lit quand même faculté et description, que la fixture du contrat laisse vides", () => {
    // `data/fixtures/actuariat-verifie.fixture.json` met faculte: null et
    // description: "" pour IFT 1015 ; la page, elle, les donne.
    expect(cours?.faculte).toBe("Faculté des arts et des sciences");
    expect(cours?.description).toMatch(/^Éléments de base d'un langage de programmation/);
    expect(cours?.trimestres).toHaveLength(3);
  });
});

describe("parseFicheCours — préalables à parenthèses, lus depuis la 2e passe", () => {
  // Ces deux lignes étaient opaques quand le scraper a été écrit, et c'est
  // son relevé des formes réelles qui a permis au moteur d'étendre le
  // parseur. Ces tests épinglaient donc une incapacité, pas un comportement
  // voulu : ils devaient changer avec elle.
  it("MAT 2717 : « MAT1600 et (MAT1720 ou MAT1978) » est lu, brut verbatim", () => {
    const { cours, prealablesComplet } = fiche("mat-2717");
    expect(cours?.prealablesBrut).toBe("MAT1600 et (MAT1720 ou MAT1978)");
    expect(prealablesComplet).toBe(true);
    expect(cours?.prealables).toEqual({
      genre: "et",
      enfants: [
        { genre: "cours", code: "MAT 1600" },
        {
          genre: "ou",
          enfants: [
            { genre: "cours", code: "MAT 1720" },
            { genre: "cours", code: "MAT 1978" },
          ],
        },
      ],
    });
  });

  it("IFT 3245 : le OU ternaire entre parenthèses est lu", () => {
    const { cours, prealablesComplet } = fiche("ift-3245");
    expect(cours?.prealablesBrut).toBe("IFT2015 ET (MAT1978 OU MAT1720 OU PHY2215)");
    expect(prealablesComplet).toBe(true);
  });
});

describe("parseFicheCours — ce que le parseur refuse de deviner", () => {

  it("STT 3795 : barres obliques entre codes -> opaque + non parsé", () => {
    const { cours, prealablesComplet } = fiche("stt-3795");
    expect(cours?.prealablesBrut).toBe("MAT1400/MAT1600/MAT1720 ou MAT1978");
    expect(prealablesComplet).toBe(false);
  });

  it("ACT 4000 : condition en prose -> opaque, jamais une liste de codes", () => {
    const { cours, prealablesComplet } = fiche("act-4000");
    expect(cours?.prealablesBrut).toBe(
      "57 crédits complétés dans le baccalauréat en mathématiques 1-190-1-0 " +
        "avec une moyenne cumulative supérieure à 3.3.",
    );
    expect(prealablesComplet).toBe(false);
    expect(cours?.prealables).toMatchObject({ genre: "opaque" });
  });
});

describe("parseFicheCours — concomitants", () => {
  it("STT 2400 : préalable et concomitant sur la même ligne", () => {
    const { cours } = fiche("stt-2400");
    expect(cours?.prealablesBrut).toBe("MAT1600");
    expect(cours?.concomitantsBrut).toBe("STT2700");
    expect(cours?.prealables).toEqual({ genre: "cours", code: "MAT 1600" });
  });

  it("ACT 3261 : le point collé au code est conservé VERBATIM", () => {
    // « Préalable : ACT3251.; Concomitant : STT3790. » — le point final
    // faisait échouer le parseur de la 1re passe. Le brut le conserve
    // verbatim plutôt que de le nettoyer en cachette, et c'est le moteur qui
    // le rogne à la lecture : le brut reste ce que la page dit.
    const { cours, prealablesComplet } = fiche("act-3261");
    expect(cours?.prealablesBrut).toBe("ACT3251.");
    expect(cours?.concomitantsBrut).toBe("STT3790.");
    expect(prealablesComplet).toBe(true);
  });
});

describe("parseFicheCours — étiquettes au singulier et cas limites du sommaire", () => {
  it("STT 1682 : l'étiquette est « Crédit » (1 crédit), pas « Crédits »", () => {
    const { cours } = fiche("stt-1682");
    expect(cours?.credits).toBe(1);
  });

  it("STT 3510 : l'étiquette est « Trimestre » au singulier", () => {
    const { cours, journal } = fiche("stt-3510");
    expect(cours?.trimestres).toEqual([{ saison: "Hiver", annee: 2027 }]);
    expect(journal.entrees).toEqual([]);
  });

  it("ACT 4000 : aucun trimestre publié -> [] ET une entrée au journal", () => {
    // Un tableau vide sans trace au journal serait indistinguable d'un bogue
    // de lecture ; le planificateur doit savoir que l'offre est inconnue.
    const { cours, journal } = fiche("act-4000");
    expect(cours?.trimestres).toEqual([]);
    expect(journal.entrees.some((e) => e.quoi.includes("Trimestre"))).toBe(true);
  });

  it("MAT 6117 : cycle « Cycles supérieurs » et 4 crédits", () => {
    const { cours } = fiche("mat-6117");
    expect(cours?.cycle).toBe("Cycles supérieurs");
    expect(cours?.credits).toBe(4);
  });

  it("DMO 1000 : la restriction d'inscription va au journal, pas dans les préalables", () => {
    const { cours, journal } = fiche("dmo-1000");
    expect(cours?.prealablesBrut).toBeNull();
    expect(cours?.concomitantsBrut).toBeNull();
    const alerte = journal.entrees.find((e) => e.gravite === "inattendu");
    expect(alerte?.quoi).toContain("Restrictions d'inscription: DMO1000/DMO1010");
  });
});

describe("parseFicheCours — indépendance aux fins de ligne", () => {
  // Même raison que pour la structure : `core.autocrlf=true` dans ce dépôt.
  for (const slug of ["act-2250", "act-3261", "stt-2400", "act-4000", "dmo-1000"]) {
    it(`${slug} : résultat identique en CRLF`, () => {
      const chemin = path.join(import.meta.dirname, "__fixtures__", `cours-${slug}.html`);
      const lf = readFileSync(chemin, "utf8");
      const a = parseFicheCours(lf, "u", ISO, parsePrealables);
      const b = parseFicheCours(lf.replace(/\r?\n/g, "\r\n"), "u", ISO, parsePrealables);
      expect(b.cours).toEqual(a.cours);
      expect(b.journal.entrees).toEqual(a.journal.entrees);
    });
  }
});

describe("parseFicheCours — pages dégradées", () => {
  it("rejette une page qui n'est pas une fiche, au lieu d'inventer un cours", () => {
    const r = parseFicheCours("<html><body>Erreur 500</body></html>", "u", ISO, parsePrealables);
    expect(r.cours).toBeNull();
    expect(r.journal.entrees[0].quoi).toContain("span.cours-numero absent");
  });

  it("rejette une fiche dont les crédits sont illisibles plutôt que de mettre 0", () => {
    // Un cours à 0 crédit passerait tous les audits sans rien déclencher.
    const html =
      '<span class="cours-numero">ACT 2250</span>' +
      '<section class="cours-sommaire"><ul><li><b>Crédits</b><p>s.o.</p></li></ul></section>';
    const r = parseFicheCours(html, "u", ISO, parsePrealables);
    expect(r.cours).toBeNull();
    expect(r.journal.entrees[0].quoi).toContain("fiche rejetée");
  });
});
