/**
 * robots.txt : lecture et décision. Aucun réseau.
 *
 * Ces tests épinglent ce qui fait qu'une passe SANS surveillance s'arrête quand
 * il faut : le cas qui doit passer (le robots.txt réel, tel que relevé le
 * 2026-09-11) et ceux qui doivent bloquer, dont celui où deux groupes se
 * contredisent.
 */
import { describe, it, expect } from "vitest";
import { CHEMINS_HORAIRES, decider, jetonAgent, parseRobots, refusPasseHoraires } from "./robots";

const AGENT = "udem-plan-ton-bacc/0.2 (projet etudiant, scrape poli avec cache; contact: x@y.z)";

/** Contenu intégral relevé sur admission.umontreal.ca le 2026-09-11. */
const ROBOTS_REEL = "User-agent: *\nDisallow: /fileadmin/fichiers/premium/\n";

describe("jetonAgent", () => {
  it("garde le jeton de produit, en minuscules", () => {
    expect(jetonAgent(AGENT)).toBe("udem-plan-ton-bacc");
    expect(jetonAgent("Mozilla/5.0 (X11)")).toBe("mozilla");
  });
});

describe("parseRobots", () => {
  it("lit le robots.txt réel : un groupe, une règle", () => {
    expect(parseRobots(ROBOTS_REEL)).toEqual([
      { agents: ["*"], regles: [{ genre: "disallow", motif: "/fileadmin/fichiers/premium/" }] },
    ]);
  });

  it("regroupe les User-agent consécutifs et sépare les groupes", () => {
    const g = parseRobots("User-agent: a\nUser-agent: B\nDisallow: /x\n\nUser-agent: *\nAllow: /y\n");
    expect(g).toHaveLength(2);
    expect(g[0].agents).toEqual(["a", "b"]);
    expect(g[1].agents).toEqual(["*"]);
  });

  it("ignore commentaires, fins de ligne CRLF, casse des champs et règles orphelines", () => {
    const g = parseRobots("Disallow: /orpheline\r\n# commentaire\r\nUSER-AGENT: *   # fin\r\nDISALLOW: /p\r\nSitemap: https://x/s.xml\r\n");
    expect(g).toEqual([{ agents: ["*"], regles: [{ genre: "disallow", motif: "/p" }] }]);
  });

  it("ne lève pas sur un texte qui n'est pas un robots.txt", () => {
    expect(parseRobots("<html><body>503</body></html>")).toEqual([]);
    expect(parseRobots("")).toEqual([]);
  });
});

describe("decider", () => {
  it("permet /cours-et-horaires/ avec le robots.txt réel", () => {
    const g = parseRobots(ROBOTS_REEL);
    for (const chemin of CHEMINS_HORAIRES) expect(decider(g, AGENT, chemin).permis).toBe(true);
    expect(decider(g, AGENT, "/fileadmin/fichiers/premium/x.pdf").permis).toBe(false);
  });

  it("interdit quand * interdit le chemin, et nomme la règle", () => {
    const d = decider(parseRobots("User-agent: *\nDisallow: /cours-et-horaires/\n"), AGENT, "/cours-et-horaires/cours/act-1000/");
    expect(d.permis).toBe(false);
    expect(d.raison).toContain("Disallow: /cours-et-horaires/");
  });

  it("applique la règle la plus longue ; à égalité, Allow gagne", () => {
    const g = parseRobots("User-agent: *\nDisallow: /cours-et-horaires/\nAllow: /cours-et-horaires/cours/\n");
    expect(decider(g, AGENT, "/cours-et-horaires/cours/act-1000/").permis).toBe(true);
    expect(decider(g, AGENT, "/cours-et-horaires/autre/").permis).toBe(false);
    const egal = parseRobots("User-agent: *\nDisallow: /a/\nAllow: /a/\n");
    expect(decider(egal, AGENT, "/a/b").permis).toBe(true);
  });

  it("comprend * et $, et un Disallow vide ne dit rien", () => {
    expect(decider(parseRobots("User-agent: *\nDisallow: /*.pdf$\n"), AGENT, "/x/y.pdf").permis).toBe(false);
    expect(decider(parseRobots("User-agent: *\nDisallow: /*.pdf$\n"), AGENT, "/x/y.pdf?v=1").permis).toBe(true);
    expect(decider(parseRobots("User-agent: *\nDisallow:\n"), AGENT, "/cours-et-horaires/").permis).toBe(true);
  });

  it("le groupe de notre agent s'applique EN PLUS de *, et le plus strict l'emporte", () => {
    const texte = "User-agent: *\nAllow: /\n\nUser-agent: udem-plan-ton-bacc\nDisallow: /cours-et-horaires/\n";
    const d = decider(parseRobots(texte), AGENT, "/cours-et-horaires/");
    expect(d.permis).toBe(false);
    expect(d.raison).toContain("udem-plan-ton-bacc");
  });

  it("ignore le groupe d'un autre agent", () => {
    const texte = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /fileadmin/\n";
    expect(decider(parseRobots(texte), AGENT, "/cours-et-horaires/").permis).toBe(true);
  });

  it("permet quand aucun groupe ne s'applique", () => {
    expect(decider(parseRobots("User-agent: GPTBot\nDisallow: /\n"), AGENT, "/cours-et-horaires/").permis).toBe(true);
    expect(decider([], AGENT, "/cours-et-horaires/").permis).toBe(true);
  });
});

describe("refusPasseHoraires", () => {
  it("rend null avec le robots.txt réel", () => {
    expect(refusPasseHoraires(ROBOTS_REEL, AGENT)).toBeNull();
  });

  it("rend un message qui nomme le chemin refusé", () => {
    const msg = refusPasseHoraires("User-agent: *\nDisallow: /cours-et-horaires/\n", AGENT);
    expect(msg).toContain("/cours-et-horaires/");
    expect(msg).toContain("udem-plan-ton-bacc");
  });

  it("refuse aussi quand seul le sous-chemin des fiches est interdit", () => {
    const msg = refusPasseHoraires("User-agent: *\nDisallow: /cours-et-horaires/cours/\n", AGENT);
    expect(msg).toContain("/cours-et-horaires/cours/");
  });
});
