# -*- coding: utf-8 -*-
"""Test navigateur du champ Loader « Gage port » (suggestion Mathieu Robillard, 2026-10-01).

Sert le depot LOCAL et verifie :
  - BD : toutes les fiches Loader ont « Gage port », juste apres « Capacite de levage » ;
  - database.html (Loader) : colonne « Gage port » entre Capacite de levage et Puissance,
    valeurs « A completer » affichees comme les autres champs incomplets ;
  - le titre passe a « Gauge port » en anglais ;
  - machine.html et edit-machine.html montrent le champ pour un Loader ;
  - aucune erreur JS SEVERE.

    py -3.13 scripts/selenium_loader_gage_port_test.py
"""
import sys, io, os, json, time, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from urllib.parse import quote
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8798
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)
_DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))['Loader']
FAB, AN = 'Case', '2024'
MOD = sorted(_DB[FAB][AN])[0]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class Serveur(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True


httpd = Serveur(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond, det=''):
    print(('  [OK] ' if cond else '  [X ] ') + label + (('  — ' + str(det)) if det else ''))
    if not cond:
        fails.append(label)


def titres():
    return [th.text.replace('\n', ' ').replace('▲', '').strip()
            for th in dv.find_elements(By.CSS_SELECTOR, '.db-table thead th')]


try:
    print('--- 0) Donnees ---')
    tot = ok = 0
    for f, ys in _DB.items():
        if f.startswith('_'):
            continue
        for y, ms in ys.items():
            for m, s in ms.items():
                tot += 1
                k = [x for x in s if not x.startswith('_') and x != 'Image']
                ok += (k[:2] == ['Capacite de levage', 'Gage port'])
    check('les %d fiches Loader ont Gage port apres Capacite de levage' % tot, ok == tot, ok)

    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'T',"
                      "token:'TOK',permissions:{modifBom:true}}));localStorage.setItem('portal_lang','fr');")

    print('--- 1) database.html ---')
    dv.get(BASE + '/database.html')
    WebDriverWait(dv, 60).until(lambda d: any(o.get_attribute('value') == 'Loader'
                                              for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(dv.find_element(By.ID, 'db-type')).select_by_value('Loader')
    WebDriverWait(dv, 90).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.db-table tbody tr')) > 5)
    time.sleep(1)
    t = [x.upper() for x in titres()]
    print('     colonnes :', t)
    i_lev = next((i for i, x in enumerate(t) if 'LEVAGE' in x), -1)
    i_gage = next((i for i, x in enumerate(t) if 'GAGE PORT' in x), -1)
    i_pui = next((i for i, x in enumerate(t) if 'PUISSANCE' in x), -1)
    check('colonne Gage port entre Capacite de levage et Puissance', 0 <= i_lev < i_gage < i_pui, (i_lev, i_gage, i_pui))
    cell = dv.execute_script("var r=document.querySelector('.db-table tbody tr');return r?r.children[arguments[0]].innerText:'';", i_gage)
    check('cellule Gage port = a completer', 'compl' in cell.lower(), cell)
    stats = dv.find_element(By.ID, 'db-stats').text
    check('compteur « incomplets » non gonfle (sous le total)', 'incomplet' not in stats or
          int(stats.split('|')[1].split()[0]) < int(stats.split('/')[1].split()[0]), stats)

    print('--- 2) titre en anglais ---')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    dv.get(BASE + '/database.html')
    WebDriverWait(dv, 60).until(lambda d: any(o.get_attribute('value') == 'Loader'
                                              for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(dv.find_element(By.ID, 'db-type')).select_by_value('Loader')
    WebDriverWait(dv, 90).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.db-table tbody tr')) > 5)
    time.sleep(1)
    check('titre anglais « Gauge port »', any('GAUGE PORT' in x.upper() for x in titres()), titres())
    dv.execute_script("localStorage.setItem('portal_lang','fr');")

    print('--- 3) machine.html (%s %s %s) ---' % (FAB, MOD, AN))
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    Select(dv.find_element(By.ID, 'select-type')).select_by_value('Loader')
    WebDriverWait(dv, 20).until(lambda d: any(o.get_attribute('value') == FAB for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
    Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(FAB)
    WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
    Select(dv.find_element(By.ID, 'select-annee')).select_by_value(AN)
    WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
    Select(dv.find_element(By.ID, 'select-modele')).select_by_value(MOD)
    time.sleep(1.5)
    body = dv.find_element(By.TAG_NAME, 'body').text.upper()
    check('fiche machine affiche Gage port', 'GAGE PORT' in body)

    print('--- 4) edit-machine.html ---')
    dv.get(BASE + '/edit-machine.html?type=Loader&fab=%s&year=%s&model=%s' % (quote(FAB), AN, quote(MOD)))
    time.sleep(4)
    dv.execute_script("var t=[...document.querySelectorAll('button,a,div,span')].find(e=>e.children.length===0"
                      "&&/^sp[eé]cifications$/i.test(e.textContent.trim()));if(t)t.click();")
    time.sleep(1)
    body = dv.find_element(By.TAG_NAME, 'body').text.upper()
    check('onglet Specifications de l edition propose Gage port', 'GAGE PORT' in body)

    errs = [x for x in dv.get_log('browser') if x['level'] == 'SEVERE' and 'script.google' not in x['message']]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs, [x['message'][:150] for x in errs[:3]])
except Exception as ex:
    print('!! ERREUR:', type(ex).__name__, ex)
    fails.append(str(ex))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
