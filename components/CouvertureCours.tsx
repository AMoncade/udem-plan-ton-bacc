"use client";

/**
 * « POURQUOI TOUS LES TITRES SONT INCONNUS » — la phrase qui manquait en haut
 * de l'écran.
 *
 * Les blocs d'un programme citent des codes ; les fiches de ces cours arrivent
 * par une autre passe du scrape. Sur les 1 054 PARCOURS à structure
 * exploitable, 268 n'ont encore aucune fiche — après trois passes qui ont fait
 * tomber ce nombre de 499 à 371 puis à 268 en une journée (mesure, unité et
 * péremption : `app/_lib/couverture.ts`). Le besoin tient tant que ce nombre
 * n'est pas zéro : un parcours sans aucune fiche s'ouvre sur des lignes « titre
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
 *   - aucun fichier n'existe pour le sigle ;
 *   - le fichier est là et ce cours-ci n'y est pas.
 * N'annoncer que la première ferait passer un fichier incomplet pour un fichier
 * absent — et c'est le cas le plus courant dès que le scrape avance.
 *
 * Aucune des deux ne dit si le manque est temporaire : voir l'encadré plus bas,
 * et la raison pour laquelle le mot « encore » n'apparaît nulle part ici.
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
          Aucun fichier de cours n&apos;existe pour{" "}
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
          dont le fichier ne porte pas {ailleurs === 1 ? "sa" : "leur"} fiche.
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
            Les titres des cours de ce parcours ne figurent pas dans les données
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
            {/* NE PROMET PAS L'ARRIVÉE, et c'est une correction payée deux fois.
                D'abord « ces sigles n'ont pas encore été visités », faux dès que
                le fichier existait et qu'il lui manquait des fiches. Puis
                « n'ont pas encore été publiées », faux pour une part du
                catalogue : certains blocs citent un code dont la page UdeM ne
                porte AUCUNE étiquette « Crédits ». Le scraper refuse alors
                d'écrire la fiche, et il a raison — les seules occurrences de
                « crédits » sur ces pages sont les « 90 crédits » des programmes
                qui citent le cours, donc les lire donnerait au cours les crédits
                de son programme. Ces fiches n'arriveront jamais.

                AUCUN COMPTE N'EST ÉCRIT ICI, ET C'EST LE POINT. On ne sait
                qu'un code est stérile qu'APRÈS avoir demandé sa page : le compte
                est un plancher qui monte à chaque passe. Il est passé de 106 à
                141 codes en vingt minutes le 2026-09-12, sans qu'aucune mesure
                soit fausse — la seconde avait juste vu plus de pages. Un nombre
                affiché serait juste le temps d'un scrape. Ce qui est stable,
                c'est la phrase par PARCOURS : celui-ci cite tant de cours sans
                fiche, et on ne sait pas laquelle des deux causes s'applique.

                « Pas encore » est une promesse, et une promesse fausse est pire
                qu'un silence. L'écran énonce donc les deux issues sans trancher
                — il ne peut pas les distinguer : une fiche absente parce qu'on
                ne l'a pas lue et une fiche absente parce que la page n'en publie
                pas se ressemblent exactement d'ici. La distinction n'est PAS
                dérivable de `data/` : elle vit dans le cache du scraper, qui
                n'appartient pas à l'app. La nommer exigerait qu'elle soit émise
                — un `IndexProgrammes.codesSansFiche`, « ces codes ont été
                demandés et n'ont pas de fiche ». Tant que ce champ n'existe pas,
                énumérer les deux causes est le maximum de vrai disponible. */}
            <p className="text-faible">
              Ce n&apos;est pas une panne et il n&apos;y a rien à corriger de votre
              côté. Deux raisons possibles : la collecte n&apos;a pas encore atteint
              ces cours, ou leur page ne publie pas de crédits — auquel cas aucune
              collecte ne les ajoutera. Rien ici ne permet de dire laquelle.
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
        ce parcours n&apos;{un ? "a" : "ont"} pas de fiche dans les données :{" "}
        {un ? "il s'affiche" : "ils s'affichent"} « titre inconnu »,{" "}
        {un ? "ses" : "leurs"} préalables sont inconnus et l&apos;audit{" "}
        {un ? "le" : "les"} compte pour 0 crédit.
        <Causes couverture={couverture} />
      </p>
    </div>
  );
}
