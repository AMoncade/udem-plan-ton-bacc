/**
 * LE PROGRAMME CHOISI — un magasin externe, comme l'état de l'étudiant.
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
const CLE = "plan-ton-bacc.programme.v2";

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

export function choisirProgramme(id: string | null): void {
  choix = id;
  try {
    if (id === null) window.localStorage.removeItem(CLE);
    else window.localStorage.setItem(CLE, id);
  } catch {
    // Navigation privée ou quota plein : le choix reste valable en mémoire.
  }
  prevenir();
}
