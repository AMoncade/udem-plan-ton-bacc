/**
 * Empreinte du CODE qui produit `data/` — l'unique implémentation.
 *
 * Elle vit ici, et `scripts/scrape/` l'IMPORTE. Une formule recopiée des deux
 * côtés d'une couture finit toujours par se désaccorder, et ce garde-fou est
 * précisément celui qu'on ne peut pas se permettre de voir mentir : son travail
 * est de dire « les données sont plus vieilles que le code », le jour où
 * personne ne s'en doute.
 *
 * POURQUOI ELLE EXISTE. Le 2026-09-11, l'extracteur a appris à distinguer deux
 * blocs homonymes et le scrape n'a pas été relancé. La suite est devenue rouge
 * sur « clé de bloc en double 70/70A », un message qui accuse la page amont et
 * l'extracteur — tous deux justes. Il a fallu re-télécharger la page et rejouer
 * l'extracteur dessus pour voir que seules les DONNÉES étaient en retard.
 * `IndexProgrammes.scrapeISO` ne pouvait pas le dire : il date la passe, pas le
 * code qui l'a faite.
 *
 * CE QU'ELLE HACHE, et pourquoi la liste est explicite. Première version : les
 * seuls `scripts/scrape/*.ts`. Le chantier scraper a montré qu'elle était alors
 * AVEUGLE au changement de `cleBloc` — c'est-à-dire au changement même pour
 * lequel on l'avait écrite, puisque l'extraction importe `lib/codes.ts`,
 * `lib/parcours.ts` et `lib/engine/prealables.ts`. La liste est donc nommée
 * fichier par fichier, et un fichier manquant lève : une empreinte qui hache
 * silencieusement moins que prévu est pire qu'aucune empreinte.
 *
 * Limite assumée : c'est un hachage de CONTENU, donc une correction de
 * commentaire dans un de ces fichiers déplace l'empreinte et réclame une passe.
 * Le faux positif coûte un scrape ; le faux négatif a coûté une matinée.
 *
 * QUAND CETTE EMPREINTE NE PEUT PAS ÊTRE VÉRIFIÉE. Elle hache le contenu des
 * fichiers PRÉSENTS sur le disque. Dans un checkout partagé par plusieurs
 * sessions, quelqu'un est presque toujours en train d'éditer l'un d'eux : trois
 * mesures à une minute d'intervalle ont donné trois valeurs, et un fichier NON
 * SUIVI par git (, en cours d'écriture) suffit à
 * la déplacer alors qu'aucune ligne importée n'a changé.
 *
 * La fonction n'est pas en cause — deux appels au même instant concordent. Mais
 * la comparaison « empreinte des données contre empreinte du code » n'a de sens
 * que sur un arbre au repos : juste après une passe, personne n'éditant les
 * sources. Un rouge mesuré pendant que le dossier bouge ne dit rien.
 *
 * Ce module lit le disque : il est réservé aux outils Node (scraper, tests) et
 * ne doit pas être importé par `app/` ni `components/`.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Racine du dépôt, déduite de l'emplacement de ce fichier (`lib/`). */
const RACINE = join(import.meta.dirname, "..");

/** Modules hors `scripts/scrape/` dont l'extraction dépend, chemins relatifs. */
const DEPENDANCES = [
  "lib/codes.ts",
  "lib/parcours.ts",
  "lib/types.ts",
  "lib/engine/prealables.ts",
];

export function empreinteExtracteur(): string {
  const dirScrape = join(RACINE, "scripts", "scrape");
  const sources = readdirSync(dirScrape)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort()
    .map((f) => ({ nom: `scripts/scrape/${f}`, chemin: join(dirScrape, f) }));
  for (const rel of DEPENDANCES) {
    sources.push({ nom: rel, chemin: join(RACINE, ...rel.split("/")) });
  }

  const h = createHash("sha256");
  for (const { nom, chemin } of sources) {
    let contenu: string;
    try {
      contenu = readFileSync(chemin, "utf8");
    } catch {
      throw new Error(
        `empreinteExtracteur : ${nom} est introuvable. La liste des sources est ` +
          `explicite exprès — si ce fichier a été renommé ou déplacé, mettre la ` +
          `liste à jour dans lib/empreinte.ts. Hacher moins de fichiers que prévu ` +
          `rendrait l'empreinte aveugle sans rien signaler.`,
      );
    }
    // Fins de ligne normalisées : sinon l'empreinte dépend du `core.autocrlf`
    // de la machine plutôt que du code.
    h.update(nom);
    h.update(contenu.replace(/\r\n/g, "\n"));
  }
  return h.digest("hex");
}
