import { describe, it, expect } from "vitest";
import { contenu, decoderEntites, decouperSur, texteBrut, texteLigne, tousContenus } from "./html";

describe("decoderEntites", () => {
  it("décode les entités réellement présentes sur les pages UdeM", () => {
    // « Exigences d&#039;inscription » et « Baccalauréat » apparaissent tels quels.
    expect(decoderEntites("Exigences d&#039;inscription")).toBe("Exigences d'inscription");
    expect(decoderEntites("Baccalaur&eacute;at &amp; co")).toBe("Baccalauréat & co");
    expect(decoderEntites("&#xE9;t&#233;")).toBe("été");
  });

  it("laisse intacte une entité inconnue au lieu de la gommer", () => {
    // Gommer silencieusement transformerait un texte inconnu en texte faux.
    expect(decoderEntites("&inconnue; fin")).toBe("&inconnue; fin");
  });
});

describe("texteBrut", () => {
  it("ne glisse AUCUN espace à la place d'une balise en ligne", () => {
    // La page écrit le cycle « 1<sup>er</sup> cycle ». Insérer un espace
    // donnerait « 1 er cycle », qui ne correspond à rien sur le site.
    expect(texteBrut("1<sup>er</sup> cycle")).toBe("1er cycle");
  });

  it("coupe aux frontières de blocs pour ne pas coller deux phrases", () => {
    expect(texteBrut("<p>Première.</p><p>Deuxième.</p>")).toBe("Première.\nDeuxième.");
    expect(texteBrut("a<br>b")).toBe("a\nb");
  });

  it("écrase l'indentation du gabarit serveur, très verbeuse", () => {
    expect(texteBrut("<p>\n        Été 2026, \n\n      Automne 2026\n    </p>")).toBe(
      "Été 2026, Automne 2026",
    );
  });

  it("retire commentaires, scripts et styles", () => {
    expect(texteBrut("<!-- note interne -->x<script>var a=1;</script><style>p{}</style>")).toBe("x");
  });
});

describe("texteLigne", () => {
  it("ramène tout sur une ligne", () => {
    expect(texteLigne("<p>a</p><p>b</p>")).toBe("a b");
  });
});

describe("contenu / tousContenus / decouperSur", () => {
  const html =
    '<section class="cours-sommaire"><ul><li><b>Crédits</b><p>3.0</p></li>' +
    "<li><b>Campus</b><p>Montréal</p></li></ul></section>";

  it("trouve un élément par balise et classe", () => {
    expect(contenu(html, "section", "cours-sommaire")).toContain("<li>");
    expect(contenu(html, "section", "absente")).toBeNull();
  });

  it("ne confond pas une classe avec un préfixe d'une autre", () => {
    // « bloc » ne doit pas attraper « bloc-titre » ni « bloc-background-bleu ».
    const page = '<div class="bloc-titre">titre</div><div class="bloc">vrai bloc</div>';
    expect(contenu(page, "div", "bloc")).toBe("vrai bloc");
  });

  it("liste tous les éléments d'une balise", () => {
    expect(tousContenus(html, "li")).toHaveLength(2);
  });

  it("découpe sur une balise d'ouverture répétée et jette le préambule", () => {
    expect(decouperSur("préambule<x>un<x>deux", "<x>")).toEqual(["un", "deux"]);
  });
});
