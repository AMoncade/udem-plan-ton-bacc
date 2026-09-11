/**
 * LE PARCOURS CHOISI — un magasin externe, comme l'état de l'étudiant.
 *
 * Ce qui est retenu est une CLÉ DE PARCOURS (`slug` ou `slug#orientation`), et
 * non un identifiant de page. L'étudiant ne suit pas « le baccalauréat en
 * mathématiques » : il suit l'orientation actuariat ou l'orientation
 * statistique, qui n'ont ni les mêmes blocs ni la même répartition de crédits.
 *
 * La clé de stockage porte `.v3` parce que `.v2` contenait des identifiants
 * d'une autre forme. Les relire donnerait un écran d'erreur à quelqu'un qui
 * n'a rien fait de mal ; les ignorer lui redemande simplement son parcours.
 *
 * Même raison que `stockage.ts` : le rendu serveur ne voit pas
 * `localStorage`. Lire le choix pendant le rendu produirait deux HTML
 * différents (serveur vide, client rempli) et React abandonnerait
 * l'hydratation. Le magasin donne donc `null` au serveur et au premier rendu
 * client, puis le vrai choix dès que le premier abonnement a lu le disque.
 *
 * Ce n'est pas le même magasin que `stockage.ts` parce que ce n'est pas la même
 * donnée : les cours faits appartiennent à l'étudiant, le programme affiché est
 * une préférence d'affichage. Surtout, `EtatStocke` est une couture utilisée
 * par la session d'import (`lireEtat`, `ecrire`, `abonner`) : y ajouter un
 * champ casserait son travail en silence.
 */
const CLE = "plan-ton-bacc.parcours.v3";

let choix: string | null = null;
let lu = false;
const abonnes = new Set<() => void>();

function prevenir(): void {
  for (const abonne of abonnes) abonne();
}

function relire(): void {
  try {
    const brut = window.localStorage.getItem(CLE);
    choix = typeof brut === "string" && brut !== "" ? brut : null;
  } catch {
    choix = null;
  }
}

export function abonnerSelection(rappel: () => void): () => void {
  abonnes.add(rappel);
  if (!lu) {
    lu = true;
    relire();
    if (typeof window !== "undefined") {
      // Deux onglets ouverts sur l'app restent d'accord sur le programme.
      window.addEventListener("storage", (evenement) => {
        if (evenement.key === CLE) {
          relire();
          prevenir();
        }
      });
    }
    // Après l'hydratation : fait basculer l'écran du vide au choix retenu.
    queueMicrotask(prevenir);
  }
  return () => {
    abonnes.delete(rappel);
  };
}

export function lireSelection(): string | null {
  return choix;
}

/** Instantané du rendu serveur : aucun programme, jamais deviné. */
export function lireSelectionServeur(): null {
  return null;
}

export function choisirParcours(cle: string | null): void {
  choix = cle;
  try {
    if (cle === null) window.localStorage.removeItem(CLE);
    else window.localStorage.setItem(CLE, cle);
  } catch {
    // Navigation privée ou quota plein : le choix reste valable en mémoire.
  }
  prevenir();
}
