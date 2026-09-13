/**
 * LE JEU ATTENDU des programmes à cheminements — le contrôle qui manquait.
 *
 * ## Pourquoi ce fichier existe
 *
 * `cheminements.ts` n'émet que si le plancher de chaque cheminement tombe sur le
 * `creditsTotal`. Donc « tous les cheminements émis sont justes » est vrai **par
 * construction** : c'est un contrôle dont la réponse est garantie d'avance, et
 * il ne réfute rien.
 *
 * Le défaut que ça laisse passer est arrivé pour de vrai. Une version de
 * l'extracteur marquait tout bloc libellé et fabriquait trois faux cheminements
 * sur `administration sociale` à partir de noms descriptifs. Le garde-fou les a
 * refusés — donc le programme a **silencieusement disparu** de la sortie, 4 → 3,
 * pendant que l'affirmation « tous les émis sont justes » restait vraie. Un
 * indicateur qui reste vert **en se rétrécissant** est la forme la plus coûteuse.
 *
 * D'où deux contrôles que le garde-fou ne peut pas se donner à lui-même :
 *
 *  1. **le jeu attendu est nommé.** Ces quatre programmes ont un axe de
 *     cheminement établi sur la page. Si l'un cesse d'émettre, c'est une
 *     régression, pas un silence prudent ;
 *  2. **les sommes sont RECALCULÉES ici**, à partir de `data/`, sans demander
 *     son avis à l'extracteur. Si les deux calculs divergent, l'un des deux a
 *     tort et le test le dit.
 *
 * ## Ce que ce test ne peut pas faire
 *
 * Il ne détecte pas une coïncidence arithmétique : des blocs mal attribués dont
 * les sommes tombent quand même juste. Personne n'a d'instrument pour ça, et le
 * dire est tout ce qu'on peut faire.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Bloc, Programme } from "../../lib/types";

const DIR = join(import.meta.dirname, "..", "..", "data", "programmes");

/**
 * Les quatre programmes dont l'axe est établi sur la page, avec la source du
 * discriminant — pour que le prochain lecteur sache POURQUOI on les attend.
 */
const ATTENDUS: { slug: string; axe: string[]; source: string }[] = [
  {
    slug: "doctorat-en-pathologie-et-biologie-cellulaire",
    axe: ["Accès direct du B. Sc. au Ph. D.", "Accès de la M. Sc. au Ph. D."],
    source: "le <small> répète le même id de bloc par modalité d'accès, et le segment 01 EST la voie M. Sc.",
  },
  {
    slug: "maitrise-en-administration-des-services-de-sante-option-administration-sociale",
    axe: ["ST", "TD"],
    source: "marqueur court extrait du nom : « - ST Méthodologie » contre « - TD Méthodologie »",
  },
  {
    slug: "maitrise-en-finance-mathematique-et-computationnelle",
    axe: ["Stage", "Travail dirigé"],
    source: "un seul créneau réutilisé (70D), le libellé entier suffit",
  },
  {
    slug: "maitrise-en-sciences-veterinaires-option-sante-publique-veterinaire-sans-memoire",
    axe: ["Stage", "Travaux dirigés"],
    source: "81D réutilisé ; l'axe ne vit que dans l'orientation 81, pas dans le 80",
  },
];

const lire = (slug: string): Programme =>
  JSON.parse(readFileSync(join(DIR, `${slug}.json`), "utf8")) as Programme;

/** Recalculé ici, sans passer par l'extracteur. */
const plancher = (blocs: Bloc[]): number =>
  blocs.reduce(
    (s, b) => (b.regle.type === "obligatoire" || b.regle.type === "option" ? s + b.regle.bornes.min : s),
    0,
  );

const PRET = ATTENDUS.every(({ slug }) => existsSync(join(DIR, `${slug}.json`)));

describe.skipIf(!PRET)("le jeu attendu des programmes à cheminements", () => {
  for (const { slug, axe, source } of ATTENDUS) {
    it(`${slug} émet son axe (${source})`, () => {
      const p = lire(slug);
      // Le cœur du contrôle : l'ABSENCE est un échec, pas un silence prudent.
      expect(p.cheminements, `${slug} n'émet plus aucun cheminement`).toBeDefined();
      expect([...(p.cheminements ?? [])].sort()).toEqual([...axe].sort());
    });

    it(`${slug} : chaque cheminement tombe sur son creditsTotal, recalculé`, () => {
      const p = lire(slug);
      expect(p.creditsTotal).not.toBeNull();
      // Par orientation : les blocs de deux orientations ne s'additionnent pas.
      // Une orientation sans bloc marqué ne porte pas l'axe et n'est pas exigée.
      const portees =
        p.orientations.length > 0
          ? p.orientations.map((o) => ({ nom: o.nom, segments: o.segments }))
          : [{ nom: "—", segments: p.segments }];
      let couples = 0;
      for (const portee of portees) {
        const blocs = p.blocs.filter((b) => portee.segments.includes(b.segment));
        for (const m of p.cheminements ?? []) {
          if (!blocs.some((b) => b.cheminement === m)) continue;
          couples += 1;
          const somme = plancher(blocs.filter((b) => (b.cheminement ?? m) === m));
          expect(somme, `${slug} / ${portee.nom} / ${m}`).toBe(p.creditsTotal);
        }
      }
      // Sans ça, un programme qui n'émettrait plus AUCUN couple passerait ce
      // test en ne vérifiant rien — l'ensemble vide satisfait tout.
      expect(couples, `${slug} ne porte aucun couple (orientation × cheminement)`).toBeGreaterThan(0);
    });
  }

  it("aucun Bloc.cheminement n'est orphelin de Programme.cheminements", () => {
    // L'invariant que le moteur consomme. Vérifié sur TOUT le catalogue, pas
    // seulement sur les quatre : un orphelin ailleurs serait tout aussi faux.
    const orphelins: string[] = [];
    for (const { slug } of ATTENDUS) {
      const p = lire(slug);
      for (const b of p.blocs) {
        if (b.cheminement === undefined) continue;
        if (!(p.cheminements ?? []).includes(b.cheminement)) orphelins.push(`${slug} ${b.cle} -> ${b.cheminement}`);
      }
    }
    expect(orphelins).toEqual([]);
  });
});
