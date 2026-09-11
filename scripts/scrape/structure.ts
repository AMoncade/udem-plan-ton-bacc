/**
 * Lecture de `/programmes/<slug>/structure-du-programme/`.
 *
 * Gabarit revérifié le 2026-09-11 sur le bacc. en mathématiques, la maîtrise en
 * mathématiques, Accès - FAC, l'année préparatoire et un stage postdoctoral :
 *
 *   <section class="programme-identification">
 *     <p class="faculte">Faculté des arts et des sciences</p>
 *     <div class="programme-name">Maîtrise en mathématiques</div>
 *     <p class="cycle-numero"><span class="cycle">Cycles supérieurs</span>
 *                             <span class="numero">2-190-1-0</span></p>
 *   <div class="presentation-content clamped structure-description">…</div>
 *   <div class="programme-segment">
 *     <section class="description-segment">
 *       <h3>Segment 73 - Propre à l'option Actuariat</h3>
 *       <p>Les crédits de l'option sont répartis de la façon suivante:</p>…
 *     <section class="bloc">
 *       <div class="bloc-titre">
 *         <h4><span>S-Bloc 73A Cheminement avec stage</span></h4>
 *         <small>Option - minimum 15 crédits, maximum 24 crédits.</small>
 *       </div>
 *       <div class="bloc-notes">Cours de cycles supérieurs d'autres…</div>
 *       <section class="cours row">
 *         <article class="cour-detailles">…
 *           <a class="stretched-link" href="/cours-et-horaires/cours/act-2000/">ACT 2000</a>
 *
 * CE QUE CE MODULE FAIT DIFFÉREMMENT DE LA v1, et pourquoi :
 *
 * - **Un `Programme` par slug, tous segments confondus.** La v1 filtrait la page
 *   par orientation pour en tirer un programme. La v2 écrit un fichier par slug,
 *   donc la page entière, et `Bloc.segment` sert à regrouper.
 * - **`segment` est LU sur l'entête `<h3>` du conteneur**, jamais déduit de l'id.
 *   La maîtrise porte `MM-Bloc 73A` et `S-Bloc 73A` dans le segment 73 : un id
 *   tronqué à deux caractères donne « MM », et un extracteur ancré sur « Bloc »
 *   a fusionné 58 cours dans le mauvais bloc pendant la validation, sans erreur.
 *   L'identité unique est `cleBloc(segment, id)`.
 * - **Un bloc à la règle illisible n'est plus ignoré.** Il entre avec
 *   `{type:"inconnu", brut}`. Un bloc absent ne laisse aucune trace à l'écran ;
 *   un bloc non auditable, si.
 * - **`creditsTotal` peut être null.** Jamais 90, jamais 0 par défaut.
 * - **`structureLue`** distingue « page sans structure » de « échec de lecture ».
 *   Trois cas réels, vérifiés : `stage-postdoctoral-en-informatique` et
 *   `des-en-anesthesiologie` répondent **200 avec zéro segment** ;
 *   `microprogramme-de-1er-cycle-en-cultures-et-patrimoines-autochtones` répond
 *   **404**. Les deux premiers sont le cas dangereux : aucun statut ne les
 *   signale.
 */
import type { Bloc, Programme } from "../../lib/types";
import { cleBloc, normaliserCode } from "../../lib/codes";
import { contenu, decouperSur, texteBrut, texteLigne, tousContenus } from "./html";
import { Journal } from "./journal";
import { parseExigencesParType, parseRegleBloc, trouverPhrasesExigences } from "./regles";

const JETON_SEGMENT = '<div class="programme-segment">';
const JETON_BLOC = '<section class="bloc">';

/** « Propre à l'orientation X » (1er cycle) et « Propre à l'option X » (2e, 3e). */
const MARQUEURS_ORIENTATION = ["Propre à l'orientation ", "Propre à l'option "];

