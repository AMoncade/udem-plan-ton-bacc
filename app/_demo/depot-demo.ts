/**
 * LE DÉPÔT DE DÉMONSTRATION — fabrique les données que le scraper n'a pas
 * encore produites, avec la même discipline qu'en v1 :
 *
 *   1. tout est dans `app/_demo/`, rien n'est écrit dans `data/` ;
 *   2. `estFactice: true` allume une bannière visible sur tous les écrans ;
 *   3. le débranchement tient en deux lignes (`app/_donnees/source.ts`).
 *
 * Il a la MÊME interface `Depot` que le dépôt réel, et passe par le même
 * `assembler()`. C'est ce qui fait que le passage au vrai `data/` ne change
 * rien d'autre que la ligne de bascule : l'assemblage, la normalisation des
 * codes, l'expansion des sujets par les préalables et le journal sont éprouvés
 * ici et resserviront tels quels.
 *
 * Les fiches sont fabriquées À LA DEMANDE, pas toutes d'un coup. Ce n'est pas
 * une coquetterie : c'est précisément le comportement qu'on veut du vrai dépôt
 * (charger un programme et ses sujets, pas 12 Mo), donc la démonstration doit
 * l'imiter, sinon on éprouverait une architecture qu'on ne livre pas.
 */
import type { Cours, IndexProgrammes, Programme } from "../../lib/types";
import type { Depot } from "../_lib/depot";
import { fabrique } from "./donnees-demo";

/**
 * Latence simulée, en millisecondes. Zéro par défaut.
 *
 * Mettre 150 le temps d'une séance pour vérifier que les écrans de chargement
 * et d'erreur existent vraiment : une lecture instantanée les rend invisibles,
 * et un écran jamais vu est un écran jamais testé.
 */
export const LATENCE_SIMULEE_MS = 0;

async function respirer(): Promise<void> {
  if (LATENCE_SIMULEE_MS <= 0) return;
  await new Promise((resoudre) => setTimeout(resoudre, LATENCE_SIMULEE_MS));
}

export function creerDepotDemo(): Depot {
  // Fabrique appelée à la PREMIÈRE demande, pas à la création du dépôt.
  // `app/_donnees/source.ts` crée le dépôt au chargement du module, donc un
  // appel direct ici construirait les 482 fiches pendant le rendu serveur de
  // chaque page — exactement le coût de démarrage que ce découpage existe pour
  // éviter, et il serait passé inaperçu puisque rien n'aurait échoué.
  let source: ReturnType<typeof fabrique> | null = null;
  const lire = (): ReturnType<typeof fabrique> => {
    if (source === null) source = fabrique();
    return source;
  };
  const cacheSujets = new Map<string, Cours[]>();

  return {
    origine: "app/_demo/ — DONNÉES FABRIQUÉES, aucune lue sur un site",
    estFactice: true,

    async chargerIndex(): Promise<IndexProgrammes> {
      await respirer();
      return lire().index;
    },

    async chargerProgramme(id: string): Promise<Programme> {
      await respirer();
      const programme = lire().programme(id);
      if (programme === null) {
        // Une absence est dite, jamais rendue comme un programme vide : un
        // écran vide ressemble à un bogue, un message dit ce qui manque.
        const fiche = lire().index.programmes.find((f) => f.id === id);
        if (fiche !== undefined && !fiche.structureLue) {
          throw new Error(
            `« ${fiche.nom} » n'a pas de structure de programme exploitable (${fiche.typeProgramme ?? "type inconnu"}).`,
          );
        }
        throw new Error(`aucun programme de démonstration porte l'identifiant « ${id} ».`);
      }
      return programme;
    },

    async chargerSujet(sujet: string): Promise<Cours[]> {
      await respirer();
      const connu = cacheSujets.get(sujet);
      if (connu !== undefined) return connu;
      const cours = lire().sujet(sujet);
      cacheSujets.set(sujet, cours);
      return cours;
    },
  };
}
