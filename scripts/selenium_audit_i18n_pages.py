# -*- coding: utf-8 -*-
"""Audit generique : quelles pages gardent du francais apres bascule en anglais ?

Methode : on charge la page en FR, on bascule en EN sans recharger, puis on
cherche dans le texte visible les valeurs du dictionnaire FRANCAIS dont la
traduction anglaise differe. Toute occurrence = contenu non retraduit.

C est la signature du defaut trouve le 2026-08-06 sur le panneau « ? » de la
soumission : un contenu construit en JS n a pas d attribut data-i18n, donc
translatePage() l ignore, et il faut un reabonnement explicite a l evenement
langchange.

Exceptions attendues (a ne PAS corriger) : le texte venant de la base de
donnees est monolingue par conception — libelles de produits `_bom_labels`,
notes techniques, avertissements. Ils sont filtres par la liste TOLERE.
"""
import sys, os, json, threading, http.server, socketserver, time, re, tempfile

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def dire(*a):
    print(*a)
    sys.stdout.flush()


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8851
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
dv = webdriver.Chrome(options=opts)
dv.set_page_load_timeout(180)

PAGES = ['index.html', 'soumission.html', 'machine.html', 'database.html',
         'export.html', 'machine-requests.html', 'edit-machine.html', 'price-list.html']

# chaines qui viennent de la BD ou qui sont volontairement identiques
TOLERE = ('Balance', 'Scale Lite', 'Limiteur', 'e-Trak', 'GRYB', 'Portail')

JS_PAIRES = """
var fr = window.TRANSLATIONS && window.TRANSLATIONS.fr || {};
var en = window.TRANSLATIONS && window.TRANSLATIONS.en || {};
var out = [];
for (var k in fr) {
  var a = fr[k], b = en[k];
  if (typeof a === 'string' && typeof b === 'string' && a !== b && a.length >= 12) {
    out.push([k, a, b]);
  }
}
return out;
"""

rapport = {}
for page in PAGES:
    try:
        dv.get(BASE + '/' + page)
        WebDriverWait(dv, 60).until(
            lambda d: d.execute_script("return document.readyState") == 'complete')
        # partir du francais
        dv.execute_script("localStorage.setItem('portal_lang','fr');")
        dv.refresh()
        WebDriverWait(dv, 60).until(
            lambda d: d.execute_script("return document.readyState") == 'complete')
        time.sleep(2.0)
        paires = dv.execute_script(JS_PAIRES) or []
        # bascule EN sans recharger, exactement comme un utilisateur
        btns = dv.find_elements(By.CSS_SELECTOR, '.lang-btn[data-lang="en"]')
        if not btns:
            rapport[page] = ('—', 'pas de selecteur de langue sur cette page')
            dire('%-24s pas de selecteur de langue' % page)
            continue
        dv.execute_script("arguments[0].click();", btns[0])
        time.sleep(1.5)
        txt = dv.execute_script("return document.body.innerText || '';")
        restes = []
        for k, a, b in paires:
            if a in txt and not any(t in a for t in TOLERE):
                restes.append((k, a[:60]))
        rapport[page] = (len(restes), restes)
        dire('%-24s %d chaine(s) FR restante(s) apres bascule EN' % (page, len(restes)))
        for k, a in restes[:6]:
            dire('      %-32s %s' % (k, a))
    except Exception as e:
        rapport[page] = ('ERR', '%s: %s' % (type(e).__name__, str(e)[:120]))
        dire('%-24s ERREUR %s' % (page, str(e)[:90]))

dire('\n' + '=' * 70)
dire('SYNTHESE')
dire('=' * 70)
for p, v in rapport.items():
    n = v[0]
    if n == 0:
        dire('  %-24s OK' % p)
    elif n == '—':
        dire('  %-24s %s' % (p, v[1]))
    elif n == 'ERR':
        dire('  %-24s %s' % (p, v[1]))
    else:
        dire('  %-24s %d chaine(s) non retraduite(s)' % (p, n))

dv.quit()
httpd.shutdown()
