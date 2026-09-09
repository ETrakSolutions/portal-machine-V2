# -*- coding: utf-8 -*-
"""Test navigateur des 8 excavatrices Liebherr Generation 8 (poids + classe).

Contexte : ces 8 modeles portaient « A completer » comme poids sur toutes leurs
annees sauf 2026, et la classe « 700-800 » (celle des 70-100 t) alors qu'ils
pesent 22 a 47 t. Sans poids, ni machine.html ni la soumission n'affichaient de
ligne « Classe machine » du tout — c'est la regression que ce test verrouille.

Sert le repo LOCAL et verifie, pour CHAQUE annee de CHAQUE modele :
  - machine.html : le modele est dans la liste, le poids affiche est celui de
    la BD, il n'y a plus de « A completer », et la ligne « Classe machine »
    EXISTE et est non vide ;
  - le libelle du selecteur porte la nouvelle classe entre crochets ;
  - kit-rules.js : le 0004 reste « na » (aucun de ces modeles n'est un mini) ;
  - soumission.html : la ligne de classe apparait aussi cote client ;
  - aucune erreur JS SEVERE.

Les valeurs attendues sont LUES DANS LA BD — rien n'est code en dur.
"""
import sys, io, os, json, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

FAB = 'Liebherr'
MODELES = ['R 922 Litronic G8', 'R 924 Litronic G8', 'R 926 Litronic G8',
           'R 928 Litronic G8', 'R 930 Litronic G8', 'R 934 Litronic G8',
           'R 938 Litronic G8', 'R 945 Litronic G8']

_DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'),
                     encoding='utf-8'))['Excavatrice']


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


# annees reellement presentes en BD pour chaque modele
ANNEES = {m: sorted(a for a in _DB[FAB] if m in _DB[FAB][a]) for m in MODELES}

try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T',"
                      " permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined')"
        " && Object.keys(machinesData).length > 0;"))

    def reset_listes():
        """Selectionner un modele restreint la liste des annees a CE modele, et
        re-selectionner une valeur DEJA choisie ne declenche aucun 'change' :
        la liste ne serait donc jamais reconstruite. Il faut recharger la page."""
        dv.get(BASE + '/machine.html')
        WebDriverWait(dv, 60).until(lambda d: d.execute_script(
            "return (typeof machinesData !== 'undefined')"
            " && Object.keys(machinesData).length > 0;"))
        Select(dv.find_element(By.ID, 'select-type')).select_by_value('Excavatrice')
        WebDriverWait(dv, 20).until(lambda d: any(
            o.get_attribute('value') == FAB
            for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
        Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(FAB)
        WebDriverWait(dv, 20).until(lambda d: len(
            d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)

    print('--- 1) Fiche machine : poids, classe, libelle du selecteur ---')
    for mod in MODELES:
        annees = ANNEES[mod]
        print('  %s  (%d annees : %s-%s)' % (mod, len(annees), annees[0], annees[-1]))
        for an in annees:
            reset_listes()
            e = _DB[FAB][an][mod]
            poids_attendu = e['Poids operationnel (kg / lbs)']
            classe_bd = e['Classe machine']
            WebDriverWait(dv, 20).until(lambda d: len(
                d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
            Select(dv.find_element(By.ID, 'select-annee')).select_by_value(an)
            WebDriverWait(dv, 20).until(lambda d: len(
                d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
            opts_mod = {o.get_attribute('value'): o.text
                        for o in dv.find_elements(By.CSS_SELECTOR, '#select-modele option')}
            if mod not in opts_mod:
                check('    %s %s present dans la liste' % (mod, an), False)
                continue
            check('    %s libelle porte [%s]' % (an, classe_bd),
                  ('[' + classe_bd + ']') in opts_mod[mod])
            Select(dv.find_element(By.ID, 'select-modele')).select_by_value(mod)
            WebDriverWait(dv, 20).until(
                lambda d: poids_attendu in d.find_element(By.TAG_NAME, 'body').text)
            body = dv.find_element(By.TAG_NAME, 'body').text
            check('    %s poids affiche = BD (%s)' % (an, poids_attendu),
                  poids_attendu in body)
            check('    %s plus de "A completer" sur le poids' % an,
                  'A completer' not in body.split('Poids')[-1][:120])
            # la ligne de classe doit EXISTER et etre non vide (elle etait absente)
            classe_vue = dv.execute_script(
                "var t=document.querySelectorAll('.specs-table tr');"
                "for (var i=0;i<t.length;i++){var c=t[i].querySelectorAll('td');"
                "if(c.length>1 && /classe|class/i.test(c[0].textContent))"
                "return c[1].textContent.trim();} return null;")
            check('    %s ligne "Classe machine" presente et non vide (%r)'
                  % (an, classe_vue), bool(classe_vue))

    print('--- 2) kit-rules.js : aucun de ces modeles n\'est un mini ---')
    JS = ("var s = machinesData['Excavatrice'][arguments[0]][arguments[1]][arguments[2]];"
          "return window.KitRules.excDefaults(s, arguments[2]);")
    for mod in MODELES:
        an = ANNEES[mod][-1]
        dft = dv.execute_script(JS, FAB, an, mod)
        check('  %s %s : 0004 = na' % (mod, an), dft.get('0004') == 'na')
        check('  %s %s : 0000 cabine = r' % (mod, an), dft.get('0000') == 'r')

    print('--- 3) soumission.html : la classe apparait cote client ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined')"
        " && Object.keys(machinesData).length > 0;"))
    for mod in MODELES:
        an = ANNEES[mod][0]
        ok = dv.execute_script(
            "return !!(machinesData['Excavatrice']['Liebherr'][arguments[0]][arguments[1]]);",
            an, mod)
        check('  soumission voit %s %s' % (mod, an), ok)
        poids = dv.execute_script(
            "return machinesData['Excavatrice']['Liebherr'][arguments[0]][arguments[1]]"
            "['Poids operationnel (kg / lbs)'];", an, mod)
        check('  soumission lit un poids exploitable pour %s %s' % (mod, an),
              bool(poids) and poids != 'A completer'
              and poids == _DB[FAB][an][mod]['Poids operationnel (kg / lbs)'])

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
for f in fails[:20]:
    print('   -', f)
sys.exit(0 if not fails else 1)
