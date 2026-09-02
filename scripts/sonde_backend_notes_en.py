# -*- coding: utf-8 -*-
"""Sonde : le Web App deploye persiste-t-il _notes_en / _warning_en ?

A lancer apres CHAQUE redeploiement du Web App Apps Script : sauvegarder le code
dans l'editeur ne publie rien, et un backend non redeploye jette les champs qu'il
ne connait pas EN SILENCE — l'UI affiche « sauvegarde », le serveur repond ok, et
la donnee n'existe pas.

Ecrit une note FR + EN sur une machine bidon (ZZ_TEST_CLAUDE / PROBE / 2099),
relit le commit que le backend vient de creer, puis EFFACE la sonde en renvoyant
des champs vides (le backend supprime l'entree devenue vide).

⚠️ PIEGE PAYE LE 2026-09-02 : la premiere version lisait
raw.githubusercontent.com, qui sert du CACHE meme avec un parametre anti-cache.
Elle a donc annonce « le redeploiement manque » alors que le backend ecrivait
correctement les deux champs. On lit desormais le commit par l'API GitHub, en le
nommant par son SHA — la reponse du backend nous le donne, aucune ambiguite
possible sur la version lue.

Rien de reel n'est touche. Usage : python scripts/sonde_backend_notes_en.py
"""
import io
import json
import os
import base64
import subprocess
import sys
import time
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

REPO = r"C:\Users\jcaron\CLAUDE_CODE\portal-machine-v2"
API = ('https://script.google.com/macros/s/'
       'AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec')

CIBLE = dict(type='Excavatrice', fab='ZZ_TEST_CLAUDE', modele='PROBE', annee='2099')
NOTE_FR = 'SONDE CLAUDE - note francaise'
NOTE_EN = 'CLAUDE PROBE - english note'
WARN_EN = 'CLAUDE PROBE - english warning'

with io.open(os.path.join(REPO, 'PIN Portail.txt'), encoding='utf-8-sig') as f:
    pin = [l.strip() for l in f if l.strip()][-1]


def appel(payload):
    corps = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(API, data=corps, headers={'Content-Type': 'text/plain'})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode('utf-8'))


def lire_commit(sha):
    """Contenu du fichier AU commit donne, via l'API GitHub (jamais le CDN)."""
    out = subprocess.check_output(
        ['gh', 'api', 'repos/ETrakSolutions/portal-machine-V2/contents/'
         'data/overrides/excavatrice.json?ref=' + sha, '--jq', '.content'],
        shell=True)
    return json.loads(base64.b64decode(out).decode('utf-8'))


def entree(d):
    try:
        return d[CIBLE['type']][CIBLE['fab']][CIBLE['annee']][CIBLE['modele']]
    except Exception:
        return None


print('1) ecriture de la sonde (note FR + EN + avertissement EN)...')
r = appel(dict(action='updateMachineNotes', pin=pin,
               notes=NOTE_FR, warning='', notes_en=NOTE_EN, warning_en=WARN_EN, **CIBLE))
print('   reponse backend :', json.dumps(r, ensure_ascii=False)[:200])
if not r.get('ok'):
    print('\nECHEC : le backend a refuse l ecriture.')
    sys.exit(2)

print('2) relecture du commit %s par l API GitHub...' % r['commit'][:8])
e = entree(lire_commit(r['commit']))
print('   entree lue :', json.dumps(e, ensure_ascii=False) if e else '(absente)')

ok_fr = bool(e) and e.get('_notes') == NOTE_FR
ok_en = bool(e) and e.get('_notes_en') == NOTE_EN
ok_wen = bool(e) and e.get('_warning_en') == WARN_EN
print()
print('   _notes      ecrit : %s' % ('OUI' if ok_fr else 'NON'))
print('   _notes_en   ecrit : %s' % ('OUI' if ok_en else 'NON  <-- le redeploiement manque'))
print('   _warning_en ecrit : %s' % ('OUI' if ok_wen else 'NON  <-- le redeploiement manque'))

print('\n3) menage : on vide la sonde (le backend retire l entree devenue vide)...')
r2 = appel(dict(action='updateMachineNotes', pin=pin,
                notes='', warning='', notes_en='', warning_en='', **CIBLE))
print('   reponse backend :', json.dumps(r2, ensure_ascii=False)[:160])
reste = entree(lire_commit(r2['commit']))
print('   sonde effacee.' if not reste
      else '   ATTENTION : la sonde est encore presente : %s' % json.dumps(reste, ensure_ascii=False))
# Le backend ne nettoie que le niveau MODELE : la coquille vide du fabricant et de
# l'annee (ZZ_TEST_CLAUDE / 2099 / {}) reste dans le fichier et se retire a la main.

sys.exit(0 if (ok_en and ok_wen) else 1)
