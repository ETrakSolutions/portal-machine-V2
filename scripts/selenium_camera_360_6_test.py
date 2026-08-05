# -*- coding: utf-8 -*-
"""Test de l'option « Camera 360 (set de 6) » ajoutee en soumission.

Verifie :
  1. la sous-option apparait dans le bloc Camera ;
  2. elle apparait sur TOUS les types de machines (le bloc est global) ;
  3. la selection est exclusive (cocher le set de 6 decoche le 360 a 4) ;
  4. le recapitulatif porte bien le code 1300-0005 ;
  5. le libelle est traduit en anglais ;
  6. aucune erreur JS.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8795
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


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(select_id, valeur, delai=25):
    """Selection par JS : evite les references perimees quand le menu se repeuple."""
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, select_id, valeur):
            return True
        time.sleep(0.3)
    return False


def premier_modele(typ):
    """(fab, annee, modele) du premier modele disponible pour un type."""
    for fab in MJ[typ]:
        if fab.startswith('_'):
            continue
        for y in sorted(MJ[typ][fab]):
            for m in MJ[typ][fab][y]:
                return fab, y, m
    return None


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T',"
                      " permissions:{modifBom:true, voirPrix:true}}));")

    print('--- 1) presence et prix du code ---')
    check('1300-0005 tarife dans prices.json (%s / %s)'
          % (PRIX.get('1300-0005', {}).get('item'), PRIX.get('1300-0005', {}).get('install')),
          '1300-0005' in PRIX)

    print('--- 2) l option apparait sur chaque type de machine ---')
    types = [t for t in MJ if not t.startswith('_')]
    for typ in types:
        cible = premier_modele(typ)
        if not cible:
            continue
        fab, an, mod = cible
        dv.get(BASE + '/soumission.html')
        WebDriverWait(dv, 40).until(lambda d: d.execute_script(
            "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
        for sid, val in (('select-type', typ), ('select-fabricant', fab),
                         ('select-modele', mod), ('select-annee', an)):
            if not choisir(sid, val):
                print('     (impossible de choisir %s = %r sur %s)' % (sid, val, typ))
        time.sleep(1.5)
        el = dv.find_elements(By.ID, 'cam-360-6')
        visible = bool(el) and dv.execute_script(
            "var e=document.getElementById('toggle-camera');"
            "return !!e && getComputedStyle(e).display !== 'none';")
        check('%-28s option 360 set de 6 presente et bloc camera visible' % typ, visible)

    print('--- 3) exclusivite et recapitulatif (Excavatrice) ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '320'), ('select-annee', '2024')):
        check('selection %s = %s' % (sid, val), choisir(sid, val))
    time.sleep(1.5)

    dv.execute_script("document.getElementById('cam-360').click();")
    time.sleep(0.4)
    check('360 (4 cameras) coche', dv.find_element(By.ID, 'cam-360').is_selected())
    dv.execute_script("document.getElementById('cam-360-6').click();")
    time.sleep(0.4)
    check('set de 6 coche', dv.find_element(By.ID, 'cam-360-6').is_selected())
    check('exclusivite : le 360 a 4 est decoche', not dv.find_element(By.ID, 'cam-360').is_selected())
    statut = dv.find_element(By.CSS_SELECTOR, '#toggle-camera .toggle-status').text
    check('statut du bloc = « 360 (6 cameras) » (%s)' % statut, '6' in statut)

    # code produit resultant, via la vraie fonction de l application
    codes = dv.execute_script(
        "var b=document.getElementById('toggle-camera');"
        "var r=b.querySelector('input[name=\"camera-type\"]:checked');"
        "return r ? ('Camera ' + r.value) : null;")
    check('cle interne = « Camera 360 (6 cameras) » (%s)' % codes, codes == 'Camera 360 (6 cameras)')
    mappe = dv.execute_script("return (typeof OPTION_CODES !== 'undefined') "
                              "? OPTION_CODES['Camera 360 (6 cameras)'] : null;")
    check('code produit associe = 1300-0005 (%s)' % mappe, mappe == '1300-0005')

    print('--- 4) libelle anglais ---')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    dv.get(BASE + '/soumission.html')
    time.sleep(3)
    txt = dv.execute_script("var e=document.querySelector('[data-i18n=\"soumission.cam_360_6\"]');"
                            "return e ? e.textContent.trim() : null;")
    check('libelle EN = « 360 (6-camera set) » (%s)' % txt, txt == '360 (6-camera set)')

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
