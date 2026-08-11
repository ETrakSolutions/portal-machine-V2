---
name: portal-add-models
description: "Ajouter des modeles de machines a la BD du Portal Machine V2 (ajouts en lot, gamme d'un fabricant, millesimes manquants). Triggers : ajoute modele, add model, ajouter excavatrice, ajouter fabricant, manque [marque], add [brand] [model], new excavator, missing model, ajoute tous les modeles [marque]. Pour UNE machine a completer depuis une demande, preferer portal-fill-specs ; pour un TYPE complet, ajout-type-de-machine."
---

# Portal Machine V2 — Ajouter des modèles

## Dépôt

Répertoire de travail courant (le clone ouvert dans Claude Code) — jamais de chemin en dur.
La V1 (`portal-machine`) est gelée : tout passe par la V2.

## Quel skill utiliser

Une machine depuis une demande → `portal-fill-specs`. Un **type** complet →
`ajout-type-de-machine`. Des modèles ou millésimes manquants dans un type existant →
**ce skill**. Jetons BOM → `portal-kit-options`.

**Lire `portal-machine-db` d'abord** : c'est la référence canonique du projet (modèle de
données, format des specs par type, règle de validation fabricant, les trois pièges
coûteux). Ce skill-ci ne couvre que le workflow d'ajout.

## Le minimum à ne pas oublier

- **Les champs dépendent du type.** Copier les clés d'une machine existante du **même
  type** (ignorer `Image`, `Flag` et les clés `_`). Format complet : `portal-machine-db`.
- **Valider à la source fabricant avant toute mise en ligne.** Un résumé de recherche ou un
  rapport d'agent ne vaut pas preuve; source inaccessible = laisser vide et signaler.
- **Écriture JSON compacte** : `separators=(',',':')`.

## Workflow

1. Lister ce qui existe déjà vs ce qui est demandé (compter, ne pas estimer).
2. Rechercher les specs à la source fabricant.
3. Script Python : itérer sur les années **existantes** du fabricant pour un ajout « toutes
   années ». Écrire en **compact** — `json.dump(..., ensure_ascii=False,
   separators=(',',':'))`. Un `indent=2` reformate le fichier d'une ligne en 333 000.
4. Vérifier le compte ajouté et qu'aucune entrée existante n'a bougé.
5. **Audit qualité avant de livrer** : specs invraisemblables (chenille + flèche 2 parties),
   casse des codes, doublons, encodage, cohérence entre millésimes. Quantifier la zone
   grise et les champs vides plutôt que d'attendre que l'utilisateur trouve les erreurs.
6. Vérifier les jetons BOM des nouveaux modèles : le pré-remplissage de `kit-rules.js` est
   un point de départ, pas une vérité (le `0004` mini suit la classification du fabricant,
   pas le seuil de 5000 kg — voir `portal-kit-options`).
7. Bumper les caches, tester en navigateur, pousser, vérifier le live — voir `portal-deploy`.

## Avant de commiter

`git fetch` + `git status` : une autre session travaille parfois dans le même clone.
Stager ses fichiers **nommément**, jamais `git add -A`.
