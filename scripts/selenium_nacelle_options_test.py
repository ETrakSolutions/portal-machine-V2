# -*- coding: utf-8 -*-
"""Test du bloc « Options nacelle » (0903 a 0907), cumulables.

Regle metier : 1500-0900 = kit de base obligatoire ; 0901/0902 = options
principales ; 0903 a 0907 = options secondaires qui s AJOUTENT et se cumulent.
"""
import sys, io, os, json, threading, http.server, socketserver, time, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8798
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

MJ = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))
NAC = MJ['Nacelle']


def sa(s):
    return ''.join(c for c in unicodedata.normalize('NFD', str(s or '').lower())
                   if unicodedata.category(c) != 'Mn')


def un_modele(cat):
    for f in NAC:
        if f.startswith('_'):
            continue
        for y in sorted(NAC[f]):
            for m, e in NAC[f][y].items():
                if cat in sa(e.get('Categorie')):
                    return f, y, m
    return None


ARTIC, TELE = un_modele('articul'), un_modele('telescop')

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


def aller(typ, fab, an, mod):
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for sid, val in (('select-type', typ), ('select-fabricant', fab),
                     ('select-modele', mod), ('select-annee', an)):
        choisir(sid, val)
    time.sleep(1.5)


def visible(eid):
    return dv.execute_script(
        "var e=document.getElementById(arguments[0]);"
        "return !!e && getComputedStyle(e).display !== 'none';", eid)


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T',"
                      " permissions:{modifBom:true, voirPrix:true}}));")

    print('--- 1) catalogue : 8 codes dont 0906/0907 ---')
    lab = NAC['_bom_labels']
    pns = sorted((v or {}).get('pn') for v in lab.values())
    check('catalogue Nacelle = 8 codes (%d)' % len(lab), len(lab) == 8)
    check('1500-0906 au catalogue', '1500-0906' in pns)
    check('1500-0907 au catalogue', '1500-0907' in pns)

    print('--- 2) nacelle ARTICULEE : %s ---' % (ARTIC,))
    aller('Nacelle', ARTIC[0], ARTIC[1], ARTIC[2])
    check('bloc « Options nacelle » visible', visible('toggle-nacelle-opts'))
    for code in ('0903', '0904', '0905', '0906', '0907'):
        check('  option %s proposee' % code, visible('sub-nac-' + code))

    # coche 3 options -> montants cumules
    for code in ('0904', '0905', '0907'):
        dv.execute_script("document.getElementById('nac-%s').click();" % code)
        time.sleep(0.3)
    time.sleep(1.0)
    statut = dv.find_element(By.CSS_SELECTOR, '#toggle-nacelle-opts .toggle-status').text
    check('statut du bloc = 3 OPTIONS (%s)' % statut, '3' in statut)
    dv.execute_script("document.getElementById('lim-hr').click();")
    time.sleep(1.2)
    corps = dv.find_element(By.TAG_NAME, 'body').text
    for code in ('1500-0900', '1500-0901', '1500-0902', '1500-0904', '1500-0905', '1500-0907'):
        check('  %s dans le recapitulatif' % code, code in corps)
    check('  1500-0903 ABSENT (non coche)', '1500-0903' not in corps)

    print('--- 3) nacelle TELESCOPIQUE : %s ---' % (TELE,))
    aller('Nacelle', TELE[0], TELE[1], TELE[2])
    check('bloc visible', visible('toggle-nacelle-opts'))
    check('« Nacelle articulee » MASQUEE sur une telescopique',
          not visible('sub-nac-0903'))
    for code in ('0904', '0905', '0906', '0907'):
        check('  option %s proposee' % code, visible('sub-nac-' + code))

    print('--- 4) autre type : le bloc ne doit pas apparaitre ---')
    aller('Excavatrice', 'Caterpillar', '2024', '305 CR')
    check('bloc masque sur une excavatrice', not visible('toggle-nacelle-opts'))

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
