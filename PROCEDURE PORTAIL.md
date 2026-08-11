# Portail Machine e-Trak — Procedure de travail

Ce document decrit l'etat actuel du projet, son architecture et les procedures pour continuer le developpement avec Claude Code.

---

## 1. Vue d'ensemble

**Portail Machine** est un outil web interne pour consulter les specifications techniques de machines (excavatrices, grues, foreuses, etc.) et configurer les kits e-Trak associes.

- **Repo GitHub** : `ETrakSolutions/portal-machine-V2` — c'est **l'outil maintenu**. La V1 (`portal-machine`) est **gelee** : ne plus y toucher.
- **Deploiement** : GitHub Pages — `etraksolutions.github.io/portal-machine-V2/`
- **Stack** : HTML/CSS/JS vanilla (aucun framework)
- **Backend** : Google Apps Script (`apps-script/Api.gs`) qui ecrit directement sur GitHub via l'API Contents (notes, BOM, suppressions). Voir section 4.3.
- **11 types de machines** : Excavatrice, Pompe a Beton, Grue Mobile, Camion Girafe (Boom Truck), Telehandler, Foreuse, Camion Vacuum, Retrocaveuse, Loader, Nacelle, Tracteur.

---

## 2. Structure des fichiers

```
portal-machine-V2/
├── index.html              # Hub / page d'accueil (connexion)
├── database.html           # Base de donnees (lecture seule) — gabarit canonique
├── edit-machine.html       # Edition d'une machine (BOM, notes, specs)
├── machine.html            # Fiche machine + Kit
├── soumission.html         # Soumission (formulaire de selection -> courriel)
├── export.html             # Tuile Export (Super Admin/Admin) — BOM en .xlsx (voir 4.6/historique)
├── js/
│   ├── app.js              # Logique fiche machine + kit
│   ├── soumission.js       # Logique soumission + courriel (regle creusage 2D, voir 4.7)
│   ├── kit-rules.js        # *** SOURCE UNIQUE des regles du kit *** (voir 4.6)
│   ├── overrides-loader.js # Charge les overrides decoupes par type (voir 4.2)
│   ├── admin.js            # Comptes, roles, listes de courriels
│   ├── data-refresh.js     # Rafraichissement transparent (~20 s)
│   └── ...                 # i18n, translations, heartbeat, version-check...
├── css/style.css           # Styles
├── data/
│   ├── machines.json       # Specs de base, 11 types (~13 MB) — rarement ecrit
│   └── overrides/          # BOM + notes editables, UN fichier par type :
│       ├── excavatrice.json        (~300 KB)
│       ├── pompe-a-beton.json
│       ├── grue-mobile.json
│       └── ... (11 fichiers, voir slugs en 4.2)
├── scripts/split_overrides_by_type.py  # Migration : split overrides.json -> par type
└── PROCEDURE PORTAIL.md    # Ce fichier
```
> Note transition : `data/overrides.json` (fichier unique d'origine) est conserve quelque temps comme repli. Le loader lit les fichiers par type + ce repli ; il sera retire une fois le backend par-type confirme stable.

---

## 3. Fonctionnalites actuelles

### 3.1 Selection en cascade
4 niveaux : **Type** → **Fabricant** → **Annee** → **Modele**
- Chaque niveau filtre le suivant
- Option "Autre modele" pour creer un modele custom

### 3.2 Affichage des specifications
Table dynamique avec 10 champs (puissance, traction, boom, etc.)
- **Flash jaune** sur valeurs speciales (roue, 2 parties, swing boom, 12V)

### 3.3 Kit Machine (Excavatrice seulement)
Table d'options avec radio buttons (Obligatoire / Option)
- **Protege par NIP** via le cadenas (valeur dans `PIN Portail.txt`, gitignore)
- Logique automatique : drain hydraulique pour modeles specifiques, boite GC, swing boom, etc. L'option mini (`0004`) suit la classification du FABRICANT et vit dans les overrides (voir 4.6).

### 3.4 Notes par modele
Textarea pour notes specifiques a chaque combinaison fabricant/modele/annee
- Sauvegarde API + localStorage en fallback

### 3.5 Gestion des emails (menu engrenage)
- Liste d'emails cibles pour les demandes de kit
- **Protege par NIP** (valeur dans `PIN Portail.txt`, gitignore)
- Ajouter / supprimer des emails

### 3.6 Suppression de modele (menu engrenage)
- Bouton rouge dans le menu engrenage apres saisie du NIP
- **Supprime uniquement le modele pour l'annee selectionnee**
- Confirmation explicite avec nom du modele et annee
- Sauvegarde la suppression via API (cle : `deleted_[type]_[fab]_[annee]_[mod]`)

---

## 4. Architecture technique

### 4.1 Donnees machines (machines.json)
```json
{
  "Excavatrice": {
    "Caterpillar": {
      "2020": {
        "320": { "Image": "", "Puissance moteur (kW / HP)": "121 kW / 162 HP", ... }
      }
    }
  }
}
```
Hierarchie : Type → Fabricant → Annee → Modele → Specs.
`machines.json` ne contient QUE les specs de base (11 types, ~13 MB). Les donnees editables (`_bom`, `_notes`) ne sont PAS ici : elles vivent dans les fichiers overrides (4.2).

### 4.2 Overrides editables — decoupes par type
Le BOM (kit e-Trak) et les notes sont stockes a part, dans **un fichier par type** sous `data/overrides/<slug>.json`. Structure miroir : `{ "<Type>": { fab: { annee: { modele: { _bom, _notes } } } } }`.

Pourquoi par type : reste loin du plafond 1 Mo de l'API Contents (chaque fichier <=~320 KB, plein), ecritures isolees (editer une grue ne touche pas `excavatrice.json`), sauvegardes plus rapides.

**Table CANONIQUE type → slug** (identique dans `js/overrides-loader.js`, `apps-script/Api.gs` `OV_TYPE_SLUGS`, et `scripts/split_overrides_by_type.py`) :

| Type | Fichier |
|------|---------|
| Excavatrice | `data/overrides/excavatrice.json` |
| Pompe a Beton | `data/overrides/pompe-a-beton.json` |
| Grue Mobile | `data/overrides/grue-mobile.json` |
| Camion Girafe (Boom Truck) | `data/overrides/camion-girafe.json` |
| Telehandler | `data/overrides/telehandler.json` |
| Foreuse | `data/overrides/foreuse.json` |
| Camion Vacuum | `data/overrides/camion-vacuum.json` |
| Retrocaveuse | `data/overrides/retrocaveuse.json` |
| Loader | `data/overrides/loader.json` |
| Nacelle | `data/overrides/nacelle.json` |
| Tracteur | `data/overrides/tracteur.json` |

**Lecture** : `js/overrides-loader.js` expose `window.loadMergedOverrides()` qui fetch les 11 fichiers + le repli `data/overrides.json`, fusionne en un seul objet, puis `applyOverrides()` greffe `_bom`/`_notes` sur `machines.json` en memoire. Utilise par app.js, soumission.js, database.html, edit-machine.html et data-refresh.js.

### 4.3 API Google Apps Script (Option B)
```
URL : https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec
```
Backend = `apps-script/Api.gs` (ne PAS garder l'ancien `Code.gs` dans le projet). Il ecrit directement sur GitHub via l'API Contents (~6 s), en **compact** (`JSON.stringify(data)`), avec retry sur conflit de SHA (verrou optimiste). Les ecritures BOM/notes/suppression ciblent le fichier `data/overrides/<slug>.json` du type concerne (route par `_ovFilePath(type)`).

| Action | Usage |
|--------|-------|
| `get` / `list` (GET) | Notes legacy, emails, drapeaux (Script Properties) |
| `updateMachineBom` / `updateMachineBomBulk` | Ecrit `_bom` dans `overrides/<type>.json` |
| `updateMachineNotes` | Ecrit `_notes` dans `overrides/<type>.json` |
| `deleteMachine` | Retire l'override + la machine de machines.json |

**Redeploiement** : apres toute modif d'`Api.gs`, console Apps Script (compte `etrak.portail@gmail.com`) → Deploy → Manage deployments → Edit → New version. L'URL ne change pas.

### 4.4 Protection NIP
- **NIP** : JAMAIS en clair dans ce depot — il est **public**. Valeur dans `PIN Portail.txt` a la racine (gitignore), transmise en prive.
- Zones protegees : Kit machine, Emails, Suppression de modele.

### 4.5 Cache busting
Les fichiers CSS et JS sont charges avec un parametre de version (`?v=XX`).
- Actuels : `css/style.css?v=172`, `js/app.js?v=192`, `js/soumission.js?v=195`, `js/data-refresh.js?v=3`, `js/overrides-loader.js?v=1`, `js/kit-rules.js?v=1`.

**Important** : incrementer ces numeros dans la page HTML concernee apres chaque modif CSS/JS pour forcer le rechargement sur GitHub Pages (et mobile).

### 4.6 Regles metier du KIT — source UNIQUE `js/kit-rules.js`
Toutes les regles de pre-remplissage des jetons du kit vivent dans `js/kit-rules.js` (`window.KitRules`), chargee par machine.html, database.html, edit-machine.html, soumission.html et export.html. **Modifier une regle (ex. ajouter un modele drain) = UN SEUL fichier.**
Expose : `DRAIN_PREFIXES` (77 prefixes), `excDefaults(specs, modele)`, `pompeDefaults(specs)`, `harnais(fab, modele)`, `applyOverride(defaults, bom, isExc)`.
- **Excavatrice** : `0000` Cabine = **r toujours** ; `0001`/`0002`/`0005` = j ; `0004` Mini = r si poids <= 5000 kg (PRE-REMPLISSAGE des nouvelles entrees SEULEMENT : le vrai critere est la gamme mini/compacte du FABRICANT, porte par les overrides depuis le 2026-08-10 — voir le skill portal-kit-options) ; `0009` Drain = r si le modele commence par un `DRAIN_PREFIXES` (jamais jaune) ; `0008`/`0070` = na ; `0304` = r si modele = TB216.
- **Pompe a Beton** : `0201`/`0202` = j ; `0204`/`0205`/`0206` = r si `Nombre de sections` >= 4/5/6 ; reste na.
- **Jeton affiche = defauts + overrides** (corrections manuelles par machine). C'est LA verite, identique dans fiche / BD / export. Jamais re-persiste.

### 4.7 Soumission — regle du code Creusage 2D (FIXE, non-overridable)
La tuile **Soumission** est un FORMULAIRE ou l'utilisateur SELECTIONNE les options (≠ affichage des jetons). Le BOM final = items obligatoires (du kit) + options choisies.
Regle du **Systeme de creusage 2D** (`js/soumission.js`, fonction `creusage2dCode()`) — le code depend du **limiteur de portee** :
- Limiteur **Hauteur** / **Hauteur + Rotation** / **Multi-axe** → **`1000-0007`** (creusage 2D integre au limiteur)
- **Aucun limiteur** OU **Rotation seule** → **`1100-0007`** (creusage 2D autonome)

Regle FIXE pour les excavatrices, **aucun override**. Appliquee dans le resume de la page ET le courriel. Les codes des accessoires (creusage 2D, camera) sont aussi listes **a la suite du Kit Machine** dans le courriel.
Reference laser = `1000-0009`. Warning : si un item du kit est **a verifier** (etat `v`), une tuile orange s'affiche sur la page + une section warning dans le courriel.

---

## 5. Procedure de developpement

### 5.1 Lancer le serveur local
```bash
cd portal-machine
python -m http.server 8080
```
Ou via Claude Code : `preview_start` avec la config `.claude/launch.json`

### 5.2 Modifier le code
- **HTML** : `index.html` — structure et elements UI
- **JS** : `js/app.js` — toute la logique
- **CSS** : `css/style.css` — styles et responsive

### 5.3 Tester
1. Ouvrir `http://localhost:8080` dans le navigateur
2. Tester la selection en cascade (tous les types, pas seulement Excavatrice)
3. Tester le NIP dans le menu engrenage
4. Verifier les erreurs dans la console du navigateur

### 5.4 Deployer
1. Incrementer les versions dans `index.html` (`style.css?v=XX`, `app.js?v=XX`)
2. Commit et push sur `main`
3. GitHub Pages se met a jour automatiquement

---

## 6. Points d'attention

- **OneDrive** : Le repo est dans un dossier OneDrive. Les outils Edit/Write de Claude Code peuvent etre bloques sur certains fichiers. Utiliser des scripts Python comme alternative si necessaire.
- **Pas de Node.js** : L'environnement n'a pas Node.js installe. Utiliser Python pour le serveur HTTP.
- **machines.json est gros** (~12 MB) : Ne pas le lire en entier inutilement (parser en script plutot). Les overrides par type, eux, sont petits.
- **Responsive** : Tester sur mobile (breakpoints a 600px et 900px).

---

## 7. Historique des changements recents

### 2026-06-03 — Overrides decoupes par type + ecriture compacte
- **Probleme** : `data/overrides.json` (fichier unique) ecrit en indente = 892 KB pour 296 KB de donnees reelles, approche du plafond 1 Mo de l'API Contents ; toute sauvegarde reecrit tout le fichier.
- **Solution** : 1 fichier overrides par type (`data/overrides/<slug>.json`) + ecriture backend en compact.
- **Detail** :
  - `scripts/split_overrides_by_type.py` : split sans perte (verifie : fusion == original ; excavatrices intactes).
  - `js/overrides-loader.js` : `loadMergedOverrides()` fusionne les fichiers par type + repli legacy (rollout sans casse). [8 types a l epoque, 11 aujourd hui]
  - `Api.gs` : ecriture compacte (`JSON.stringify(data)`) + routage par type (`OV_TYPE_SLUGS`, `_ovFilePath`, `ohReadFile/Write/UpdateJson(type)`).
  - **Frontend DEPLOYE** (commit f240791) + **Api.gs REDEPLOYE et verifie** (test machine factice : commit ecrit dans `data/overrides/excavatrice.json`, compact). Decoupage par type COMPLET de bout en bout.
- **Bonus** : editer un type ne peut plus toucher le fichier d'un autre (excavatrices structurellement protegees).

### 2026-06-03 — Regles centralisees, tuile Export, soumission enrichie
- **`js/kit-rules.js`** : regles du kit centralisees (etaient dupliquees dans 5 fichiers). Voir 4.6.
- **`export.html`** (tuile Export, Super Admin + Administrateurs) : telecharge le BOM par type en `.xlsx` (ExcelJS) avec points de couleur (R/J/V/NA), legende figee, AutoFilter, colonnes Items custom / Notes / Drapeau (warnings). Reflete l'etat AFFICHE (defauts + overrides).
- **Soumission** : warning « items a valider » (tuile page + section courriel) ; codes accessoires (creusage 2D / camera) listes a la suite du Kit Machine ; regle du code Creusage 2D selon limiteur (voir 4.7).
- Destinataires soumission = `sales_emails` (Script Property, gere dans l'Admin).

### 2026-06-03 — Fix header mobile
- Logo qui empietait sur le toggle FR/EN sur cellulaire → media queries 600px + 360px (logo retreci, boutons resserres). Cache `style.css?v=172`.

### Mars 2026 — Suppression de modele dans le menu engrenage
- **Probleme** : La suppression dependait du kit machine (kitUnlocked) → ne fonctionnait que pour les Excavatrices
- **Solution** : Deplace la suppression dans le menu engrenage, protegee par le meme NIP
- **Details** :
  - Bouton rouge "Supprimer [Fab] [Modele] ([Annee])" dans le gear menu
  - Confirmation explicite mentionnant l'annee ("Annee : XXXX seulement")
  - Suppression locale + persistance API
  - Fonctionne pour tous les types de machines

---

*Derniere mise a jour : 2026-06-03*
