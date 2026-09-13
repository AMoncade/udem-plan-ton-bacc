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
import { execFileSync } from "node:child_process";
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

/** Les fichiers hachés, chemins relatifs au dépôt, dans l'ordre du hachage. */
function sourcesHachees(): string[] {
  const dirScrape = join(RACINE, "scripts", "scrape");
  const scrape = readdirSync(dirScrape)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort()
    .map((f) => `scripts/scrape/${f}`);
  return [...scrape, ...DEPENDANCES];
}

export function empreinteExtracteur(): string {
  const sources = sourcesHachees().map((rel) => ({
    nom: rel,
    chemin: join(RACINE, ...rel.split("/")),
  }));

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

/**
 * L'empreinte de CHAQUE source, au lieu d'une somme unique.
 *
 * Pourquoi. `empreinteExtracteur()` dit QUE quelque chose a bougé, jamais QUOI.
 * Or les deux moitiés de l'ensemble haché n'appellent pas la même réaction :
 *
 *  - un fichier de `scripts/scrape/` a changé → les données SONT périmées,
 *    il faut relancer une passe ;
 *  - un fichier de contrat (`lib/`) a changé → elles le sont PEUT-ÊTRE. Un
 *    champ ajouté sans toucher à l'émission ne périme rien. Le commit qui a
 *    posé `TYPES_PROGRAMME` n'a pas changé une seule valeur écrite, et
 *    l'empreinte a quand même rougi.
 *
 * Avec un seul nombre, les deux rendent le même rouge et le même message, donc
 * on apprend à le lire comme du bruit — la panne qu'on a payée trois fois
 * ailleurs, un instrument juste qu'on cesse d'écouter.
 *
 * PAR FICHIER plutôt qu'en deux sommes séparées, pour deux raisons. La
 * partition « extracteur / contrat » devrait être maintenue à chaque fichier
 * qui rejoint l'ensemble, et quelqu'un finirait par en classer un du mauvais
 * côté ; ici la catégorie se lit dans le chemin. Et la symétrie oubliée : une
 * retouche de COMMENTAIRE dans `scripts/scrape/` périme aussi, exactement comme
 * dans `lib/` — deux sommes n'auraient donc pas séparé « vrai » de « faux
 * positif », seulement deux pools qui en contiennent chacun.
 */
export function empreintesParSource(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of sourcesHachees()) {
    const h = createHash("sha256");
    h.update(readFileSync(join(RACINE, ...rel.split("/")), "utf8").replace(/\r\n/g, "\n"));
    out[rel] = h.digest("hex");
  }
  return out;
}

/**
 * Les sources hachées qui ne sont PAS propres au sens de git — modifiées, ou
 * neuves et non suivies.
 *
 * Sert à nommer la TROISIÈME cause d'une empreinte qui diverge, celle que le
 * message d'erreur accusait à tort : ni un scrape en retard, ni un changement
 * de formule, mais **une source modifiée depuis la dernière passe, souvent par
 * une autre session en train de travailler**. Dans un checkout partagé par
 * quatre sessions ce n'est pas un cas rare, c'est l'état normal la moitié du
 * temps : c'est `scripts/scrape/contraintes.ts`, neuf et non suivi, qui a
 * déplacé l'empreinte alors qu'aucune ligne importée n'avait changé.
 *
 * Rend une liste VIDE quand git est absent ou muet — on ne peut alors rien
 * affirmer, et le message reste sur ses deux premières causes plutôt que
 * d'inventer la troisième.
 */
export function sourcesModifiees(): string[] {
  try {
    const sortie = execFileSync(
      "git",
      ["status", "--porcelain", "--", ...sourcesHachees()],
      { cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return sortie
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "")
      .map((l) => l.replace(/^\S+\s+/, ""));
  } catch {
    return [];
  }
}
