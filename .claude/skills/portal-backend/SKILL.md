---
name: portal-backend
description: "Backend Apps Script du Portal Machine V2 (apps-script/Code.gs, fichier API.gs dans l'éditeur Google) — modèle de sécurité, actions serveur, redéploiement pas à pas, propriétés du script et secrets. Utiliser dès qu'on touche au serveur du portail — modifier ou redéployer le script, nouvelle version, Code.gs, API.gs, doPost, Script Properties, NIP, clé ou jeton, super admin, compte protégé, authorized_users_v2, prix servis par le serveur (getprices, publier_prix), inventaire Epicor, cédule des techniciens ProgressionLive (getcedule), clé ProgressionLive à changer, rôle qui voit ou ne voit pas quelque chose, fuite de données, sécurité du portail. Aussi quand une page du portail n'affiche plus les prix ou la cédule, ou quand il faut ajouter une action serveur. Couvre les bancs de test Node du backend et l'ordre de mise en ligne serveur → données → pages."
---

# Portal Machine V2 — Backend Apps Script

Le portail est un site statique public (GitHub Pages, dépôt **public**). Tout ce qui doit
rester privé — comptes, prix, inventaire, cédule — passe par le script Google
**« Portal Machine API »**, propriété de `etrak.portail@gmail.com`, exécuté « en tant que
moi ». Ce skill décrit ce script et la façon de le changer sans casser le portail en
ligne. Pour les données machines et le kit, voir `portal-machine-db` ; pour pousser les
pages, `portal-deploy`.

- Source : `apps-script/Code.gs` (CRLF). **Dans l'éditeur Google, le même code s'appelle `API.gs`.**
- URL du Web App : dans `js/config.js` (`PORTAL_API_URL`). Elle ne change jamais.
- Éditeur : `https://script.google.com/u/1/home/projects/18fXdjPV2m2P6oaKJ_05iOkPPKuGRmilDyzMrpk72rcOwgmz48IG4uuki/edit?authuser=etrak.portail@gmail.com`
- Seul Jacquot colle et redéploie (console Google). Claude prépare, teste, guide.

## Le principe qui gouverne tout

