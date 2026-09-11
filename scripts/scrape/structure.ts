/**
 * Lecture de la page « Structure du programme ».
 *
 * Gabarit observé le 2026-09-11 (revérifié, voir `__fixtures__/`) :
 *
 *   <div class="programme-segment">
 *     <h3 id="segment-1">Segment 75 Propre à l'orientation Actuariat</h3>
 *     <section class="bloc">
 *       <div class="bloc-titre">
 *         <h4><span>Bloc 75C Compléments d'actuariat</span></h4>
 *         <small>Option - Minimum 12 crédits, maximum 27 crédits.</small>
 *       </div>
 *       ... <a class="stretched-link" href="/cours-et-horaires/cours/act-2000/">ACT 2000</a> ...
 *
 * Attention : la page porte les SEPT orientations du baccalauréat (59 blocs).
 * L'orientation Actuariat, ce sont les segments « communs » plus le segment
 * « Propre à l'orientation Actuariat » — et « Actuariat » ne doit pas attraper
 * « Actuariat COOP », d'où la comparaison exacte du nom d'orientation.
 */
import type { Bloc, Programme, RegleBloc } from "../../lib/types";
import { normaliserCode, segmentDeBloc } from "../../lib/codes";
import { contenu, decouperSur, texteLigne } from "./html";
import { Journal } from "./journal";

const JETON_SEGMENT = '<div class="programme-segment">';
const JETON_BLOC = '<section class="bloc">';
const MARQUEUR_ORIENTATION = "Propre à l'orientation ";

export interface RegleLue {
  regle: RegleBloc;
  /** Note à journaliser quand la forme lue demande une interprétation. */
  note: string | null;
}

function nombre(brut: string): number {
  return Number.parseFloat(brut.replace(",", "."));
}

/**
 * Règle de crédits d'un bloc, telle qu'écrite dans le `<small>`.
 *
 * Formes RÉELLEMENT observées sur la page du bacc en mathématiques
 * (59 blocs, 2026-09-11), avec leur nombre d'occurrences :
 *   23x « Option - Minimum N crédits, maximum N crédits. »
 *   17x « Obligatoire - N crédits. »
 *   13x « Option - Maximum N crédits. »
 *    5x « Choix - N crédits. »
 *    1x « Option - N crédits. »            <- bloc 82B, forme AMBIGUË
 *
 * « Option - Minimum N crédits. » (sans maximum) n'a PAS été observée ; la
 * branche existe par symétrie et reste signalée si elle sort un jour.
 */
export function parseRegleBloc(brut: string): RegleLue | null {
  const t = brut.trim().replace(/\.$/, "").trim();
  const cr = String.raw`cr[ée]dits?`;

  let m = new RegExp(`^Obligatoire\\s*[-–]\\s*([\\d.,]+)\\s*${cr}$`, "i").exec(t);
  if (m) return { regle: { type: "obligatoire", credits: nombre(m[1]) }, note: null };

  m = new RegExp(`^Choix\\s*[-–]\\s*([\\d.,]+)\\s*${cr}$`, "i").exec(t);
  if (m) return { regle: { type: "choix", credits: nombre(m[1]) }, note: null };

  m = new RegExp(
    `^Option\\s*[-–]\\s*Minimum\\s*([\\d.,]+)\\s*${cr}\\s*,\\s*maximum\\s*([\\d.,]+)\\s*${cr}$`,
    "i",
  ).exec(t);
  if (m) return { regle: { type: "option", min: nombre(m[1]), max: nombre(m[2]) }, note: null };

  m = new RegExp(`^Option\\s*[-–]\\s*Maximum\\s*([\\d.,]+)\\s*${cr}$`, "i").exec(t);
  if (m) return { regle: { type: "option", min: null, max: nombre(m[1]) }, note: null };

  m = new RegExp(`^Option\\s*[-–]\\s*Minimum\\s*([\\d.,]+)\\s*${cr}$`, "i").exec(t);
  if (m) {
    return {
      regle: { type: "option", min: nombre(m[1]), max: null },
      note: `forme « Option - Minimum N crédits » (sans maximum) jamais observée avant : « ${brut.trim()} »`,
    };
  }

  m = new RegExp(`^Option\\s*[-–]\\s*([\\d.,]+)\\s*${cr}$`, "i").exec(t);
  if (m) {
    const n = nombre(m[1]);
    return {
      regle: { type: "option", min: n, max: n },
      note:
        `forme ambiguë « ${brut.trim()} » : ni minimum ni maximum n'est écrit. ` +
        `Interprétée min = max = ${n}. À confirmer par l'intégratrice avant de s'y fier.`,
    };
  }

  return null;
}

