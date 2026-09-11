/**
 * Lecture d'une fiche de cours `/cours-et-horaires/cours/<slug>/`.
 *
 * Gabarit observé sur les 55 fiches de l'orientation actuariat (2026-09-11) :
 *
 *   <span class="cours-faculte">Faculté des arts et des sciences,</span>
 *   <span class="cours-departement">Mathématiques et statistique</span>
 *   <h1 class="cours-titre">Mathématiques de l'assurance-vie 1</h1>
 *   <span class="cours-cycle">1<sup>er</sup> cycle</span>
 *   <span class="cours-numero">ACT 2250</span>
 *   <section class="cours-description ..."><p>...</p></section>
 *   <section class="cours-sommaire">
 *     <ul><li><b>Campus</b><p>Montréal</p></li>
 *         <li><b>Trimestres</b><p>Été 2026, Automne 2026</p></li>
 *         <li><b>Crédits</b><p>3.0</p></li>
 *         <li><b>Période</b><p>Horaire de jour, Horaire de soir</p></li></ul>
 *     <div class="cours-exigence"><h5>Exigences d'inscription</h5>
 *         <p>Préalable: ACT1240 ET MAT1720</p></div>
 *   </section>
 *
 * Pièges confirmés sur les vraies pages, chacun couvert par un test :
 *   - les étiquettes existent au singulier ET au pluriel : « Crédit » (STT 1682),
 *     « Trimestre » (IFT 3245, STT 3510), « Préalable » / « Préalables ».
 *   - `div.cours-exigence` est ABSENT quand le cours n'a aucune exigence
 *     (17 des 55 fiches). Absence n'est ni une chaîne vide ni une erreur.
 *   - une même ligne peut porter deux exigences séparées par « ; »
 *     (STT 2400 : « Préalable : MAT1600; Concomitant : STT2700 »).
 *   - 4 fiches sur 55 n'ont AUCUN trimestre publié (ACT 3253, ACT 4000,
 *     MAT 2719) : `trimestres: []` est la vérité de la page, pas un oubli.
 *   - une étiquette inconnue existe (« Restrictions d'inscription », DMO 1000) :
 *     elle part au journal, elle n'est jamais rangée dans les préalables.
 */
import type { Cours, NoeudPrealable, Saison, Trimestre } from "../../lib/types";
import { normaliserCode } from "../../lib/codes";
import { contenu, texteBrut, texteLigne, tousContenus } from "./html";
import { Journal } from "./journal";

const SAISONS: Record<string, Saison> = {
  automne: "Automne",
  hiver: "Hiver",
  "été": "Été",
  ete: "Été",
};

export interface SegmentExigence {
  /** Étiquette telle qu'écrite, ou null si la ligne n'en porte pas. */
  etiquette: string | null;
  texte: string;
}

export interface Exigences {
  prealablesBrut: string | null;
  concomitantsBrut: string | null;
  /** Tout ce qui n'est ni préalable ni concomitant : doit finir au journal. */
  autres: SegmentExigence[];
}

/**
 * Découpe le bloc « Exigences d'inscription ».
 *
 * `htmlExigence === null` veut dire que la page n'a pas ce bloc : les deux
 * champs valent null, ce qui affirme « ce cours n'a pas d'exigence », et c'est
 * bien ce que dit la page. Ne pas confondre avec « je n'ai pas su lire ».
 */
export function parseExigences(htmlExigence: string | null): Exigences {
  const out: Exigences = { prealablesBrut: null, concomitantsBrut: null, autres: [] };
  if (htmlExigence === null) return out;

  const paragraphes = tousContenus(htmlExigence, "p");
  const source =
    paragraphes.length > 0
      ? paragraphes.map(texteBrut).join("\n")
      : // Repli : pas de <p>. On retire l'entête h5 pour ne pas la prendre
        // pour une exigence, et on garde le reste.
        texteBrut(htmlExigence.replace(/<h5\b[\s\S]*?<\/h5\s*>/gi, ""));

  for (const ligne of source.split("\n")) {
    for (const morceau of ligne.split(";")) {
      const t = morceau.trim();
      if (t === "") continue;
      const m = /^([^:]{1,60}?)\s*:\s*([\s\S]*)$/.exec(t);
      if (!m) {
        out.autres.push({ etiquette: null, texte: t });
        continue;
      }
      const etiquette = m[1].trim();
      const valeur = m[2].trim();
      if (/^Pr[ée]alables?$/i.test(etiquette) && out.prealablesBrut === null) {
        out.prealablesBrut = valeur;
      } else if (/^Concomitants?$/i.test(etiquette) && out.concomitantsBrut === null) {
        out.concomitantsBrut = valeur;
      } else {
        out.autres.push({ etiquette, texte: valeur });
      }
    }
  }
  return out;
}

/** « Été 2026, Automne 2026 » -> deux trimestres. Saison inconnue = ignorée + journal. */
export function parseTrimestres(texte: string, ou: string, journal: Journal): Trimestre[] {
  const out: Trimestre[] = [];
  for (const morceau of texte.split(/[,\n]/)) {
    const t = morceau.trim();
    if (t === "") continue;
    const m = /^([A-Za-zÀ-ÿ]+)\s+(\d{4})$/.exec(t);
    if (!m) {
      journal.inattendu(ou, `trimestre illisible : « ${t} »`);
      continue;
    }
    const saison = SAISONS[m[1].toLowerCase()];
    if (!saison) {
      journal.inattendu(ou, `saison inconnue : « ${m[1]} » dans « ${t} »`);
      continue;
    }
    out.push({ saison, annee: Number.parseInt(m[2], 10) });
  }
  return out;
}

