/**
 * TESTS DE COUTURE — propriété de la session intégratrice.
 *
 * Chaque chantier passe ses propres tests. Ce fichier teste ce qu'aucun d'eux
 * ne peut tester : l'endroit où deux pièces correctes se rencontrent. Sur ce
 * projet, tous les défauts trouvés à l'intégration étaient de cette famille —
 * deux morceaux justes dont la jonction est fausse.
 *
 * Il lit `data/` À L'EXÉCUTION, par le système de fichiers, et non par import
 * statique. Deux raisons : la disposition v2 compte des milliers de petits
 * fichiers qu'on ne peut pas importer un par un, et un test qui s'adapte à ce
 * qui est réellement sur le disque ne se met pas à mesurer un artefact périmé —
 * la faute commise deux fois sur ce projet.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { diagnostiquerCours, auditProgramme } from "../lib/engine";
import { normaliserCode, cleBloc, sujetDeCode } from "../lib/codes";
import type {
  Catalogue,
  CodeCours,
  Cours,
  IndexProgrammes,
  Programme,
} from "../lib/types";

const DATA = join(import.meta.dirname, "..", "data");
const INDEX = join(DATA, "index-programmes.json");
const DIR_PROGRAMMES = join(DATA, "programmes");
const DIR_COURS = join(DATA, "cours");

/** La disposition v2 est-elle en place ? */
const V2_PRESENTE = existsSync(INDEX) && existsSync(DIR_PROGRAMMES) && existsSync(DIR_COURS);

const lire = <T,>(chemin: string): T => JSON.parse(readFileSync(chemin, "utf8")) as T;

/**
 * Un échantillon de programmes, pas les 1 088 : la suite doit rester rapide.
 * Il est DÉTERMINISTE (pas de hasard) et réparti sur toute la liste triée, pour
 * qu'un défaut qui ne toucherait qu'une famille de programmes ait une chance
 * d'apparaître.
 */
function echantillon<T>(liste: T[], n: number): T[] {
  if (liste.length <= n) return liste;
  const pas = liste.length / n;
  return Array.from({ length: n }, (_, i) => liste[Math.floor(i * pas)]);
}

describe("disposition des données sur disque", () => {
  it("la disposition v2 est en place, sinon tout le reste ne mesure rien", () => {
    // Ce test est le garde-fou de ce fichier. Tant que le scraper n'a pas
    // produit la disposition v2, les tests qui suivent sont ignorés — et
    // celui-ci dit pourquoi, au lieu de laisser huit échecs obscurs ou, pire,
    // une suite verte qui ne vérifie plus rien.
    if (!V2_PRESENTE) {
      const v1 = existsSync(join(DATA, "catalogue.json"));
      throw new Error(
        "Disposition v2 absente : il manque data/index-programmes.json, " +
          "data/programmes/ ou data/cours/." +
          (v1
            ? " data/catalogue.json (forme v1) est encore là : le contrat v2 a " +
              "changé la forme des règles de bloc, donc ce fichier est périmé. " +
              "Relancer `npm run scrape` quand le chantier scraper a livré."
            : " Aucune donnée du tout : lancer `npm run scrape`."),
      );
    }
    expect(V2_PRESENTE).toBe(true);
  });
});

describe.skipIf(!V2_PRESENTE)("couture index <-> fichiers de programmes", () => {
  it("chaque fiche de l'index a son fichier, et annonce le bon nombre de blocs", () => {
    const index = lire<IndexProgrammes>(INDEX);
    expect(index.programmes.length).toBeGreaterThan(0);
    for (const fiche of echantillon(index.programmes, 40)) {
      const chemin = join(DIR_PROGRAMMES, `${fiche.id}.json`);
      expect(existsSync(chemin), `fichier manquant pour ${fiche.id}`).toBe(true);
      const p = lire<Programme>(chemin);
      expect(p.id, `l'id du fichier diverge de l'index pour ${fiche.id}`).toBe(fiche.id);
      expect(p.blocs.length, `nbBlocs faux pour ${fiche.id}`).toBe(fiche.nbBlocs);
      // Une fiche qui annonce une structure lue doit avoir au moins un bloc,
      // sinon le sélecteur ouvrira un écran vide en promettant le contraire.
      if (fiche.structureLue) expect(p.blocs.length, fiche.id).toBeGreaterThan(0);
    }
  });

  it("aucun fichier de programme n'est orphelin de l'index", () => {
    const index = lire<IndexProgrammes>(INDEX);
    const connus = new Set(index.programmes.map((p) => p.id));
    const fichiers = readdirSync(DIR_PROGRAMMES).filter((f) => f.endsWith(".json"));
    const orphelins = fichiers
      .map((f) => f.replace(/\.json$/, ""))
      .filter((id) => !connus.has(id));
    expect(orphelins).toEqual([]);
  });
});

