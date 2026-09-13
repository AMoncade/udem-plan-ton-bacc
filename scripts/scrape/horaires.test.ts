/**
 * Tous les fragments de ce fichier sont du BALISAGE VERBATIM du cache, relevé
 * sur les pages nommées. Une fixture écrite à la main prouverait seulement que
 * l'expression régulière reconnaît ce qu'on a pensé en l'écrivant — et les deux
 * défauts que ces tests figent sont précisément ceux qu'on n'avait pas pensés.
 */
import { describe, it, expect } from "vitest";
import { Journal } from "./journal";
import { dateISO, minutesDe, parseApercuHoraires } from "./horaires";

const envelopper = (interieur: string): string =>
  `<section class="cours-horaires"><h2 class="h3">Aperçu des horaires</h2>${interieur}</section><footer>`;
const trimestre = (titre: string, corps: string): string =>
  `<section class="cours-horaires-trimestre"><h3 class="h4">${titre}</h3><div>${corps}</div></section>`;

describe("minutesDe", () => {
  it("lit « 15 h 30 » en minutes depuis minuit", () => {
    expect(minutesDe("15 h 30")).toBe(930);
    expect(minutesDe("8 h 30")).toBe(510);
    // Les fins sont en :29 et :59 sur les pages de l'UdeM, et c'est ce qui fait
    // que deux créneaux consécutifs ne se touchent pas. Aucun arrondi.
    expect(minutesDe("16 h 29")).toBe(989);
  });

  it("refuse ce qui n'a pas cette forme au lieu de deviner", () => {
    for (const brut of ["15h", "15:30", "midi", "25 h 00", "15 h 99", ""]) {
      expect(minutesDe(brut), brut).toBeNull();
    }
  });
});

describe("dateISO", () => {
  it("convertit jour/mois/année en ISO", () => {
    expect(dateISO("31/08/2026")).toBe("2026-08-31");
  });

  it("rend null plutôt que de deviner l'ordre des composants", () => {
    // 03/05/2026 est le 3 mai en lecture UdeM ; un lecteur américain y verrait
    // le 5 mars. On n'accepte donc QUE la forme connue, et rien d'ambigu.
    expect(dateISO("2026-08-31")).toBeNull();
    expect(dateISO("31/13/2026")).toBeNull();
    expect(dateISO("00/08/2026")).toBeNull();
  });
});

