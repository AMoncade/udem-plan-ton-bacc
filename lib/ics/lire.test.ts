import { describe, expect, test } from "vitest";
import { extraireCodes } from "../codes";
import { avecFins, lireFixture } from "./__fixtures__";
import { lireICS } from "./lire";
import type { CoursTrouveICS, ResultatImportICS } from "./types";

/**
 * Ce que `lib/codes.ts` sait faire AUJOURD'HUI, mesuré et non supposé.
 *
 * `lib/codes.ts` est gelé et propriété de l'intégratrice : il a déjà été étendu
 * une fois pour lire les 199 sigles suffixés et les quatre à cinq chiffres.
 * Épingler ici l'incapacité actuelle ferait tomber ces tests le jour où
 * l'extension arrive — c'est exactement l'erreur consignée dans
 * `docs/CONTRAT.md` à propos du scraper, dont les tests épinglaient l'ancienne
 * incapacité de `parsePrealables()`. On mesure donc, et on vérifie l'invariant
 * qui doit tenir dans les deux cas : **un sigle est soit reconnu comme cours,
 * soit nommé dans `ignores` — jamais perdu en silence.**
 */
const SIGLES_EXOTIQUES_LISIBLES = extraireCodes("DRT1151G-A — Théorie").length > 0;

/** Après tous les trimestres des fixtures, pour que « terminé » soit stable. */
const APRES = new Date(2027, 5, 1, 12, 0);
/** Pendant l'automne 2026 : MAT 1400 n'a pas encore passé son final. */
const PENDANT_A26 = new Date(2026, 9, 15, 12, 0);

function cours(resultat: ResultatImportICS, code: string): CoursTrouveICS {
  const trouve = resultat.cours.find((c) => c.code === code);
  if (trouve === undefined) throw new Error(`${code} absent du résultat`);
  return trouve;
}

describe("fichiers qui ne sont pas des horaires", () => {
  test("fichier vide", () => {
    const r = lireICS(lireFixture("vide.ics"), { maintenant: APRES });
    expect(r.estICS).toBe(false);
    expect(r.cours).toEqual([]);
    expect(r.problemes).toEqual(["Le fichier est vide : rien à lire."]);
  });

  test("texte blanc seulement", () => {
    expect(lireICS("   \n\t\r\n ").problemes).toEqual(["Le fichier est vide : rien à lire."]);
  });

  /**
   * Le texte du Centre étudiant contient de VRAIS sigles (« MAT 1400-A »). Un
   * lecteur qui se contenterait de chercher des codes en tirerait une liste de
   * cours crédible d'un fichier qui n'est pas un horaire. On refuse, et on dit
   * quoi faire.
   */
  test("un collage du Centre étudiant est refusé, pas à moitié compris", () => {
    const r = lireICS(lireFixture("pas-un-ics.txt"), { maintenant: APRES });
    expect(r.estICS).toBe(false);
    expect(r.cours).toEqual([]);
    expect(r.ignores).toEqual([]);
    expect(r.problemes[0]).toContain("BEGIN:VCALENDAR");
  });

  test("un fichier coupé en plein VEVENT garde le cours et signale la coupure", () => {
    const r = lireICS(lireFixture("tronque.ics"), { maintenant: APRES });
    expect(r.cours.map((c) => c.code)).toEqual(["ACT 2250"]);
    expect(r.problemes).toEqual([
      "Le fichier a des blocs BEGIN/END mal appariés : la lecture a pu manquer des évènements.",
    ]);
  });
});