/** Titre de bloc : « Bloc 75A  Actuariat, ... » -> id + nom (nom souvent absent). */
export function parseTitreBloc(brut: string): { id: string; nom: string } | null {
  const m = /^Bloc\s+(\d{2}[A-Z]+)\s*(.*)$/.exec(brut.trim());
  if (!m) return null;
  return { id: m[1], nom: m[2].replace(/\s+/g, " ").trim() };
}

/** Entête de segment : « Segment 75 Propre à l'orientation Actuariat ». */
export function parseTitreSegment(
  brut: string,
): { numero: string; libelle: string; orientation: string | null } | null {
  const m = /^Segment\s+(\d+)\s*(.*)$/.exec(brut.trim());
  if (!m) return null;
  const libelle = m[2].replace(/\s+/g, " ").trim();
  const orientation = libelle.startsWith(MARQUEUR_ORIENTATION)
    ? libelle.slice(MARQUEUR_ORIENTATION.length).trim()
    : null;
  return { numero: m[1], libelle, orientation };
}

/** Codes de cours d'un bloc, dans l'ordre de la page, dédoublonnés. */
export function parseCodesBloc(
  htmlBloc: string,
  idBloc: string,
  journal: Journal,
): string[] {
  const re =
    /<a\b[^>]*class="[^"]*\bstretched-link\b[^"]*"[^>]*href="\/cours-et-horaires\/cours\/([^"/]+)\/"[^>]*>([\s\S]*?)<\/a>/gi;
  const vus = new Set<string>();
  const out: string[] = [];
  for (const m of htmlBloc.matchAll(re)) {
    const slug = m[1];
    const code = normaliserCode(texteLigne(m[2]));
    if (!code) {
      journal.inattendu(
        `bloc ${idBloc}`,
        `lien de cours dont le libellé n'est pas un code : « ${texteLigne(m[2])} » (slug ${slug})`,
      );
      continue;
    }
    const codeDuSlug = normaliserCode(slug);
    if (codeDuSlug !== code) {
      journal.inattendu(
        `bloc ${idBloc}`,
        `le libellé « ${code} » et l'URL « ${slug} » ne désignent pas le même cours`,
      );
    }
    if (vus.has(code)) continue;
    vus.add(code);
    out.push(code);
  }
  return out;
}

export interface CibleProgramme {
  /** Identifiant INTERNE au projet (pas une donnée UdeM) : « bac-mathematiques-actuariat ». */
  id: string;
  url: string;
  /** Nom d'orientation tel qu'écrit dans l'entête de segment, ou null = tout. */
  orientation: string | null;
}

export interface ResultatStructure {
  programme: Programme;
  journal: Journal;
}

