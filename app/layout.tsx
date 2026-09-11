import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { EnteteApp } from "@/components/EnteteApp";
import { PiedApp } from "@/components/PiedApp";
import { ProviderEtat } from "@/components/ProviderEtat";

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
    "Préalables, audit des blocs et placement par trimestre pour les programmes de l'Université de Montréal.",
};

/* `{ children: ReactNode }` plutôt que le `LayoutProps<"/">` généré par Next :
 * l'aide globale n'existe qu'après `next dev`, `next build` ou `next typegen`,
 * donc un `npx tsc --noEmit` sur un dépôt fraîchement cloné échouait ici avec
 * « Cannot find name 'LayoutProps' ». Ce gabarit n'a aucun emplacement nommé à
 * typer, l'aide ne lui apportait rien. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-encre text-papier">
        <ProviderEtat>
          <EnteteApp />
          <main className="flex-1 w-full">{children}</main>
          <PiedApp />
        </ProviderEtat>
      </body>
    </html>
  );
}
