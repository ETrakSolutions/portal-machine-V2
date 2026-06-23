---
name: portal-fill-specs
description: "Rechercher et remplir les specifications techniques d'une machine du Portal Machine (V2), depuis la source officielle du constructeur, avec croisement et validation, ET la creer pour TOUTES les annees ou elle a ete disponible. Triggers : remplis les specs, complete cette machine, cree la machine [marque] [modele], genere la machine demandee, traite la demande de machine, fill machine specs, fill technical info, ajoute la machine pour toutes les annees. A utiliser quand on cree/complete une machine (notamment depuis une demande / le bouton Nouvelle machine)."
---

# Portal Machine — Rechercher & remplir les specs d'une machine

Quand on crée ou complète une machine (souvent depuis une **demande** captée par le portail),
Claude **recherche les specs sur la source officielle du constructeur**, les **croise**,
**remplit** la machine **pour toutes les années où elle a été disponible**, et **signale les
valeurs incertaines**. Validation finale = humaine. NE JAMAIS écrire des specs non vérifiées
à l'aveugle.

## Emplacement du dépôt
Clone local de `ETrakSolutions/portal-machine-V2` :
- Poste installé (Steve / Jacquot) : `%USERPROFILE%\CLAUDE_CODE\portal-machine-v2`
- Poste Robin : `C:\Users\ryb086\OneDrive - Groupe R.Y. Beaudoin\Bureau\CLAUDE_CODE\portal-machine-v2`

⚠️ Tout passe par la **V2** (la V1 `portal-machine` est gelée).

## Modèle de données
`data/machines.json` : `data[type][fabricant][annee][modele] = { specs... }`.
Les **champs techniques dépendent du TYPE**. Pour les bons champs : copier les clés d'une machine
existante du même type (ignorer `Image`, `Flag`, et les clés commençant par `_`).
Ex. Telehandler : `Capacite max`, `Hauteur levee max`, `Portee avant max`, `Puissance moteur`,
`Poids operationnel`, `Base rotative`, `Pattes stabilisatrices`.

## Backend (aucun déploiement nécessaire)
- `updatemachinespecs` (POST JSON) : **crée** l'entrée si absente (auto-vivifie
  type/fab/année/modèle) et écrit les `specs`. Une entrée = **une année** → 1 appel par année.
- PIN : dans `PIN Portail.txt` (gitignoré, jamais en clair). URL API : `API_URL` dans `js/app.js`.
- Demandes : clé KV `machine_requests` (`?action=get` / `action:'save'`).

