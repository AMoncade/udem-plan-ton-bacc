/**
 * Récupération HTTP polie, avec cache sur disque — et REPRENABLE.
 *
 * Le scrape complet, c'est 1 088 pages de structure plus jusqu'à 11 888 fiches
 * de cours. À 1,2 s par requête, trois à quatre heures. Il sera donc interrompu,
 * et la seule chose qui compte est que le relancer ne redemande rien de ce qui
 * est déjà sur le disque.
 *
 * Trois décisions qui découlent de ça :
 *
 * 1. **Le cache ne périme pas par défaut.** La v1 le donnait pour frais sept
 *    jours ; au-delà, une reprise aurait retéléchargé. `--max-age-jours N` le
 *    rétablit quand on veut vraiment rafraîchir, `--rafraichir` ignore le cache.
 * 2. **Les absences sont mises en cache aussi.** Un 404 vaut une information :
 *    « cette page n'existe pas ». Sans cache négatif, chaque reprise redemande
 *    les mêmes pages manquantes — le scrape se paie deux fois ses échecs.
 * 3. **Un compteur de requêtes RÉELLES.** Dire « 1 088 programmes traités » ne
 *    dit pas si on a touché le serveur 0 ou 1 088 fois. Le rapport doit pouvoir
 *    citer les deux.
 *
 * `robots.txt` d'admission.umontreal.ca n'interdit que
 * `/fileadmin/fichiers/premium/` (revérifié le 2026-09-11, contenu intégral :
 * `User-agent: *` / `Disallow: /fileadmin/fichiers/premium/`). `/programmes/`,
 * `/cours-et-horaires/` et `/sitemap.xml` sont donc permis — ce qui n'autorise
 * pas à marteler un serveur universitaire, d'où le délai.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DOSSIER_CACHE = path.join(import.meta.dirname, ".cache");

/** Délai par défaut entre deux requêtes réseau effectives, en millisecondes. */
export const DELAI_DEFAUT_MS = 1200;

const AGENT =
  "udem-plan-ton-bacc/0.2 (projet etudiant, scrape poli avec cache; contact: adrien@moncade.com)";

/** Tentatives par URL avant d'abandonner une panne de transport. */
export const TENTATIVES_DEFAUT = 4;

export interface OptionsReseau {
  /** Millisecondes entre deux requêtes réseau. */
  delaiMs: number;
  /** 0 = le cache ne périme jamais (défaut, pour que la reprise ne refasse rien). */
  maxAgeJours: number;
  /** true = ignorer le cache en lecture et tout redemander. */
  rafraichir: boolean;
  /** Nombre d'essais sur une panne de transport, avec attente croissante. */
  tentatives: number;
  /** true = ne toucher le réseau sous AUCUN prétexte ; une page absente du
   *  cache est signalée comme telle. Sert à valider sans frapper le serveur,
   *  notamment quand une autre session y travaille. */
  horsLigne: boolean;
}

export const OPTIONS_DEFAUT: OptionsReseau = {
  delaiMs: DELAI_DEFAUT_MS,
  maxAgeJours: 0,
  rafraichir: false,
  tentatives: TENTATIVES_DEFAUT,
  horsLigne: false,
};

let options: OptionsReseau = { ...OPTIONS_DEFAUT };
let requetesReseau = 0;
let lecturesCache = 0;
let dernierFetch = 0;

export function configurerReseau(partielles: Partial<OptionsReseau>): void {
  options = { ...options, ...partielles };
}

export function compteurs(): { reseau: number; cache: number } {
  return { reseau: requetesReseau, cache: lecturesCache };
}

export function reinitialiserCompteurs(): void {
  requetesReseau = 0;
  lecturesCache = 0;
}

/** Statut conventionnel d'une panne de TRANSPORT (DNS, coupure, TLS) : ce n'est
 *  pas une réponse du serveur, donc pas « la page n'existe pas ». Jamais mise en
 *  cache : la prochaine passe réessaiera. */
export const STATUT_PANNE = 0;

/** Statut conventionnel d'une page absente du cache en mode `--hors-ligne` : on
 *  n'a RIEN demandé, donc on ne sait rien. À ne pas confondre avec un 404. */
export const STATUT_HORS_LIGNE = -1;

export interface PageRecuperee {
  url: string;
  /** null quand la page n'existe pas (statut non-2xx) : voir `statut`. */
  html: string | null;
  statut: number;
  /** Date de récupération RÉELLE (ISO 8601), pas la date de relecture du cache.
   *  Utiliser `new Date()` à la relecture ferait passer une page de la semaine
   *  dernière pour une page du jour, et `scrapeISO` mentirait. */
  recupereISO: string;
  depuisCache: boolean;
  /** Renseigné seulement quand `statut === STATUT_PANNE` : la dernière erreur
   *  de transport, pour que le journal dise POURQUOI on n'a rien eu. */
  panne?: string;
}

interface Sidecar {
  url: string;
  recupereISO: string;
  statut: number;
}

async function attendreTour(): Promise<void> {
  const ecoule = Date.now() - dernierFetch;
  if (dernierFetch !== 0 && ecoule < options.delaiMs) {
    await new Promise((r) => setTimeout(r, options.delaiMs - ecoule));
  }
  dernierFetch = Date.now();
}

