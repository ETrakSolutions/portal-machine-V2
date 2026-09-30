# -*- coding: utf-8 -*-
"""Test navigateur : Supervac « Kenworth T880 » (Camion Vacuum), 2015-2027, et Hercules corrige.

Sert le repo LOCAL et verifie :
  - machine.html : le modele apparait pour la premiere, une annee du milieu et 2027,
    et la fiche affiche les specs de la BD (boom 24 ft, 220 deg, 12V) ;
  - le Hercules affiche 24 ft ;
  - l'ancienne coquille « Kenworth » n'est plus proposee comme fabricant ;
  - database.html trouve le modele ; soumission.html voit 2015 et 2027 ;
  - aucune erreur JS SEVERE.
Valeurs attendues LUES DANS LA BD.
"""
import sys, io, os, json, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8796
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

TYPE, FAB, MOD = 'Camion Vacuum', 'Supervac', 'Kenworth T880'
_DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))[TYPE]
TOUTES = [y for y in sorted(_DB[FAB]) if MOD in _DB[FAB][y]]
ECH = sorted({TOUTES[0], TOUTES[len(TOUTES) // 2], TOUTES[-1]})
CHAMPS = ['Longueur de boom', 'Angle de rotation', 'Voltage']


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


def fiche(an, mod):
    Select(dv.find_element(By.ID, 'select-type')).select_by_value(TYPE)
    WebDriverWait(dv, 20).until(lambda d: any(
        o.get_attribute('value') == FAB for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
    fabs = [o.get_attribute('value') for o in dv.find_elements(By.CSS_SELECTOR, '#select-fabricant option')]
    Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(FAB)
    WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
    Select(dv.find_element(By.ID, 'select-annee')).select_by_value(an)
    WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
    models = [o.get_attribute('value') for o in dv.find_elements(By.CSS_SELECTOR, '#select-modele option')]
    check('%s %s %s present dans la liste' % (FAB, mod, an), mod in models)
    if mod not in models:
        return fabs, ''
    Select(dv.find_element(By.ID, 'select-modele')).select_by_value(mod)
    e = _DB[FAB][an][mod]
    WebDriverWait(dv, 20).until(lambda d: e['Longueur de boom'] in d.find_element(By.TAG_NAME, 'body').text)
    body = dv.find_element(By.TAG_NAME, 'body').text
    for champ in CHAMPS:
        check('  %s %s fiche contient %s = "%s"' % (mod, an, champ, e[champ]), e[champ] in body)
    return fabs, body


try:
    print('annees en BD : %s (echantillon : %s)' % (','.join(TOUTES), ','.join(ECH)))
    check('2015 a 2027 couverts (13 annees)', TOUTES == [str(y) for y in range(2015, 2028)])
    check('Hercules a 24 ft sur ses 12 annees', all(_DB[FAB][y]['Hercules']['Longueur de boom'] == '24 ft'
                                                   for y in _DB[FAB] if 'Hercules' in _DB[FAB][y]))
    check('plus de fabricant Kenworth en BD', 'Kenworth' not in _DB)

    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T', permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))

    print('--- 1) Fiches machine.html ---')
    fabs = []
    for an in ECH:
        fabs, _ = fiche(an, MOD)
    check('Kenworth absent de la liste des fabricants', 'Kenworth' not in fabs)
    fiche('2020', 'Hercules')

    print('--- 2) database.html ---')
    dv.get(BASE + '/database.html')
    WebDriverWait(dv, 60).until(lambda d: any(
        o.get_attribute('value') == TYPE for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(dv.find_element(By.ID, 'db-type')).select_by_value(TYPE)
    WebDriverWait(dv, 90).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'table tbody tr')) > 5)
    box = dv.find_element(By.ID, 'db-search')
    box.clear()
    box.send_keys('T880')
    WebDriverWait(dv, 20).until(lambda d: 't880' in d.find_element(By.CSS_SELECTOR, 'table tbody').text.lower())
    txt = dv.find_element(By.CSS_SELECTOR, 'table tbody').text
    check('database.html trouve T880 chez Supervac', 'supervac' in txt.lower())

    print('--- 3) soumission.html ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for an in (TOUTES[0], TOUTES[-1]):
        check('soumission voit %s %s' % (MOD, an), dv.execute_script(
            "return !!(machinesData[arguments[0]][arguments[1]][arguments[2]][arguments[3]]);", TYPE, FAB, an, MOD))

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
