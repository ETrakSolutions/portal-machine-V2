---
name: ajout-type-de-machine
description: "Ajouter un TYPE complet de machine au Portal Machine V2 (et non une seule
  machine). Demande interactive (type, plage d'annees, fabricants), recherche multi-agents
  des modeles nord-americains, remplissage d'un fichier Excel (tous modeles x toutes annees
  x specs), approbation humaine OBLIGATOIRE, puis integration au portail. Triggers : ajoute
  un type de machine, nouveau type de machine, ajoute le type [X], recense les fabricants,
  recherche de type de machine, monte la liste des [telehandler/loader/nacelle/...],
  recenser la gamme NA. NE PAS confondre avec portal-fill-specs (UNE seule machine)."
---

# Portal Machine — Ajouter un TYPE de machine (workflow dicte par Robin)

Workflow STRICT et INTERACTIF pour creer une categorie complete dans le Portal V2.
Suivre les etapes DANS L'ORDRE. Ne JAMAIS sauter une question. Ne RIEN integrer au
portail avant l'approbation explicite de l'utilisateur (etape 8).

Pour remplir les specs d'UNE seule machine deja existante : utiliser `portal-fill-specs`.

## Emplacement du depot
Clone local de `ETrakSolutions/portal-machine-V2` (V1 gelee, tout passe par V2).
Utiliser le **repertoire de travail courant** (le clone ouvert dans Claude Code),
JAMAIS un chemin code en dur — il differe d'un poste a l'autre.

## Emplacement du fichier Excel de sortie
Dossier SharePoint « _Portail e-Trak » synchronise sur le poste courant :
`%USERPROFILE%\e-Trak\E-Trak – Production - General\_Portail e-Trak`
Nom : `Recherche_<Type>_<AAAA-MM-JJ>.xlsx`.

---

## ETAPES (ordre obligatoire)

### 1. Demander le TYPE de machine
Demander a l'utilisateur **quel type de machine** il veut ajouter. Attendre la reponse.

### 2. Demander la PLAGE D'ANNEES
Demander **de quelle annee a quelle annee** couvrir. Attendre la reponse.

### 3. Presenter la LISTE DES FABRICANTS (Amerique du Nord)
Rechercher et presenter une **liste des fabricants** de ce type de machine **disponibles
en Amerique du Nord**. Croiser parc reel ProgressionLive (voir
[[reference-progressionlive-api]]) + gamme commerciale NA. Fusionner les marques jumelles
sous un libelle unique (ex. « Develon (Doosan) », « Genie (Terex) », « MEC (Dingli) »).

### 4. Demander AJOUTER / ENLEVER
Demander a l'utilisateur s'il veut **ajouter ou enlever** des fabricants de la liste.
Appliquer ses modifications. Reconfirmer la liste finale.

### 5. Demander les SPECS TECHNIQUES
Demander **quelles specifications techniques** il veut pour ce type dans le portail
(les champs de specs, ex. Capacite, Puissance moteur, Poids operationnel, Hauteur...).
Attendre la reponse.

### 6. RECHERCHE MULTI-AGENTS -> remplir l'EXCEL
**ATTENDRE L'APPROBATION DE L'UTILISATEUR AVANT DE LANCER L'ETAPE 6.** Ne pas demarrer
la recherche tant qu'il n'a pas donne son OK explicite (la recherche est lourde : autant
d'agents que de fabricants).

Une fois approuve : lancer une recherche **multi-agents** : **UN agent par fabricant**, lances EN PARALLELE
(meme message, plusieurs appels Agent). Chaque agent retourne, pour SA marque, **tous les
modeles NA** avec les specs demandees, **pour chaque annee** de la plage.
- Source OFFICIELLE constructeur d'abord ; croiser avec une 2e source ; en cas d'ecart,
  garder l'OFFICIELLE et signaler. Valeur inverifiable -> `A completer` (jamais inventer).
- Remplir un **fichier Excel** (openpyxl) : une ligne par **modele x annee**.
  Colonnes : Fabricant, Modele, Annee, + une colonne par spec demandee, + Source / Note.
  Inclure **tous les modeles disponibles pour chaque annee** de la plage.
- Sauver l'Excel a l'emplacement ci-dessus.

### 7. PRESENTER le fichier
Presenter le fichier rempli a l'utilisateur (chemin + resume : nb fabricants, nb modeles,
nb lignes, specs incertaines a valider).

### 8. APPROBATION HUMAINE — BLOQUANT
**NE RIEN integrer au portail tant que l'utilisateur n'a pas approuve le fichier.**
Attendre un OK explicite. Il peut demander des corrections -> corriger l'Excel et
re-presenter (retour etape 7). Tant qu'il n'a pas approuve, STOP.

### 9. INTEGRATION au portail (apres approbation seulement)
Integrer les donnees de l'Excel approuve dans le Portal V2.

**Donnees :**
- `data/machines.json` (minifie 1 ligne -> `separators=(',',':')`, JAMAIS `indent=2`) :
  noeud `data["<Type>"][fabricant][annee][modele] = { specs... }` + `_bom_labels`
  (= PLACEHOLDER au depart, a finaliser par l'admin ; ne pas inventer de PN).

**Branchement du type (8 points + cache) — gabarit reutilisable :**
1. `data/machines.json` : noeud `<Type>` + `_bom_labels`
2. `data/overrides/<slug>.json` : `{"<Type>":{}}`
3. `js/overrides-loader.js` : `TYPE_SLUGS` `'<Type>':'<slug>'`
4. `database.html` : `SPEC_COLS['<Type>']` + `SPEC_MAP` + `SPEC_FIELD_MAP`
5. `js/admin.js` : `ALL_MACHINE_TYPES`
6. `export.html` : `TYPE_ORDER`
7. `js/translations.js` : `type.<Type>` (FR + EN), 2 blocs
8. `edit-machine.html` : `typeIcons` (emoji). Les menus de type sont DYNAMIQUES
   (`Object.keys(machinesData)`).
+ Cache bumps : overrides-loader, translations, admin, + `version.json`.
Le rendu kit passe par le moteur generique (tout type ayant `_bom_labels`).

**Test + deploiement :**
- Tester Selenium LOCAL puis LIVE (selecteur de type, colonnes, nb de modeles,
  drill-down machine, 0 erreur console).
- Pousser via le skill `portal-deploy` — avec le compte GitHub autorise sur ce poste
  pour `ETrakSolutions/portal-machine-V2`.
- Live a jour ~1 min apres (latence CDN).

**RESTE manuel (edition) :** pour EDITER des machines du nouveau type (ecriture overrides),
ajouter `'<Type>':'<slug>'` a `OV_TYPE_SLUGS` dans l'Apps Script DEPLOYE + redeployer le
Web App. (Affichage/export marchent sans ca.) Ne pas coller un `Api.gs` local perime.

---

## Pieges
- Concurrence : ne pas ecrire dans machines.json pendant qu'un humain edite la meme donnee.
- machines.json minifie -> `separators=(',',':')`.
- Donnees locales periment vs live -> synchroniser (curl) avant test/export local.
- Cle ProgressionLive se regenere -> 401 ([[reference-progressionlive-api]]).
- Kit `_bom_labels` = placeholder par defaut, a valider par l'admin.
- Excel : fermer le fichier avant ecriture openpyxl (sinon verrou).

Lie a : [[portal-fill-specs]], [[project-portal-loader-type]], [[project-portal-nacelle-type]],
[[project-portal-telehandler]], [[reference-progressionlive-api]], [[project-portal-db-is-master]].
