/**
 * Les cas de ce fichier sont les programmes réels du catalogue, avec leurs
 * libellés et leurs crédits VERBATIM, relevés par la session intégratrice sur
 * les pages puis recoupés sur `data/`. Aucun n'est inventé : l'intérêt du
 * module est justement qu'un gabarit HTML identique signifie deux choses
 * différentes selon qu'un id est réutilisé ou non, et une fixture écrite à la
 * main ne porterait pas cette distinction.
 */
import { describe, it, expect } from "vitest";
import type { Bloc, RegleBloc } from "../../lib/types";
import { cleBloc } from "../../lib/codes";
import { lireCheminements, marqueurDe } from "./cheminements";

function bloc(segment: string, id: string, nom: string, min: number, type: "obligatoire" | "option" = "obligatoire"): Bloc {
  const regle: RegleBloc = { type, bornes: { min, max: min } };
  return {
    id,
    cle: cleBloc(segment, id, nom),
    segment,
    nom,
    regle,
    regleBrut: `${type} - ${min} crédits.`,
    cours: [],
    contenuOuvert: false,
    notes: [],
  };
}

describe("marqueurDe", () => {
  it("extrait le sigle court quand il y en a un", () => {
    expect(marqueurDe("- ST Méthodologie")).toBe("ST");
    expect(marqueurDe("- TD Travail dirigé")).toBe("TD");
    expect(marqueurDe("MM")).toBe("MM");
  });

  it("garde le libellé entier quand aucun sigle ne s'en dégage", () => {
    expect(marqueurDe("Stage")).toBe("Stage");
    expect(marqueurDe("Travail dirigé")).toBe("Travail dirigé");
    expect(marqueurDe("Accès direct du B. Sc. au Ph. D.")).toBe("Accès direct du B. Sc. au Ph. D.");
  });

  it("normalise le tiret Unicode avant d'extraire", () => {
    // « Bloc 70A ST‐TD » de la maîtrise en évaluation porte un U+2010, qui se
    // lit comme un trait d'union et n'en est pas un. Sans normalisation, deux
    // lectures de la même page donneraient deux marqueurs.
    expect(marqueurDe("ST‐TD")).toBe(marqueurDe("ST-TD"));
  });
});

describe("lireCheminements — quand il ne faut RIEN émettre", () => {
  it("n'émet rien si aucun id n'est réutilisé, même avec un libellé par bloc", () => {
    // `dess-en-intervention-en-deficience-visuelle-readaptation` : même gabarit
    // que le doctorat, mais 10 + 20 = 30 = creditsTotal, donc des COMPLÉMENTS
    // tous deux exigés. Les émettre montrerait 10 ou 20 crédits à un étudiant
    // qui en doit 30 — amputer au lieu de gonfler.
    const blocs = [
      bloc("70", "70A", "Formation générale", 10),
      bloc("70", "70B", "Formation spécialisée", 20, "option"),
    ];
    const r = lireCheminements(blocs, 30);
    expect(r.cheminements).toEqual([]);
    expect(r.parCle.size).toBe(0);
    expect(r.ecartes).toEqual([]); // pas un défaut : il n'y a simplement pas d'axe
  });

  it("n'émet rien quand un seul côté d'un créneau est marqué", () => {
    const blocs = [
      bloc("70", "70C", "Gestion", 6, "option"),
      bloc("70", "70C", "ST-TD Gestion", 9, "option"),
      bloc("70", "70A", "MM", 6),
      bloc("70", "70A", "ST-TD", 6),
    ];
    const r = lireCheminements(blocs, 45);
    expect(r.cheminements).toEqual([]);
    expect(r.ecartes.length).toBeGreaterThan(0);
  });

  it("n'émet rien quand les sommes ne tombent pas sur le total annoncé", () => {
    // LE garde-fou qui rend le module auto-vérifiant. Ici les deux côtés sont
    // marqués et l'axe a l'air propre, mais 6 + 18 = 24 pour MM contre 6 + 12
    // = 18 pour ST : aucun ne vaut 45. Une extraction de marqueur qui se trompe
    // produit donc un silence journalisé, jamais une donnée fausse.
    const blocs = [
      bloc("01", "01A", "", 15),
      bloc("70", "70A", "MM", 6),
      bloc("70", "70A", "ST", 6),
      bloc("70", "70F", "MM", 18),
      bloc("70", "70F", "ST", 12),
    ];
    const r = lireCheminements(blocs, 45);
    expect(r.cheminements).toEqual([]);
    expect(r.parCle.size).toBe(0);
    expect(r.ecartes.map((e) => e.raison).join(" ")).toContain("45");
  });
});

describe("lireCheminements — quand il faut émettre", () => {
  it("l'administration sociale : marqueur ST/TD, et TROIS blocs sans cheminement", () => {
    // Le cas qui interdit d'utiliser le nom entier comme libellé. Avec le
    // marqueur : ST = 45 et TD = 45. Avec le nom entier, choisir
    // « - ST Méthodologie » éliminerait les deux variantes de 70E — qui ne
    // correspondent à aucun des deux libellés — et amputerait 42 des 45 crédits.
    const blocs = [
      bloc("70", "70A", "- ST Méthodologie", 3),
      bloc("70", "70A", "- TD Méthodologie", 3),
      bloc("70", "70B", "Gestion (ESPUM)", 12, "option"),
      bloc("70", "70C", "Spécialisation", 15, "option"),
      bloc("70", "70D", "Complément de formation", 3, "option"),
      bloc("70", "70E", "- ST Stage", 12),
      bloc("70", "70E", "- TD Travail dirigé", 12),
    ];
    const r = lireCheminements(blocs, 45);
    expect(r.cheminements.sort()).toEqual(["ST", "TD"]);
    // Les trois blocs descriptifs sont COMMUNS : absents de la table, jamais
    // rattachés à un cheminement. « Nommé » n'est pas « marqué ».
    for (const nom of ["Gestion (ESPUM)", "Spécialisation", "Complément de formation"]) {
      const b = blocs.find((x) => x.nom === nom)!;
      expect(r.parCle.has(b.cle), `${nom} doit rester commun`).toBe(false);
    }
    expect(r.parCle.get(blocs[0].cle)).toBe("ST");
    expect(r.parCle.get(blocs[6].cle)).toBe("TD");
    expect(r.ecartes).toEqual([]);
  });

  it("un seul créneau réutilisé : le libellé entier suffit comme marqueur", () => {
    // `maitrise-en-finance-mathematique-et-computationnelle` : 70D « Stage »
    // contre 70D « Travail dirigé ». Aucune abréviation à extraire, et aucune
    // n'est nécessaire puisqu'il n'y a qu'un groupe à recouper.
    const blocs = [
      bloc("70", "70A", "", 36),
      bloc("70", "70D", "Stage", 9),
      bloc("70", "70D", "Travail dirigé", 9),
    ];
    const r = lireCheminements(blocs, 45);
    expect(r.cheminements.sort()).toEqual(["Stage", "Travail dirigé"]);
    expect(r.parCle.size).toBe(2);
  });

  it("tout marqueur émis figure dans la liste des cheminements", () => {
    // L'invariant que le moteur consomme : aucun `Bloc.cheminement` orphelin.
    const blocs = [
      bloc("70", "70A", "", 36),
      bloc("70", "70D", "Stage", 9),
      bloc("70", "70D", "Travail dirigé", 9),
    ];
    const r = lireCheminements(blocs, 45);
    for (const m of r.parCle.values()) expect(r.cheminements).toContain(m);
  });
});
