/**
 * `npm run scrape` — de l'inventaire officiel à la disposition sur disque.
 *
 * Enchaînement : sitemap -> 1 088 slugs de programmes et 11 888 slugs de cours
 * -> une page de structure par programme -> une fiche par cours -> `data/`.
 *
 * REPRENABLE À DEUX NIVEAUX, parce qu'un scrape de quatre heures sera interrompu :
 *   1. le cache disque (`reseau.ts`) : aucune page déjà récupérée n'est
 *      redemandée, quel que soit son âge ;
 *   2. `--reprendre` : aucun programme dont `data/programmes/<id>.json` existe
 *      déjà n'est même relu. Une reprise coûte alors zéro requête.
 *
 * OPTIONS
 *   --limite N            ne traiter que les N premiers programmes de l'inventaire
 *   --programmes a,b,c    ne traiter que ces slugs (tout le reste est ignoré)
 *   --reprendre           sauter les programmes déjà écrits dans data/programmes/
 *                         ET les cours déjà en fiche dans data/cours/. C'est ce
 *                         qui rend la passe cours DÉCOUPABLE : sans ça,
 *                         `--limite-cours N` reprend indéfiniment les N premiers
 *                         codes de l'union (voir plus bas).
 *   --tous-les-cours      scraper les 11 888 fiches du sitemap, et pas seulement
 *                         celles citées par les programmes retenus
 *   --cours-cites         ne scraper que l'union des codes cités par les
 *                         programmes DÉJÀ sur disque (passe à faire après une
 *                         passe --sans-cours ; elle imprime la taille de l'union).
 *                         Combiné à --programmes, l'union est restreinte à ces
 *                         slugs : « les cours qui manquent À CE LOT ». C'est ce
 *                         qui permet de CIBLER et de REPRENDRE en même temps.
 *   --limite-cours N      plafonner le nombre de fiches de cours de cette passe
 *   --delai MS            délai entre deux requêtes réseau (défaut 1200)
 *   --tentatives N        essais par URL sur panne de transport (défaut 4)
 *   --max-age-jours N     périmer le cache au-delà de N jours (défaut 0 = jamais)
 *   --rafraichir          ignorer le cache en lecture et tout redemander
 *   --hors-ligne          ne toucher le réseau sous AUCUN prétexte : tout se lit
 *                         dans le cache, et ce qui manque est journalisé. Sert à
 *                         valider sans frapper le serveur — notamment quand une
 *                         autre session y travaille, car deux sessions
 *                         simultanées annulent le délai poli de chacune.
 *   --sans-cours          ne scraper aucune fiche de cours (passe « structures »)
 *
 * Par défaut, `--limite` et `--programmes` restreignent AUSSI les cours à ceux
 * que les programmes retenus citent : sans ça, un échantillon de 30 programmes
 * déclencherait les 11 888 fiches et durerait quatre heures, ce qui annule
 * l'intérêt de l'échantillon.
 *
 * Ce module est chargé par `index.ts` APRÈS l'installation du résolveur
 * d'imports sans extension (voir `index.ts` et `resolveur-ts.mjs`).
 */
import type { Cours, FicheIndex, Programme } from "../../lib/types";
import { slugUrl, normaliserCode } from "../../lib/codes";
import { parsePrealables } from "../../lib/engine/prealables";
import { empreinteExtracteur } from "../../lib/empreinte";
import { parseFicheCours } from "./cours";
import {
  CHEMIN_INDEX,
  CHEMIN_JOURNAL,
  DOSSIER_PROGRAMMES,
  RACINE_DEPOT,
  codesSurDisque,
  ecrireCours,
  ecrireIndex,
  ecrireJournal,
  ecrireProgramme,
  fichesDeProgramme,
} from "./disposition";
import { contenu, texteLigne } from "./html";
import { Journal } from "./journal";
import {
  DELAI_DEFAUT_MS,
  STATUT_HORS_LIGNE,
  STATUT_PANNE,
  TENTATIVES_DEFAUT,
  compteurs,
  configurerReseau,
  oublierCache,
  recuperer,
} from "./reseau";
import {
  ecrireSousSitemapsPersistes,
  lireSousSitemapsPersistes,
  slugCours,
  slugProgramme,
  sousSitemaps,
  sousSitemapsDuJeu,
  uniques,
  urlsSitemap,
} from "./sitemap";
import { formeDeRegle } from "./regles";
import { parseStructure, typeDuNom } from "./structure";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const RACINE = "https://admission.umontreal.ca";
const SITEMAP = `${RACINE}/sitemap.xml`;

