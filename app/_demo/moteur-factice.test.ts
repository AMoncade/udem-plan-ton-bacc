/**
 * Ces tests portent sur le FAUX moteur, et ils partent avec lui. Ils existent
 * pour une raison : ils fixent par écrit ce que l'UI attend de la surface
 * gelée, y compris le piège des 33 crédits d'option. Quand le vrai moteur
 * arrive, ces attentes sont le cahier de charges à lui opposer.
 */
import { describe, expect, it } from "vitest";
import { catalogue, programme } from "../_donnees/catalogue";
import { arithmetiqueProgramme } from "../_lib/cours";
import { auditProgramme, diagnostiquerCours } from "./moteur-factice";

describe("diagnostiquerCours", () => {
  it("verrouille ACT 2250 et nomme les deux préalables manquants", () => {
    const diagnostic = diagnostiquerCours(catalogue, new Set()).get("ACT 2250");
    expect(diagnostic?.etat).toBe("verrouille");
    expect(diagnostic?.manquants.sort()).toEqual(["ACT 1240", "MAT 1720"]);
  });

  it("libère ACT 2250 dès que ses deux préalables sont faits", () => {
    const faits = new Set(["ACT 1240", "MAT 1720"]);
    expect(diagnostiquerCours(catalogue, faits).get("ACT 2250")?.etat).toBe("disponible");
  });

  it("déclare disponible un cours dont la fiche dit « aucun préalable »", () => {
    expect(diagnostiquerCours(catalogue, new Set()).get("IFT 1015")?.etat).toBe(
      "disponible",
    );
  });

  it("ne verrouille jamais un cours sans fiche : il avertit", () => {
    const diagnostic = diagnostiquerCours(catalogue, new Set()).get("ACT 2251");
    expect(diagnostic?.etat).toBe("avertissement");
    expect(diagnostic?.avertissements.join(" ")).toContain("Aucune fiche");
  });
});

describe("auditProgramme", () => {
  it("dérive 33 crédits d'option du total, là où les blocs n'en exigent que 18", () => {
    const exige = arithmetiqueProgramme(programme);
    expect(exige.obligatoire).toBe(54);
    expect(exige.choix).toBe(3);
    expect(exige.exigeOption).toBe(33);
    expect(exige.minimumsOption).toBe(18);
    expect(exige.ecart).toBe(15);
  });

  it("refuse de déclarer conforme un parcours où CHAQUE bloc d'option l'est", () => {
    // Minimums exactement atteints : 75C 12, 75D 3, 75Y 3, 75E 0 — soit 18.
    const faits = new Set([
      "ACT 2241",
      "ACT 2242",
      "ACT 2251",
      "ACT 2284",
      "STT 2000",
      "DMO 1000",
    ]);
    const audit = auditProgramme(programme, catalogue, faits);

    for (const id of ["75C", "75D", "75E", "75Y"]) {
      expect(audit.blocs.find((bloc) => bloc.idBloc === id)?.conforme).toBe(true);
    }
    expect(audit.creditsOption).toBe(18);
    expect(audit.conforme).toBe(false);
    expect(audit.problemes.some((p) => p.includes("33") && p.includes("18"))).toBe(true);
  });

  it("plafonne les crédits attribués et met le surplus dans les perdus", () => {
    const faits = new Set([
      "STT 2000",
      "STT 2105",
      "STT 3220",
      "STT 3260",
      "STT 3410",
      "STT 3510",
    ]);
    const audit = auditProgramme(programme, catalogue, faits);
    const bloc75D = audit.blocs.find((bloc) => bloc.idBloc === "75D");
    // 18 crédits placés, plafond 15 : attribués = retenus, perdus = surplus.
    expect(bloc75D?.creditsAttribues).toBe(15);
    expect(bloc75D?.creditsPerdus).toBe(3);
    expect(bloc75D?.coursAttribues).toHaveLength(6);
    expect(bloc75D?.conforme).toBe(false);
    expect(audit.creditsOption).toBe(15);
    expect(audit.problemes.some((p) => p.includes("perdus"))).toBe(true);
  });

  it("33 crédits d'option empilés dans 75C n'en retiennent que 27", () => {
    const bloc75C = programme.blocs.find((bloc) => bloc.id === "75C")!;
    const faits = new Set(bloc75C.cours);
    expect(faits.size).toBe(11); // 11 cours supposés à 3 crédits = 33

    const audit = auditProgramme(programme, catalogue, faits);
    const etat = audit.blocs.find((bloc) => bloc.idBloc === "75C");
    expect(etat?.creditsAttribues).toBe(27);
    expect(etat?.creditsPerdus).toBe(6);
    // Le total d'option reste sous les 33 exigés : le parcours ne diplôme pas,
    // même avec 33 crédits d'option réussis.
    expect(audit.creditsOption).toBe(27);
    expect(audit.conforme).toBe(false);
  });

  it("signale qu'il a supposé les crédits des cours sans fiche", () => {
    const audit = auditProgramme(programme, catalogue, new Set(["ACT 2241"]));
    expect(audit.problemes.some((p) => p.includes("supposés"))).toBe(true);
  });

  it("n'oublie aucun bloc du programme", () => {
    const audit = auditProgramme(programme, catalogue, new Set());
    expect(audit.blocs.map((bloc) => bloc.idBloc)).toEqual(
      programme.blocs.map((bloc) => bloc.id),
    );
    expect(audit.creditsTotal).toBe(0);
    expect(audit.conforme).toBe(false);
  });
});
