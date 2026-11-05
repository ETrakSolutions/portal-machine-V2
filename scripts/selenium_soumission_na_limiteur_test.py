# -*- coding: utf-8 -*-
"""Soumission : codes du limiteur N/A et valves H01B-0006 des camions girafe Atlas (Steve, 2026-11-05).

- Un code du limiteur N/A sur la machine (override, sinon defaut du catalogue) n'est plus emis,
  pour TOUS les types (avant : Nacelle seulement). Ex. Atlas 440VCS-A21L sans cabine : plus de
  1500-0300 (avec cabine) en plus du 1500-0303 (sans cabine) du kit obligatoire.
- Camion girafe Atlas : 1 x H01B-0006 par limitation (Hauteur 1, Rotation 1, Hauteur + Rotation 2).
- Temoins : girafe avec cabine (0300 garde), grue Maeda MC104C (plus de 0800), nacelle inchangee.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import installer_prix, SESSION_TEST_JS  # noqa: E402

PORT = 8798
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

GIR = 'Camion Girafe (Boom Truck)'
MJ = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))
OVG = json.load(open(os.path.join(REPO, 'data', 'overrides', 'camion-girafe.json'), encoding='utf-8'))[GIR]
fails = []


def check(l, c):
    print(('  [OK] ' if c else '  [X ] ') + l)
    if not c:
        fails.append(l)


# Temoin : un camion girafe non Atlas dont la base avec cabine (0300) est active
temoin = None
for fab, ys in MJ[GIR].items():
    if fab.startswith('_') or fab == 'Atlas':
        continue
    for an, ms in sorted(ys.items()):
        for mod in ms:
            b = ((OVG.get(fab) or {}).get(an) or {}).get(mod, {}).get('_bom') or {}
            if b.get('0300', 'r') != 'na' and b.get('0303') != 'r':
                temoin = (fab, an, mod); break
        if temoin: break
    if temoin: break

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1100']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
installer_prix(dv)

CH = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
      "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
      "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
      "return false;")


def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CH, sid, val):
            return True
        time.sleep(0.3)
    return False


def aller(typ, fab, an, mod, lim):
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0"
        " && Object.keys(priceData||{}).length > 0;"))
    for sid, val in (('select-type', typ), ('select-fabricant', fab),
                     ('select-modele', mod), ('select-annee', an)):
        if not choisir(sid, val):
            check('choix %s = %s' % (sid, val), False)
    time.sleep(1.5)
    dv.execute_script("document.getElementById(arguments[0]).click();", lim)
    time.sleep(1.2)
    return dv.execute_script("return document.getElementById('selected-options-list').innerText;")


def epicor():
    return dv.execute_script("return texteEpicor(buildEpicorRows());")


try:
    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION_TEST_JS)
    dv.execute_script("localStorage.setItem('portal_lang','fr');")

    for lim, nb in (('lim-hauteur', 1), ('lim-rotation', 1), ('lim-hr', 2)):
        print('--- Atlas 440VCS-A21L 2015, %s ---' % lim)
        t = aller(GIR, 'Atlas', '2015', '440VCS-A21L', lim)
        check('pas de 1500-0300 (avec cabine, N/A)', '1500-0300' not in t)
        check('1500-0303 sans cabine present', '1500-0303' in t)
        ep = epicor()
        check('Epicor : H01B-0006 x%d (%s)' % (nb, [l for l in ep.split('\n') if 'H01B' in l]),
              'H01B-0006\t%d' % nb in ep)
        check('Epicor : pas de 1500-0300', '1500-0300' not in ep)
        mail = dv.execute_script("return texteMachine(photoMachine(), false);")
        check('courriel : H01B-0006, sans 1500-0300', 'H01B-0006' in mail and '1500-0300' not in mail)

    print('--- Atlas 240.2e 2015, Hauteur ---')
    t = aller(GIR, 'Atlas', '2015', '240.2e', 'lim-hauteur')
    check('pas de 1500-0300', '1500-0300' not in t)
    check('H01B-0006 present', 'H01B-0006' in t)

    if temoin:
        print('--- temoin girafe avec cabine : %s %s %s ---' % temoin)
        t = aller(GIR, temoin[0], temoin[1], temoin[2], 'lim-hauteur')
        check('1500-0300 garde', '1500-0300' in t)
        check('pas de H01B-0006 (pas Atlas)', 'H01B-0006' not in t)
    else:
        check('temoin girafe avec cabine trouve', False)

    print('--- grue Maeda MC104C 2015, Hauteur ---')
    t = aller('Grue Mobile', 'Maeda', '2015', 'MC104C', 'lim-hauteur')
    check('pas de 1500-0800 (avec cabine, N/A)', '1500-0800' not in t)
    check('1500-0803 sans cabine present', '1500-0803' in t)
    check('pas de H01B-0006', 'H01B-0006' not in t)

    print('--- nacelle Haulotte Star 26 J 2020 (regle d\'avant inchangee) ---')
    t = aller('Nacelle', 'Haulotte', '2020', 'Star 26 J', 'lim-hr')
    check('1500-0901 absent', '1500-0901' not in t)
    check('1500-0915 present', '1500-0915' in t)

    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:4]:
        print('     ', e['message'][:200])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
