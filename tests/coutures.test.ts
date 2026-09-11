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
import { createHash } from "node:crypto";
import { join } from "node:path";
import { diagnostiquerCours, auditProgramme } from "../lib/engine";
import { normaliserCode, cleBloc, sujetDeCode } from "../lib/codes";
import { cleParcours, parcoursDe, projeterOrientation } from "../lib/parcours";
import type {
  Bloc,
  Catalogue,
  CodeCours,
  Cours,
  EntreeJournal,
  IndexProgrammes,
  Programme,
} from "../lib/types";

const DATA = join(import.meta.dirname, "..", "data");
const INDEX = join(DATA, "index-programmes.json");
const DIR_PROGRAMMES = join(DATA, "programmes");
const DIR_COURS = join(DATA, "cours");
const JOURNAL = join(DATA, "journal.json");

/** La disposition v2 est-elle en place ? */
const V2_PRESENTE = existsSync(INDEX) && existsSync(DIR_PROGRAMMES) && existsSync(DIR_COURS);

const lire = <T,>(chemin: string): T => JSON.parse(readFileSync(chemin, "utf8")) as T;

/**
 * Les données portent-elles la VERSION COURANTE du contrat ?
 *
 * Distinct de `V2_PRESENTE` : les fichiers peuvent être là et dater d'une
 * version antérieure du contrat. C'est arrivé, et sans ce garde-fou ça se
 * manifestait par trois `TypeError: Cannot read properties of undefined` —
 * un mode d'échec qui ne dit pas ce qui manque et fait soupçonner le code
 * plutôt que la fraîcheur des données.
 */
function champsManquants(): string[] {
  if (!V2_PRESENTE) return [];
  const manques: string[] = [];
  const index = lire<IndexProgrammes>(INDEX);
  const f = index.programmes[0];
  if (f && f.cle === undefined) manques.push("FicheIndex.cle");
  const fichiers = readdirSync(DIR_PROGRAMMES).filter((x) => x.endsWith(".json")).sort();
  if (fichiers.length > 0) {
    const p0 = lire<Programme>(join(DIR_PROGRAMMES, fichiers[0]));
    if (p0.orientations === undefined) manques.push("Programme.orientations");
    const b0 = p0.blocs[0];
    if (b0 && b0.contenuOuvert === undefined) manques.push("Bloc.contenuOuvert");
  }
  return manques;
}

/**
 * Empreinte du code d'extraction PRÉSENT sur le disque.
 *
 * SHA-256 du contenu de `scripts/scrape/*.ts`, hors fichiers de test (ils ne
 * changent pas ce que le scraper écrit), pris dans l'ordre alphabétique. Les
 * fins de ligne sont normalisées : sans ça l'empreinte dépendrait du réglage
 * `core.autocrlf` de la machine et non du code.
 *
 * Le scraper doit calculer la SIENNE de la même façon et la déposer dans
 * `IndexProgrammes.empreinteExtracteur`. Si les deux formules divergent, le
 * test de fraîcheur le dit dans son message plutôt que de laisser croire à un
 * scrape en retard.
 */
