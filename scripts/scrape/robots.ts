/**
 * robots.txt : lecture et décision, sans réseau.
 *
 * La passe d'horaires hebdomadaire tourne SANS surveillance. Le « robots.txt
 * n'interdit que /fileadmin/fichiers/premium/ » du CLAUDE.md est une constatation
 * du 2026-09-10 ; rien ne garantit qu'il le soit encore dans trois mois. D'où
 * une vérification au début de chaque passe — l'appel réseau est dans
 * `executer.ts`, ce module ne fait que lire un texte et trancher.
 *
 * ## Quels groupes s'appliquent
 *
 * Le groupe `User-agent: *` et, s'il existe, celui qui nomme notre agent. Le
 * RFC 9309 veut que le groupe spécifique REMPLACE `*` ; on est volontairement
 * plus strict : un chemin n'est permis que si CHAQUE groupe applicable le
 * permet. Quand les deux se contredisent, la passe s'arrête et un humain
 * tranche — le mauvais côté de cette erreur est « on n'a rien scrapé cette
 * semaine », pas « on a frappé un chemin interdit ».
 *
 * ## Dans un groupe
 *
 * Règle du préfixe le plus long (RFC 9309) ; à longueur égale, `Allow` gagne.
 * `*` (suite quelconque) et `$` (fin de chemin) sont compris. Un `Disallow:`
 * vide ne dit rien. Un chemin qu'aucune règle ne touche est permis.
 */

export interface RegleRobots {
  genre: "allow" | "disallow";
  /** Le motif tel qu'écrit dans le fichier, `*` et `$` compris. */
  motif: string;
}

export interface GroupeRobots {
  /** Les `User-agent:` du groupe, en minuscules. */
  agents: string[];
  regles: RegleRobots[];
}

export interface DecisionRobots {
  permis: boolean;
  /** Pourquoi, en une phrase : la règle qui a tranché, ou l'absence de règle. */
  raison: string;
}

/** Lit un robots.txt. Ne lève jamais : un texte qui n'en est pas un donne `[]`. */
export function parseRobots(texte: string): GroupeRobots[] {
  const groupes: GroupeRobots[] = [];
  let courant: GroupeRobots | null = null;
  // Vrai tant qu'on lit des lignes `User-agent` consécutives : elles partagent
  // alors le même groupe. Dès qu'une règle apparaît, un nouveau `User-agent`
  // ouvre un autre groupe.
  let enTete = false;

  for (const brut of texte.split(/\r?\n/)) {
    const ligne = brut.replace(/#.*$/, "").trim();
    if (ligne === "") continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(ligne);
    if (!m) continue;
    const champ = m[1].toLowerCase();
    const valeur = m[2].trim();

    if (champ === "user-agent") {
      if (courant === null || !enTete) {
        courant = { agents: [], regles: [] };
        groupes.push(courant);
      }
      courant.agents.push(valeur.toLowerCase());
      enTete = true;
    } else if (champ === "allow" || champ === "disallow") {
      enTete = false;
      // Une règle avant tout `User-agent` n'appartient à aucun groupe : ignorée.
      if (courant === null) continue;
      courant.regles.push({ genre: champ, motif: valeur });
    }
    // Sitemap, Crawl-delay, etc. : sans effet sur la décision.
  }
  return groupes;
}

/** « udem-plan-ton-bacc/0.2 (projet etudiant…) » -> « udem-plan-ton-bacc ». */
export function jetonAgent(agent: string): string {
  return agent.split(/[\/\s(]/)[0].toLowerCase();
}

function motifVersRegExp(motif: string): RegExp {
  const echappe = motif.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  // Un `$` final (déjà échappé en `\$` ci-dessus) ancre la fin du chemin.
  const ancre = echappe.endsWith("\\$") ? `${echappe.slice(0, -2)}$` : echappe;
  return new RegExp(`^${ancre}`);
}

/** Longueur « utile » du motif pour départager deux règles : celle du texte écrit. */
function specificite(motif: string): number {
  return motif.length;
}

function decisionDuGroupe(groupe: GroupeRobots, chemin: string): DecisionRobots {
  let meilleure: RegleRobots | null = null;
  for (const regle of groupe.regles) {
    // `Disallow:` vide = tout est permis ; `Allow:` vide = rien à dire.
    if (regle.motif === "") continue;
    if (!motifVersRegExp(regle.motif).test(chemin)) continue;
    if (
      meilleure === null ||
      specificite(regle.motif) > specificite(meilleure.motif) ||
      (specificite(regle.motif) === specificite(meilleure.motif) && regle.genre === "allow")
    ) {
      meilleure = regle;
    }
  }
  if (meilleure === null) return { permis: true, raison: "aucune règle ne touche ce chemin" };
  return {
    permis: meilleure.genre === "allow",
    raison: `${meilleure.genre === "allow" ? "Allow" : "Disallow"}: ${meilleure.motif}`,
  };
}

/**
 * Le chemin est-il permis à `agent` ? Voir l'en-tête pour les groupes retenus.
 *
 * `chemin` commence par « / » et ne porte ni hôte ni requête.
 */
export function decider(groupes: GroupeRobots[], agent: string, chemin: string): DecisionRobots {
  const complet = agent.toLowerCase();
  const jeton = jetonAgent(agent);
  const applicables = groupes.filter((g) =>
    g.agents.some((a) => a === "*" || (a !== "" && (a === jeton || complet.includes(a)))),
  );
  if (applicables.length === 0) {
    return { permis: true, raison: "aucun groupe User-agent ne s'applique" };
  }
  for (const g of applicables) {
    const d = decisionDuGroupe(g, chemin);
    if (!d.permis) {
      return { permis: false, raison: `${d.raison} (groupe User-agent: ${g.agents.join(", ")})` };
    }
  }
  return { permis: true, raison: "aucun groupe applicable ne l'interdit" };
}

/** Les chemins que la passe d'horaires lit réellement. */
export const CHEMINS_HORAIRES = ["/cours-et-horaires/", "/cours-et-horaires/cours/"];

/**
 * Verdict pour la passe d'horaires : un message d'arrêt, ou `null` si tout passe.
 * Tous les chemins sont vérifiés, et le message nomme le premier refusé.
 */
export function refusPasseHoraires(
  texteRobots: string,
  agent: string,
  chemins: string[] = CHEMINS_HORAIRES,
): string | null {
  const groupes = parseRobots(texteRobots);
  for (const chemin of chemins) {
    const d = decider(groupes, agent, chemin);
    if (!d.permis) {
      return `robots.txt interdit ${chemin} à ${jetonAgent(agent)} : ${d.raison}.`;
    }
  }
  return null;
}
