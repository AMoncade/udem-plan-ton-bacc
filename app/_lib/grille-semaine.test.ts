/**
 * LA GRILLE D'UNE SEMAINE.
 *
 * Ce qui est surveillé ici tient en une phrase : AUCUNE SÉANCE NE DOIT
 * DISPARAÎTRE. Une séance absente de l'écran se lit comme une séance qui
 * n'existe pas, et l'étudiant bâtit sa semaine autour d'un trou qui n'en est
 * pas un. Les trois natures — routine, événement, sans créneau — se partagent
 * donc l'ensemble, et un test le vérifie par le compte.
 *
 * Le second piège est la FUSION : elle existe pour que trois fenêtres du même
 * mardi ne fassent qu'une case, et elle ne doit jamais avaler deux choses
 * différentes.
 */
import { describe, expect, it } from "vitest";
import type { JourSemaine, Seance } from "../../lib/types";
import {
  construireGrille,
  fenetreLisible,
  finArrondie,
  heure,
  jourLisible,
  regrouperMessages,
  type Inscription,
} from "./grille-semaine";

function seance(
  jour: JourSemaine,
  debutMin: number,
  finMin: number,
  du: string,
  au: string,
): Seance {
  return { creneau: { genre: "attribue", jour, debutMin, finMin }, du, au };
}

function inscription(code: string, section: string, seances: Seance[]): Inscription {
  return { code, section, seances };
}

describe("construireGrille : rien ne se perd", () => {
  it("partage TOUTES les séances entre les trois natures", () => {
    // L'invariant qui compte le plus. S'il tombe, une séance a disparu de
    // l'écran sans que rien ne le signale.
    const seances: Seance[] = [
      seance("Mardi", 570, 689, "2026-09-01", "2026-10-16"), // routine
      seance("Jeudi", 570, 689, "2026-11-03", "2026-11-03"), // événement (1 jour)
      { creneau: { genre: "nonAttribue" }, du: "2026-09-01", au: "2026-12-09" },
      { creneau: { genre: "illisible", brut: "Lun. ?" }, du: "2026-09-01", au: "2026-12-09" },
    ];
    const g = construireGrille([inscription("ACT 1240", "A", seances)]);
    expect(g.cases.length + g.evenements.length + g.sansCreneau.length).toBe(
      seances.length,
    );
    expect(g.cases).toHaveLength(1);
    expect(g.evenements).toHaveLength(1);
    expect(g.sansCreneau).toHaveLength(2);
  });

  it("« non attribué » garde son motif et n'est pas confondu avec un illisible", () => {
    // Deux absences de nature différente : l'une est DÉCLARÉE par la page,
    // l'autre est un échec d'analyse. Les fondre ferait accuser le scraper d'un
    // trou que la page annonce elle-même.
    const g = construireGrille([
      inscription("X 1000", "A", [
        { creneau: { genre: "nonAttribue" }, du: "2026-09-01", au: "2026-12-09" },
        { creneau: { genre: "illisible", brut: "à déterminer" }, du: "2026-09-01", au: "2026-12-09" },
      ]),
    ]);
    expect(g.sansCreneau[0].motif).toContain("non attribuée");
    expect(g.sansCreneau[1].motif).toContain("à déterminer");
    // Et surtout : le mot « illisible » n'apparaît PAS à l'écran — la page a
    // souvent été lue sans problème, c'est elle qui ne donne pas l'heure.
    expect(g.sansCreneau[1].motif).not.toContain("illisible");
  });

  it("une fenêtre illisible ne devient PAS un événement", () => {
    // Un écart non calculable vaudrait 0 par défaut, donc « moins de sept
    // jours », donc un événement à date unique — inventée. Il ressort en « sans
    // créneau » avec sa raison.
    const g = construireGrille([
      inscription("X 1000", "A", [seance("Mardi", 570, 689, "31/08/2026", "16/10/2026")]),
    ]);
    expect(g.cases).toHaveLength(0);
    expect(g.evenements).toHaveLength(0);
    expect(g.sansCreneau[0].motif).toContain("dates non analysables");
  });
});

