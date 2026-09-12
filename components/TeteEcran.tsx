import type { ReactNode } from "react";

/**
 * LA TÊTE D'UN ÉCRAN — une ligne, pas un préambule.
 *
 * Les quatre vues ouvraient sur un titre de 26 px suivi de deux ou trois
 * paragraphes. Sur l'écran d'audit, ça faisait trois cents pixels de lecture
 * avant le premier chiffre — et le titre répétait l'onglet déjà souligné dans
 * la barre du haut, donc il n'apprenait rien.
 *
 * Ce qui remplace : le titre au corps d'un libellé de section, et sur la MÊME
 * ligne le fait qui identifie l'écran — de quel programme on parle, combien de
 * blocs, combien de fiches. C'est cette information-là qu'on vient chercher, pas
 * le mot « Audit ».
 *
 * ## Ce qui n'est pas supprimé, et pourquoi
 *
 * Les explications restent, dans un `<details>` replié. Elles disent des choses
 * que l'écran ne peut pas montrer seul — pourquoi un bloc peut être « dans ses
 * bornes » sans que le diplôme soit atteint, pourquoi un cours sans fiche n'est
 * jamais verrouillé. Les effacer au nom de l'épure reviendrait à reprendre ce
 * qu'on a passé la journée à rendre visible.
 *
 * Replier n'est pas cacher : le résumé porte sa propre phrase, il est atteignable
 * au clavier, et il s'ouvre d'un clic. Ce qui disparaît, c'est l'obligation de
 * le relire à chaque visite.
 */
export function TeteEcran({
  titre,
  fait,
  aide,
  actions,
}: {
  titre: string;
  /** Le fait qui identifie CET écran — programme, comptes, portée. Sur la même
   *  ligne que le titre : c'est lui qu'on vient lire. */
  fait?: ReactNode;
  /** Comment lire l'écran. Replié, jamais supprimé. */
  aide?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-trait pb-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[17px] font-semibold leading-none tracking-[-0.01em]">
          {titre}
        </h1>
        {fait ? (
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-doux">{fait}</p>
        ) : (
          <span className="flex-1" />
        )}
        {actions}
      </div>

      {aide ? (
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-faible transition-colors hover:text-doux [&::-webkit-details-marker]:hidden">
            <svg
              width="9"
              height="9"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="transition-transform group-open:rotate-90"
            >
              <path d="M3.5 1.5 L7 5 L3.5 8.5" />
            </svg>
            Comment lire cet écran
          </summary>
          <div className="mt-2 max-w-prose space-y-2 text-[12.5px] leading-relaxed text-doux">
            {aide}
          </div>
        </details>
      ) : null}
    </header>
  );
}