describe("horaire réel de synchro-calendrier 0.2 (titre dans le SUMMARY)", () => {
  const r = lireICS(lireFixture("horaire-a26-synchro02.ics"), { maintenant: APRES });

  /**
   * 33 VEVENT pour 4 cours : un par jour de semaine, un par section, et un par
   * plage continue, Synchro recoupant la même séance autour de la relâche. Ne
   * jamais déduire un nombre de cours d'un nombre d'évènements.
   */
  test("les quatre cours de l'horaire, rien de plus, pour 33 évènements", () => {
    expect(r.estICS).toBe(true);
    expect(r.problemes).toEqual([]);
    expect(r.cours.map((c) => c.code)).toEqual(["MAT 1400", "MAT 1500", "STT 1700", "MAT 1600"]);
    expect(r.ignores).toEqual([]);
    expect(r.nbEvenements).toBe(33);
    expect(r.cours.reduce((somme, c) => somme + c.nbEvenements, 0)).toBe(33);
  });

  test("le titre est tiré du SUMMARY", () => {
    expect(cours(r, "MAT 1400").libelle).toBe("Calcul 1");
    expect(cours(r, "MAT 1500").libelle).toBe("Mathématiques discrètes");
    expect(cours(r, "STT 1700").libelle).toBe("Introduction à la statistique");
  });

  /**
   * LE CHIFFRE QUE LE BRIEF CROYAIT LIRE DANS LES VEVENT. MAT 1400 n'a que 8
   * VEVENT (deux jours de semaine × deux plages autour de la relâche, plus deux
   * examens), mais 39 séances datées. Compter les VEVENT aurait rendu « 8 », et
   * un cours suivi tout le trimestre aurait eu l'air aussi douteux qu'un cours
   * dont seul l'examen figure au fichier.
   */
  test("les séances sont comptées après dépliage des RRULE, pas en VEVENT", () => {
    const mat1400 = cours(r, "MAT 1400");
    expect(mat1400.nbEvenements).toBe(8);
    expect(mat1400.nbSeances).toBe(37);
    expect(mat1400.premiereSeance).toBe("2026-09-01");
    // La dernière date du cours est son examen final, pas sa dernière séance.
    expect(mat1400.derniereSeance).toBe("2026-12-17");
  });

  /**
   * 8 des 27 évènements de l'horaire réel sont des examens. En v1 il n'y a pas de
   * `CATEGORIES` : le discriminant est l'absence de `RRULE`, jamais les mots du
   * libellé — `Exam.label` est un champ libre chez le générateur.
   */
  test("les examens sont comptés à part des séances, sans CATEGORIES", () => {
    expect(cours(r, "MAT 1400").nbPonctuels).toBe(2);
    expect(cours(r, "STT 1700").nbPonctuels).toBe(3);
    expect(r.cours.reduce((somme, c) => somme + c.nbPonctuels, 0)).toBe(9);
  });

  test("le trimestre se déduit des dates et concorde avec le nom du calendrier", () => {
    expect(r.calendrier).toBe("UdeM — Automne 2026");
    expect(r.trimestreDeclare).toEqual({ saison: "Automne", annee: 2026 });
    for (const c of r.cours) {
      expect(c.trimestre, c.code).toEqual({ saison: "Automne", annee: 2026 });
      expect(c.remarques, c.code).toEqual([]);
    }
  });

  /** Une séance du 31 août : la borne du trimestre doit la ranger en automne. */
  test("le 31 août reste dans l'automne", () => {
    expect(cours(r, "MAT 1500").premiereSeance).toBe("2026-08-31");
    expect(cours(r, "MAT 1500").trimestre).toEqual({ saison: "Automne", annee: 2026 });
  });

  test("trimestre non terminé pendant le trimestre, terminé après", () => {
    const pendant = lireICS(lireFixture("horaire-a26-synchro02.ics"), {
      maintenant: PENDANT_A26,
    });
    expect(cours(pendant, "MAT 1400").trimestreTermine).toBe(false);
    expect(cours(r, "MAT 1400").trimestreTermine).toBe(true);
  });

  test("les SUMMARY servent de pièce justificative", () => {
    expect(cours(r, "MAT 1400").resumes).toEqual([
      "MAT 1400-A Calcul 1 (TH)",
      "MAT 1400-A102 Calcul 1 (TP)",
      "MAT 1400 — Examen intra",
      "MAT 1400 — Examen final",
    ]);
  });

  test("CRLF, LF et CR seul donnent le même résultat", () => {
    const brut = lireFixture("horaire-a26-synchro02.ics");
    const crlf = lireICS(avecFins(brut, "\r\n"), { maintenant: APRES });
    const lf = lireICS(avecFins(brut, "\n"), { maintenant: APRES });
    const cr = lireICS(avecFins(brut, "\r"), { maintenant: APRES });
    expect(lf).toEqual(crlf);
    expect(cr).toEqual(crlf);
  });

  test("un BOM UTF-8 en tête ne fait pas rejeter le fichier", () => {
    const avecBom = lireICS(`﻿${lireFixture("horaire-a26-synchro02.ics")}`, {
      maintenant: APRES,
    });
    expect(avecBom.estICS).toBe(true);
    expect(avecBom.cours).toHaveLength(4);
  });
});

