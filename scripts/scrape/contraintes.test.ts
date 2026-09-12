/**
 * Toutes les proses de ce fichier sont VERBATIM du catalogue, relevées le
 * 2026-09-11 sur les 401 blocs `contenuOuvert: true` de `data/programmes/`.
 * Aucune n'est inventée : une fixture écrite à la main prouverait seulement que
 * l'expression régulière reconnaît ce qu'on a pensé en l'écrivant.
 */
import { describe, it, expect } from "vitest";
import { lireContrainte } from "./contraintes";

describe("lireContrainte — contrainte de sigle", () => {
  it("réduit « ne sont pas de sigle CHM » en un sigle exclu", () => {
    expect(
      lireContrainte(["Sauf exception autorisée, les crédits au choix ne sont pas de sigle CHM."]),
    ).toEqual({ genre: "sigle", exclus: ["CHM"] });
  });

  it("réduit « autre que les sigles COM et POL » en deux sigles exclus", () => {
    expect(
      lireContrainte([
        "Sauf exception autorisée, les cours au choix doivent être choisis parmi les cours " +
          "identifiés par un sigle autre que les sigles COM et POL.",
      ]),
    ).toEqual({ genre: "sigle", exclus: ["COM", "POL"] });
  });

  it("le SIGLE gagne sur l'autorisation mentionnée dans la même phrase", () => {
    // L'ORDRE des motifs est ce qui se joue ici. « Sauf exception autorisée »
    // déclenche aussi le motif d'autorisation ; si celui-ci passait d'abord,
    // les 85 contraintes de sigle du catalogue deviendraient 85 drapeaux
    // « autorisation » sur lesquels le moteur ne peut rien vérifier. La
    // dérogation n'est pas la contrainte.
    expect(
      lireContrainte([
        "Cheminement régulier: 3 crédits, Cheminement honor : 0 crédit. Sauf exception " +
          "autorisée, les crédits au choix ne sont pas de sigle CRI.",
      ]),
    ).toEqual({ genre: "sigle", exclus: ["CRI"] });
  });

  it("n'émet RIEN quand le motif est là mais qu'aucun sigle n'en sort", () => {
    // `{ genre: "sigle", exclus: [] }` serait une contrainte qui n'exclut rien :
    // le moteur la lirait comme « tout est permis » alors que la page restreint
    // quelque chose qu'on n'a pas su lire. Un champ absent dit « je ne sais
    // pas » ; une liste vide affirme à tort.
    expect(lireContrainte(["Les cours au choix sont d'un sigle autre que celui du programme."])).not.toMatchObject(
      { genre: "sigle" },
    );
  });
});

