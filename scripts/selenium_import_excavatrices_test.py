# -*- coding: utf-8 -*-
"""Test navigateur de l'import des excavatrices manquantes (lot 2026-07-01).

Sert le repo LOCAL et verifie, sur machine.html :
  - les nouveaux modeles apparaissent dans la liste pour la bonne annee ;
  - la fiche affiche poids / classe / traction ;
  - les defauts BOM calcules par kit-rules.js sont coherents
    (mini -> 0004 obligatoire, drain sur prefixe connu, GC sur Cat GC) ;
  - database.html et soumission.html voient aussi les nouveaux modeles.
"""
import sys, io, os, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8791
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


# Cas testes ; les valeurs attendues sont LUES DANS LA BD (pas codees en dur)
import json
_DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))['Excavatrice']
CAS = []
for _fab, _an, _mod in [('Kobelco', '2024', 'SK210D-11'), ('Yanmar', '2024', 'ViO35-6A'),
                        ('Volvo CE', '2024', 'EC500'), ('Hyundai', '2024', 'HX130A LCR'),
                        ('Caterpillar', '2024', '336 GC'),
                        # lot 2 (decisions 2026-08-05)
                        ('Bobcat', '2024', 'E48'), ('Yanmar', '2017', 'ViO45-6A')]:
    _e = _DB[_fab][_an][_mod]
    CAS.append(('Excavatrice', _fab, _an, _mod,
                [_e['Poids operationnel (kg / lbs)'].split(' ')[0], _e['Classe machine']]))

try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T', permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    # machinesData est declare avec `let` (portee lexicale globale) -> pas sur window
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))

    print('--- 1) Fiche machine (machine.html) ---')
    for typ, fab, an, mod, attendus in CAS:
        Select(dv.find_element(By.ID, 'select-type')).select_by_value(typ)
        WebDriverWait(dv, 20).until(lambda d: any(
            o.get_attribute('value') == fab for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
        Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(fab)
        WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
        Select(dv.find_element(By.ID, 'select-annee')).select_by_value(an)
        WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
        models = [o.get_attribute('value') for o in dv.find_elements(By.CSS_SELECTOR, '#select-modele option')]
        check('%s %s %s present dans la liste' % (fab, mod, an), mod in models)
        if mod not in models:
            continue
        Select(dv.find_element(By.ID, 'select-modele')).select_by_value(mod)
        WebDriverWait(dv, 15).until(lambda d: attendus[0] in d.find_element(By.TAG_NAME, 'body').text
                                    or 'Poids' in d.find_element(By.TAG_NAME, 'body').text)
        body = dv.find_element(By.TAG_NAME, 'body').text
        for a in attendus:
            check('  fiche %s %s contient "%s"' % (fab, mod, a), a in body)

    print('--- 2) Defauts BOM (kit-rules.js) ---')
    JS = ("var s = machinesData['Excavatrice'][arguments[0]][arguments[1]][arguments[2]];"
          "return window.KitRules.excDefaults(s, arguments[2]);")

    def defaults(fab, an, mod):
        return dv.execute_script(JS, fab, an, mod)

    d1 = defaults('Yanmar', '2024', 'ViO35-6A')          # 3726 kg -> mini
    check('ViO35-6A : 0004 mini = obligatoire (r)', d1.get('0004') == 'r')
    check('ViO35-6A : 0000 cabine = obligatoire (r)', d1.get('0000') == 'r')
    d2 = defaults('Caterpillar', '2024', '336 GC')        # Cat GC -> boite GC
    check('336 GC : 0070 boite GC = obligatoire (r)', d2.get('0070') == 'r')
    check('336 GC : 0004 mini = na', d2.get('0004') == 'na')
    d3 = defaults('Kobelco', '2024', 'SK210D-11')         # prefixe SK210 -> drain
    check('SK210D-11 : 0009 drain = obligatoire (r)', d3.get('0009') == 'r')
    d4 = defaults('Volvo CE', '2024', 'EC500')            # pas de prefixe drain
    check('EC500 : 0009 drain = na', d4.get('0009') == 'na')
    check('EC500 : 0008 swing = na (Swing boom a completer)', d4.get('0008') == 'na')

    print('--- 3) Harnais ---')
    h = dv.execute_script("return window.KitRules.harnais('KOBELCO','SK210D-11');")
    check('Kobelco -> harnais generique Z03B-0043', h['code'] == 'Z03B-0043')
    h2 = dv.execute_script("return window.KitRules.harnais('VOLVO CE','EC500');")
    check('Volvo -> harnais Z03B-0034', h2['code'] == 'Z03B-0034')

    print('--- 4) database.html (via la recherche, comme un utilisateur) ---')
    dv.get(BASE + '/database.html')
    # il faut d'abord choisir un type, sinon le tableau reste vide
    WebDriverWait(dv, 60).until(lambda d: any(
        o.get_attribute('value') == 'Excavatrice' for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(dv.find_element(By.ID, 'db-type')).select_by_value('Excavatrice')
    WebDriverWait(dv, 90).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'table tbody tr')) > 5)
    box = dv.find_element(By.ID, 'db-search')
    for terme, attendu in [('SK210D-11', 'Kobelco'), ('ViO35-6A', 'Yanmar'), ('336 GC', 'Caterpillar')]:
        box.clear()
        box.send_keys(terme)
        WebDriverWait(dv, 20).until(
            lambda d: terme.lower() in d.find_element(By.CSS_SELECTOR, 'table tbody').text.lower())
        txt = dv.find_element(By.CSS_SELECTOR, 'table tbody').text
        check('database.html trouve "%s" (%s)' % (terme, attendu), attendu.lower() in txt.lower())

    print('--- 5) soumission.html ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    check('soumission voit ViO35-6A 2024',
          dv.execute_script("return !!(machinesData['Excavatrice']['Yanmar']['2024']['ViO35-6A']);"))
    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE en soumission (%d)' % len(errs), not errs)
    for e in errs[:5]:
        print('     ', e['message'][:200])

except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