describe.skipIf(!V2_PRESENTE)("couture codes : une seule écriture partout", () => {
  it("chaque clé de fichier de cours est canonique et égale le champ code", () => {
    // LA couture la plus silencieuse du projet : UdeM écrit « ACT 2250 »,
    // « ACT2250 » et « act-2250 ». Une seule forme non normalisée d'un côté ne
    // lève aucune erreur — le graphe s'affiche sans arêtes et l'audit trouve
    // zéro cours fait.
    let verifies = 0;
    for (const f of readdirSync(DIR_COURS).filter((x) => x.endsWith(".json"))) {
      const fiches = lire<Record<CodeCours, Cours>>(join(DIR_COURS, f));
      for (const [cle, fiche] of Object.entries(fiches)) {
        expect(normaliserCode(cle), `clé non canonique dans ${f}: ${cle}`).toBe(cle);
        expect(fiche.code, `clé et champ code divergent dans ${f}: ${cle}`).toBe(cle);
        verifies++;
      }
    }
    expect(verifies).toBeGreaterThan(0);
  });

  it("chaque cours est rangé dans le fichier de son sujet", () => {
    // Le scraper découpe par sujet et l'UI charge par sujet : s'ils ne
    // découpent pas pareil, l'UI cherchera un cours dans le mauvais fichier et
    // l'affichera comme « sans fiche » sans que rien n'échoue.
    for (const f of readdirSync(DIR_COURS).filter((x) => x.endsWith(".json"))) {
      const sujetAttendu = f.replace(/\.json$/, "");
      const fiches = lire<Record<CodeCours, Cours>>(join(DIR_COURS, f));
      for (const cle of Object.keys(fiches)) {
        expect(sujetDeCode(cle), `${cle} est rangé dans ${f}`).toBe(sujetAttendu);
      }
    }
  });
});

