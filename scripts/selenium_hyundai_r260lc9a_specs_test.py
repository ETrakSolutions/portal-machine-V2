# -*- coding: utf-8 -*-
"""Test navigateur des specs Hyundai R260LC-9A sur les 12 annees de la BD.

Sert le repo LOCAL et verifie :
  - machine.html : le modele apparait pour chaque annee echantillonnee, la
    fiche affiche les specs remplies et plus aucun « A completer » ;
  - les defauts BOM calcules par kit-rules.js sont coherents avec les specs
    (0000 cabine, 0004 mini, 0008 swing boom) ;
  - le harnais de marque est resolu par les regles ;
  - database.html trouve le modele par la recherche ;
  - soumission.html voit la premiere et la derniere annee ;
  - aucune erreur JS SEVERE.

Les valeurs attendues sont LUES DANS LA BD (rien de code en dur).
"""
import sys, io, os, json, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8795
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

FAB, MOD = 'Hyundai', 'R260LC-9A'
_DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))['Excavatrice']
TOUTES = [y for y in sorted(_DB[FAB]) if MOD in _DB[FAB][y]]
# echantillon : premiere, milieu, derniere (12 fiches en navigateur = trop lent)
ECH = sorted({TOUTES[0], TOUTES[len(TOUTES) // 2], TOUTES[-1]})

CHAMPS = ['Puissance moteur (kW / HP)', 'Poids operationnel (kg / lbs)', 'Classe machine',
          'Longueur de fleche (m / pi)', 'Longueur de stick (m / pi)', 'Type de traction',
          'Type de boom', 'Swing boom', 'Voltage machine (V/type)',
          'Capacite max de levage (kg / lbs)']


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


try:
    print('annees en BD : %s (echantillon navigateur : %s)' % (','.join(TOUTES), ','.join(ECH)))
    check('les 12 annees du fabricant sont couvertes', TOUTES == sorted(_DB[FAB].keys()))

    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T', permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))

    print('--- 1) Fiche machine (machine.html) ---')
    for an in ECH:
        e = _DB[FAB][an][MOD]
        Select(dv.find_element(By.ID, 'select-type')).select_by_value('Excavatrice')
        WebDriverWait(dv, 20).until(lambda d: any(
            o.get_attribute('value') == FAB for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
        Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(FAB)
        WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
        Select(dv.find_element(By.ID, 'select-annee')).select_by_value(an)
        WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
        models = [o.get_attribute('value') for o in dv.find_elements(By.CSS_SELECTOR, '#select-modele option')]
        check('%s %s %s present dans la liste' % (FAB, MOD, an), MOD in models)
        if MOD not in models:
            continue
        Select(dv.find_element(By.ID, 'select-modele')).select_by_value(MOD)
        # les libelles sont rendus en majuscules par le CSS -> on attend une VALEUR
        WebDriverWait(dv, 20).until(
            lambda d: e['Poids operationnel (kg / lbs)'] in d.find_element(By.TAG_NAME, 'body').text)
        body = dv.find_element(By.TAG_NAME, 'body').text
        for champ in CHAMPS:
            check('  %s fiche %s contient "%s"' % (an, champ.split(' (')[0], e[champ]), e[champ] in body)
        check('  %s fiche sans "A completer"' % an, 'A completer' not in body)

    print('--- 2) Defauts BOM (kit-rules.js) ---')
    JS = ("var s = machinesData['Excavatrice'][arguments[0]][arguments[1]][arguments[2]];"
          "return window.KitRules.excDefaults(s, arguments[2]);")
    for an in ECH:
        d1 = dv.execute_script(JS, FAB, an, MOD)
        check('  %s 0000 cabine = obligatoire (r)' % an, d1.get('0000') == 'r')
        check('  %s 0004 mini = na (25200 kg)' % an, d1.get('0004') == 'na')
        check('  %s 0008 swing boom = na (Swing boom = Non)' % an, d1.get('0008') == 'na')
    h = dv.execute_script("return window.KitRules.harnais('HYUNDAI','R260LC-9A');")
    print('     harnais calcule :', json.dumps(h, ensure_ascii=False))
    check('  harnais Hyundai resolu (code non vide)', bool(h and h.get('code')))

    print('--- 3) database.html (recherche utilisateur) ---')
    dv.get(BASE + '/database.html')
    WebDriverWait(dv, 60).until(lambda d: any(
        o.get_attribute('value') == 'Excavatrice' for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(dv.find_element(By.ID, 'db-type')).select_by_value('Excavatrice')
    WebDriverWait(dv, 90).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'table tbody tr')) > 5)
    box = dv.find_element(By.ID, 'db-search')
    box.clear()
    box.send_keys(MOD)
    WebDriverWait(dv, 20).until(
        lambda d: MOD.lower() in d.find_element(By.CSS_SELECTOR, 'table tbody').text.lower())
    txt = dv.find_element(By.CSS_SELECTOR, 'table tbody').text
    check('database.html trouve "%s"' % MOD, MOD.lower() in txt.lower())
    check('database.html rattache au bon fabricant', FAB.lower() in txt.lower())

    print('--- 4) soumission.html ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for an in (TOUTES[0], TOUTES[-1]):
        check('soumission voit %s %s' % (MOD, an), dv.execute_script(
            "return !!(machinesData['Excavatrice'][arguments[0]][arguments[1]][arguments[2]]);", FAB, an, MOD))

    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:5]:
        print('     ', e['message'][:200])

except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
