# -*- coding: utf-8 -*-
"""Soumission : caméra sans fil du type « Autre machine » (Steve, 2026-11-20).

Verifie :
  1. compte hors apercu : pas de type « Chariot elevateur » ;
  2. apercu : cocher Chariot ouvre la fenetre, statut CHARIOT, etape 1 seule visible,
     prix affiches avant tout choix (« Prix a venir » si absent) ;
  3. cascade : fourche -> etape 2 ; cabine -> etape 3 ; moniteur -> etape 4 ; batteries -> etape 5 ;
  4. recommandations : 2 par camera (batteries), 1 par camera (chargeurs), recalculees ;
  5. « Pas de camera » aux fourches ET a la cabine : envoi bloque (au moins une camera) ;
  6. lignes et bloc Epicor (1300-0125 x2 si avant + arriere) ;
  7. exclusivite avec la grue et avec Recul ; panier ; anglais ; aucune erreur JS SEVERE.

    py -3.12 scripts/selenium_camera_chariot_test.py [--live]
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8796
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import installer_prix, SESSION_TEST_JS   # prix : serveur simule

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1100']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
installer_prix(dv)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


J = dv.execute_script


def vis(i):
    return J("var e=document.getElementById(arguments[0]); return !!e && e.offsetParent !== null;", i)


def cliquer(i):
    J("document.getElementById(arguments[0]).click();", i)
    time.sleep(0.2)


def saisir(i, v):
    J("var e=document.getElementById(arguments[0]); e.value=arguments[1];"
      "e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));", i, v)
    time.sleep(0.2)


def lignes():
    return J("return (window.__selectionRows||[]).map(function(r){return r.code+' | '+r.name;});")


def texte(i):
    return J("return document.getElementById(arguments[0]).textContent;", i)


def sans_machine(apercu=True):
    dv.get(BASE + '/soumission.html')
    J(SESSION_TEST_JS)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0 && !!window.chariotLignes;"))
    if apercu:
        J("APERCU_COMPTES.push('t@e'); var v=selectType.value; while (selectType.options.length > 1) selectType.remove(1);"
          " populateTypes(); selectType.value=v;")
    # Type « Chariot elevateur » (Steve, 2026-11-12) : plus de case dans « Autre machine ».
    J("var s=document.getElementById('select-type'); s.value=arguments[0];"
      "s.dispatchEvent(new Event('change',{bubbles:true}));", '__chariot__' if apercu else '__sans_machine__')
    time.sleep(1)
    if not J("return document.getElementById('toggle-camera').classList.contains('open');"):
        J("document.querySelector('#toggle-camera .toggle-label').click();")
    time.sleep(0.3)


try:
    print('1. Autre machine : case Camera sans fil')
    sans_machine(apercu=False)
    check('case Camera sans fil visible', vis('cam-sansfil'))
    check('fenetre cachee avant de cocher', not vis('cam-chariot'))
    cliquer('cam-recul')
    cliquer('cam-sansfil')
    check('Recul decoche par Sans fil', not J("return document.getElementById('cam-recul').checked;"))
    check('fenetre visible', vis('cam-chariot'))
    check('titre Camera sans fil', J("return [].filter.call(document.querySelectorAll('#cam-chariot .cam-calc-titre span'), function(e){return e.offsetParent!==null;}).map(function(e){return e.textContent;}).join('');") == 'Caméra sans fil')
    check('statut SANS FIL', J("return document.querySelector('#toggle-camera .toggle-status').textContent;") == 'SANS FIL')
    check('pas d etape fourches', not vis('ch-etape-1'))
    check('etape cameras visible, sans cabine avant/arriere', vis('ch-sf-qte') and not vis('ch-cab-avant') and not vis('ch-cab-arriere') and not vis('ch-cab-aucune'))
    check('numero 1 sur l etape cameras', J("return document.querySelector('#ch-etape-2 .grue-num').textContent;") == '1')
    check('option aimants visible', vis('ch-aim-sf'))
    check('quantite generale cachee', not vis('cam-qte-box'))
    check('envoi bloque sans nombre', J("return window.chariotManquant();") is True)
    check('message nombre de cameras', 'nombre de caméras' in texte('ch-msg'))

    print('2. cascade')
    saisir('ch-sf-qte', '3')
    check('moniteur visible (etape 2)', vis('ch-etape-3') and J("return document.querySelector('#ch-etape-3 .grue-num').textContent;") == '2')
    cliquer('ch-mon-10')
    check('reco batteries 6', '6 au total' in texte('ch-reco-batt'))
    saisir('ch-batt-30', '6')
    check('chargeur visible (etape 4)', vis('ch-etape-5') and J("return document.querySelector('#ch-etape-5 .grue-num').textContent;") == '4')
    check('reco chargeurs 3', 'recommandée : 3' in texte('ch-reco-charg'))
    saisir('ch-chargeur', '3')
    check('envoi permis', J("return window.chariotManquant();") is False)
    cliquer('ch-aim-sf')
    L = lignes()
    print('     ', L)
    attendu = ['1300-0125 | Caméra sans fil ×3', 'AT0001 | Aimants (2 par caméra) ×6', '93625A250 | Écrous nylon M6 (2 par caméra) ×6',
               '1300-0101 | Moniteur 10 po', '1300-0240 | Batterie mobile 30 h ×6', '1300-0141 | Chargeur ×3']
    check('lignes attendues', L == attendu)
    ep = J("return epicorBlockText();")
    print('      Epicor :', repr(ep))
    check('Epicor : 1300-0125 3, AT0001 6', '1300-0125\t3' in ep and 'AT0001\t6' in ep)

    print('3. panier')
    etat = J("return etatEcran();")
    J("restaurerEtat(arguments[0]);", etat)
    time.sleep(1)
    L2 = lignes()
    print('     ', L2)
    check('etat restaure', L2 == attendu)

    print('4. exclusivite et changement de type')
    cliquer('cam-quad')
    check('Quad decoche Sans fil et ferme la fenetre', not J("return document.getElementById('cam-sansfil').checked;") and not vis('cam-chariot'))
    cliquer('cam-quad')
    cliquer('cam-sansfil')
    check('reouvert vide', vis('cam-chariot') and J("return document.getElementById('ch-sf-qte').value;") == '')
    J("selectType.value='__chariot__'; doTypeChange();")
    time.sleep(0.5)
    check('Chariot : case Sans fil cachee et decochee', not vis('cam-sansfil') and not J("return document.getElementById('cam-sansfil').checked;"))
    check('Chariot : fourches de retour', vis('ch-etape-1') and vis('ch-fourche-0126'))
    check('Chariot : titre chariot', J("return [].filter.call(document.querySelectorAll('#cam-chariot .cam-calc-titre span'), function(e){return e.offsetParent!==null;}).map(function(e){return e.textContent;}).join('');") == 'Caméra de chariot élévateur')
    J("selectType.value='Grue Mobile'; doTypeChange();")
    time.sleep(0.5)
    check('Grue Mobile : case Sans fil cachee', not vis('cam-sansfil'))

    print('5. anglais')
    J("selectType.value='__sans_machine__'; doTypeChange();")
    time.sleep(0.5)
    if not J("return document.getElementById('toggle-camera').classList.contains('open');"):
        J("document.querySelector('#toggle-camera .toggle-label').click();")
    J("if (typeof i18n !== 'undefined') { i18n.setLang('en'); }")
    time.sleep(0.5)
    check('case anglaise Wireless camera', 'Wireless camera' in J("return document.getElementById('cam-sansfil-lab').textContent;"))
    cliquer('cam-sansfil')
    saisir('ch-sf-qte', '2')
    check('statut WIRELESS', J("return document.querySelector('#toggle-camera .toggle-status').textContent;") == 'WIRELESS')

    sev = [l for l in dv.get_log('browser') if l['level'] == 'SEVERE' and ('127.0.0.1' in l['message'] or 'github.io' in l['message'])
           and 'favicon' not in l['message'] and 'script.google' not in l['message']]
    for l in sev:
        print('      ', l['message'][:200])
    check('aucune erreur JS SEVERE', not sev)
finally:
    dv.quit()

print('RESULTAT:', 'OK' if not fails else 'ECHEC (%d) : %s' % (len(fails), fails))
sys.exit(1 if fails else 0)