interface Options {
  limite: number | null;
  programmes: string[] | null;
  reprendre: boolean;
  tousLesCours: boolean;
  coursCites: boolean;
  limiteCours: number | null;
  sansCours: boolean;
  /** Recopié depuis les options réseau : `--rafraichir` veut dire « tout
   *  redemander », ce qui interdit à `--reprendre` de sauter quoi que ce soit. */
  rafraichir: boolean;
}

function lireArguments(argv: string[]): Options {
  const lus = new Map<string, string>();
  const fanions = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const nom = a.slice(2);
    const suivant = argv[i + 1];
    if (suivant !== undefined && !suivant.startsWith("--")) {
      lus.set(nom, suivant);
      i += 1;
    } else {
      fanions.add(nom);
    }
  }

  const entier = (nom: string): number | null => {
    const brut = lus.get(nom);
    if (brut === undefined) return null;
    const n = Number.parseInt(brut, 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${nom} attend un entier positif, reçu « ${brut} »`);
    return n;
  };

  configurerReseau({
    delaiMs: entier("delai") ?? DELAI_DEFAUT_MS,
    maxAgeJours: entier("max-age-jours") ?? 0,
    rafraichir: fanions.has("rafraichir"),
    tentatives: entier("tentatives") ?? TENTATIVES_DEFAUT,
    horsLigne: fanions.has("hors-ligne"),
  });

  const listeProgrammes = lus.get("programmes");
  return {
    limite: entier("limite"),
    programmes: listeProgrammes
      ? listeProgrammes
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "")
      : null,
    reprendre: fanions.has("reprendre"),
    tousLesCours: fanions.has("tous-les-cours"),
    coursCites: fanions.has("cours-cites"),
    limiteCours: entier("limite-cours"),
    sansCours: fanions.has("sans-cours"),
    rafraichir: fanions.has("rafraichir"),
  };
}

async function existe(chemin: string): Promise<boolean> {
  try {
    await access(chemin);
    return true;
  } catch {
    return false;
  }
}

interface Inventaire {
  programmes: string[];
  cours: string[];
}

/**
 * La liste des sous-sitemaps : l'index si on l'obtient, sinon la liste persistée.
 *
 * `…/sitemap.xml` a répondu son `<sitemapindex>` de 16 entrées puis, quelques
 * minutes plus tard, un `<urlset>` de 1 000 URLs de programmes — le cache du
 * site sert la réponse d'un sous-sitemap à la place de l'index. Les
 * sous-sitemaps avec leur `cHash` répondent juste, eux. D'où : on tente l'index,
 * on le persiste quand il est bon, et on replie sur la liste persistée quand il
 * ne l'est pas. Jamais de fabrication d'URL de sous-sitemap : sans son `cHash`,
 * le site renvoie 200 avec l'index, et on récolterait 16 liens au lieu de 1 088
 * programmes sans qu'aucun statut ne le dise.
 */
async function listeSousSitemaps(journal: Journal): Promise<string[]> {
  const page = await recuperer(SITEMAP);
  if (page.html !== null) {
    try {
      const locs = sousSitemaps(page.html);
      await ecrireSousSitemapsPersistes(SITEMAP, locs);
      console.log(`Sitemap : ${locs.length} sous-sitemaps lus dans l'index (${page.depuisCache ? "cache" : "réseau"})`);
      return locs;
    } catch (cause) {
      journal.inattendu(
        "sitemap",
        `${SITEMAP} n'a pas servi son index (${String(cause)}) — repli sur scripts/scrape/sous-sitemaps.json`,
      );
      // Ne pas figer cette réponse : elle est valide comme XML mais ce n'est pas
      // ce qu'on a demandé. En cache, elle rejouerait le même échec à chaque passe.
      await oublierCache(SITEMAP);
    }
  } else {
    journal.inattendu("sitemap", `HTTP ${page.statut} sur ${SITEMAP} — repli sur scripts/scrape/sous-sitemaps.json`);
  }

  const persiste = await lireSousSitemapsPersistes();
  if (persiste === null) {
    throw new Error(
      `${SITEMAP} n'a pas servi son <sitemapindex> et aucune liste n'est persistée dans ` +
        "scripts/scrape/sous-sitemaps.json. Cause connue : le cache du site sert parfois la réponse " +
        "d'un sous-sitemap à la place de l'index. Réessayer plus tard, ou coller la liste des <loc> " +
        "de l'index (avec leur cHash) dans ce fichier.",
    );
  }
  console.log(
    `Sitemap : index indisponible, repli sur ${persiste.sousSitemaps.length} sous-sitemaps persistés (captés le ${persiste.capteLe})`,
  );
  return persiste.sousSitemaps;
}

