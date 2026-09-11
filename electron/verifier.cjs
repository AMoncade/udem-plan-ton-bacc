/**
 * Auto-vérification de l'app empaquetée : `electron . --verifier`.
 *
 * Existe parce que « ça devrait marcher hors ligne » n'est pas une mesure.
 * Le mode lance la vraie fenêtre, avec le vrai protocole et les vrais
 * fichiers empaquetés, exécute une série d'assertions dans la page, puis sort
 * avec 0 ou 1. Utilisable à l'identique depuis la source et depuis l'app
 * installée — c'est le même code qui tourne dans les deux.
 *
 * Le réseau est coupé au niveau de la session (voir `main.cjs`), pas au niveau
 * de la machine : cinq autres sessions travaillent sur cet ordinateur.
 */
const fs = require("node:fs/promises");
const path = require("node:path");

const { ORIGINE } = require("./protocole.cjs");

const CLE_SENTINELLE = "verification:sentinelle";

function ligne(ok, nom, detail) {
  const marque = ok ? "OK  " : "ECHEC";
  console.log(`${marque} ${nom}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** Charge une route et rend `{ ok, erreur }` — un échec de chargement est une
 *  panne, pas une page vide à interpréter. */
function charger(fenetre, url) {
  return new Promise((resoudre) => {
    const surEchec = (_e, code, description, urlEchouee) => {
      // -3 = ERR_ABORTED, émis par les navigations que l'App Router remplace.
      if (code === -3) return;
      nettoyer();
      resoudre({ ok: false, erreur: `${description} (${code}) sur ${urlEchouee}` });
    };
    const surFin = () => {
      nettoyer();
      resoudre({ ok: true });
    };
    const nettoyer = () => {
      fenetre.webContents.off("did-fail-load", surEchec);
      fenetre.webContents.off("did-finish-load", surFin);
    };
    fenetre.webContents.on("did-fail-load", surEchec);
    fenetre.webContents.on("did-finish-load", surFin);
    fenetre.loadURL(url).catch((e) => {
      nettoyer();
      resoudre({ ok: false, erreur: String(e && e.message ? e.message : e) });
    });
  });
}

/** Laisse React monter et les effets client s'exécuter avant de lire le DOM. */
function respirer(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function verifier({ fenetre, requetesExternes, racineWeb }) {
  const erreursConsole = [];
  fenetre.webContents.on("console-message", (evenement) => {
    if (evenement.level === "error") erreursConsole.push(evenement.message);
  });

  const resultats = [];
  console.log("--- verification de l'app de bureau ---");

  // 1. La racine se charge par le protocole personnalisé.
  const racine = await charger(fenetre, `${ORIGINE}/`);
  resultats.push(ligne(racine.ok, "chargement de /", racine.erreur ?? ORIGINE + "/"));
  if (!racine.ok) {
    console.log("\nabandon : la racine ne charge pas, le reste n'aurait aucun sens.");
    return 1;
  }
  await respirer(1500);

  // 2. Une vraie origine — c'est ce que `file://` ne donne pas.
  const origine = await fenetre.webContents.executeJavaScript("location.origin");
  resultats.push(ligne(origine === ORIGINE, "origine de la page", origine));

  // 3. La page rend quelque chose, et pas un écran d'erreur de chargement.
  //
  //    Délibérément PAS d'assertion sur le texte de l'interface : `app/**`
  //    appartient à d'autres sessions et bouge à chaque livraison. Une
  //    assertion qui épingle « Actuariat » ou un code de cours teste leur
  //    travail, casse dès qu'ils livrent, et ne dit rien de l'empaquetage.
  //    Ce qui est à moi, c'est que la page se monte et que les données soient
  //    ATTEIGNABLES — vérifié à l'étape suivante, contre le contrat d'URL.
  const rendu = await fenetre.webContents.executeJavaScript(`(() => {
    const texte = document.body ? document.body.innerText : "";
    return {
      titre: document.title,
      taille: texte.length,
      panne: /failed to fetch|lecture impossible|file:\\/\\/|ne suffit pas/i.test(texte),
      extrait: texte.slice(0, 200).replace(/\\s+/g, " "),
    };
  })()`);
  resultats.push(ligne(rendu.taille > 200, "la page se monte et rend du contenu", `${rendu.taille} caractères`));
  resultats.push(
    ligne(!rendu.panne, "aucun écran d'échec de chargement de données", rendu.panne ? rendu.extrait : "—"),
  );
  console.log(`     extrait : « ${rendu.extrait} »`);

  // 4. LE CONTRAT D'URL, parcouru comme le fait `app/_lib/depot-fichiers.ts` :
  //    `/donnees/index-programmes.json`, puis un programme, puis un sujet.
  //
  //    C'est la vérification qui compte le plus : servir autre chose que
  //    `/donnees` donnerait une app qui s'ouvre et reste vide. On ne se fie
  //    pas à ce que la page affiche — `app/_donnees/source.ts` est encore
  //    branché sur le dépôt de DÉMO, donc l'écran ne prouverait rien du
  //    montage. On interroge le contrat directement.
  const contrat = await fenetre.webContents.executeJavaScript(`(async () => {
    const rapport = { etapes: [], ok: true };
    const lire = async (chemin) => {
      const r = await fetch("/donnees/" + chemin, { cache: "no-store" });
      if (!r.ok) throw new Error(chemin + " a repondu " + r.status);
      return r.json();
    };
    try {
      const index = await lire("index-programmes.json");
      if (!Array.isArray(index.programmes) || index.programmes.length === 0)
        throw new Error("index-programmes.json sans tableau 'programmes'");
      if (!Array.isArray(index.sujets)) throw new Error("index sans tableau 'sujets'");
      rapport.etapes.push("index : " + index.programmes.length + " programmes, " + index.sujets.length + " sujets");

      const id = index.programmes[0].id;
      const prog = await lire("programmes/" + id + ".json");
      if (!Array.isArray(prog.blocs)) throw new Error("programmes/" + id + ".json sans 'blocs'");
      rapport.etapes.push("programme '" + id + "' : " + prog.blocs.length + " blocs");

      const sujet = index.sujets[0];
      const fichierSujet = await lire("cours/" + sujet + ".json");
      const nb = Array.isArray(fichierSujet)
        ? fichierSujet.length
        : Array.isArray(fichierSujet.cours)
          ? fichierSujet.cours.length
          : Object.keys(fichierSujet.cours ?? fichierSujet).length;
      rapport.etapes.push("sujet '" + sujet + "' : " + nb + " fiches");

      // Tous les sujets annonces par l'index doivent repondre : un seul
      // manquant viderait une branche entiere de l'arbre, sans erreur.
      let manquants = 0;
      for (const s of index.sujets) {
        const r = await fetch("/donnees/cours/" + s + ".json", { cache: "no-store" });
        if (!r.ok) manquants++;
      }
      if (manquants > 0) throw new Error(manquants + " sujet(s) annonces par l'index ne repondent pas");
      rapport.etapes.push("les " + index.sujets.length + " sujets de l'index repondent tous");
    } catch (e) {
      rapport.ok = false;
      rapport.erreur = String(e && e.message ? e.message : e);
    }
    return rapport;
  })()`);
  resultats.push(
    ligne(contrat.ok, "contrat d'URL /donnees/ (index, programme, sujets)", contrat.erreur),
  );
  for (const etape of contrat.etapes) console.log(`     ${etape}`);

  // 5. Un chemin absent répond 404, sans servir l'index à la place.
  const absent = await fenetre.webContents.executeJavaScript(`(async () => {
    const r = await fetch("/donnees/cours/CE-SUJET-N-EXISTE-PAS.json");
    return r.status;
  })()`);
  resultats.push(ligne(absent === 404, "une donnée absente répond 404", `statut ${absent}`));

  // 6. Confinement : aucune remontée hors de la racine servie.
  const evasion = await fenetre.webContents.executeJavaScript(`(async () => {
    const essais = ["/donnees/../../../../Windows/win.ini", "/donnees/%2e%2e%2f%2e%2e%2fpackage.json"];
    const statuts = [];
    for (const u of essais) { try { statuts.push((await fetch(u)).status); } catch { statuts.push("rejet"); } }
    return statuts;
  })()`);
  resultats.push(
    ligne(
      evasion.every((s) => s !== 200),
      "remontée de répertoire refusée",
      `statuts ${evasion.join(", ")}`,
    ),
  );

  // 7. `localStorage` : lisible, et surtout DURABLE d'un lancement à l'autre.
  //    Sous `file://` cette assertion est celle qui tombe.
  const stockage = await fenetre.webContents.executeJavaScript(`(() => {
    const avant = localStorage.getItem(${JSON.stringify(CLE_SENTINELLE)});
    localStorage.setItem(${JSON.stringify(CLE_SENTINELLE)}, "vu");
    return { avant, apres: localStorage.getItem(${JSON.stringify(CLE_SENTINELLE)}) };
  })()`);
  resultats.push(ligne(stockage.apres === "vu", "localStorage accessible"));
  console.log(
    `     sentinelle trouvée au démarrage : ${
      stockage.avant === null ? "aucune (1er lancement)" : JSON.stringify(stockage.avant)
    }`,
  );

  // 8. TOUTES les routes de l'export, découvertes dans `out/` et non listées
  //    en dur : les sessions UI ajoutent des routes (`/programmes`,
  //    `/importer` sont apparues en cours de route) et une liste figée ne les
  //    aurait jamais testées, sans que rien ne le signale.
  const routes = await routesDeLExport(racineWeb);
  console.log(`     routes trouvées dans out/ : ${routes.join(" ") || "aucune"}`);
  for (const route of routes) {
    const r = await charger(fenetre, `${ORIGINE}${route}`);
    let taille = 0;
    if (r.ok) {
      await respirer(900);
      taille = await fenetre.webContents.executeJavaScript(
        "document.body ? document.body.innerText.length : 0",
      );
    }
    resultats.push(
      ligne(r.ok && taille > 200, `route ${route}`, r.erreur ?? `${taille} caractères`),
    );
  }

  // 8 bis. La navigation au CLIC, pas seulement par URL directe.
  //
  // `loadURL` ci-dessus prouve que chaque page se charge ; ça ne prouve pas
  // que l'utilisateur peut passer de l'une à l'autre. L'App Router navigue
  // côté client, et un préchargement de segment qui échoue se voit ici et
  // nulle part ailleurs. Le marqueur posé sur `window` est le juge : s'il
  // survit, il n'y a pas eu de rechargement complet.
  const racine2 = await charger(fenetre, `${ORIGINE}/`);
  if (racine2.ok) {
    await respirer(1200);
    // Les liens sont lus dans la page, pas listés ici — même raison qu'au 8.
    const liens = await fenetre.webContents.executeJavaScript(`(() => {
      const vus = new Map();
      for (const a of document.querySelectorAll("a[href^='/']")) {
        const chemin = new URL(a.href).pathname;
        if (!vus.has(chemin)) vus.set(chemin, a.textContent.trim() || chemin);
      }
      return [...vus].map(([chemin, libelle]) => ({ chemin, libelle }));
    })()`);
    console.log(
      `     liens de navigation trouvés : ${liens.map((l) => l.chemin).join(" ") || "aucun"}`,
    );
    resultats.push(ligne(liens.length > 0, "la page expose des liens de navigation", `${liens.length} lien(s)`));

    for (const { libelle, chemin: cheminAttendu } of liens) {
      const clic = await fenetre.webContents.executeJavaScript(`(async () => {
        window.__marqueur = window.__marqueur || Math.random();
        const temoin = window.__marqueur;
        const lien = [...document.querySelectorAll("a[href^='/']")]
          .find((a) => new URL(a.href).pathname === ${JSON.stringify(cheminAttendu)});
        if (!lien) return { ok: false, detail: "lien introuvable" };
        lien.click();
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 100));
          if (location.pathname === ${JSON.stringify(cheminAttendu)}) break;
        }
        await new Promise((r) => setTimeout(r, 400));
        return {
          ok: location.pathname === ${JSON.stringify(cheminAttendu)},
          rechargee: window.__marqueur !== temoin,
          chemin: location.pathname,
          taille: document.body.innerText.length,
        };
      })()`);
      resultats.push(
        ligne(
          clic.ok && !clic.rechargee && clic.taille > 200,
          `navigation au clic vers « ${libelle} »`,
          clic.detail ??
            `${clic.chemin}, ${clic.taille} caractères, ${
              clic.rechargee ? "RECHARGEMENT COMPLET" : "sans rechargement"
            }`,
        ),
      );
    }
  } else {
    resultats.push(ligne(false, "navigation au clic", "la racine n'a pas rechargé"));
  }

  // 9. Aucune police ni ressource distante dans l'export. `next/font/google`
  //    rapatrie les polices AU BUILD ; si une @font-face pointait encore vers
  //    gstatic, l'app tenterait le réseau à chaque ouverture.
  const distantes = await chercherUrlsDistantes(racineWeb);
  resultats.push(
    ligne(
      distantes.length === 0,
      "aucune URL distante dans out/",
      distantes.length ? distantes.slice(0, 3).join(" | ") : "0 occurrence",
    ),
  );

  // 10. Le verdict hors ligne : rien n'a été tenté hors de `udem://`.
  resultats.push(
    ligne(
      requetesExternes.length === 0,
      "aucune requête réseau tentée",
      requetesExternes.length ? requetesExternes.slice(0, 5).join(" | ") : "0 requête",
    ),
  );

  resultats.push(
    ligne(
      erreursConsole.length === 0,
      "aucune erreur de console",
      erreursConsole.length ? erreursConsole.slice(0, 3).join(" | ") : "0 erreur",
    ),
  );

  const echecs = resultats.filter((r) => !r).length;
  console.log(
    `--- ${resultats.length - echecs}/${resultats.length} assertions passées ---`,
  );
  return echecs === 0 ? 0 : 1;
}

/**
 * Les routes de l'export, lues sur le disque.
 *
 * `next build` écrit un `<route>.html` par page à la racine de `out/`. On les
 * lit plutôt que de les énumérer : une route ajoutée par une autre session est
 * alors testée sans que personne n'ait à penser à modifier ce fichier.
 */
async function routesDeLExport(racine) {
  const ignorees = new Set(["404", "_not-found", "index"]);
  let entrees;
  try {
    entrees = await fs.readdir(racine, { withFileTypes: true });
  } catch {
    return [];
  }
  return entrees
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => e.name.slice(0, -".html".length))
    .filter((nom) => !ignorees.has(nom))
    .sort()
    .map((nom) => `/${nom}`);
}

