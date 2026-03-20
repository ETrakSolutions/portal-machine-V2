# Portail Machine e-Trak — Procedure de travail

Ce document decrit l'etat actuel du projet, son architecture et les procedures pour continuer le developpement avec Claude Code.

---

## 1. Vue d'ensemble

**Portail Machine** est un outil web interne pour consulter les specifications techniques de machines (excavatrices, grues, foreuses, etc.) et configurer les kits e-Trak associes.

- **Repo GitHub** : `ETrakSolutions/portal-machine`
- **Deploiement** : GitHub Pages — `etraksolutions.github.io/portal-machine/`
- **Stack** : HTML/CSS/JS vanilla (aucun framework)
- **Backend** : Google Apps Script pour la persistance (notes, emails, suppressions)

---

## 2. Structure des fichiers

```
portal-machine/
├── index.html              # Page principale (UI complete)
├── js/app.js               # Logique applicative (~750 lignes)
├── css/style.css           # Styles (~980 lignes)
├── data/
│   ├── machines.json       # Base de donnees machines (~1.5 MB)
│   └── shared-data.json    # Donnees partagees
├── assets/
│   ├── logo-white.png
│   └── fonts/              # Polices Acumin Pro
├── .claude/launch.json     # Config serveur dev
└── PROCEDURE.md            # Ce fichier
```

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
- **Protege par NIP** `1400` via le cadenas
- Logique automatique : mini excavatrice < 5000 kg, drain hydraulique pour modeles specifiques, etc.

### 3.4 Notes par modele
Textarea pour notes specifiques a chaque combinaison fabricant/modele/annee
- Sauvegarde API + localStorage en fallback

### 3.5 Gestion des emails (menu engrenage)
- Liste d'emails cibles pour les demandes de kit
- **Protege par NIP** `1400`
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
        "320": {
          "Image": "",
          "Puissance moteur (kW / HP)": "121 kW / 162 HP",
          "Type de traction": "Chenille",
          ...
        }
      }
    }
  }
}
```
Hierarchie : Type → Fabricant → Annee → Modele → Specs

### 4.2 API Google Apps Script
```
URL : https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec
```

| Action | Methode | Cle | Usage |
|--------|---------|-----|-------|
| Lire | GET | `?action=get&key=X` | Notes, emails |
| Ecrire | POST | `{action:'save', key, value, pin:'1400'}` | Notes, emails, suppressions |
| Modele custom | POST | `{action:'saveModel', modelKey, specs}` | Sauvegarder un modele cree |

### 4.3 Protection NIP
- **PIN unique** : `1400` (variable `KIT_PIN` dans app.js)
- 3 zones protegees : Kit machine, Emails, Suppression de modele
- Le menu engrenage protege les emails ET la suppression (meme NIP)

### 4.4 Cache busting
Les fichiers CSS et JS sont charges avec un parametre de version :
- `css/style.css?v=31`
- `js/app.js?v=32`

**Important** : Incrementer ces numeros dans `index.html` apres chaque modification pour forcer le rechargement sur GitHub Pages.

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
- **machines.json est gros** (~1.5 MB) : Ne pas le lire en entier inutilement.
- **Responsive** : Tester sur mobile (breakpoints a 600px et 900px).

---

## 7. Historique des changements recents

### Mars 2026 — Suppression de modele dans le menu engrenage
- **Probleme** : La suppression dependait du kit machine (kitUnlocked) → ne fonctionnait que pour les Excavatrices
- **Solution** : Deplace la suppression dans le menu engrenage, protegee par le meme NIP
- **Details** :
  - Bouton rouge "Supprimer [Fab] [Modele] ([Annee])" dans le gear menu
  - Confirmation explicite mentionnant l'annee ("Annee : XXXX seulement")
  - Suppression locale + persistance API
  - Fonctionne pour tous les types de machines

---

*Derniere mise a jour : 2026-03-19*
