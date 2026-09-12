"use client";

/**
 * « POURQUOI TOUS LES TITRES SONT INCONNUS » — la phrase qui manquait en haut
 * de l'écran.
 *
 * Les blocs d'un programme citent des codes ; les fiches de ces cours arrivent
 * par une autre passe du scrape. Sur les 1 027 PARCOURS à structure
 * exploitable, 371 n'ont aucune fiche et 227 en ont moins du quart — après une
 * passe qui a déjà fait tomber ces nombres de 499 et 274 en cinq heures
 * (mesure, unité et péremption : `app/_lib/couverture.ts`). Un certificat de 2e
 * cycle en pratique pharmaceutique s'ouvre donc sur vingt et une lignes « titre
 * inconnu » et un audit à zéro crédit.
 *
 * Rien n'était faux dans cet écran — c'est exactement ce que les données
 * disent. Il était ILLISIBLE : un écran vide ne se distingue pas d'une panne,
 * et l'étudiant n'a aucun moyen de savoir s'il doit fermer l'onglet ou revenir
 * demain. Le manque était déjà consigné, mais aux deux endroits où on ne le
 * cherche pas : une ligne de journal par sujet en pied de page, et un message
 * du moteur qui ne se déclenche QUE sur les cours déjà marqués faits.
 *
 * ## Trois niveaux, et le silence en fait partie
 *
 * `complete` et `sans-objet` n'affichent RIEN. Un bandeau qui apparaît toujours
 * cesse d'être lu, et « toutes les fiches sont là » n'est pas une nouvelle. Un
 * parcours qui ne cite aucun cours — que des blocs au choix — n'a rien à
 * couvrir, et lui annoncer un manque serait faux.
 *
 * Le ton suit l'enjeu plutôt que le volume : « aucune » change ce qu'on peut
 * conclure de l'écran, donc c'est un encadré ; « partielle » n'enlève que des
 * lignes, donc c'est une ligne.
 *
 * ## Le mot « parcours » est dans la phrase exprès
 *
 * Le même trou se comptait, au 2026-09-11, 499 en parcours et 222 en programmes
 * — une page à sept orientations vaut sept parcours, et les deux comptes sont
 * justes chacun dans son unité. Un nombre affiché sans la sienne sera lu dans
 * l'autre, et quelqu'un finira par « corriger » un chiffre juste.
 */

import { couvertureFiches, type Couverture } from "@/app/_lib/couverture";
import { useDonnees } from "./ProviderEtat";

/**
 * D'où vient le manque. Deux causes distinctes, qui ne se réparent pas pareil
 * et qui coexistent souvent :
 *   - le fichier du sigle n'existe pas encore ;
 *   - le fichier est là et ce cours-ci n'y est pas.
 * N'annoncer que la première ferait passer un fichier incomplet pour un fichier
 * absent — et c'est le cas le plus courant dès que le scrape avance.
 */
function Causes({ couverture }: { couverture: Couverture }) {
  const { sujetsSansFichier: sigles, sansFicheSujetPresent: ailleurs } = couverture;
  // Au-delà de huit on compte : un doctorat en cite plus de vingt, et trois
  // lignes de sigles ne se lisent plus.
  const nommes = sigles.slice(0, 8);
  const reste = sigles.length - nommes.length;

  return (
    <>
      {sigles.length > 0 ? (
        <>
          {" "}
          Aucun fichier de cours n&apos;existe encore pour{" "}
          {sigles.length === 1 ? "le sigle" : "les sigles"}{" "}
          <span className="chiffres text-papier">{nommes.join(", ")}</span>
          {reste > 0 ? ` et ${reste} autre${reste === 1 ? "" : "s"}` : ""}.
        </>
      ) : null}
      {ailleurs > 0 ? (
        <>
          {" "}
          <span className="chiffres text-papier">{ailleurs}</span>{" "}
          {ailleurs === 1 ? "appartient" : "appartiennent"} à un sigle déjà collecté,
          dont le fichier ne porte pas encore {ailleurs === 1 ? "sa" : "leur"} fiche.
        </>
      ) : null}
    </>
  );
}

export function CouvertureCours() {
  const donnees = useDonnees();
  const couverture = couvertureFiches(donnees);

  if (couverture.niveau === "complete" || couverture.niveau === "sans-objet") {
    return null;
  }

  if (couverture.niveau === "aucune") {
    return (
      <div className="ecran pt-5">
        <div className="max-w-prose border border-avert/50 bg-avert/5 px-4 py-3">
          <p className="text-[13.5px] font-semibold text-papier">
            Les titres des cours de ce parcours n&apos;ont pas encore été récupérés
          </p>
          <div className="mt-1.5 space-y-2 text-[12.5px] leading-relaxed text-doux">
            <p>
              Ce parcours cite{" "}
              <span className="chiffres text-papier">{couverture.cites}</span> cours, et
              aucun n&apos;a de fiche dans les données.
              <Causes couverture={couverture} />
            </p>
            <p>
              La STRUCTURE reste exacte : les blocs, leurs règles et les crédits exigés
              viennent de la page du programme et sont affichés tels quels. Ce qui manque,
              ce sont les titres, les crédits et les préalables de chaque cours — donc
              l&apos;audit compte ces cours pour 0 crédit et l&apos;arbre des préalables
              est vide. Un verdict de non-conformité est ici sans valeur : il est au pire
              trop sévère, jamais trop clément.
            </p>
            {/* Volontairement muette sur la CAUSE, que `Causes` vient de donner
                juste au-dessus : dire ici « ces sigles n'ont pas encore été
                visités » était faux dès que le fichier existait et qu'il lui
                manquait des fiches — le cas devenu majoritaire à mesure que la
                collecte avance. */}
            <p className="text-faible">
              Ce n&apos;est pas une panne et il n&apos;y a rien à corriger de votre
              côté : les fiches de cours sont récupérées par lots, et celles-ci
              n&apos;ont pas encore été publiées dans les données.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // L'accord se fait sur le nombre de cours sans fiche, pas sur le total : la
  // queue du catalogue est pleine de parcours à qui il ne manque qu'UN cours, et
  // « 1 des 363 cours n'ont pas de fiche » se lit comme une faute d'inattention,
  // donc comme un écran qu'on relit moins.
  const un = couverture.sansFiche === 1;
  return (
    <div className="ecran pt-5">
      <p className="max-w-prose border-l-2 border-avert/60 pl-3 text-[12.5px] leading-relaxed text-doux">
        <span className="chiffres text-papier">{couverture.sansFiche}</span> des{" "}
        <span className="chiffres text-papier">{couverture.cites}</span> cours cités par
        ce parcours n&apos;{un ? "a" : "ont"} pas encore de fiche :{" "}
        {un ? "il s'affiche" : "ils s'affichent"} « titre inconnu »,{" "}
        {un ? "ses" : "leurs"} préalables sont inconnus et l&apos;audit{" "}
        {un ? "le" : "les"} compte pour 0 crédit.
        <Causes couverture={couverture} />
      </p>
    </div>
  );
}
