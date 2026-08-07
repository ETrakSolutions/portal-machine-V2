# -*- coding: utf-8 -*-
"""Verifie le selecteur FR/EN ajoute a database.html et machine-requests.html.

Ces deux pages suivaient la langue choisie ailleurs mais n offraient aucun
bouton pour en changer (audit du 2026-08-07). On controle, pour chaque page :
  - les deux boutons existent, sont VISIBLES et cliquables (pas caches sous
    un autre element de l en-tete) ;
  - le bouton de la langue active porte la classe 'active' ;
  - un clic sur EN traduit reellement la page, et un clic sur FR la ramene ;
  - aucune erreur JavaScript.

Le clic est un vrai clic Selenium, pas un click() par script : c est le seul
moyen de detecter un bouton recouvert ou hors ecran.
"""
import sys, os, json, threading, http.server, socketserver, time, tempfile

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def dire(*a):
    print(*a)
    sys.stdout.flush()


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8863
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
dire('serveur local sur %s' % BASE)

opts = Options()
_prof = tempfile.mkdtemp(prefix='chromeprof_')
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
          '--window-size=1500,1200', '--user-data-dir=' + _prof,
          '--no-first-run', '--no-default-browser-check', '--disable-extensions']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
dv.set_page_load_timeout(180)

FAUX_USER = {"username": "audit_i18n", "role": "super_admin", "token": "AUDIT"}
PAGES = ['database.html', 'machine-requests.html']
# temoin sur : une cle presente sur les deux pages et differente en anglais
TEMOIN = 'common.retour'

fails = []
for page in PAGES:
    dire('\n' + '=' * 66)
    dire(page)
    dire('=' * 66)
    dv.get(BASE + '/' + page)
    dv.execute_script("localStorage.setItem('portal_user', arguments[0]);"
                      "localStorage.setItem('portal_lang','fr');", json.dumps(FAUX_USER))
    dv.get(BASE + '/' + page)
    WebDriverWait(dv, 90).until(
        lambda d: d.execute_script("return document.readyState") == 'complete')
    time.sleep(2.5)

    btn_fr = dv.find_elements(By.CSS_SELECTOR, '.lang-btn[data-lang="fr"]')
    btn_en = dv.find_elements(By.CSS_SELECTOR, '.lang-btn[data-lang="en"]')
    if not btn_fr or not btn_en:
        fails.append('%s : boutons FR/EN absents' % page)
        dire('  boutons absents')
        continue
    fr, en = btn_fr[0], btn_en[0]
    dire('  FR visible=%s  EN visible=%s' % (fr.is_displayed(), en.is_displayed()))
    if not (fr.is_displayed() and en.is_displayed()):
        fails.append('%s : boutons presents mais non visibles' % page)
    dire('  classe active au chargement FR : fr=%r en=%r'
         % ('active' in (fr.get_attribute('class') or ''),
            'active' in (en.get_attribute('class') or '')))
    if 'active' not in (fr.get_attribute('class') or ''):
        fails.append('%s : le bouton FR n est pas marque actif au chargement' % page)

    avant = dv.execute_script(
        "return (window.i18n && i18n.t) ? i18n.t(arguments[0]) : '';", TEMOIN)
    txt_avant = dv.execute_script("return document.body.innerText || '';")

    try:
        en.click()                      # vrai clic : detecte un bouton recouvert
    except Exception as e:
        fails.append('%s : clic EN impossible (%s)' % (page, type(e).__name__))
        dire('  clic EN IMPOSSIBLE : %s' % str(e)[:110])
        continue
    time.sleep(1.5)
    apres = dv.execute_script(
        "return (window.i18n && i18n.t) ? i18n.t(arguments[0]) : '';", TEMOIN)
    txt_apres = dv.execute_script("return document.body.innerText || '';")
    lang = dv.execute_script("return localStorage.getItem('portal_lang');")
    dire('  apres clic EN : portal_lang=%r  temoin %r -> %r' % (lang, avant, apres))
    if lang != 'en':
        fails.append('%s : le clic EN ne change pas la langue stockee' % page)
    if txt_apres == txt_avant:
        fails.append('%s : le texte de la page n a pas change apres clic EN' % page)
    if 'active' not in (en.get_attribute('class') or ''):
        fails.append('%s : le bouton EN ne devient pas actif' % page)

    fr.click()                          # retour au francais
    time.sleep(1.2)
    lang2 = dv.execute_script("return localStorage.getItem('portal_lang');")
    dire('  retour FR : portal_lang=%r' % lang2)
    if lang2 != 'fr':
        fails.append('%s : le retour au francais ne fonctionne pas' % page)

    err = [e['message'][:140] for e in dv.get_log('browser')
           if e['level'] == 'SEVERE' and 'favicon' not in e['message']]
    dire('  erreurs JS : %d' % len(err))
    for e in err[:3]:
        dire('     %s' % e)
    if err:
        fails.append('%s : %d erreur(s) JS' % (page, len(err)))

dire('\n' + '=' * 66)
if fails:
    dire('ECHEC')
    for f in fails:
        dire('  - %s' % f)
else:
    dire('OK — selecteur de langue fonctionnel sur les deux pages')
dire('=' * 66)

dv.quit()
httpd.shutdown()
