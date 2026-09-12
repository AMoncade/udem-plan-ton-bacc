"use client";

/**
 * LE GARDE DES TROIS VUES.
 *
 * Chaque phase du chargement a son écran, et aucune ne tombe dans le même
 * « rien ». C'est le point qui avait manqué : une fiche sans structure
 * exploitable (année préparatoire, accès-fac) ouvrait un écran vide, qui ne se
 * distingue pas d'un bogue. Ici elle s'explique.
 *
 * Les vues reçoivent des données garanties présentes (`useDonnees()`), donc
 * aucune n'a à vérifier `catalogue === null` — ce qui finissait toujours par
 * afficher des zéros plutôt qu'un message.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { FicheIndex } from "@/lib/types";
import { destinCleParcours, lireCleParcours } from "@/lib/parcours";
import { CouvertureCours } from "./CouvertureCours";
import { useEtat } from "./ProviderEtat";

function Encadre({
  titre,
  ton = "neutre",
  children,
}: {
  titre: string;
  ton?: "neutre" | "avert" | "perdu";
  children: ReactNode;
}) {
  const bord =
    ton === "avert"
      ? "border-avert/50 bg-avert/5"
      : ton === "perdu"
        ? "border-perdu/50 bg-perdu/5"
        : "border-trait bg-relief/40";
  return (
    <div className="ecran py-6">
      <div className={`max-w-prose border ${bord} px-4 py-4`}>
        <h1 className="text-[17px] font-semibold">{titre}</h1>
        <div className="mt-2 space-y-2 text-[13.5px] leading-relaxed text-doux">
          {children}
        </div>
      </div>
    </div>
  );
}

function LienChoisir({ libelle }: { libelle: string }) {
  return (
    <Link
      href="/programmes"
      className="mt-3 inline-block border border-traitfort px-3 py-1.5 text-[13px] text-papier hover:bg-relief"
    >
      {libelle}
    </Link>
  );
}

/**
 * Les orientations que la page porte AUJOURD'HUI, en boutons.
 *
 * Renvoyer l'étudiant au catalogue de 1 480 parcours pour qu'il retrouve le
 * programme qu'il suivait hier serait lui faire payer un changement qui n'est
 * pas le sien. Ici les choix sont nommés et cliquables ; le catalogue reste
 * accessible pour les cas où la page a vraiment disparu.
 */