async function lireInventaire(journal: Journal): Promise<Inventaire> {
  const locs = await listeSousSitemaps(journal);

  const recolter = async (jeu: string, extraire: (u: string) => string | null): Promise<string[]> => {
    const sous = sousSitemapsDuJeu(locs, jeu);
    if (sous.length === 0) {
      journal.erreur("sitemap", `aucun sous-sitemap « ${jeu} » dans l'index`);
      return [];
    }
    const slugs: string[] = [];
    for (const loc of sous) {
      const p = await recuperer(loc);
      if (p.html === null) {
        journal.erreur("sitemap", `HTTP ${p.statut} sur ${loc} — inventaire ${jeu} incomplet`);
        continue;
      }
      let urls: string[];
      try {
        urls = urlsSitemap(p.html, loc);
      } catch (cause) {
        // Un sous-sitemap qui rend l'index à la place de sa liste : on le dit et
        // on continue, plutôt que de perdre les treize autres.
        journal.erreur("sitemap", `${loc} : ${String(cause)} — inventaire ${jeu} incomplet`);
        await oublierCache(loc);
        continue;
      }
      for (const url of urls) {
        const slug = extraire(url);
        if (slug === null) {
          journal.inattendu("sitemap", `URL ${jeu} de forme inattendue, ignorée : ${url}`);
          continue;
        }
        slugs.push(slug);
      }
    }
    const uniq = uniques(slugs);
    console.log(`  ${jeu} : ${uniq.length} slugs (${sous.length} sous-sitemaps)`);
    return uniq;
  };

  return {
    programmes: await recolter("programmes", slugProgramme),
    cours: await recolter("cours", slugCours),
  };
}

/**
 * Nom / cycle / faculté depuis la page d'accueil du programme.
 *
 * Ne sert QUE si la page de structure répond 404 : la fiche d'index a besoin
 * d'un nom lisible, et le slug n'en est pas un (« des-en-anesthesiologie »
 * n'est pas « DES en anesthésiologie »). Une requête de plus, seulement pour
 * les rares programmes concernés, plutôt qu'un nom fabriqué.
 */
async function entetteDepuisAccueil(
  slug: string,
  journal: Journal,
): Promise<{ nom: string; cycle: string | null; faculte: string | null }> {
  const url = `${RACINE}/programmes/${slug}/`;
  const page = await recuperer(url);
  if (page.html === null) {
    journal.manque(slug, `page d'accueil aussi inaccessible (HTTP ${page.statut}) — nom laissé vide`);
    return { nom: "", cycle: null, faculte: null };
  }
  const nomBrut = contenu(page.html, "div", "programme-name");
  const cycleBrut = contenu(page.html, "span", "cycle");
  const faculteBrute = contenu(page.html, "p", "faculte");
  const nom = nomBrut ? texteLigne(nomBrut) : "";
  if (nom === "") journal.manque(slug, "div.programme-name absent de la page d'accueil — nom laissé vide");
  return {
    nom,
    cycle: cycleBrut ? texteLigne(cycleBrut) || null : null,
    faculte: faculteBrute ? texteLigne(faculteBrute) || null : null,
  };
}

