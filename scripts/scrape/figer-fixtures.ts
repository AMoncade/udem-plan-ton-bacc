/**
 * Regénère `__fixtures__/` à partir du cache de scrape.
 *
 *   node --experimental-strip-types scripts/scrape/figer-fixtures.ts
 *
 * Les tests ne touchent JAMAIS le réseau : ils lisent des extraits figés de
 * vraies pages. Cet outil produit ces extraits, chacun découpé VERBATIM dans la
 * page mise en cache, avec un entête de provenance (URL + date de récupération).
 * Rien n'est réécrit à la main : une fixture retouchée testerait le HTML qu'on
 * aurait aimé voir plutôt que celui que l'UdeM publie.
 *
 * Les fixtures de structure sont des ASSEMBLAGES de morceaux verbatim (entête du
 * programme, description, puis chaque bloc réduit à ses deux premiers cours) :
 * la page du bacc. en mathématiques pèse 1,2 Mo. Les blocs listés dans
 * `BLOCS_COMPLETS` gardent tous leurs cours, pour qu'un test puisse vérifier un
 * compte réel.
 *
 * Chaque entrée de `STRUCTURES` existe pour un piège précis, nommé dans son
 * commentaire — pas pour « avoir un autre exemple ».
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import path from "node:path";

// Même raison que dans `index.ts` : le crochet doit être posé avant la
// résolution, donc l'import est dynamique.
register("./resolveur-ts.mjs", import.meta.url);
const { DOSSIER_CACHE } = await import("./reseau");

const DOSSIER_FIXTURES = path.join(import.meta.dirname, "__fixtures__");
const RACINE = "https://admission.umontreal.ca";

const FICHES: readonly (readonly [string, string])[] = [
  ["act-2250", "préalable « Préalable: A ET B », faculté, 2 trimestres"],
  ["ift-1015", "aucun div.cours-exigence (le cours n'a aucune exigence)"],
  ["mat-2717", "« Préalables : A et (B ou C) » — parenthèses, « ou » minuscule"],
  ["stt-2400", "« Préalable : A; Concomitant : B » sur une seule ligne"],
  ["act-3261", "« Préalable : A.; Concomitant : B. » — points collés au code"],
  ["act-4000", "préalable en prose (crédits + moyenne) et AUCUN trimestre publié"],
  ["dmo-1000", "« Restrictions d'inscription » SEULE : va dans restrictionsBrut, pas dans les préalables"],
  ["stt-1682", "étiquette « Crédit » au singulier, 1.0 crédit"],
  ["stt-3510", "étiquette « Trimestre » au singulier"],
  ["stt-3795", "préalables séparés par des barres obliques"],
  ["ift-3245", "« A ET (B OU C OU D) » en majuscules"],
  ["mat-6117", "cycle « Cycles supérieurs », 4 crédits"],
  ["mui-1162a", "code SUFFIXÉ, et fiche qui n'a QUE des restrictions d'inscription"],
  ["psy-40001", "code à CINQ chiffres"],
  ["drt-1151g", "code suffixé à la faculté de droit"],
] as const;

interface CibleStructure {
  slug: string;
  /** Segments gardés dans la fixture. `null` = tous. */
  segments: string[] | null;
  /** Blocs dont on garde TOUS les cours, par id lu (« 01A », « MM-73A »). */
  blocsComplets?: string[];
  quoi: string;
}

const STRUCTURES: readonly CibleStructure[] = [
  {
    slug: "baccalaureat-en-mathematiques",
    segments: ["01", "75", "76"],
    blocsComplets: ["01A"],
    quoi:
      "segments 01 (commun) + 75 (Actuariat) + 76 (Actuariat COOP). Sept phrases de " +
      "répartition par type dans la description, dont deux SANS crédits au choix " +
      "(les COOP) et deux qui écrivent « 27 à option » sans le mot « crédits ». " +
      "Bloc 01A complet (7 cours) pour vérifier un compte réel.",
  },
  {
    slug: "maitrise-en-mathematiques",
    segments: ["73"],
    quoi:
      "« MM-Bloc 73A » ET « S-Bloc 73A » dans LE MÊME segment 73 : `Bloc.id` n'est " +
      "pas unique et le segment ne se déduit pas de l'id. Plus « Option - minimum 15 " +
      "crédits, maximum 24 crédits. » en minuscules, et la prose de segment qui porte " +
      "les totaux par type (deux cheminements).",
  },
  {
    slug: "maitrise-en-informatique",
    segments: ["70"],
    quoi:
      "« Bloc MM-70A » : le préfixe de cheminement est APRÈS le mot « Bloc », alors " +
      "que la maîtrise en mathématiques le met AVANT. Une seule des deux orthographes " +
      "supportée, c'est neuf blocs perdus en silence.",
  },
  {
    slug: "mineure-arts-et-sciences",
    segments: null,
    quoi:
      "« Segment Z Cours au choix » : identifiant de segment NON NUMÉRIQUE. Avec " +
      "`Segment\\s+(\\d+)`, ce programme perdait son unique segment et passait pour " +
      "un programme sans structure.",
  },
  {
    slug: "acces-fac",
    segments: null,
    quoi:
      "« Option - Minimum 3 crédits, Maximum 15 crédits. » — « Maximum » capital AU " +
      "MILIEU de la phrase, dixième orthographe. Et « Le Programme d'accès comporte " +
      "un maximum de 24 crédits. » : le total n'est pas écrit « comporte N crédits ».",
  },
  {
    slug: "baccalaureat-en-psychologie-campus-montreal",
    segments: ["71"],
    quoi:
      "la phrase de répartition est COUPÉE AU MILIEU entre deux <p> : « …de 39 à 42 " +
      "crédits</p><p>à option et 3 à 6 crédits au choix. ». Lue paragraphe par " +
      "paragraphe, elle donnait obligatoire: null, option: null et un brut tronqué.",
  },
  {
    slug: "stage-postdoctoral-en-informatique",
    segments: null,
    quoi:
      "page de structure qui répond 200 et ne contient AUCUN div.programme-segment. " +
      "C'est le cas dangereux : aucun statut HTTP ne le signale. structureLue = false.",
  },
];

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
      statut: number;
    };
    if (meta.statut < 200 || meta.statut >= 300) continue;
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
    const url = `${RACINE}/cours-et-horaires/cours/${slug}/`;
    const entree = cache.get(url);
    if (!entree) {
      console.log(`  IGNORÉ cours-${slug}.html — pas en cache (lancer \`npm run scrape\` d'abord)`);
      continue;
    }
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

