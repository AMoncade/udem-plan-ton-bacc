import { describe, it, expect } from "vitest";
import {
  blocsDuCheminement,
  cleParcours,
  exigeUnCheminement,
  lireCleParcours,
  parcoursDe,
  projeterOrientation,
} from "./parcours";
import type { Bloc, Orientation, Programme } from "./types";

const bloc = (segment: string, id: string): Bloc => ({
  id,
  cle: `${segment}/${id}`,
  segment,
  nom: "",
  regle: { type: "obligatoire", bornes: { min: 3, max: 3 } },
  regleBrut: "Obligatoire - 3 crédits.",
  cours: ["MAT 1000"],
  contenuOuvert: false,
  notes: [],
});

const orientation = (nom: string, segments: string[]): Orientation => ({
  nom,
  segments,
  exigences: {
    brut: `répartition de ${nom}`,
    obligatoire: { min: 54, max: 54 },
    option: { min: 33, max: 33 },
    choix: { min: 3, max: 3 },
  },
});

/** Forme de la page réelle du bacc en mathématiques : un tronc commun (01) et
 *  deux orientations exclusives (75 actuariat, 76 actuariat COOP). */
const MATHS: Programme = {
  id: "baccalaureat-en-mathematiques",
  nom: "Baccalauréat en mathématiques",
  orientation: null,
  segments: ["01", "75", "76"],
  orientations: [orientation("Actuariat", ["01", "75"]), orientation("Actuariat COOP", ["01", "76"])],
  cycle: "1er cycle",
  faculte: "Faculté des arts et des sciences",
  typeProgramme: "Baccalauréat",
  creditsTotal: 90,
  exigences: null,
  blocs: [bloc("01", "01A"), bloc("75", "75A"), bloc("75", "75C"), bloc("76", "76A")],
  notes: [],
  url: "https://example.invalid/",
  scrapeISO: "2026-09-11T00:00:00.000Z",
};

/** Un programme sans orientation : une seule répartition, `exigences` remplie. */
const CERTIFICAT: Programme = {
  ...MATHS,
  id: "certificat-en-droit",
  nom: "Certificat en droit",
  segments: ["01"],
  orientations: [],
  exigences: {
    brut: "9 crédits obligatoires, de 6 à 9 crédits à option",
    obligatoire: { min: 9, max: 9 },
    option: { min: 6, max: 9 },
    choix: { min: 0, max: 3 },
  },
  blocs: [bloc("01", "01A")],
};

describe("cleParcours et lireCleParcours", () => {
  it("fait l'aller-retour sans orientation", () => {
    const cle = cleParcours("certificat-en-droit", null);
    expect(cle).toBe("certificat-en-droit");
    expect(lireCleParcours(cle)).toEqual({ id: "certificat-en-droit", orientation: null });
  });

  it("fait l'aller-retour avec orientation", () => {
    const cle = cleParcours("baccalaureat-en-mathematiques", "Actuariat");
    expect(cle).toBe("baccalaureat-en-mathematiques#Actuariat");
    expect(lireCleParcours(cle)).toEqual({
      id: "baccalaureat-en-mathematiques",
      orientation: "Actuariat",
    });
  });

  it("refuse une clé mal formée au lieu d'en deviner le sens", () => {
    for (const mauvaise of ["", "#Actuariat", "bacc#"]) {
      expect(lireCleParcours(mauvaise), mauvaise).toBeNull();
    }
  });
});

describe("projeterOrientation", () => {
  it("ne garde que les blocs des segments de l'orientation", () => {
    const p = projeterOrientation(MATHS, "Actuariat");
    expect(p.blocs.map((b) => b.cle)).toEqual(["01/01A", "75/75A", "75/75C"]);
    expect(p.segments).toEqual(["01", "75"]);
    expect(p.orientation).toBe("Actuariat");
  });

  it("porte les exigences de l'orientation, pas celles du programme", () => {
    // C'est le point de tout l'exercice : la page énonce une répartition par
    // orientation, et `exigences` n'avait qu'un emplacement. En désigner une
    // arbitrairement aurait été un choix déguisé en donnée.
    const p = projeterOrientation(MATHS, "Actuariat");
    expect(p.exigences?.brut).toBe("répartition de Actuariat");
    expect(p.exigences?.option).toEqual({ min: 33, max: 33 });
    // Et le programme projeté ne se projette plus : il EST un parcours.
    expect(p.orientations).toEqual([]);
  });

  it("sépare deux orientations exclusives", () => {
    const actuariat = projeterOrientation(MATHS, "Actuariat");
    const coop = projeterOrientation(MATHS, "Actuariat COOP");
    expect(actuariat.blocs.map((b) => b.cle)).not.toContain("76/76A");
    expect(coop.blocs.map((b) => b.cle)).toContain("76/76A");
    expect(coop.blocs.map((b) => b.cle)).not.toContain("75/75A");
  });

  it("refuse d'auditer une page à plusieurs orientations sans en nommer une", () => {
    // Les orientations sont des ALTERNATIVES. Additionner leurs blocs exigerait
    // à la fois le segment 75 et le segment 76, ce qui est impossible — et le
    // conclure en silence produirait un « non conforme » que l'étudiant ne
    // pourrait jamais corriger.
    expect(() => projeterOrientation(MATHS, null)).toThrow(/orientations/);
  });

  it("refuse une orientation inexistante au lieu de tout renvoyer", () => {
    expect(() => projeterOrientation(MATHS, "Statistique")).toThrow(/absente/);
  });

  it("laisse intact un programme sans orientation", () => {
    const p = projeterOrientation(CERTIFICAT, null);
    expect(p).toBe(CERTIFICAT);
    expect(p.exigences?.option).toEqual({ min: 6, max: 9 });
  });
});

