# -*- coding: utf-8 -*-
"""VERIFICATION : quel kit de base la soumission emet-elle pour une nacelle
ARTICULEE, et les codes 0903/0904/0905 sont-ils atteignables ?

Compare, pour la meme machine :
  - ce que kit-rules.js calcule (nacelleDefaults) — utilise par machine.html,
    database.html, edit-machine.html et l export ;
  - ce que la page de soumission met reellement dans le recapitulatif.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

NAC = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))['Nacelle']


def sans_accent(s):
    """« Flèche télescopique » -> « fleche telescopique » (le filtre doit
    survivre aux accents, sinon on croit a tort qu'aucun modele ne correspond)."""
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', str(s or '').lower())
                   if unicodedata.category(c) != 'Mn')


def un_modele(categorie):
    for f in NAC:
        if f.startswith('_'):
            continue
        for y in sorted(NAC[f]):
            for m, e in NAC[f][y].items():
                if categorie in sans_accent(e.get('Categorie')):
                    return f, y, m
    return None


ARTIC = un_modele('articul')
TELE = un_modele('telescop')
print('nacelle articulee testee   :', ARTIC)
print('nacelle telescopique testee:', TELE)

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1100']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T',"
                      " permissions:{modifBom:true, voirPrix:true}}));")

    for etiquette, (fab, an, mod) in (('ARTICULEE', ARTIC), ('TELESCOPIQUE', TELE)):
        dv.get(BASE + '/soumission.html')
        WebDriverWait(dv, 40).until(lambda d: d.execute_script(
            "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
        for sid, val in (('select-type', 'Nacelle'), ('select-fabricant', fab),
                         ('select-modele', mod), ('select-annee', an)):
            choisir(sid, val)
        time.sleep(1.5)
        # coche Hauteur + Rotation
        dv.execute_script("var e=document.getElementById('lim-hr'); if(e){e.click();}")
        time.sleep(1.2)

        specs = NAC[fab][an][mod]
        attendu = dv.execute_script(
            "return window.KitRules.nacelleDefaults(arguments[0]);", specs)
        corps = dv.find_element(By.TAG_NAME, 'body').text
        emis = sorted(set(c for c in ['1500-0900', '1500-0901', '1500-0902',
                                      '1500-0903', '1500-0904', '1500-0905']
                          if c in corps))

        print('\n=== %s : %s %s (%s) — categorie « %s » ==='
              % (etiquette, fab, mod, an, specs.get('Categorie')))
        print('   kit-rules (machine.html / database / export) :')
        for code in sorted(attendu):
            print('       %s = %s' % (code, attendu[code]))
        print('   codes REELLEMENT emis par la soumission : %s' % (emis or 'aucun'))
        base_attendue = '1500-0903' if attendu.get('0903') == 'r' else '1500-0900'
        base_emise = '1500-0903' if '1500-0903' in emis else ('1500-0900' if '1500-0900' in emis else '(aucune)')
        verdict = 'COHERENT' if base_attendue == base_emise else '*** INCOHERENT ***'
        print('   base attendue %s | base emise %s  -> %s'
              % (base_attendue, base_emise, verdict))
        manquants = [c for c in ('1500-0903', '1500-0904', '1500-0905') if c not in emis]
        # Ces codes ne sortent PAS du bloc « Limiteur de portee » : ils sont
        # proposes par le bloc « Options nacelle » (cumulables), teste a part
        # dans scripts/selenium_nacelle_options_test.py. Rien n est coche ici.
        print('   non emis par le bloc limiteur (normal, ils viennent du bloc '
              'Options nacelle, non coche ici) : %s' % ', '.join(manquants))
finally:
    dv.quit()