**Le serveur fait foi ; la page n'est jamais une barrière.** Le code des pages est public
et un appel direct à l'API contourne n'importe quel bouton masqué. Chaque action vérifie
elle-même la session, relit le rôle dans `authorized_users_v2` **à chaque appel** (un
compte rétrogradé perd l'accès tout de suite) et ne renvoie que les champs nécessaires.
Un masquage côté page n'est qu'un confort d'affichage — toujours le doubler côté serveur,
et le tester par un appel direct.

## Modèle d'authentification

- `_authCheck(body)` : **PIN** (Script Property `PIN`, fichier `PIN Portail.txt` gitignoré)
  = admin **sans identité** (scripts d'automatisation) ; sinon **jeton de session**
  (`session_<token>`, 90 jours glissants) → `{ ok, admin, role, perms, user }`.
- `_isAdminRole` lit `roles_permissions` (modifiable par un admin dans l'UI), **sauf**
  `super_admin`, toujours admin — sinon un simple administrateur pourrait lui retirer ses droits.
- `SENSITIVE_KEYS` : jamais lisibles par le GET public ni listées. `ADMIN_WRITE_KEYS` :
  lisibles, écriture admin seulement. Les clés `price_list_*` sont en plus intouchables par
  `save`/`delete` génériques (`_isPriceKey`).
- ⚠️ `?action=get&key=…` répond **sans authentification** pour toute clé hors liste
  sensible (ex. `machine_requests` porte des noms et courriels). Une nouvelle donnée privée
  va dans `SENSITIVE_KEYS` ou derrière sa propre action.

## Les actions protégées (état au 2026-09-25, version 30)

| Action | Qui | Ce qui sort | Décision |
|---|---|---|---|
| `save` sur `authorized_users_v2` | admin / PIN, filtré par `_guardUsersSave` | — | 2026-09-25 |
| `getinventory` | rôles avec `inventoryAccess` (défaut : admin, vente int./ext.) | quantités en main | Steve 2026-09-23 |
| `getprices` | vraie session, rôle avec `soumissionAccess` ; **pas le PIN, pas l'invité** | `{PN:{item,install,installCode}}` + journal par compte | Jacquot 2026-09-25 |
| `setprices` / `getpriceslog` | admin / PIN | — / qui a obtenu les prix, quand | idem |
| `getcedule` | rôles internes `CEDULE_ROLES` (pas dealer, distributeur, invité) | noms, jours, booléens AM/PM | Jacquot 2026-09-25 |
| `adduser` / `listmyusers` / `updatemyuser` | `addUsers` (vente externe) — Dealer/Distributeur seulement | — | Steve 2026-09-24 |

**Comptes protégés (`_guardUsersSave`)** : le portail renvoie la liste COMPLÈTE des comptes
à chaque sauvegarde. Le serveur réimpose les comptes protégés :
- `OWNER_EMAIL = 'jcaron@gryb.com'` : personne d'autre ne le modifie ni ne le retire ; lui
  change son nom et son mot de passe, jamais son rôle, son identifiant ni son statut ;
- `super_admin` : seul un Super Admin **connecté** (pas le PIN) en retire, rétrograde,
  modifie ou promeut un ;
- un compte protégé envoyé par un appelant non autorisé est **restauré silencieusement**
  (une page restée ouverte ne casse pas la sauvegarde d'un admin), les doublons portant son
  identifiant sont retirés (le login prend la première correspondance) ;
- la liste ne peut plus être effacée (`delete` refusé) ni remplacée par autre chose qu'une
  liste — avant, un `save` de texte invalide bloquait la connexion de tout le monde.

**Prix** : liste maîtresse `prix-portail.json` sur SharePoint *E-Trak Production › General ›
_Portail e-Trak* ; publication `py -3.13 scripts/publier_prix.py` (voir `portal-machine-db`,
« Les prix ne sont PAS dans le dépôt »). Stockés en tranches de 8 Ko (limite 9 Ko par propriété).

**Cédule** : lit ProgressionLive (`hr/list`, `task/list`) avec la clé de Jacquot. Règles :
techniciens = ressources actives dont le nom ne commence pas par `_` moins `CEDULE_EXCLUS`
(« Autre tech ») — le type ProgressionLive n'est pas fiable ; ferme une case toute tâche du
technicien ou dont il est aide qui chevauche AM 7 h 30-12 h / PM 12 h-16 h 30 (congés
compris), sauf annulées et feuilles de temps ; durée jamais prolongée ; cache 15 min.

### Règles pour toute nouvelle action

0. **Qui voit quoi est une décision de Jacquot**, pas une décision technique : avant de
   coder, faire trancher les rôles admis et les champs affichés (noms de clients compris),
   puis l'inscrire dans la colonne « Décision » ci-dessus. Par défaut, aucun nom de client,
   aucune adresse, aucun montant.
1. Contrôle de session + rôle relu **dans l'action**, sur le modèle de `getInventory`.
   L'action s'enregistre dans `doPost`, dans le bloc des actions qui s'authentifient
   elles-mêmes (à côté de `getinventory`, `getprices`, `getcedule`), **pas** dans
   `writeActions`, qui accepte le PIN comme admin.
   - Rôles admis réglables par l'admin : une permission dans `roles_permissions` (ex.
     `inventoryAccess`), avec une liste de rôles par défaut tant qu'elle n'a jamais été
     touchée (`_canSeeInventory`), et la clé ajoutée à `ROLES` / `PERM_KEYS` / `PERM_LABELS`
     de `js/admin.js`. Rôles fixés par décision : une constante (ex. `CEDULE_ROLES`).
2. **Liste blanche** de ce qui sort. Une fiche ProgressionLive porte coût horaire, téléphone
   et position GPS ; une tâche porte l'adresse du client : rien de cela ne quitte le serveur.
3. Vers une API externe : **lectures fixes écrites en dur**, jamais un chemin ou un
   paramètre venu du portail. La clé ProgressionLive a les droits admin de Jacquot (créer,
   réassigner, supprimer) : un relais générique serait une porte d'écriture.
4. Donnée privée stockée → `SENSITIVE_KEYS` (ou préfixe protégé comme `price_list_`).
5. Un cas dans `scripts/banc_backend/` (un nouveau banc s'ajoute à la liste de `tous.js`,
   sinon il ne tourne jamais), et la preuve qu'il échoue sur l'ancienne version.

**Deux façons d'amener une donnée au serveur** :
- **poussée** par un script du poste avec le PIN dans une clé sensible — ex.
  `scripts/sync_inventaire_epicor.py` lit la réplique SQL Epicor et fait
  `{action:'save', key:'inventory_etrak', value, pin}` ; `publier_prix.py` fait `setprices`.
  Le serveur ne parle jamais à Epicor. La donnée n'est fraîche qu'au dernier passage du script ;
- **lue** par le serveur dans une API externe (`UrlFetchApp`, clé en Script Property) — ex.
  la cédule (`_plGet`, base `PL_BASE`). Fraîche à chaque appel, sous réserve du cache.

## Tester avant de toucher à la console

`node scripts/banc_backend/tous.js` exécute le **vrai** `Code.gs` en Node, services Google
simulés (propriétés, cache, verrou, UrlFetch) : comptes 21 cas, prix 23, cédule 18. Code de
retour ≠ 0 si un seul échoue. **Ne jamais le piper dans `| tail` au sein d'une chaîne `&&`** :
le code de retour se perd et le commit passe (arrivé le 2026-09-25).

- Éprouver le banc : `git show <ancien commit>:apps-script/Code.gs > apps-script/Code.gs`,
  relancer (doit échouer), puis `git checkout HEAD -- apps-script/Code.gs`.
- Cédule sur les vraies données : `PL_KEY=<coffre> node scripts/banc_backend/banc_cedule.js reel`
  imprime la grille et écrit un jeu d'essai sans client pour `scripts/selenium_cedule_test.py --fixture`.
  Lire la clé : `py -3.13 -c "import keyring,sys;sys.stdout.write(keyring.get_password('progressionlive-portail','jcaron'))"`
  (`sys.stdout.write`, pas `print` : le retour chariot Windows casse l'en-tête).
- Pages qui ont besoin des prix : `scripts/_prix_test.py` simule `getprices` et `whoami`
  depuis la liste maîtresse (`installer_prix`, `SESSION_TEST_JS`).

## Redéployer — la procédure qui a fait ses preuves

Guider Jacquot **une étape à la fois**, attendre sa réponse avant la suivante.

1. **L'éditeur contient-il ce que le dépôt croit ?** Faire noter la dernière ligne d'`API.gs`
   et la comparer au `Code.gs` du dernier déploiement (`wc -l`, l'éditeur affiche +1). Écart
   → lui faire copier l'éditeur (clic dans le code, Ctrl+A, Ctrl+C), le lire avec
   `Get-Clipboard -Raw` et le comparer au dépôt **avant** d'écraser. Le 2026-09-25, l'éditeur
   portait `'Tracteur': 'tracteur'` dans `OV_TYPE_SLUGS` et `_diagMail`, absents du dépôt :
   coller à l'aveugle cassait les BOM Tracteur. Reporter dans le dépôt ce qui manque.
2. **Mettre le script dans le presse-papiers** et le vérifier :
   `Set-Clipboard -Value ([IO.File]::ReadAllText('apps-script\Code.gs',[Text.Encoding]::UTF8))`
   puis comparer la longueur. **Une capture d'écran ou une autre copie l'écrase** : le dire,
   et revérifier le presse-papiers si « ça n'a rien fait ».
3. Coller : clic dans le code, Ctrl+A, Ctrl+V, Ctrl+S ; faire confirmer le nouveau numéro de
   dernière ligne et l'absence d'erreur rouge.
4. **Déployer › Gérer les déploiements › crayon › Version : Nouvelle version › Déployer.**
   Jamais « Nouveau déploiement » : nouvelle URL, le portail ne parle plus au script.
5. Vérifier en ligne par des appels **non destructifs** : action nouvelle sans session →
   `authentication required` (l'ancienne version répondrait `unknown action`), clé sensible
   par GET → vide. **Jamais** de test d'écriture avec le PIN (un `delete` sur une ancienne
   version effacerait la liste des comptes).

**Committer et pousser `Code.gs` AVANT de le coller** : le dépôt est la source, et ce qui
est collé doit être un commit identifiable. Après le déploiement, ajouter la version
ci-dessous.

Versions : 28 (comptes protégés), 29 (prix), 30 (cédule) — toutes du 2026-09-25.

### Ordre de mise en ligne

Serveur d'abord, **données** ensuite (ex. `publier_prix.py`), **pages** en dernier. Retirer
un fichier du site avant que le serveur le remplace coupe le service : le 2026-09-25,
`git rm --cached data/prices.json` préparé d'avance est parti avec le commit du serveur et
la Soumission a perdu ses prix un quart d'heure. Donc : ne rien préparer dans l'index pour
plus tard, et lire `git diff --cached --stat` avant **chaque** commit.

## Propriétés du script et secrets

**L'écran « Propriétés du script » ne permet pas de modifier** : trop de propriétés (toutes
les données du portail y vivent), le bouton n'apparaît pas — Ctrl+F ne le trouve pas. Pour
installer ou changer une valeur :
1. construire dans le presse-papiers une fonction temporaire **avec la valeur déjà dedans**
   (lue dans le presse-papiers ou le coffre, jamais tapée ni affichée) — pour la clé
   ProgressionLive, le nom exact est `PROGRESSIONLIVE_API_KEY` :
   `function installerClePL() { PropertiesService.getScriptProperties().setProperty('PROGRESSIONLIVE_API_KEY', '…'); Logger.log(…length); }`
2. Jacquot la colle en fin d'`API.gs`, Ctrl+S, la choisit dans la liste, **Exécuter**, lit le journal ;
3. **il l'efface et resauve** ; contrôler le numéro de dernière ligne revenu à l'original.

**Changer une valeur ne demande PAS de redéploiement** : le code relit la propriété à chaque
appel, et une version déployée ne fige que le code. L'effacement de l'étape 3 compte quand
même : la fonction ne doit jamais se retrouver dans un futur déploiement.

Ne jamais faire de capture de cette page : elle affiche le PIN et le jeton GitHub en clair.

**Secrets — règles** :
- Une clé ne transite jamais par la conversation, un fichier du dépôt ou une capture. La
  lire dans le presse-papiers, la vérifier par un appel (`/auth/profile` pour
  ProgressionLive) sans l'afficher, la ranger dans le coffre Windows (`keyring`, service
  `progressionlive-portail`, utilisateur `jcaron`).
- Clé collée par erreur dans la conversation : s'en servir au plus pour la maquette, puis la
  faire **régénérer** et vérifier que l'ancienne répond 401.
- **Une clé qui a transité par la conversation ne va jamais en production** : même si elle
  fonctionne, la faire régénérer, et installer celle qui passe par le presse-papiers.
- **Clé ProgressionLive** : fiche de Jacquot (Gestion › Utilisateurs › sa fiche › onglet
  API › « Générer une nouvelle clé » **puis Enregistrer** — sans Enregistrer, 401). Vérifier
  l'onglet Général avant de générer : sur la fiche de Steve, ça remplacerait sa clé.
  Vérification sans l'afficher : `GET https://ecotrakindustrie.progressionlive.com/server/rest/auth/profile`
  avec `Authorization: Bearer <clé>` → 200. L'ancien fichier `Cle Progression Live.txt`
  n'existe plus : ne pas le recréer, le coffre Windows le remplace.
- **Cédule « indisponible »** : diagnostiquer avant d'agir. Faire ouvrir à Jacquot
  *Exécutions* (icône liste de la barre de gauche) : `getCedule : Error: ProgressionLive HTTP 401`
  = clé régénérée ou révoquée → réinstallation ci-dessus ; `cle ProgressionLive absente` =
  propriété vide ; autre code HTTP = ProgressionLive en panne, attendre. Une erreur n'est
  **pas** mise en cache : dès la bonne clé installée, la page se rétablit au prochain
  chargement. Pour vérifier en ligne sans session, seul `authentication required` est
  observable : la preuve finale est la page ouverte par Jacquot, plus
  `banc_cedule.js reel` avec la clé du coffre.
- Toute personne ayant accès à l'éditeur peut lire les Script Properties : l'accès au compte
  `etrak.portail@gmail.com` doit rester restreint.

## Pièges d'édition

- `Code.gs` et la plupart des `.js`/`.html` sont en **CRLF** : éditer en normalisant
  (`replace('\r\n','\n')` … puis revenir), contrôler « LF seuls : 0 ».
- Dans un heredoc bash, les antislashs n'arrivent pas intacts (`'\n'` devient une vraie fin
  de ligne dans le code produit) : écrire les scripts avec l'outil Write.
- Apps Script : les `var` de haut niveau sont évaluées au chargement, toutes fichiers
  confondus ; `USERS_KEY`, `OWNER_EMAIL`, `PRICES_PREFIX`, `CEDULE_*` sont des constantes globales.
