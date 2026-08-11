---
name: portal-deploy
description: "Tester et deployer les changements du Portal Machine V2 sur GitHub Pages. Triggers : pousse, push, deploy, teste et pousse, push sur github, met en ligne, deployer, valide et pousse. A utiliser apres toute modification du portail — il couvre le test navigateur obligatoire, le cache busting, le push propre et la verification live."
---

# Portal Machine V2 — Tester & déployer

## Dépôt et site

Répertoire de travail courant (le clone ouvert dans Claude Code) — ne jamais coder un
chemin en dur. Sur le poste `jcaron` : `C:\Users\jcaron\CLAUDE_CODE\portal-machine-v2`.

- Repo : `ETrakSolutions/portal-machine-V2` (public)
- Site : `https://etraksolutions.github.io/portal-machine-V2/`
- ⚠️ La V1 (`portal-machine`) est **gelée**. Tout passe par la V2.

## 1. Vérifier qu'une autre session ne travaille pas dans le même dépôt

Jacquot ouvre parfois le portail depuis une deuxième session, dans **ce même clone local**.
Avant tout commit :

```bash
git fetch && git status -sb && git diff --name-only
```

**Ne jamais faire `git add -A`.** Stager uniquement ses propres fichiers, nommément. Si un
changement entre en collision avec ce que l'utilisateur édite, s'arrêter et proposer une
alternative plutôt que d'écraser.

## 2. Synchroniser les données locales avant de tester

Les `data/*.json` locaux se périment vite : le backend Apps Script écrit directement sur
GitHub à chaque save dans l'UI. Tester sur un local périmé donne des « rien n'apparaît »
trompeurs.

```bash
curl -s "https://etraksolutions.github.io/portal-machine-V2/data/overrides/excavatrice.json?cb=$RANDOM" -o /tmp/live.json
# comparer au local AVANT de conclure quoi que ce soit
```

## 3. Bumper les caches — avec le bon réflexe

Incrémenter `?v=` sur le CSS et le JS **des pages réellement touchées**. Les pages qui en
portent : `index.html`, `machine.html`, `database.html`, `edit-machine.html`,
`soumission.html`, `export.html`, `machine-requests.html`, `price-list.html`.

⚠️ **Piège du 2026-07-10 (portail blanc) :** un script de bump qui fait `open(path,'w')`
avant d'avoir lu le fichier le vide. **Toujours lire AVANT d'ouvrir en écriture.** Un hook
`pre-commit` (`.githooks/pre-commit` → `scripts/check_portal_integrity.py --staged`) bloque
désormais un HTML vide ou un JSON invalide, doublé du workflow CI « Validation portail ».
Si le hook n'est pas actif sur le poste : `git config core.hooksPath .githooks`.

## 4. Tester en navigateur AVANT de pousser — non négociable

Un endpoint qui répond 200 ne prouve rien sur ce que l'utilisateur voit. Tester le flux UI
complet avec Selenium (`selenium 4.45` est installé, Chrome headless).

Modèle réutilisable : `scripts/selenium_mini_fabricant_test.py`.

Règles apprises :

- **Vérifier l'élément RENDU**, pas seulement l'état JS calculé : ligne visible ou masquée,
  radio cochée, texte affiché. Une capture d'ÉLÉMENT peut mentir — cadrer la page.
- **Le contenu généré en JS n'est pas retraduit** automatiquement : si la modif touche du
  texte, tester aussi la bascule FR/EN (réabonnement `langchange`).
- Certains contenus ne sont **pas dans le texte de la page** : le kit de soumission n'est
  construit qu'à la génération. Appeler la fonction directement
  (`getKitSummary(...)`) — ce qui évite au passage de déclencher un envoi de courriel.
- Toujours finir par un contrôle des erreurs JS `SEVERE` de la console.
- Tester sur le **vrai domaine V2** quand on valide une sauvegarde : en localhost, le CORS
  d'Apps Script peut faire croire à un échec alors que le serveur a bien écrit.

## 5. Commit et push

```bash
git add <fichiers nommément>
git commit -F - <<'EOF'
Sujet court a l imperatif

Le pourquoi, pas seulement le quoi. Pour une decision metier : la source
retenue et ce qui a ete ecarte.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin main
```

Écrire `data/machines.json` et `data/overrides/*.json` en **compact**
(`separators=(',',':')`) — ils sont sur une seule ligne. Un `indent=2` reformate 333 k
lignes et rend le diff inexploitable.

## 6. Vérifier le déploiement — obligatoire, pas optionnel

Le déploiement passe par l'Action `pages build and deployment` (pas l'API legacy
`pages/builds`).

```bash
gh run list --limit 3
gh run watch <id> --exit-status
```

Deux pièges connus :

- L'étape de deploy échoue parfois pour une raison transitoire (exécuteur annulé) :
  `gh run rerun <id> --failed`.
- Un push qui ne déclenche aucun build : faire un commit vide pour relancer.

Puis confirmer le contenu réellement servi, avec un cache-buster :

```bash
curl -s "https://etraksolutions.github.io/portal-machine-V2/data/overrides/excavatrice.json?cb=$RANDOM$RANDOM" -o /tmp/verif.json
# comparer octet a octet au local
```

## 7. Rejouer le test navigateur sur le live

Après déploiement, relancer le script de contrôle contre l'URL en ligne. C'est ce qui
prouve que l'utilisateur final voit le bon résultat. Rapporter le compte de vérifications
passées, pas un « ça devrait marcher ».

## Ajout d'un type de machine — piège backend

Un nouveau type exige de mettre à jour **trois** listes, pas une :
`TYPE_SLUGS` (frontend), `OV_TYPE_SLUGS` (backend `apps-script/Code.gs`) et
`soumission_allowed_types` (serveur). Sans ça : specs sauvegardées mais BOM en
« erreur de sauvegarde ».
