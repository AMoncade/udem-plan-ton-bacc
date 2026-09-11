/**
 * DÉPLIAGE ET DÉCOUPAGE DES LIGNES ICS (RFC 5545 §3.1).
 *
 * Le piège central du format : une ligne logique est coupée à 75 octets, et la
 * suite commence par UNE espace ou UNE tabulation qui ne fait pas partie de la
 * valeur. `synchro-calendrier` plie exactement à 75 octets, donc un SUMMARY un
 * peu long est coupé au milieu — parfois au milieu d'un code de cours. Lire le
 * fichier ligne par ligne sans déplier fait donc disparaître des cours entiers,
 * sans erreur et sans trace.
 */

/** Une propriété ICS, nom et paramètres en MAJUSCULES, valeur brute. */
export interface ProprieteICS {
  nom: string;
  params: Record<string, string>;
  /** Valeur telle qu'écrite, avant déséchappement TEXT. */
  valeur: string;
}

/**
 * Rend les lignes LOGIQUES du fichier, dans l'ordre.
 *
 * - accepte CRLF, LF et CR seul : un fichier passé par le presse-papiers ou
 *   par un éditeur Windows n'a plus forcément les CRLF du générateur ;
 * - retire le BOM UTF-8, qui collerait à `BEGIN:VCALENDAR` et ferait échouer la
 *   reconnaissance du format ;
 * - retire UN SEUL caractère de continuation, pas tous les blancs : une valeur
 *   qui commençait vraiment par une espace la garde.
 */
export function deplier(texte: string): string[] {
  const sansBom = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
  const physiques = sansBom.split(/\r\n|\n|\r/);
  const logiques: string[] = [];
  for (const physique of physiques) {
    const continuation = physique.startsWith(" ") || physique.startsWith("\t");
    if (continuation && logiques.length > 0) {
      logiques[logiques.length - 1] += physique.slice(1);
      continue;
    }
    // Une continuation sans rien à continuer est un fichier malformé ; la ligne
    // est gardée sans son blanc de tête plutôt que jetée, et c'est l'analyse de
    // la propriété qui la refusera bruyamment.
    logiques.push(continuation ? physique.slice(1) : physique);
  }
  // Le fichier finit par CRLF : la dernière ligne logique est vide.
  while (logiques.length > 0 && logiques[logiques.length - 1] === "") logiques.pop();
  return logiques;
}

/**
 * « DTSTART;TZID=America/Toronto:20260901T083000 » ->
 * { nom: "DTSTART", params: { TZID: "America/Toronto" }, valeur: "20260901T083000" }
 *
 * Le deux-points qui termine l'entête est cherché HORS guillemets : la RFC
 * autorise `PARAM="valeur;avec:ponctuation"`, et couper au premier `:` brut
 * tronquerait la valeur sans rien signaler.
 */
export function analyserPropriete(ligne: string): ProprieteICS | null {
  let dansGuillemets = false;
  let coupe = -1;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (c === '"') dansGuillemets = !dansGuillemets;
    else if (c === ":" && !dansGuillemets) {
      coupe = i;
      break;
    }
  }
  if (coupe === -1) return null;
  const entete = ligne.slice(0, coupe);
  const valeur = ligne.slice(coupe + 1);

  const morceaux = decouperHorsGuillemets(entete, ";");
  const nom = (morceaux[0] ?? "").trim().toUpperCase();
  if (nom === "" || !/^[A-Z0-9-]+$/.test(nom)) return null;

  const params: Record<string, string> = {};
  for (const morceau of morceaux.slice(1)) {
    const egal = morceau.indexOf("=");
    if (egal === -1) continue;
    const cle = morceau.slice(0, egal).trim().toUpperCase();
    const brut = morceau.slice(egal + 1).trim();
    params[cle] = brut.startsWith('"') && brut.endsWith('"') ? brut.slice(1, -1) : brut;
  }
  return { nom, params, valeur };
}

/** Découpe sur un séparateur en ignorant ceux placés entre guillemets. */
export function decouperHorsGuillemets(texte: string, separateur: string): string[] {
  const out: string[] = [];
  let courant = "";
  let dansGuillemets = false;
  for (const c of texte) {
    if (c === '"') {
      dansGuillemets = !dansGuillemets;
      courant += c;
    } else if (c === separateur && !dansGuillemets) {
      out.push(courant);
      courant = "";
    } else {
      courant += c;
    }
  }
  out.push(courant);
  return out;
}

/**
 * Déséchappe une valeur TEXT (RFC 5545 §3.3.11) : `\n`, `\,`, `\;`, `\\`.
 *
 * En une seule passe, et non par quatre `replace()` enchaînés : sur
 * `Pav. 3200 J.-Brillant\\, local B` (une contre-oblique littérale suivie d'une
 * virgule échappée), remplacer `\\,` avant `\\\\` rendrait une virgule là où il
 * fallait une contre-oblique. `synchro-calendrier` échappe `;` et `,` dans
 * toutes ses valeurs TEXT, donc le cas n'est pas théorique.
 */
export function deshapperTexte(valeur: string): string {
  let out = "";
  for (let i = 0; i < valeur.length; i += 1) {
    if (valeur[i] !== "\\") {
      out += valeur[i];
      continue;
    }
    const suivant = valeur[i + 1];
    if (suivant === undefined) {
      out += "\\";
      break;
    }
    if (suivant === "n" || suivant === "N") out += "\n";
    else out += suivant;
    i += 1;
  }
  return out;
}
