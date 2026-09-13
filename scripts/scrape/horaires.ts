/**
 * L'« Aperçu des horaires » d'une fiche de cours : trimestre → section → séances.
 *
 * ## Le gabarit, relevé sur le balisage et non sur le texte extrait
 *
 *     <section class="cours-horaires">
 *       <h2 class="h3">Aperçu des horaires</h2>
 *       <div class="consulter-horaire…">… Centre étudiant …</div>
 *       <section class="cours-horaires-trimestre">
 *         <h3 class="h4">Automne 2026</h3>
 *         <div id="cours-horaires-trimestre-177">
 *           <h4 class="h5">Section A</h4>
 *           <table class="horaire-cours contenttable">
 *             <tr>
 *               <td><span class="jour_cours">Mar</span><span class="jour_long">Mardi</span></td>
 *               <td><span class="heure_de">De</span><span>15 h 30</span>
 *                   <span class="heure_a">à</span><span>16 h 29</span></td>
 *               <td><span class="date_du">Du</span><span>31/08/2026</span>
 *                   <span class="date_au">au</span><span>16/10/2026</span></td>
 *
 * ## Ce que la mesure a dit, et qui a décidé de la forme
 *
 * Sur les 8 824 pages du cache, 6 298 couples (cours, trimestre) publient un
 * horaire, pour 9 344 sections et 29 391 séances :
 *
 * - **la section d'horaire existe sur 100 % des pages, et 43 % la portent
 *   VIDE.** « A une section » ne veut donc pas dire « a un horaire » : un
 *   tableau vide est un état normal, pas un échec de lecture. D'où `[]` émis, et
 *   non le champ absent — l'absence veut dire « fiche antérieure au champ » ;
 * - **80 % des sections changent de motif en cours de trimestre** (jusqu'à 27
 *   fenêtres de dates). La fenêtre appartient donc à la SÉANCE ;
 * - **1 634 séances (5,6 %) portent « Non attribué »** : une plage de dates sans
 *   créneau. C'est déclaré par la page, pas manquant ;
 * - **774 couples ont des sections aux horaires divergents** (`ALL 1901` en a
 *   quatre). On ne déduplique donc PAS : la déduplication marcherait sur
 *   `MAT 1400` — douze sections pour deux tables identiques à l'octet — et
 *   mentirait sur `ALL 1901`. On conserve les sections distinctes et étiquetées,
 *   et c'est au consommateur de projeter sur celle que l'étudiant a choisie.
 *
 * ## Ce qu'on n'affirme pas
 *
 * La page titre « **Aperçu** des horaires » et renvoie au Centre étudiant « pour
 * les renseignements les plus à jour ». Le champ s'appelle `apercuHoraires` pour
 * que personne ne puisse le lire comme un horaire contractuel : un commentaire
 * ne voyage pas jusqu'à l'écran, un nom si.
 */
import type { ApercuTrimestre, Creneau, JourSemaine, Seance, SectionHoraire } from "../../lib/types";
import { Journal } from "./journal";
import { parseTrimestres } from "./cours";

const JOURS: Record<string, JourSemaine> = {
  lundi: "Lundi",
  mardi: "Mardi",
  mercredi: "Mercredi",
  jeudi: "Jeudi",
  vendredi: "Vendredi",
  samedi: "Samedi",
  dimanche: "Dimanche",
};

/** « 15 h 30 » -> 930. `null` si la forme n'est pas celle-là. */
export function minutesDe(brut: string): number | null {
  const m = /^(\d{1,2})\s*h\s*(\d{2})$/.exec(brut.trim());
  if (!m) return null;
  const heures = Number.parseInt(m[1], 10);
  const minutes = Number.parseInt(m[2], 10);
  if (heures > 23 || minutes > 59) return null;
  return heures * 60 + minutes;
}

/**
 * « 31/08/2026 » -> « 2026-08-31 ».
 *
 * Rend `null` plutôt que de deviner l'ordre des composants : la page est en
 * jour/mois/année, et une date ambiguë comme 03/05/2026 deviendrait silencieusement
 * le 3 mai ou le 5 mars selon l'humeur du lecteur. Seule la forme ISO se compare.
 */
