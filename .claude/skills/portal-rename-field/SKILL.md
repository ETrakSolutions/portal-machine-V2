---
name: portal-rename-field
description: "Renommer ou reordonner les champs de specs dans la BD du Portal Machine V2. Triggers : renomme champ, change le nom, rename field, change field name, reorder fields, modifier le titre, changer l'etiquette d'un champ, reordonner les specs. A utiliser des qu'on touche a une CLE de specs dans data/machines.json ou a l'ordre d'affichage des specs."
---

# Portal Machine V2 — Renommer / réordonner un champ de specs

## Dépôt

Répertoire de travail courant (le clone ouvert dans Claude Code) — jamais de chemin en dur.
La V1 (`portal-machine`) est gelée : tout passe par la V2.

## Ce qu'il faut comprendre d'abord

La clé française du champ dans `machines.json` sert de **clé de traduction**. `js/i18n.js`
expose `tSpec(clefFrancaise)` qui va chercher `spec.<clef>` dans `js/translations.js`.
Renommer un champ sans toucher aux traductions casse l'affichage anglais **et** français.

Les champs **dépendent du type de machine** : une Excavatrice et un Telehandler n'ont pas
les mêmes clés. Ne jamais appliquer un renommage à tous les types sans vérifier.

## Les six endroits à mettre à jour

| Fichier | Ce qu'il contient |
|---|---|
| `data/machines.json` | la clé elle-même, dans **toutes** les entrées du type |
| `js/translations.js` | `'spec.<ancienne clef>'` dans le bloc **FR et le bloc EN** |
| `js/app.js` | lectures de specs (classe machine, mise en évidence, rendu de la fiche) |
| `js/kit-rules.js` | `poidsKg()` lit « Poids operationnel (kg / lbs) », `nacelleDefaults()` lit « Categorie » |
| `js/soumission.js` | calcul de classe et contenu de la soumission |
| `database.html` / `js/edit-machine.js` | colonnes de la BD et formulaire d'édition |

Vérifier l'exhaustivité avant de commencer :

```bash
grep -rn "Nom exact du champ" --include=*.js --include=*.html .
```

## Workflow de renommage

1. `grep` pour recenser **toutes** les références (commande ci-dessus).
2. Script Python qui, pour chaque entrée du type visé, renomme la clé **en préservant
   l'ordre** — reconstruire le dict dans l'ordre voulu, sinon la clé renommée part à la fin.
3. **Écrire en compact** : `separators=(',',':')`. `machines.json` est sur une seule ligne;
   un `indent=2` le reformate en 333 000 lignes.
4. Mettre à jour `spec.<clef>` dans les deux blocs de langue de `js/translations.js`.
5. Mettre à jour les références dans les fichiers JS/HTML listés.
6. Bumper les caches des pages touchées (lire le fichier AVANT de l'ouvrir en écriture —
   un `open(path,'w')` prématuré vide le fichier et met le portail blanc).
7. Tester en navigateur, **en FR et en EN** : le contenu généré en JS ne se retraduit pas
   tout seul. Vérifier la fiche machine, la BD et la soumission.
8. Commit + push, puis vérifier le live (voir `portal-deploy`).

## Workflow de réordonnancement

Même logique, sans toucher aux traductions : définir l'ordre voulu en liste Python et
reconstruire chaque dict dans cet ordre. L'ordre des clés **est** l'ordre d'affichage.

## Contrôle

Compter les entrées avant/après : le total doit être identique et aucune entrée ne doit
avoir perdu de clé. Vérifier aussi qu'aucune entrée ne conserve l'ancienne clé.
