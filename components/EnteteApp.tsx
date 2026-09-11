"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { programme } from "@/app/_donnees/catalogue";
import { MOTEUR_EST_FACTICE } from "@/app/_lib/moteur";
import { BoutonScenario } from "@/app/_demo/BoutonScenario"; // DÉMO — part avec app/_demo/
import { useEtat } from "@/components/ProviderEtat";

const ONGLETS = [
  { href: "/", libelle: "Préalables" },
  { href: "/audit", libelle: "Audit" },
  { href: "/trimestres", libelle: "Trimestres" },
] as const;

/** Marque du projet : trois barres de longueurs inégales — des crédits qui ne
 *  tombent pas juste. Aucun emblème d'université n'a sa place ici. */
function Marque() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="0" y="2" width="16" height="2.5" fill="#e6edf6" />
      <rect x="0" y="6.75" width="10" height="2.5" fill="#93a4bc" />
      <rect x="0" y="11.5" width="5.5" height="2.5" fill="#e0a53e" />
    </svg>
  );
}

export function EnteteApp() {
  const chemin = usePathname();
  const { audit, toutEffacer, faits, plan } = useEtat();
  const vide = faits.size === 0 && Object.keys(plan).length === 0;

  return (
    <header className="sticky top-0 z-30 border-b border-trait bg-encre/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Marque />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            Plan ton bacc
          </span>
        </Link>

        <span className="hidden h-4 w-px bg-trait sm:block" aria-hidden="true" />
        <p className="hidden text-[12.5px] text-doux lg:block">
          {programme.nom}
          {programme.orientation === null ? "" : `, orientation ${programme.orientation.toLowerCase()}`}
        </p>

        <nav className="order-last flex w-full gap-1 sm:order-none sm:ml-auto sm:w-auto">
          {ONGLETS.map((onglet) => {
            const actif = chemin === onglet.href;
            return (
              <Link
                key={onglet.href}
                href={onglet.href}
                aria-current={actif ? "page" : undefined}
                className={`border-b-2 px-3 py-1.5 text-[13.5px] transition-colors ${
                  actif
                    ? "border-papier font-medium text-papier"
                    : "border-transparent text-doux hover:border-trait hover:text-papier"
                }`}
              >
                {onglet.libelle}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4 sm:ml-0">
          <p
            className="text-[12.5px] text-doux"
            title="Crédits comptés vers le diplôme, crédits perdus exclus"
          >
            <span className="chiffres text-[14px] text-papier">{audit.creditsTotal}</span>
            <span className="chiffres"> / {programme.creditsTotal}</span> crédits
          </p>
          <span
            className={`border px-2 py-0.5 text-[12px] ${
              audit.conforme
                ? "border-fait/50 bg-fait/10 text-fait"
                : "border-perdu/50 bg-perdu/10 text-perdu"
            }`}
          >
            {audit.conforme ? "Conforme" : "Non conforme"}
          </span>
          {/* DÉMO — retirer cette ligne avec app/_demo/ */}
          <BoutonScenario />
          <button
            type="button"
            onClick={toutEffacer}
            disabled={vide}
            className="border border-trait px-2.5 py-1 text-[12.5px] text-doux transition-colors hover:border-traitfort hover:text-papier disabled:opacity-40 disabled:hover:border-trait disabled:hover:text-doux"
          >
            Effacer
          </button>
        </div>
      </div>

      {MOTEUR_EST_FACTICE ? (
        <p className="border-t border-avert/25 bg-avert/8 px-5 py-1.5 text-[12px] text-avert sm:px-8">
          Moteur de démonstration : les états et les crédits viennent d&apos;un faux
          moteur, pas de <code>lib/engine</code>. Les cours sans fiche y sont comptés à 3
          crédits — une hypothèse affichée, pas une donnée.
        </p>
      ) : null}
    </header>
  );
}
