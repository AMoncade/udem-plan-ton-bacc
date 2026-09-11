# Plan ton bacc — UdeM

Planificateur de parcours pour l'Université de Montréal : arbre des préalables,
audit des blocs par segment, et placement des cours par trimestre en tenant
compte de **l'offre réelle** (beaucoup de cours n'existent qu'à l'hiver).

Inspiré de `CBC-Mcgill/McGill-Plan-Your-Degree`, mais UdeM expose des données
bien plus mécanisables : les préalables sont des codes reliés par ET/OU, et les
exigences de programme sont des blocs avec minimums et maximums de crédits.

## Langue

Code, commentaires, commits, docs et UI : **français**. Les données sources le
sont (blocs, segments, préalables) ; traduire n'apporterait que des bogues de
correspondance.

## Pile

Next.js 16 (App Router) · TypeScript · Tailwind 4 · vitest.
Aucune base de données pour l'instant : le catalogue est du JSON statique et le
plan de l'étudiant vit dans `localStorage`. Supabase viendra seulement si la
synchro multi-appareils est demandée — pas avant.

## Commandes

```
npm run dev       # serveur de dev
npm test          # vitest (obligatoire avant tout commit)
npm run scrape    # régénère data/catalogue.json depuis admission.umontreal.ca
```

## Règles qui ont une raison

- **`lib/types.ts` et `lib/codes.ts` sont gelés.** Ils sont l'entrée commune des
  trois chantiers. Un champ renommé là casse deux sessions en silence. Passer
  par la session intégratrice.
- **Tout code de cours passe par `normaliserCode()` avant comparaison.** UdeM
  écrit `ACT 2250`, `ACT2250` et `act-2250` pour le même cours. Comparer deux
  formes différentes ne lève aucune erreur : le graphe s'affiche simplement
  sans arêtes.
- **Un préalable non mécanisable devient un noeud `opaque` qui garde son
  texte, et ne bloque jamais un cours.** Il s'affiche comme avertissement. Ne
  jamais l'avaler en silence : c'est le cas typique où un repli muet rend
  l'audit faux sans qu'aucun test échoue.
- **Un cours référencé par un bloc peut ne pas avoir de fiche** (scrape
  incrémental). Cas normal, à gérer, jamais une exception.
- **Le scraper est poli et met en cache.** `robots.txt` d'admission.umontreal.ca
  n'interdit que `/fileadmin/fichiers/premium/` (vérifié le 2026-09-10), donc
  `/cours-et-horaires/` et `/programmes/` sont permis — ce qui n'autorise pas à
  marteler le serveur. Cache sur disque, délai entre requêtes, jamais de
  re-scrape en boucle de dev.
- **Ne pas inventer de données.** Une fiche de cours non vérifiée est absente,
  pas remplie de `null` plausibles. `prealablesBrut: null` est une affirmation
  forte (« ce cours n'a aucun préalable »), pas un bouche-trou.

## Propriété des fichiers

Voir `docs/CONTRAT.md`. Trois chantiers parallèles, découpés par fichier et non
par fonctionnalité, précisément pour qu'ils ne se rencontrent pas.