describe("parcoursDe", () => {
  it("donne un parcours par orientation, dans l'ordre de la page", () => {
    expect(parcoursDe(MATHS)).toEqual([
      { cle: "baccalaureat-en-mathematiques#Actuariat", orientation: "Actuariat" },
      { cle: "baccalaureat-en-mathematiques#Actuariat COOP", orientation: "Actuariat COOP" },
    ]);
  });

  it("donne un seul parcours quand la page n'a pas d'orientation", () => {
    expect(parcoursDe(CERTIFICAT)).toEqual([
      { cle: "certificat-en-droit", orientation: null },
    ]);
  });
});

const blocC = (segment: string, id: string, min: number, cheminement?: string): Bloc => ({
  ...bloc(segment, id),
  regle: { type: "obligatoire", bornes: { min, max: min } },
  regleBrut: `Obligatoire - ${min} crédits.`,
  ...(cheminement === undefined ? {} : { cheminement }),
});

describe("cheminements exclusifs", () => {
  /** Doctorat en pathologie, segment 70, réduit : deux cheminements complets. */
  const doctorat = (): Programme =>
    ({
      ...CERTIFICAT,
      id: "doctorat-en-pathologie-et-biologie-cellulaire",
      creditsTotal: 90,
      cheminements: ["Accès direct du B. Sc. au Ph. D.", "Accès de la M. Sc. au Ph. D."],
      blocs: [
        blocC("70", "70A", 2, "Accès direct du B. Sc. au Ph. D."),
        blocC("70", "70A", 3, "Accès de la M. Sc. au Ph. D."),
        blocC("70", "70B", 3, "Accès direct du B. Sc. au Ph. D."),
        blocC("70", "70B", 87, "Accès de la M. Sc. au Ph. D."),
        blocC("70", "70C", 6, "Accès direct du B. Sc. au Ph. D."),
        blocC("70", "70D", 79, "Accès direct du B. Sc. au Ph. D."),
      ],
    }) as Programme;

  /** Maîtrise en finance : un cœur COMMUN plus un seul créneau alternatif. */
  const finance = (): Programme =>
    ({
      ...CERTIFICAT,
      id: "maitrise-en-finance-mathematique-et-computationnelle",
      creditsTotal: 45,
      cheminements: ["Stage", "Travail dirigé"],
      blocs: [
        blocC("70", "70A", 30),
        blocC("70", "70B", 3),
        blocC("70", "70C", 3),
        blocC("70", "70D", 9, "Stage"),
        blocC("70", "70D", 9, "Travail dirigé"),
      ],
    }) as Programme;

  const somme = (bs: Bloc[]): number =>
    bs.reduce((s, b) => s + (b.regle.type === "inconnu" ? 0 : b.regle.bornes.min), 0);

  it("chaque cheminement totalise le programme, leur somme le double", () => {
    // LE CHIFFRE QUI FONDE CE CHAMP, mesuré sur data/ et reproduit ici : sans
    // filtre, un audit exige 180 crédits pour un doctorat qui en annonce 90.
    const p = doctorat();
    expect(somme(blocsDuCheminement(p, "Accès direct du B. Sc. au Ph. D."))).toBe(90);
    expect(somme(blocsDuCheminement(p, "Accès de la M. Sc. au Ph. D."))).toBe(90);
    expect(somme(p.blocs)).toBe(180);
    expect(p.creditsTotal).toBe(90);
  });

  it("un bloc sans cheminement est COMMUN, pas orphelin", () => {
    // Le repli inverse — traiter un bloc non marqué comme n'appartenant à
    // personne — amputerait la maîtrise en finance de son cœur commun : 9
    // crédits affichés au lieu de 45.
    const p = finance();
    expect(somme(blocsDuCheminement(p, "Stage"))).toBe(45);
    expect(somme(blocsDuCheminement(p, "Travail dirigé"))).toBe(45);
    expect(blocsDuCheminement(p, "Stage").map((b) => b.id)).toEqual(["70A", "70B", "70C", "70D"]);
  });

  it("refuse d'auditer sans choix, au lieu d'additionner des exclusifs", () => {
    expect(exigeUnCheminement(doctorat())).toBe(true);
    expect(() => blocsDuCheminement(doctorat(), null)).toThrow(/il faut en nommer un/);
  });

  it("un programme sans cheminement rend tous ses blocs", () => {
    // Le DESS en déficience visuelle est ici : ses deux blocs à `<small>`
    // (« Formation générale » 10 cr, « Formation spécialisée » 20 cr) sont des
    // COMPLÉMENTS et totalisent ses 30 crédits. Aucun cheminement n'est émis,
    // donc rien n'est filtré — les prendre pour des alternatives montrerait 10
    // ou 20 crédits à un étudiant qui en doit 30.
    const dess = {
      ...CERTIFICAT,
      id: "dess-en-intervention-en-deficience-visuelle-readaptation",
      creditsTotal: 30,
      blocs: [blocC("70", "70A", 10), blocC("70", "70B", 20)],
    } as Programme;
    expect(exigeUnCheminement(dess)).toBe(false);
    expect(somme(blocsDuCheminement(dess, null))).toBe(30);
  });

  it("un libellé absent de la liste lève, au lieu de vider le programme", () => {
    // Intégrité référentielle. Une divergence d'un caractère — « Travaux
    // dirigés » contre « Travail dirigé », un U+2010 contre un trait d'union —
    // ne garderait aucun bloc spécifique et amputerait le programme sans qu'une
    // seule erreur ne se lève. C'est le mode d'échec que ce champ doit rendre
    // impossible, pas produire.
    expect(() => blocsDuCheminement(finance(), "Travaux dirigés")).toThrow(/ne déclare pas/);
  });
});