/**
 * Union des codes cités par tous les fichiers de `data/programmes/` sur disque.
 *
 * C'est la mesure qui décide du budget de la passe cours : 11 888 fiches à
 * 1,2 s font plus de trois heures, et le catalogue complet contient des cours
 * qu'aucun programme ne cite. Cette union-là, on la lit au lieu de la supposer.
 */
async function codesDesProgrammesSurDisque(
  deCettePasse: Set<string>,
  journal: Journal,
  restreindreA: string[] | null,
): Promise<Set<string>> {
  const union = new Set(deCettePasse);
  let fichiers: string[] = [];
  try {
    fichiers = (await readdir(DOSSIER_PROGRAMMES)).filter((f) => f.endsWith(".json"));
    // `--cours-cites --programmes a,b,c` = « les cours qui manquent À CES
    // programmes-là ». Sans cette restriction, cibler un lot exigeait de se
    // passer de `--reprendre` (qui vide la sélection de programmes puisqu'ils
    // sont déjà sur disque), et la passe redemandait alors tout ce que le lot
    // cite — mesuré sur un lot réel : 648 fiches déjà acquises re-téléchargées
    // pour rien, 37 minutes et autant de requêtes inutiles vers un serveur
    // tiers. Cibler et reprendre doivent pouvoir se combiner.
    if (restreindreA !== null) {
      const voulus = new Set(restreindreA.map((s) => `${s}.json`));
      const absents = restreindreA.filter((s) => !fichiers.includes(`${s}.json`));
      for (const s of absents) {
        journal.manque(s, "slug demandé par --programmes mais aucun fichier sur disque — ses cours ne sont pas dans l'union");
      }
      fichiers = fichiers.filter((f) => voulus.has(f));
    }
  } catch {
    journal.manque(
      "data/programmes",
      "--cours-cites mais aucun fichier de programme sur disque : faire d'abord une passe --sans-cours",
    );
    return union;
  }
  for (const f of fichiers) {
    try {
      const p = JSON.parse(await readFile(path.join(DOSSIER_PROGRAMMES, f), "utf8")) as Programme;
      for (const bloc of p.blocs ?? []) for (const code of bloc.cours ?? []) union.add(code);
    } catch (cause) {
      journal.erreur(f, `fichier de programme illisible (${String(cause)}) — ses codes sont absents de l'union`);
    }
  }
  console.log(
    `\n--cours-cites : ${union.size} codes cités par ${fichiers.length} programmes sur disque ` +
      `(le catalogue complet en compte 11 888)`,
  );
  return union;
}

/**
 * Recoupe la règle d'un bloc obligatoire avec la somme des crédits de ses fiches.
 *
 * UN ÉCART N'EST PAS TOUJOURS UN BOGUE DE SCRAPE. Cas vérifié sur la page du
 * bacc. en musique, bloc 01A : la règle dit « Obligatoire - 15 crédits. » et le
 * bloc ne liste que quatre cours de 3 crédits — 12, pas 15. Quatre
 * `<article class="cour-detailles">`, quatre liens, rien de caché : c'est la page
 * de l'UdeM qui est incohérente. D'où un `inattendu` détaillé plutôt qu'une
 * correction : corriger voudrait dire inventer un cinquième cours ou réécrire la
 * règle, et les deux seraient faux.
 */
function recouperCreditsObligatoires(
  programmes: Programme[],
  cours: Cours[],
  journal: Journal,
): void {
  const parCode = new Map(cours.map((c) => [c.code, c]));
  for (const p of programmes) {
    for (const bloc of p.blocs) {
      if (bloc.regle.type !== "obligatoire" || bloc.cours.length === 0) continue;
      // Un bloc dont une fiche manque ne prouve rien : la somme y serait fausse
      // pour une autre raison.
      if (bloc.cours.some((c) => !parCode.has(c))) continue;
      const somme = bloc.cours.reduce((s, c) => s + (parCode.get(c)?.credits ?? 0), 0);
      if (somme === bloc.regle.bornes.min) continue;
      journal.inattendu(
        `${p.id} bloc ${bloc.cle}`,
        `la règle « ${bloc.regleBrut} » annonce ${bloc.regle.bornes.min} crédits, mais les ` +
          `${bloc.cours.length} fiches du bloc en somment ${somme} ` +
          `(${bloc.cours.map((c) => `${c} ${parCode.get(c)?.credits}`).join(", ")}). ` +
          "Deux lectures indépendantes qui divergent : page de structure mal lue, fiches mal lues, " +
          "ou page de l'UdeM incohérente — rien n'est corrigé ici.",
      );
    }
  }
}

