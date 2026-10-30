# @clientside-labs/moteur

Le moteur de Plan ton bacc compilé pour un autre client que l'app web : préalables, audit des blocs, offre par trimestre, prochaine session, chevauchements d'horaire, recherche sans accents et chargement à la demande.

`index.ts` est une **façade**. Elle réexporte les modules de `lib/` et `app/_lib/` que l'app web importe déjà, et chaque règle n'a donc qu'une seule source. Le paquet n'est jamais publié sur npm (`private: true`).

```
npm run moteur:build     # compile dans packages/moteur/dist (porte CI : ni DOM ni Node)
npm run moteur:paquet    # archive .tgz pour l'extension, avec le commit gravé
```

La compilation se fait sans DOM ni types Node. Un module réexporté qui touche `window`, `localStorage`, `fetch` ou `node:*` fait donc échouer `moteur:build`.

Le code émis garde des imports relatifs sans extension et vise un **bundler** (Vite, vitest). Node seul ne peut pas l'importer.

Pour mettre l'extension à jour :
1. committer ici ;
2. lancer `npm run moteur:paquet` ;
3. copier le `.tgz` dans `vendor/` de l'extension ;
4. dans l'extension, lancer `npm install ./vendor/<archive>.tgz`.
