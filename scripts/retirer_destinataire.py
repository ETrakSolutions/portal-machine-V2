# -*- coding: utf-8 -*-
"""Retire une adresse de la liste des destinataires des soumissions (cle serveur).

Trouve le 2026-09-03 : `target_emails` cote serveur valait
["robin@gryb.ca","jacquot@gryb.ca","k.berube@e-trak.ca"] alors que Robin a quitte
e-Trak. Chaque demande de soumission — prix compris — partait donc a l'adresse d'un
ancien employe.

Le NIP est lu dans `PIN Portail.txt` (ignore par git) et n'est JAMAIS affiche.
Relit la valeur apres ecriture pour prouver le resultat.

    py -3.13 scripts/retirer_destinataire.py robin            # essai (n ecrit rien)
    py -3.13 scripts/retirer_destinataire.py robin --ecrire
"""
import sys
import io
import re
import json
import pathlib
import urllib.request
import urllib.parse
import argparse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
REPO = pathlib.Path(__file__).resolve().parent.parent

ap = argparse.ArgumentParser()
ap.add_argument('motif', help='fragment de l adresse a retirer (ex. robin)')
ap.add_argument('--cle', default='target_emails')
ap.add_argument('--ecrire', action='store_true', help='sans ce drapeau, rien n est envoye')
args = ap.parse_args()

API = re.search(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec",
                (REPO / 'js' / 'config.js').read_text(encoding='utf-8')).group(0)


def nip():
    """Le NIP, depuis le fichier local. Jamais affiche, jamais journalise.

    Le fichier melange des phrases explicatives et la valeur. On ne retient donc
    QUE les lignes alphanumeriques sans espace — une premiere version prenait la
    ligne 1, qui est une phrase de dix mots, et le backend repondait « invalid PIN ».
    """
    p = REPO / 'PIN Portail.txt'
    if not p.exists():
        sys.exit('PIN Portail.txt absent — impossible d ecrire cote serveur.')
    cands = [s for s in (l.strip() for l in
                         p.read_text(encoding='utf-8', errors='replace').splitlines())
             if s and not s.startswith('#') and re.fullmatch(r'[A-Za-z0-9_.\-]{6,}', s)]
    if not cands:
        sys.exit('Aucune valeur de NIP exploitable dans PIN Portail.txt '
                 '(cherche : une ligne alphanumerique sans espace).')
    return cands[-1]      # la plus recente si le fichier en garde plusieurs


def lire(cle):
    u = API + '?action=get&key=' + urllib.parse.quote(cle)
    with urllib.request.urlopen(u, timeout=120) as r:
        return json.loads(r.read().decode()).get('value')


def ecrire(cle, valeur, pin):
    corps = json.dumps({'action': 'save', 'key': cle, 'value': valeur, 'pin': pin}).encode()
    req = urllib.request.Request(API, data=corps,
                                 headers={'Content-Type': 'text/plain'}, method='POST')
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())


brut = lire(args.cle)
if not brut:
    sys.exit('La cle %s est vide ou illisible.' % args.cle)
liste = json.loads(brut)
print('AVANT : %s' % liste)
neuve = [e for e in liste if args.motif.lower() not in e.lower()]
retires = [e for e in liste if e not in neuve]
if not retires:
    print('Aucune adresse ne correspond a « %s » — rien a faire.' % args.motif)
    sys.exit(0)
print('RETIRE : %s' % retires)
print('APRES : %s' % neuve)
if not neuve:
    sys.exit('REFUS : la liste deviendrait VIDE. Les soumissions ne partiraient plus '
             'a personne. Ajoute un destinataire avant de retirer celui-ci.')

if not args.ecrire:
    print('\nEssai — rien n a ete envoye. Relancer avec --ecrire.')
    sys.exit(0)

rep = ecrire(args.cle, json.dumps(neuve), nip())
print('\nreponse du backend : %s' % json.dumps(rep, ensure_ascii=False))
relu = json.loads(lire(args.cle))
print('RELU cote serveur : %s' % relu)
if relu == neuve:
    print('CONFIRME : la liste serveur est bien a jour.')
else:
    sys.exit('ECHEC : la valeur relue ne correspond pas a ce qui a ete envoye.')
