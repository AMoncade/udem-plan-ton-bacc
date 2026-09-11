/**
 * `npm run scrape` — produit `data/catalogue.json`.
 *
 * Enchaînement : page de structure -> blocs et codes -> une fiche par code ->
 * `Catalogue`. Le réseau passe toujours par `reseau.ts` (cache + délai).
 *
 * Usage :
 *   npm run scrape
 *   npm run scrape -- --programme baccalaureat-en-mathematiques --orientation Actuariat --id bac-mathematiques-actuariat
 *   npm run scrape -- --orientation "Mathématiques pures et appliquées" --id bac-mathematiques-pures
 *   npm run scrape -- --sortie data/autre.json
 *
 * `--orientation ""` garde TOUS les segments de la page (les sept orientations).
 *
 * Ce module est chargé par `index.ts` APRÈS l'installation du résolveur
 * d'imports sans extension (voir `index.ts` et `resolveur-ts.mjs`) : c'est ce
 * qui permet d'importer `lib/engine/prealables` sans toucher à un fichier qui
 * appartient à la session moteur.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Catalogue, Cours } from "../../lib/types";
import { slugUrl } from "../../lib/codes";
import { ErreurHttp, recuperer } from "./reseau";
import { parseStructure, type CibleProgramme } from "./structure";
import { parseFicheCours } from "./cours";
import { Journal, type Probleme } from "./journal";
import { parsePrealables } from "../../lib/engine/prealables";

const RACINE = "https://admission.umontreal.ca";
const DEPOT = path.resolve(import.meta.dirname, "..", "..");

function lireArguments(argv: string[]): { cible: CibleProgramme; sortie: string } {
  const lus = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    lus.set(argv[i].slice(2), argv[i + 1] ?? "");
    i += 1;
  }
  const programme = lus.get("programme") ?? "baccalaureat-en-mathematiques";
  const orientationBrute = lus.get("orientation") ?? "Actuariat";
  return {
    cible: {
      // L'id est un identifiant INTERNE au projet, pas une donnée UdeM : il est
      // choisi, pas scrapé. Celui de l'actuariat doit rester celui de la fixture
      // de l'intégratrice, sinon l'UI ne retrouve plus le programme.
      id: lus.get("id") ?? "bac-mathematiques-actuariat",
      url: `${RACINE}/programmes/${programme}/structure-du-programme/`,
      orientation: orientationBrute === "" ? null : orientationBrute,
    },
    sortie: lus.get("sortie") ?? path.join("data", "catalogue.json"),
  };
}

function imprimerJournal(entrees: Probleme[]): void {
  if (entrees.length === 0) {
    console.log("\nJournal : aucun problème.");
    return;
  }
  console.log(`\nJournal — ${entrees.length} entrée(s) :`);
  for (const e of entrees) console.log(`  [${e.gravite}] ${e.ou} — ${e.quoi}`);
}

/** Relevé des formes distinctes de `prealablesBrut`, pour la session moteur. */
function imprimerReleve(cours: Cours[]): void {
  const formes = new Map<string, string[]>();
  for (const c of cours) {
    if (c.prealablesBrut === null) continue;
    const liste = formes.get(c.prealablesBrut) ?? [];
    liste.push(c.code);
    formes.set(c.prealablesBrut, liste);
  }
  console.log(`\nRelevé : ${formes.size} forme(s) distincte(s) de prealablesBrut`);
  for (const [brut, codes] of [...formes].sort()) {
    console.log(`  ${JSON.stringify(brut)}  <- ${codes.join(", ")}`);
  }
  const concomitants = cours.filter((c) => c.concomitantsBrut !== null);
  console.log(`\nRelevé : ${concomitants.length} fiche(s) avec concomitants`);
  for (const c of concomitants) {
    console.log(`  ${c.code}  ${JSON.stringify(c.concomitantsBrut)}`);
  }
}