function empreinteExtracteur(): string {
  const dir = join(import.meta.dirname, "..", "scripts", "scrape");
  const h = createHash("sha256");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts")).sort()) {
    h.update(f);
    h.update(readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex");
}

const MANQUES = champsManquants();
const PRET = V2_PRESENTE && MANQUES.length === 0;

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

const fichiersProgrammes = (): string[] =>
  readdirSync(DIR_PROGRAMMES).filter((f) => f.endsWith(".json")).sort();

/**
 * Texte du journal, MAIS seulement s'il décrit une passe « programmes ».
 *
 * Deux invariants de ce fichier attestent qu'une anomalie a été VUE par sa
 * présence au journal — un bloc vide, un écart de somme de crédits. Ils ne
 * valent donc que si le journal décrit la passe qui a produit `data/programmes`.
 *
 * Or `data/journal.json` est ÉCRASÉ à chaque passe, délibérément : il décrit la
 * DERNIÈRE passe, pas l'historique (`scripts/scrape/disposition.ts`). Une passe
 * « cours » avec `--reprendre` saute les 1 088 programmes, ne journalise aucun
 * bloc, et le journal tombe à zéro entrée de programme. Mesuré par le chantier
 * scraper : 3 488 entrées → 0, sans qu'une ligne de test ni de scraper ait
 * changé.
 *
 * Les deux tests deviendraient alors rouges en accusant les données, pour une
 * raison qui n'est ni dans les données ni dans eux. On refuse donc de mesurer
 * plutôt que de mal mesurer — et on le dit, au lieu de se sauter en silence :
 * un invariant qui s'esquive tout seul est la panne que ce fichier combat.
 */
function texteJournalDeProgrammes(): string {
  const journal = existsSync(JOURNAL) ? lire<EntreeJournal[]>(JOURNAL) : [];
  const slugs = new Set(fichiersProgrammes().map((f) => f.replace(/\.json$/, "")));
  const deProgrammes = journal.filter((e) => slugs.has(e.sujet.split(" ")[0]));
  if (deProgrammes.length === 0) {
    throw new Error(
      `data/journal.json ne décrit pas une passe « programmes » : aucune de ses ` +
        `${journal.length} entrées ne porte sur un des ${slugs.size} programmes de ` +
        `data/programmes/. Le journal est écrasé à chaque passe — une passe ` +
        `« cours » l'a donc vidé de ce qui atteste les blocs. Relancer une passe ` +
        `programmes (\`npm run scrape\`) pour que cet invariant redevienne ` +
        `mesurable. Ce n'est ni un défaut des données ni un défaut du test.`,
    );
  }
  return journal.map((e) => `${e.sujet} ${e.message}`).join("\n");
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

  it("les données portent la version courante du contrat", () => {
    // Sans ce test, un décalage de version se manifeste par des TypeError
    // dispersés qui font soupçonner le code au lieu des données.
    if (MANQUES.length > 0) {
      throw new Error(
        "Les données de data/ datent d'une version antérieure du contrat : " +
          `champ(s) absent(s) ${MANQUES.join(", ")}. Relancer le scrape après ` +
          "que le chantier scraper a rapatrié le contrat courant.",
      );
    }
    expect(MANQUES).toEqual([]);
  });

  it("les données ont été produites par l'extracteur PRÉSENT sur le disque", () => {
    // LE DÉFAUT QUE CE TEST ATTRAPE, vécu le 2026-09-11. L'extracteur a appris
    // à distinguer deux blocs homonymes (commit 4cdde1a, 13 h 28) et le scrape
    // n'a pas été relancé : `data/` datait de 13 h 09. Le test de collision
    // ci-dessous est devenu rouge sur « clé de bloc en double 70/70A ».
    //
    // Ce message accuse deux innocents. La page amont porte BIEN deux
    // `Bloc 70A` — vérifié dans son HTML — et l'extracteur courant les
    // distingue BIEN — vérifié en le rejouant sur la page re-téléchargée.
    // Seules les données étaient en retard, et rien ne le disait.
    //
    // `scrapeISO` ne peut pas le dire : il date la passe, pas le code qui l'a
    // faite. D'où `empreinteExtracteur`, que le scraper écrit à chaque passe et
    // qu'on recalcule ici sur le code réellement présent.
    //
    // Le test se TAIT quand le champ est absent : tant que le chantier scraper
    // ne l'écrit pas, fabriquer un échec ferait exactement ce qu'on reproche au
    // message de collision — désigner un coupable qu'on n'a pas mesuré.
    const index = lire<IndexProgrammes>(INDEX);
    if (index.empreinteExtracteur === undefined) return;
    expect(
      index.empreinteExtracteur,
      "Les données de data/ n'ont PAS été produites par le code d'extraction " +
        "présent sur le disque. Presque toujours : le scrape n'a pas été " +
        "relancé après un correctif de l'extracteur — lancer `npm run scrape`. " +
        "Tant que ce n'est pas fait, tout échec des tests de contenu ci-dessous " +
        "mesure un artefact périmé et n'accuse personne à juste titre. " +
        "(Autre cause possible : la formule d'empreinte du scraper a divergé de " +
        "`empreinteExtracteur()` dans ce fichier — les deux doivent hacher les " +
        "mêmes fichiers dans le même ordre.)",
    ).toBe(empreinteExtracteur());
  });
});

