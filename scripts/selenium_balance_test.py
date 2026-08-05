# -*- coding: utf-8 -*-
"""Test du bloc Balance restructure.

Regles metier (Jacquot, 2026-08-05) :
  - LOADER seulement (avant : Telehandler, Loader, Retrocaveuse) ;
  - modele de balance au choix exclusif : 1200-0010 (installee e-Trak) ou
    1200-0011 (valise, installation client) ;
  - imprimante au choix exclusif : 1200-0014 thermique ou 1200-0015 carbone ;
  - on peut prendre une balance ET une imprimante ;
  - 1200-0011 ne porte plus de frais d installation.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

MJ = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))
PRIX = json.load(open(os.path.join(REPO, 'data', 'prices.json'), encoding='utf-8'))

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1100']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(l, c):
    print(('  [OK] ' if c else '  [X ] ') + l)
    if not c:
        fails.append(l)


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


def premier(typ):
    for f in MJ[typ]:
        if f.startswith('_'):
            continue
        for y in sorted(MJ[typ][f]):
            for m in MJ[typ][f][y]:
                return f, y, m
    return None


def aller(typ):
    f, y, m = premier(typ)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for sid, val in (('select-type', typ), ('select-fabricant', f),
                     ('select-modele', m), ('select-annee', y)):
        choisir(sid, val)
    time.sleep(1.5)
    return f, y, m


def visible(eid):
    return dv.execute_script("var e=document.getElementById(arguments[0]);"
                             "return !!e && getComputedStyle(e).display !== 'none';", eid)


try:
    print('--- 1) tarif corrige ---')
    check('1200-0011 installation = 0 (%s)' % PRIX['1200-0011'].get('install'),
          PRIX['1200-0011'].get('install') == 0)
    check('1200-0010 installation inchangee a 1320 (%s)' % PRIX['1200-0010'].get('install'),
          PRIX['1200-0010'].get('install') == 1320)

    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T',"
                      " permissions:{modifBom:true, voirPrix:true}}));")

    print('--- 2) perimetre : Loader seulement ---')
    aller('Loader')
    check('bloc Balance visible sur Loader', visible('toggle-balance'))
    for typ in ('Telehandler', 'Retrocaveuse', 'Excavatrice'):
        aller(typ)
        check('bloc Balance masque sur %s' % typ, not visible('toggle-balance'))

    print('--- 3) exclusivite par groupe, cumul entre groupes ---')
    aller('Loader')
    dv.execute_script("document.getElementById('bal-loader').click();")
    time.sleep(0.4)
    dv.execute_script("document.getElementById('bal-valise').click();")
    time.sleep(0.4)
    check('choisir la valise decoche la balance loader',
          not dv.find_element(By.ID, 'bal-loader').is_selected()
          and dv.find_element(By.ID, 'bal-valise').is_selected())
    dv.execute_script("document.getElementById('bal-imp-therm').click();")
    time.sleep(0.4)
    dv.execute_script("document.getElementById('bal-imp-carb').click();")
    time.sleep(0.4)
    check('choisir la carbone decoche la thermique',
          not dv.find_element(By.ID, 'bal-imp-therm').is_selected()
          and dv.find_element(By.ID, 'bal-imp-carb').is_selected())
    check('la balance reste cochee malgre le choix d imprimante',
          dv.find_element(By.ID, 'bal-valise').is_selected())
    time.sleep(1.0)
    corps = dv.find_element(By.TAG_NAME, 'body').text
    check('1200-0011 au recapitulatif', '1200-0011' in corps)
    check('1200-0015 au recapitulatif', '1200-0015' in corps)
    check('1200-0010 absent (non choisi)', '1200-0010' not in corps)
    check('1200-0014 absent (non choisi)', '1200-0014' not in corps)

    print('--- 4) l autre balance ---')
    dv.execute_script("document.getElementById('bal-loader').click();")
    time.sleep(1.2)
    corps = dv.find_element(By.TAG_NAME, 'body').text
    check('1200-0010 au recapitulatif', '1200-0010' in corps)
    check('1200-0011 disparu', '1200-0011' not in corps)

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
