/**
 * Regénère `__fixtures__/` à partir du cache de scrape.
 *
 *   node --experimental-strip-types scripts/scrape/figer-fixtures.ts
 *
 * Les tests ne doivent JAMAIS toucher le réseau : ils lisent des extraits figés
 * de vraies pages. Cet outil produit ces extraits, chacun découpé VERBATIM dans
 * la page mise en cache, avec un entête de provenance (URL + date de
 * récupération). Rien n'est réécrit à la main : une fixture retouchée testerait
 * le HTML qu'on aurait aimé voir plutôt que celui que l'UdeM publie.
 *
 * La fixture de structure est un ASSEMBLAGE de morceaux verbatim (entête du
 * programme, description, puis chaque bloc réduit à son titre et à ses deux
 * premiers cours) : la page complète pèse 1,2 Mo et porte les sept
 * orientations. Le bloc 01A, lui, garde ses 7 cours, pour qu'un test puisse
 * vérifier un compte réel.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";

// Même raison que dans `index.ts` : le crochet doit être posé avant la
// résolution, donc l'import est dynamique.
register("./resolveur-ts.mjs", import.meta.url);
const { DOSSIER_CACHE } = await import("./reseau");

const DOSSIER_FIXTURES = path.join(import.meta.dirname, "__fixtures__");

const FICHES = [
  ["act-2250", "préalable « Préalable: A ET B », faculté, 2 trimestres"],
  ["ift-1015", "aucun div.cours-exigence (le cours n'a aucune exigence)"],
  ["mat-2717", "« Préalables : A et (B ou C) » — parenthèses, « ou » minuscule"],
  ["stt-2400", "« Préalable : A; Concomitant : B » sur une seule ligne"],
  ["act-3261", "« Préalable : A.; Concomitant : B. » — points collés au code"],
  ["act-4000", "préalable en prose (crédits + moyenne) et AUCUN trimestre publié"],
  ["dmo-1000", "étiquette inconnue « Restrictions d'inscription »"],
  ["stt-1682", "étiquette « Crédit » au singulier, 1.0 crédit"],
  ["stt-3510", "étiquette « Trimestre » au singulier"],
  ["stt-3795", "préalables séparés par des barres obliques"],
  ["ift-3245", "« A ET (B OU C OU D) » en majuscules"],
  ["mat-6117", "cycle « Cycles supérieurs », 4 crédits"],
] as const;

interface Entree {
  fichier: string;
  url: string;
  recupereISO: string;
  html: string;
}

async function lireCache(): Promise<Map<string, Entree>> {
  const parUrl = new Map<string, Entree>();
  for (const f of await readdir(DOSSIER_CACHE)) {
    if (!f.endsWith(".json")) continue;
    const meta = JSON.parse(await readFile(path.join(DOSSIER_CACHE, f), "utf8")) as {
      url: string;
      recupereISO: string;
    };
    parUrl.set(meta.url, {
      fichier: f,
      url: meta.url,
      recupereISO: meta.recupereISO,
      html: await readFile(path.join(DOSSIER_CACHE, f.replace(/\.json$/, ".html")), "utf8"),
    });
  }
  return parUrl;
}

function entete(url: string, recupereISO: string, quoi: string): string {
  return (
    `<!-- EXTRAIT VERBATIM — ne pas retoucher à la main.\n` +
    `     source : ${url}\n` +
    `     récupérée le : ${recupereISO}\n` +
    `     régénérer : node --experimental-strip-types scripts/scrape/figer-fixtures.ts\n` +
    `     intérêt : ${quoi} -->\n`
  );
}

/** Tranche contiguë de la page : de `debut` jusqu'à la fin de la section `fin`. */
function tranche(html: string, debut: string, ancreFin: string): string {
  const i = html.indexOf(debut);
  if (i < 0) throw new Error(`ancre de début absente : ${debut}`);
  const j = html.indexOf(ancreFin, i);
  if (j < 0) throw new Error(`ancre de fin absente : ${ancreFin}`);
  const k = html.indexOf("</section>", j);
  if (k < 0) throw new Error(`fermeture de section absente après : ${ancreFin}`);
  return html.slice(i, k + "</section>".length);
}

