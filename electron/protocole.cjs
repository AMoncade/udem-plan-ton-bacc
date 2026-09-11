/**
 * Le protocole `udem://` — pourquoi l'app ne charge pas ses fichiers en `file://`.
 *
 * Un export Next référence ses bundles en chemins ABSOLUS (`/_next/static/...`).
 * Sous `file://`, `/_next/...` se résout depuis la racine du disque (`C:\_next\`)
 * et tout casse. Le réflexe est de poser `assetPrefix: "./"` pour obtenir des
 * chemins relatifs ; ça règle le symptôme et laisse trois pannes en place :
 *
 *   1. `fetch()` est refusé sur une origine `file://` (Chromium la traite comme
 *      opaque). Or la disposition sur disque décrite dans `lib/types.ts` charge
 *      `data/cours/<SUJET>.json` À LA DEMANDE — donc par `fetch`. En `file://`
 *      cette architecture ne démarre pas, quels que soient les chemins.
 *   2. `localStorage` n'est pas durable sur une origine opaque. Le plan de
 *      l'étudiant y vit (CLAUDE.md) : il serait perdu à chaque lancement.
 *   3. La navigation client de l'App Router pousse des URL absolues dans
 *      l'historique ; un rechargement sur `/audit` repartirait de la racine.
 *
 * Un schéma personnalisé déclaré `standard` + `secure` donne une vraie origine :
 * les chemins absolus se résolvent, `fetch` et `localStorage` fonctionnent comme
 * sur un serveur, et rien n'est servi que ce que l'on monte explicitement.
 *
 * Deux montages sous la même origine, donc same-origin et aucun CORS :
 *   /              -> `out/`   (l'export Next)
 *   /donnees/...   -> `data/`  (le catalogue découpé, des milliers de petits JSON)
 *
 * `/donnees` n'est pas un nom choisi ici : c'est le CONTRAT d'URL de l'UI,
 * fixé par `app/_lib/depot-fichiers.ts` (`let base = "/donnees"`). Côté web,
 * `scripts/copier-donnees.mjs` copie `data/` vers `public/donnees/` avant le
 * build ; côté bureau, c'est ce montage qui répond. Des deux côtés l'UI
 * demande `/donnees/...` sans savoir qui sert. Servir autre chose donnerait
 * une app qui s'ouvre et reste vide.
 */
const { protocol } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const SCHEMA = "udem";
/** Hôte fixe : une origine stable, sinon `localStorage` change de clé. */
const HOTE = "app";
const ORIGINE = `${SCHEMA}://${HOTE}`;

/**
 * Le chemin sous lequel l'UI demande ses fichiers de donnees. Fixe par
 * `app/_lib/depot-fichiers.ts` ; ce n'est pas un reglage local.
 */
const MONTAGE_DONNEES = "/donnees";

/**
 * À déclarer AVANT `app.whenReady()`, sinon le schéma reste « non standard » :
 * pas d'origine, donc ni `fetch`, ni `localStorage`, ni résolution des chemins
 * absolus — exactement les pannes que ce protocole existe pour éviter.
 */
function declarerSchema() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEMA,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);
}

const TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".map": "application/json; charset=utf-8",
  }),
);

function typeDe(fichier) {
  return TYPES.get(path.extname(fichier).toLowerCase()) ?? "application/octet-stream";
}

/**
 * Résout un chemin d'URL sous une racine, ou `null` s'il en sort.
 *
 * La vérification n'est pas décorative : `decodeURIComponent` rend les `..`
 * encodés (`%2e%2e`), et sans confinement une URL fabriquée lirait n'importe
 * quel fichier de la machine avec les droits de l'utilisateur. On compare des
 * chemins DÉJÀ résolus — comparer les chaînes brutes laisse passer `..`.
 */
function resoudreSous(racine, cheminUrl) {
  let relatif;
  try {
    relatif = decodeURIComponent(cheminUrl);
  } catch {
    return null; // séquence % invalide : refus, pas de repli silencieux
  }
  if (relatif.includes("\0")) return null;

  const racineAbs = path.resolve(racine);
  const cible = path.resolve(racineAbs, "." + path.posix.normalize("/" + relatif));
  if (cible !== racineAbs && !cible.startsWith(racineAbs + path.sep)) return null;
  return cible;
}

async function lireFichier(cible) {
  try {
    const infos = await fs.stat(cible);
    if (!infos.isFile()) return null;
    return await fs.readFile(cible);
  } catch {
    return null;
  }
}

/**
 * Les formes qu'un export Next donne à une route.
 *
 * Sans `trailingSlash`, `/audit` est écrit `out/audit.html` ; avec, c'est
 * `out/audit/index.html`. On essaie les deux plutôt que d'épingler un réglage :
 * si une autre session active `trailingSlash`, l'app continue de s'ouvrir.
 */
