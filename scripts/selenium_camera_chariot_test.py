# -*- coding: utf-8 -*-
"""Soumission : caméra de chariot élévateur, choix en cascade (Steve, 2026-11-12). APERÇU.

Verifie :
  1. compte hors apercu : la case Chariot reste cachee ;
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
PORT = 8794
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
        J("APERCU_COMPTES.push('t@e');")
    J("var s=document.getElementById('select-type'); s.value='__sans_machine__';"
      "s.dispatchEvent(new Event('change',{bubbles:true}));")
    time.sleep(1)
    if not J("return document.getElementById('toggle-camera').classList.contains('open');"):
        J("document.querySelector('#toggle-camera .toggle-label').click();")
    time.sleep(0.3)


try:
    print('1. compte hors apercu')
    sans_machine(apercu=False)
    check('case Chariot cachee', not vis('cam-equip-chariot'))

    print('2. apercu : cocher Chariot')
    sans_machine()
    cliquer('cam-equip-chariot')
    check('fenetre chariot visible', vis('cam-chariot'))
    check('fenetre grue cachee', not vis('cam-grue'))
    check('note « a venir » cachee', not vis('cam-equip-note'))
    check('statut CHARIOT', J("return document.querySelector('#toggle-camera .toggle-status').textContent;") == 'CHARIOT')
    check('etape 1 seule visible', vis('ch-etape-1') and not vis('ch-etape-2') and not vis('ch-etape-5'))
    prix = J("var o={}; document.querySelectorAll('#cam-chariot .grue-prix').forEach(function(e){o[e.dataset.code]=e.textContent;}); return o;")
    print('     prix affiches :', prix)
    check('prix de chaque code rempli (montant ou « Prix a venir »)', all(v.strip() for v in prix.values()) and len(prix) == 8)
    check('quantite generale cachee', not vis('cam-qte-box'))

    print('3. cascade')
    cliquer('ch-fourche-0126')
    check('etape 2 visible apres fourche', vis('ch-etape-2') and not vis('ch-etape-3'))
    cliquer('ch-cab-avant'); cliquer('ch-cab-arriere')
    check('etape 3 visible apres cabine', vis('ch-etape-3') and not vis('ch-etape-4'))
    cliquer('ch-mon-7')
    check('etape 4 visible apres moniteur', vis('ch-etape-4') and not vis('ch-etape-5'))

    print('4. recommandations (3 cameras)')
    check('batteries : 6 au total', '6 au total' in texte('ch-reco-batt'))
    check('chargeurs : 3', 'recommandée : 3' in texte('ch-reco-charg'))
    saisir('ch-batt-10', '6')
    check('etape 5 visible apres batteries', vis('ch-etape-5'))
    check('envoi bloque sans chargeur', J("return window.chariotManquant();") is True)
    saisir('ch-chargeur', '3')
    check('envoi permis', J("return window.chariotManquant();") is False)

    print('6. lignes')
    L = lignes()
    print('     ', L)
    attendu = ['1300-0126 | Caméra sur la fourche', '1300-0125 | Caméra sur la cabine (avant + arrière) ×2',
               '1300-0100 | Moniteur 7 po', '1300-0140 | Batterie mobile 10 h ×6', '1300-0141 | Chargeur ×3']
    check('lignes attendues', L == attendu)
    ep = J("return epicorBlockText();")
    print('      Epicor :', repr(ep))
    check('Epicor : quantites', '1300-0125\t2' in ep and '1300-0140\t6' in ep and '1300-0141\t3' in ep and '1300-0126\t1' in ep)

    print('   rack + cabine arriere seulement + 30 h')
    cliquer('ch-fourche-0127'); cliquer('ch-cab-avant'); saisir('ch-batt-10', ''); saisir('ch-batt-30', '4')
    check('reco batteries 4 (2 cameras)', '4 au total' in texte('ch-reco-batt'))
    L = lignes()
    print('     ', L)
    check('lignes rack', L[:2] == ['1300-0127 | Caméra sur le rack entre les fourches', '1300-0125 | Caméra sur la cabine (arrière)']
          and '1300-0240 | Batterie mobile 30 h ×4' in L)

    print('5. aucune camera')
    cliquer('ch-fourche-aucune'); cliquer('ch-cab-aucune')
    check('« Pas de camera » cabine decoche Arriere', not J("return document.getElementById('ch-cab-arriere').checked;"))
    check('envoi bloque : aucune camera', J("return window.chariotManquant();") is True)
    check('message « au moins une camera »', 'au moins une caméra' in texte('ch-msg'))
    cliquer('ch-cab-avant')
    check('Avant decoche « Pas de camera »', not J("return document.getElementById('ch-cab-aucune').checked;"))
    check('envoi permis avec 1 camera', J("return window.chariotManquant();") is False)

    print('7. panier')
    etat = J("return etatEcran();")
    J("restaurerEtat(arguments[0]);", etat)
    time.sleep(1)
    J("APERCU_COMPTES.push('t@e'); majCamEquip(true);")
    J("restaurerEtat(arguments[0]);", etat)
    time.sleep(1)
    L2 = lignes()
    print('      ', L2)
    check('etat restaure', any(l.startswith('1300-0125') for l in L2) and vis('cam-chariot'))

    print('8. exclusivite')
    cliquer('cam-equip-grue')
    check('Grue decoche Chariot et cache sa fenetre', not J("return document.getElementById('cam-equip-chariot').checked;") and not vis('cam-chariot'))
    check('fenetre grue visible', vis('cam-grue'))
    cliquer('cam-equip-chariot')
    check('Chariot : choix vides', not J("return !!document.querySelector('input[name=\"ch-fourche\"]:checked');"))
    cliquer('cam-recul')
    check('Recul decoche Chariot', not J("return document.getElementById('cam-equip-chariot').checked;") and not vis('cam-chariot'))
    check('ligne recul seule', all(not l.startswith('1300-01') for l in lignes()))

    print('9. anglais')
    J("if (typeof i18n !== 'undefined') { i18n.setLang('en'); }")
    time.sleep(0.5)
    cliquer('cam-equip-chariot')
    check('titre anglais (Forklift camera)', 'Forklift camera' in J("return document.querySelector('#cam-chariot .cam-calc-titre').textContent;"))

    sev = [l for l in dv.get_log('browser') if l['level'] == 'SEVERE' and ('127.0.0.1' in l['message'] or 'github.io' in l['message'])
           and 'favicon' not in l['message'] and 'script.google' not in l['message']]
    for l in sev:
        print('      ', l['message'][:200])
    check('aucune erreur JS SEVERE', not sev)
finally:
    dv.quit()

print('RESULTAT:', 'OK' if not fails else 'ECHEC (%d) : %s' % (len(fails), fails))
sys.exit(1 if fails else 0)
