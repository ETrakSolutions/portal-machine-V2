# Portal Machine V2 — e-Trak

Portail de configuration et de soumission des limiteurs e-Trak. Site statique servi par
GitHub Pages, avec un backend Google Apps Script qui écrit directement dans ce dépôt.

- Repo : `ETrakSolutions/portal-machine-V2` · Site : https://etraksolutions.github.io/portal-machine-V2/
- ⚠️ La **V1** (`portal-machine`) est **gelée**. Tout passe par la V2.

## Commencer ici

Les skills du projet sont dans `.claude/skills/` et se chargent automatiquement quand
Claude Code est ouvert **dans ce dépôt**. Le skill **`portal-machine-db` est la référence
canonique** : modèle de données, pièges, règle de validation fabricant. Le lire en premier.

| Ce que tu veux faire | Skill |
|---|---|
| Comprendre la BD, les pièges, l'audit qualité | `portal-machine-db` |
| Compléter une machine depuis une demande | `portal-fill-specs` |
| Monter un **type** complet de machines | `ajout-type-de-machine` |
| Ajouter des modèles ou millésimes manquants | `portal-add-models` |
| Changer un état de kit / jeton BOM | `portal-kit-options` |
| Renommer ou réordonner un champ de specs | `portal-rename-field` |
| Tester, bumper les caches, pousser, vérifier | `portal-deploy` |

Un fait technique n'a qu'**un seul domicile**. Si tu dois le corriger, corrige-le là et
nulle part ailleurs — la duplication entre skills est ce qui a laissé passer l'erreur du
1500-0004 pendant des mois.

`PROMPT_TRAVAIL.md` à la racine porte les **façons de travailler** attendues sur ce
projet (chercher avant de demander, auditer avant de livrer, éprouver ses contrôles en
les cassant, ce qui exige un accord explicite). À coller en début de séance. Il ne
répète pas les règles ci-dessous : si une règle technique manque, elle va ici ou dans
le skill concerné, pas là-bas.

## Les cinq règles dures

1. **Rien en ligne sans validation à la source fabricant.** Sa page produit ou sa fiche
   technique. Un résumé de recherche ou un rapport d'agent ne vaut pas preuve. Source
   inaccessible = laisser inchangé et signaler, jamais deviner.
2. **JSON en compact.** `json.dump(..., ensure_ascii=False, separators=(',',':'))`.
   `data/machines.json` et `data/overrides/*.json` tiennent sur une seule ligne; un
   `indent=2` les reformate en centaines de milliers de lignes.
3. **Tester en navigateur avant de pousser.** Selenium, sur le flux UI complet. Un endpoint
   qui répond 200 ne prouve rien sur ce que l'utilisateur voit.
4. **Jamais `git add -A`.** Plusieurs sessions travaillent parfois dans le même clone :
   `git fetch` + `git status`, puis stager ses fichiers nommément.
5. **Une décision métier va dans les overrides**, pas en dur dans le code. Le
   pré-remplissage de `js/kit-rules.js` est un point de départ que les admins ajustent.

## Repères de code

| Fichier | Rôle |
|---|---|
| `js/kit-rules.js` | **source unique** des règles BOM (défauts, `DRAIN_PREFIXES`, harnais) |
| `data/machines.json` | specs + `_bom_labels` (libellés et PN du catalogue) |
| `data/overrides/<type>.json` | jetons BOM et notes par machine — écrits par le backend |
| `data/prices.json` | `item` et `install` par PN |
| `js/app.js` / `machine.html` | fiche machine et tableau du kit |
| `js/soumission.js` | soumission; `getKitSummary()` construit le kit facturé |
| `js/translations.js` | i18n FR/EN, dont les clés `spec.<champ>` |
| `apps-script/` | backend (écrit dans le dépôt via l'API GitHub) |

## Mise en route sur un nouveau poste

```bash
git clone https://github.com/ETrakSolutions/portal-machine-V2
cd portal-machine-v2
git config core.hooksPath .githooks   # hook qui bloque un HTML vide ou un JSON invalide
python -m http.server 8083            # serveur local pour tester
```

Le NIP du portail est dans `PIN Portail.txt` (gitignoré, transmis en privé). Le jeton
GitHub en écriture se saisit au premier `git push` et se garde dans le Credential Manager
Windows.

## Contrôles

`scripts/controle_sante_portail.py` (santé données + code), `scripts/check_portal_integrity.py`
(appelé par le hook pre-commit), `scripts/selenium_mini_fabricant_test.py` (modèle de test
navigateur bout en bout, sur le site en ligne).
