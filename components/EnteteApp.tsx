"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { depot } from "@/app/_donnees/source";
import { MOTEUR_EST_FACTICE } from "@/app/_lib/moteur";
import { verdictAffiche } from "@/app/_lib/verdict";
import { useEtat } from "@/components/ProviderEtat";

/* L'ordre suit le parcours d'usage : on choisit un programme, on déclare ce
 * qu'on a déjà fait, puis on lit les trois vues. « Relevé » est l'écran
 * d'import livré par la session d'import ; il était prérendu mais n'apparaissait
 * dans aucun onglet, donc inatteignable autrement qu'en tapant l'URL. */
const ONGLETS = [
  { href: "/programmes", libelle: "Programmes" },
  { href: "/importer", libelle: "Relevé" },
  { href: "/", libelle: "Préalables" },
  { href: "/audit", libelle: "Audit" },
  { href: "/session", libelle: "Prochaine session" },
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
  const { donnees, toutEffacer, faits, plan } = useEtat();
  const vide = faits.size === 0 && Object.keys(plan).length === 0;
  const [arme, setArme] = useState(false);

  const programme = donnees?.programme ?? null;
  const audit = donnees?.audit ?? null;
  const verdict = audit === null ? null : verdictAffiche(audit, faits);

  return (
    <header className="sticky top-0 z-30 border-b border-trait bg-encre/95 backdrop-blur">
      <div className="ecran flex flex-wrap items-center gap-x-6 gap-y-2 py-2 sm:gap-y-3 sm:py-3">
        <Link href="/programmes" className="flex items-center gap-2.5">
          <Marque />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            Plan ton bacc
          </span>
        </Link>

        <span className="hidden h-4 w-px bg-trait sm:block" aria-hidden="true" />
        <p className="hidden min-w-0 max-w-[34ch] truncate text-[12.5px] text-doux lg:block">
          {programme === null ? (
            <span className="text-faible italic">aucun programme choisi</span>
          ) : (
            <>
              {programme.nom}
              {programme.orientation === null
                ? ""
                : `, orientation ${programme.orientation.toLowerCase()}`}
            </>
          )}
        </p>

        {/* BANDE DÉFILANTE SOUS `sm`, ET NON UN RETOUR À LA LIGNE.

            Mesuré dans un iframe de 375 px : sans `overflow-x-auto`, les six
            onglets débordaient à 524 px et c'était la cause de débordement
            COMMUNE à toutes les pages — `/programmes` n'en avait aucune autre.
            Un `flex-wrap` aurait réglé le débordement en aggravant l'autre
            défaut : l'entête est `sticky` et mesurait déjà 176 px, soit 22 %
            d'un écran de 812, en permanence et sur chaque page. Une deuxième
            ligne d'onglets l'aurait épaissi encore.

            `shrink-0` sur les liens : sans lui, flex les comprime au lieu de
            les faire défiler, et « Prochaine session » devient « Prochaine
            ses… ». */}
        <nav className="order-last -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 sm:order-none sm:ml-auto sm:w-auto sm:overflow-visible sm:px-0" style={{ scrollbarWidth: "none" }}>
          {ONGLETS.map((onglet) => {
            const actif = chemin === onglet.href;
            return (
              <Link
                key={onglet.href}
                href={onglet.href}
                aria-current={actif ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-[13.5px] transition-colors ${
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
          {audit !== null && programme !== null ? (
            <>
              <p
                className="text-[12.5px] text-doux"
                title="Crédits comptés vers le diplôme, crédits perdus exclus"
              >
                <span className="chiffres text-[14px] text-papier">
                  {audit.creditsTotal}
                </span>
                {/* `creditsTotal` peut être null : la v1 affichait « NaN crédits ». */}
                <span className="chiffres">
                  {" / "}
                  {programme.creditsTotal === null ? (
                    <span className="text-faible" title="Le programme n'annonce pas de total de crédits">
                      ?
                    </span>
                  ) : (
                    programme.creditsTotal
                  )}
                </span>{" "}
                crédits
              </p>
              {/* TROIS ÉTATS, ET LE TROISIÈME EST LE PLUS FRÉQUENT AU PREMIER
                  CONTACT. « Non conforme » s'affichait avant que l'étudiant ait
                  saisi un seul cours — exact au sens du moteur, puisqu'un relevé
                  vide ne satisfait aucun minimum, et destructeur au sens de
                  l'écran : un verdict d'échec adressé à quelqu'un qui n'a rien
                  fait de mal n'enseigne qu'une chose, que le badge ne veut rien
                  dire. Il emporte alors avec lui les verdicts qui comptent.

                  Le troisième état ne masque pas le badge, il dit ce qui est
                  vrai — rien n'a été saisi — et porte l'action suivante. Un trou
                  là où l'étudiant a appris à lire un état serait une autre
                  manière de ne rien dire. Voir `app/_lib/verdict.ts`. */}
              {verdict === "rien-saisi" ? (
                <Link
                  href="/importer"
                  className="border border-trait px-2 py-0.5 text-[12px] text-doux transition-colors hover:border-traitfort hover:text-papier"
                >
                  Rien de saisi — ajoutez vos cours réussis →
                </Link>
              ) : (
                <span
                  className={`border px-2 py-0.5 text-[12px] ${
                    verdict === "conforme"
                      ? "border-fait/50 bg-fait/10 text-fait"
                      : "border-perdu/50 bg-perdu/10 text-perdu"
                  }`}
                >
                  {verdict === "conforme" ? "Conforme" : "Non conforme"}
                </span>
              )}
            </>
          ) : null}
          {/* DEUX TEMPS, parce que ce bouton détruit ce qui ne se reconstitue
              pas. Il effaçait tous les cours faits et tout le plan au premier
              clic, sans confirmation ni annulation, sous un libellé d'un mot
              collé au compteur de crédits.

              Les cours faits sont la seule donnée que l'étudiant a TAPÉE :
              un parcours se re-choisit en un clic, quarante sigles se
              retapent un par un. Un premier clic arme, un second efface, et
              « Annuler » désarme — pas de fenêtre modale, rien à fermer si on
              a cliqué par erreur.

              Une vraie annulation APRÈS coup vaudrait mieux encore ; elle
              demande de garder l'état précédent dans `app/_lib/stockage.ts`,
              qui n'est pas dans ce lot. */}
          {arme ? (
            <>
              <button
                type="button"
                onClick={() => {
                  toutEffacer();
                  setArme(false);
                }}
                aria-label="Confirmer l'effacement de tous les cours faits et du plan"
                className="border border-perdu px-2.5 py-1 text-[12.5px] text-perdu transition-colors hover:bg-perdu hover:text-encre"
              >
                Tout effacer ?
              </button>
              <button
                type="button"
                onClick={() => setArme(false)}
                className="px-2 py-1 text-[12.5px] text-doux underline underline-offset-2 hover:text-papier"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setArme(true)}
              disabled={vide}
              title="Retire tous les cours marqués faits et vide le plan par trimestre."
              aria-label="Effacer les cours faits et le plan"
              className="border border-trait px-2.5 py-1 text-[12.5px] text-doux transition-colors hover:border-traitfort hover:text-papier disabled:opacity-40 disabled:hover:border-trait disabled:hover:text-doux"
            >
              Effacer les cours faits
            </button>
          )}
        </div>
      </div>

      {/* LA BANNIÈRE DU FAUX. Pilotée par le dépôt lui-même, pas par un drapeau
          séparé : la bascule de `app/_donnees/source.ts` l'éteint toute seule. */}
      {depot.estFactice ? (
        <div className="border-t border-avert/25 bg-avert/8">
          <p className="ecran py-1.5 text-[12px] text-avert">
            <strong className="font-semibold">Données fabriquées.</strong> Les noms de
            programmes, les codes de cours, les crédits, les préalables et les horaires
            affichés sont INVENTÉS (<code>app/_demo/</code>) : aucun n&apos;a été lu sur
            un site. Rien ici ne doit servir à s&apos;inscrire à quoi que ce soit.
          </p>
        </div>
      ) : null}

      {MOTEUR_EST_FACTICE ? (
        <div className="border-t border-avert/25 bg-avert/8">
          <p className="ecran py-1.5 text-[12px] text-avert">
            Moteur de démonstration : les états et les crédits viennent d&apos;un faux
            moteur, pas de <code>lib/engine</code>.
          </p>
        </div>
      ) : null}
    </header>
  );
}