async function principal(): Promise<void> {
  const { cible, sortie } = lireArguments(process.argv.slice(2));
  const journal = new Journal();

  console.log(`Structure : ${cible.url}`);
  const pageStructure = await recuperer(cible.url);
  console.log(
    `  ${pageStructure.depuisCache ? "cache" : "réseau"}, récupérée le ${pageStructure.recupereISO}`,
  );
  const resultat = parseStructure(pageStructure.html, cible, pageStructure.recupereISO);
  const programme = resultat.programme;
  journal.entrees.push(...resultat.journal.entrees);

  console.log(
    `  ${programme.nom} / ${programme.orientation ?? "toutes orientations"} — ` +
      `${programme.creditsTotal} crédits, ${programme.blocs.length} blocs`,
  );
  for (const b of programme.blocs) {
    console.log(`    ${b.id} [${b.segment}] ${b.regleBrut} — ${b.cours.length} cours`);
  }

  const codes = [...new Set(programme.blocs.flatMap((b) => b.cours))];
  console.log(`\nFiches de cours : ${codes.length} codes référencés`);

  const cours: Record<string, Cours> = {};
  const prealablesNonParses: { code: string; brut: string }[] = [];
  for (const code of codes) {
    const url = `${RACINE}/cours-et-horaires/cours/${slugUrl(code)}/`;
    let html: string;
    let recupereISO: string;
    try {
      const page = await recuperer(url);
      html = page.html;
      recupereISO = page.recupereISO;
    } catch (erreur) {
      // Un bloc peut citer un cours dont la fiche n'existe pas : cas normal,
      // le cours est ABSENT du catalogue et l'incident est journalisé.
      journal.manque(
        code,
        erreur instanceof ErreurHttp
          ? `fiche inaccessible (HTTP ${erreur.statut}) sur ${url} — cours absent du catalogue`
          : `fiche inaccessible (${String(erreur)}) sur ${url} — cours absent du catalogue`,
      );
      continue;
    }
    const fiche = parseFicheCours(html, url, recupereISO, parsePrealables);
    journal.entrees.push(...fiche.journal.entrees);
    if (!fiche.cours) continue;
    cours[fiche.cours.code] = fiche.cours;
    if (fiche.cours.code !== code) {
      journal.inattendu(
        code,
        `la fiche demandée pour ${code} s'annonce comme ${fiche.cours.code} (redirection ?)`,
      );
    }
    if (fiche.prealablesComplet === false && fiche.cours.prealablesBrut !== null) {
      prealablesNonParses.push({ code: fiche.cours.code, brut: fiche.cours.prealablesBrut });
    }
  }

  const catalogue: Catalogue = {
    programmes: [programme],
    cours,
    prealablesNonParses,
    scrapeISO: new Date().toISOString(),
  };

  // Clés en plus (le journal n'a pas de champ dans `Catalogue`, qui est gelé) :
  // un objet avec des clés supplémentaires reste assignable à `Catalogue`, et la
  // fixture de l'intégratrice pose déjà le précédent avec `_avertissement`.
  const aEcrire = {
    _avertissement:
      "Fichier GÉNÉRÉ par `npm run scrape`. Ne pas éditer à la main. " +
      "`_journal` liste tout ce que la page n'a pas livré ou que le code n'a pas su réduire : " +
      "un champ vide sans entrée de journal serait un bogue.",
    ...catalogue,
    _journal: journal.entrees,
  };

  const chemin = path.resolve(DEPOT, sortie);
  await mkdir(path.dirname(chemin), { recursive: true });
  await writeFile(chemin, `${JSON.stringify(aEcrire, null, 2)}\n`, "utf8");

  console.log(
    `\nÉcrit ${path.relative(DEPOT, chemin)} : ${catalogue.programmes.length} programme, ` +
      `${programme.blocs.length} blocs, ${Object.keys(cours).length}/${codes.length} fiches, ` +
      `${prealablesNonParses.length} ligne(s) de préalables non parsée(s)`,
  );
  if (prealablesNonParses.length > 0) {
    console.log("\nPréalables non parsés (pour la session moteur) :");
    for (const p of prealablesNonParses) console.log(`  ${p.code}  ${JSON.stringify(p.brut)}`);
  }
  imprimerReleve(Object.values(cours));
  imprimerJournal(journal.entrees);
}

await principal();