/** Nom de fichier lisible ET unique pour une URL (la requête est dans le hachage). */
export function cleCache(url: string): string {
  const u = new URL(url);
  const lisible =
    `${u.pathname}${u.search}`
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80) || "racine";
  const empreinte = createHash("sha1").update(url).digest("hex").slice(0, 8);
  return `${lisible}.${empreinte}`;
}

async function lireCache(cle: string): Promise<PageRecuperee | null> {
  if (options.rafraichir) return null;
  let sidecar: Sidecar;
  try {
    sidecar = JSON.parse(await readFile(path.join(DOSSIER_CACHE, `${cle}.json`), "utf8")) as Sidecar;
  } catch {
    return null;
  }
  if (options.maxAgeJours > 0) {
    const age = Date.now() - Date.parse(sidecar.recupereISO);
    if (!Number.isFinite(age) || age > options.maxAgeJours * 24 * 60 * 60 * 1000) return null;
  }
  let html: string | null = null;
  if (sidecar.statut >= 200 && sidecar.statut < 300) {
    try {
      html = await readFile(path.join(DOSSIER_CACHE, `${cle}.html`), "utf8");
    } catch {
      // Sidecar sans corps : entrée de cache tronquée par une interruption en
      // plein écriture. On refait la requête plutôt que de rendre un vide.
      return null;
    }
  }
  lecturesCache += 1;
  return {
    url: sidecar.url,
    html,
    statut: sidecar.statut,
    recupereISO: sidecar.recupereISO,
    depuisCache: true,
  };
}

async function ecrireCache(cle: string, sidecar: Sidecar, html: string | null): Promise<void> {
  await mkdir(DOSSIER_CACHE, { recursive: true });
  // Le corps AVANT le sidecar : si l'écriture est coupée entre les deux, le
  // sidecar manque et la reprise refait la requête. Dans l'ordre inverse, un
  // sidecar orphelin ferait croire à une page vide récupérée avec succès.
  if (html !== null) await writeFile(path.join(DOSSIER_CACHE, `${cle}.html`), html, "utf8");
  await writeFile(
    path.join(DOSSIER_CACHE, `${cle}.json`),
    `${JSON.stringify(sidecar, null, 2)}\n`,
    "utf8",
  );
}

/**
 * Récupère une page. RIEN NE LÈVE.
 *
 * Deux raisons, et la seconde a été apprise à la dure. Un statut non-2xx n'est
 * pas une exception : « cette page n'existe pas » est une donnée courante ici
 * (un programme sans page de structure, un code cité par un bloc sans fiche).
 * Et une panne de transport n'en est pas une non plus : un `TypeError: fetch
 * failed` passager a tué une passe entière à la 101e fiche sur 1 328. Sur 13 000
 * requêtes, une coupure est certaine — la faire planter le scrape, c'est
 * garantir qu'il n'ira jamais au bout. Donc : on réessaie avec une attente
 * croissante, puis on rend `statut: STATUT_PANNE` sans rien mettre en cache, et
 * l'appelant journalise et continue.
 */
export async function recuperer(url: string): Promise<PageRecuperee> {
  const cle = cleCache(url);
  const enCache = await lireCache(cle);
  if (enCache) return enCache;

  if (options.horsLigne) {
    return {
      url,
      html: null,
      statut: STATUT_HORS_LIGNE,
      recupereISO: new Date().toISOString(),
      depuisCache: false,
    };
  }

  let derniere: unknown = null;
  for (let essai = 1; essai <= Math.max(1, options.tentatives); essai += 1) {
    await attendreTour();
    requetesReseau += 1;
    try {
      const reponse = await fetch(url, {
        headers: { "User-Agent": AGENT, Accept: "text/html,application/xml" },
        redirect: "follow",
      });
      const recupereISO = new Date().toISOString();
      const html = reponse.ok ? await reponse.text() : null;
      await ecrireCache(cle, { url, recupereISO, statut: reponse.status }, html);
      return { url, html, statut: reponse.status, recupereISO, depuisCache: false };
    } catch (cause) {
      derniere = cause;
      // Attente croissante : 2 s, 4 s, 8 s. Une coupure passagère se répare
      // toute seule ; marteler pendant qu'elle dure n'aide personne.
      if (essai < options.tentatives) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** (essai - 1)));
      }
    }
  }
  return {
    url,
    html: null,
    statut: STATUT_PANNE,
    recupereISO: new Date().toISOString(),
    depuisCache: false,
    panne: String(derniere),
  };
}

/**
 * Retire une URL du cache.
 *
 * Sert quand la réponse est syntaxiquement valide mais N'EST PAS celle qu'on a
 * demandée — le cas vérifié de `/sitemap.xml` qui sert parfois un sous-sitemap à
 * la place de son index. La garder en cache figerait l'erreur pour sept jours.
 */
export async function oublierCache(url: string): Promise<void> {
  const cle = cleCache(url);
  for (const suffixe of [".json", ".html"]) {
    try {
      await rm(path.join(DOSSIER_CACHE, `${cle}${suffixe}`));
    } catch {
      // absent : rien à oublier
    }
  }
}

/** Vrai si l'URL est déjà sur le disque (sert à chiffrer une progression). */
export async function dejaEnCache(url: string): Promise<boolean> {
  const avant = lecturesCache;
  const lu = await lireCache(cleCache(url));
  lecturesCache = avant;
  return lu !== null;
}