/** Valeur du `<p>` de l'élément `<li>` du sommaire dont le `<b>` colle à `etiquette`. */
function valeurSommaire(htmlSommaire: string, etiquette: RegExp): string | null {
  for (const li of tousContenus(htmlSommaire, "li")) {
    const b = /<b\b[^>]*>([\s\S]*?)<\/b\s*>/i.exec(li);
    if (!b || !etiquette.test(texteLigne(b[1]))) continue;
    const p = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/i.exec(li);
    return p ? texteBrut(p[1]) : null;
  }
  return null;
}

export interface ResultatFiche {
  /** null = la fiche est REJETÉE (voir le journal) et n'entre pas au catalogue. */
  cours: Cours | null;
  /** Retour de `parsePrealables` : false => la ligne va dans `prealablesNonParses`.
   *  null quand il n'y a pas de ligne de préalables à parser. */
  prealablesComplet: boolean | null;
  journal: Journal;
}

/**
 * Construit un `Cours` à partir du HTML d'une fiche.
 *
 * `prealables` n'est PAS calculé ici : c'est l'appelant qui passe
 * `parsePrealables` de `lib/engine/prealables.ts`, pour que ce module reste
 * testable sans dépendre du moteur et que la couture reste unique.
 */
export function parseFicheCours(
  html: string,
  url: string,
  recupereISO: string,
  parser: (brut: string) => { noeud: NoeudPrealable; complet: boolean },
): ResultatFiche {
  const journal = new Journal();

  const numero = contenu(html, "span", "cours-numero");
  const code = numero ? normaliserCode(texteLigne(numero)) : null;
  if (!code) {
    journal.manque(
      url,
      numero
        ? `span.cours-numero ne contient pas un code de cours : « ${texteLigne(numero)} » — fiche rejetée`
        : "span.cours-numero absent : la page n'est pas une fiche de cours — fiche rejetée",
    );
    return { cours: null, prealablesComplet: null, journal };
  }

  const sommaire = contenu(html, "section", "cours-sommaire");
  if (sommaire === null) journal.manque(code, "section.cours-sommaire absente");

  // Crédits : un cours sans crédits lus fausserait tout audit. On préfère une
  // fiche absente (cas que le moteur gère déjà) à un 0 plausible.
  const creditsBrut = sommaire ? valeurSommaire(sommaire, /^Cr[ée]dits?$/i) : null;
  const credits = creditsBrut === null ? null : Number.parseFloat(creditsBrut.replace(",", "."));
  if (credits === null || !Number.isFinite(credits)) {
    journal.manque(
      code,
      `crédits illisibles (${creditsBrut === null ? "étiquette « Crédits » absente" : `« ${creditsBrut} »`}) — fiche rejetée plutôt que mise à 0`,
    );
    return { cours: null, prealablesComplet: null, journal };
  }

  const titreHtml = /<h1\b[^>]*class="[^"]*\bcours-titre\b[^"]*"[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
  if (!titreHtml) journal.manque(code, "h1.cours-titre absent (titre laissé vide)");
  const titre = titreHtml ? texteLigne(titreHtml[1]) : "";

  const cycleHtml = contenu(html, "span", "cours-cycle");
  if (cycleHtml === null) journal.manque(code, "span.cours-cycle absent (cycle laissé vide)");
  const cycle = cycleHtml ? texteLigne(cycleHtml) : "";

  const faculteHtml = contenu(html, "span", "cours-faculte");
  // La page écrit « Faculté des arts et des sciences, » : la virgule sépare la
  // faculté du département, elle ne fait pas partie du nom.
  const faculte = faculteHtml ? texteLigne(faculteHtml).replace(/,\s*$/, "") : null;
  if (faculte === null) journal.manque(code, "span.cours-faculte absent (faculte = null)");

  const descHtml = contenu(html, "section", "cours-description");
  const paragraphes = descHtml ? tousContenus(descHtml, "p").map(texteBrut) : [];
  if (descHtml === null) journal.manque(code, "section.cours-description absente");
  else if (paragraphes.length === 0) journal.manque(code, "section.cours-description sans <p>");
  const description = paragraphes.join("\n");

  const trimestresBrut = sommaire ? valeurSommaire(sommaire, /^Trimestres?$/i) : null;
  if (trimestresBrut === null && sommaire !== null) {
    journal.manque(
      code,
      "aucune étiquette « Trimestre(s) » dans le sommaire : trimestres = [] (cours sans offre publiée)",
    );
  }
  const trimestres = trimestresBrut ? parseTrimestres(trimestresBrut, code, journal) : [];

  const exigences = parseExigences(contenu(html, "div", "cours-exigence"));
  for (const autre of exigences.autres) {
    journal.inattendu(
      code,
      `exigence d'inscription non rangée (ni préalable ni concomitant) : « ${autre.etiquette ?? "(sans étiquette)"}: ${autre.texte} »`,
    );
  }

  let prealables: NoeudPrealable | null = null;
  let prealablesComplet: boolean | null = null;
  if (exigences.prealablesBrut !== null) {
    const resultat = parser(exigences.prealablesBrut);
    prealables = resultat.noeud;
    prealablesComplet = resultat.complet;
  }

  return {
    prealablesComplet,
    cours: {
      code,
      titre,
      credits,
      cycle,
      faculte,
      description,
      prealablesBrut: exigences.prealablesBrut,
      prealables,
      concomitantsBrut: exigences.concomitantsBrut,
      trimestres,
      url,
      scrapeISO: recupereISO,
    },
    journal,
  };
}
