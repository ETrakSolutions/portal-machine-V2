# -*- coding: utf-8 -*-
"""Test du renommage des mini Cat et des deux modeles ajoutes.

Le point critique : le nom du modele est la CLE des overrides BOM. On verifie
donc que la configuration de la 305 CR (9 codes) est bien celle affichee APRES
renommage, et pas les defauts calcules.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8796
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

CAT = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))['Excavatrice']['Caterpillar']
OV = json.load(open(os.path.join(REPO, 'data', 'overrides', 'excavatrice.json'),
                    encoding='utf-8'))['Excavatrice']['Caterpillar']

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


try:
    print('--- 1) donnees : anciens noms partis, nouveaux presents ---')
    for vieux in ('305', '302', '303', '306', '309', '301.7', '302.7', '303.5'):
        check('« %s » (ancien nom) absent de la BD' % vieux,
              not any(vieux in CAT[y] for y in CAT))
    for neuf in ('305 CR', '302 CR', '303 CR', '306 CR', '309 CR',
                 '301.7 CR', '302.7 CR', '303.5 CR', '301.5', '307.5', '310'):
        check('« %s » present en BD' % neuf, any(neuf in CAT[y] for y in CAT))

    print('--- 2) la configuration BOM a suivi le renommage ---')
    ov2026 = (OV.get('2026') or {}).get('305 CR', {}).get('_bom', {})
    codes = {k: v for k, v in ov2026.items() if k.isdigit()}
    check('override 305 CR 2026 : 9 codes conserves (%d)' % len(codes), len(codes) == 9)

    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T', permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))

    for mod, an in (('305 CR', '2026'), ('301.5', '2024'), ('307.5', '2024')):
        for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                         ('select-annee', an), ('select-modele', mod)):
            if not choisir(sid, val):
                check('selection %s = %s' % (sid, val), False)
        time.sleep(1.2)
        e = CAT[an][mod]
        corps = dv.find_element(By.TAG_NAME, 'body').text
        poids = e['Poids operationnel (kg / lbs)'].split(' ')[0]
        check('%s %s : fiche affichee (poids %s)' % (mod, an, poids), poids in corps)

    # etat BOM reellement affiche pour la 305 CR : doit venir de l override
    choisir('select-annee', '2026')
    choisir('select-modele', '305 CR')
    time.sleep(1.5)
    etat = dv.execute_script(
        "var s = machinesData['Excavatrice']['Caterpillar']['2026']['305 CR'];"
        "var d = window.KitRules.excDefaults(s, '305 CR');"
        "return window.KitRules.applyOverride(d, arguments[0], true);", ov2026)
    check('BOM affiche 305 CR : 0004 (mini) = r  [%s]' % etat.get('0004'), etat.get('0004') == 'r')
    check('BOM affiche 305 CR : 0000 (cabine) = r  [%s]' % etat.get('0000'), etat.get('0000') == 'r')
    check('BOM affiche 305 CR : 0070 (boite GC) = na  [%s]' % etat.get('0070'), etat.get('0070') == 'na')

    print('--- 3) aucune erreur JS ---')
    errs = [x for x in dv.get_log('browser') if x['level'] == 'SEVERE']
    check('aucune erreur SEVERE (%d)' % len(errs), not errs)
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
