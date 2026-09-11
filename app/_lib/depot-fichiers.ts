/**
 * LE DÉPÔT RÉEL — les fichiers découpés de `data/`, lus un par un.
 *
 * ## Pourquoi `fetch` et pas un `import()`
 *
 * Le chargement doit marcher SANS SERVEUR : l'app visée est une application de
 * bureau Electron, et l'export statique de Next doit rester possible. Trois
 * mécanismes étaient candidats :
 *
 *  - une route d'API (`app/api/...`) : exclue, elle exige un serveur et
 *    interdit l'export statique ;
 *  - un `import()` dynamique de JSON : le bundler construit alors un module de
 *    contexte sur `data/programmes/*.json` AU MOMENT DE LA COMPILATION. Or ces
 *    fichiers n'existent pas encore (la session scraper les produit), et un
 *    contexte sur un dossier absent fait échouer la compilation — y compris
 *    quand la bascule de `app/_donnees/source.ts` pointe sur le dépôt de
 *    démonstration et que ce fichier-ci n'est jamais appelé ;
 *  - `fetch` d'un fichier statique : rien n'est résolu à la compilation, donc
 *    ce fichier compile aujourd'hui, sans les données. C'est ce qui est retenu.
 *
 * ## Ce que le déploiement doit fournir
 *
 * `fetch` lit une URL, pas un chemin de disque. Les fichiers de `data/` doivent
 * donc être SERVIS sous `BASE` :
 *
 *  - en `next dev` et en export statique : les copier (ou les lier) sous
 *    `public/donnees/`, ce qui les publie à `/donnees/...`. Le dossier `data/`
 *    n'appartient pas à cette session ; c'est une étape d'empaquetage à
 *    convenir avec qui possède `scripts/`.
 *  - dans Electron : enregistrer un schéma applicatif (`protocol.handle`) qui
 *    sert la racine empaquetée. C'est le motif habituel d'Electron, et il est
 *    nécessaire de toute façon : Chromium refuse `fetch` sur `file://`, donc
 *    une fenêtre ouverte sur un `file://` ne peut lire AUCUN fichier, quel que
 *    soit le mécanisme. Un schéma applicatif fait marcher les chemins absolus
 *    ci-dessous sans rien changer ici.
 *
 * Rien de tout ça n'a pu être éprouvé contre de vraies données : elles
 * n'existent pas à ce commit. Ce qui est éprouvé, c'est l'assemblage
 * (`depot.ts`), qui est commun aux deux dépôts.
 */
import type { Cours, IndexProgrammes, Programme } from "../../lib/types";
import type { Depot } from "./depot";

/**
 * Racine des données servies. Absolue exprès : une base relative se résoudrait
 * contre la page courante, donc `donnees/x.json` deviendrait
 * `/audit/donnees/x.json` sur l'onglet Audit et `/donnees/x.json` sur l'accueil
 * — le même dépôt répondrait différemment selon l'onglet, et seulement une fois
 * sur deux.
 */
let base = "/donnees";

/** Pour qu'un hôte (Electron, un sous-chemin de déploiement) fixe la racine
 *  sans que ce fichier ait à la connaître. */
export function definirBase(nouvelle: string): void {
  base = nouvelle.replace(/\/+$/, "");
}

async function lireJson(chemin: string): Promise<unknown> {
  const url = `${base}/${chemin}`;
  let reponse: Response;
  try {
    reponse = await fetch(url, { cache: "force-cache" });
  } catch (cause) {
    // Un échec réseau sur un fichier local veut presque toujours dire que la
    // fenêtre est ouverte en `file://` : le dire, plutôt que « failed to fetch ».
    throw new Error(
      `lecture impossible de ${url} : ${String(cause)}. Les fichiers de données doivent être SERVIS (voir l'en-tête de depot-fichiers.ts) ; « file:// » ne suffit pas.`,
      { cause },
    );
  }
  if (!reponse.ok) {
    throw new Error(`${url} a répondu ${reponse.status} ${reponse.statusText}.`);
  }
  return (await reponse.json()) as unknown;
}

/** Les fiches d'un fichier de sujet. Le contrat gelé décrit `Cours`, pas
 *  l'enveloppe du fichier : on accepte donc les trois formes raisonnables, et
 *  on REJETTE le reste au lieu de rendre une liste vide qui passerait pour
 *  « ce sujet n'a pas de cours ». */
function extraireCours(valeur: unknown, sujet: string): Cours[] {
  if (Array.isArray(valeur)) return valeur as Cours[];
  if (typeof valeur === "object" && valeur !== null) {
    const objet = valeur as Record<string, unknown>;
    if (Array.isArray(objet.cours)) return objet.cours as Cours[];
    const valeurs = Object.values(objet);
    if (valeurs.every((v) => typeof v === "object" && v !== null && "code" in v)) {
      return valeurs as Cours[];
    }
  }
  throw new Error(
    `data/cours/${sujet}.json n'a pas une forme reconnue : attendu un tableau de Cours, un objet { cours: [...] }, ou une table code -> Cours.`,
  );
}

export function creerDepotFichiers(): Depot {
  let index: IndexProgrammes | null = null;

  return {
    origine: `data/ (découpé, servi sous ${base})`,
    estFactice: false,

    async chargerIndex(): Promise<IndexProgrammes> {
      if (index === null) {
        index = (await lireJson("index-programmes.json")) as IndexProgrammes;
      }
      return index;
    },

    async chargerProgramme(id: string): Promise<Programme> {
      return (await lireJson(`programmes/${id}.json`)) as Programme;
    },

    async chargerSujet(sujet: string): Promise<Cours[]> {
      // `IndexProgrammes.sujets` existe pour ça : il dit quels sujets sont
      // présents dans `data/cours/`. Un sujet qui n'y figure pas est
      // légitimement absent (scrape incrémental) et rend une liste vide ; un
      // sujet qui y figure et dont le fichier manque est une panne, et elle
      // remonte. Sans cette distinction, un déploiement à moitié copié
      // afficherait simplement un catalogue sans titres.
      const connus = index?.sujets;
      if (connus !== undefined && !connus.includes(sujet)) return [];
      return extraireCours(await lireJson(`cours/${sujet}.json`), sujet);
    },
  };
}