async function figerFiches(cache: Map<string, Entree>): Promise<void> {
  for (const [slug, quoi] of FICHES) {
    const url = `https://admission.umontreal.ca/cours-et-horaires/cours/${slug}/`;
    const entree = cache.get(url);
    if (!entree) throw new Error(`pas en cache : ${url} — lancer \`npm run scrape\` d'abord`);
    const extrait = tranche(entree.html, '<p class="cours-appartenance">', 'class="cours-sommaire"');
    await writeFile(
      path.join(DOSSIER_FIXTURES, `cours-${slug}.html`),
      entete(url, entree.recupereISO, quoi) + extrait + "\n",
      "utf8",
    );
    console.log(`cours-${slug}.html  ${extrait.length} octets`);
  }
}

const JETON_SEGMENT = '<div class="programme-segment">';
const JETON_BLOC = '<section class="bloc">';
const JETON_ARTICLE = '<article class="cour-detailles">';
/** Blocs dont on garde TOUS les cours (pour tester un compte réel). */
const BLOCS_COMPLETS = new Set(["01A"]);
/** Segments gardés dans la fixture : 01 (commun), 75 (Actuariat), 76 (Actuariat COOP,
 *  présent exprès pour qu'un test prouve qu'il est bien exclu). */
const SEGMENTS_GARDES = new Set(["01", "75", "76"]);

function reduireBloc(morceauBloc: string): string | null {
  const finTitre = morceauBloc.indexOf("</div>", morceauBloc.indexOf('class="bloc-titre"'));
  if (finTitre < 0) return null;
  const titre = morceauBloc.slice(0, finTitre + "</div>".length);
  const id = /Bloc\s+(\d{2}[A-Z]+)/.exec(titre)?.[1] ?? "";
  const articles = morceauBloc.split(JETON_ARTICLE).slice(1);
  const garde = BLOCS_COMPLETS.has(id) ? articles.length : 2;
  const retenus = articles
    .slice(0, garde)
    .map((a) => JETON_ARTICLE + a.slice(0, a.indexOf("</article>") + "</article>".length));
  return `${JETON_BLOC}\n${titre}\n<section class="cours row">\n${retenus.join("\n")}\n</section>\n</section>`;
}

async function figerStructure(cache: Map<string, Entree>): Promise<void> {
  const url =
    "https://admission.umontreal.ca/programmes/baccalaureat-en-mathematiques/structure-du-programme/";
  const entree = cache.get(url);
  if (!entree) throw new Error(`pas en cache : ${url}`);
  const html = entree.html;

  const morceaux: string[] = [];
  const nom = /<div class="programme-name">[\s\S]*?<\/div>/.exec(html);
  if (!nom) throw new Error("div.programme-name absent");
  morceaux.push(nom[0]);
  const desc = /<div class="presentation-content clamped structure-description">[\s\S]*?<\/div>/.exec(
    html,
  );
  if (!desc) throw new Error("div.structure-description absent");
  morceaux.push(desc[0]);

  for (const morceauSegment of html.split(JETON_SEGMENT).slice(1)) {
    const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(morceauSegment);
    if (!h3) continue;
    const numero = /Segment\s+(\d+)/.exec(h3[1].replace(/\s+/g, " "))?.[1] ?? "";
    if (!SEGMENTS_GARDES.has(numero)) continue;
    const blocs = morceauSegment
      .split(JETON_BLOC)
      .slice(1)
      .map(reduireBloc)
      .filter((b): b is string => b !== null);
    morceaux.push(`${JETON_SEGMENT}\n${h3[0]}\n${blocs.join("\n")}\n</div>`);
  }

  const sortie =
    entete(
      url,
      entree.recupereISO,
      "blocs, règles de crédits et codes de cours ; segments 01 + 75 (Actuariat) + 76 " +
        "(Actuariat COOP, pour tester l'exclusion). Chaque bloc est réduit à ses 2 premiers " +
        "cours, sauf 01A qui garde les 7 pour vérifier un compte réel.",
    ) + morceaux.join("\n\n") + "\n";
  await writeFile(path.join(DOSSIER_FIXTURES, "structure-bacc-mathematiques.html"), sortie, "utf8");
  console.log(`structure-bacc-mathematiques.html  ${sortie.length} octets`);
}

await mkdir(DOSSIER_FIXTURES, { recursive: true });
const cache = await lireCache();
await figerStructure(cache);
await figerFiches(cache);