/**
 * Cherche des URL http(s) dans les fichiers texte de l'export.
 *
 * Les liens `href` vers des pages UdeM sont légitimes (ils s'ouvrent dans le
 * navigateur du système) : on ne retient que ce qu'une page CHARGE toute seule
 * — polices, scripts, styles, images d'un CDN.
 */
async function chercherUrlsDistantes(racine) {
  const suspects = [
    /fonts\.googleapis\.com/g,
    /fonts\.gstatic\.com/g,
    /@font-face[^}]*https?:\/\//g,
    /<script[^>]+src="https?:\/\//g,
    /<link[^>]+href="https?:\/\/[^"]*\.css/g,
    /url\(\s*["']?https?:\/\//g,
  ];
  const trouvees = [];

  async function parcourir(repertoire) {
    let entrees;
    try {
      entrees = await fs.readdir(repertoire, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entree of entrees) {
      const complet = path.join(repertoire, entree.name);
      if (entree.isDirectory()) {
        await parcourir(complet);
        continue;
      }
      if (!/\.(html|css|js|mjs|json|txt)$/i.test(entree.name)) continue;
      let contenu;
      try {
        contenu = await fs.readFile(complet, "utf8");
      } catch {
        continue;
      }
      for (const motif of suspects) {
        const m = contenu.match(motif);
        if (m) trouvees.push(`${path.relative(racine, complet)} : ${m[0].slice(0, 60)}`);
      }
    }
  }

  await parcourir(racine);
  return trouvees;
}

module.exports = { verifier, chercherUrlsDistantes };