describe("lireContrainte — contrainte de cycle", () => {
  it("traduit « 2e cycle » vers le vocabulaire des FICHES, pas celui de la page", () => {
    // LE test qui compte. `Cours.cycle` ne porte que deux valeurs dans tout le
    // catalogue — « 1er cycle » (2 161 fiches) et « Cycles supérieurs » (292).
    // Recopier « 2e cycle » de la page donnerait une contrainte que zéro cours
    // peut satisfaire : conforme au type `cycle: string`, et inutilisable.
    expect(
      lireContrainte(["Choisir un cours de 2e cycle dans le répertoire de l'UdeM avec l'approbation du directeur."]),
    ).toEqual({ genre: "cycle", cycle: "Cycles supérieurs" });
  });

  it("n'émet RIEN quand la prose nomme aussi un RÉPERTOIRE ou une faculté", () => {
    // Défaut relevé par la session moteur sur les données émises, avec ces
    // proses verbatim. Filtrer sur `Cours.cycle` seul ADMETTRAIT un cours de
    // 2e cycle de n'importe quelle faculté, alors que la page n'autorise qu'un
    // répertoire précis. C'est l'erreur symétrique du cas « deux cycles », et
    // elle est pire : celle-là rejetait un cours permis, celle-ci déclare
    // l'exigence satisfaite par un cours interdit — elle fait diplômer sur du
    // vide. 58 des 126 contraintes `cycle` émises étaient de cette forme.
    for (const prose of [
      "Cours de 2e cycle à choisir dans le répertoire des cours de la Faculté de l'aménagement.",
      "À choisir dans la banque de cours de 2e cycle de la Faculté des sciences de l'éducation.",
    ]) {
      expect(lireContrainte([prose]), prose).not.toMatchObject({ genre: "cycle" });
    }
  });

  it("le mot « répertoire » ne suffit PAS à écarter : celui de l'UdeM est universel", () => {
    // Première version de la garde : elle écartait toute prose contenant
    // « répertoire », ce qui jetait 27 contraintes justes. « le répertoire des
    // cours de l'Université de Montréal » désigne le catalogue ENTIER — il ne
    // restreint rien au-delà du niveau, donc filtrer sur `Cours.cycle` n'admet
    // aucun cours interdit. Ce qui restreint est une SOUS-UNITÉ nommée.
    expect(
      lireContrainte([
        "Les étudiants devront choisir un cours de cycle supérieur parmi le répertoire de " +
          "cours de l'Université de Montréal.",
      ]),
    ).toEqual({ genre: "cycle", cycle: "Cycles supérieurs" });
  });

  it("« ou d'autres universités » ÉLARGIT, donc n'écarte pas", () => {
    // Cette prose a été signalée comme dangereuse ; la mesure dit l'inverse.
    // Les cours hors UdeM ne sont pas dans le catalogue, donc une contrainte de
    // niveau n'y admet rien d'interdit — elle est seulement incomplète, ce qui
    // est le cas normal et sans danger.
    expect(
      lireContrainte([
        "Cours choisis parmi les cours de cycles supérieurs de l'université ou des cours " +
          "de même niveau d'autres universités.",
      ]),
    ).toEqual({ genre: "cycle", cycle: "Cycles supérieurs" });
  });

  it("émet quand la prose ne contraint QUE le niveau", () => {
    // Le contre-exemple qui garde la règle utile : rien d'autre que le niveau,
    // donc rien à trahir en filtrant sur `Cours.cycle`.
    expect(lireContrainte(["Un cours du niveau des études supérieures."])).toEqual({
      genre: "cycle",
      cycle: "Cycles supérieurs",
    });
    expect(lireContrainte(["Tout cours du niveau des études supérieures."])).toEqual({
      genre: "cycle",
      cycle: "Cycles supérieurs",
    });
  });

  it("lit « niveau des études supérieures »", () => {
    expect(lireContrainte(["Un cours du niveau des études supérieures."])).toEqual({
      genre: "cycle",
      cycle: "Cycles supérieurs",
    });
  });

  it("n'émet RIEN quand la prose autorise les DEUX cycles", () => {
    // Défaut réel, attrapé en relisant les 149 contraintes émises par une
    // première version : cette prose autorise le cycle supérieur ET le 1er
    // cycle. Émettre « 1er cycle » rejetterait les cours de cycle supérieur
    // que le bloc permet explicitement — une contrainte fausse est pire que
    // pas de contrainte, c'est toute la règle de ce module.
    expect(
      lireContrainte([
        "Cours de cycle supérieurs d'autres disciplines ou d'autres universités ou cours " +
          "de 1er cycle de sigle MAT.",
      ]),
    ).toBeNull();
  });

  it("lit le 1er cycle quand la prose ne parle que de lui", () => {
    expect(
      lireContrainte([
        "et/ou un maximum de 6 crédits de cours de 1er cycle de sigle ACT, MAT ou STT, " +
          "avec l'approbation du responsable de programme.",
      ]),
    ).toEqual({ genre: "cycle", cycle: "1er cycle" });
  });

  it("le CYCLE gagne sur l'autorisation de la même phrase", () => {
    // Même raison que pour le sigle : « avec l'approbation du directeur » est
    // une modalité, « cours de 2e cycle » est la contrainte vérifiable.
    const c = lireContrainte(["Choisir un cours de 2e cycle avec l'approbation du directeur."]);
    expect(c).toMatchObject({ genre: "cycle" });
  });
});

describe("lireContrainte — renvois", () => {
  it("réduit « dans les blocs 71I ou 71Z » en deux ids de blocs", () => {
    expect(lireContrainte(["Un cours de 3 crédits doit être pris dans les blocs 71I ou 71Z."])).toEqual({
      genre: "renvoiBlocs",
      blocs: ["71I", "71Z"],
    });
  });

  it("reconnaît le renvoi au Centre de langues", () => {
    expect(
      lireContrainte([
        "Les cours de langues peuvent être choisis parmi la liste des cours offerts par le " +
          "Centre de langues de l'Université de Montréal : allemand, anglais, arabe.",
      ]),
    ).toEqual({ genre: "renvoiExterne" });
  });
});

describe("lireContrainte — ce qui ne doit RIEN produire", () => {
  it("une répartition de crédits par cheminement ne contraint aucun contenu", () => {
    // Les 12 blocs de cette famille sont posés `contenuOuvert: true` parce
    // qu'ils ont de la prose et aucun cours — mais leur prose répartit des
    // crédits, elle ne décrit pas de contenu. Ils sont plus proches d'un bloc
    // vide constaté que d'un contenu ouvert.
    expect(
      lireContrainte([
        "Cheminement général : 0 crédit; cheminement honor : 0 crédit; cheminement " +
          "international : minimum 3 crédits, maximum 9 crédits.",
      ]),
    ).toBeNull();
  });

  it("une prose vide ou absente rend null", () => {
    expect(lireContrainte([])).toBeNull();
    expect(lireContrainte([""])).toBeNull();
    expect(lireContrainte(["   "])).toBeNull();
  });

  it("une autorisation seule est constatée, faute de mieux", () => {
    // Rien à vérifier mécaniquement, mais le dire vaut mieux que se taire : le
    // moteur peut afficher « ce bloc dépend d'une approbation » au lieu de
    // laisser l'étudiant devant un bloc muet.
    expect(lireContrainte(["Le choix de ce cours doit être approuvé par la direction du programme."])).toEqual({
      genre: "autorisation",
    });
  });
});
