# -*- coding: utf-8 -*-
"""Test navigateur de la regle IDC en soumission (Mathieu Robillard, 2026-10-01).

L'IDC (Excavatrice seulement) ne s'installe qu'avec le limiteur Hauteur + Rotation :
  - activer l'IDC sans limiteur, ou avec Hauteur seule, bascule le limiteur a H+R ;
  - cocher Hauteur ou Rotation avec l'IDC bascule a H+R ;
  - choisir Multi-axe ou decocher le limiteur retire l'IDC ;
  - la liste des options choisies ne contient jamais 1000-0004 sans 1500-0001 ET 1500-0002,
    ni 1000-0400 (IDC seul).
Sert le depot LOCAL. Machine prise dans la BD (premiere Caterpillar 2024).

    py -3.13 scripts/selenium_idc_hr_test.py
"""
import sys, io, os, json, time, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)
_DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))['Excavatrice']
FAB, AN = 'Caterpillar', '2024'
MOD = sorted(_DB[FAB][AN])[0]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1400,1200']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond, det=''):
    print(('  [OK] ' if cond else '  [X ] ') + label + (('  — ' + str(det)) if det else ''))
    if not cond:
        fails.append(label)


def choose(sid, val):
    dv.execute_script("var s=document.getElementById(arguments[0]);for(var i=0;i<s.options.length;i++){"
                      "if(s.options[i].value===arguments[1]){s.selectedIndex=i;break;}}"
                      "s.dispatchEvent(new Event('change',{bubbles:true}));", sid, val)


def idc():
    dv.execute_script("document.querySelector('[data-option=\"Indicateur de charge\"]').click()")
    time.sleep(0.3)


def lim(id_):
    dv.execute_script("var c=document.getElementById(arguments[0]);c.checked=!c.checked;"
                      "c.dispatchEvent(new Event('change',{bubbles:true}));", id_)
    time.sleep(0.3)


ETAT_JS = """
    var c=document.querySelector('#toggle-limiteur input[name="limiteur-type"]:checked');
    var b=document.querySelector('[data-option="Indicateur de charge"]');
    var n=document.getElementById('idc-hr-note');
    var l=document.getElementById('selected-options-list');
    return {lim: c ? c.id : '', idc: b.classList.contains('active'),
            note: (n && n.offsetParent !== null) ? n.innerText : '',
            limStatus: document.querySelector('#toggle-limiteur .toggle-status').textContent,
            liste: l ? l.innerText : ''};"""


def etat():
    return dv.execute_script(ETAT_JS)


def liste_valide(e):
    t = e['liste']
    if '1000-0400' in t:
        return False
    if '1000-0004' in t:
        return '1500-0001' in t and '1500-0002' in t
    return True


try:
    print('machine : %s %s %s' % (FAB, MOD, AN))
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'T',permissions:{modifBom:true}}));")
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    choose('select-type', 'Excavatrice')
    WebDriverWait(dv, 20).until(lambda d: any(o.get_attribute('value') == FAB for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
    choose('select-fabricant', FAB)
    WebDriverWait(dv, 20).until(lambda d: any(o.get_attribute('value') == MOD for o in d.find_elements(By.CSS_SELECTOR, '#select-modele option')))
    choose('select-modele', MOD)
    WebDriverWait(dv, 20).until(lambda d: any(o.get_attribute('value') == AN for o in d.find_elements(By.CSS_SELECTOR, '#select-annee option')))
    choose('select-annee', AN)
    WebDriverWait(dv, 20).until(lambda d: d.find_element(By.ID, 'options-section').is_displayed())
    time.sleep(1)

    print('1) IDC active sans limiteur')
    idc(); e = etat()
    check('limiteur bascule a Hauteur + Rotation', e['lim'] == 'lim-hr' and e['idc'], e)
    check('statut du limiteur affiche H+R', e['limStatus'] == 'Hauteur + Rotation', e['limStatus'])
    check('note de bascule visible', 'Hauteur + Rotation' in e['note'], e['note'])
    check('liste : 1500-0001 + 1500-0002 + 1000-0004, pas de 1000-0400', liste_valide(e)
          and '1000-0004' in e['liste'], e['liste'][:300])

    print('2) Hauteur seule cochee avec l IDC')
    lim('lim-hauteur'); e = etat()
    check('repasse a Hauteur + Rotation, IDC garde', e['lim'] == 'lim-hr' and e['idc'], e['lim'])
    check('liste valide', liste_valide(e), e['liste'][:300])
    print('3) Rotation seule cochee avec l IDC')
    lim('lim-rotation'); e = etat()
    check('repasse a Hauteur + Rotation, IDC garde', e['lim'] == 'lim-hr' and e['idc'], e['lim'])

    print('4) Multi-axe choisi avec l IDC')
    lim('lim-multi'); e = etat()
    check('Multi-axe respecte, IDC retire', e['lim'] == 'lim-multi' and not e['idc'], e)
    check('note de retrait visible', 'retir' in e['note'], e['note'])
    check('liste sans IDC', '1000-0004' not in e['liste'] and '1000-0400' not in e['liste'], e['liste'][:300])

    print('5) Hauteur seule PUIS IDC')
    lim('lim-hauteur'); e = etat()
    check('sans IDC, Hauteur seule permise', e['lim'] == 'lim-hauteur' and not e['idc'], e['lim'])
    idc(); e = etat()
    check('IDC active -> Hauteur + Rotation', e['lim'] == 'lim-hr' and e['idc'], e['lim'])
    check('liste valide', liste_valide(e), e['liste'][:300])

    print('6) Limiteur decoche avec l IDC')
    lim('lim-hr'); e = etat()
    check('IDC retire, aucun IDC seul', not e['idc'] and e['lim'] == '' and '1000-0400' not in e['liste'], e)

    print('7) IDC remis puis retire : note masquee')
    idc(); idc(); e = etat()
    check('IDC OFF, note masquee', not e['idc'] and e['note'] == '', e)

    errs = [x for x in dv.get_log('browser') if x['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs, [x['message'][:150] for x in errs[:3]])
except Exception as ex:
    print('!! ERREUR:', type(ex).__name__, ex)
    fails.append(str(ex))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
