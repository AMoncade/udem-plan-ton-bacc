import { ImportEcran } from "@/components/ImportEcran";

export const metadata = { title: "Renseigner les cours réussis" };

/**
 * Écran d'import. Composant serveur minimal : tout le travail est côté client,
 * parce que l'app sera empaquetée en Electron depuis un export statique Next.js.
 * Aucune route d'API, aucun rendu serveur dynamique, le fichier est lu par le
 * navigateur (`File.text()`).
 */
export default function PageImporter() {
  return <ImportEcran />;
}
