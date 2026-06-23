# -*- coding: utf-8 -*-
"""
=============================================================================
 DEPRECIE / DESACTIVE (decision 2026-06-23) — NE PAS UTILISER.
 La notification du demandeur se fait UNIQUEMENT via le bouton
 « 📧 Prévenir le demandeur » de edit-machine.html (mailto -> Outlook de
 l'admin), fiable et instantane. Ce script envoie via le Gmail de l'Apps
 Script, retarde et marque « expediteur externe » par le M365 de gryb.ca
 (et ferait doublon). Conserve pour reference seulement.
=============================================================================

Notifie par courriel le DEMANDEUR d'une machine que sa fiche est remplie et
disponible dans le Portail Machine.

Reutilise l'endpoint backend existant `sendsoumission` (aucun redeploiement).
Le demandeur (requesterEmail) est retrouve dans la cle KV `machine_requests`.

Usage (depuis la racine du depot) :
  python scripts/notify_machine_ready.py "<Type>" "<Fabricant>" "<Modele>" "<Annee>" [emailOverride]
Ex.:
  python scripts/notify_machine_ready.py "Telehandler" "Genie (Terex)" "GTH-1544" "2026"
"""
import sys, json, os, urllib.request

API = "https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec"
LINK = "https://etraksolutions.github.io/portal-machine-V2/machine.html"

def pin():
    # PIN Portail.txt : ligne 4 = le PIN (gitignore, jamais commite)
    for base in (".", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))):
        p = os.path.join(base, "PIN Portail.txt")
        if os.path.exists(p):
            return open(p, encoding="utf-8").read().splitlines()[3].strip()
    raise SystemExit("PIN Portail.txt introuvable")

def kv_get(key):
    raw = urllib.request.urlopen(API + "?action=get&key=" + key, timeout=60).read().decode()
    try: return json.loads(json.loads(raw).get("value") or "[]")
    except Exception: return []

def find_requester(type_, fab, modele):
    for r in kv_get("machine_requests"):
        if (r.get("type") == type_ and r.get("fab") == fab and r.get("modele") == modele
                and r.get("requesterEmail")):
            return r["requesterEmail"]
    return None

def main():
    if "--force" not in sys.argv:
        raise SystemExit(
            "DESACTIVE : notifier le demandeur via le bouton « Prevenir le demandeur » de "
            "edit-machine.html (mailto). Ce script backend est deprecie. "
            "(--force pour outrepasser, deconseille.)")
    sys.argv = [a for a in sys.argv if a != "--force"]
    if len(sys.argv) < 5:
        raise SystemExit("usage: notify_machine_ready.py <Type> <Fab> <Modele> <Annee> [email]")
    type_, fab, modele, annee = sys.argv[1:5]
    to = sys.argv[5] if len(sys.argv) > 5 else find_requester(type_, fab, modele)
    if not to:
        print("Aucun demandeur (requesterEmail) pour %s %s — aucun courriel envoye." % (fab, modele))
        return
    subject = "Machine ajoutee au Portail e-Trak : %s %s (%s)" % (fab, modele, annee)
    html = ("<p>Bonjour,</p>"
            "<p>La machine que vous avez demandee a ete ajoutee au Portail Machine et sa fiche est "
            "maintenant disponible :</p>"
            "<p style='font-size:1.05rem'><b>%s %s (%s)</b> &mdash; %s</p>"
            "<p>Vous pouvez la consulter ici : <a href='%s'>%s</a></p>"
            "<p>Bonne journee,<br>Portail e-Trak</p>") % (fab, modele, annee, type_, LINK, LINK)
    text = "La machine %s %s (%s) a ete ajoutee au Portail Machine. Consultez-la : %s" % (fab, modele, annee, LINK)
    body = json.dumps({"action": "sendsoumission", "to": to, "subject": subject,
                       "html": html, "text": text, "pin": pin()}).encode("utf-8")
    resp = urllib.request.urlopen(urllib.request.Request(API, data=body,
                                  headers={"Content-Type": "text/plain"}), timeout=60).read().decode()
    print("Courriel -> %s : %s" % (to, resp))

if __name__ == "__main__":
    main()
