/**
 * Applique les résultats d'une passe d'horaires FICHE PAR FICHE, et seulement
 * les champs d'horaire, sur le `data/cours` courant.
 *
 *   node --experimental-strip-types scripts/scrape/appliquer-horaires.ts <cours-de-la-passe> <data/cours>
 *
 * POURQUOI PAS UN `cp`. Chaque tranche du workflow dépose des fichiers de sujet
 * ENTIERS, calculés sur le checkout de SON début. Le job final les applique des
 * heures plus tard, sur un checkout plus récent. Copier le fichier entier
 * écraserait tout ce qui a changé entre-temps dans ce sujet : une passe complète
 * fusionnée, un préalable corrigé à la main. Le `git pull --rebase` ne le
 * verrait pas, puisque l'écrasement est déjà dans le commit.
 *
 * Seuls `trimestres`, `apercuHoraires` et `horairesISO` sont repris, et
 * seulement pour une fiche qui existe des deux côtés. Une fiche absente du
 * courant n'est pas créée : c'est la règle de la passe hebdomadaire.
 *
 * Écrit au format de `disposition.ts` (JSON indenté de 2, saut de ligne final),
 * pour qu'un sujet sans changement ne produise aucun diff.
 *
 * Ce fichier ne dépend d'aucun module relatif (les imports de types sont
 * effacés) : il s'exécute tel quel avec `--experimental-strip-types`.
 */
import type { Cours } from "../../lib/types";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Fichier = Record<string, Cours>;

const CHAMPS = ["trimestres", "apercuHoraires", "horairesISO"] as const;

export interface Bilan {
  fichesMisesAJour: number;
  /** Fiches de la passe absentes du courant : ignorées. */
  absentes: string[];
}

/**
 * Reporte les champs d'horaire de `passe` dans `courant`. Pure : rend un NOUVEL
 * objet, `courant` n'est pas modifié. L'ordre des clés du courant est gardé.
 */
export function appliquerSujet(courant: Fichier, passe: Fichier): { fichier: Fichier; bilan: Bilan } {
  const fichier: Fichier = {};
  const bilan: Bilan = { fichesMisesAJour: 0, absentes: [] };
  for (const [code, fiche] of Object.entries(courant)) {
    const lue = passe[code];
    if (code.startsWith("_") || lue === undefined) {
      fichier[code] = fiche;
      continue;
    }
    const suivante: Cours = { ...fiche };
    let change = false;
    for (const champ of CHAMPS) {
      const avant = JSON.stringify(fiche[champ]);
      const apres = JSON.stringify(lue[champ]);
      if (avant === apres) continue;
      change = true;
      if (lue[champ] === undefined) delete (suivante as Partial<Cours>)[champ];
      else (suivante as unknown as Record<string, unknown>)[champ] = lue[champ];
    }
    fichier[code] = suivante;
    if (change) bilan.fichesMisesAJour += 1;
  }
  for (const code of Object.keys(passe)) {
    if (!code.startsWith("_") && courant[code] === undefined) bilan.absentes.push(code);
  }
  return { fichier, bilan };
}

function principal(argv: string[]): number {
  if (argv.length !== 2) {
    console.error("usage : appliquer-horaires.ts <cours-de-la-passe> <data/cours>");
    return 2;
  }
  const [dossierPasse, dossierCourant] = argv;
  if (!existsSync(dossierPasse)) {
    console.log("Aucun fichier à appliquer.");
    return 0;
  }
  let total = 0;
  for (const f of readdirSync(dossierPasse).filter((n) => n.endsWith(".json")).sort()) {
    const cheminCourant = path.join(dossierCourant, f);
    if (!existsSync(cheminCourant)) {
      console.warn(`${f} : absent du data/cours courant, ignoré (la passe ne crée pas de sujet).`);
      continue;
    }
    const courant = JSON.parse(readFileSync(cheminCourant, "utf8")) as Fichier;
    const passe = JSON.parse(readFileSync(path.join(dossierPasse, f), "utf8")) as Fichier;
    const { fichier, bilan } = appliquerSujet(courant, passe);
    if (bilan.fichesMisesAJour > 0) writeFileSync(cheminCourant, `${JSON.stringify(fichier, null, 2)}\n`, "utf8");
    total += bilan.fichesMisesAJour;
    const absentes = bilan.absentes.length > 0 ? `, ${bilan.absentes.length} fiche(s) absente(s) du courant ignorée(s)` : "";
    console.log(`${f} : ${bilan.fichesMisesAJour} fiche(s) mise(s) à jour${absentes}`);
  }
  console.log(`Total : ${total} fiche(s) mise(s) à jour.`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = principal(process.argv.slice(2));
}
