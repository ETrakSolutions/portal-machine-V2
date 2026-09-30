# -*- coding: utf-8 -*-
"""Test du bloc Balance restructure.

Regles metier (Jacquot, 2026-08-05 ; Steve, 2026-09-30) :
  - LOADER et RETROCAVEUSE (Loader seul du 2026-08-05 au 2026-09-25 ; avant : Telehandler aussi) ;
  - balance ST-7 : UNE seule balance, « Balance loader » 1200-0010. La balance en valise
    1200-0011 est retiree du portail (Steve, 2026-09-30) : ni case, ni code, ni libelle ;
  - imprimante au choix exclusif : 1200-0014 thermique ou 1200-0015 carbone ;
  - on peut prendre une balance ET une imprimante.
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
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import PRIX, installer_prix, SESSION_TEST_JS   # prix : serveur simule

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1100']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
installer_prix(dv)
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
    print('--- 1) tarif ---')
    check('1200-0010 installation inchangee a 1320 (%s)' % PRIX['1200-0010'].get('install'),
          PRIX['1200-0010'].get('install') == 1320)

    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION_TEST_JS)

    print('--- 2) perimetre : Loader et Retrocaveuse ---')
    for typ in ('Loader', 'Retrocaveuse'):
        aller(typ)
        check('bloc Balance visible sur %s' % typ, visible('toggle-balance'))
    for typ in ('Telehandler', 'Excavatrice'):
        aller(typ)
        check('bloc Balance masque sur %s' % typ, not visible('toggle-balance'))

    print('--- 3) une seule balance ST-7, cumul avec une imprimante ---')
    aller('Loader')
    check('plus de choix « Balance en valise »', not dv.execute_script("return !!document.getElementById('bal-valise');"))
    lib = dv.execute_script("return document.getElementById('bal-loader').closest('label').textContent.trim();")
    check('libelle « Balance loader », sans parentheses (%r)' % lib, lib == 'Balance loader')
    dv.execute_script("document.getElementById('bal-loader').click();")
    time.sleep(0.4)
    dv.execute_script("document.getElementById('bal-imp-therm').click();")
    time.sleep(0.4)
    dv.execute_script("document.getElementById('bal-imp-carb').click();")
    time.sleep(0.4)
    check('choisir la carbone decoche la thermique',
          not dv.find_element(By.ID, 'bal-imp-therm').is_selected()
          and dv.find_element(By.ID, 'bal-imp-carb').is_selected())
    check('la balance reste cochee malgre le choix d imprimante',
          dv.find_element(By.ID, 'bal-loader').is_selected())
    time.sleep(1.0)
    corps = dv.find_element(By.TAG_NAME, 'body').text
    check('1200-0010 au recapitulatif', '1200-0010' in corps)
    check('1200-0015 au recapitulatif', '1200-0015' in corps)
    check('1200-0014 absent (non choisi)', '1200-0014' not in corps)
    check('1200-0011 nulle part dans la page', '1200-0011' not in dv.page_source)
    kit = dv.execute_script("var p=photoMachine(); return texteMachine(p) + '\\n' + texteEpicor(p.epicor);")
    check('courriel et bloc Epicor : 1200-0010 « Balance loader », pas de 1200-0011',
          '1200-0010  Balance loader\n' in kit and '1200-0010\t' in kit and '1200-0011' not in kit)

    print('--- 4) anglais : « Loader scale » ---')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    aller('Loader')
    lib_en = dv.execute_script("return document.getElementById('bal-loader').closest('label').textContent.trim();")
    check('libelle anglais « Loader scale » (%r)' % lib_en, lib_en == 'Loader scale')

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