function ChoixOrientation({
  orientations,
  fiches,
  id,
  choisir,
}: {
  orientations: string[];
  fiches: FicheIndex[];
  id: string | undefined;
  choisir: (cle: string) => void;
}) {
  if (orientations.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {orientations.map((o) => {
        // La clé n'est pas reconstruite à la main : on prend celle de la fiche,
        // qui est la seule forme que l'index reconnaîtra.
        const cible = fiches.find((f) => f.id === id && f.orientation === o);
        if (cible === undefined) return null;
        return (
          <button
            key={o}
            type="button"
            onClick={() => choisir(cible.cle)}
            className="border border-traitfort px-3 py-1.5 text-[13px] text-papier hover:bg-relief"
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Ce que l'étudiant se demande en premier, et la réponse est rassurante. */
function RienDePerdu() {
  return (
    <p className="text-faible">
      Vos cours marqués comme faits ne sont pas touchés : ils sont retenus par code de
      cours, indépendamment du programme affiché.
    </p>
  );
}

export function CadreProgramme({ children }: { children: ReactNode }) {
  const { index, chargement, selection, donnees, choisir } = useEtat();

  // L'index avant tout : sans lui on ne sait même pas quels programmes existent.
  if (index.phase === "erreur") {
    return (
      <Encadre titre="L'index des programmes n'a pas pu être lu" ton="perdu">
        <p className="chiffres text-[12.5px] text-papier">{index.message}</p>
        <p>
          Sans index, aucun programme n&apos;est atteignable. Rien n&apos;est affiché à
          la place : un écran rempli de zéros serait plus trompeur qu&apos;un écran qui
          dit ce qui manque.
        </p>
      </Encadre>
    );
  }
  if (index.phase !== "pret") {
    return (
      <Encadre titre="Lecture de l'index des programmes…">
        <p>Seul l&apos;index est chargé pour l&apos;instant — pas le catalogue complet.</p>
      </Encadre>
    );
  }

  if (selection === null) {
    return (
      <Encadre titre="Aucun programme choisi">
        <p>
          Cette application couvre l&apos;ensemble des programmes de
          l&apos;établissement. Choisissez-en un : les préalables, l&apos;audit des
          blocs et le planificateur s&apos;appliquent ensuite à celui-là.
        </p>
        <p>
          Le choix est retenu d&apos;une visite à l&apos;autre. Les cours marqués comme
          faits, eux, ne dépendent pas du programme affiché : changer de programme ne
          les efface pas.
        </p>
        <LienChoisir libelle="Choisir un programme" />
      </Encadre>
    );
  }

  if (chargement.phase === "sans-structure") {
    return (
      <Encadre titre={chargement.fiche.nom} ton="avert">
        <p>
          Cette page existe, mais elle ne publie pas de structure de programme
          exploitable — pas de blocs, pas de règles de crédits. C&apos;est le cas
          normal pour ce genre de fiche
          {chargement.fiche.typeProgramme === null
            ? ""
            : ` (${chargement.fiche.typeProgramme.toLowerCase()})`}
          : une année préparatoire ou un accès-fac n&apos;est pas un programme à
          auditer.
        </p>
        <p>
          Il n&apos;y a donc rien à afficher ici, et c&apos;est dit plutôt que montré
          comme un programme à zéro bloc.
        </p>
        <LienChoisir libelle="Choisir un autre programme" />
      </Encadre>
    );
  }

  /* Le parcours retenu n'est plus dans l'index. Ce n'est pas une panne : le
     catalogue a bougé sous un choix qui était valide — typiquement un programme
     qu'on lisait sans orientation et qui se révèle en porter plusieurs, donc sa
     clé nue est remplacée par autant de clés `id#Orientation`. L'étudiant n'a
     rien fait de mal, et rien n'a échoué. */
  if (chargement.phase === "disparu") {
    /* Les causes SE DISTINGUENT, et la première version de cet écran affirmait
       le contraire — « rien ne permet de les distinguer d'ici » était vrai le
       temps d'un commit, puis faux. `FicheIndex` porte la clé ET l'identifiant
       de page : si une fiche partage l'`id` de la clé retenue, la page existe
       toujours et on peut NOMMER ses orientations, au lieu de renvoyer
       l'étudiant au catalogue entier pour qu'il retrouve son programme.

       `switch` exhaustif avec garde `never` : c'est pour ça que le destin est
       une union discriminée et non des booléens. Un cinquième cas ajouté plus
       tard casse la compilation au lieu de tomber dans un écran muet. */
    const fiches = index.prepare.entrees.map((e) => e.fiche);
    const destin = destinCleParcours(fiches, chargement.cle);
    const lu = lireCleParcours(chargement.cle);

    const choix = (orientations: string[]) => (
      <ChoixOrientation
        orientations={orientations}
        fiches={fiches}
        id={lu?.id}
        choisir={choisir}
      />
    );

    switch (destin.genre) {
      case "scinde":
        return (
          <Encadre titre="Ce programme se décline maintenant en orientations" ton="avert">
            <p>
              La page que vous suiviez —{" "}
              <span className="chiffres text-papier">{lu?.id}</span> — porte désormais{" "}
              <span className="chiffres text-papier">{destin.orientations.length}</span>{" "}
              orientations. Elles n&apos;ont ni les mêmes blocs ni la même répartition
              de crédits, donc il faut dire laquelle vous suivez : les auditer ensemble
              donnerait un total que personne ne peut atteindre.
            </p>
            {choix(destin.orientations)}
            <RienDePerdu />
          </Encadre>
        );

      case "orientationInconnue":
        return (
          <Encadre titre="Cette orientation n'existe plus sous ce nom" ton="avert">
            <p>
              Le programme est toujours au catalogue, mais l&apos;orientation retenue —{" "}
              <span className="chiffres text-papier">{lu?.orientation}</span> — n&apos;y
              figure plus : elle a été renommée, ou retirée.
              {destin.orientations.length > 0
                ? " Voici celles qu'il porte aujourd'hui."
                : ""}
            </p>
            {choix(destin.orientations)}
            <RienDePerdu />
          </Encadre>
        );

      case "retire":
        return (
          <Encadre titre="Cette page a été retirée du catalogue" ton="avert">
            <p>
              Aucune page ne porte plus l&apos;identifiant{" "}
              <span className="chiffres text-papier">{lu?.id}</span>. Le programme a été
              retiré de l&apos;offre, ou son adresse a changé — rien ici ne permet de
              dire lequel des deux.
            </p>
            <RienDePerdu />
            <LienChoisir libelle="Choisir un autre parcours" />
          </Encadre>
        );

      case "illisible":
        return (
          <Encadre titre="Le parcours retenu est illisible" ton="avert">
            <p>
              La valeur conservée —{" "}
              <span className="chiffres text-papier">{chargement.cle}</span> — n&apos;a
              pas la forme d&apos;une clé de parcours. Elle vient probablement d&apos;une
              version antérieure de l&apos;application.
            </p>
            <RienDePerdu />
            <LienChoisir libelle="Choisir un parcours" />
          </Encadre>
        );

      case "present":
        /* INATTEIGNABLE AUJOURD'HUI, et il faut le dire ainsi plutôt que de la
           présenter comme un détecteur.

           Les deux recherches lisent le même tableau avec le même prédicat :
           `ficheParCle` fait `prepare.entrees.find(e => e.fiche.cle === cle)`,
           `destinCleParcours` fait `fiches.some(f => f.cle === cle)` sur
           `prepare.entrees.map(e => e.fiche)`, et `preparerIndex` est un `map`
           un-pour-un qui ne filtre rien. On n'atteint cet écran que si `find` a
           rendu `undefined` ; `some` ne peut donc pas répondre oui.

           La branche existe parce que l'union est exhaustive — c'est ce que le
           `never` garantit — et PAS parce qu'elle surveille quelque chose. Un
           garde qui ne peut pas se déclencher donne une assurance fausse, et
           c'est le même défaut que le contrôle dont la réponse est connue
           d'avance.

           Elle deviendrait un vrai détecteur le jour où quelqu'un passerait à
           `destinCleParcours` une liste AUTRE que `prepare.entrees` — un index
           filtré, un sous-ensemble chargé à la demande. L'invariant à surveiller
           est celui-là, pas l'écran. */
        return (
          <Encadre titre="Le parcours retenu est introuvable" ton="perdu">
            <p>
              <span className="chiffres text-papier">{chargement.cle}</span> figure dans
              l&apos;index mais n&apos;a pas pu en être extrait. C&apos;est une
              incohérence de l&apos;application, pas une donnée manquante.
            </p>
            <LienChoisir libelle="Choisir un autre parcours" />
          </Encadre>
        );

      default: {
        const jamais: never = destin;
        throw new Error(`destin de clé inconnu : ${JSON.stringify(jamais)}`);
      }
    }
  }

  if (chargement.phase === "erreur") {
    return (
      <Encadre titre="Ce programme n'a pas pu être chargé" ton="perdu">
        <p className="chiffres text-[12.5px] text-papier">{chargement.message}</p>
        <LienChoisir libelle="Choisir un autre programme" />
      </Encadre>
    );
  }

  if (donnees === null) {
    return (
      <Encadre titre="Chargement du programme…">
        <p>
          Le programme et les sujets de cours dont ses blocs parlent sont lus à la
          demande, pas le catalogue entier.
        </p>
      </Encadre>
    );
  }

  // La couverture des fiches se dit AVANT la vue, et une seule fois pour les
  // trois : c'est une propriété du programme chargé, pas de l'onglet regardé.
  // La mettre dans chaque vue la ferait diverger — c'est déjà arrivé au verdict
  // des blocs à contenu ouvert, vert dans l'audit et « invérifiable » à côté.
  return (
    <>
      <CouvertureCours />
      {children}
    </>
  );
}