/**
 * Titre de bloc. QUATRE orthographes, toutes relevées sur de vraies pages :
 *
 *   « Bloc 75A Actuariat… »            bacc. en mathématiques
 *   « Bloc 01A »                       sans nom
 *   « MM-Bloc 73A Cheminement… »       maîtrise en mathématiques : préfixe AVANT
 *   « Bloc MM-70A Fondements… »        maîtrise en informatique : préfixe APRÈS
 *
 * Les deux dernières comptent : `MM-Bloc 73A` et `S-Bloc 73A` sont deux blocs
 * DIFFÉRENTS du segment 73, et la maîtrise en informatique met le même genre de
 * préfixe de l'autre côté du mot « Bloc » (`MM-70A`, `ST-70A`, `TD-70A`). Une
 * seule des deux orthographes supportée, c'est neuf blocs perdus en silence —
 * c'est exactement ce qui est arrivé au premier jet de ce fichier.
 *
 * `id` garde le préfixe et le numéro, sans le mot « Bloc » : « 75A », « MM-73A »,
 * « MM-70A ». Le mot est du gabarit ; le préfixe est de la donnée.
 */
export function parseTitreBloc(brut: string): { id: string; nom: string } | null {
  const t = brut.trim();
  // Préfixe avant : « MM-Bloc 73A ». Préfixe après : « Bloc MM-70A ».
  const m =
    /^([A-Za-z]{1,4}-)?Bloc\s+(?:([A-Za-z]{1,4})-)?(\d{2,3}[A-Z]*)\s*(.*)$/.exec(t);
  if (!m) return null;
  const avant = m[1] ? m[1].replace(/-$/, "") : null;
  const apres = m[2] ?? null;
  if (avant !== null && apres !== null) return null; // deux préfixes : forme inconnue
  const prefixe = avant ?? apres;
  return {
    id: prefixe === null ? m[3] : `${prefixe}-${m[3]}`,
    nom: m[4].replace(/\s+/g, " ").trim(),
  };
}

/**
 * Entête de segment. Formes relevées :
 *
 *   « Segment 01 Commun aux sept orientations »
 *   « Segment 73 - Propre à l'option Actuariat »     (tiret, et « option » au lieu
 *                                                     d'« orientation » aux cycles sup.)
 *   « Segment 70 »                                   sans libellé (Accès - FAC)
 *   « Segment Z Cours au choix »                     identifiant NON NUMÉRIQUE
 *                                                     (mineure arts et sciences)
 *
 * Le « Segment Z » est la raison pour laquelle `numero` n'est pas `\d+` : avec
 * cette seule exigence, la mineure arts et sciences perdait son unique segment
 * et se retrouvait déclarée sans structure, alors qu'elle a un bloc.
 */
export function parseTitreSegment(
  brut: string,
): { numero: string; libelle: string; orientation: string | null } | null {
  const m = /^Segment\s+(\d{1,3}|[A-Z]\d{0,2})\s*[-–—]?\s*(.*)$/.exec(brut.trim());
  if (!m) return null;
  const libelle = m[2].replace(/\s+/g, " ").trim();
  let orientation: string | null = null;
  for (const marqueur of MARQUEURS_ORIENTATION) {
    if (libelle.startsWith(marqueur)) {
      orientation = libelle.slice(marqueur.length).trim();
      break;
    }
  }
  return { numero: m[1], libelle, orientation };
}

/** Codes de cours d'un bloc, dans l'ordre de la page, dédoublonnés. */
export function parseCodesBloc(htmlBloc: string, sujet: string, journal: Journal): string[] {
  const re =
    /<a\b[^>]*class="[^"]*\bstretched-link\b[^"]*"[^>]*href="\/cours-et-horaires\/cours\/([^"/]+)\/"[^>]*>([\s\S]*?)<\/a>/gi;
  const vus = new Set<string>();
  const out: string[] = [];
  for (const m of htmlBloc.matchAll(re)) {
    const slug = m[1];
    const libelle = texteLigne(m[2]);
    const code = normaliserCode(libelle);
    if (!code) {
      journal.inattendu(
        sujet,
        `lien de cours dont le libellé n'est pas un code : « ${libelle} » (slug ${slug}) — cours ignoré`,
      );
      continue;
    }
    const codeDuSlug = normaliserCode(slug);
    if (codeDuSlug !== code) {
      // Le suffixe est significatif : « cri-1600g » est une fiche distincte de
      // « cri-1600 ». Un désaccord entre libellé et URL veut dire qu'on
      // scraperait la mauvaise fiche.
      journal.inattendu(
        sujet,
        `le libellé « ${code} » et l'URL « ${slug} » ne désignent pas le même cours`,
      );
    }
    if (vus.has(code)) continue;
    vus.add(code);
    out.push(code);
  }
  return out;
}