describe("horaire du générateur actuel (titre dans la DESCRIPTION, VALARM, échéances)", () => {
  const r = lireICS(lireFixture("horaire-a26-v2.ics"), { maintenant: APRES });

  test("le titre vient de la DESCRIPTION, pas du VALARM qui répète le SUMMARY", () => {
    expect(cours(r, "MAT 1400").libelle).toBe("Calcul 1");
    expect(cours(r, "ACT 2025").libelle).toBe("Mathématiques actuarielles vie 1");
    expect(cours(r, "STT 1700").libelle).toBe("Introduction à la statistique");
  });

  test("les DESCRIPTION pliées à 75 octets sont recollées", () => {
    // « Source : StudiU » + « M » : l'échéance de MAT 1400 ne doit pas laisser
    // de « StudiU » derrière elle.
    expect(r.problemes).toEqual([]);
  });

  test("CATEGORIES:Cours / Examen / Échéance classe les évènements", () => {
    expect(cours(r, "MAT 1400").nbSeances).toBe(31);
    // L'examen intra et le quiz StudiUM.
    expect(cours(r, "MAT 1400").nbPonctuels).toBe(2);
    expect(cours(r, "ACT 2025").nbPonctuels).toBe(0);
  });

  /** Le cours dont seul l'examen figure : AUCUNE séance, aucun titre. C'est ce
   *  que `nbSeances` sert à signaler, et la raison pour laquelle l'import
   *  propose au lieu de cocher. */
  test("un cours dont seul l'examen figure est visiblement douteux", () => {
    const ift = cours(r, "IFT 1015");
    expect(ift.nbSeances).toBe(0);
    expect(ift.nbPonctuels).toBe(1);
    expect(ift.libelle).toBeNull();
    expect(ift.resumes).toEqual(["IFT1015 — Examen final"]);
    expect(ift.remarques).toEqual([
      "le fichier ne donne aucun titre, seulement le sigle et le type de séance.",
      "aucune séance de cours dans le fichier, seulement un évènement ponctuel : " +
        "un examen ou une échéance n'atteste même pas d'avoir suivi le cours.",
    ]);
  });

  test("les cours sont triés du plus crédible au plus douteux", () => {
    expect(r.cours.map((c) => c.nbSeances)).toEqual([...r.cours.map((c) => c.nbSeances)].sort((a, b) => b - a));
    expect(r.cours[r.cours.length - 1].code).toBe("IFT 1015");
  });

  test("une échéance sans sigle est écartée et montrée", () => {
    expect(r.ignores).toEqual([
      {
        rang: 11,
        resume: "Rendez-vous TGDE — changement de programme",
        debut: "20260918T140000 (America/Toronto)",
        raison:
          "aucun sigle de cours dans le résumé (examen hors cours, rendez-vous, évènement personnel).",
      },
    ]);
  });

  test("tous les évènements sont expliqués : aucun n'est perdu en route", () => {
    const comptes = r.cours.reduce((somme, c) => somme + c.nbEvenements, 0);
    expect(comptes + r.ignores.length).toBe(r.nbEvenements);
  });
});

describe("horaire d'une autre provenance", () => {
  const r = lireICS(lireFixture("horaire-a26-tiers.ics"), { maintenant: APRES });

  test("un sigle écrit « IFT-1015 » est normalisé", () => {
    expect(cours(r, "IFT 1015").libelle).toBe("Programmation 1");
  });

  test("le titre survit au volet et au groupe collés au SUMMARY", () => {
    expect(cours(r, "MAT 1400").libelle).toBe("Calcul II");
    expect(cours(r, "MAT 1600").libelle).toBe("Algèbre linéaire");
  });

  test("sans X-WR-CALNAME, le trimestre vient uniquement des dates", () => {
    expect(r.calendrier).toBeNull();
    expect(r.trimestreDeclare).toBeNull();
    expect(cours(r, "MAT 1000").trimestre).toEqual({ saison: "Automne", annee: 2026 });
  });

  test("un rendez-vous personnel est écarté", () => {
    expect(r.ignores.map((i) => i.resume)).toEqual(["Rendez-vous conseiller pédagogique"]);
  });
});