describe.skipIf(!PRET)("couture index <-> fichiers de programmes", () => {
  it("chaque fiche de l'index a son fichier, et annonce le bon nombre de blocs", () => {
    const index = lire<IndexProgrammes>(INDEX);
    expect(index.programmes.length).toBeGreaterThan(0);
    for (const fiche of echantillon(index.programmes, 40)) {
      const chemin = join(DIR_PROGRAMMES, `${fiche.id}.json`);
      expect(existsSync(chemin), `fichier manquant pour ${fiche.id}`).toBe(true);
      const p = lire<Programme>(chemin);
      expect(p.id, `l'id du fichier diverge de l'index pour ${fiche.id}`).toBe(fiche.id);
      if (fiche.structureLue) {
        expect(p.blocs.length, `structureLue mais aucun bloc : ${fiche.cle}`).toBeGreaterThan(0);
      }
    }
  });

  it("la clé d'une fiche est celle du parcours, et elle est unique", () => {
    // Une page peut porter plusieurs parcours : ~545 pages exploitables portent
    // ~964 parcours, jusqu'à dix orientations sur une seule page. L'index a
    // donc une entrée par PARCOURS, et plusieurs partagent le même `id`.
    const index = lire<IndexProgrammes>(INDEX);
    const cles = new Set<string>();
    for (const fiche of index.programmes) {
      expect(fiche.cle, `clé mal formée : ${fiche.cle}`).toBe(
        cleParcours(fiche.id, fiche.orientation),
      );
      expect(cles.has(fiche.cle), `clé de parcours en double : ${fiche.cle}`).toBe(false);
      cles.add(fiche.cle);
    }
  });

  it("les parcours de l'index sont exactement ceux des fichiers de programmes", () => {
    // Si le scraper et `parcoursDe()` ne comptent pas les parcours pareil, le
    // sélecteur proposera des parcours qui ne s'ouvrent pas, ou en cachera.
    const index = lire<IndexProgrammes>(INDEX);
    const parId = new Map<string, string[]>();
    for (const f of index.programmes) {
      parId.set(f.id, [...(parId.get(f.id) ?? []), f.cle]);
    }
    for (const [id, cles] of echantillon([...parId.entries()], 40)) {
      const p = lire<Programme>(join(DIR_PROGRAMMES, `${id}.json`));
      const attendus = parcoursDe(p).map((x) => x.cle).sort();
      expect(cles.slice().sort(), `parcours divergents pour ${id}`).toEqual(attendus);
    }
  });

  it("aucun fichier de programme n'est orphelin de l'index", () => {
    const index = lire<IndexProgrammes>(INDEX);
    const connus = new Set(index.programmes.map((p) => p.id));
    const orphelins = fichiersProgrammes()
      .map((f) => f.replace(/\.json$/, ""))
      .filter((id) => !connus.has(id));
    expect(orphelins).toEqual([]);
  });
});

