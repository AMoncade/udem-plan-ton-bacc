"use client";

/**
 * D'OÙ VIENT LE TEXTE ICS — trois entrées, zéro serveur.
 *
 * 1. déposer un fichier .ics
 * 2. le choisir dans un sélecteur
 * 3. coller son contenu — le seul chemin qui marche toujours : fichier sur un
 *    autre poste, pièce jointe ouverte dans un webmail, horaire reçu par
 *    courriel. Sur une machine d'université verrouillée, c'est souvent le seul.
 *
 * La lecture passe par `File.text()` : rien ne part sur le réseau, et l'écran
 * fonctionne dans l'export statique qui servira à l'empaquetage Electron.
 */

import { useRef, useState } from "react";
import { ICS_EXEMPLE } from "@/lib/ics/__fixtures__/exemple";

/** Au-delà, ce n'est pas un horaire : on refuse plutôt que de figer l'écran. */
const TAILLE_MAX = 4 * 1024 * 1024;

export function ImportSource({
  origine,
  onTexte,
}: {
  origine: string | null;
  onTexte: (texte: string, nom: string) => void;
}) {
  const [survol, setSurvol] = useState(false);
  const [colle, setColle] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  async function lireFichier(fichier: File | undefined): Promise<void> {
    setErreur(null);
    if (fichier === undefined) return;
    if (fichier.size > TAILLE_MAX) {
      setErreur(
        `« ${fichier.name} » fait ${Math.round(fichier.size / 1024)} ko : trop gros pour un horaire de trimestre. Vérifiez que c'est bien le fichier .ics.`,
      );
      return;
    }
    try {
      onTexte(await fichier.text(), fichier.name);
    } catch {
      // Un fichier supprimé ou déplacé entre la sélection et la lecture.
      setErreur(
        `Impossible de lire « ${fichier.name} ». Réessayez, ou collez le contenu du fichier ci-dessous.`,
      );
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-trait pb-2">
        <h2 className="text-[15px] font-semibold">Depuis un horaire exporté (.ics)</h2>
        {origine === null ? null : (
          <p className="text-[12px] text-faible">
            lu : <code className="text-doux">{origine}</code>
          </p>
        )}
      </div>

      <div
        onDragOver={(evenement) => {
          evenement.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(evenement) => {
          evenement.preventDefault();
          setSurvol(false);
          void lireFichier(evenement.dataTransfer.files[0]);
        }}
        className={`mt-3 border border-dashed px-4 py-6 text-center transition-colors ${
          survol ? "border-dispo bg-dispo/8" : "border-traitfort bg-creux"
        }`}
      >
        <p className="text-[13px] text-doux">
          Déposez ici le fichier <code className="text-papier">.ics</code> exporté par
          l&apos;extension.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => champ.current?.click()}
            className="border border-trait px-3 py-1.5 text-[12.5px] text-papier transition-colors hover:border-traitfort"
          >
            Choisir un fichier…
          </button>
          <button
            type="button"
            onClick={() => onTexte(ICS_EXEMPLE, "horaire d'exemple (Automne 2026)")}
            className="border border-trait px-3 py-1.5 text-[12.5px] text-doux transition-colors hover:border-traitfort hover:text-papier"
            title="Un horaire produit par le générateur réel de l'extension, pour voir à quoi ressemble l'écran"
          >
            Charger un horaire d&apos;exemple
          </button>
        </div>
        <input
          ref={champ}
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          onChange={(evenement) => {
            void lireFichier(evenement.target.files?.[0]);
            // Remis à zéro pour que rechoisir le même fichier déclenche encore.
            evenement.target.value = "";
          }}
        />
      </div>

      {erreur === null ? null : (
        <p className="mt-2 border-l-2 border-perdu/60 bg-perdu/5 px-3 py-2 text-[12.5px] text-papier">
          {erreur}
        </p>
      )}

      <details className="mt-3 border border-trait bg-relief/30">
        <summary className="cursor-pointer px-3 py-2 text-[12.5px] text-doux transition-colors hover:text-papier">
          Ou coller le contenu du fichier
        </summary>
        <div className="border-t border-trait px-3 py-3">
          <label htmlFor="ics-colle" className="block text-[12px] text-faible">
            Ouvrez le .ics dans un éditeur de texte et collez tout ici. Utile quand le
            fichier est sur un autre appareil ou dans un courriel.
          </label>
          <textarea
            id="ics-colle"
            value={colle}
            onChange={(evenement) => setColle(evenement.target.value)}
            rows={5}
            spellCheck={false}
            placeholder={"BEGIN:VCALENDAR\nVERSION:2.0\n…"}
            className="chiffres mt-2 w-full resize-y border border-trait bg-creux px-2.5 py-2 text-[12px] text-papier placeholder:text-faible/70"
          />
          <button
            type="button"
            onClick={() => {
              setErreur(null);
              onTexte(colle, "texte collé");
            }}
            disabled={colle.trim() === ""}
            className="mt-2 border border-trait px-3 py-1.5 text-[12.5px] text-papier transition-colors hover:border-traitfort disabled:text-faible disabled:hover:border-trait"
          >
            Lire ce texte
          </button>
        </div>
      </details>
    </section>
  );
}
