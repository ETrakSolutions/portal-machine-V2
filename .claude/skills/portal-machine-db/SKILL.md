---
name: portal-machine-db
description: "Gestion complete de la base de donnees Portal Machine e-Trak V2 : ajouter/completer des modeles, gerer les regles et les jetons BOM (drain, mini, multi axes, swing boom, harnais), mettre a jour les DRAIN_PREFIXES, et deployer. Utilise ce skill des que l'utilisateur mentionne : ajouter modele, machine manquante, completer specs, drain hydraulique, BOM, harnais, jeton rouge/jaune, DRAIN_PREFIXES, machines.json, overrides, database.html, ou toute modification a la base de donnees machines du portail. Aussi pour : 'il manque [fabricant]', 'ajoute [modele]', 'specs incompletes', 'drain obligatoire pour [machine]', 'verifier les BOM', 'pousser sur github'. Couvre les 11 types de machines."
---

# Portal Machine V2 — Base de données

**Ce skill est la référence canonique du projet.** Les autres skills du portail décrivent
un workflow et renvoient ici pour le modèle de données et les pièges. Un fait technique
n'est écrit qu'à **un** endroit : c'est ce qui a manqué avant le 2026-08-10, quand la même
règle vivait dans trois fichiers et n'était corrigée que dans un.

## Quel skill utiliser

| Situation | Skill |
|---|---|
| Modèle de données, pièges, harnais, audit qualité | **ce skill** |
| Une machine à créer/compléter depuis une demande | `portal-fill-specs` |
| Un **type** complet à monter (tous fabricants, toutes années) | `ajout-type-de-machine` |
| Modèles ou millésimes manquants dans un type existant | `portal-add-models` |
| États de kit / jetons BOM (`r`, `j`, `v`, `na`) | `portal-kit-options` |
| Renommer ou réordonner un champ de specs | `portal-rename-field` |
| Tester, bumper les caches, pousser, vérifier le live | `portal-deploy` |

## Dépôt

**Répertoire de travail courant** (le clone ouvert dans Claude Code). Ne jamais coder un
chemin en dur. Sur le poste `jcaron` : `C:\Users\jcaron\CLAUDE_CODE\portal-machine-v2`.

⚠️ La V1 (`portal-machine`) est **gelée** — ne plus y toucher. Site V2 :
`https://etraksolutions.github.io/portal-machine-V2/`.

## Les deux fichiers de données, et pourquoi ils sont séparés

| Fichier | Contenu | Qui écrit |
|---|---|---|
| `data/machines.json` | Specs de base + `_bom_labels` (libellés et PN du catalogue) | scripts, rarement l'UI |
| `data/overrides/<type>.json` | Les jetons BOM par machine (`_bom`), les notes | le backend Apps Script à chaque save dans l'UI |
| `data/prices.json` | `item` et `install` par PN | scripts |

`machines.json` fait ~13 Mo : il n'est plus écrit par l'UI (trop lent, ~90 s). Les 11
types : Excavatrice, Pompe a Beton, Grue Mobile, Camion Girafe (Boom Truck), Telehandler,
Foreuse, Camion Vacuum, Retrocaveuse, Loader, Nacelle, Tracteur.

Structure : `data[type][fabricant][annee][modele] = { specs... }`.

**La BD est maître.** Les libellés, les PN et les options viennent de `_bom_labels` et des
specs — jamais codés en dur dans les pages.

## ⚠️ Les trois pièges qui coûtent le plus cher

1. **Écrire le JSON en compact.** `json.dump(..., separators=(',',':'))`. `machines.json`
   et les `overrides/*.json` sont sur **une seule ligne** ; un `indent=2` les reformate en
   333 000 lignes et rend tout diff et toute fusion inexploitables.
2. **Les données locales se périment.** Le backend écrit sur GitHub à chaque save dans
   l'UI. Synchroniser par `curl` avant tout test ou export local, sinon on diagnostique un
   « rien n'apparaît » qui n'existe pas.
3. **Une autre session travaille parfois dans le même clone.** `git fetch` + `git status`
   avant tout commit, et **jamais `git add -A`** — stager ses fichiers nommément.

## Règles BOM : une seule source

`js/kit-rules.js` contient **toutes** les règles de pré-remplissage : `excDefaults()`,
`pompeDefaults()`, `nacelleDefaults()`, `DRAIN_PREFIXES`, `harnais()`, `applyOverride()`,
`coerceExcState()`. Cinq pages la chargent (`machine.html` via `js/app.js`,
`database.html`, `edit-machine.html`, `soumission.html` via `js/soumission.js`,
`export.html`).

