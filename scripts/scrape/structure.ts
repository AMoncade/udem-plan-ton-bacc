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
import type { Bloc, ExigencesParType, Orientation, Programme } from "../../lib/types";
import { cleBloc, normaliserCode } from "../../lib/codes";
import { contenu, decouperSur, texteBrut, texteLigne } from "./html";
import { Journal } from "./journal";
import {
  lireCheminement,
  lireOrientations,
  parseExigencesParType,
  parseRegleBloc,
  trouverPhrasesExigences,
} from "./regles";

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
  /**
   * `false` pour une ORIENTATION : sa répartition peut ne couvrir qu'une partie
   * du programme, et alors sommer moins que le total n'a rien d'anormal. Le
   * certificat en droit en est l'exemple : chaque orientation énonce
   * « 9 obligatoires, de 6 à 9 à option, maximum 3 au choix » — 15 à 21 crédits
   * — alors que le certificat en compte 30, les 12 restants venant du tronc
   * commun (segment 01) que la phrase de l'orientation ne mentionne pas.
   * Vérifier strictement y produirait un faux signalement sur une page juste,
   * ce qui use la confiance qu'on accorde au journal. Seul le dépassement reste
   * vérifiable : une partie ne peut pas excéder le tout.
   */
  strict = true,
): void {
  if (creditsTotal === null || exigences === null) return;
  const trois = [exigences.obligatoire, exigences.option, exigences.choix];
  const manquants = trois.filter((t) => t === null).length;
  if (manquants === 3) return;

  const sommeMin = trois.reduce((s, t) => s + (t?.min ?? 0), 0);
  const sommeMax = trois.reduce((s, t) => s + (t?.max ?? 0), 0);

  if (manquants > 0 || !strict) {
    // Seule la borne basse est contrôlable : la somme des minimums connus ne
    // peut pas dépasser le total du programme, qu'un type manque ou que la
    // répartition ne couvre qu'une partie du programme.
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
  const orientationsDesEntetes: string[] = [];
  /** Segments dont l'entête nomme une orientation : les autres sont COMMUNS à
   *  tous les parcours (« Segment 01 Commun aux sept orientations »). */
  const segmentsDOrientation = new Set<string>();
  /** Phrases de répartition trouvées dans la prose d'un segment donné. */
  const phrasesParSegment = new Map<string, string[]>();
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
    if (entete.orientation) {
      segmentsDOrientation.add(entete.numero);
      if (!orientationsDesEntetes.includes(entete.orientation)) {
        orientationsDesEntetes.push(entete.orientation);
      }
    }

    // Prose du segment : tout ce qui est dans `section.description-segment`
    // hormis le `<h3>`. C'est là que vivent les totaux par type de la maîtrise
    // et les exigences par domaine. Sans ce champ, ça disparaît au scrape.
    const descSegment = contenu(avantBlocs, "section", "description-segment") ?? avantBlocs;
    const proseSegment = texteBrut(descSegment.replace(/<h3\b[\s\S]*?<\/h3\s*>/gi, ""))
      .split("\n")
      .map((t) => t.trim())
      .filter((t) => t !== "");
    const libelleSegment = `Segment ${entete.numero}${entete.libelle ? ` ${entete.libelle}` : ""}`;
    for (const p of proseSegment) notesProgramme.push(`${libelleSegment} — ${p}`);
    const phrasesDuSegment = trouverPhrasesExigences(recoller(proseSegment.join(" ")));
    phrasesParSegment.set(entete.numero, phrasesDuSegment);
    for (const phrase of phrasesDuSegment) phrasesExigences.push(phrase);

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

      // Tout le texte de `div.bloc-notes`, une entrée par bloc de texte.
      // NE PAS passer par `tousContenus(..., "p")` : le bloc 02E du bacc. en
      // musique écrit sa prose EN TEXTE NU puis ajoute un `<p>` avec le lien.
      // Ne garder que les `<p>` réduisait cette note aux cinq mots du lien
      // (« Consultez l'information sur le site du Centre de langues ») et
      // perdait la liste des langues — c'est-à-dire tout le contenu du bloc.
      const notesBrutes = contenu(morceauBloc, "div", "bloc-notes");
      const notesBloc = notesBrutes
        ? texteBrut(notesBrutes)
            .split("\n")
            .map((t) => t.trim())
            .filter((t) => t !== "")
        : [];

      const cours = parseCodesBloc(morceauBloc, sujet, journal);
      // `contenuOuvert` : le bloc n'énumère aucun cours ET décrit son contenu en
      // prose. La définition est littérale, pas une devinette sur le type du
      // bloc : c'est exactement ce qui distingue un bloc « catégorie » (renvoi
      // au Centre de langues) d'une page mal lue, qui n'a ni cours ni prose.
      const contenuOuvert = cours.length === 0 && notesBloc.length > 0;
      if (
        cours.length === 0 &&
        !contenuOuvert &&
        (lue.regle.type === "option" || lue.regle.type === "obligatoire")
      ) {
        // Un bloc obligatoire ou à option sans aucun code est une exigence
        // impossible à satisfaire : soit un bloc « catégorie » dont le contenu
        // n'est décrit qu'en prose (bacc. musique, bloc 02E « Cours de langue » /
        // « Option - Maximum 6 crédits. » : zéro code, seulement le renvoi au
        // Centre de langues), soit une lecture ratée. Les deux se ressemblent
        // exactement, d'où le signalement : c'est à la main qu'on tranche.
        // Ni cours ni prose : il ne reste rien à quoi rattacher l'exigence, et
        // ce n'est donc pas un contenu ouvert mais une lecture à vérifier.
        journal.inattendu(
          sujet,
          `bloc ${lue.regle.type} sans aucun code de cours NI prose (règle « ${regleBrut} ») — ` +
            "exigence impossible à satisfaire : page mal lue, ou bloc vide sur la page",
        );
      } else if (contenuOuvert && lue.regle.type !== "choix") {
        journal.info(
          sujet,
          `contenu ouvert (règle « ${regleBrut} ») : aucun code, le contenu est décrit en prose — ` +
            `« ${notesBloc.join(" ").slice(0, 180)} »`,
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
        contenuOuvert,
        notes: notesBloc,
      });
    }
  }

  // --- Orientations : les PARCOURS que la page déclare ---------------------
  //
  // Un `Programme` est une PAGE ; ce qu'un étudiant choisit est un PARCOURS. Le
  // bacc. en mathématiques énonce sept répartitions de crédits, une par
  // orientation : avec le seul champ `exigences`, désigner celle de l'actuariat
  // aurait été un choix arbitraire déguisé en donnée. Chaque orientation porte
  // donc la sienne, et `exigences` ne sert plus qu'aux pages à parcours unique.
  //
  // Les segments COMMUNS (ceux dont l'entête ne nomme aucune orientation, comme
  // « Segment 01 Commun aux sept orientations ») appartiennent à TOUS les
  // parcours : ils sont ajoutés à chacun, sans quoi le tronc commun
  // disparaîtrait de l'audit.
  const segmentsCommuns = segments.filter((s) => !segmentsDOrientation.has(s));
  // La description est passée LIGNE PAR LIGNE, pas recollée : `lireOrientations`
  // s'appuie sur les puces, et recoller collerait la phrase d'introduction à la
  // première d'entre elles.
  const orientations: Orientation[] = lireOrientations(description).flatMap((o): Orientation[] => {
    // Les segments sont ceux que la page NOMME, sans les filtrer sur ceux
    // trouvés : un segment annoncé mais absent des blocs est une information en
    // soi, et le taire ferait disparaître un parcours au lieu de le signaler.
    const segmentsDuParcours = [...new Set([...o.segments, ...segmentsCommuns])].sort();
    const absents = o.segments.filter((s) => !segments.includes(s));
    if (absents.length > 0) {
      journal.inattendu(
        slug,
        `orientation « ${o.nom} » annonce le(s) segment(s) ${absents.join(", ")}, ` +
          `absent(s) de la page (segments trouvés : ${segments.join(", ") || "aucun"})`,
      );
    }
    // La répartition vient d'abord de la phrase de l'orientation elle-même
    // (bacc. en maths). Quand la phrase ne fait que nommer les segments (la
    // maîtrise écrit « - l'option Mathématiques pures, … (segment 70), »), on
    // se rabat sur la prose du segment PROPRE à ce parcours, mais SEULEMENT si
    // elle n'énonce qu'une seule répartition : le segment 73 de la maîtrise en
    // énonce deux (cheminement mémoire et cheminement stage) et choisir serait
    // inventer.
    const lireExigences = (nom: string, phrase: string): ExigencesParType => {
      const lu = parseExigencesParType(phrase);
      for (const note of lu.notes) journal.inattendu(`${slug} / ${nom}`, note);
      return lu.exigences;
    };

    const propre = trouverPhrasesExigences(o.phrase)[0] ?? null;
    if (propre !== null) {
      return [{ nom: o.nom, segments: segmentsDuParcours, exigences: lireExigences(o.nom, propre) }];
    }

    const propres = o.segments.filter((s) => !segmentsCommuns.includes(s));
    const candidates = [...new Set(propres.flatMap((s) => phrasesParSegment.get(s) ?? []))];
    if (candidates.length === 1) {
      return [
        { nom: o.nom, segments: segmentsDuParcours, exigences: lireExigences(o.nom, candidates[0]) },
      ];
    }

    if (candidates.length > 1) {
      // Plusieurs répartitions pour un seul segment : ce sont des CHEMINEMENTS,
      // et un cheminement mémoire et un cheminement stage ont des répartitions
      // différentes — donc deux parcours, au sens où l'étudiant en choisit un.
      // On les aplatit en orientations plutôt que d'ajouter un troisième niveau
      // au modèle : l'imbrication est une façon dont la page est écrite, pas
      // une nécessité, et un niveau de plus se propagerait partout sans rien
      // exprimer de neuf.
      const nommes = candidates.map((p) => ({ phrase: p, cheminement: lireCheminement(p) }));
      const noms = nommes.map((c) => c.cheminement);
      const tousNommes = noms.every((n) => n !== null);
      const tousDistincts = new Set(noms).size === noms.length;
      if (tousNommes && tousDistincts) {
        return nommes.map(({ phrase, cheminement }) => {
          const nom = `${o.nom} — cheminement ${cheminement}`;
          return { nom, segments: segmentsDuParcours, exigences: lireExigences(nom, phrase) };
        });
      }
      // On n'invente pas un cheminement que la page ne nomme pas, et on ne
      // choisit pas parmi des répartitions indiscernables : exigences reste
      // null et les phrases restent dans `notes`.
      journal.inattendu(
        slug,
        `orientation « ${o.nom} » : ses segments (${propres.join(", ")}) énoncent ` +
          `${candidates.length} répartitions, dont ${noms.filter((n) => n === null).length} sans ` +
          "cheminement nommé — aucune n'est « celle de l'orientation », exigences = null",
      );
    }
    return [{ nom: o.nom, segments: segmentsDuParcours, exigences: null }];
  });

  // `exigences` au niveau du programme : uniquement quand la page ne déclare
  // AUCUN parcours multiple et n'énonce qu'une répartition. Le contrat l'exige
  // (« quand `orientations` n'est pas vide, `exigences` vaut null ») et c'est la
  // même règle que pour `orientation`.
  let exigences: ExigencesParType | null = null;
  const phrasesUniques = [...new Set(phrasesExigences)];
  if (orientations.length > 0) {
    journal.info(
      slug,
      `${orientations.length} parcours déclarés (${orientations.map((o) => o.nom).join(" | ")}) ; ` +
        `${orientations.filter((o) => o.exigences !== null).length} avec leur propre répartition. ` +
        "`Programme.exigences` reste null : les orientations sont des alternatives, pas des exigences cumulées.",
    );
  } else if (phrasesUniques.length === 1) {
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
      `${phrasesUniques.length} phrases de répartition par type sur la page, mais aucun parcours ` +
        "nommé avec ses segments : impossible de les attribuer. `exigences` reste null et les " +
        `${phrasesUniques.length} phrases sont dans \`notes\` verbatim : ` +
        phrasesUniques.map((p) => `« ${p} »`).join(" "),
    );
  } else {
    journal.manque(
      slug,
      "aucune phrase de répartition par type (« N crédits obligatoires, … à option, … au choix ») — exigences = null",
    );
  }

  // `Programme.orientation` n'est renseigné que sur un programme PROJETÉ sur une
  // orientation (voir `projeterOrientation`). Sur un programme lu du disque, il
  // vaut null : c'est `orientations` qui porte l'information.
  const orientation = null;

  verifierSommeDesTotaux(slug, creditsTotal, exigences, journal);
  for (const o of orientations) {
    verifierSommeDesTotaux(`${slug} / ${o.nom}`, creditsTotal, o.exigences, journal, false);
  }

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
      orientations,
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
