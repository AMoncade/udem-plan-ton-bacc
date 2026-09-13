"use client";

/**
 * « POURQUOI TOUS LES TITRES SONT INCONNUS » — la phrase qui manquait en haut
 * de l'écran.
 *
 * Les blocs d'un programme citent des codes ; les fiches de ces cours viennent
 * d'une autre passe du scrape. Le manque était déjà consigné, mais aux deux
 * endroits où on ne le cherche pas : une ligne de journal par sujet en pied de
 * page, et un message du moteur qui ne se déclenche QUE sur les cours déjà
 * marqués faits. Rien n'était faux dans cet écran — c'était exactement ce que
 * les données disaient. Il était ILLISIBLE : un écran vide ne se distingue pas
 * d'une panne, et l'étudiant n'a aucun moyen de savoir s'il doit fermer
 * l'onglet ou revenir demain.
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
 * ## Deux axes, pas un
 *
 * `niveau` dit l'AMPLEUR du manque, `nature` dit ce qu'on peut en DIRE. Un
 * parcours peut être `aucune` et `definitif`, ou `partielle` et `indetermine`.
 * Les fondre en un seul axe obligerait à taire l'une des deux questions, et
 * c'est la seconde qui décide si l'étudiant a une raison de revenir.
 *
 * L'AMBRE EST RÉSERVÉE À CE QUI PEUT CHANGER. Un manque définitif — la page de
 * l'UdeM ne publie pas les crédits de ce cours — n'est pas un avertissement :
 * c'est une propriété de la source, aussi stable que le nom du programme. Il
 * prend donc la teinte `verrou`, celle que l'app emploie déjà pour ce qui est
 * hors de portée. Peindre en ambre une chose que personne ne peut réparer
 * apprend à l'étudiant que l'ambre ne veut rien dire.
 *
 * ## Le mot « parcours » est dans la phrase exprès
 *
 * Le même trou se compte en parcours et en programmes — une page à sept
 * orientations vaut sept parcours — et les deux comptes sont justes chacun dans
 * son unité. Un nombre affiché sans la sienne sera lu dans l'autre, et
 * quelqu'un finira par « corriger » un chiffre juste.
 *
 * ## Aucun compte global n'apparaît ici, et c'est délibéré
 *
 * « N programmes du catalogue sont incomplétables » serait vrai le temps d'un
 * scrape : on ne sait qu'un code est stérile qu'APRÈS avoir demandé sa page,
 * donc le compte est un plancher qui monte à chaque passe — mesuré, 106 puis
 * 141 codes en vingt minutes le 2026-09-12, sans qu'aucune des deux mesures
 * soit fausse. Ce qui est stable, c'est la phrase sur LE parcours affiché.
 */

import { couvertureFiches, type Couverture } from "@/app/_lib/couverture";
import { useDonnees, useEtat } from "./ProviderEtat";

/** Date d'observation, en clair. Fuseau ÉPINGLÉ : ces pages sont lues à
 *  Montréal, et une observation de 03 h 37 UTC est du 12 septembre là-bas, pas
 *  du 13. Le laisser au fuseau de l'hôte ferait dépendre la date affichée de
 *  l'endroit où le rendu a lieu — y compris d'un rendu serveur, où elle ne
 *  correspondrait plus à celle de l'hydratation. */
const DATE = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Toronto",
});

function jour(iso: string): string {
  return DATE.format(new Date(iso));
}

/**
 * D'où vient le manque, côté FICHIERS. Deux causes distinctes, qui ne se
 * réparent pas pareil et qui coexistent souvent :
 *   - aucun fichier n'existe pour le sigle ;
 *   - le fichier est là et ce cours-ci n'y est pas.
 * N'annoncer que la première ferait passer un fichier incomplet pour un fichier
 * absent — et c'est le cas le plus courant dès que le scrape avance.
 *
 * Aucune des deux ne dit si le manque est temporaire : c'est `<Perspective>`
 * qui répond à ça, et sur une donnée différente.
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
          {/* « Il » quand il n'y a qu'un seul manquant en tout : un chiffre isolé
              en tête de phrase — « 1 appartient à un sigle… » — se lit comme une
              coquille. Dès qu'il y en a plusieurs, le chiffre porte une
              information et reprend sa place. */}
          {couverture.sansFiche === 1 ? (
            "Il appartient"
          ) : (
            <>
              <span className="chiffres text-papier">{ailleurs}</span> d&apos;entre eux{" "}
              {ailleurs === 1 ? "appartient" : "appartiennent"}
            </>
          )}{" "}
          à un sigle déjà collecté, dont le fichier ne porte pas{" "}
          {ailleurs === 1 ? "sa" : "leur"} fiche.
        </>
      ) : null}
    </>
  );
}

/** Quand les pages ont été LUES. Deux bornes plutôt qu'une : les codes d'un
 *  même parcours sont vus lors de tranches différentes, et n'afficher que la
 *  plus récente leur prêterait une fraîcheur qu'ils n'ont pas.
 *
 *  « Lue » et non « vérifié » : personne n'a vérifié quoi que ce soit, une page a
 *  été téléchargée et lue. Le second mot prêterait à la donnée une intention de
 *  contrôle qu'elle n'a pas. */
function Observe({ du, au, n }: { du: string | null; au: string | null; n: number }) {
  if (du === null || au === null) return null;
  const a = jour(du);
  const b = jour(au);
  const sujet = n === 1 ? "page lue" : "pages lues";
  return a === b ? <> ({sujet} le {a})</> : <> ({sujet} entre le {a} et le {b})</>;
}