/** Id de bloc lu dans le titre, dans les deux orthographes de préfixe. */
function idDuTitre(titre: string): string {
  const plat = titre.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const m = /(?:([A-Za-z]{1,4})-)?Bloc\s+(?:([A-Za-z]{1,4})-)?(\d{2,3}[A-Z]*)/.exec(plat);
  if (!m) return "";
  const prefixe = m[1] ?? m[2];
  return prefixe ? `${prefixe}-${m[3]}` : m[3];
}

function reduireBloc(morceauBloc: string, blocsComplets: Set<string>): string | null {
  const finTitre = morceauBloc.indexOf("</div>", morceauBloc.indexOf('class="bloc-titre"'));
  if (finTitre < 0) return null;
  const titre = morceauBloc.slice(0, finTitre + "</div>".length);
  const id = idDuTitre(titre);
  // `div.bloc-notes` porte la prose normative du bloc : elle est conservée,
  // parce que c'est précisément ce que `Bloc.notes` doit récupérer.
  const notes = /<div class="bloc-notes">[\s\S]*?<\/div>/.exec(morceauBloc)?.[0] ?? "";
  const articles = morceauBloc.split(JETON_ARTICLE).slice(1);
  const garde = blocsComplets.has(id) ? articles.length : 2;
  const retenus = articles
    .slice(0, garde)
    .map((a) => JETON_ARTICLE + a.slice(0, a.indexOf("</article>") + "</article>".length));
  return (
    `${JETON_BLOC}\n${titre}\n${notes}\n<section class="cours row">\n` +
    `${retenus.join("\n")}\n</section>\n</section>`
  );
}

/** Morceau d'entête : premier élément `<balise class="…classe…">…</balise>`. */
function element(html: string, balise: string, classe: string): string | null {
  const re = new RegExp(
    `<${balise}\\b[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>[\\s\\S]*?</${balise}>`,
    "i",
  );
  return re.exec(html)?.[0] ?? null;
}

async function figerStructure(cache: Map<string, Entree>, cible: CibleStructure): Promise<void> {
  const url = `${RACINE}/programmes/${cible.slug}/structure-du-programme/`;
  const entree = cache.get(url);
  if (!entree) {
    console.log(`  IGNORÉ structure-${cible.slug}.html — pas en cache`);
    return;
  }
  const html = entree.html;
  const blocsComplets = new Set(cible.blocsComplets ?? []);

  const morceaux: string[] = [];
  // L'entête porte faculté, nom et cycle, tous trois lus par parseStructure.
  for (const [balise, classe] of [
    ["p", "faculte"],
    ["div", "programme-name"],
    ["span", "cycle"],
    ["div", "structure-description"],
  ] as const) {
    const el = element(html, balise, classe);
    if (el === null) {
      console.log(`  ${cible.slug} : ${balise}.${classe} absent de la page (conservé tel quel : absent)`);
      continue;
    }
    morceaux.push(el);
  }

  for (const morceauSegment of html.split(JETON_SEGMENT).slice(1)) {
    const avantBlocs = morceauSegment.split(JETON_BLOC)[0];
    const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(avantBlocs);
    if (!h3) continue;
    const numero = /Segment\s+(\d{1,3}|[A-Z]\d{0,2})/.exec(h3[1].replace(/\s+/g, " "))?.[1] ?? "";
    if (cible.segments !== null && !cible.segments.includes(numero)) continue;
    // On garde `section.description-segment` en entier : le <h3> ET la prose,
    // qui est là où vivent les totaux par type de la maîtrise.
    const desc = element(avantBlocs, "section", "description-segment") ?? h3[0];
    const blocs = morceauSegment
      .split(JETON_BLOC)
      .slice(1)
      .map((b) => reduireBloc(b, blocsComplets))
      .filter((b): b is string => b !== null);
    morceaux.push(`${JETON_SEGMENT}\n${desc}\n${blocs.join("\n")}\n</div>`);
  }

  const sortie = entete(url, entree.recupereISO, cible.quoi) + morceaux.join("\n\n") + "\n";
  const nom = `structure-${cible.slug}.html`;
  await writeFile(path.join(DOSSIER_FIXTURES, nom), sortie, "utf8");
  console.log(`${nom}  ${sortie.length} octets`);
}

await mkdir(DOSSIER_FIXTURES, { recursive: true });
const cache = await lireCache();
console.log(`${cache.size} pages en cache\n`);
for (const cible of STRUCTURES) await figerStructure(cache, cible);
await figerFiches(cache);
