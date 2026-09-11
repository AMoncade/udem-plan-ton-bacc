import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { EnteteApp } from "@/components/EnteteApp";
import { ProviderEtat } from "@/components/ProviderEtat";
import { source } from "@/app/_donnees/catalogue";

/* Archivo : grotesque un peu sévère, à l'aise en petits corps serrés — c'est
 * une interface de registre, pas une page d'accueil. IBM Plex Mono ne sert
 * qu'aux codes de cours et aux crédits, où l'alignement des chiffres et un
 * zéro sans ambiguïté font une différence de lecture réelle. */
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: { default: "Plan ton bacc", template: "%s — Plan ton bacc" },
  description:
    "Préalables, audit des blocs et placement par trimestre pour le baccalauréat en mathématiques, orientation actuariat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-encre text-papier">
        <ProviderEtat>
          <EnteteApp />
          <main className="flex-1 w-full">{children}</main>
          <footer className="border-t border-trait px-5 py-4 text-[12px] leading-relaxed text-faible sm:px-8">
            <p>
              Projet personnel sans affiliation avec l&apos;Université de Montréal. Les
              données sont reprises des pages publiques d&apos;admission et peuvent être
              périmées ou incomplètes ; le relevé officiel reste celui du registraire.
            </p>
            <p className="mt-1">
              Source des données : <code className="text-doux">{source.origine}</code>
              {source.partielle
                ? " — fixture partielle : la plupart des cours n'ont pas encore de fiche."
                : null}
            </p>
            {/* Rien de ce que le chargement n'a pas su lire ne disparaît en
                silence : un code refusé par normaliserCode() casse le graphe
                sans lever d'erreur, il doit donc se voir quelque part. */}
            {source.codesIllisibles.length > 0 ? (
              <p className="mt-1 text-avert">
                Codes non normalisables, conservés tels quels :{" "}
                <code>{source.codesIllisibles.join(", ")}</code>
              </p>
            ) : null}
          </footer>
        </ProviderEtat>
      </body>
    </html>
  );
}