/**
 * CE QUE L'ÉTUDIANT VEUT SAVOIR : est-ce que ça va arriver ?
 *
 * Trois réponses, et la différence entre elles est ce que ce composant existe
 * pour porter. Le texte ne promet JAMAIS l'arrivée — « pas encore » est une
 * promesse, et une promesse fausse est pire qu'un silence. C'est une correction
 * payée deux fois : d'abord « ces sigles n'ont pas encore été visités », faux
 * dès que le fichier existait et qu'il lui manquait des fiches ; puis « n'ont
 * pas encore été publiées », faux pour tous les cours dont la page ne porte
 * aucune étiquette « Crédits ».
 */
function Perspective({ couverture }: { couverture: Couverture }) {
  const { nature, sansFicheSansCredits: steriles, sansFicheIndetermine: flous } = couverture;

  if (nature === "definitif") {
    const un = steriles === 1;
    return (
      <p className="text-faible">
        {un ? "La page de ce cours" : "La page de chacun de ces cours"} à l&apos;UdeM
        ne publie aucune quantité de crédits
        <Observe du={couverture.observeDu} au={couverture.observeAu} n={steriles} /> : la
        fiche ne peut pas être écrite sans inventer un chiffre. C&apos;est la source qui
        manque, pas la collecte — rien à attendre, et rien à corriger de votre côté.
      </p>
    );
  }

  if (nature === "mixte") {
    return (
      <p className="text-faible">
        Ce n&apos;est pas une panne et il n&apos;y a rien à corriger de votre côté.{" "}
        <span className="chiffres text-papier">{steriles}</span> de ces cours ont une
        page qui ne publie aucune quantité de crédits
        <Observe du={couverture.observeDu} au={couverture.observeAu} n={steriles} /> : leur fiche ne
        peut pas être écrite, et ne le sera pas. Pour{" "}
        <span className="chiffres text-papier">{flous}</span>{" "}
        {flous === 1 ? "autre" : "autres"}, la raison n&apos;est pas consignée — la
        page n&apos;a pas été lue, ou elle l&apos;a été sans qu&apos;une fiche en
        sorte.
      </p>
    );
  }

  // « indetermine » — y compris quand la table n'a pas été fournie du tout,
  // auquel cas c'est bien « on ne sait pas » et non « rien n'est stérile ».
  return (
    <p className="text-faible">
      Ce n&apos;est pas une panne et il n&apos;y a rien à corriger de votre côté. La
      raison du manque n&apos;est pas consignée : la collecte n&apos;a pas atteint ces
      cours, ou leur page ne publie pas de crédits — auquel cas aucune collecte ne les
      ajoutera. Rien ici ne permet de dire laquelle.
    </p>
  );
}

export function CouvertureCours() {
  const { index } = useEtat();
  const donnees = useDonnees();
  // L'index est prêt dès qu'un programme l'est — `demanderProgramme()` ne part
  // qu'après lui. La branche du bas n'est donc pas le cas courant ; elle existe
  // pour que ce composant ne dépende pas de cet ordonnancement. Sans table,
  // `couvertureFiches` classe tout en « indéterminé » et l'écran devient plus
  // prudent : un défaut de câblage ne peut pas produire une phrase fausse.
  const couverture = couvertureFiches(
    donnees,
    index.phase === "pret" ? index.prepare.codesSansCredits : undefined,
  );

  if (couverture.niveau === "complete" || couverture.niveau === "sans-objet") {
    return null;
  }

  // L'ambre signale ce qui peut bouger ; le manque définitif prend la teinte de
  // ce qui est hors de portée. Voir l'en-tête, « Deux axes, pas un ».
  const definitif = couverture.nature === "definitif";

  if (couverture.niveau === "aucune") {
    return (
      <div className="ecran pt-5">
        <div
          className={`max-w-prose border px-4 py-3 ${
            definitif ? "border-verrou/70 bg-verrou/5" : "border-avert/50 bg-avert/5"
          }`}
        >
          <p className="text-[13.5px] font-semibold text-papier">
            {definitif
              ? "Les titres des cours de ce parcours n'existent pas à la source"
              : "Les titres des cours de ce parcours ne figurent pas dans les données"}
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
            <Perspective couverture={couverture} />
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
      <div
        className={`max-w-prose border-l-2 pl-3 text-[12.5px] leading-relaxed text-doux ${
          definitif ? "border-verrou" : "border-avert/60"
        }`}
      >
        <p>
          <span className="chiffres text-papier">{couverture.sansFiche}</span> des{" "}
          <span className="chiffres text-papier">{couverture.cites}</span> cours cités par
          ce parcours n&apos;{un ? "a" : "ont"} pas de fiche dans les données :{" "}
          {un ? "il s'affiche" : "ils s'affichent"} « titre inconnu »,{" "}
          {un ? "ses" : "leurs"} préalables sont inconnus et l&apos;audit{" "}
          {un ? "le" : "les"} compte pour 0 crédit.
          <Causes couverture={couverture} />
        </p>
        {/* La perspective compte AUTANT sur un manque partiel : c'est elle qui
            dit si l'étudiant peut espérer voir ce parcours se compléter. La
            taire ici ferait dépendre l'information de l'ampleur du manque. */}
        <div className="mt-1.5">
          <Perspective couverture={couverture} />
        </div>
      </div>
    </div>
  );
}

