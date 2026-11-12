# -*- coding: utf-8 -*-
"""Soumission : caméra de grue, choix en cascade (Steve, 2026-11-11). APERÇU.

Verifie :
  1. compte hors apercu : la case Grue reste cachee ;
  2. compte apercu, sans machine : cocher Grue ouvre la fenetre, statut GRUE, etape 1
     (1300-0225 inclus) et etape 2 (moniteurs) visibles, etapes 3-5 cachees, prix affiches
     avant tout choix (« Prix a venir » si absent de la liste) ;
  3. la quantite generale est cachee ; le tableau montre 1300-0225, total « a valider » ;
  4. cascade : moniteur -> etape 3 ; pedale -> etape 4 ; batterie -> etape 5 ;
  5. lignes : 1300-0225, 1300-0101, 1300-0230, 1300-0240 x2, 1300-0141 ; bloc Epicor ;
  6. avec les 6 prix : total = somme exacte (quantites comprises) ;
  7. envoi bloque tant qu'un choix manque (grueManquant) ;
  8. cocher Recul decoche Grue et vide ses choix ; « Autre machine » : pas de case Grue ;
  9. panier : etat restaure (moniteur, pedale, quantites) ;
 10. anglais ; aucune erreur JS SEVERE.

    py -3.12 scripts/selenium_camera_grue_test.py [--live]
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8793
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
VIS = "var e=document.getElementById(arguments[0]); return !!e && e.offsetParent !== null;"


def vis(i):
    return J(VIS, i)


def cliquer(i):
    J("document.getElementById(arguments[0]).click();", i)
    time.sleep(0.2)


def saisir(i, v):
    J("var e=document.getElementById(arguments[0]); e.value=arguments[1];"
      "e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));", i, v)
    time.sleep(0.2)


def lignes():
    return J("return (window.__selectionRows||[]).map(function(r){return r.code+' | '+r.name;});")


def tableau():
    return J("return document.getElementById('selected-options-list').innerText;")


def sans_machine(apercu=True):
    dv.get(BASE + '/soumission.html')
    J(SESSION_TEST_JS)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0 && !!window.grueLignes;"))
    if apercu:
        J("APERCU_COMPTES.push('t@e'); var v=selectType.value; while (selectType.options.length > 1) selectType.remove(1);"
          " populateTypes(); selectType.value=v;")
    # Grue mobile (Steve, 2026-11-12) : la camera de grue y vit maintenant, plus en « Autre machine ».
    J("selectType.value='Grue Mobile'; doTypeChange();"
      "selectFabricant.value=Object.keys(machinesData['Grue Mobile']).filter(function(f){return f.charAt(0)!=='_';})[0]; doFabChange();"
      "var a=[].slice.call(selectAnnee.options).map(function(o){return o.value;}).filter(Boolean); selectAnnee.value=a[a.length-1];"
      "selectAnnee.dispatchEvent(new Event('change',{bubbles:true}));")
    time.sleep(0.5)
    J("var m=[].slice.call(selectModele.options).map(function(o){return o.value;}).filter(Boolean); selectModele.value=m[0];"
      "selectModele.dispatchEvent(new Event('change',{bubbles:true}));")
    time.sleep(1)
    camb = J("return document.getElementById('toggle-camera').classList.contains('open');")
    if not camb:
        J("var b=document.getElementById('toggle-camera'); b.querySelector('.toggle-label').click();")
    time.sleep(0.3)


try:
    print('1. compte hors apercu')
    sans_machine(apercu=False)
    check('case Grue cachee', not vis('cam-equip-grue'))

    print('2. apercu : cocher Grue')
    sans_machine()
    check('case Grue visible', vis('cam-equip-grue'))
    cliquer('cam-equip-grue')
    check('fenetre grue visible', vis('cam-grue'))
    check('statut GRUE', J("return document.querySelector('#toggle-camera .toggle-status').textContent;") == 'GRUE')
    check('etape 1 et 2 visibles', vis('grue-etape-1') and vis('grue-etape-2'))
    check('etapes 3-5 cachees', not vis('grue-etape-3') and not vis('grue-etape-4') and not vis('grue-etape-5'))
    prix = J("var o={}; document.querySelectorAll('#cam-grue .grue-prix').forEach(function(e){o[e.dataset.code]=e.textContent;}); return o;")
    print('     prix affiches :', prix)
    check('prix de chaque code rempli (montant ou « Prix a venir »)', all(v.strip() for v in prix.values()) and len(prix) == 6)

    print('3. quantite generale, tableau')
    check('quantite generale cachee', not vis('cam-qte-box'))
    check('ligne 1300-0225 au tableau', any(l.startswith('1300-0225') for l in lignes()))
    check('note « a venir » cachee pour la grue', not vis('cam-equip-note'))

    print('4. cascade')
    cliquer('grue-mon-10')
    check('etape 3 visible apres moniteur', vis('grue-etape-3') and not vis('grue-etape-4'))
    cliquer('grue-pedale-oui')
    check('etape 4 visible apres pedale', vis('grue-etape-4') and not vis('grue-etape-5'))
    saisir('grue-batterie', '2')
    check('etape 5 visible apres batterie', vis('grue-etape-5'))
    check('envoi bloque sans chargeur', J("return window.grueManquant();") is True)
    saisir('grue-chargeur', '1')
    check('envoi permis', J("return window.grueManquant();") is False)

    print('5. lignes')
    L = lignes()
    print('     ', L)
    attendu = ['1300-0225 | Caméra de grue', '1300-0101 | Moniteur 10 po', '1300-0230 | Pédale de contrôle du zoom',
               '1300-0240 | Batterie mobile ×2', '1300-0141 | Chargeur']
    check('lignes attendues', L == attendu)
    ep = J("return epicorBlockText();")
    print('      Epicor :', repr(ep))
    check('Epicor : batterie qte 2', '1300-0240\t2' in ep and '1300-0225\t1' in ep)

    print('6. total avec les 6 prix')
    J("['1300-0225','1300-0100','1300-0101','1300-0230','1300-0240','1300-0141'].forEach(function(c,i){"
      " priceData[c]={item:[1000,483.94,619.88,150,80,17.94][i],install:null}; }); updateSelectedSummary();")
    time.sleep(0.3)
    tot = J("var t=0; lignesFacturables().forEach(function(l){ if(typeof l.montant==='number') t+=l.montant; }); return Math.round(t*100)/100;")
    check('total = 1000 + 619,88 + 150 + 2x80 + 17,94 = 1947,82 (%s)' % tot, tot == 1947.82)
    check('tableau affiche le total', '1 947,82' in tableau().replace(' ', ' ').replace('\xa0', ' '))
    check('prix moniteur 7 affiche avant choix', '483,94' in J("return document.querySelector('.grue-prix[data-code=\"1300-0100\"]').textContent;"))
    check('batterie : prix « / unite »', 'unité' in J("return document.querySelector('.grue-prix[data-code=\"1300-0240\"]').textContent;"))
    J("delete priceData['1300-0230']; updateSelectedSummary();")
    check('code sans prix -> « Prix a venir »', 'Prix à venir' in J("return document.querySelector('.grue-prix[data-code=\"1300-0230\"]').textContent;"))
    check('code sans prix -> total a valider', not J("return lignesFacturables().every(function(l){return !l.prixAValider;});"))
    J("priceData['1300-0230']={item:150,install:null}; updateSelectedSummary();")

    print('9. panier')
    etat = J("return etatEcran();")
    J("restaurerEtat(arguments[0]);", etat)
    time.sleep(1)
    J("APERCU_COMPTES.push('t@e'); majCamEquip(selectType.value);")
    J("restaurerEtat(arguments[0]);", etat)
    time.sleep(1)
    L2 = lignes()
    print('      ', L2)
    check('etat restaure', L2 == attendu)

    print('8. exclusivite')
    cliquer('cam-recul')
    check('Recul decoche Grue', not J("return document.getElementById('cam-equip-grue').checked;"))
    check('fenetre grue cachee', not vis('cam-grue'))
    check('choix vides', J("return !document.getElementById('grue-mon-10').checked && document.getElementById('grue-batterie').value==='';"))
    check('ligne recul seule', [l.split(' | ')[0] for l in lignes()] == ['1300-0001'])
    cliquer('cam-equip-grue')
    check('Grue decoche Recul', not J("return document.getElementById('cam-recul').checked;"))
    J("selectType.value='__sans_machine__'; doTypeChange();")
    time.sleep(0.5)
    check('« Autre machine » : pas de case Grue', not vis('cam-equip-grue-lab'))
    check('« Autre machine » : nom du type', J("return selectType.options[selectType.selectedIndex].textContent;") == 'Autre machine')
    sans_machine()
    cliquer('cam-recul')

    print('10. anglais')
    cliquer('cam-equip-grue')
    J("i18n.setLang && i18n.setLang('en');")
    time.sleep(0.5)
    titre = J("return document.querySelector('#cam-grue .cam-calc-titre').textContent;")
    check('titre anglais (%s)' % titre, titre == 'Crane camera')
    J("i18n.setLang && i18n.setLang('fr');")

    sev = [l for l in dv.get_log('browser') if l['level'] == 'SEVERE' and 'favicon' not in l['message']]
    for s in sev:
        print('     SEVERE :', s['message'][:200])
    check('aucune erreur JS SEVERE', not sev)
finally:
    dv.quit()

print('RESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
