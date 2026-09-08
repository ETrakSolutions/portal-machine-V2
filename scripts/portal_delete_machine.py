#!/usr/bin/env python3
"""Supprime UNE entree machine de la BD du portail, via le backend Apps Script.

Outil a portee unique, cree pour le menage de doublons (ex. « TB 125 » a cote de
« TB125 »). Il n'existe que pour pouvoir etre autorise nommement dans les reglages
de permission, sans ouvrir l'execution de n'importe quel script Python.

Garde-fous integres, parce qu'une regle de permission retire le filet du prompt :
  - refuse de supprimer une entree qui porte des specs remplies, un `_kit` ou un
    `_bom` -- sauf `--force`, qui exige en plus de retaper le nom du modele ;
  - lit l'etat EN LIGNE (pas le machines.json local, qui se perime) ;
  - affiche l'entree visee et demande confirmation, sauf `--oui`.

Exemples
--------
  py -3.13 scripts/portal_delete_machine.py --type Excavatrice --fab Takeuchi \\
      --annee 2026 --modele "TB 125"

  py -3.13 scripts/portal_delete_machine.py --type Excavatrice --fab Takeuchi \\
      --annee 2026 --modele "TB 125" --oui
"""
import argparse
import json
import os
import random
import sys
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec"
LIVE = "https://etraksolutions.github.io/portal-machine-V2/data/machines.json"


def pin():
    chemin = os.path.join(RACINE, "PIN Portail.txt")
    with open(chemin, encoding="utf-8-sig") as f:
        lignes = [l.strip() for l in f.read().splitlines()]
    for l in reversed(lignes):
        if l:
            return l
    raise SystemExit("PIN introuvable dans " + chemin)


def bd_en_ligne():
    url = LIVE + "?cb=%d" % random.randint(1, 10 ** 9)
    with urllib.request.urlopen(url, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def est_vide(entree):
    """Vrai si l'entree ne contient aucune donnee qu'on regretterait de perdre."""
    for cle, val in entree.items():
        if cle in ("Image", "Flag"):
            continue
        if cle.startswith("_"):
            if val not in (None, "", {}, []):
                return False
            continue
        if str(val).strip() not in ("", "A completer", "N/D"):
            return False
    return True


def main():
    p = argparse.ArgumentParser(description="Supprime une entree machine du portail.")
    p.add_argument("--type", required=True, dest="type_")
    p.add_argument("--fab", required=True)
    p.add_argument("--annee", required=True)
    p.add_argument("--modele", required=True)
    p.add_argument("--oui", action="store_true", help="ne pas demander confirmation")
    p.add_argument("--force", action="store_true", help="autoriser la suppression d'une entree NON vide")
    a = p.parse_args()

    print("Lecture de la BD en ligne...", flush=True)
    bd = bd_en_ligne()
    entree = bd.get(a.type_, {}).get(a.fab, {}).get(a.annee, {}).get(a.modele)
    if entree is None:
        print("Rien a faire : %s / %s / %s / %r est absent de la BD." % (a.type_, a.fab, a.annee, a.modele))
        return 0

    print("\nEntree visee : %s / %s / %s / %r" % (a.type_, a.fab, a.annee, a.modele))
    print(json.dumps(entree, ensure_ascii=False, indent=1)[:1500])

    if not est_vide(entree):
        if not a.force:
            print("\nREFUS : cette entree contient des donnees (specs, _kit ou _bom).")
            print("Relancer avec --force si la suppression est vraiment voulue.")
            return 2
        saisi = input("\n--force : retaper le nom du modele pour confirmer > ").strip()
        if saisi != a.modele:
            print("Nom different, on n'y touche pas.")
            return 2

    if not a.oui:
        if input("\nSupprimer definitivement ? (oui/non) > ").strip().lower() not in ("oui", "o"):
            print("Annule.")
            return 1

    corps = json.dumps({"action": "deletemachine", "type": a.type_, "fab": a.fab,
                        "annee": a.annee, "modele": a.modele, "pin": pin()}).encode("utf-8")
    req = urllib.request.Request(API, data=corps, headers={"Content-Type": "text/plain"})
    rep = urllib.request.urlopen(req, timeout=300).read().decode()
    print("\nBackend :", rep[:300])
    try:
        if not json.loads(rep).get("ok"):
            return 3
    except ValueError:
        return 3
    print("Supprime. Verifier avec : git fetch && git log --oneline -1 origin/main")
    return 0


if __name__ == "__main__":
    sys.exit(main())
