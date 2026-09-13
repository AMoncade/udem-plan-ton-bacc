"use client";

/**
 * UNE ZONE QUI DÉFILE HORIZONTALEMENT, ET QUI LE DIT.
 *
 * `overflow-x-auto` règle le débordement et crée un défaut plus discret : sur un
 * téléphone, la barre de défilement est en surimpression et disparaît au repos,
 * donc rien n'indique qu'il reste du contenu à droite. Mesuré dans un iframe de
 * 375 px, la table de l'audit fait 820 px de large : **plus de la moitié des
 * colonnes est invisible sans le moindre indice qu'elles existent** — Retenus,
 * Remplissage, Manquants, Perdus, Conformité.
 *
 * ## Pourquoi une phrase et pas un dégradé
 *
 * Le procédé habituel est un fondu sur le bord droit. Le système visuel de ce
 * projet n'a aucun dégradé, aucune ombre, aucun arrondi, et c'est délibéré.
 * Ajouter un fondu pour signaler un défilement introduirait le premier dégradé
 * de l'application au seul endroit où on veut être compris. Une phrase dit la
 * même chose, se lit à la loupe d'écran, et ne coûte rien au reste.
 *
 * ## Elle n'apparaît que si c'est VRAI
 *
 * `sm:hidden` aurait suffi à peu de frais, mais aurait annoncé un défilement à
 * des largeurs où il n'y en a pas — et un avertissement qui se déclenche à tort
 * cesse d'être lu, comme l'ambre qu'on peint sur ce que personne ne peut
 * réparer. La comparaison `scrollWidth > clientWidth` est la mesure exacte, et
 * elle se refait à chaque redimensionnement.
 *
 * Le rendu serveur n'a ni largeur ni élément : `defile` part donc à `false` et
 * la phrase apparaît après l'hydratation. C'est le bon sens du défaut — on
 * n'annonce pas un défilement qu'on n'a pas encore pu constater.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Defilable({
  children,
  quoi,
  className = "",
}: {
  children: ReactNode;
  /** Ce qu'il y a à droite, au pluriel : « colonnes », « trimestres ». La
   *  phrase nomme le contenu plutôt que le geste — « faites défiler » ne dit pas
   *  ce qu'on y gagne. */
  quoi: string;
  className?: string;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [defile, setDefile] = useState(false);

  useEffect(() => {
    const el = boite.current;
    if (el === null) return;
    const mesurer = () => setDefile(el.scrollWidth > el.clientWidth + 1);
    mesurer();
    // Le contenu change aussi sans que la fenêtre bouge — un filtre qui ajoute
    // des colonnes, un cours qu'on retire. `ResizeObserver` voit les deux.
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [children]);

  return (
    <>
      {defile ? (
        <p className="mt-2 text-[11.5px] text-faible" role="status">
          ↔ D&apos;autres {quoi} existent à droite : la zone ci-dessous défile
          horizontalement.
        </p>
      ) : null}
      <div ref={boite} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
    </>
  );
}