describe("construireGrille : le seuil se démontre", () => {
  it("sept jours d'écart est une routine, six un événement", () => {
    // À sept jours d'écart le jour de semaine revient une seconde fois : c'est
    // le premier écart où « hebdomadaire » veut dire quelque chose. À six, la
    // séance n'a lieu qu'une fois, quelle que soit l'apparence de la fenêtre.
    const six = construireGrille([
      inscription("X 1000", "A", [seance("Mardi", 570, 689, "2026-09-01", "2026-09-07")]),
    ]);
    expect(six.evenements).toHaveLength(1);
    expect(six.cases).toHaveLength(0);

    const sept = construireGrille([
      inscription("X 1000", "A", [seance("Mardi", 570, 689, "2026-09-01", "2026-09-08")]),
    ]);
    expect(sept.cases).toHaveLength(1);
    expect(sept.evenements).toHaveLength(0);
  });
});

describe("construireGrille : la fusion", () => {
  it("trois fenêtres du même créneau font UNE case portant trois dates", () => {
    // Le cas mesuré : sur 10,1 créneaux de routine d'une charge, 4,8 sont des
    // répétitions du même cours au même jour à la même heure. Sans fusion,
    // l'écran montrerait trois cases identiques et le mardi paraîtrait triplé.
    const g = construireGrille([
      inscription("MAT 1400", "A", [
        seance("Mardi", 510, 629, "2026-06-08", "2026-07-03"),
        seance("Mardi", 510, 629, "2026-05-04", "2026-05-29"),
        seance("Mardi", 510, 629, "2026-07-13", "2026-08-07"),
      ]),
    ]);
    expect(g.cases).toHaveLength(1);
    expect(g.cases[0].fenetres).toHaveLength(3);
    // Triées : l'écran lit « du 4 mai … » en premier, pas au hasard.
    expect(g.cases[0].fenetres[0].du).toBe("2026-05-04");
    expect(g.cases[0].fenetres[2].du).toBe("2026-07-13");
  });

  it("ne fusionne pas deux heures différentes du même jour", () => {
    const g = construireGrille([
      inscription("X 1000", "A", [
        seance("Mardi", 510, 629, "2026-09-01", "2026-12-09"),
        seance("Mardi", 750, 869, "2026-09-01", "2026-12-09"),
      ]),
    ]);
    expect(g.cases).toHaveLength(2);
  });

  it("ne fusionne pas deux SECTIONS au même créneau", () => {
    // L'appelant n'est pas censé fournir deux sections d'un même cours — un
    // étudiant en suit une. Mais s'il le fait, les fondre masquerait exactement
    // ce qu'il faut lui montrer.
    const g = construireGrille([
      inscription("X 1000", "A", [seance("Mardi", 510, 629, "2026-09-01", "2026-12-09")]),
      inscription("X 1000", "B", [seance("Mardi", 510, 629, "2026-09-01", "2026-12-09")]),
    ]);
    expect(g.cases).toHaveLength(2);
    expect(g.cases.map((c) => c.section)).toEqual(["A", "B"]);
  });
});

describe("construireGrille : ce que l'écran doit dessiner", () => {
  it("les bornes suivent l'occupation, pas la journée", () => {
    // Dessiner de minuit à minuit donnerait dix-neuf heures vides autour de
    // cinq cases.
    const g = construireGrille([
      inscription("X 1000", "A", [
        seance("Mardi", 510, 629, "2026-09-01", "2026-12-09"),
        seance("Jeudi", 900, 1019, "2026-09-01", "2026-12-09"),
      ]),
    ]);
    expect(g.bornes).toEqual({ debutMin: 510, finMin: 1019 });
  });

  it("aucune case : pas de bornes, pas de jours — et surtout pas zéro", () => {
    const g = construireGrille([]);
    expect(g.bornes).toBeNull();
    expect(g.joursAffiches).toEqual([]);
  });

  it("garde les journées LIBRES entre deux journées occupées", () => {
    // Un mercredi vide entre un mardi et un jeudi pleins est une information :
    // c'est une journée libre. Le supprimer ferait croire à deux jours de cours
    // consécutifs.
    const g = construireGrille([
      inscription("X 1000", "A", [
        seance("Mardi", 510, 629, "2026-09-01", "2026-12-09"),
        seance("Jeudi", 510, 629, "2026-09-01", "2026-12-09"),
      ]),
    ]);
    expect(g.joursAffiches).toEqual(["Mardi", "Mercredi", "Jeudi"]);
  });

  it("ne dessine pas un week-end que personne n'occupe", () => {
    const g = construireGrille([
      inscription("X 1000", "A", [seance("Lundi", 510, 629, "2026-09-01", "2026-12-09")]),
    ]);
    expect(g.joursAffiches).toEqual(["Lundi"]);
  });

  it("un samedi occupé est affiché, lui", () => {
    const g = construireGrille([
      inscription("X 1000", "A", [
        seance("Vendredi", 510, 629, "2026-09-01", "2026-12-09"),
        seance("Samedi", 510, 629, "2026-09-01", "2026-12-09"),
      ]),
    ]);
    expect(g.joursAffiches).toEqual(["Vendredi", "Samedi"]);
  });
});