**`DRAIN_PREFIXES` n'existe qu'à cet endroit.** `database.html:1366` et
`js/edit-machine.js:107` ne font que lire `window.KitRules.DRAIN_PREFIXES` — ne pas aller
les « resynchroniser », c'était vrai en V1, ça ne l'est plus.

Jeton affiché = défaut de `kit-rules.js` **+** override de `data/overrides/<type>.json`.
Une **décision métier va dans les overrides**, pas en dur dans la règle : le pré-remplissage
en masse est un point de départ que les admins ajustent ensuite machine par machine.

Le tableau complet des codes BOM et de leurs défauts vit dans le skill
**`portal-kit-options`** — ne pas le recopier ici, il doit avoir un seul domicile.

Un point à connaître même sans ouvrir ce skill : le `1500-0004` est **du temps de
main-d'œuvre**, pas un kit (`prices.json` : `item: null, install: 790 $`). Son critère est
la gamme dans laquelle le **fabricant** classe la machine, pas le poids. 991 entrées
corrigées le 2026-08-10 via les overrides. Détail par marque : mémoire
`project-portal-option-0004-mini`.

### Harnais de coupure

Défini par `KitRules.harnais(fab, modele)`. Hitachi `-7` → Z03B-0121, Hitachi `-5/-6` et
John Deere → Z03B-0031, Komatsu → 0032, Doosan/Develon → 0033, Volvo → 0034,
Link-Belt/Case → 0041, Caterpillar → 0080, sinon générique Z03B-0043.

## Règle de validation : rien en ligne sans source fabricant

Posée par Jacquot le 2026-08-10, après le cas du 1500-0004.

Toute donnée technique ou classification écrite en BD doit être validée contre
**l'information technique du fabricant** — sa page produit ou sa fiche technique.

- **Un résumé de recherche n'est pas une preuve.** Cas vécu : un résumé affirmait que
  Mecalac nommait sa série « compact wheel excavators »; la page officielle dit « Wheel
  excavators MWR-Series ». La conclusion s'inversait.
- **Un rapport d'agent n'est pas une preuve non plus.** 31 modèles inventés détectés lors
  de l'import Tracteur. Vérifier par échantillon contre la source.
- **Source inaccessible = on ne devine pas.** Laisser inchangé et lister le cas comme non
  vérifiable, plutôt que d'écrire une valeur plausible.
- Consigner la source retenue dans le message de commit.

## Ajouter des modèles

1. Lister ce qui existe vs ce qui est demandé.
2. Rechercher les specs **sur le site du constructeur**; croiser si un doute subsiste.
3. Copier les clés d'une machine existante **du même type** — les champs dépendent du type
   (ignorer `Image`, `Flag` et les clés `_`).
4. Script Python, écriture **compacte**, puis vérifier le compte ajouté.
5. Signaler proactivement les specs invraisemblables (ex. chenille + flèche 2 parties) et
   les incohérences de casse, de doublons ou d'encodage — sans attendre qu'on le demande.

Règles specs Excavatrice : traction « Chenille » ou « Roue » (Liebherr série A, Case WX,
Doosan `...W`, Wacker EW) · les excavatrices à roues prennent « Boom 2 parties (articule) » ·
voltage 12V DC sous 5 t, 24V DC au-dessus (règle indicative — **la vérifier**, elle a déjà
produit des valeurs fausses sur les grues).

## Audit qualité avant livraison

Avant de livrer : quantifier la zone grise, les champs vides, les classifications
incertaines, les doublons et les faux positifs. Ne pas attendre que l'utilisateur trouve
les erreurs.

## Cache busting, test et déploiement

Voir le skill **`portal-deploy`** : bump des caches (lire AVANT d'ouvrir en écriture), test
navigateur Selenium **avant** le push, `gh run watch` sur `pages build and deployment`,
puis vérification `curl` cache-bustée du contenu réellement servi.

Ajout d'un **type** de machine : mettre à jour `TYPE_SLUGS` (frontend), `OV_TYPE_SLUGS`
(backend `apps-script/Code.gs`) **et** `soumission_allowed_types` (serveur), sinon les
specs se sauvegardent mais le BOM renvoie « erreur de sauvegarde ».

## Scripts de contrôle existants (`scripts/`)

- `controle_sante_portail.py` — santé données + code, 9 volets
- `check_portal_integrity.py` — appelé par le hook `pre-commit`
- `selenium_mini_fabricant_test.py` — modèle de test navigateur bout en bout
- `export_to_excel.py` — export de la BD