describe("cas tordus", () => {
  const r = lireICS(lireFixture("cas-tordus.ics"), { maintenant: APRES });

  /** LE PIÈGE CENTRAL : sans dépliage, ACT 2525 n'existe pas dans le résultat. */
  test("un SUMMARY plié au milieu du sigle, continuation par une espace", () => {
    const act = cours(r, "ACT 2525");
    expect(act.libelle).toBe("Atelier de préparation à l'examen professionnel de la SOA");
    expect(act.nbSeances).toBe(14);
    expect(act.premiereSeance).toBe("2027-01-12");
    expect(act.derniereSeance).toBe("2027-04-13");
  });

  test("même pliage, continuation par une tabulation", () => {
    expect(cours(r, "STT 3951").libelle).toBe(
      "Séminaire interdisciplinaire de modélisation du risque",
    );
  });

  /** Forme tolérée, pas observée : les horaires UdeM n'ont pas d'évènement
   *  « journée entière ». Sans RRULE ni CATEGORIES, l'évènement est classé
   *  ponctuel — et l'écran affiche donc « aucune séance », ce qui est prudent. */
  test("DTSTART;VALUE=DATE est lu, et classé ponctuel faute de RRULE", () => {
    expect(cours(r, "STT 3951").premiereSeance).toBe("2027-01-15");
    expect(cours(r, "STT 3951").nbSeances).toBe(0);
    expect(cours(r, "STT 3951").nbPonctuels).toBe(1);
  });

  /**
   * LE PIÈGE QUE LE REPLI SUR `DESCRIPTION` DÉCLENCHERAIT. Cet évènement a un
   * SUMMARY sans sigle (« Séance de rattrapage »), une DESCRIPTION qui cite
   * « MAT 1600 », et un UID qui porte « ECN2040 ». Chercher le sigle dans la
   * DESCRIPTION attribuerait la séance à MAT 1600 — un cours inventé. Le recours
   * est l'UID, et il est annoncé.
   */
  test("le sigle manquant se récupère dans l'UID, jamais dans la DESCRIPTION", () => {
    const ecn = cours(r, "ECN 2040");
    expect(ecn.nbSeances).toBe(2);
    expect(ecn.remarques).toEqual([
      'sigle tiré de l\'UID (« H27-ECN2040-A-TH-3-0900-20270217@synchro-calendrier ») : le résumé de l\'évènement n\'en portait aucun.',
    ]);
    // MAT 1600 n'existe QUE par son propre évènement, pas par cette note.
    expect(cours(r, "MAT 1600").nbEvenements).toBe(1);
    expect(cours(r, "MAT 1600").derniereSeance).toBe("2026-10-20");
  });

  test("CATEGORIES:Cours l'emporte sur l'absence de RRULE", () => {
    // L'évènement RDATE n'a pas de RRULE mais se déclare « Cours ».
    expect(cours(r, "ACT 3100").nbSeances).toBe(3);
    expect(cours(r, "ACT 3100").nbPonctuels).toBe(0);
  });

  test("un paramètre entre guillemets contenant un deux-points ne casse pas la ligne", () => {
    // L'évènement porte X-NOTE="heure: 9h00" ; la date, elle, est impossible.
    const mat = cours(r, "MAT 2050");
    expect(mat.libelle).toBe("Analyse numérique");
    expect(mat.remarques[0]).toContain("date de début illisible");
  });

  test("une date de calendrier impossible compte un évènement SANS date", () => {
    const mat = cours(r, "MAT 2050");
    expect(mat.nbSeances + mat.nbPonctuels).toBe(1);
    expect(mat.premiereSeance).toBeNull();
    expect(mat.derniereSeance).toBeNull();
    // Faute de date, on ne peut pas affirmer que le trimestre est fini.
    expect(mat.trimestreTermine).toBe(false);
    expect(mat.trimestre).toEqual({ saison: "Hiver", annee: 2027 });
    expect(mat.remarques).toContain(
      "trimestre repris du nom du calendrier (Hiver 2027), faute de date lisible.",
    );
  });

  /** Le VALARM du même évènement porte « IFT 1005-A — Théorie » en DESCRIPTION.
   *  À plat, c'est ce texte qui aurait fait office de titre. */
  test("la DESCRIPTION d'un VALARM n'usurpe pas le titre du cours", () => {
    expect(cours(r, "IFT 1005").libelle).toBe("Algorithmique et structures de données");
  });

  test("les EXDATE retirent des séances, et celle qui rate est signalée", () => {
    const ift = cours(r, "IFT 1005");
    expect(ift.nbSeances).toBe(13);
    expect(ift.remarques).toEqual(["1 date d'exclusion hors de la série (2027-03-02)."]);
  });

  test("un évènement à deux sigles compte pour les deux, et le dit", () => {
    for (const code of ["ACT 2121", "ACT 2151"]) {
      const c = cours(r, code);
      expect(c.nbSeances).toBe(5);
      expect(c.remarques.join(" ")).toContain("cite aussi");
    }
  });

  test("RDATE ajoute des séances", () => {
    const act = cours(r, "ACT 3100");
    expect(act.nbSeances).toBe(3);
    expect(act.derniereSeance).toBe("2027-03-10");
  });

  test("une récurrence non dépliée compte une séance et le dit", () => {
    const ecn = cours(r, "ECN 1000");
    expect(ecn.nbSeances).toBe(1);
    expect(ecn.remarques).toEqual([
      "récurrence « FREQ=MONTHLY » non dépliée : une seule séance comptée.",
    ]);
  });

  test("les dates tranchent contre le nom du calendrier, et l'écart est signalé", () => {
    const mat = cours(r, "MAT 1600");
    expect(mat.trimestre).toEqual({ saison: "Automne", annee: 2026 });
    expect(mat.remarques[0]).toBe(
      "le nom du calendrier annonce Hiver 2027, les dates donnent Automne 2026 : ce sont les dates qui tranchent.",
    );
  });

  test("les échappements TEXT sont défaits dans le SUMMARY comme dans la DESCRIPTION", () => {
    const act = cours(r, "ACT 1240");
    expect(act.resumes).toEqual(["ACT 1240-A Probabilités, actuariat (TH)"]);
    expect(act.libelle).toBe("Probabilités, actuariat");
  });

  test("une ligne qui n'est pas une propriété est comptée et signalée", () => {
    expect(r.problemes).toEqual(["1 ligne n'a pas la forme « NOM:valeur » et a été ignorée."]);
  });

  describe("ce qui est écarté est montré, avec la raison", () => {
    test("un évènement sans sigle", () => {
      const ignore = r.ignores.find((i) => i.resume === "Rendez-vous au centre étudiant");
      expect(ignore?.raison).toContain("aucun sigle de cours");
    });

    /**
     * L'INVARIANT, vrai avant comme après l'extension de `lib/codes.ts` : un
     * sigle suffixé ou à cinq chiffres est soit lu comme cours, soit NOMMÉ dans
     * `ignores`. Jamais avalé. Le test dit lequel des deux, d'après ce que
     * `extraireCodes()` sait faire maintenant.
     */
    test("un code suffixé et un code à cinq chiffres ne disparaissent jamais", () => {
      if (SIGLES_EXOTIQUES_LISIBLES) {
        expect(cours(r, "DRT 1151G").libelle).toBe("Droit des obligations");
        expect(cours(r, "PSY 40001").libelle).toBe("Stage en milieu clinique");
        return;
      }
      const suffixe = r.ignores.find((i) => i.resume?.startsWith("DRT"));
      expect(suffixe?.raison).toContain("« DRT 1151G »");
      expect(suffixe?.raison).toContain("normaliserCode()");
      const cinq = r.ignores.find((i) => i.resume?.startsWith("PSY"));
      expect(cinq?.raison).toContain("« PSY 40001 »");
    });

    test("un évènement sans SUMMARY", () => {
      const sansResume = r.ignores.find((i) => i.resume === null);
      expect(sansResume?.raison).toBe("évènement sans SUMMARY : aucun sigle à y lire.");
      expect(sansResume?.debut).toBe("20270211T100000 (America/Toronto)");
    });
  });

  test("aucun évènement ne s'évapore : cours + écartés = total du fichier", () => {
    const comptes = r.cours.reduce((somme, c) => somme + c.nbEvenements, 0);
    // Un évènement cité par deux sigles compte pour chacun : on retire le double.
    expect(comptes - 1 + r.ignores.length).toBe(r.nbEvenements);
  });
});