export function dateISO(brut: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brut.trim());
  if (!m) return null;
  const [, jour, mois, annee] = m;
  if (Number.parseInt(mois, 10) < 1 || Number.parseInt(mois, 10) > 12) return null;
  if (Number.parseInt(jour, 10) < 1 || Number.parseInt(jour, 10) > 31) return null;
  return `${annee}-${mois}-${jour}`;
}

const texteDe = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Les `<span>` sans classe d'une cellule : ce sont eux qui portent les valeurs. */
function valeurs(cellule: string): string[] {
  return [...cellule.matchAll(/<span>([^<]*)<\/span>/g)].map((m) => m[1].trim()).filter((x) => x !== "");
}

/**
 * Les cellules d'une ligne, adressées par leur CONTENU et non par leur rang.
 *
 * Bug trouvé par le journal, pas par relecture : la ligne « Non attribué »
 * s'écrit `<td colspan="2">Non attribué</td><td>…dates…</td>`. Elle n'a donc que
 * DEUX cellules, et les dates y sont en position 1 et non 2. Lire `cellules[2]`
 * écartait silencieusement **1 634 séances** — toutes les « Non attribué » du
 * catalogue, soit exactement l'écart entre les 29 391 lignes du HTML et les
 * 27 757 émises. Le journal les a signalées une par une ; c'est en comparant
 * deux totaux que je les ai vues.
 *
 * On repère donc la cellule des dates par `date_du` et celle des heures par
 * `heure_de`, ce qu'aucun `colspan` ne déplace.
 */