describe("les heures et les dates s'affichent sans mentir", () => {
  it("n'arrondit QUE pour l'affichage", () => {
    // La page écrit « De 15 h 30 à 16 h 29 », et c'est ce :29 qui fait que deux
    // créneaux consécutifs ne se touchent pas. Arrondir dans un calcul
    // transformerait tout créneau adjacent en conflit.
    expect(heure(989)).toBe("16 h 29");
    expect(finArrondie(989)).toBe("16 h 30");
    expect(heure(930)).toBe("15 h 30");
    expect(finArrondie(719)).toBe("12 h");
  });

  it("lit une date ISO sans passer par Date, donc sans décalage de fuseau", () => {
    // `new Date("2026-09-13")` est lue en UTC puis rendue en heure locale : à
    // l'ouest de Greenwich elle s'affiche le 12. Le découpage de la chaîne ne
    // dépend d'aucun fuseau.
    expect(jourLisible("2026-09-13")).toBe("13 septembre");
    expect(jourLisible("2026-09-01")).toBe("1er septembre");
    expect(jourLisible("2026-09-13", true)).toBe("13 septembre 2026");
  });

  it("une date illisible est rendue telle quelle, jamais remplacée", () => {
    expect(jourLisible("31/08/2026")).toBe("31/08/2026");
  });

  it("une fenêtre d'un seul jour se dit « le », pas « du … au … »", () => {
    expect(fenetreLisible({ du: "2026-11-03", au: "2026-11-03" })).toBe("le 3 novembre");
    expect(fenetreLisible({ du: "2026-08-31", au: "2026-10-16" })).toBe(
      "du 31 août au 16 octobre",
    );
  });
});

describe("les voies : deux cases qui se croisent restent toutes deux visibles", () => {
  it("deux cours au même créneau prennent deux voies", () => {
    // Le pire défaut possible de cette grille serait qu'un conflit d'horaire
    // soit rendu INVISIBLE par le fait même qu'il en est un : deux cases
    // superposées, l'une cachant l'autre.
    const g = construireGrille([
      inscription("A 1000", "A", [seance("Mardi", 510, 629, "2026-09-01", "2026-12-09")]),
      inscription("B 1000", "A", [seance("Mardi", 540, 659, "2026-09-01", "2026-12-09")]),
    ]);
    expect(g.cases.map((c) => c.voie)).toEqual([0, 1]);
    expect(g.voiesParJour["Mardi"]).toBe(2);
  });

  it("deux cours qui ne se croisent PAS partagent la même voie", () => {
    // Sinon la colonne du mardi serait coupée en deux pour rien, et les cases
    // rétréciraient de moitié sur tout l'écran.
    const g = construireGrille([
      inscription("A 1000", "A", [seance("Mardi", 510, 629, "2026-09-01", "2026-12-09")]),
      inscription("B 1000", "A", [seance("Mardi", 750, 869, "2026-09-01", "2026-12-09")]),
    ]);
    expect(g.cases.map((c) => c.voie)).toEqual([0, 0]);
    expect(g.voiesParJour["Mardi"]).toBe(1);
  });

  it("le croisement se juge sur les HEURES, pas sur les dates", () => {
    // La grille est une enveloppe : deux cours au même créneau à des semaines
    // disjointes doivent rester lisibles tous les deux. Ce n'est pas un conflit
    // — c'est le moteur d'horaires qui le dira, dates comprises — mais les
    // empiler les rendrait illisibles.
    const g = construireGrille([
      inscription("A 1000", "A", [seance("Mardi", 510, 629, "2026-09-01", "2026-10-01")]),
      inscription("B 1000", "A", [seance("Mardi", 510, 629, "2026-10-20", "2026-12-09")]),
    ]);
    expect(g.voiesParJour["Mardi"]).toBe(2);
  });

  it("un jour sans case n'exige aucune voie", () => {
    const g = construireGrille([
      inscription("A 1000", "A", [seance("Mardi", 510, 629, "2026-09-01", "2026-12-09")]),
    ]);
    expect(g.voiesParJour["Mercredi"]).toBeUndefined();
  });
});

