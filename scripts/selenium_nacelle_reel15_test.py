# -*- coding: utf-8 -*-
"""Reel 15 m (1500-0915) des nacelles et regle « prix a valider » (Jacquot, 2026-10-08).

- 0915 au catalogue Nacelle, absent par defaut ; obligatoire et 0901 inactif sur
  Haulotte Star 26 J et Manitou VJR 26 (2015-2026) ;
- tant que son prix n'est pas fixe : « Prix a valider » sur la ligne, AUCUN total a
  l'ecran, au panier ni au courriel ;
- ailleurs (autre nacelle, excavatrice avec harnais sans prix) : total inchange.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import PRIX, installer_prix, SESSION_TEST_JS  # noqa: E402

PORT = 8799
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

MJ = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))
OV = json.load(open(os.path.join(REPO, 'data', 'overrides', 'nacelle.json'), encoding='utf-8'))
fails = []


def check(l, c):
    print(('  [OK] ' if c else '  [X ] ') + l)
    if not c:
        fails.append(l)


print('--- 0) donnees ---')
lab = MJ['Nacelle']['_bom_labels'].get('0915 Reel 15M') or {}
check('0915 au catalogue, PN 1500-0915, defaut na', lab.get('pn') == '1500-0915' and lab.get('def') == 'na')
check('1500-0915 sans prix dans la liste maitresse', '1500-0915' not in PRIX)
n = 0
for fab, mod in (('Haulotte', 'Star 26 J'), ('Manitou', 'VJR 26')):
    for an in range(2015, 2027):
        b = OV['Nacelle'][fab][str(an)][mod]['_bom']
        n += (b == {'0915': 'r', '0901': 'na'})
check('24 overrides 0915=r / 0901=na (%d)' % n, n == 24)

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


def aller(typ, fab, an, mod, lim='lim-hr'):
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0"
        " && Object.keys(priceData||{}).length > 0;"))
    for sid, val in (('select-type', typ), ('select-fabricant', fab),
                     ('select-modele', mod), ('select-annee', an)):
        check('  choix %s = %s' % (sid, val), choisir(sid, val))
    time.sleep(1.5)
    dv.execute_script("document.getElementById(arguments[0]).click();", lim)
    time.sleep(1.2)


def tableau():
    return dv.execute_script("return document.getElementById('selected-options-list').innerText;")


def ligne(code):
    return dv.execute_script(
        "var c=arguments[0], tr=[].slice.call(document.querySelectorAll('#selected-options-list tr'))"
        ".filter(function(r){return r.innerText.indexOf(c)>=0;})[0];"
        "return tr ? tr.innerText : '';", code)


try:
    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION_TEST_JS)
    dv.execute_script("localStorage.setItem('portal_lang','fr');")

    for fab, an, mod in (('Haulotte', '2020', 'Star 26 J'), ('Manitou', '2026', 'VJR 26'), ('Haulotte', '2015', 'Star 26 J')):
        print('--- 1) %s %s %s ---' % (fab, mod, an))
        aller('Nacelle', fab, an, mod)
        t = tableau()
        check('1500-0915 au tableau', '1500-0915' in t)
        check('ligne 0915 = « Prix à valider » (%s)' % ligne('1500-0915').replace('\n', ' | '),
              'Prix à valider' in ligne('1500-0915'))
        check('1500-0901 absent', '1500-0901' not in t)
        check('1500-0900 avec un prix', '$' in ligne('1500-0900'))
        check('aucune ligne TOTAL chiffree', 'TOTAL' not in t)
        check('message « Total non disponible »', 'Total non disponible' in t)
        kit = dv.execute_script("return getKitSummary('Nacelle', arguments[0], arguments[1], machinesData.Nacelle[arguments[0]][arguments[2]][arguments[1]]);", fab, mod, an)
        k15 = [k for k in kit if k['code'] == '1500-0915']
        check('getKitSummary : 0915 Obligatoire', bool(k15) and k15[0]['status'] == 'Obligatoire')
        mail = dv.execute_script("return texteMachine(photoMachine(), false);")
        check('courriel : PRIX À VALIDER 1500-0915', 'PRIX À VALIDER' in mail and '1500-0915' in mail)
        check('courriel : aucun total pieces', 'Total pièces' not in mail and 'pièces :' not in mail.lower())
        # panier : sous-total et total general remplaces
        res = dv.execute_script(
            "panier=[{unites:1, photo:photoMachine()}, {unites:1, photo:photoMachine()}]; rendrePanier();"
            "return [document.getElementById('panier-liste').innerText, (document.getElementById('panier-total')||{}).textContent||''];")
        check('panier : « Prix à valider » par machine', res[0].count('Prix à valider') == 2)
        check('panier : total general remplace (%s)' % res[1], 'Total non disponible' in res[1])
        dv.execute_script("panier=[]; rendrePanier();")

    print('--- 2) controle : autre nacelle, total inchange ---')
    aller('Nacelle', 'Genie', '2020', next(m for m in MJ['Nacelle']['Genie']['2020']))
    t = tableau()
    check('pas de 0915', '1500-0915' not in t)
    check('pas de « Prix à valider »', 'Prix à valider' not in t)
    check('ligne TOTAL presente', 'TOTAL' in t)

    print('--- 3) controle : excavatrice (harnais sans prix), total inchange ---')
    aller('Excavatrice', 'Caterpillar', '2024', '320', lim='lim-hauteur')
    t = tableau()
    check('harnais Z03B present', 'Z03B-' in t)
    check('ligne TOTAL presente', 'TOTAL' in t)
    check('pas de « Prix à valider »', 'Prix à valider' not in t)

    print('--- 4) anglais ---')
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    aller('Nacelle', 'Manitou', '2022', 'VJR 26')
    t = tableau()
    check('EN : « Price to be confirmed »', 'Price to be confirmed' in ligne('1500-0915'))
    check('EN : « Total not available »', 'Total not available' in t)
    check('EN : libelle « 15M reel option for aerial lift »', '15M reel option for aerial lift' in t)
    dv.execute_script("localStorage.setItem('portal_lang','fr');")

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
