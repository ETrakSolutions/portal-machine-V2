---
name: portal-kit-options
description: "Modifier les options du Kit Machine e-Trak (jetons BOM) du Portal Machine V2. Triggers : mets obligatoire, ajoute option kit, modifier kit, code 1500-XXXX, option drain, option rotation, cremaillere, option mini, kit machine, rond rouge, rond jaune, jeton BOM, ajouter un item au kit, point obligatoire, DRAIN_PREFIXES. A utiliser des qu'on touche a un etat de kit (r / j / v / na), que ce soit pour un modele, un fabricant ou un type complet."
---

# Portal Machine V2 — Options du Kit (jetons BOM)

## Dépôt

Répertoire de travail courant (le clone ouvert dans Claude Code). Ne **jamais** coder un
chemin en dur : il diffère d'un poste à l'autre. Sur le poste `jcaron` :
`C:\Users\jcaron\CLAUDE_CODE\portal-machine-v2`.

⚠️ La V1 (`portal-machine`) est **gelée**. Tout passe par la V2.

## Le modèle mental à avoir avant de toucher à quoi que ce soit

Le jeton affiché = **règle de pré-remplissage + override par machine**. Les deux couches :

1. **`js/kit-rules.js` — SOURCE UNIQUE des règles.** `excDefaults()`, `pompeDefaults()`,
   `nacelleDefaults()`, `DRAIN_PREFIXES`, `harnais()`, `applyOverride()`. Cinq pages la
   chargent : `machine.html` (via `js/app.js`), `database.html`, `edit-machine.html`,
   `soumission.html` (via `js/soumission.js`), `export.html`.
2. **`data/overrides/<type>.json` — les corrections par machine.** Un fichier par type,
   fusionné par `js/overrides-loader.js`. C'est là que vivent les décisions métier.

**Règle d'or : une décision métier va dans les OVERRIDES, jamais en dur dans la règle.**
Mettre un item à obligatoire pour tout un type ou toute une marque = pré-remplissage en
masse via les overrides, que les admins peuvent ensuite ajuster machine par machine. Un
`if (fabricant === 'X')` dans le code est presque toujours la mauvaise réponse.

États : `'r'` obligatoire (rouge) · `'j'` option (jaune) · `'v'` à vérifier (orange) ·
`'na'` non applicable (masqué).

## ⚠️ Pièges d'architecture (le skill précédent se trompait sur les trois)

- Le tableau du kit est dans **`machine.html`** (lignes ~120-170), pas dans `index.html`
  (qui est le hub). Les lignes portent `data-kit="mini|drain|gc|..."`.
- **`DRAIN_PREFIXES` n'existe qu'à UN endroit** : `js/kit-rules.js`. `database.html:1366`
  et `js/edit-machine.js:107` ne font que lire `window.KitRules.DRAIN_PREFIXES`. Ne PAS
  aller les « resynchroniser ».
- Un type **autre** qu'Excavatrice/Pompe utilise le rendu générique piloté par
  `_bom_labels` de la BD (`renderGeneric` dans `js/app.js`), pas les lignes statiques.

## Codes BOM Excavatrice

| Code | Nom | Règle de pré-remplissage (`excDefaults`) |
|---|---|---|
| `0000` | Cabine | toujours `r` |
| `0001` | Hauteur | toujours `j` |
| `0002` | Rotation | toujours `j` |
| `0004` | **Option mini excavatrice** | `r` si poids ≤ 5000 kg — **voir la note ci-dessous** |
| `0005` | Multi Axes | toujours `j` |
| `0008` | Swing boom | `j` si spec « Swing boom » = Oui, sinon `na` |
| `0009` | Drain hyd | `r` si le modèle commence par un `DRAIN_PREFIXES`, sinon `na`. **JAMAIS jaune** (`coerceExcState` force `j`→`r`) |
| `0070` | Boîte GC | `r` si le modèle contient « GC » (suffixe exclusif à Caterpillar) |
| `0304` | Crémaillère | `r` uniquement si modèle = TB216 |

### Note sur le 0004 — le cas qui a servi de leçon (2026-08-10)

