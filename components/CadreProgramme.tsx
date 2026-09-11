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
    <div className="px-5 py-6 sm:px-8">
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

export function CadreProgramme({ children }: { children: ReactNode }) {
  const { index, chargement, selection, donnees } = useEtat();

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