/**
 * `typeProgramme` : la tête du nom, verbatim, jusqu'au premier mot de liaison.
 *
 * « Maîtrise en mathématiques » -> « Maîtrise », « DES en anesthésiologie » ->
 * « DES », « Stage postdoctoral en informatique » -> « Stage postdoctoral ».
 * Ce n'est PAS une classification : aucun élément de la page ne porte le type,
 * et le numéro de programme (« 2-190-1-0 ») l'encode sans l'écrire. On découpe
 * donc le nom tel qu'il est écrit, et rien de plus.
 *
 * La coupe à deux mots existe pour « Mineure arts et sciences », qui n'a aucun
 * mot de liaison : sans elle, son `typeProgramme` serait le nom entier, et le
 * sélecteur aurait un « type » à une seule occurrence. Deux mots gardent « Stage
 * postdoctoral » et « Année préparatoire », qui en ont besoin.
 */
export function typeDuNom(nom: string): string | null {
  const t = nom.trim();
  if (t === "") return null;
  const m = /^(.*?)(?:\s+(?:en|de|d'|du|des|dans|pour)\s|\s+[-–—]\s)/i.exec(t);
  const tete = (m ? m[1] : t).trim();
  if (tete === "") return null;
  const mots = tete.split(/\s+/);
  return mots.length > 2 ? mots[0] : tete;
}

/** Recolle en une seule ligne un texte que `texteBrut` a coupé par bloc HTML. */
function recoller(texte: string): string {
  return texte.split("\n").join(" ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Les trois totaux par type sont COUPLÉS PAR LA SOMME, et on le vérifie ici.
 *
 * Le droit écrit 68 obligatoires + « de 30 à 33 à option » + « un maximum de 3
 * au choix » pour **101 crédits au total**. Être dans chacun des trois
 * intervalles ne suffit donc pas : 68 + 30 + 0 = 98 respecte les trois bornes et
 * ne diplôme pas. Le moteur contrôle ce troisième niveau, mais il ne peut le
 * faire que si les quatre nombres sont là ET cohérents.
 *
 * Ce contrôle ne corrige rien : il SIGNALE. Une somme impossible veut dire soit
 * que la page a été mal lue, soit qu'elle est incohérente, et les deux méritent
 * d'être vues plutôt que propagées jusqu'à un verdict de conformité.
 */
function verifierSommeDesTotaux(
  slug: string,
  creditsTotal: number | null,
  exigences: Programme["exigences"],
  journal: Journal,
): void {
  if (creditsTotal === null || exigences === null) return;
  const trois = [exigences.obligatoire, exigences.option, exigences.choix];
  const manquants = trois.filter((t) => t === null).length;
  if (manquants === 3) return;

  const sommeMin = trois.reduce((s, t) => s + (t?.min ?? 0), 0);
  const sommeMax = trois.reduce((s, t) => s + (t?.max ?? 0), 0);

  if (manquants > 0) {
    // Avec un type manquant, seule la borne basse est contrôlable : la somme des
    // minimums connus ne peut pas dépasser le total du programme.
    if (sommeMin > creditsTotal) {
      journal.inattendu(
        slug,
        `somme impossible : les minimums par type connus font ${sommeMin} crédits, ` +
          `plus que les ${creditsTotal} crédits annoncés du programme. Phrase lue : « ${exigences.brut} »`,
      );
    }
    return;
  }

  if (creditsTotal < sommeMin || creditsTotal > sommeMax) {
    journal.inattendu(
      slug,
      `somme incohérente : les trois totaux par type permettent de ${sommeMin} à ${sommeMax} crédits, ` +
        `mais le programme en annonce ${creditsTotal}. Soit la page est mal lue, soit elle est ` +
        `incohérente. Phrase lue : « ${exigences.brut} »`,
    );
  }
}

export interface ResultatStructure {
  programme: Programme;
  /** false quand la page n'expose aucun segment exploitable. Le sélecteur le dit
   *  au lieu d'ouvrir un programme vide. */
  structureLue: boolean;
  journal: Journal;
}

export function parseStructure(
  html: string,
  slug: string,
  url: string,
  recupereISO: string,
): ResultatStructure {
  const journal = new Journal();

  const nomBrut = contenu(html, "div", "programme-name");
  const nom = nomBrut ? texteLigne(nomBrut) : null;
  if (nom === null) journal.manque(slug, "div.programme-name introuvable (nom laissé vide)");

  const faculteBrute = contenu(html, "p", "faculte");
  const faculte = faculteBrute ? texteLigne(faculteBrute) || null : null;
  if (faculte === null) journal.manque(slug, "p.faculte absent (faculte = null)");

  const cycleBrut = contenu(html, "span", "cycle");
  const cycle = cycleBrut ? texteLigne(cycleBrut) || null : null;
  if (cycle === null) journal.manque(slug, "span.cycle absent (cycle = null)");

  const typeProgramme = nom ? typeDuNom(nom) : null;
  if (nom !== null && typeProgramme === null) {
    journal.manque(slug, `aucun type lisible en tête du nom « ${nom} » (typeProgramme = null)`);
  }

  const descriptionBrute = contenu(html, "div", "structure-description");
  const description = descriptionBrute ? texteBrut(descriptionBrute) : "";
  if (descriptionBrute === null) {
    journal.manque(slug, "div.structure-description absent (aucune description de programme)");
  }

  // Trois phrasés relevés : « Le baccalauréat comporte 90 crédits. »,
  // « La maîtrise comporte 45 crédits. », « Le Programme d'accès comporte un
  // maximum de 24 crédits. ». La négation finale écarte « Le segment comporte 15
  // crédits obligatoires », qui est un total de SEGMENT, pas du programme.
  //
  // `creditsTotal` reste null quand la page n'annonce aucun total au niveau du
  // programme. Cas réel et non une erreur : le bacc. en sciences infirmières
  // écrit « Le baccalauréat COMPREND deux orientations : - L'orientation clinique
  // comportant 105 crédits … - L'orientation cheminement international comportant
  // 106 crédits » — deux totaux différents, et aucun qui soit celui du programme.
  // En retenir un serait choisir à la place de l'étudiant.
  const mTotal = /comporte\s+(?:un\s+(?:maximum|minimum|total)\s+de\s+)?(\d+)\s+cr[ée]dits?(?!\s+(?:obligatoires?|[àa] option|au choix))/i.exec(
    description,
  );
  const creditsTotal = mTotal ? Number.parseInt(mTotal[1], 10) : null;
  if (creditsTotal === null) {
    journal.manque(
      slug,
      "nombre total de crédits : la description ne dit pas « comporte N crédits » — creditsTotal = null, surtout pas 90",
    );
  } else if (/comporte\s+un\s+(maximum|minimum)\s+de/i.test(description)) {
    journal.info(
      slug,
      `la page écrit « comporte un ${/maximum/i.test(description) ? "maximum" : "minimum"} de ${creditsTotal} crédits » : ` +
        "`creditsTotal` ne porte qu'un nombre, la nuance reste verbatim dans `notes`",
    );
  }

  const notesProgramme: string[] = [];
  if (description !== "") notesProgramme.push(description);

  const blocs: Bloc[] = [];
  const segments: string[] = [];
  const orientations: string[] = [];
  const phrasesExigences: string[] = [];
  // La recherche des phrases de répartition se fait sur la prose RECOLLÉE, pas
  // paragraphe par paragraphe. Raison vérifiée sur le bacc. en psychologie, qui
  // coupe une phrase au milieu entre deux <p> :
  //   <p>… 45 crédits obligatoires, de 39 à 42 crédits</p><p>à option et 3 à 6 crédits au choix.</p>
  // Lue par paragraphe, cette phrase donnait `obligatoire: null, option: null`
  // et un `brut` tronqué à « à option et 3 à 6 crédits au choix. » — une donnée
  // fausse, pas une absence.
  for (const phrase of trouverPhrasesExigences(recoller(description))) phrasesExigences.push(phrase);

  for (const morceauSegment of decouperSur(html, JETON_SEGMENT)) {
    const avantBlocs = morceauSegment.split(JETON_BLOC)[0];
    const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(avantBlocs);
    if (!h3) {
      journal.inattendu(slug, "div.programme-segment sans entête <h3> : segment ignoré");
      continue;
    }
    const entete = parseTitreSegment(texteLigne(h3[1]));
    if (!entete) {
      journal.inattendu(slug, `entête de segment illisible : « ${texteLigne(h3[1])} » — segment ignoré`);
      continue;
    }
    if (!segments.includes(entete.numero)) segments.push(entete.numero);
    if (entete.orientation && !orientations.includes(entete.orientation)) {
      orientations.push(entete.orientation);
    }

    // Prose du segment : tout ce qui est dans `section.description-segment`
    // hormis le `<h3>`. C'est là que vivent les totaux par type de la maîtrise
    // et les exigences par domaine. Sans ce champ, ça disparaît au scrape.
    const descSegment = contenu(avantBlocs, "section", "description-segment") ?? avantBlocs;
    const proseSegment = tousContenus(descSegment, "p").map(texteBrut).filter((t) => t !== "");
    const libelleSegment = `Segment ${entete.numero}${entete.libelle ? ` ${entete.libelle}` : ""}`;
    for (const p of proseSegment) notesProgramme.push(`${libelleSegment} — ${p}`);
    for (const phrase of trouverPhrasesExigences(recoller(proseSegment.join(" ")))) {
      phrasesExigences.push(phrase);
    }

    for (const morceauBloc of decouperSur(morceauSegment, JETON_BLOC)) {
      const titreHtml = contenu(morceauBloc, "div", "bloc-titre");
      if (!titreHtml) {
        journal.inattendu(
          `${slug} segment ${entete.numero}`,
          "section.bloc sans div.bloc-titre : bloc ignoré",
        );
        continue;
      }
      const h4 = /<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(titreHtml);
      const titre = h4 ? parseTitreBloc(texteLigne(h4[1])) : null;
      if (!titre) {
        journal.inattendu(
          `${slug} segment ${entete.numero}`,
          `titre de bloc illisible : « ${h4 ? texteLigne(h4[1]) : "<h4> absent"} » — bloc ignoré`,
        );
        continue;
      }

      const cle = cleBloc(entete.numero, titre.id);
      const sujet = `${slug} bloc ${cle}`;
      if (blocs.some((b) => b.cle === cle)) {
        // `Bloc.id` n'est pas unique, mais `cle` doit l'être : si elle collisionne,
        // l'audit mélangerait deux blocs. On le dit plutôt que de fusionner.
        journal.inattendu(sujet, "deux blocs portent la même clé segment/id — le second est conservé à part");
      }

      const small = /<small\b[^>]*>([\s\S]*?)<\/small>/i.exec(titreHtml);
      const regleBrut = small ? texteLigne(small[1]) : "";
      if (!small) {
        journal.manque(sujet, "règle de crédits (<small>) absente — regle = inconnu, bloc conservé");
      }
      const lue = parseRegleBloc(regleBrut);
      if (lue.note) journal.inattendu(sujet, lue.note);
      if (titre.nom === "") journal.manque(sujet, 'la page ne donne aucun nom à ce bloc (nom = "")');

      const notesBloc = tousContenus(contenu(morceauBloc, "div", "bloc-notes") ?? "", "p")
        .map(texteBrut)
        .filter((t) => t !== "");
      const notesBrutes = contenu(morceauBloc, "div", "bloc-notes");
      if (notesBloc.length === 0 && notesBrutes) {
        // `div.bloc-notes` sans `<p>` : le texte est nu dans le div.
        const nu = texteBrut(notesBrutes);
        if (nu !== "") notesBloc.push(nu);
      }

      const cours = parseCodesBloc(morceauBloc, sujet, journal);
      if (cours.length === 0 && (lue.regle.type === "option" || lue.regle.type === "obligatoire")) {
        // Un bloc obligatoire ou à option sans aucun code est une exigence
        // impossible à satisfaire : soit un bloc « catégorie » dont le contenu
        // n'est décrit qu'en prose (bacc. musique, bloc 02E « Cours de langue » /
        // « Option - Maximum 6 crédits. » : zéro code, seulement le renvoi au
        // Centre de langues), soit une lecture ratée. Les deux se ressemblent
        // exactement, d'où le signalement : c'est à la main qu'on tranche.
        journal.inattendu(
          sujet,
          `bloc ${lue.regle.type} sans aucun code de cours (règle « ${regleBrut} ») — ` +
            "soit un bloc dont le contenu est une catégorie décrite en prose, soit une lecture ratée" +
            (notesBloc.length > 0 ? ` ; prose du bloc : « ${notesBloc.join(" ").slice(0, 160)} »` : ""),
        );
      }

      blocs.push({
        id: titre.id,
        cle,
        segment: entete.numero,
        nom: titre.nom,
        regle: lue.regle,
        regleBrut,
        cours,
        notes: notesBloc,
      });
    }
  }

  // Une seule orientation nommée sur la page => c'est celle du programme. Sept
  // (bacc. maths) ou trois (maîtrise) => `orientation: null`, et les libellés
  // restent dans `notes`, chacun avec son segment.
  const orientation = orientations.length === 1 ? orientations[0] : null;
  if (orientations.length > 1) {
    journal.info(
      slug,
      `${orientations.length} orientations sur la page (${orientations.join(" | ")}) : ` +
        "`Programme.orientation` reste null, les blocs se regroupent par `segment`",
    );
  }

  // `Programme.exigences` est un champ unique, mais la page peut énoncer une
  // répartition PAR ORIENTATION (sept au bacc. en maths) ou PAR SEGMENT (trois
  // à la maîtrise). On ne choisit pas à sa place : une seule phrase remplit le
  // champ, plusieurs le laissent null et vivent dans `notes`, verbatim.
  let exigences: Programme["exigences"] = null;
  const phrasesUniques = [...new Set(phrasesExigences)];
  if (phrasesUniques.length === 1) {
    const lu = parseExigencesParType(phrasesUniques[0]);
    exigences = lu.exigences;
    for (const note of lu.notes) journal.inattendu(slug, note);
    if (lu.exigences.obligatoire === null && lu.exigences.option === null && lu.exigences.choix === null) {
      journal.inattendu(
        slug,
        `phrase d'exigences reconnue mais aucun total extrait : « ${phrasesUniques[0]} »`,
      );
    }
  } else if (phrasesUniques.length > 1) {
    journal.inattendu(
      slug,
      `${phrasesUniques.length} phrases de répartition par type sur la page (une par orientation ou ` +
        "par segment) ; `Programme.exigences` n'a qu'un emplacement, il reste null et les " +
        `${phrasesUniques.length} phrases sont dans \`notes\` verbatim : ` +
        phrasesUniques.map((p) => `« ${p} »`).join(" "),
    );
  } else {
    journal.manque(
      slug,
      "aucune phrase de répartition par type (« N crédits obligatoires, … à option, … au choix ») — exigences = null",
    );
  }

  verifierSommeDesTotaux(slug, creditsTotal, exigences, journal);

  const structureLue = blocs.length > 0;
  if (!structureLue) {
    journal.manque(
      slug,
      segments.length === 0
        ? "la page répond mais ne contient aucun div.programme-segment : ce programme n'a pas de structure en blocs (structureLue = false)"
        : `${segments.length} segment(s) lus mais aucun bloc retenu (structureLue = false)`,
    );
  }

  return {
    programme: {
      id: slug,
      nom: nom ?? "",
      orientation,
      segments,
      cycle,
      faculte,
      typeProgramme,
      creditsTotal,
      exigences,
      blocs,
      notes: notesProgramme,
      url,
      scrapeISO: recupereISO,
    },
    structureLue,
    journal,
  };
}
