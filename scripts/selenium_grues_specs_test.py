# -*- coding: utf-8 -*-
"""Test navigateur des specs Grue Mobile completees (passes 1 et 2).

Verifie sur machine.html que les valeurs ecrites s'affichent bien, y compris
les libelles « Selon chassis », et qu'aucune erreur JS n'apparait.
Les valeurs attendues sont LUES DANS LA BD, jamais codees en dur.
"""
import sys, io, os, json, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8794
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

GM = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))['Grue Mobile']

# (marque, annee, modele) couvrant : boom truck « Selon chassis », valeurs de
# recherche, voltage retire volontairement chez Link-Belt.
CAS_SOUHAITES = [('Elliott', '34127'),        # hauteur + contrepoids trouves
                 ('Manitex', '30112S'),       # « Selon chassis » + contrepoids
                 ('Kobelco', 'CK1600G-3'),    # treillis : contrepoids/hauteur/voltage
                 ('Tadano', 'GR-1000XL-4'),   # rough-terrain
                 ('Link-Belt', 'HTT-8660')]   # voltage volontairement remis a vide

# L'annee est DEDUITE de la BD : tous ces modeles ne couvrent pas 2024.
CAS = []
for _fab, _mod in CAS_SOUHAITES:
    _ans = sorted(y for y in GM[_fab] if _mod in GM[_fab][y])
    if not _ans:
        print('!! %s %s absent de la BD' % (_fab, _mod))
        continue
    CAS.append((_fab, _ans[-1], _mod))
print('cas testes :', [(f, a, m) for f, a, m in CAS])

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
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T', permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))

    for fab, an, mod in CAS:
        entry = GM[fab][an][mod]
        Select(dv.find_element(By.ID, 'select-type')).select_by_value('Grue Mobile')
        WebDriverWait(dv, 20).until(lambda d: any(
            o.get_attribute('value') == fab for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
        Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(fab)
        WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
        Select(dv.find_element(By.ID, 'select-annee')).select_by_value(an)
        WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
        Select(dv.find_element(By.ID, 'select-modele')).select_by_value(mod)
        # Attente FIABLE : la capacite propre au modele doit apparaitre dans la
        # fiche. Attendre le nom du modele ne prouve rien — il est deja dans le
        # menu deroulant, donc l'attente passait sur la fiche precedente.
        cap = str(entry.get('Capacite max') or '').strip()
        try:
            WebDriverWait(dv, 15).until(
                lambda d: cap and cap in d.find_element(By.CSS_SELECTOR, '.specs-table, table').text)
        except Exception:
            pass
        body = dv.find_element(By.TAG_NAME, 'body').text
        print('--- %s %s (%s) ---' % (fab, mod, an))
        if cap and cap not in body:
            print('     (fiche non chargee ? capacite %r absente du rendu)' % cap)
        for champ in ('Contrepoids max', 'Hauteur max', 'Voltage machine (V/type)',
                      'Essieux', 'Puissance moteur'):
            val = str(entry.get(champ) or '').strip()
            if not val or val == 'A completer':
                continue
            check('  %s = « %s » affiche' % (champ, val[:34]), val in body)

    # le voltage Link-Belt deduit par la regle B doit avoir ete retire
    _y = sorted(y for y in GM['Link-Belt'] if 'HTT-8660' in GM['Link-Belt'][y])
    if _y:
        e = GM['Link-Belt'][_y[-1]]['HTT-8660']
        check('HTT-8660 : voltage remis a vide (%r)' % e.get('Voltage machine (V/type)'),
              str(e.get('Voltage machine (V/type)')).strip() == 'A completer')

    errs = [x for x in dv.get_log('browser') if x['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for x in errs[:5]:
        print('     ', x['message'][:200])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