## TOUTES les années disponibles (important)
Une machine est stockée **par année**. Il faut la créer pour **chaque année où le modèle a
été disponible**, pas seulement l'année demandée.
1. Déterminer la **plage d'années de disponibilité** du modèle (recherche : fiche/communiqués
   constructeur, lectura-specs « années », date de lancement → aujourd'hui). En cas de doute,
   s'aligner sur la plage utilisée par les autres modèles du même fabricant dans la BD
   (ex. beaucoup de Telehandler vont de 2015 à l'année courante).
2. Écrire l'entrée (mêmes specs) pour **chaque année** de la plage via `updatemachinespecs`
   (1 appel/année). Si une spec a changé selon l'année (rare), adapter ; sinon répliquer.
3. Inclure l'année demandée même si elle borde la plage ; **signaler** si l'année demandée
   semble hors période de production (ex. modèle lancé en 2019 mais demande pour 2016).

```python
# Ecrire la meme machine sur plusieurs annees (depuis la racine du depot)
import os, json, time, urllib.request
PIN = open("PIN Portail.txt", encoding="utf-8").read().splitlines()[3].strip()
API = "<API_URL depuis js/app.js>"
specs = {"Capacite max":"15 000 lb", "Puissance moteur":"134 hp", ...}
TYPE, FAB, MODELE = "Telehandler", "Genie (Terex)", "GTH1544"
for annee in [str(y) for y in range(2019, 2027)]:        # toutes les annees dispo
    body = json.dumps({"action":"updatemachinespecs","type":TYPE,"fab":FAB,
                       "annee":annee,"modele":MODELE,"specs":specs,"pin":PIN}).encode()
    print(annee, urllib.request.urlopen(urllib.request.Request(API,data=body,
          headers={"Content-Type":"text/plain"}),timeout=180).read().decode()[:30])
    time.sleep(1)
```

## Méthode de recherche FIABLE (règle anti-RitchieSpecs)
1. **Source officielle du constructeur d'abord** (fiche PDF / page produit). Référence absolue.
   - Astuce : si WebFetch ne lit pas le PDF (binaire), il est sauvé localement → l'ouvrir avec
     l'outil **Read** (il rend les PDF).
2. **Croiser** avec une 2e source. En cas d'écart, garder la valeur OFFICIELLE et **signaler**.
   - ⚠️ Les sites tiers se trompent : ex. GTH-1544 → un site donnait 154 hp alors que la fiche
     Genie officielle dit **134 hp**.
3. Valeur invérifiable → laisser `A completer` et la **lister pour validation humaine**.

## Format des valeurs (matcher la BD)
Reproduire le style des entrées existantes du même type : `"15 000 lb"`, `"44 ft"`,
`"27 ft 3 in"`, `"134 hp"`, `"33 686 lb"`, `"Non"`/`"Oui"`. Inconnu = `A completer`.

## Workflow complet
1. Identifier type / fabricant / modèle (depuis la demande).
2. Récupérer les **champs du type** (clés d'une machine existante du type).
3. Déterminer **toutes les années de disponibilité** (voir section ci-dessus).
4. Rechercher les specs sur la **source officielle**, croiser, mapper aux champs + format BD.
5. **Présenter** les valeurs + sources + incertitudes, puis écrire via `updatemachinespecs`
   pour **chaque année**.
6. Si la machine venait d'une demande : passer la demande à `done` dans `machine_requests`.
7bis. **Notifier le demandeur par courriel** une fois les specs remplies (machine dans la BD) :
   l'admin clique **« 📧 Prévenir le demandeur »** dans `edit-machine.html` (en-tête, à côté de Signaler/Supprimer). Ça ouvre un `mailto:` **depuis son Outlook** vers `requesterEmail` (retrouvé dans `machine_requests`, match tolérant aux tirets/casse). C'est la méthode FIABLE — l'envoi backend Gmail (`notify_machine_ready.py`) est **bloqué par le M365 de gryb.ca** pour les destinataires internes (voir Pièges). Le bouton n'apparaît que si une demande correspond à la machine.
7. **Vérifier dans le fichier committé** (l'API `getmachinejson` peut être périmée) :
   `git show origin/main:data/machines.json | grep '"<MODELE>"'`.
8. Pousser au besoin (skill `portal-deploy`) — compte GitHub **Robin-Gagnon** (`robingag` = 403).
   Live mis à jour ~1 min après (latence CDN GitHub Pages).
9. Laisser l'humain vérifier/ajuster les specs + compléter le kit dans `edit-machine.html`.

## Notifier le demandeur (courriel)

Quand la fiche est remplie et la machine dans la BD, **on previent la personne qui a fait la demande**. **Methode fiable (defaut) :** dans `edit-machine.html`, l'admin clique **« 📧 Prévenir le demandeur »** -> un `mailto:` s'ouvre dans **son Outlook** (envoye depuis son compte e-Trak/gryb, donc livre normalement), pre-rempli vers `requesterEmail` avec « Machine ajoutee au Portail e-Trak — consultez la fiche : <lien> ». Le bouton n'apparait que si `machine_requests` contient une demande correspondant a la machine (match tolerant aux tirets/casse), pour les roles editeurs (super_admin/administrateur).

**Pourquoi pas le backend :** `scripts/notify_machine_ready.py` envoie via l'endpoint `sendsoumission` (MailApp), mais ce courriel part du **Gmail de l'Apps Script** et le **Microsoft 365 de gryb.ca le bloque/quarantaine** (expediteur gmail externe) — il n'arrive PAS aux destinataires @gryb.ca/@e-trak.ca. Le script reste un fallback eventuel pour des demandeurs **externes** (autres domaines, ou le gmail passe souvent), mais la voie sure est le bouton mailto.

## Pièges
- **Concurrence** : ne PAS écrire dans machines.json pendant qu'un humain édite la même machine
  (écritures simultanées = risque d'écrasement).
- machines.json est **minifié** (1 ligne) : édition locale → `separators=(',',':')`, jamais
  `indent=2`.
- Écriture machines.json **lente** (gros fichier) : timeouts généreux ; 1 appel/année.
