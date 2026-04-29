# Portal Machine V2 — Document de transfert

Ce document est destine a la personne (ou aux personnes) qui prendront la suite du developpement de ce projet apres le depart de Robin Gagnon de e-Trak.

---

## Vue d'ensemble

**Portal Machine V2** est la refonte du portail e-Trak (`portal-machine`).
Le but : permettre aux administrateurs e-Trak d'editer la base de donnees machines directement dans Google Sheets, sans toucher au code.

| Composant | URL |
|---|---|
| Portail V1 production (intact) | https://etraksolutions.github.io/portal-machine/ |
| Portail V2 (en developpement) | https://etraksolutions.github.io/portal-machine-V2/ |
| Repo V1 (production) | https://github.com/ETrakSolutions/portal-machine |
| Repo V2 (developpement) | https://github.com/ETrakSolutions/portal-machine-V2 |

---

## Status au moment du transfert

A completer au moment du transfert reel.

| Tache | Statut |
|---|---|
| Repo V2 cree et public | ✅ |
| GitHub Pages V2 active | ✅ |
| Detache du fork (autonome) | ✅ |
| Excel template structure (Portal_DB_Test_v11.xlsx) | ✅ |
| Migration vers Google Sheets | ⏳ |
| Apps Script `getMachines` action | ⏳ |
| Modification app.js pour lire Sheets | ⏳ |
| Tests utilisateurs admins | ⏳ |
| Bascule V1 → V2 | ⏳ |

---

## Acces a transferer / inviter

| Personne | Role souhaite | Username GitHub | Statut |
|---|---|---|---|
| Robin Gagnon | Owner sortant | Robin-Gagnon | A retirer au depart |
| (a remplir) | Owner | (a remplir) | (deja owner) |
| Jacquot | Admin / Maintain | (pas encore) | A inviter quand compte cree |
| Kevin | Admin / Maintain | (pas encore) | A inviter quand compte cree |

### Procedure pour inviter Jacquot et Kevin

1. Aller sur https://github.com/ETrakSolutions/portal-machine-V2
2. Settings -> Collaborators and teams -> "Add people"
3. Entrer leur username GitHub
4. Choisir le role : `Admin` (pour qu'ils puissent gerer Settings et Pages)

---

## Architecture cible

```
┌─────────────────────────────────────────┐
│  V1 PRODUCTION                          │
│  etraksolutions.github.io/portal-machine│
│  Lit: data/machines.json (statique)     │
│  Users: tous les utilisateurs actuels   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  V2 (developpement)                     │
│  etraksolutions.github.io/              │
│   portal-machine-V2                     │
│  Lit: Google Sheets via Apps Script     │
│  Users: admins testent + editent BD     │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Google Sheets (BD editable)            │
│  Admins editent ici directement         │
│  Apps Script expose les donnees en JSON │
└─────────────────────────────────────────┘
```

---

## Structure de la base de donnees

Le fichier `data/Portal_DB_Test_v11.xlsx` contient le template complet de la BD V2.

### Onglets principaux

| Onglet | Contenu |
|---|---|
| `_Lisez-moi` | Vue d'ensemble + legende |
| `Excavatrice` | Specs + kits BOM + harnais + notes tech (6 216 lignes) |
| `PompeBeton` | Specs + kits BOM (3 043 lignes) |
| `GrueMobile` / `BoomTruck` / `Telehandler` / `Foreuse` / `CamionVacuum` / `Retrocaveuse` | Specs par type |
| `Notes` | Notes texte par modele |
| `Warnings_Soumission` | Avertissements affiches lors de la soumission (avec systeme de triggers) |
| `Flags` | Drapeaux BOM (signalements de defaut) |
| `Demandes_creation` | Log des demandes de nouvelles machines |
| `Changelog` | Audit des modifications |

### Onglets de reference (gestion)

| Onglet | Contenu |
|---|---|
| `_Listes` | GESTION CENTRALISEE des menus deroulants (Severite, Trigger_Type, Roles, Source_BOM, Statut_Demande, Oui_Non, Options_Soumission) |
| `BOM_Codes` | Liste des codes BOM avec descriptions |
| `Harnais_Codes` | Codes harnais Z03B-XXXX par fabricant + colonne Affichage auto-generee |
| `Emails`, `Vendeurs`, `Users`, `Roles` | Configurations admin |

### Comment regenerer le template

```bash
cd portal-machine-v2
python scripts/export_to_excel.py
# Genere data/Portal_DB_Test_v11.xlsx (a renommer si besoin)
```

---

## Migration vers Google Sheets (etapes restantes)

1. **Importer le template dans Google Drive**
   - Ouvrir Google Drive
   - Glisser-deposer `data/Portal_DB_Test_v11.xlsx`
   - Clic droit -> "Ouvrir avec Google Sheets"
   - Fichier -> Enregistrer en tant que Google Sheets
   - Renommer en "Portal_DB_V2"

2. **Modifier l'Apps Script existant**
   - Editer le script lie au spreadsheet (`https://script.google.com/...`)
   - Ajouter une action `getMachines` qui lit l'onglet Excavatrice et reconstitue le JSON nest
   - Documentation des actions existantes dans `js/app.js` et `js/admin.js` (chercher `API_URL`)

3. **Modifier `js/app.js` de V2**
   - Remplacer le `fetch('data/machines.json')` initial par `fetch(API_URL + '?action=getMachines')`
   - Garder `data/machines.json` en fallback si l'API ne repond pas (pour resilience)

4. **Tester**
   - Ouvrir https://etraksolutions.github.io/portal-machine-V2/
   - Verifier que les machines sont chargees depuis Sheets
   - Editer un modele dans le Sheet -> rafraichir le portail -> changement visible

---

## Operations courantes

### Lancer le serveur local pour developpement

```bash
cd portal-machine-v2
python -m http.server 8080
# Ouvrir http://localhost:8080
```

### Pousser des changements

```bash
git add .
git commit -m "Description du changement"
git push origin main
# GitHub Pages se redeploie automatiquement (~1-2 min)
```

### Verifier le deploiement Pages

```bash
curl -sI https://etraksolutions.github.io/portal-machine-V2/
# Doit retourner HTTP 200
```

---

## Securite

⚠️ **Pas de tokens, cles API, ou mots de passe dans le code**. Tout secret doit etre dans GitHub Secrets de l'org ou dans l'Apps Script.

⚠️ **Robin a un Personal Access Token (`ghp_...`) actuellement embedded dans le git remote du repo V1 production.** A revoquer dans GitHub Settings -> Developer settings au moment de son depart.

---

## Contacts pour questions

A completer.

| Sujet | Personne |
|---|---|
| Code portail (HTML/JS) | (a remplir) |
| Apps Script Google | (a remplir) |
| Donnees BD machines | (a remplir) |
| Operations GitHub | (a remplir) |

---

*Derniere mise a jour : 2026-04-29 (creation du V2)*
