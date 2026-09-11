/**
 * Récupération HTTP polie, avec cache sur disque.
 *
 * Règles (voir CLAUDE.md) : un fichier HTML par URL sous `scripts/scrape/.cache/`
 * (ignoré par git), un délai entre deux requêtes réseau, et AUCUN re-fetch si
 * l'entrée de cache est fraîche. `robots.txt` d'admission.umontreal.ca
 * n'interdit que `/fileadmin/fichiers/premium/` (revérifié le 2026-09-10), donc
 * `/programmes/` et `/cours-et-horaires/` sont permis — ce qui n'autorise pas à
 * marteler un serveur universitaire.
 *
 * Chaque entrée de cache porte un sidecar JSON avec la date de récupération
 * RÉELLE. C'est elle qui alimente `scrapeISO` : une page servie depuis le cache
 * date du jour où elle a été récupérée, pas du jour où on la relit. Utiliser
 * `new Date()` à la relecture ferait passer une donnée de la semaine dernière
 * pour une donnée du jour.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DOSSIER_CACHE = path.join(import.meta.dirname, ".cache");

/** Durée de fraîcheur du cache. Au-delà, on refetch. */
const FRAICHEUR_MS = 7 * 24 * 60 * 60 * 1000;

/** Délai minimal entre deux requêtes réseau effectives. */
const DELAI_MS = 1200;

const AGENT =
  "udem-plan-ton-bacc/0.1 (projet etudiant, scrape poli avec cache; contact: adrien@moncade.com)";

export interface PageRecuperee {
  url: string;
  html: string;
  /** Date de récupération réelle (ISO 8601), depuis le cache ou du réseau. */
  recupereISO: string;
  /** true si la page vient du cache disque, sans requête réseau. */
  depuisCache: boolean;
}

interface Sidecar {
  url: string;
  recupereISO: string;
  statut: number;
}

let dernierFetch = 0;

async function attendreTour(): Promise<void> {
  const ecoule = Date.now() - dernierFetch;
  if (dernierFetch !== 0 && ecoule < DELAI_MS) {
    await new Promise((r) => setTimeout(r, DELAI_MS - ecoule));
  }
  dernierFetch = Date.now();
}

/** Nom de fichier lisible ET unique pour une URL. */
export function cleCache(url: string): string {
  const u = new URL(url);
  const lisible =
    u.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80) || "racine";
  const empreinte = createHash("sha1").update(url).digest("hex").slice(0, 8);
  return `${lisible}.${empreinte}`;
}

async function lireCache(cle: string): Promise<PageRecuperee | null> {
  try {
    const [html, brutSidecar] = await Promise.all([
      readFile(path.join(DOSSIER_CACHE, `${cle}.html`), "utf8"),
      readFile(path.join(DOSSIER_CACHE, `${cle}.json`), "utf8"),
    ]);
    const sidecar = JSON.parse(brutSidecar) as Sidecar;
    const age = Date.now() - Date.parse(sidecar.recupereISO);
    if (!Number.isFinite(age) || age > FRAICHEUR_MS) return null;
    return { url: sidecar.url, html, recupereISO: sidecar.recupereISO, depuisCache: true };
  } catch {
    return null;
  }
}

export class ErreurHttp extends Error {
  url: string;
  statut: number;
  constructor(url: string, statut: number) {
    super(`HTTP ${statut} sur ${url}`);
    this.url = url;
    this.statut = statut;
  }
}

/**
 * Récupère une page : cache frais -> disque, sinon réseau (avec délai) puis
 * écriture du cache. Lève `ErreurHttp` sur un statut non-2xx — l'appelant
 * consigne le problème, il n'invente pas de contenu.
 */
export async function recuperer(url: string): Promise<PageRecuperee> {
  const cle = cleCache(url);
  const enCache = await lireCache(cle);
  if (enCache) return enCache;

  await attendreTour();
  const reponse = await fetch(url, {
    headers: { "User-Agent": AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (!reponse.ok) throw new ErreurHttp(url, reponse.status);
  const html = await reponse.text();
  const recupereISO = new Date().toISOString();

  await mkdir(DOSSIER_CACHE, { recursive: true });
  const sidecar: Sidecar = { url, recupereISO, statut: reponse.status };
  await writeFile(path.join(DOSSIER_CACHE, `${cle}.html`), html, "utf8");
  await writeFile(
    path.join(DOSSIER_CACHE, `${cle}.json`),
    `${JSON.stringify(sidecar, null, 2)}\n`,
    "utf8",
  );
  return { url, html, recupereISO, depuisCache: false };
}