describe("squelette fourni par l'intégratrice (v1 et v2 dans le même fichier)", () => {
  const r = lireICS(lireFixture("horaire-squelette-v2.ics"), { maintenant: APRES });

  test("le doublon de relâche ne crée pas un deuxième cours", () => {
    const act = cours(r, "ACT 2250");
    expect(act.nbEvenements).toBe(3);
    expect(act.nbSeances).toBe(14);
    expect(act.nbPonctuels).toBe(1);
    expect(act.libelle).toBe("Mathématiques financières");
  });

  test("un évènement v1 et un évènement v2 se lisent dans le même fichier", () => {
    expect(cours(r, "ACT 2250").resumes).toContain("ACT2250-A — Théorie");
    expect(cours(r, "STT 1700").resumes).toEqual([
      "STT 1700-A Introduction à la statistique (TH)",
    ]);
    expect(cours(r, "STT 1700").libelle).toBe("Introduction à la statistique");
  });

  test("les LOCATION et DESCRIPTION pliées ne cassent pas la lecture", () => {
    expect(r.problemes).toEqual([]);
  });

  test("l'examen et l'échéance n'ajoutent pas de cours", () => {
    expect(cours(r, "ACT 2250").nbPonctuels).toBe(1);
    expect(r.ignores.map((i) => i.resume)).toContain("Rendez-vous TGDE");
  });

  /**
   * Le squelette mélange un UID `H26-` et un `X-WR-CALNAME` annonçant
   * Automne 2026, avec des dates de janvier. Les dates tranchent, et l'écart est
   * dit — le signaler, c'est ce qui a permis de repérer que l'EXDATE du squelette
   * (`20261005`, un lundi) ne tombe sur aucune occurrence de la série du mardi.
   */
  test("une séance datée d'un autre trimestre que le calendrier est signalée", () => {
    expect(cours(r, "STT 1700").trimestre).toEqual({ saison: "Hiver", annee: 2026 });
    expect(cours(r, "STT 1700").remarques).toEqual([
      "le nom du calendrier annonce Automne 2026, les dates donnent Hiver 2026 : ce sont les dates qui tranchent.",
    ]);
    expect(cours(r, "ACT 2250").remarques).toEqual([
      "1 date d'exclusion hors de la série (2026-10-05).",
    ]);
  });

  test("le compte de cours suit ce que lib/codes.ts sait lire, et rien ne se perd", () => {
    if (SIGLES_EXOTIQUES_LISIBLES) {
      expect(r.cours.map((c) => c.code).sort()).toEqual([
        "ACT 2250",
        "DRT 1151G",
        "PSY 40001",
        "STT 1700",
      ]);
      expect(r.ignores).toHaveLength(1);
    } else {
      expect(r.cours.map((c) => c.code).sort()).toEqual(["ACT 2250", "STT 1700"]);
      expect(r.ignores.map((i) => i.resume)).toEqual([
        "DRT1151G-A — Théorie",
        "PSY40001-A102 — Travaux pratiques",
        "Rendez-vous TGDE",
      ]);
    }
    const comptes = r.cours.reduce((somme, c) => somme + c.nbEvenements, 0);
    expect(comptes + r.ignores.length).toBe(r.nbEvenements);
  });

  test("le trimestre déclaré se lit aussi dans le préfixe des UID", () => {
    // X-WR-CALNAME donne déjà Automne 2026 ici ; le recours par UID est
    // éprouvé séparément.
    expect(r.trimestreDeclare).toEqual({ saison: "Automne", annee: 2026 });
    const sansCalname = lireICS(
      lireFixture("horaire-squelette-v2.ics").replace(/^X-WR-CALNAME:.*$/m, "X-WR-CALNAME:Horaire"),
      { maintenant: APRES },
    );
    expect(sansCalname.calendrier).toBe("Horaire");
    expect(sansCalname.trimestreDeclare).toEqual({ saison: "Automne", annee: 2026 });
  });
});

describe("le lecteur n'écrit jamais « fait »", () => {
  /**
   * Garde-fou sur la règle qui gouverne tout le reste : le résultat ne porte
   * aucun champ qui ressemblerait à une décision prise à la place de
   * l'étudiant. S'il en apparaissait un, ce test tomberait.
   */
  test("aucun champ du résultat ne prétend qu'un cours est réussi", () => {
    const r = lireICS(lireFixture("horaire-a26-v2.ics"), { maintenant: APRES });
    const texte = JSON.stringify(r.cours);
    expect(texte).not.toMatch(/"(fait|faits|reussi|reussite|valide|coche)"\s*:/i);
    for (const c of r.cours) {
      expect(Object.keys(c).sort()).toEqual([
        "code",
        "derniereSeance",
        "libelle",
        "nbEvenements",
        "nbPonctuels",
        "nbSeances",
        "premiereSeance",
        "remarques",
        "resumes",
        "trimestre",
        "trimestreTermine",
      ]);
    }
  });
});