function candidats(cheminUrl) {
  const propre = cheminUrl.replace(/\/+$/, "");
  if (propre === "") return ["/index.html"];
  if (path.extname(propre) !== "") return [propre, ...variantesSegment(propre)];
  return [propre + ".html", propre + "/index.html"];
}

/**
 * Le décalage des préchargements de segment de l'App Router.
 *
 * MESURÉ, pas supposé : la page demande
 * `/audit/__next.audit.__PAGE__.txt` (un POINT avant `__PAGE__`) alors que
 * `next build` a écrit `out/audit/__next.audit/__PAGE__.txt` (un SLASH). Sans
 * cette variante, chaque page 404 sur son préchargement. La navigation au clic
 * survit — Next retombe sur un chargement complet du segment — donc le défaut
 * est invisible à l'usage, ce qui est précisément pourquoi il faut le traiter
 * plutôt que de s'appuyer sur le repli.
 *
 * La variante n'est essayée qu'APRÈS le chemin littéral : `__next._tree.txt`
 * et `__next.__PAGE__.txt` existent bel et bien comme fichiers et sont servis
 * tels quels. Si ni l'un ni l'autre n'existe, on 404 franchement.
 */
function variantesSegment(chemin) {
  if (!chemin.endsWith(".txt")) return [];
  const sansExt = chemin.slice(0, -".txt".length);
  const dernierPoint = sansExt.lastIndexOf(".");
  const dernierSlash = sansExt.lastIndexOf("/");
  if (dernierPoint <= dernierSlash + 1) return [];
  return [`${sansExt.slice(0, dernierPoint)}/${sansExt.slice(dernierPoint + 1)}.txt`];
}

function reponse(contenu, cible) {
  const entetes = { "content-type": typeDe(cible) };
  // Une CSP servie avec la page, en plus des réglages de la fenêtre : l'app
  // n'a aucune raison d'atteindre le réseau, et `next/font` auto-héberge ses
  // polices dans `_next/static/media`, donc `'self'` suffit.
  if (entetes["content-type"].startsWith("text/html")) {
    entetes["content-security-policy"] =
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
      "object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  }
  return new Response(new Uint8Array(contenu), { status: 200, headers: entetes });
}

/**
 * @param {{ racineWeb: string, racineDonnees: string, journaliser?: (m: string) => void }} opts
 */
function installerProtocole({ racineWeb, racineDonnees, journaliser = () => {} }) {
  protocol.handle(SCHEMA, async (requete) => {
    const url = new URL(requete.url);

    if (url.host !== HOTE) {
      journaliser(`hote refuse : ${url.host}`);
      return new Response("hote inconnu", { status: 404 });
    }

    // Le catalogue découpé. Servi d'abord depuis `data/`, la source canonique
    // du CONTRAT, puis depuis `out/donnees/` — là où `copier-donnees.mjs`
    // dépose sa copie quand c'est `npm run build` qui a construit l'export.
    // Ordre volontaire : la source canonique gagne, la copie n'est qu'un
    // filet. L'empaquetage exclut `out/donnees/` pour ne pas embarquer deux
    // fois les mêmes 12 Mo (voir `electron/builder.yml`).
    if (url.pathname === MONTAGE_DONNEES || url.pathname.startsWith(`${MONTAGE_DONNEES}/`)) {
      const relatif = url.pathname.slice(MONTAGE_DONNEES.length) || "/";
      for (const racine of [racineDonnees, path.join(racineWeb, "donnees")]) {
        const cible = resoudreSous(racine, relatif);
        if (cible === null) continue;
        const contenu = await lireFichier(cible);
        if (contenu !== null) return reponse(contenu, cible);
      }
      journaliser(`donnee absente : ${url.pathname}`);
      return new Response(`donnee absente : ${url.pathname}`, {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    for (const candidat of candidats(url.pathname)) {
      const cible = resoudreSous(racineWeb, candidat);
      if (cible === null) continue;
      const contenu = await lireFichier(cible);
      if (contenu !== null) return reponse(contenu, cible);
    }

    // 404 franc. Servir `index.html` à la place ferait apparaître l'app
    // « fonctionnelle » sur une route inexistante — le repli muet que ce
    // projet combat partout ailleurs.
    journaliser(`route absente : ${url.pathname}`);
    return new Response(`introuvable : ${url.pathname}`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  });
}

module.exports = {
  MONTAGE_DONNEES,
  variantesSegment,
  SCHEMA,
  HOTE,
  ORIGINE,
  declarerSchema,
  installerProtocole,
  resoudreSous,
  candidats,
};
