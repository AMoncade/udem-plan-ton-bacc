"use client";

/**
 * CE QUI A ÉTÉ ÉCARTÉ — montré, jamais caché.
 *
 * Un import qui jette la moitié du fichier sans le dire est pire qu'un import
 * qui échoue : l'étudiant croit sa liste complète. Chaque évènement écarté est
 * donc listé avec son rang dans le fichier, son résumé tel quel, sa date de
 * début brute et la raison — y compris « votre sigle est d'une forme que
 * `normaliserCode()` ne sait pas lire », qui est la seule raison demandant une
 * action de sa part.
 */

import type { ResultatImportICS } from "@/lib/ics/types";

export function ImportIgnores({ resultat }: { resultat: ResultatImportICS }) {
  const nb = resultat.ignores.length;
  if (!resultat.estICS) return null;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
        <h2 className="text-[15px] font-semibold">Évènements écartés ({nb})</h2>
        <p className="chiffres text-[12px] text-faible">
          {resultat.cours.length} cours + {nb} écartés pour {resultat.nbEvenements}{" "}
          évènements
        </p>
      </div>

      {nb === 0 ? (
        <p className="mt-3 text-[12.5px] text-doux">
          Aucun : tous les évènements du fichier ont mené à un sigle de cours.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-trait/60 border border-trait">
            {resultat.ignores.map((ignore) => (
              <li key={ignore.rang} className="px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="chiffres text-[11px] text-faible">nº {ignore.rang}</span>
                  <span className="text-[13px] text-papier">
                    {ignore.resume ?? (
                      <span className="italic text-faible">(aucun résumé)</span>
                    )}
                  </span>
                  {ignore.debut === null ? null : (
                    <span className="chiffres text-[11px] text-faible">{ignore.debut}</span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-avert">
                  {ignore.raison}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-faible">
            Un rendez-vous ou un évènement personnel n&apos;a rien à faire dans un relevé :
            son écart est normal. En revanche, si un de vos cours est là, son sigle est
            d&apos;une forme que le projet ne sait pas encore lire — entrez-le à la main
            plus bas, la saisie manuelle accepte la même chose que le reste de
            l&apos;application.
          </p>
        </>
      )}
    </section>
  );
}