describe.skipIf(!PRET)("couture codes : une seule écriture partout", () => {
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

describe.skipIf(!PRET)("couture blocs : identité, bornes et contenu", () => {
  const programmes = () =>
    echantillon(fichiersProgrammes(), 60).map((f) => lire<Programme>(join(DIR_PROGRAMMES, f)));

  it("la clé d'un bloc est unique dans son programme et se reconstruit", () => {
    // `Bloc.id` n'est PAS unique : la maîtrise en mathématiques porte
    // `MM-Bloc 73A` ET `S-Bloc 73A` dans le segment 73. Pendant la validation,
    // un extracteur ancré sur « Bloc » a fusionné 58 cours dans le mauvais
    // bloc, sans lever d'erreur.
    //
    // QUAND CE TEST ÉCHOUE, LIRE LE MESSAGE AVANT D'ACCUSER LA PAGE. Une clé en
    // double a trois causes possibles, et elles ne se corrigent pas au même
    // endroit :
    //
    //   1. les données sont plus vieilles que l'extracteur — le test de
    //      fraîcheur plus haut le dit ; relancer `npm run scrape` ;
    //   2. la page porte un DISCRIMINANT que la clé jette. Deux familles
    //      mesurées sur les 1 088 pages : le `<small>` de qualification
    //      (« Accès direct du B. Sc. au Ph. D. » contre « Accès de la M. Sc. au
    //      Ph. D. », doctorat en pathologie) et le NOM dans le `<h4>`
    //      (« Bloc 70D Stage » contre « Bloc 70D Travail dirigé », maîtrise en
    //      finance mathématique). Le correctif est dans la fabrication de
    //      l'identité, pas ici ;
    //   3. la page répète vraiment deux blocs indiscernables — alors seulement
    //      c'est l'amont qui est en faute.
    //
    // Le message distingue les trois, parce que la première fois il ne le
    // faisait pas et a envoyé chercher un défaut d'extracteur qui n'existait
    // pas.
    const collisions: string[] = [];
    for (const p of programmes()) {
      const vus = new Map<string, Bloc>();
      for (const b of p.blocs) {
        expect(b.cle, `${p.id} / ${b.id} : clé mal formée`).toBe(cleBloc(b.segment, b.id, b.nom));
        const jumeau = vus.get(b.cle);
        if (jumeau === undefined) {
          vus.set(b.cle, b);
          continue;
        }
        const ecarts: string[] = [];
        if (jumeau.nom !== b.nom) ecarts.push(`nom « ${jumeau.nom} » ≠ « ${b.nom} »`);
        if (jumeau.regleBrut !== b.regleBrut) {
          ecarts.push(`règle « ${jumeau.regleBrut} » ≠ « ${b.regleBrut} »`);
        }
        collisions.push(
          `${p.id} : clé de bloc en double ${b.cle} — ` +
            (ecarts.length > 0
              ? `les deux blocs DIFFÈRENT (${ecarts.join(" ; ")}), donc la page porte ` +
                `un discriminant que la clé jette : corriger la fabrication de ` +
                `l'identité, pas ce test`
              : `les deux blocs sont indiscernables dans les données : c'est la page ` +
                `amont qu'il faut aller lire`),
        );
      }
    }
    expect(collisions).toEqual([]);
  });

  it("les bornes d'un bloc sont cohérentes", () => {
    for (const p of programmes()) {
      for (const b of p.blocs) {
        if (b.regle.type === "inconnu") {
          // Une forme non interprétée conserve son texte : c'est ce qui permet
          // de l'ajouter au parseur plus tard au lieu de la perdre.
          expect(b.regle.brut.length, `${p.id} / ${b.cle}`).toBeGreaterThan(0);
          continue;
        }
        const { min, max } = b.regle.bornes;
        expect(min, `${p.id} / ${b.cle} : min négatif`).toBeGreaterThanOrEqual(0);
        expect(max, `${p.id} / ${b.cle} : max < min`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it("un bloc à liste vide est au choix, ou déclaré à contenu ouvert", () => {
    // Première version de ce test : « un bloc à liste vide n'est qu'un bloc au
    // choix ». FAUX sur de vraies pages, et c'est le scraper qui l'a mesuré :
    // il existe des blocs « catégorie » dont le contenu n'est décrit qu'en
    // prose — bacc en économie et politique 71/71G et bacc en musique 02/02E,
    // tous deux « Option - maximum 6 crédits » renvoyant aux cours du Centre de
    // langues, sans aucun lien de cours dans le HTML.
    //
    // DEUXIÈME version, tombée elle aussi : « tout bloc vide est DÉCLARÉ par
    // contenuOuvert ». Contre-exemple mesuré sur les 1 088 pages — 50 blocs
    // n'ont NI cours NI prose, la page est littéralement vide à cet endroit.
    // Ils se concentrent dans `certificat-detudes-individualisees-es-arts` et
    // `-es-sciences`, ce qui se comprend : un certificat d'études
    // individualisées ne liste pas ses cours, ils se choisissent au cas par cas.
    // `contenuOuvert: false` y est correct — il n'y a pas un contenu décrit
    // ailleurs, il n'y a rien.
    //
    // L'invariant tenable est donc le même que pour les sommes de crédits :
    // non pas que l'amont soit régulier, mais que TOUT BLOC VIDE SOIT VU. Un
    // bloc vide journalisé est une donnée constatée ; un bloc vide muet reste
    // une page mal lue.
    const texteJournal = texteJournalDeProgrammes();
    const videsNonVus: string[] = [];
    for (const p of programmes()) {
      for (const b of p.blocs) {
        if (b.cours.length > 0) continue;
        if (b.regle.type === "choix" || b.regle.type === "inconnu") continue;
        if (b.contenuOuvert) {
          // Un contenu ouvert doit être DOCUMENTÉ, sinon l'étudiant voit un
          // bloc à remplir sans savoir avec quoi.
          expect(
            b.notes.length,
            `${p.id} / ${b.cle} : contenu ouvert sans prose`,
          ).toBeGreaterThan(0);
          continue;
        }
        if (!texteJournal.includes(b.cle) && !texteJournal.includes(p.id)) {
          videsNonVus.push(`${p.id} / ${b.cle} (${b.regleBrut}) : bloc vide et muet`);
        }
      }
    }
    expect(videsNonVus).toEqual([]);
  });
});

describe.skipIf(!PRET)("couture moteur <-> données réelles", () => {
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

  /** Tous les parcours d'un échantillon de programmes, déjà projetés. */
  function parcoursEchantillon(n: number): Programme[] {
    const out: Programme[] = [];
    for (const f of echantillon(fichiersProgrammes(), n)) {
      const p = lire<Programme>(join(DIR_PROGRAMMES, f));
      if (p.orientations.length === 0) {
        out.push(p);
        continue;
      }
      for (const o of p.orientations) out.push(projeterOrientation(p, o.nom));
    }
    return out;
  }

  it("le moteur digère un échantillon de parcours sans lever", () => {
    let audites = 0;
    for (const p of parcoursEchantillon(40)) {
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
    expect(audites, "aucun parcours auditable dans l'échantillon").toBeGreaterThan(0);
  });

  it("tout cours cité par un bloc a un diagnostic", () => {
    for (const p of parcoursEchantillon(20)) {
      if (p.blocs.length === 0) continue;
      const diag = diagnostiquerCours(catalogueDe(p), new Set<CodeCours>());
      for (const code of new Set(p.blocs.flatMap((b) => b.cours))) {
        expect(diag.get(code), `${p.id} : aucun diagnostic pour ${code}`).toBeDefined();
      }
    }
  });

  it("tout écart entre la règle d'un bloc et la somme de ses cours est journalisé", () => {
    // Deux informations scrapées INDÉPENDAMMENT — la règle sur la page de
    // structure, les crédits sur chaque fiche — qui devraient concorder.
    // Première version de ce test : elles DOIVENT concorder.
    //
    // FAUX, et pour une raison qu'aucun code ne peut corriger : la page du bacc
    // en musique annonce « Obligatoire - 15 crédits » au bloc 01/01A et n'y
    // liste que 4 cours à 3 crédits, soit 12. Vérifié dans le HTML brut, rien
    // de caché. C'est la donnée amont qui est incohérente.
    //
    // L'invariant utile n'est donc pas que la page soit juste, mais que l'écart
    // soit VU. Exiger la perfection de l'amont bloquerait sur une donnée qu'on
    // ne maîtrise pas ; tolérer en silence est exactement ce que ce projet
    // refuse. Donc : chaque écart doit apparaître dans le journal.
    const texteJournal = texteJournalDeProgrammes();
    let compares = 0;
    const ecartsNonJournalises: string[] = [];
    for (const f of echantillon(fichiersProgrammes(), 60)) {
      const p = lire<Programme>(join(DIR_PROGRAMMES, f));
      const cat = catalogueDe(p);
      for (const b of p.blocs) {
        if (b.regle.type !== "obligatoire") continue;
        if (b.cours.length === 0) continue;
        if (b.cours.some((c) => !cat.cours[c])) continue;
        compares++;
        const somme = b.cours.reduce((s, c) => s + cat.cours[c].credits, 0);
        if (somme === b.regle.bornes.min) continue;
        // Un écart est acceptable ; un écart muet ne l'est pas.
        if (!texteJournal.includes(b.cle) && !texteJournal.includes(b.id)) {
          ecartsNonJournalises.push(
            `${p.id} / ${b.cle} (${b.regleBrut}) : somme des fiches = ${somme}`,
          );
        }
      }
    }
    expect(compares, "aucun bloc obligatoire complet à comparer").toBeGreaterThan(0);
    expect(ecartsNonJournalises).toEqual([]);
  });
});
