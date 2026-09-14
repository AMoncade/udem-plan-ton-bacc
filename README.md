# Plan ton bacc — UdeM

Planifier son parcours à l'Université de Montréal : voir quels cours sont
déverrouillés, ce qu'il manque dans chaque bloc pour obtenir le diplôme, et
**quand les cours sont réellement offerts**.

Version web : <https://udem-plan-ton-bacc.vercel.app>

Inspiré de `CBC-Mcgill/McGill-Plan-Your-Degree`, mais UdeM expose des données
nettement plus mécanisables.

## Ce que ça fait

Six onglets, dans l'ordre où on s'en sert :

1. **Programmes** : choisir son programme parmi tout le catalogue de l'UdeM,
   puis son orientation ou son cheminement s'il y en a. La recherche ignore les
   accents et l'ordre des mots.
2. **Relevé** : déclarer les cours réussis, à la main ou à partir d'un horaire
   `.ics` (par exemple celui exporté de Synchro par
   [`synchro-calendrier`](https://github.com/AMoncade/synchro-calendrier)). Un
   horaire prouve qu'un cours a été *suivi*, pas *réussi* : l'import propose
   des cours, rien n'est coché d'avance.
3. **Préalables** : l'arbre des cours, chacun marqué verrouillé, disponible,
   fait ou à vérifier.
4. **Audit** : chaque bloc du programme, ses crédits minimum et maximum, ce qui
   est attribué, ce qui manque et ce qui est perdu.
5. **Prochaine session** : une réponse courte, « prends ces cours-là », avec le
   motif sur chaque ligne et les chevauchements d'horaire quand ils sont connus.
6. **Trimestres** : placer tous ses cours jusqu'au diplôme, selon les
   trimestres où chacun est offert.

Aucun compte et aucune base de données : le catalogue est du JSON statique, et
ton parcours reste dans le `localStorage` de ton navigateur. Rien n'est envoyé
nulle part.

## Le problème que ça résout vraiment

En actuariat (54 crédits obligatoires, 33 à option, 3 au choix), les minimums
des blocs d'option ne totalisent que **18** crédits, alors qu'il en faut
**33**. Un audit qui vérifie chaque bloc séparément conclut donc « tout est
conforme » sur un parcours qui ne mène pas au diplôme.

L'inverse est aussi vrai et tout aussi invisible : 33 crédits d'option tous
empilés dans le bloc 75C, plafonné à 27, n'en donnent que **27**. Les 6 autres
sont réussis et ne comptent pas. L'audit les affiche comme perdus.

Le même piège existe ailleurs, en pire. Certaines pages décrivent des
cheminements exclusifs (« accès direct du B. Sc. au Ph. D. » ou « accès de la
M. Sc. au Ph. D. »). Sans choisir le sien, le doctorat en pathologie et biologie
cellulaire exigerait 180 crédits au lieu de 90. L'app fait donc choisir le
cheminement, et le scraper ne publie un cheminement que si la somme de ses
blocs retombe exactement sur le total annoncé par la page.

## Pourquoi UdeM s'y prête

| | McGill | UdeM |
|---|---|---|
| Préalables | prose à interpréter | codes reliés par `ET`/`OU` (`ACT1240 ET MAT1720`) |
| Exigences | texte de programme | blocs à minimum/maximum de crédits explicites |
| Audit de diplôme | reporté en V2 | calculable dès le départ |
| Offre par trimestre | non modélisée | sur chaque fiche de cours |

## Ce que l'app ne prétend pas savoir

La règle du projet : ne rien inventer, et dire à l'écran ce qui n'a pas pu être
vérifié plutôt que de le taire.

- **Préalables illisibles.** Un préalable qui ne se lit pas comme un arbre
  `ET`/`OU` reste opaque. Il s'affiche comme avertissement et ne verrouille
  jamais un cours. Exemple : `MAT1400/MAT1600/MAT1720 ou MAT1978`, dont les
  deux lectures possibles ne verrouillent pas les mêmes étudiants.
- **Cours sans crédits publiés.** 360 cours cités par des programmes n'ont
  aucun crédit sur leur fiche officielle. Le scraper ne les invente pas : un
  parcours qui en cite un reste incomplet, et l'écran le dit.
- **Blocs décrits en prose.** Certains blocs ne listent aucun cours et
  renvoient à du texte (« cours du Centre de langues », « avec l'approbation
  du responsable »). Quand la contrainte ne se vérifie pas mécaniquement,
  l'audit le signale et ne rend pas de verdict affirmatif. Certaines
  contraintes écrites en prose sont tout de même vérifiées, comme l'exclusion
  d'un sigle dans un bloc au choix.
- **Horaires.** Beaucoup de fiches de cours ne publient aucune séance. Un cours
  dont l'horaire est inconnu est marqué « indéterminé » dans la comparaison,
  jamais compté comme « sans conflit ».
- **Pages incohérentes.** Quand une page de l'UdeM se contredit (un bloc
  « obligatoire - 15 crédits » qui ne liste que 12 crédits de cours), l'écart
  est journalisé, pas corrigé en silence.

## Données

Pages publiques d'`admission.umontreal.ca`, programmes et fiches de cours.
Scrape terminé le 2026-09-13 : **1 089 pages de programme** et **9 619 fiches
de cours** réparties en 190 sigles, dans `data/`.

Le scraper est poli : il ne visite que des chemins permis par `robots.txt`,
espace ses requêtes et garde le HTML brut dans un cache sur disque. Corriger l'extracteur coûte donc une relecture
du cache (`--hors-ligne`), pas un nouveau scrape.

## Développer

Node 24 (celui de la CI).

```
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npm run lint
npm run build      # export statique dans out/
```

`predev` et `prebuild` recopient `data/` vers `public/donnees/`, que l'app lit
avec `fetch`. `data/` reste la source ; `public/donnees/` est jetable.

La CI (GitHub Actions) enchaîne `next typegen`, `tsc --noEmit`, lint, tests et
build sur chaque push vers `main` et chaque pull request.

### Régénérer les données

```
npm run scrape -- --hors-ligne            # tout relire depuis le cache, zéro requête
npm run scrape -- --sans-cours            # passe « structures » : les programmes seulement
npm run scrape -- --cours-cites --reprendre   # les fiches des cours cités qui manquent encore
```

Toutes les options sont décrites en tête de `scripts/scrape/executer.ts`. Le
scrape complet prend plusieurs heures : une seule session à la fois sur le
réseau, sinon le délai poli perd son sens.

### Version bureau (Windows)

```
npm run desktop:build      # export Next + installateur NSIS dans build/desktop/
npm run desktop:lancer     # lancer depuis out/ (après npm run build)
npm run desktop:verifier   # vraie fenêtre, réseau coupé, assertions dans la page : sortie 0 ou 1
```

Electron sert l'export statique par un protocole `udem://`, sans aucune URL
distante et sans script de préchargement. L'installateur n'est pas signé :
SmartScreen avertit au premier lancement.

## Documentation

- `docs/CONTRAT.md` : le contrat de données, qui possède quel fichier, et ce
  que la v2 a corrigé.
- `docs/VALIDATION-AUTRES-PROGRAMMES.md` : pourquoi le modèle v1, conçu pour
  l'actuariat, cassait sur d'autres programmes, et le cas des cheminements
  exclusifs. Document historique : ses six défauts sont traités (voir
  `CONTRAT.md`).
- `docs/INVENTAIRE-PROGRAMMES.md` : le volume réel du catalogue et le budget
  du scrape.
- `docs/RELEVE-PREALABLES.md` : les formes de préalables que le parseur doit
  savoir lire.
- `docs/FORMAT-ICS-SYNCHRO.md` : ce que contient vraiment un `.ics` d'horaire
  UdeM.

---

Projet personnel, sans affiliation avec l'Université de Montréal. Les données
officielles font foi.