describe.skipIf(!V2_PRESENTE)("couture blocs : identité et bornes", () => {
  const programmes = () =>
    echantillon(
      readdirSync(DIR_PROGRAMMES)
        .filter((f) => f.endsWith(".json"))
        .sort(),
      60,
    ).map((f) => lire<Programme>(join(DIR_PROGRAMMES, f)));

  it("la clé d'un bloc est unique dans son programme et se reconstruit", () => {
    // `Bloc.id` n'est PAS unique : la maîtrise en mathématiques porte
    // `MM-Bloc 73A` ET `S-Bloc 73A` dans le segment 73. Pendant la validation,
    // un extracteur ancré sur « Bloc » a fusionné 58 cours dans le mauvais
    // bloc, sans lever d'erreur.
    for (const p of programmes()) {
      const cles = new Set<string>();
      for (const b of p.blocs) {
        expect(b.cle, `${p.id} / ${b.id} : clé mal formée`).toBe(cleBloc(b.segment, b.id));
        expect(cles.has(b.cle), `${p.id} : clé de bloc en double ${b.cle}`).toBe(false);
        cles.add(b.cle);
      }
    }
  });

  it("les bornes d'un bloc sont cohérentes", () => {
    for (const p of programmes()) {
      for (const b of p.blocs) {
        if (b.regle.type === "inconnu") {
          // Une forme non interprétée doit conserver son texte : c'est ce qui
          // permet de l'ajouter au parseur plus tard au lieu de la perdre.
          expect(b.regle.brut.length, `${p.id} / ${b.cle}`).toBeGreaterThan(0);
          continue;
        }
        const { min, max } = b.regle.bornes;
        expect(min, `${p.id} / ${b.cle} : min négatif`).toBeGreaterThanOrEqual(0);
        expect(max, `${p.id} / ${b.cle} : max < min`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it("un bloc à liste de cours vide n'est qu'un bloc au choix", () => {
    // Un bloc obligatoire ou à option sans aucun cours listé serait une
    // exigence impossible à satisfaire, donc le signe d'une page mal lue.
    for (const p of programmes()) {
      for (const b of p.blocs) {
        if (b.cours.length === 0 && b.regle.type !== "choix" && b.regle.type !== "inconnu") {
          throw new Error(
            `${p.id} / ${b.cle} (${b.regleBrut}) : bloc ${b.regle.type} sans aucun cours`,
          );
        }
      }
    }
  });
});

describe.skipIf(!V2_PRESENTE)("couture moteur <-> données réelles", () => {
  /** Assemble un Catalogue minimal pour un programme, comme l'UI le fera. */
  function catalogueDe(p: Programme): Catalogue {
    const cours: Record<CodeCours, Cours> = {};
    const sujets = new Set(
      p.blocs.flatMap((b) => b.cours.map((c) => sujetDeCode(c)).filter((s): s is string => !!s)),
    );
    for (const sujet of sujets) {
      const chemin = join(DIR_COURS, `${sujet}.json`);
      if (!existsSync(chemin)) continue;
      Object.assign(cours, lire<Record<CodeCours, Cours>>(chemin));
    }
    return { programmes: [p], cours, prealablesNonParses: [], journal: [], scrapeISO: "" };
  }

  it("le moteur digère un échantillon de programmes sans lever", () => {
    const fichiers = echantillon(
      readdirSync(DIR_PROGRAMMES).filter((f) => f.endsWith(".json")).sort(),
      40,
    );
    let audites = 0;
    for (const f of fichiers) {
      const p = lire<Programme>(join(DIR_PROGRAMMES, f));
      if (p.blocs.length === 0) continue;
      const cat = catalogueDe(p);
      const vide = new Set<CodeCours>();
      expect(() => diagnostiquerCours(cat, vide), p.id).not.toThrow();
      const a = auditProgramme(p, cat, vide);
      // Un parcours vide n'est conforme nulle part : si ça arrive, c'est que le
      // programme n'a aucune exigence lisible, ce qui doit se voir.
      expect(a.conforme, `${p.id} : conforme avec zéro cours fait`).toBe(false);
      audites++;
    }
    expect(audites, "aucun programme auditable dans l'échantillon").toBeGreaterThan(0);
  });

  it("tout cours cité par un bloc a un diagnostic", () => {
    const fichiers = echantillon(
      readdirSync(DIR_PROGRAMMES).filter((f) => f.endsWith(".json")).sort(),
      20,
    );
    for (const f of fichiers) {
      const p = lire<Programme>(join(DIR_PROGRAMMES, f));
      if (p.blocs.length === 0) continue;
      const diag = diagnostiquerCours(catalogueDe(p), new Set<CodeCours>());
      for (const code of new Set(p.blocs.flatMap((b) => b.cours))) {
        expect(diag.get(code), `${p.id} : aucun diagnostic pour ${code}`).toBeDefined();
      }
    }
  });

  it("les crédits des fiches somment aux bornes des blocs obligatoires", () => {
    // Deux informations scrapées INDÉPENDAMMENT — la règle sur la page de
    // structure, les crédits sur chaque fiche de cours — qui doivent concorder.
    // Un écart signifie que l'une des deux est mal lue, et aucun test de
    // chantier ne peut le voir. Les blocs dont une fiche manque sont ignorés :
    // la somme y serait fausse pour une autre raison.
    let compares = 0;
    for (const f of echantillon(readdirSync(DIR_PROGRAMMES).filter((x) => x.endsWith(".json")).sort(), 60)) {
      const p = lire<Programme>(join(DIR_PROGRAMMES, f));
      const cat = catalogueDe(p);
      for (const b of p.blocs) {
        if (b.regle.type !== "obligatoire") continue;
        if (b.cours.length === 0) continue;
        if (b.cours.some((c) => !cat.cours[c])) continue;
        const somme = b.cours.reduce((s, c) => s + cat.cours[c].credits, 0);
        expect(somme, `${p.id} / ${b.cle} (${b.regleBrut})`).toBe(b.regle.bornes.min);
        compares++;
      }
    }
    expect(compares, "aucun bloc obligatoire complet à comparer").toBeGreaterThan(0);
  });
});
