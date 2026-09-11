/**
 * COUTURE ENTRE LA FIXTURE ET L'ÉCRAN.
 *
 * L'écran d'import offre un horaire d'exemple, qui doit être embarqué dans le
 * bundle (export statique, pas de `fetch`) : il vit donc en double, une fois en
 * `.ics` pour les tests et une fois en module TypeScript. Sans ce test, les deux
 * dérivent en silence et le bouton « exemple » démontre un comportement que plus
 * aucun test ne couvre.
 */
import { expect, test } from "vitest";
import { lireFixture } from "./__fixtures__";
import { ICS_EXEMPLE } from "./__fixtures__/exemple";
import { lireICS } from "./lire";

test("l'exemple embarqué dit la même chose que la fixture .ics", () => {
  const fichier = lireFixture("horaire-a26-v2.ics").replace(/\r\n/g, "\n");
  expect(ICS_EXEMPLE).toBe(fichier);
});

test("l'exemple se lit sans problème et donne des cours", () => {
  const r = lireICS(ICS_EXEMPLE, { maintenant: new Date(2027, 5, 1) });
  expect(r.estICS).toBe(true);
  expect(r.problemes).toEqual([]);
  expect(r.cours.map((c) => c.code)).toEqual([
    "MAT 1400",
    "ACT 2025",
    "STT 1700",
    "IFT 1015",
  ]);
  expect(r.ignores).toHaveLength(1);
});
