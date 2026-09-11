/**
 * Processus principal — Plan ton bacc, version bureau.
 *
 * L'app est un export statique Next servi par le protocole `udem://`
 * (voir `electron/protocole.cjs` pour la raison du protocole plutôt que
 * `file://`). Aucune URL distante n'est chargée, jamais.
 *
 * Réglages de sécurité, et ce que chacun coûterait s'il sautait :
 *   - `contextIsolation: true`  — le code de la page ne partage pas son realm
 *     avec les internes d'Electron.
 *   - `nodeIntegration: false`  — pas de `require` dans la page.
 *   - `sandbox: true`           — le renderer tourne dans le bac à sable de
 *     Chromium. Possible ici précisément parce qu'aucun préchargement n'a
 *     besoin de Node : l'app n'utilise que `fetch` et `localStorage`.
 *   - pas de `@electron/remote`, pas de `webviewTag`.
 *
 * Il n'y a délibérément AUCUN script de préchargement : l'app n'a pas d'IPC à
 * faire. Un préload vide est une surface d'attaque sans contrepartie.
 */
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");

const { ORIGINE, declarerSchema, installerProtocole, SCHEMA } = require("./protocole.cjs");

/**
 * Racines servies.
 *
 * `__dirname` vaut `<racine>/electron` en développement comme dans l'archive
 * asar (`.../app.asar/electron`) : les modules `fs` d'Electron lisent dans
 * l'asar de façon transparente, donc un seul calcul de chemin suffit pour les
 * deux cas. Si `out/` ou `data/` cessaient d'être empaquetés à cet endroit,
 * `verifier.cjs` le dirait — pas de repli qui masque l'absence.
 */
const RACINE_APP = path.join(__dirname, "..");
const RACINE_WEB = path.join(RACINE_APP, "out");
const RACINE_DONNEES = path.join(RACINE_APP, "data");

const MODE_VERIFICATION = process.argv.includes("--verifier");

/**
 * `--capture <fichier.png>` : rend la page dans un PNG puis quitte.
 *
 * Capture le contenu de la FENÊTRE, via `capturePage()`, et non l'écran : une
 * capture d'écran dépend du premier plan et embarque tout ce qui traîne sur le
 * bureau de l'utilisateur — ce qui est à la fois peu fiable et indiscret.
 */
const ARG_CAPTURE = process.argv.indexOf("--capture");
const FICHIER_CAPTURE = ARG_CAPTURE === -1 ? null : process.argv[ARG_CAPTURE + 1];
/** `--route /programmes` pour photographier autre chose que l'accueil. */
const ARG_ROUTE = process.argv.indexOf("--route");
const ROUTE_DEPART = ARG_ROUTE === -1 ? "/" : process.argv[ARG_ROUTE + 1];

declarerSchema();

/** Une seule instance : deux fenêtres sur le même `localStorage` se marchent dessus. */
if (!MODE_VERIFICATION && !app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

/**
 * Tout ce que l'app tente d'atteindre hors de `udem://` est refusé ET consigné.
 *
 * C'est la mesure du « hors ligne » : plutôt que de couper la carte réseau de
 * la machine (cinq autres sessions travaillent dessus), on coupe le réseau du
 * point de vue de l'app. Si la liste reste vide et que les vues s'affichent,
 * l'app ne dépend de rien d'externe — preuve plus forte qu'un câble débranché,
 * puisqu'elle est reproductible.
 */
const requetesExternes = [];

function bloquerLeReseau(sess) {
  sess.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.startsWith(`${SCHEMA}://`) || details.url.startsWith("devtools://")) {
      callback({ cancel: false });
      return;
    }
    requetesExternes.push(`${details.method} ${details.url}`);
    callback({ cancel: true });
  });

  // Aucune permission n'est nécessaire à un planificateur de cours.
  sess.setPermissionRequestHandler((_contenu, _permission, refuser) => refuser(false));
  sess.setPermissionCheckHandler(() => false);
}

function creerFenetre() {
  const fenetre = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Le fond du thème (`--color-encre`, app/globals.css) : sans lui la
    // fenêtre clignote en blanc avant le premier rendu, ce qui est violent
    // sur une interface sombre.
    backgroundColor: "#0e1520",
    title: "Plan ton bacc",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  fenetre.once("ready-to-show", () => {
    if (!MODE_VERIFICATION) fenetre.show();
  });

  // Un lien externe s'ouvre dans le navigateur du système, jamais dans la
  // fenêtre de l'app : une page distante dans cette fenêtre hériterait de son
  // origine et de son `localStorage`.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  fenetre.webContents.on("will-navigate", (evenement, url) => {
    if (!url.startsWith(ORIGINE)) {
      evenement.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  fenetre.webContents.on("will-attach-webview", (evenement) => evenement.preventDefault());

  return fenetre;
}

app.whenReady().then(async () => {
  bloquerLeReseau(session.defaultSession);
  installerProtocole({
    racineWeb: RACINE_WEB,
    racineDonnees: RACINE_DONNEES,
    journaliser: (message) => console.warn(`[protocole] ${message}`),
  });

  const fenetre = creerFenetre();

  if (MODE_VERIFICATION) {
    const { verifier } = require("./verifier.cjs");
    const code = await verifier({ fenetre, requetesExternes, racineWeb: RACINE_WEB });
    app.exit(code);
    return;
  }

  await fenetre.loadURL(`${ORIGINE}${ROUTE_DEPART}`);

  if (FICHIER_CAPTURE) {
    // Laisse React monter et les polices se poser avant de photographier.
    await new Promise((r) => setTimeout(r, 2500));
    const image = await fenetre.webContents.capturePage();
    require("node:fs").writeFileSync(FICHIER_CAPTURE, image.toPNG());
    console.log(`capture ecrite : ${FICHIER_CAPTURE}`);
    app.exit(0);
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre().loadURL(`${ORIGINE}/`);
  });
});

app.on("second-instance", () => {
  const [fenetre] = BrowserWindow.getAllWindows();
  if (fenetre) {
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Refus global d'ouvrir quoi que ce soit d'autre que l'origine de l'app.
app.on("web-contents-created", (_evenement, contenu) => {
  contenu.on("will-navigate", (evenement, url) => {
    if (!url.startsWith(ORIGINE)) evenement.preventDefault();
  });
});
