/**
 * Lecture des pages de structure, sur des EXTRAITS FIGÉS de vraies pages
 * (`__fixtures__/structure-*.html`). Aucun accès réseau.
 *
 * Les sept fixtures couvrent sept pièges DIFFÉRENTS, chacun rencontré sur une
 * vraie page de l'UdeM — pas sept exemplaires du même moule. Le commentaire de
 * chaque bloc `describe` dit lequel et ce qu'il casserait.
 *
 * Attention en lisant les attentes : une fixture ne garde qu'une partie des
 * segments de sa page (voir son entête). `orientation` et le nombre de phrases
 * d'exigences peuvent donc différer de ce que donne la page complète — c'est
 * voulu, et signalé là où ça compte.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { cleBloc } from "../../lib/codes";
import { parseStructure, parseTitreBloc, parseTitreSegment, typeDuNom } from "./structure";

const ISO = "2026-09-11T11:05:32.006Z";

function lire(slug: string) {
  const html = readFileSync(
    path.join(import.meta.dirname, "__fixtures__", `structure-${slug}.html`),
    "utf8",
  );
  const url = `https://admission.umontreal.ca/programmes/${slug}/structure-du-programme/`;
  return { ...parseStructure(html, slug, url, ISO), html, url };
}

// ---------------------------------------------------------------------------
// Parsing des titres, isolément
// ---------------------------------------------------------------------------

describe("parseTitreBloc — les deux côtés du préfixe de cheminement", () => {
  it("sépare l'id du nom, en écrasant le double espace de la page", () => {
    expect(parseTitreBloc("Bloc 75A  Actuariat, mathématiques financières et statistique")).toEqual({
      id: "75A",
      nom: "Actuariat, mathématiques financières et statistique",
    });
  });

  it("rend un nom vide quand la page n'en donne pas (blocs 01A et 75Z)", () => {
    expect(parseTitreBloc("Bloc 01A")).toEqual({ id: "01A", nom: "" });
  });

  it("« MM-Bloc 73A » : préfixe AVANT le mot Bloc (maîtrise en mathématiques)", () => {
    expect(parseTitreBloc("MM-Bloc 73A Cheminement avec mémoire")).toEqual({
      id: "MM-73A",
      nom: "Cheminement avec mémoire",
    });
    expect(parseTitreBloc("S-Bloc 73C Stage")).toEqual({ id: "S-73C", nom: "Stage" });
  });

  it("« Bloc 70A-MM » : préfixe APRÈS le numéro (maîtrise en physique)", () => {
    expect(parseTitreBloc("Bloc 70D-MM Mémoire")).toEqual({ id: "70D-MM", nom: "Mémoire" });
    expect(parseTitreBloc("Bloc 70D-TD Travail dirigé")).toEqual({
      id: "70D-TD",
      nom: "Travail dirigé",
    });
  });

  it("« Bloc 70C1A » : des chiffres APRÈS la lettre (DES en médecine vétérinaire)", () => {
    expect(parseTitreBloc("Bloc 70C1A")).toEqual({ id: "70C1A", nom: "" });
    expect(parseTitreBloc("Bloc 70C1C Stages")).toEqual({ id: "70C1C", nom: "Stages" });
  });

  it("« Bloc MM-70A » : préfixe APRÈS le mot Bloc (maîtrise en informatique)", () => {
    // Deux orthographes pour la même idée, sur deux pages du même cycle. Ne
    // supporter que la première coûtait neuf blocs, ignorés sans erreur.
    expect(parseTitreBloc("Bloc MM-70A Fondements en informatique")).toEqual({
      id: "MM-70A",
      nom: "Fondements en informatique",
    });
    expect(parseTitreBloc("Bloc TD-70B Élargissement des connaissances")).toEqual({
      id: "TD-70B",
      nom: "Élargissement des connaissances",
    });
  });

  it("refuse un titre qui n'est pas un bloc, au lieu d'en fabriquer un", () => {
    expect(parseTitreBloc("Liste des cours")).toBeNull();
    expect(parseTitreBloc("Bloc sans numéro")).toBeNull();
    // Deux préfixes à la fois : forme inconnue, on ne devine pas lequel compte.
    expect(parseTitreBloc("MM-Bloc ST-70A Quelque chose")).toBeNull();
  });
});

describe("parseTitreSegment", () => {
  it("lit un segment commun et un segment d'orientation (1er cycle)", () => {
    expect(parseTitreSegment("Segment 01 Commun aux sept orientations")).toEqual({
      numero: "01",
      libelle: "Commun aux sept orientations",
      orientation: null,
    });
    expect(parseTitreSegment("Segment 75 Propre à l'orientation Actuariat")).toEqual({
      numero: "75",
      libelle: "Propre à l'orientation Actuariat",
      orientation: "Actuariat",
    });
  });

  it("lit « Propre à l'option X », forme des cycles supérieurs, et le tiret", () => {
    expect(parseTitreSegment("Segment 73 - Propre à l'option Actuariat")).toEqual({
      numero: "73",
      libelle: "Propre à l'option Actuariat",
      orientation: "Actuariat",
    });
  });

  it("lit un segment sans libellé (Accès - FAC)", () => {
    expect(parseTitreSegment("Segment 70")).toEqual({ numero: "70", libelle: "", orientation: null });
  });

  it("lit un identifiant de segment NON NUMÉRIQUE (mineure arts et sciences)", () => {
    // Avec `Segment\s+(\d+)`, ce programme perdait son unique segment et
    // passait pour un programme sans structure.
    expect(parseTitreSegment("Segment Z Cours au choix")).toEqual({
      numero: "Z",
      libelle: "Cours au choix",
      orientation: null,
    });
  });

  it("refuse ce qui n'est pas un entête de segment", () => {
    expect(parseTitreSegment("Langue/language")).toBeNull();
    expect(parseTitreSegment("Liste des cours")).toBeNull();
  });
});

describe("typeDuNom", () => {
  it("coupe au premier mot de liaison", () => {
    expect(typeDuNom("Maîtrise en mathématiques")).toBe("Maîtrise");
    expect(typeDuNom("DES en anesthésiologie")).toBe("DES");
    expect(typeDuNom("Stage postdoctoral en informatique")).toBe("Stage postdoctoral");
    expect(typeDuNom("Microprogramme de 2e cycle en bioéthique")).toBe("Microprogramme");
    expect(typeDuNom("Accès - FAC")).toBe("Accès");
  });

  it("garde deux mots au plus quand il n'y a aucun mot de liaison", () => {
    expect(typeDuNom("Mineure arts et sciences")).toBe("Mineure");
    expect(typeDuNom("Année préparatoire")).toBe("Année préparatoire");
  });

  it("rend null sur un nom vide plutôt qu'une chaîne vide", () => {
    expect(typeDuNom("")).toBeNull();
    expect(typeDuNom("   ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bacc. en mathématiques : le programme de référence du projet
// ---------------------------------------------------------------------------

describe("bacc. en mathématiques — sept orientations sur une page", () => {
  const { programme, structureLue, journal } = lire("baccalaureat-en-mathematiques");

  it("lit l'entête : nom, faculté, cycle, type et total", () => {
    expect(programme.nom).toBe("Baccalauréat en mathématiques");
    expect(programme.faculte).toBe("Faculté des arts et des sciences");
    expect(programme.cycle).toBe("1er cycle");
    expect(programme.typeProgramme).toBe("Baccalauréat");
    expect(programme.creditsTotal).toBe(90);
    expect(structureLue).toBe(true);
  });

  it("garde TOUS les segments de la page, sans filtrer par orientation", () => {
    // La v1 extrayait un programme par orientation. La v2 écrit un fichier par
    // slug : les orientations sont des segments, et c'est `Bloc.segment` qui
    // sert à les regrouper. (Cette fixture ne garde que 01, 75 et 76.)
    expect(programme.segments).toEqual(["01", "75", "76"]);
    expect(programme.orientation).toBeNull();
  });

  it("`segment` est LU sur l'entête, pas déduit de l'id du bloc", () => {
    for (const bloc of programme.blocs) {
      expect(programme.segments).toContain(bloc.segment);
      expect(bloc.cle).toBe(cleBloc(bloc.segment, bloc.id, bloc.nom));
    }
  });

  it("lit les 7 codes du bloc 01A, normalisés et dans l'ordre de la page", () => {
    // Liste vérifiée sur la page. MAT 2717 EST dans le tronc commun et
    // ACT 1240 n'y est pas : c'est 75A qui ouvre sur ACT 1240.
    expect(programme.blocs.find((b) => b.id === "01A")?.cours).toEqual([
      "MAT 1000",
      "MAT 1400",
      "MAT 1500",
      "MAT 1600",
      "MAT 1720",
      "MAT 2717",
      "STT 1700",
    ]);
  });

  it("garde la règle VERBATIM, point final compris, et ses bornes", () => {
    const b75c = programme.blocs.find((b) => b.id === "75C");
    expect(b75c?.regleBrut).toBe("Option - Minimum 12 crédits, maximum 27 crédits.");
    expect(b75c?.regle).toEqual({ type: "option", bornes: { min: 12, max: 27 } });
    expect(b75c?.segment).toBe("75");
    expect(b75c?.cle).toBe(cleBloc("75", "75C", b75c?.nom ?? ""));
  });

  it("« Option - Maximum 13 crédits. » devient {min:0, max:13}", () => {
    // `Intervalle` n'accepte pas de null. 0 est la lecture littérale de la
    // page — on peut n'en prendre aucun — et `regleBrut` garde le verbatim.
    expect(programme.blocs.find((b) => b.id === "75E")?.regle).toEqual({
      type: "option",
      bornes: { min: 0, max: 13 },
    });
  });

  it("laisse le bloc « Choix » sans aucun cours", () => {
    expect(programme.blocs.find((b) => b.id === "75Z")?.cours).toEqual([]);
  });

  it("journalise les deux blocs auxquels la page ne donne pas de nom", () => {
    const sansNom = programme.blocs.filter((b) => b.nom === "").map((b) => b.cle);
    expect(sansNom).toEqual(["01/01A", "75/75Z"]);
    for (const cle of sansNom) {
      expect(
        journal.entrees.some((e) => e.sujet.endsWith(`bloc ${cle}`) && e.genre === "manque"),
      ).toBe(true);
    }
  });

  it("déclare les SEPT orientations, chacune avec SA répartition", () => {
    // Le champ `exigences` n'a qu'un emplacement, mais la page énonce sept
    // répartitions : en désigner une serait un choix arbitraire déguisé en
    // donnée. Chaque orientation porte donc la sienne, et `exigences` reste null.
    expect(programme.exigences).toBeNull();
    expect(programme.orientations.map((o) => o.nom)).toEqual([
      "Actuariat",
      "Actuariat COOP",
      "Mathématiques pures et appliquées",
      "Statistique",
      "Statistique COOP",
      "Mathématiques financières",
      "Sciences mathématiques",
    ]);
  });

  it("l'actuariat porte enfin son 54 / 33 / 3, typé et non plus en prose", () => {
    const actuariat = programme.orientations.find((o) => o.nom === "Actuariat");
    expect(actuariat?.segments).toEqual(["01", "75"]);
    expect(actuariat?.exigences?.obligatoire).toEqual({ min: 54, max: 54 });
    expect(actuariat?.exigences?.option).toEqual({ min: 33, max: 33 });
    expect(actuariat?.exigences?.choix).toEqual({ min: 3, max: 3 });
    expect(actuariat?.exigences?.brut).toContain("54 crédits obligatoires, 33 crédits à option");
  });

  it("les deux COOP, qui n'énoncent AUCUN crédit au choix, sont bien lues", () => {
    // C'est le cas qu'un `\b` devant « à » faisait disparaître : « 60 crédits
    // obligatoires et 30 crédits à option », sans « au choix ». `choix: null`
    // dit « la page n'en parle pas » ; {min:0,max:0} affirmerait « aucun ».
    const coop = programme.orientations.find((o) => o.nom === "Actuariat COOP");
    expect(coop?.segments).toEqual(["01", "76"]);
    expect(coop?.exigences?.obligatoire).toEqual({ min: 60, max: 60 });
    expect(coop?.exigences?.option).toEqual({ min: 30, max: 30 });
    expect(coop?.exigences?.choix).toBeNull();
    const statCoop = programme.orientations.find((o) => o.nom === "Statistique COOP");
    expect(statCoop?.exigences?.option).toEqual({ min: 24, max: 24 });
  });

  it("lit « 27 à option » et « 61 à option », écrits sans le mot « crédits »", () => {
    expect(
      programme.orientations.find((o) => o.nom === "Statistique")?.exigences?.option,
    ).toEqual({ min: 27, max: 27 });
    expect(
      programme.orientations.find((o) => o.nom === "Sciences mathématiques")?.exigences?.option,
    ).toEqual({ min: 61, max: 61 });
  });

  it("`orientation` reste null sur un programme non projeté", () => {
    // Il n'est renseigné que par `projeterOrientation()`. Le renseigner ici
    // laisserait croire qu'un des sept parcours est « celui du programme ».
    expect(programme.orientation).toBeNull();
  });

  it("garde aussi les totaux PAR SEGMENT dans `notes`, verbatim", () => {
    // Six phrases de plus que les sept puces : elles portent les totaux du
    // segment et non de l'orientation (28 obligatoires au segment 75, contre
    // 54 pour l'orientation, qui inclut le tronc commun).
    const notes = programme.notes.join("\n");
    expect(notes).toContain("Les crédits de l'Orientation sont répartis");
    expect(notes).toContain("L'étudiant inscrit dans une orientation COOP");
    // Et le journal dit combien de parcours ont été déclarés.
    const avis = journal.entrees.find((e) => e.message.includes("parcours déclarés"));
    expect(avis?.genre).toBe("info");
    expect(avis?.message).toMatch(/^7 parcours déclarés/);
  });

  it("n'a aucune règle de bloc `inconnu` : les orientations sont toutes lisibles", () => {
    expect(programme.blocs.filter((b) => b.regle.type === "inconnu")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Les six autres pièges
// ---------------------------------------------------------------------------

describe("maîtrise en mathématiques — deux blocs « 73A » dans le même segment", () => {
  // Le piège central de la v2 : un extracteur ancré sur « Bloc » a fusionné
  // 58 cours dans le mauvais bloc pendant la validation, sans lever d'erreur.
  const { programme } = lire("maitrise-en-mathematiques");

  it("distingue MM-73A de S-73A par leur clé, et les garde tous les deux", () => {
    const mm = programme.blocs.find((b) => b.id === "MM-73A");
    const s = programme.blocs.find((b) => b.id === "S-73A");
    expect(mm?.id).toBe("MM-73A");
    expect(s?.id).toBe("S-73A");
    expect(mm?.segment).toBe("73");
    expect(s?.segment).toBe("73");
    // Deux blocs DIFFÉRENTS : leurs règles ne sont pas les mêmes.
    expect(mm?.regle).toEqual({ type: "option", bornes: { min: 10, max: 16 } });
    expect(s?.regle).toEqual({ type: "option", bornes: { min: 15, max: 24 } });
  });

  it("toutes les clés de blocs sont uniques, alors que deux ids finissent par 73A", () => {
    const cles = programme.blocs.map((b) => b.cle);
    expect(new Set(cles).size).toBe(cles.length);
    expect(programme.blocs.filter((b) => b.id.endsWith("73A"))).toHaveLength(2);
  });

  it("lit « Option - minimum 15 crédits, maximum 24 crédits. » en minuscules", () => {
    expect(programme.blocs.find((b) => b.id === "S-73A")?.regleBrut).toBe(
      "Option - minimum 15 crédits, maximum 24 crédits.",
    );
  });

  it("garde la prose de bloc dans `Bloc.notes` au lieu de la perdre", () => {
    // « … et/ou un maximum de 6 crédits de cours de 1er cycle de sigle ACT, MAT
    // ou STT … avec l'approbation du responsable de programme. » : un plafond
    // imbriqué que `RegleBloc` ne peut pas porter. Sans `notes`, il disparaît.
    const b = programme.blocs.find((x) => x.id === "S-73B");
    expect(b?.notes.join(" ")).toContain("approbation du responsable de programme");
  });

  it("met la prose de SEGMENT dans `Programme.notes`, préfixée par son segment", () => {
    const note = programme.notes.find((n) => n.includes("cheminement avec stage (S)"));
    expect(note).toMatch(/^Segment 73 /);
    expect(note).toContain("21 crédits obligatoires attribués à un stage");
  });

  it("aplatit les CHEMINEMENTS en orientations, chacun avec sa répartition", () => {
    // Un cheminement mémoire et un cheminement stage ont des répartitions
    // différentes : ce sont deux parcours au sens où l'étudiant en choisit un.
    // Les aplatir évite un troisième niveau de modèle qui se propagerait dans
    // le sélecteur, la clé de parcours, la projection et trois chantiers de
    // tests sans rien exprimer de neuf.
    const noms = programme.orientations.map((o) => o.nom);
    expect(noms).toContain("Actuariat — cheminement avec mémoire (MM)");
    expect(noms).toContain("Actuariat — cheminement avec stage (S)");
    const memoire = programme.orientations.find((o) => o.nom.includes("mémoire"));
    const stage = programme.orientations.find((o) => o.nom.includes("stage"));
    expect(memoire?.exigences?.obligatoire).toEqual({ min: 29, max: 29 });
    expect(memoire?.exigences?.option).toEqual({ min: 10, max: 16 });
    expect(memoire?.exigences?.choix).toEqual({ min: 0, max: 6 });
    expect(stage?.exigences?.obligatoire).toEqual({ min: 21, max: 21 });
    expect(stage?.exigences?.option).toEqual({ min: 15, max: 24 });
    expect(stage?.exigences?.choix).toEqual({ min: 0, max: 9 });
    // Mêmes segments que l'orientation parente : le cheminement ne change pas
    // quels blocs sont candidats, seulement combien de crédits y sont exigés.
    expect(memoire?.segments).toEqual(stage?.segments);
  });

  it("mémoire et stage sont des cours ordinaires, dans des blocs à 29 et 21 crédits", () => {
    expect(programme.blocs.find((b) => b.id === "MM-73C")?.cours).toEqual(["MAT 6916"]);
    expect(programme.blocs.find((b) => b.id === "S-73C")?.cours).toEqual(["MAT 6908"]);
  });
});

describe("maîtrise en informatique — « Bloc MM-70A », préfixe de l'autre côté", () => {
  const { programme, journal } = lire("maitrise-en-informatique");

  it("aplatit les trois cheminements que la page n'appelle jamais « cheminement »", () => {
    // Cette page écrit « Les crédits de l'option avec mémoire (MM), sont
    // répartis… » : la même idée que la maîtrise en mathématiques, sans le
    // mot-clé. Ancrer la lecture dessus aurait raté les trois.
    const noms = programme.orientations.map((o) => o.nom);
    expect(noms).toContain("Générale — cheminement avec mémoire (MM)");
    expect(noms).toContain("Générale — cheminement avec stage (ST)");
    expect(noms).toContain("Générale — cheminement avec travaux dirigés (TD)");
    expect(
      programme.orientations.find((o) => o.nom.includes("travaux dirigés"))?.exigences?.obligatoire,
    ).toEqual({ min: 22, max: 22 });
  });

  it("retient les blocs préfixés au lieu de les ignorer", () => {
    const ids = programme.blocs.map((b) => b.id);
    expect(ids).toContain("MM-70A");
    expect(ids).toContain("ST-70A");
    expect(ids).toContain("TD-70A");
  });

  it("ne journalise aucun « titre de bloc illisible » sur ce segment", () => {
    // Neuf de ces entrées, c'était l'état du premier jet : les blocs étaient
    // signalés, mais perdus quand même.
    expect(journal.entrees.filter((e) => e.message.includes("titre de bloc illisible"))).toEqual([]);
  });
});

describe("doctorat en pathologie — la règle n'est PAS dans le <small>", () => {
  // Second gabarit de page, trouvé après la passe complète : le `<small>` porte
  // un LIBELLÉ de passerelle et la vraie règle est la première ligne de
  // `div.bloc-notes`. Trente blocs avaient ainsi une règle parfaitement lisible
  // classée « inconnu » parce qu'on la cherchait au mauvais endroit.
  const { programme } = lire("doctorat-en-pathologie-et-biologie-cellulaire");

  it("lit la règle dans `bloc-notes` quand le <small> n'en porte pas", () => {
    const b = programme.blocs.find((x) => x.id.startsWith("70A — Accès direct"));
    expect(b?.regle).toEqual({ type: "obligatoire", bornes: { min: 2, max: 2 } });
    expect(b?.regleBrut).toBe("Obligatoire - 2 crédits.");
  });

  it("détache la règle de la phrase qui la SUIT dans le même nœud de texte", () => {
    // « Obligatoire - 2 crédits. Les cours PBC 60511 et PBC 60512 sont
    // équivalents au cours PBC 6051. » : le saut de ligne de la page disparaît
    // à la normalisation des espaces, et la note entière ne parse pas.
    const b = programme.blocs.find((x) => x.id.startsWith("70A — Accès direct"));
    expect(b?.notes.some((n) => n.startsWith("Les cours PBC 60511"))).toBe(true);
    expect(b?.notes.some((n) => n.includes("Obligatoire - 2 crédits"))).toBe(false);
  });

  it("le libellé de passerelle entre dans l'IDENTITÉ, sinon deux blocs collisionnent", () => {
    // La page répète « Bloc 70A » une fois par passerelle, dans le même segment.
    // Sans le libellé, deux blocs aux règles différentes partagent une clé et
    // l'audit les mélange — le même défaut que `MM-Bloc 73A` / `S-Bloc 73A`.
    const cles = programme.blocs.map((b) => b.cle);
    expect(new Set(cles).size).toBe(cles.length);
    // On cherche par ID, pas par clé littérale : la clé porte aussi le NOM du
    // bloc depuis `cleBloc(segment, id, nom)`, et épingler sa chaîne exacte
    // ferait retomber ce test à chaque évolution de la FORME de la clé — alors
    // que ce qu'il doit prouver est une PROPRIÉTÉ : ces deux blocs restent
    // discernables. L'id, lui, porte le qualificatif et ne dépend pas du nom.
    const direct = programme.blocs.find((b) => b.id.startsWith("70A — Accès direct"));
    const msc = programme.blocs.find((b) => b.id.startsWith("70A — Accès de la M. Sc."));
    expect(direct, "le bloc « Accès direct » doit exister").toBeDefined();
    expect(msc, "le bloc « Accès de la M. Sc. » doit exister").toBeDefined();
    expect(direct?.cle).not.toBe(msc?.cle);
    expect(direct?.segment).toBe(msc?.segment);
    // Deux blocs DIFFÉRENTS : leurs règles ne sont pas les mêmes.
    expect(direct?.regle).toEqual({ type: "obligatoire", bornes: { min: 2, max: 2 } });
    expect(msc?.regle).toEqual({ type: "option", bornes: { min: 3, max: 3 } });
    // Et le libellé reste lisible en note, pas seulement enfoui dans la clé.
    expect(direct?.notes[0]).toBe("Accès direct du B. Sc. au Ph. D.");
  });
});

describe("identifiants de blocs qui faisaient collisionner des clés", () => {
  it("maîtrise en physique : « Bloc 70A-MM », préfixe APRÈS le numéro", () => {
    // Troisième position pour la même idée, après « MM-Bloc 73A » (avant le mot)
    // et « Bloc MM-70A » (après le mot). Ignorée, six clés collisionnaient.
    const { programme } = lire("maitrise-en-physique");
    const ids = programme.blocs.map((b) => b.id);
    expect(ids).toContain("70A-MM");
    expect(ids).toContain("70A-ST");
    const cles = programme.blocs.map((b) => b.cle);
    expect(new Set(cles).size).toBe(cles.length);
    // Deux cheminements, deux règles distinctes.
    expect(programme.blocs.find((b) => b.id === "70A-MM")?.regle).toEqual({
      type: "option",
      bornes: { min: 3, max: 9 },
    });
    expect(programme.blocs.find((b) => b.id === "70A-ST")?.regle).toEqual({
      type: "option",
      bornes: { min: 15, max: 21 },
    });
  });

  it("DES en médecine vétérinaire : « Bloc 70C1A », des CHIFFRES après la lettre", () => {
    // S'arrêter à la première lettre donnait « 70C » pour dix blocs du même
    // segment : dix clés identiques, et un audit qui les mélange.
    const { programme } = lire("des-en-medecine-veterinaire-2");
    const ids = programme.blocs.map((b) => b.id);
    expect(ids).toContain("70C1A");
    expect(ids).toContain("70C2A");
    const cles = programme.blocs.map((b) => b.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe("bacc. en sociologie — une règle par cheminement, un seul emplacement", () => {
  const { programme, journal } = lire("baccalaureat-en-sociologie");

  it("lit la règle du <small> et garde son préfixe de cheminement en note", () => {
    // « Cheminement régulier : option - Maximum 9 crédits. » dans le <small>, et
    // « Cheminement international : option - 3 crédits. » dans bloc-notes. Le
    // préfixe dit à QUI la règle s'applique : le jeter ferait passer la règle
    // d'un cheminement pour celle du bloc entier.
    const b = programme.blocs.find((x) => x.id === "01E");
    expect(b?.regle).toEqual({ type: "option", bornes: { min: 0, max: 9 } });
    expect(b?.regleBrut).toBe("Cheminement régulier : option - Maximum 9 crédits.");
    expect(b?.notes).toContain("Cheminement régulier");
    expect(b?.notes.some((n) => n.includes("Cheminement international"))).toBe(true);
  });

  it("journalise que `Bloc.regle` ne peut pas porter l'autre cheminement", () => {
    expect(
      journal.entrees.some(
        (e) => e.genre === "inattendu" && e.message.includes("ne vaut que pour « Cheminement régulier »"),
      ),
    ).toBe(true);
  });
});

describe("mineure arts et sciences — « Segment Z »", () => {
  const { programme, structureLue } = lire("mineure-arts-et-sciences");

  it("retient le segment à identifiant de lettre et son bloc", () => {
    expect(structureLue).toBe(true);
    expect(programme.segments).toEqual(["Z"]);
    expect(programme.blocs.map((b) => b.cle)).toEqual(["Z/71Z"]);
    expect(programme.blocs[0].regle).toEqual({ type: "choix", bornes: { min: 30, max: 30 } });
  });

  it("un bloc « Choix » sans cours n'est PAS signalé comme suspect", () => {
    // Vide est la norme pour un bloc au choix ; c'est un bloc à OPTION vide qui
    // mérite un signalement.
    expect(programme.blocs[0].cours).toEqual([]);
  });
});

describe("Accès - FAC — « Maximum » capital au milieu, total en « maximum de »", () => {
  const { programme, journal } = lire("acces-fac");

  it("lit « Option - Minimum 3 crédits, Maximum 15 crédits. »", () => {
    expect(programme.blocs.find((b) => b.id === "70B")?.regle).toEqual({
      type: "option",
      bornes: { min: 3, max: 15 },
    });
  });

  it("lit « comporte un maximum de 24 crédits » et journalise la nuance", () => {
    expect(programme.creditsTotal).toBe(24);
    expect(
      journal.entrees.some(
        (e) => e.genre === "info" && e.message.includes("comporte un maximum de 24 crédits"),
      ),
    ).toBe(true);
  });
});

describe("les trois totaux par type sont couplés par la somme", () => {
  // Le droit écrit 68 obligatoires + « de 30 à 33 à option » + « maximum 3 au
  // choix » pour 101 crédits : être dans chacun des trois ne suffit pas, puisque
  // 68 + 30 + 0 = 98 les respecte tous et ne diplôme pas. Le scraper ne corrige
  // rien, il vérifie que les quatre nombres sont compatibles et le dit sinon.
  const basePsycho = lire("baccalaureat-en-psychologie-campus-montreal");

  it("ne signale rien quand la somme est possible (psycho : 45 + 39-42 + 3-6 = 87-93 ∋ 90)", () => {
    expect(basePsycho.programme.creditsTotal).toBe(90);
    expect(
      basePsycho.journal.entrees.some((e) => e.message.includes("somme incohérente")),
    ).toBe(false);
  });

  it("signale une somme impossible au lieu de la propager jusqu'au verdict", () => {
    const html =
      '<div class="presentation-content structure-description"><p>Le programme comporte 120 crédits. ' +
      "Les crédits sont répartis de la façon suivante : 45 crédits obligatoires, de 30 à 33 crédits à option " +
      "et un maximum de 3 crédits au choix.</p></div>";
    const { journal } = parseStructure(html, "essai", "u", ISO);
    const avis = journal.entrees.find((e) => e.message.includes("somme incohérente"));
    expect(avis?.genre).toBe("inattendu");
    expect(avis?.message).toContain("de 75 à 81 crédits");
    expect(avis?.message).toContain("annonce 120");
  });

  it("avec un type manquant, signale au moins un minimum qui dépasse le total", () => {
    // Actuariat COOP n'énonce aucun crédit au choix : on ne peut contrôler que
    // la borne basse, et c'est mieux que de ne rien contrôler.
    const html =
      '<div class="presentation-content structure-description"><p>Le programme comporte 60 crédits. ' +
      "Il est offert avec 60 crédits obligatoires et 30 crédits à option.</p></div>";
    const { journal } = parseStructure(html, "essai", "u", ISO);
    expect(journal.entrees.some((e) => e.message.includes("somme impossible"))).toBe(true);
  });
});

describe("bacc. en psychologie — une phrase coupée entre deux <p>", () => {
  const { programme } = lire("baccalaureat-en-psychologie-campus-montreal");

  it("recolle la phrase et en tire les trois totaux", () => {
    // La page écrit « …de 39 à 42 crédits</p><p>à option et 3 à 6 crédits au
    // choix. ». Lue paragraphe par paragraphe, elle donnait un `brut` tronqué à
    // « à option et 3 à 6 crédits au choix. », obligatoire: null, option: null —
    // une donnée FAUSSE, pas une absence.
    expect(programme.exigences?.brut).toContain("45 crédits obligatoires");
    expect(programme.exigences?.obligatoire).toEqual({ min: 45, max: 45 });
    expect(programme.exigences?.option).toEqual({ min: 39, max: 42 });
    expect(programme.exigences?.choix).toEqual({ min: 3, max: 6 });
  });

  it("lit « Choix - Minimum 3 crédits, maximum 6 crédits. » (bloc 71Z)", () => {
    expect(programme.blocs.find((b) => b.id === "71Z")?.regle).toEqual({
      type: "choix",
      bornes: { min: 3, max: 6 },
    });
  });

  it("lit les codes à CINQ chiffres du bloc 71V", () => {
    expect(programme.blocs.find((b) => b.id === "71V")?.cours).toContain("PSY 40001");
  });
});

describe("stage postdoctoral — 200 OK, aucun segment", () => {
  const { programme, structureLue, journal } = lire("stage-postdoctoral-en-informatique");

  it("dit `structureLue: false` sans rien inventer, et garde l'entête lisible", () => {
    // C'est le cas dangereux : la page répond 200, donc aucun statut HTTP ne
    // signale l'absence de structure. `acces-fac` et `annee-preparatoire`, que
    // le brief donnait en exemple, ont au contraire une vraie structure.
    expect(structureLue).toBe(false);
    expect(programme.blocs).toEqual([]);
    expect(programme.segments).toEqual([]);
    expect(programme.nom).toBe("Stage postdoctoral en informatique");
    expect(programme.faculte).toBe("Études supérieures et postdoctorales");
    expect(programme.creditsTotal).toBeNull();
    expect(programme.exigences).toBeNull();
  });

  it("journalise l'absence de structure plutôt que de la taire", () => {
    expect(journal.entrees.some((e) => e.message.includes("aucun div.programme-segment"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Robustesse
// ---------------------------------------------------------------------------

describe("indépendance aux fins de ligne", () => {
  // `core.autocrlf=true` dans ce dépôt : le prochain clone livrera ces fixtures
  // en CRLF. Un parseur sensible au \r rendrait des titres et des règles de
  // crédits avec un retour chariot collé, sans rien faire échouer.
  for (const slug of [
    "baccalaureat-en-mathematiques",
    "maitrise-en-mathematiques",
    "maitrise-en-informatique",
    "acces-fac",
    "baccalaureat-en-psychologie-campus-montreal",
  ]) {
    it(`${slug} : résultat identique en CRLF`, () => {
      const { html, url } = lire(slug);
      const a = parseStructure(html, slug, url, ISO);
      const b = parseStructure(html.replace(/\r?\n/g, "\r\n"), slug, url, ISO);
      expect(b.programme).toEqual(a.programme);
      expect(b.structureLue).toBe(a.structureLue);
      expect(b.journal.entrees).toEqual(a.journal.entrees);
    });
  }
});

describe("page qui n'est pas celle attendue", () => {
  it("ne fabrique ni nom, ni crédits, ni blocs, et le dit", () => {
    const { programme, structureLue, journal } = parseStructure(
      "<html><body><p>Page de maintenance</p></body></html>",
      "essai",
      "https://admission.umontreal.ca/programmes/essai/structure-du-programme/",
      ISO,
    );
    expect(structureLue).toBe(false);
    expect(programme.blocs).toEqual([]);
    expect(programme.nom).toBe("");
    expect(programme.creditsTotal).toBeNull();
    expect(programme.exigences).toBeNull();
    expect(programme.typeProgramme).toBeNull();
    expect(journal.entrees.filter((e) => e.genre === "manque").length).toBeGreaterThanOrEqual(5);
  });

  it("un bloc à la règle illisible entre quand même, en `inconnu`", () => {
    // En v1 il était IGNORÉ : un bloc disparu ne laisse aucune trace à l'écran,
    // un bloc non auditable si.
    const html =
      '<div class="programme-segment"><h3>Segment 99 Essai</h3>' +
      '<section class="bloc"><div class="bloc-titre"><h4><span>Bloc 99A Essai</span></h4>' +
      "<small>Obligatoire - tous les cours du département</small></div></section></div>";
    const { programme, journal } = parseStructure(html, "essai", "u", ISO);
    expect(programme.blocs).toHaveLength(1);
    expect(programme.blocs[0].regle).toEqual({
      type: "inconnu",
      brut: "Obligatoire - tous les cours du département",
    });
    expect(programme.blocs[0].regleBrut).toBe("Obligatoire - tous les cours du département");
    expect(journal.entrees.some((e) => e.genre === "inattendu")).toBe(true);
  });

  it("un bloc sans <small> garde sa place, avec regle inconnu et regleBrut vide", () => {
    const html =
      '<div class="programme-segment"><h3>Segment 99 Essai</h3>' +
      '<section class="bloc"><div class="bloc-titre"><h4><span>Bloc 99A</span></h4></div></section></div>';
    const { programme, journal } = parseStructure(html, "essai", "u", ISO);
    expect(programme.blocs[0].regle.type).toBe("inconnu");
    expect(programme.blocs[0].regleBrut).toBe("");
    expect(journal.entrees.some((e) => e.message.includes("<small>) absente"))).toBe(true);
  });

  it("un bloc OBLIGATOIRE ou à OPTION sans aucun code est signalé", () => {
    // Bacc. en musique, bloc 02E « Cours de langue » / « Option - Maximum 6
    // crédits. » : zéro code, seulement le renvoi au Centre de langues.
    // Indistinguable d'un scrape raté sans ce signalement — et c'est la seule
    // façon de tenir l'invariant des tests de couture (« un bloc à liste vide
    // n'est qu'un bloc au choix ») sans le contredire en silence.
    for (const regle of ["Option - Maximum 6 crédits.", "Obligatoire - 6 crédits."]) {
      const html =
        '<div class="programme-segment"><h3>Segment 02 Essai</h3>' +
        '<section class="bloc"><div class="bloc-titre"><h4><span>Bloc 02E Cours de langue</span></h4>' +
        `<small>${regle}</small></div></section></div>`;
      const { journal } = parseStructure(html, "essai", "u", ISO);
      expect(
        journal.entrees.some((e) => e.message.includes("sans aucun code de cours")),
        regle,
      ).toBe(true);
    }
  });

  it("un bloc au CHOIX sans aucun code n'est pas signalé : c'est la norme", () => {
    const html =
      '<div class="programme-segment"><h3>Segment 75 Essai</h3>' +
      '<section class="bloc"><div class="bloc-titre"><h4><span>Bloc 75Z</span></h4>' +
      "<small>Choix - 3 crédits.</small></div></section></div>";
    const { journal } = parseStructure(html, "essai", "u", ISO);
    expect(journal.entrees.some((e) => e.message.includes("sans aucun code de cours"))).toBe(false);
  });
});

describe("typeDuNom — vocabulaire fermé", () => {
  it("essaie le PLUS LONG d'abord : DESS n'est pas un DES", () => {
    // Dans l'autre ordre, « DESS en droit » devient un DES et 78 fiches
    // changent de catégorie sans qu'aucun test ne s'en plaigne.
    expect(typeDuNom("DESS en droit des affaires")).toBe("DESS");
    expect(typeDuNom("DES en anesthésiologie")).toBe("DES");
    expect(typeDuNom("Diplôme complémentaire en pharmacothérapie")).toBe("Diplôme complémentaire");
    expect(typeDuNom("Diplôme d'études supérieures")).toBe("Diplôme");
  });

  it("replie les orthographes : points, casse, accents, pluriel", () => {
    // Les doublons mesurés dans l'index : D.E.S. 2 contre DES 179,
    // stage postdoctoral 1 contre Stage postdoctoral 129, Baccalauréats 1
    // contre Baccalauréat 208. Une facette bâtie là-dessus séparait des
    // fiches identiques.
    expect(typeDuNom("D.E.S. en chirurgie générale")).toBe("DES");
    expect(typeDuNom("D.E.S.S. en administration")).toBe("DESS");
    expect(typeDuNom("stage postdoctoral en informatique")).toBe("Stage postdoctoral");
    expect(typeDuNom("Baccalauréats en gestion des ressources humaines")).toBe("Baccalauréat");
    expect(typeDuNom("Maitrise en mathématiques")).toBe("Maîtrise");
  });

  it("rend null — jamais « autre » — quand le nom n'énonce aucun grade", () => {
    // 80 fiches sur 1 507 sont dans ce cas, et ce n'est pas un échec de
    // lecture : leur nom ne porte pas de grade. Plusieurs ressemblent à des
    // orientations publiées seules. Une catégorie fourre-tout affirmerait un
    // type que l'UdeM ne donne pas.
    for (const nom of [
      "Actuariat",
      "Archéologie classique",
      "Physique médicale",
      "Ph. D. individualisé",
      "Communication médiatique",
      "",
    ]) {
      expect(typeDuNom(nom), nom).toBeNull();
    }
  });

  it("exige une frontière de mot après le grade", () => {
    // Sans elle, « Doctorate » d'un nom anglais se lirait « Doctorat ».
    expect(typeDuNom("Doctorate of Philosophy")).toBeNull();
  });
});