describe("parseApercuHoraires", () => {
  const lire = (html: string) => {
    const journal = new Journal();
    return { apercu: parseApercuHoraires(html, "TST 1000", journal), journal };
  };

  it("lit une séance ordinaire — ACT 1240, verbatim", () => {
    const { apercu } = lire(
      envelopper(
        trimestre(
          "Automne 2026",
          '<h4 class="h5">Section A</h4><table class="horaire-cours contenttable">' +
            "<thead><tr><th>Jours</th><th>Heures</th><th>Dates</th></tr></thead><tbody>" +
            '<tr><td><span class="jour_cours">Mar</span><span class="jour_long">Mardi</span></td>' +
            '<td><span class="heure_de">De</span><span>15 h 30</span><span class="heure_a">à</span><span>16 h 29</span></td>' +
            '<td><span class="date_du">Du</span><span>31/08/2026</span><span class="date_au">au</span><span>16/10/2026</span></td>' +
            "</tr></tbody></table>",
        ),
      ),
    );
    expect(apercu).toEqual([
      {
        trimestre: { saison: "Automne", annee: 2026 },
        sections: [
          {
            nom: "A",
            seances: [
              {
                creneau: { genre: "attribue", jour: "Mardi", debutMin: 930, finMin: 989 },
                du: "2026-08-31",
                au: "2026-10-16",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("lit « Non attribué », qui n'a que DEUX cellules — AME 6080, verbatim", () => {
    // LE défaut que le journal a trouvé, pas la relecture. La ligne s'écrit
    // `<td colspan="2">Non attribué</td><td>…dates…</td>` : les dates sont en
    // position 1 et non 2. Lire la cellule par son rang écartait **1 634
    // séances** du catalogue — exactement l'écart entre les lignes du HTML et
    // les séances émises.
    const { apercu } = lire(
      envelopper(
        trimestre(
          "Été 2026",
          '<h4 class="h5">Section A</h4><table class="horaire-cours contenttable"><tbody>' +
            '<tr><td colspan="2">Non attribué</td>' +
            '<td><span class="date_du">Du</span><span>01/05/2026</span><span class="date_au">au</span><span>23/08/2026</span></td>' +
            "</tr></tbody></table>",
        ),
      ),
    );
    expect(apercu[0].sections[0].seances).toEqual([
      { creneau: { genre: "nonAttribue" }, du: "2026-05-01", au: "2026-08-23" },
    ]);
  });

  it("ÉCLATE une ligne à plusieurs jours en une séance par jour — BIO 3756, verbatim", () => {
    // Deuxième défaut silencieux : 703 lignes du catalogue portent 2 à 7 jours,
    // dont 674 avec des heures. Prendre le premier `jour_long` et jeter les
    // autres faisait afficher un jour sur cinq pour un cours intensif, sans que
    // rien ne le signale.
    const { apercu } = lire(
      envelopper(
        trimestre(
          "Été 2026",
          '<h4 class="h5">Section A</h4><table class="horaire-cours contenttable"><tbody>' +
            '<tr><td><span class="jour_long">Lundi</span>, <span class="jour_long">Mardi</span>, <span class="jour_long">Mercredi</span></td>' +
            '<td><span class="heure_de">De</span><span>9 h 00</span><span class="heure_a">à</span><span>11 h 59</span></td>' +
            '<td><span class="date_du">Du</span><span>04/05/2026</span><span class="date_au">au</span><span>08/05/2026</span></td>' +
            "</tr></tbody></table>",
        ),
      ),
    );
    const seances = apercu[0].sections[0].seances;
    expect(seances).toHaveLength(3);
    expect(seances.map((s) => (s.creneau.genre === "attribue" ? s.creneau.jour : "?"))).toEqual([
      "Lundi",
      "Mardi",
      "Mercredi",
    ]);
    // Mêmes heures et même fenêtre pour les trois : l'expansion est une lecture
    // fidèle de la ligne, pas une invention.
    for (const s of seances) {
      expect(s.creneau).toMatchObject({ debutMin: 540, finMin: 719 });
      expect(s.du).toBe("2026-05-04");
      expect(s.au).toBe("2026-05-08");
    }
  });

  it("garde le verbatim quand les jours sont là mais pas les heures", () => {
    // 29 lignes du catalogue : jours connus, cellule d'heures VIDE. Ce n'est ni
    // `nonAttribue` — la page donne les jours — ni une lecture ratée. Faute d'un
    // genre pour le dire, on conserve le texte plutôt que d'affirmer « aucun
    // créneau », qui serait faux.
    const { apercu, journal } = lire(
      envelopper(
        trimestre(
          "Été 2026",
          '<h4 class="h5">Section A</h4><table class="horaire-cours contenttable"><tbody>' +
            '<tr><td><span class="jour_long">Mardi</span>, <span class="jour_long">Mercredi</span></td><td></td>' +
            '<td><span class="date_du">Du</span><span>07/07/2026</span><span class="date_au">au</span><span>11/07/2026</span></td>' +
            "</tr></tbody></table>",
        ),
      ),
    );
    const seance = apercu[0].sections[0].seances[0];
    expect(seance.creneau.genre).toBe("illisible");
    if (seance.creneau.genre === "illisible") expect(seance.creneau.brut).toContain("Mardi");
    expect(journal.entrees.some((e) => /illisible/.test(e.message))).toBe(true);
  });

  it("rend [] quand la page publie la section sans aucun trimestre", () => {
    // L'état de 42 % du catalogue : la section existe, elle est vide. `[]` dit
    // « lu, rien publié » ; le champ ABSENT dirait « fiche antérieure au champ ».
    expect(lire(envelopper('<div class="consulter-horaire">Centre étudiant</div>')).apercu).toEqual([]);
  });

  it("n'invente pas d'horaire quand la page n'a pas la section du tout", () => {
    expect(lire("<main><p>rien ici</p></main>").apercu).toEqual([]);
  });

  it("ignore une table qui n'est pas une table d'horaire", () => {
    const { apercu } = lire(
      envelopper(trimestre("Automne 2026", '<h4 class="h5">Section A</h4><table class="autre"><tbody><tr><td>x</td></tr></tbody></table>')),
    );
    expect(apercu).toEqual([]);
  });

  it("garde le nom de section VERBATIM, sans le mot « Section »", () => {
    const { apercu } = lire(
      envelopper(
        trimestre(
          "Hiver 2027",
          '<h4 class="h5">Section A101</h4><table class="horaire-cours"><tbody>' +
            '<tr><td><span class="jour_long">Lundi</span></td>' +
            '<td><span class="heure_de">De</span><span>15 h 30</span><span class="heure_a">à</span><span>16 h 29</span></td>' +
            '<td><span class="date_du">Du</span><span>11/01/2027</span><span class="date_au">au</span><span>30/04/2027</span></td>' +
            "</tr></tbody></table>",
        ),
      ),
    );
    // `A101` n'est PAS replié sur `A1` ni sur `A` : ils coexistent dans le
    // catalogue et ne sont pas interchangeables.
    expect(apercu[0].sections[0].nom).toBe("A101");
  });

  it("écarte une séance dont la fenêtre de dates est illisible, et le journalise", () => {
    // La fenêtre est ce qui rend un calcul de conflit juste sur les 80 % de
    // sections à motif changeant. Une séance sans elle prétendrait valoir tout
    // le trimestre.
    const { apercu, journal } = lire(
      envelopper(
        trimestre(
          "Automne 2026",
          '<h4 class="h5">Section A</h4><table class="horaire-cours"><tbody>' +
            '<tr><td><span class="jour_long">Lundi</span></td>' +
            '<td><span class="heure_de">De</span><span>15 h 30</span><span class="heure_a">à</span><span>16 h 29</span></td>' +
            '<td><span class="date_du">Du</span><span>bientôt</span></td>' +
            "</tr></tbody></table>",
        ),
      ),
    );
    // La SECTION reste émise avec zéro séance : la page la publie, et la faire
    // disparaître ferait croire que le trimestre n'a pas cette section. C'est
    // la séance qu'on écarte, pas la section.
    expect(apercu[0].sections).toEqual([{ nom: "A", seances: [] }]);
    expect(journal.entrees.some((e) => /sans fenêtre de dates/.test(e.message))).toBe(true);
  });
});
