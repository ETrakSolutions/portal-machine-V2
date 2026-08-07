# -*- coding: utf-8 -*-
"""Verifie les pages protegees par role apres le correctif i18n du 2026-08-07.

L audit precedent (selenium_audit_i18n_pages.py) ne voyait que l ecran de refus
sur export.html et machine-requests.html. Ici on simule une session
super_admin cote client pour que le VRAI contenu se construise, puis on
bascule la langue sans recharger et on cherche les chaines francaises restees
en place.

On collecte aussi les erreurs de console : node n etant pas installe sur ce
poste, c est le navigateur qui sert de controle de syntaxe des fichiers JS
modifies.
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
PORT = 8857
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

FAUX_USER = {"username": "audit_i18n", "role": "super_admin", "token": "AUDIT",
             "permissions": ["export", "machine_requests", "edit"]}

JS_PAIRES = """
var fr = window.TRANSLATIONS && window.TRANSLATIONS.fr || {};
var en = window.TRANSLATIONS && window.TRANSLATIONS.en || {};
var out = [];
for (var k in fr) {
  var a = fr[k], b = en[k];
  if (typeof a === 'string' && typeof b === 'string' && a !== b && a.length >= 12) out.push([k, a]);
}
return out;
"""

TOLERE = ('Balance', 'Scale Lite', 'Limiteur', 'e-Trak', 'GRYB', 'Portail')
PAGES = ['export.html', 'machine-requests.html', 'edit-machine.html', 'database.html']

resultats = {}
for page in PAGES:
    try:
        dv.get(BASE + '/' + page)
        dv.execute_script(
            "localStorage.setItem('portal_user', arguments[0]);"
            "localStorage.setItem('portal_lang','fr');", json.dumps(FAUX_USER))
        dv.get(BASE + '/' + page)
        WebDriverWait(dv, 90).until(
            lambda d: d.execute_script("return document.readyState") == 'complete')
        time.sleep(3.0)

        paires = dv.execute_script(JS_PAIRES) or []
        avant = dv.execute_script("return document.body.innerText || '';")

        # bascule EN : bouton s il existe, sinon appel direct du moteur
        btns = dv.find_elements(By.CSS_SELECTOR, '.lang-btn[data-lang="en"]')
        voie = 'bouton'
        if btns:
            dv.execute_script("arguments[0].click();", btns[0])
        else:
            voie = 'i18n.setLang (pas de bouton sur la page)'
            dv.execute_script(
                "localStorage.setItem('portal_lang','en');"
                "if (window.i18n && i18n.setLang) i18n.setLang('en');"
                "else window.dispatchEvent(new CustomEvent('langchange',{detail:{lang:'en'}}));")
        time.sleep(2.0)
        apres = dv.execute_script("return document.body.innerText || '';")

        restes = [(k, a) for k, a in paires
                  if a in apres and not any(x in a for x in TOLERE)]
        erreurs = [e['message'][:150] for e in dv.get_log('browser')
                   if e['level'] == 'SEVERE' and 'favicon' not in e['message']]
        resultats[page] = (restes, erreurs, voie, len(avant), len(apres))
        dire('%-24s bascule par %-38s FR restant : %d   erreurs JS : %d'
             % (page, voie, len(restes), len(erreurs)))
        for k, a in restes[:8]:
            dire('      %-30s %s' % (k, a[:64]))
        for e in erreurs[:4]:
            dire('      ERREUR JS  %s' % e)
    except Exception as e:
        resultats[page] = ('ERR', str(e)[:140], '', 0, 0)
        dire('%-24s ERREUR %s' % (page, str(e)[:100]))

dire('\n' + '=' * 72)
dire('SYNTHESE')
dire('=' * 72)
souci = False
for p, v in resultats.items():
    if v[0] == 'ERR':
        dire('  %-24s ERREUR : %s' % (p, v[1]))
        souci = True
        continue
    restes, erreurs = v[0], v[1]
    if restes or erreurs:
        souci = True
        dire('  %-24s %d chaine(s) FR, %d erreur(s) JS' % (p, len(restes), len(erreurs)))
    else:
        dire('  %-24s OK' % p)
dire('\n%s' % ('DES POINTS RESTENT A REGARDER' if souci else 'TOUT EST PROPRE'))

dv.quit()
httpd.shutdown()