function cellulesDe(ligne: string): { jour: string; heures: string; dates: string } {
  const tds = [...ligne.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  return {
    jour: tds[0] ?? "",
    heures: tds.find((c) => /class="heure_de"/.test(c)) ?? "",
    dates: tds.find((c) => /class="date_du"/.test(c)) ?? "",
  };
}

/**
 * Les créneaux d'UNE ligne — au pluriel, parce qu'une ligne peut en porter
 * plusieurs.
 *
 * UNE LIGNE LISTE PARFOIS PLUSIEURS JOURS, et ne pas le voir perd des séances
 * en silence. Mesuré sur le cache : **703 lignes portent 2 à 7 jours**, dont
 * **674 avec des heures**. Une première version prenait le premier
 * `jour_long` et jetait les autres : « Mardi, Mercredi » devenait « Mardi », et
 * la grille d'un cours intensif affichait un jour sur cinq. Aucun test ne
 * l'aurait dit — c'est en comparant le nombre de lignes du HTML au nombre de
 * séances émises que ça s'est vu.
 *
 * Les jours partagent alors les mêmes heures et la même fenêtre : l'expansion
 * en une séance par jour est une lecture fidèle, pas une invention.
 */
function creneauxDe(cellules: { jour: string; heures: string }, brutLigne: string): Creneau[] {
  const brut = texteDe(brutLigne);
  const joursBruts = [...cellules.jour.matchAll(/class="jour_long">\s*([^<]*?)\s*</g)].map((m) => m[1]);

  // « Non attribué » est un ÉTAT DÉCLARÉ, et il s'écrit SANS `jour_long` :
  // `<td colspan="2">Non attribué</td>`. 1 634 séances le portent. Le confondre
  // avec un échec de lecture ferait afficher « horaire inconnu » là où la page
  // dit « pas encore fixé ».
  if (joursBruts.length === 0) {
    if (/^non attribu/i.test(texteDe(cellules.jour))) return [{ genre: "nonAttribue" }];
    return [{ genre: "illisible", brut }];
  }

  const heures = valeurs(cellules.heures);
  const debutMin = heures[0] !== undefined ? minutesDe(heures[0]) : null;
  const finMin = heures[1] !== undefined ? minutesDe(heures[1]) : null;

  // Jours connus mais AUCUNE heure : 29 lignes du catalogue, toutes
  // multi-jours (un cours intensif sur une semaine). Ce n'est ni `nonAttribue`
  // — la page donne bien les jours — ni vraiment `illisible`, puisqu'on a lu.
  // Faute d'un genre pour le dire, on garde le verbatim : mieux vaut un
  // « je ne sais pas l'exprimer » qu'un « pas de créneau » qui serait faux.
  if (debutMin === null || finMin === null) return [{ genre: "illisible", brut }];

  return joursBruts.map((j): Creneau => {
    const jour = JOURS[j.toLowerCase()];
    // Un libellé hors des sept jours n'est PAS replié sur le plus proche.
    return jour === undefined ? { genre: "illisible", brut } : { genre: "attribue", jour, debutMin, finMin };
  });
}

/**
 * Les séances d'une table d'horaire.
 *
 * Une séance sans fenêtre de dates analysable n'est PAS émise — la fenêtre est
 * ce qui rend un calcul de conflit juste sur les 80 % de sections à motif
 * changeant, et une séance sans elle prétendrait valoir tout le trimestre.
 */
function seancesDe(table: string, ou: string, journal: Journal): Seance[] {
  const out: Seance[] = [];
  for (const ligne of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    if (/<th[\s>]/.test(ligne[1])) continue;
    const cellules = cellulesDe(ligne[1]);
    const dates = valeurs(cellules.dates).map(dateISO);
    const du = dates[0] ?? null;
    const au = dates[1] ?? null;
    if (du === null || au === null) {
      journal.inattendu(ou, `séance sans fenêtre de dates lisible, non émise : « ${texteDe(ligne[1])} »`);
      continue;
    }
    for (const creneau of creneauxDe(cellules, ligne[1])) {
      if (creneau.genre === "illisible") {
        journal.inattendu(ou, `créneau illisible, conservé verbatim : « ${creneau.brut} »`);
      }
      out.push({ creneau, du, au });
    }
  }
  return out;
}

/**
 * Lit l'aperçu complet. Rend `[]` quand la page publie la section sans aucun
 * trimestre — l'état de 43 % du catalogue, normal et à représenter.
 */
export function parseApercuHoraires(html: string, ou: string, journal: Journal): ApercuTrimestre[] {
  const debut = html.indexOf('<section class="cours-horaires">');
  if (debut < 0) return [];
  const fin = html.indexOf("</main", debut);
  const bloc = html.slice(debut, fin > debut ? fin : undefined);

  const out: ApercuTrimestre[] = [];
  for (const morceau of bloc.split('<section class="cours-horaires-trimestre">').slice(1)) {
    const titre = /<h3[^>]*>\s*([^<]+?)\s*<\/h3>/.exec(morceau)?.[1];
    if (titre === undefined) {
      journal.inattendu(ou, "section de trimestre sans titre <h3> — aperçu ignoré pour ce trimestre");
      continue;
    }
    const trimestres = parseTrimestres(titre, `${ou} horaires`, journal);
    if (trimestres.length !== 1) {
      journal.inattendu(ou, `titre de trimestre non réduit à un trimestre : « ${titre} » — aperçu ignoré`);
      continue;
    }

    const sections: SectionHoraire[] = [];
    // La table est exigée `horaire-cours` : une autre table de la page ne doit
    // pas se faire prendre pour un horaire.
    const paires = morceau.matchAll(
      /<h4 class="h5">\s*([^<]+?)\s*<\/h4>\s*<table[^>]*class="[^"]*horaire-cours[^"]*"[^>]*>([\s\S]*?)<\/table>/g,
    );
    for (const paire of paires) {
      // `nom` VERBATIM sans le mot « Section » : `A`, `A1`, `A101` et `A102`
      // coexistent et ne sont pas interchangeables.
      const nom = paire[1].replace(/\s+/g, " ").replace(/^Section\s+/i, "").trim();
      sections.push({ nom, seances: seancesDe(paire[2], `${ou} ${trimestres[0].saison} ${trimestres[0].annee} section ${nom}`, journal) });
    }
    if (sections.length === 0) continue;
    out.push({ trimestre: trimestres[0], sections });
  }
  return out;
}