describe("les fenêtres communes se disent une fois, pas neuf", () => {
  it("reconnaît des fenêtres identiques sur toutes les cases", () => {
    // Le cas vu à l'écran : une charge d'hiver, neuf cases, toutes portant les
    // deux mêmes périodes — celles que la semaine de relâche découpe pour tout
    // le monde. « 2 périodes » répété neuf fois occupe l'espace le plus rare de
    // l'écran pour un fait unique, et le rend illisible en le réduisant à un
    // compte.
    const deux = [
      { du: "2027-01-07", au: "2027-02-26" },
      { du: "2027-03-08", au: "2027-04-16" },
    ];
    const g = construireGrille([
      inscription("A 1000", "A", [
        seance("Lundi", 630, 749, deux[0].du, deux[0].au),
        seance("Lundi", 630, 749, deux[1].du, deux[1].au),
      ]),
      inscription("B 1000", "A", [
        seance("Mardi", 810, 929, deux[0].du, deux[0].au),
        seance("Mardi", 810, 929, deux[1].du, deux[1].au),
      ]),
    ]);
    expect(g.fenetresDominantes).toEqual(deux);
  });

  it("une case divergente ne fait PAS perdre le motif aux autres", () => {
    // La correction. Sur la charge d'essai, huit cases sur neuf portaient le
    // même motif et la neuvième — STT 1682 — finissait son premier bloc une
    // semaine plus tôt. Exiger l'identité complète faisait perdre la
    // simplification aux huit à cause de l'une, alors que cette différence est
    // justement ce qu'il faut voir.
    const g = construireGrille([
      inscription("A 1000", "A", [seance("Lundi", 630, 749, "2027-01-07", "2027-02-26")]),
      inscription("B 1000", "A", [seance("Mardi", 810, 929, "2027-01-07", "2027-02-26")]),
      inscription("C 1000", "A", [seance("Jeudi", 810, 929, "2027-01-07", "2027-02-19")]),
    ]);
    expect(g.fenetresDominantes).toEqual([{ du: "2027-01-07", au: "2027-02-26" }]);
    expect(g.cases.map((c) => [c.code, c.suitLeMotif])).toEqual([
      ["A 1000", true],
      ["B 1000", true],
      ["C 1000", false],
    ]);
  });

  it("aucun motif ne domine quand elles divergent toutes", () => {
    // En deçà de la moitié, ce n'est plus un motif mais une case parmi
    // d'autres : l'annoncer ferait passer les autres pour des exceptions.
    const g = construireGrille([
      inscription("A 1000", "A", [seance("Lundi", 630, 749, "2027-01-07", "2027-02-26")]),
      inscription("B 1000", "A", [seance("Mardi", 810, 929, "2027-01-07", "2027-03-26")]),
      inscription("C 1000", "A", [seance("Jeudi", 810, 929, "2027-01-07", "2027-04-16")]),
    ]);
    expect(g.fenetresDominantes).toBeNull();
    expect(g.cases.every((c) => !c.suitLeMotif)).toBe(true);
  });

  it("aucune case : rien de commun à annoncer", () => {
    expect(construireGrille([]).fenetresDominantes).toBeNull();
  });
});

describe("regrouperMessages : quatorze fois la même phrase est UNE information", () => {
  it("compte les identiques au lieu de les répéter", () => {
    // Le cas vu à l'écran : le moteur compare les séances deux à deux, donc une
    // séance sans jour ni heure rend la comparaison indéterminable avec chacune
    // des autres et produit quatorze constats au mot près identiques. Le mur
    // poussait la grille hors de l'écran.
    const meme = "MAT 1600 section A : la page publie cette séance sans jour ni heure.";
    expect(regrouperMessages([meme, meme, meme])).toEqual([{ message: meme, n: 3 }]);
  });

  it("ne fond pas deux messages différents", () => {
    // Deux cours produisent des réserves différentes ; regrouper sur le seul
    // code effacerait la différence.
    const a = "MAT 1600 : sans jour ni heure.";
    const b = "STT 1700 : section inconnue.";
    expect(regrouperMessages([a, b, a])).toEqual([
      { message: a, n: 2 },
      { message: b, n: 1 },
    ]);
  });

  it("garde l'ordre de première apparition", () => {
    // Un tri par nombre ferait sauter les lignes d'un rendu à l'autre, sur une
    // liste que l'étudiant relit après chaque changement de section.
    const [x, y] = ["premier", "second"];
    expect(regrouperMessages([x, y, y, y]).map((g) => g.message)).toEqual([x, y]);
  });

  it("aucun message : aucun groupe", () => {
    expect(regrouperMessages([])).toEqual([]);
  });
});