function programmeVide(
  slug: string,
  url: string,
  recupereISO: string,
  entete: { nom: string; cycle: string | null; faculte: string | null },
  typeProgramme: string | null,
): Programme {
  return {
    id: slug,
    nom: entete.nom,
    orientation: null,
    segments: [],
    orientations: [],
    cycle: entete.cycle,
    faculte: entete.faculte,
    typeProgramme,
    creditsTotal: null,
    exigences: null,
    blocs: [],
    notes: [],
    url,
    scrapeISO: recupereISO,
  };
}

async function principal(): Promise<void> {
  const options = lireArguments(process.argv.slice(2));
  const journal = new Journal();
  const debut = Date.now();

  const inventaire = await lireInventaire(journal);

  let slugs = inventaire.programmes;
  if (options.programmes) {
    const demandes = new Set(options.programmes);
    const connus = new Set(slugs);
    for (const d of demandes) {
      if (!connus.has(d)) {
        journal.inattendu(d, "slug demandé par --programmes mais absent du sitemap — traité quand même");
      }
    }
    slugs = [...demandes];
  }
  if (options.limite !== null) slugs = slugs.slice(0, options.limite);

  const ignores: string[] = [];
  if (options.reprendre) {
    const restants: string[] = [];
    for (const slug of slugs) {
      if (await existe(path.join(DOSSIER_PROGRAMMES, `${slug}.json`))) ignores.push(slug);
      else restants.push(slug);
    }
    slugs = restants;
  }

  // Seule une passe qui traite TOUS les programmes de l'inventaire a le droit
  // d'estampiller l'empreinte du code sur l'index. Une passe partielle — 30
  // programmes, ou une passe cours qui n'en traite aucun — laisserait
  // l'empreinte affirmer que les 1 089 fichiers sortent du code courant, alors
  // qu'elle n'en aurait régénéré qu'une poignée. Le test de fraîcheur se
  // tairait précisément dans le cas qu'il existe pour attraper.
  const regenereToutesLesStructures =
    inventaire.programmes.length > 0 && slugs.length === inventaire.programmes.length;

  console.log(
    `\nProgrammes à traiter : ${slugs.length}` +
      (ignores.length > 0 ? ` (${ignores.length} déjà sur disque, sautés par --reprendre)` : ""),
  );
  if (options.sansCours) {
    // La passe programmes mesure gratuitement ce que la passe cours coûtera.
    console.log(
      "Les codes cités seront accumulés et l'union imprimée en fin de passe : " +
        "c'est elle qui décide du budget de `--cours-cites`, au lieu de le supposer.",
    );
  }

  const fiches: FicheIndex[] = [];
  const programmes: Programme[] = [];
  const formesVues = new Map<string, string[]>();
  const codesCites = new Set<string>();
  /** Programmes et cours dont rien n'a pu être dit : à relancer. */
  const echecsReseau: string[] = [];
  let sansStructure = 0;

  for (const [i, slug] of slugs.entries()) {
    const url = `${RACINE}/programmes/${slug}/structure-du-programme/`;
    const page = await recuperer(url);

    let programme: Programme;
    let structureLue: boolean;

    if (page.html === null) {
      // Deux causes très différentes, qu'il ne faut pas confondre :
      //  - 404 : le programme existe (il est au sitemap) mais n'a pas de
      //    structure publiée. C'est une DONNÉE, `structureLue: false`.
      //  - panne de transport : on ne sait rien. Rien n'est mis en cache, donc
      //    une reprise réessaiera — mais la fiche écrite d'ici là serait
      //    trompeuse, d'où `erreur` et non `manque`.
      if (page.statut === STATUT_PANNE || page.statut === STATUT_HORS_LIGNE) {
        journal.erreur(
          slug,
          page.statut === STATUT_HORS_LIGNE
            ? "absent du cache et --hors-ligne : aucune requête faite, donc rien n'est affirmé sur ce programme"
            : `panne réseau après ${TENTATIVES_DEFAUT} tentatives (${page.panne ?? "?"}) — ` +
              "rien n'est affirmé sur ce programme, relancer avec --reprendre",
        );
        echecsReseau.push(slug);
        continue;
      }
      journal.manque(
        slug,
        `page de structure absente (HTTP ${page.statut}) — programme sans structure, structureLue = false`,
      );
      const entete = await entetteDepuisAccueil(slug, journal);
      programme = programmeVide(slug, url, page.recupereISO, entete, typeDuNom(entete.nom));
      structureLue = false;
    } else {
      const lu = parseStructure(page.html, slug, url, page.recupereISO);
      journal.absorber(lu.journal);
      programme = lu.programme;
      structureLue = lu.structureLue;
      for (const bloc of programme.blocs) {
        const forme = formeDeRegle(bloc.regleBrut);
        const liste = formesVues.get(forme) ?? [];
        liste.push(`${slug}:${bloc.cle}`);
        formesVues.set(forme, liste);
        for (const code of bloc.cours) codesCites.add(code);
      }
    }

    if (!structureLue) sansStructure += 1;
    await ecrireProgramme(programme);
    programmes.push(programme);
    const fichesDuProgramme = fichesDeProgramme(programme, structureLue);
    fiches.push(...fichesDuProgramme);

    const c = compteurs();
    const parcours =
      fichesDuProgramme.length > 1 ? `, ${fichesDuProgramme.length} parcours` : "";
    console.log(
      `[${i + 1}/${slugs.length}] ${slug} — ${structureLue ? `${programme.blocs.length} blocs, segments ${programme.segments.join("+") || "—"}` : "AUCUNE structure"}` +
        `, ${programme.creditsTotal ?? "?"} cr.${parcours}  (réseau ${c.reseau}, cache ${c.cache})`,
    );
  }

  // --- Fiches de cours -----------------------------------------------------
  const cours: Cours[] = [];
  const prealablesNonParses: { code: string; brut: string }[] = [];

  if (!options.sansCours) {
    const partiel = options.limite !== null || options.programmes !== null;
    // Trois jeux possibles, et le choix pèse des heures :
    //  - `--cours-cites` : l'union des codes cités par TOUS les fichiers de
    //    `data/programmes/` déjà écrits, plus ceux de cette passe. C'est la passe
    //    à faire après une passe `--sans-cours` : on ne demande que ce dont un
    //    programme a besoin, et rien du catalogue hors programme.
    //  - passe restreinte (`--limite` / `--programmes`) : les codes des
    //    programmes retenus. Sans ça, un échantillon de 30 programmes
    //    déclencherait les 11 888 fiches.
    //  - passe complète : l'inventaire entier du sitemap.
    let codes: string[];
    if (options.coursCites) {
      codes = [...(await codesDesProgrammesSurDisque(codesCites, journal, options.programmes))];
    } else if (options.tousLesCours || !partiel) {
      codes = inventaire.cours
        .map((s) => normaliserCode(s))
        .filter((c): c is string => c !== null);
      const illisibles = inventaire.cours.filter((s) => normaliserCode(s) === null);
      for (const s of illisibles) {
        journal.inattendu(s, "slug de cours du sitemap non normalisable en code — fiche non demandée");
      }
    } else {
      codes = [...codesCites];
    }
    // On ne demande jamais une fiche que le sitemap ne liste pas : c'est ce que
    // l'inventaire sert à éviter. Un bloc peut citer un cours sans fiche (cas
    // normal, pas une erreur) ; le journal le dit, le réseau n'est pas touché.
    const slugsCoursConnus = new Set(inventaire.cours);
    const aDemander: string[] = [];
    for (const code of codes) {
      if (slugsCoursConnus.has(slugUrl(code))) aDemander.push(code);
      else {
        journal.manque(
          code,
          "cité par un bloc mais absent du sitemap des cours — aucune fiche, aucune requête faite",
        );
      }
    }
    // REPRISE AU NIVEAU DES DONNÉES, et pas seulement du cache.
    //
    // `--limite-cours N` prend les N PREMIERS de `aDemander`. Sans ce filtre,
    // découper les ~8 600 fiches en tranches ne progresse jamais : la deuxième
    // tranche redemande exactement la première (servie par le cache, donc vite
    // et sans requête — mais on n'avance pas d'un cours). Le cache rend la
    // reprise gratuite en REQUÊTES ; seule cette lecture du disque la rend
    // gratuite en TRAVAIL.
    //
    // Le prix à connaître : sauter un code, c'est GELER le parse qui l'a
    // produit. Si `parsePrealables` est étendu plus tard, les fiches déjà sur
    // disque gardent l'ancienne lecture et `--reprendre` ne la corrigera
    // jamais. Le rattrapage est une passe SANS `--reprendre` et avec
    // `--hors-ligne` : tout est relu depuis le cache et reparsé, zéro requête.
    // (Vérifié le 2026-09-11 : parseur figé à c8d1bb1, 2026-09-11T03:35Z ; la
    // plus ancienne fiche sur disque date de 11:16Z — donc aucune fiche
    // actuelle ne traîne un parse périmé.)
    let dejaEnFiche = 0;
    let candidats = aDemander;
    if (options.reprendre && !options.rafraichir) {
      const surDisque = await codesSurDisque();
      candidats = aDemander.filter((c) => !surDisque.has(c));
      dejaEnFiche = aDemander.length - candidats.length;
    }

    const total = options.limiteCours === null ? candidats.length : Math.min(options.limiteCours, candidats.length);
    const retenus = candidats.slice(0, total);

    console.log(
      `\nFiches de cours à traiter : ${retenus.length}` +
        (dejaEnFiche > 0 ? ` (${dejaEnFiche} déjà en fiche, sautées par --reprendre)` : "") +
        (retenus.length < candidats.length ? ` — ${candidats.length - retenus.length} restantes après cette tranche` : ""),
    );
    for (const [i, code] of retenus.entries()) {
      const url = `${RACINE}/cours-et-horaires/cours/${slugUrl(code)}/`;
      const page = await recuperer(url);
      if (page.html === null) {
        if (page.statut === STATUT_PANNE || page.statut === STATUT_HORS_LIGNE) {
          journal.erreur(
            code,
            page.statut === STATUT_HORS_LIGNE
              ? "absente du cache et --hors-ligne : aucune requête faite, fiche non lue"
              : `panne réseau après ${TENTATIVES_DEFAUT} tentatives (${page.panne ?? "?"}) — ` +
                "fiche non lue, rien n'est mis en cache, une relance la reprendra",
          );
          echecsReseau.push(code);
        } else {
          journal.manque(code, `fiche inaccessible (HTTP ${page.statut}) sur ${url} — cours absent du catalogue`);
        }
        continue;
      }
      const fiche = parseFicheCours(page.html, url, page.recupereISO, parsePrealables);
      journal.absorber(fiche.journal);
      if (!fiche.cours) continue;
      if (fiche.cours.code !== code) {
        journal.inattendu(
          code,
          `la fiche demandée pour ${code} s'annonce comme ${fiche.cours.code} (redirection ?)`,
        );
      }
      cours.push(fiche.cours);
      if (fiche.prealablesComplet === false && fiche.cours.prealablesBrut !== null) {
        prealablesNonParses.push({ code: fiche.cours.code, brut: fiche.cours.prealablesBrut });
      }
      if ((i + 1) % 25 === 0 || i + 1 === retenus.length) {
        const c = compteurs();
        console.log(`  [${i + 1}/${retenus.length}] ${code}  (réseau ${c.reseau}, cache ${c.cache})`);
      }
    }
  }

  // --- Recoupement des deux sources indépendantes --------------------------
  // La règle d'un bloc obligatoire est lue sur la page de STRUCTURE ; les
  // crédits de chaque cours sont lus sur sa FICHE. Deux pages différentes, deux
  // lectures indépendantes : quand toutes les fiches d'un bloc obligatoire sont
  // là, leur somme doit égaler la règle. Un écart veut dire que l'une des deux
  // est mal lue — ou que la page de l'UdeM est incohérente, ce qui arrive.
  // Aucun test de module ne peut voir ça ; seul ce recoupement le peut.
  recouperCreditsObligatoires(programmes, cours, journal);

  // --- Écriture ------------------------------------------------------------
  const scrapeISO = new Date().toISOString();
  const ecrits = await ecrireCours(cours);
  for (const code of ecrits.sansSujet) {
    journal.erreur(code, "code non canonique : sujetDeCode() n'en tire aucun sujet, fiche non écrite");
  }
  const index = await ecrireIndex(
    fiches,
    scrapeISO,
    regenereToutesLesStructures ? empreinteExtracteur() : null,
  );
  for (const p of prealablesNonParses) {
    journal.info(p.code, `ligne de préalables non réduite par parsePrealables : ${JSON.stringify(p.brut)}`);
  }
  await ecrireJournal(journal.entrees);

  // --- Rapport -------------------------------------------------------------
  const c = compteurs();
  const secondes = Math.round((Date.now() - debut) / 1000);
  const rel = (p: string) => path.relative(RACINE_DEPOT, p).replace(/\\/g, "/");
  console.log(
    `\n=== Passe terminée en ${secondes} s ===\n` +
      `  requêtes réseau RÉELLES : ${c.reseau}   (lectures de cache : ${c.cache})\n` +
      `  programmes écrits       : ${fiches.length} (dont ${sansStructure} sans structure)\n` +
      `  ${rel(CHEMIN_INDEX)}    : ${index.total} fiches au total\n` +
      `  fiches de cours         : ${cours.length}, sujets touchés : ${ecrits.sujets.sort().join(" ") || "—"}\n` +
      `  préalables non réduits  : ${prealablesNonParses.length}\n` +
      `  ${rel(CHEMIN_JOURNAL)}           : ${journal.entrees.length} entrées ${JSON.stringify(journal.comptes())}`,
  );

  if (echecsReseau.length > 0) {
    // Rien n'a été mis en cache pour ceux-là : une relance les reprend.
    console.log(
      `\n${echecsReseau.length} objet(s) perdus par panne réseau, à relancer ` +
        `(rien n'a été affirmé sur eux) :\n  ${echecsReseau.join(", ")}`,
    );
  }

  // L'UNION EXACTE des codes cités, mesurée et non extrapolée.
  //
  // Elle sort gratuitement de la passe programmes — les 1 088 pages de structure
  // sont téléchargées de toute façon — et c'est elle qui décide si la passe
  // cours coûte les 11 888 fiches ou une fraction. Extrapoler depuis un
  // échantillon choisi à la main la sous-estimerait : les gros programmes de 1er
  // cycle partagent d'énormes troncs communs et saturent vite, alors que la
  // queue (microprogrammes, DESS, maîtrises spécialisées) apporte des codes de
  // niveau 6000-7000 qui n'apparaissent nulle part ailleurs.
  //
  // Les codes sont déjà normalisés par `parseCodesBloc` : sans ça l'union serait
  // gonflée par des doublons de forme (« ACT 1240 » contre « ACT1240 »).
  const partDuCatalogue =
    inventaire.cours.length > 0
      ? ` = ${((codesCites.size / inventaire.cours.length) * 100).toFixed(1)} % des ${inventaire.cours.length} du sitemap`
      : "";
  console.log(
    `\nUnion des codes cités par les ${fiches.length} parcours de cette passe : ` +
      `${codesCites.size} codes${partDuCatalogue}.\n` +
      `  Coût d'une passe \`--cours-cites\` sur cette union, à 1,45 s par fiche : ` +
      `${(((codesCites.size * 1.45) / 3600) * 1).toFixed(1)} h de réseau, hors délai.`,
  );

  if (formesVues.size > 0) {
    console.log("\nFormes de règle de bloc rencontrées :");
    for (const [forme, ou] of [...formesVues].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(ou.length).padStart(5)}x  ${forme.padEnd(26)} ex. ${ou.slice(0, 3).join(", ")}`);
    }
  }

  const parGenre = journal.comptes();
  if (parGenre.erreur > 0 || parGenre.inattendu > 0) {
    console.log("\nÀ inspecter (erreur / inattendu) :");
    for (const e of journal.entrees) {
      if (e.genre === "erreur" || e.genre === "inattendu") console.log(`  [${e.genre}] ${e.sujet} — ${e.message}`);
    }
  }
}

await principal();
