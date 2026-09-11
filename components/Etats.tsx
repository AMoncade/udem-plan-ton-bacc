/**
 * VOCABULAIRE VISUEL DES ÉTATS — la seule couleur de l'interface.
 *
 * Le châssis est monochrome ; dès qu'une couleur apparaît, elle veut dire
 * quelque chose. Chaque état porte aussi une FORME distincte, pour rester
 * lisible sans la couleur (daltonisme, impression, contraste faible) :
 *   fait          carré plein
 *   disponible    carré évidé, point au centre
 *   verrouillé    carré hachuré
 *   à vérifier    carré avec une barre d'alerte
 *   sans fiche    carré tireté avec « ? »  (pas un état du contrat : une
 *                 absence de donnée, et elle doit se voir comme telle)
 */
import type { EtatCours } from "@/lib/types";

interface Habit {
  nom: string;
  texte: string;
  bord: string;
  fond: string;
  trait: string;
}

export const HABITS: Record<EtatCours, Habit> = {
  fait: {
    nom: "Fait",
    texte: "text-fait",
    bord: "border-fait/50",
    fond: "bg-fait/10",
    trait: "#49b68a",
  },
  disponible: {
    nom: "Disponible",
    texte: "text-dispo",
    bord: "border-dispo/50",
    fond: "bg-dispo/10",
    trait: "#5aa9f0",
  },
  verrouille: {
    nom: "Verrouillé",
    texte: "text-verrou",
    bord: "border-trait",
    fond: "bg-relief",
    trait: "#76889f",
  },
  avertissement: {
    nom: "À vérifier",
    texte: "text-avert",
    bord: "border-avert/50",
    fond: "bg-avert/10",
    trait: "#e0a53e",
  },
};

export function MarqueEtat({
  etat,
  sansFiche = false,
  taille = 12,
}: {
  etat: EtatCours;
  sansFiche?: boolean;
  taille?: number;
}) {
  const habit = HABITS[etat];
  const c = habit.trait;
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="shrink-0"
    >
      {sansFiche ? (
        <>
          <rect
            x="0.5"
            y="0.5"
            width="11"
            height="11"
            fill="none"
            stroke={c}
            strokeDasharray="2 1.6"
          />
          <text
            x="6"
            y="9"
            textAnchor="middle"
            fontSize="8"
            fill={c}
            fontFamily="monospace"
          >
            ?
          </text>
        </>
      ) : etat === "fait" ? (
        <>
          <rect x="0.5" y="0.5" width="11" height="11" fill={c} />
          <path
            d="M2.8 6.2 L5 8.4 L9.2 3.6"
            fill="none"
            stroke="#0e1520"
            strokeWidth="1.6"
          />
        </>
      ) : etat === "disponible" ? (
        <>
          <rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke={c} />
          <rect x="4.5" y="4.5" width="3" height="3" fill={c} />
        </>
      ) : etat === "verrouille" ? (
        <>
          <rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke={c} />
          <path d="M0.5 8 L4 11.5 M0.5 4 L8 11.5 M0.5 0.5 L11.5 11.5 M4 0.5 L11.5 8 M8 0.5 L11.5 4" stroke={c} strokeWidth="0.7" />
        </>
      ) : (
        <>
          <rect x="0.5" y="0.5" width="11" height="11" fill="none" stroke={c} />
          <rect x="5.3" y="2.4" width="1.4" height="4.2" fill={c} />
          <rect x="5.3" y="7.8" width="1.4" height="1.4" fill={c} />
        </>
      )}
    </svg>
  );
}

export function LegendeEtats({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-doux ${className}`}>
      {(Object.keys(HABITS) as EtatCours[]).map((etat) => (
        <li key={etat} className="flex items-center gap-2">
          <MarqueEtat etat={etat} />
          <span className="text-[12.5px]">{HABITS[etat].nom}</span>
        </li>
      ))}
      <li className="flex items-center gap-2">
        <MarqueEtat etat="avertissement" sansFiche />
        <span className="text-[12.5px]">Fiche de cours absente</span>
      </li>
    </ul>
  );
}

/** Titre d'un cours, ou l'aveu que la fiche manque. Jamais « undefined ». */
export function TitreCours({
  titre,
  className = "",
}: {
  titre: string | undefined;
  className?: string;
}) {
  if (titre === undefined) {
    return <span className={`text-faible italic ${className}`}>titre inconnu</span>;
  }
  return <span className={className}>{titre}</span>;
}

/** Crédits d'un cours. `null` s'affiche « ? cr », jamais « 0 cr ». */
export function Credits({
  credits,
  className = "",
}: {
  credits: number | null;
  className?: string;
}) {
  if (credits === null) {
    return <span className={`chiffres text-faible ${className}`}>? cr</span>;
  }
  return (
    <span className={`chiffres ${className}`}>
      {credits.toLocaleString("fr-CA", { maximumFractionDigits: 1 })} cr
    </span>
  );
}
