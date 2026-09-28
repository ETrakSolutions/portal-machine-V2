# -*- coding: utf-8 -*-
"""Prix reserves aux vrais comptes (decision de Jacquot, 2026-09-25).

Verifie :
  1. data/prices.json n'est plus servi par le site (404) ;
  2. invite du code QR (?guest=1) : il ouvre la Soumission et choisit sa machine,
     mais ne recoit AUCUN prix — pas de colonne Prix, aucun « $ » dans le tableau,
     aucune demande 'getprices' envoyee, et la mention « compte obtenu par votre
     representant » est affichee (FR puis EN) ;
  3. la question « Installation par e-Trak ? » lui est quand meme posee (codes publics
     sans montants, data/price-codes.json) ;
  4. vrai compte (serveur simule, scripts/_prix_test.py) : colonne Prix, montants
     egaux a la liste maitresse, pas de mention ;
  5. aucune erreur JS SEVERE.

    py -3.13 scripts/selenium_prix_invite_test.py          # clone local
    py -3.13 scripts/selenium_prix_invite_test.py --live   # site en ligne
"""
import sys, io, os, json, threading, http.server, socketserver, time, urllib.request, urllib.error
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import PRIX, installer_prix, SESSION_TEST_JS   # noqa: E402

PORT = 8798
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


def navigateur(avec_serveur_simule):
    opts = Options()
    for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
        opts.add_argument(a)
    opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    dv = webdriver.Chrome(options=opts)
    if avec_serveur_simule:
        installer_prix(dv)
    else:
        # Espion : compte les demandes 'getprices' sans y repondre.
        dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': """
          window.__getprices = 0; var vrai = window.fetch.bind(window);
          window.fetch = function (u, o) {
            if (o && typeof o.body === 'string' && o.body.indexOf('"action":"getprices"') >= 0) window.__getprices++;
            return vrai(u, o);
          };"""})
    return dv


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir_machine(dv):
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '320'), ('select-annee', '2024')):
        fin = time.time() + 25
        while time.time() < fin and not dv.execute_script(CHOISIR, sid, val):
            time.sleep(0.3)
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(1.5)


TABLEAU = """
var t = document.querySelector('#selected-options-list table');
if (!t) return null;
return { th: Array.from(t.querySelectorAll('thead th')).map(function(e){return e.textContent.trim();}),
         texte: t.textContent,
         lignes: Array.from(t.querySelectorAll('tbody tr')).map(function(tr){
            return Array.from(tr.querySelectorAll('td')).map(function(td){return td.textContent.trim();}); }),
         mention: (document.querySelector('.prix-compte-requis') || {}).textContent || '' };
"""


def erreurs_js(dv):
    return [l['message'] for l in dv.get_log('browser')
            if l['level'] == 'SEVERE' and 'version.json' not in l['message']
            and 'favicon' not in l['message']]


# ---------------------------------------------------------------- 1
print('--- 1) data/prices.json n est plus servi ---')
try:
    code = urllib.request.urlopen(BASE + '/data/prices.json?cb=%d' % time.time(), timeout=30).status
except urllib.error.HTTPError as e:
    code = e.code
check('data/prices.json -> HTTP %s (attendu 404)' % code, code == 404)

# ---------------------------------------------------------------- 2, 3
print('--- 2) invite du code QR : Soumission ouverte, aucun prix ---')
dv = navigateur(avec_serveur_simule=False)
try:
    dv.get(BASE + '/index.html?guest=1')
    time.sleep(2)
    u = dv.execute_script("return JSON.parse(localStorage.getItem('portal_user')||'null');")
    check('session invite creee', bool(u and u.get('isGuest')))
    dv.get(BASE + '/soumission.html')
    choisir_machine(dv)
    t = dv.execute_script(TABLEAU)
    check('le tableau de la selection est affiche', t is not None and len(t['lignes']) > 0)
    if t:
        prix_lbl = dv.execute_script("return i18n.t('soum.tbl_price');")
        check('pas de colonne Prix (%s)' % t['th'], prix_lbl not in t['th'])
        check('aucun « $ » dans le tableau', '$' not in t['texte'])
        check('une seule cellule par ligne (le libelle)', all(len(l) <= 1 for l in t['lignes']))
        attendu_fr = dv.execute_script("return i18n.t('soum.prices_need_account');")
        check('mention FR affichee : « %s »' % t['mention'].strip(), t['mention'].strip() == attendu_fr)
    check('aucun prix dans la page (priceData vide)', dv.execute_script("return Object.keys(priceData).length;") == 0)
    check('aucune demande getprices envoyee', dv.execute_script("return window.__getprices;") == 0)
    check('montants de toutes les lignes facturables = null', dv.execute_script(
        "return lignesFacturables().every(function(l){ return l.montant === null || l.montant === undefined; });"))
    print('--- 3) la question d installation est quand meme posee ---')
    check('question « Installation par e-Trak ? » visible', dv.execute_script(
        "var e=document.getElementById('install-question-box'); return !!e && getComputedStyle(e).display !== 'none';"))
    dv.execute_script("i18n.setLang('en');")
    time.sleep(0.8)
    dv.execute_script("updateSelectedSummary();")
    t = dv.execute_script(TABLEAU)
    check('mention EN : « %s »' % (t['mention'].strip() if t else ''),
          bool(t) and 'representative' in t['mention'])
    dv.execute_script("i18n.setLang('fr');")
    e = erreurs_js(dv)
    check('aucune erreur JS SEVERE (%d)' % len(e), not e)
    for m in e[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

# ---------------------------------------------------------------- 4
print('--- 4) vrai compte : les prix de la liste maitresse ---')
dv = navigateur(avec_serveur_simule=True)
try:
    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION_TEST_JS)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return typeof priceData !== 'undefined' && Object.keys(priceData).length > 0;"))
    choisir_machine(dv)
    t = dv.execute_script(TABLEAU)
    prix_lbl = dv.execute_script("return i18n.t('soum.tbl_price');")
    check('colonne Prix presente', bool(t) and prix_lbl in t['th'])
    check('des montants en $ sont affiches', bool(t) and '$' in t['texte'])
    check('pas de mention de compte', bool(t) and not t['mention'].strip())
    check('priceData = liste maitresse (%d codes)' % len(PRIX), dv.execute_script(
        "return JSON.stringify(priceData);") == json.dumps(PRIX, separators=(',', ':'), ensure_ascii=False))
    e = erreurs_js(dv)
    check('aucune erreur JS SEVERE (%d)' % len(e), not e)
    for m in e[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