Le `1500-0004` **n'est pas un kit physique** : `data/prices.json` donne `item: null,
install: 790 $`. C'est **du temps de main-d'œuvre**, parce que l'espace est plus restreint
pour le technicien. Le critère métier n'est donc PAS le poids, c'est **la gamme dans
laquelle le FABRICANT classe la machine** (décision Jacquot, 2026-08-10 : classification
stricte — une catégorie *midi* / *mid-size* / *small* ne compte pas).

Le seuil des 5000 kg de `isMini()` reste en place comme **filet pour les nouvelles
entrées seulement**. Les 991 corrections vivent dans les overrides. Conséquence à
connaître : une excavatrice ajoutée plus tard entre 5 et 10 t sortira non-mini par défaut
et devra être corrigée à la main.

Détail complet des frontières par fabricant : mémoire `project-portal-option-0004-mini`.

## Avant de mettre en ligne : la règle de validation fabricant

**Aucun changement d'état de kit ne va en ligne sans avoir été validé contre
l'information technique du fabricant.** Posée par Jacquot le 2026-08-10.

En pratique :

1. **Aller sur la page produit ou la fiche technique du constructeur**, pas sur un
   agrégateur ni sur une reformulation.
2. **Un résumé de résultats de recherche n'est PAS une preuve.** Cas vécu : un résumé
   affirmait que Mecalac nommait sa série MWR « compact wheel excavators ». La page
   officielle dit « Wheel excavators MWR-Series » — aucune gamme compacte. La conclusion
   s'inversait. Toujours ouvrir la page et lire le libellé exact de la catégorie.
3. **Si la source est inaccessible, on ne devine pas** : on laisse la machine inchangée et
   on liste le cas comme non vérifiable. (LiuGong bloque la lecture automatisée : 403 puis
   erreur de certificat. XCMG XE80U et Komatsu PC110-8 restent ouverts pour cette raison.)
4. Noter la source retenue **dans le message de commit**, marque par marque.

## Modifier un état de kit en masse (le cas courant)

1. **Établir le critère métier** et le faire trancher par l'utilisateur si plusieurs
   lectures donnent des résultats différents. Chiffrer chaque option avant de demander.
2. **Valider à la source fabricant** (section ci-dessus).
3. **Écrire un script Python de classification** avec la source inscrite en commentaire
   pour chaque frontière, et le passer d'abord **à blanc** : ajouts, retraits, indécidables.
4. **Comparer le compte à blanc et le compte réel.** S'ils diffèrent, comprendre pourquoi
   avant d'écrire. Piège vécu : écrire un override explicite sur une entrée déjà couverte
   par la règle par défaut gonfle le diff de centaines de lignes inutiles. Ne écrire que
   si l'état **effectif affiché** (défaut + override) n'est pas déjà le bon.
5. **Écrire `data/overrides/<type>.json` en COMPACT** : `separators=(',',':')`. Le fichier
   est sur une seule ligne — un `indent=2` reformate tout et rend le diff illisible.
6. **Vérifier l'intégrité** : aucune clé perdue, aucun changement hors du code visé.
7. **Tester en navigateur** (voir `portal-deploy`), puis commiter et pousser.

Si l'utilisateur édite en direct dans l'UI pendant ce temps, passer par le backend
(`updateMachineBomBulk`) plutôt que par un commit : le backend réécrit `overrides/*.json`
à chaque save et écraserait le commit.

## Ajouter une nouvelle ligne de kit

1. Ajouter le `<tr data-kit="identifiant">` dans `machine.html` (tableau `.kit-table`).
2. Ajouter le code dans `KIT_MAP` (`js/app.js`, ~ligne 560) **et** dans le mapping de
   `applyBdKitLabels` juste en dessous.
3. Ajouter le code dans `EXC_CODES` de `js/kit-rules.js` et son défaut dans `excDefaults()`.
4. Ajouter le libellé + PN dans `_bom_labels` du type dans `data/machines.json` (la BD est
   maître pour le texte et le PN — ne pas coder en dur).
5. Ajouter le prix dans `data/prices.json` (`item` et `install`).
6. Vérifier que la soumission le reprend : `getKitSummary()` dans `js/soumission.js` itère
   sur `KitRules.EXC_CODES`.
7. Bumper les caches, tester, pousser.

## NIP

Jamais en clair ici. Voir `PIN Portail.txt` à la racine du dépôt (gitignoré). Les options
de kit demandent le NIP; les notes non.

## Contrôle

`scripts/selenium_mini_fabricant_test.py` — modèle de script de contrôle réutilisable :
il vérifie l'état **rendu** de `tr[data-kit="mini"]` dans `machine.html` ET le contenu de
`getKitSummary()` en soumission, sur le site en ligne. Le kit de soumission n'est pas
lisible dans le texte de la page (il n'est construit qu'à la génération) : appeler
`getKitSummary()` directement, ce qui évite aussi de déclencher un envoi.