export function parseStructure(
  html: string,
  cible: CibleProgramme,
  recupereISO: string,
): ResultatStructure {
  const journal = new Journal();

  const nomBrut = contenu(html, "div", "programme-name");
  const nom = nomBrut ? texteLigne(nomBrut) : null;
  if (nom === null) {
    journal.manque(cible.url, "nom du programme (div.programme-name) introuvable");
  }

  const descriptionBrute = contenu(html, "div", "structure-description");
  const description = descriptionBrute ? texteLigne(descriptionBrute) : "";
  const mTotal = /comporte\s+(\d+)\s+cr[ée]dits/i.exec(description);
  if (!mTotal) {
    journal.manque(
      cible.url,
      "nombre total de crédits : la description ne contient pas « comporte N crédits »",
    );
  }
  const creditsTotal = mTotal ? Number.parseInt(mTotal[1], 10) : 0;

  // Phrase d'exigences par type pour l'orientation visée. `Programme` n'a aucun
  // champ pour la porter (54 obligatoires / 33 option / 3 au choix), alors qu'elle
  // est le coeur de l'audit — on la journalise au moins verbatim.
  if (cible.orientation) {
    const reOrientation = new RegExp(
      `orientation ${cible.orientation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(([^)]*)\\)\\s*avec ([^.]*)\\.`,
      "i",
    );
    const mo = reOrientation.exec(description);
    if (mo) {
      journal.info(
        cible.id,
        `exigences par type, verbatim de la page : « orientation ${cible.orientation} (${mo[1]}) avec ${mo[2]}. » ` +
          `— aucun champ de \`Programme\` ne peut la porter, voir le rapport.`,
      );
    } else {
      journal.manque(
        cible.id,
        `phrase « - orientation ${cible.orientation} (segments ...) avec ... » absente de la description`,
      );
    }
  }

  const blocs: Bloc[] = [];
  const segmentsRetenus: string[] = [];
  const segmentsVus: string[] = [];

  for (const morceauSegment of decouperSur(html, JETON_SEGMENT)) {
    const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(morceauSegment);
    if (!h3) {
      journal.inattendu(cible.url, "segment sans entête <h3> : ignoré");
      continue;
    }
    const entete = parseTitreSegment(texteLigne(h3[1]));
    if (!entete) {
      journal.inattendu(cible.url, `entête de segment illisible : « ${texteLigne(h3[1])} »`);
      continue;
    }
    segmentsVus.push(`${entete.numero} ${entete.libelle}`);

    // Un segment commun (pas « Propre à l'orientation X ») appartient à toutes
    // les orientations ; un segment d'orientation n'est retenu que si son nom
    // est EXACTEMENT celui demandé (« Actuariat » != « Actuariat COOP »).
    const retenu =
      cible.orientation === null ||
      entete.orientation === null ||
      entete.orientation === cible.orientation;
    if (!retenu) continue;
    segmentsRetenus.push(entete.numero);

    for (const morceauBloc of decouperSur(morceauSegment, JETON_BLOC)) {
      const titreHtml = contenu(morceauBloc, "div", "bloc-titre");
      if (!titreHtml) {
        journal.inattendu(`segment ${entete.numero}`, "bloc sans div.bloc-titre : ignoré");
        continue;
      }
      const h4 = /<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(titreHtml);
      const small = /<small\b[^>]*>([\s\S]*?)<\/small>/i.exec(titreHtml);
      const titre = h4 ? parseTitreBloc(texteLigne(h4[1])) : null;
      if (!titre) {
        journal.inattendu(
          `segment ${entete.numero}`,
          `titre de bloc illisible : « ${h4 ? texteLigne(h4[1]) : "<h4> absent"} » — bloc ignoré`,
        );
        continue;
      }
      if (!small) {
        journal.manque(`bloc ${titre.id}`, "règle de crédits (<small>) absente — bloc ignoré");
        continue;
      }
      const regleBrut = texteLigne(small[1]);
      const lue = parseRegleBloc(regleBrut);
      if (!lue) {
        journal.inattendu(
          `bloc ${titre.id}`,
          `règle de crédits non reconnue : « ${regleBrut} » — bloc ignoré, aucune règle inventée`,
        );
        continue;
      }
      if (lue.note) journal.inattendu(`bloc ${titre.id}`, lue.note);
      if (titre.nom === "") {
        journal.manque(`bloc ${titre.id}`, "la page ne donne aucun nom à ce bloc (nom = \"\")");
      }

      const segment = segmentDeBloc(titre.id);
      if (segment !== entete.numero) {
        journal.inattendu(
          `bloc ${titre.id}`,
          `le bloc est sous l'entête « Segment ${entete.numero} » mais son id dit « ${segment} »`,
        );
      }

      blocs.push({
        id: titre.id,
        segment,
        nom: titre.nom,
        regle: lue.regle,
        cours: parseCodesBloc(morceauBloc, titre.id, journal),
        regleBrut,
      });
    }
  }

  if (cible.orientation !== null && !segmentsVus.some((s) => s.includes(cible.orientation!))) {
    journal.manque(
      cible.url,
      `aucun segment « ${MARQUEUR_ORIENTATION}${cible.orientation} » sur la page. Segments vus : ${segmentsVus.join(" | ")}`,
    );
  }

  // Recoupement : la description annonce « (segments 01 et 75) ».
  if (cible.orientation) {
    const annonce = new RegExp(
      `orientation ${cible.orientation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(segments?([^)]*)\\)`,
      "i",
    ).exec(description);
    if (annonce) {
      const annonces = [...annonce[1].matchAll(/\d+/g)].map((m) => m[0]).sort();
      const trouves = [...new Set(segmentsRetenus)].sort();
      if (annonces.join(",") !== trouves.join(",")) {
        journal.inattendu(
          cible.id,
          `segments annoncés par la description (${annonces.join(", ")}) != segments retenus (${trouves.join(", ")})`,
        );
      }
    }
  }

  return {
    programme: {
      id: cible.id,
      nom: nom ?? "",
      orientation: cible.orientation,
      creditsTotal,
      blocs,
      url: cible.url,
      scrapeISO: recupereISO,
    },
    journal,
  };
}
