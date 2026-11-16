"""Tuiles tranchees par le serveur : affichage immediat depuis la memoire (2026-11-16).

Preparation des jobs, Reinstallation et Routes vendeurs attendaient chacune un aller-retour
Apps Script (2 a 5 s) avant de paraitre. admin.js montre maintenant la derniere reponse du
serveur pour CE compte (localStorage portal_tuiles_srv), puis la reponse fraiche confirme
ou retire la tuile.

Le faux jeton de test fait refuser les trois demandes par le vrai serveur ; on verifie :
  1. memoire « oui » : les trois tuiles visibles a moins de 1 s ;
  2. refus du serveur : tuiles retirees et memoire remise a « non » ;
  3. memoire d'un autre compte : ignoree ;
  4. sans memoire : aucune tuile au depart (comportement d'avant).

    py -3.13 scripts/selenium_tuiles_memoire_test.py [--live]
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8798
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)

USER = {'username': 't@e', 'email': 't@e', 'name': 'Test Claude', 'role': 'super_admin',
        'token': 'TEST-SELENIUM', 'consentVersion': 99}
STUB = """
(function () {
  var USER = %s, vrai = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var body = opts && typeof opts.body === 'string' ? opts.body : '';
    if (body.indexOf('"action":"whoami"') >= 0)
      return Promise.resolve(new Response(JSON.stringify({ ok: true, user: USER }), { headers: { 'Content-Type': 'application/json' } }));
    return vrai(url, opts);
  };
})();
""" % json.dumps(USER)
TUILES = ['hub-tile-prepjobs', 'hub-tile-reinst', 'hub-tile-routes']

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1300,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': STUB})
J = dv.execute_script
fails = []


def check(label, cond, detail=None):
    print(('  [OK] ' if cond else '  [X ] ') + label + ('' if cond or detail is None else '  -> %r' % (detail,)))
    if not cond:
        fails.append(label)


def visibles():
    return J("return arguments[0].filter(function(i){var e=document.getElementById(i); return e && e.style.display==='block';});", TUILES)


def charger(memoire):
    dv.get(BASE + '/index.html')
    J("localStorage.setItem('portal_user', arguments[0]);", json.dumps(USER))
    if memoire is None:
        J("localStorage.removeItem('portal_tuiles_srv');")
    else:
        J("localStorage.setItem('portal_tuiles_srv', arguments[0]);", json.dumps(memoire))
    t0 = time.time()
    dv.get(BASE + '/index.html')
    WebDriverWait(dv, 20).until(lambda d: d.execute_script("return document.readyState==='complete';"))
    return t0


try:
    print('1. memoire « oui » : tuiles tout de suite')
    t0 = charger({'u': 't@e', 'pj': True, 'ri': True, 'rv': True, 'pjN': 3})
    v = visibles()
    dt = time.time() - t0
    check('3 tuiles visibles au chargement (%.2f s)' % dt, len(v) == 3 and dt < 3, v)
    check('badge Prep. jobs depuis la memoire', '3' in J("return document.getElementById('hub-tile-prepjobs-desc').textContent;"))

    print('2. le serveur refuse le faux jeton : tuiles retirees, memoire a jour')
    try:
        WebDriverWait(dv, 40).until(lambda d: len(visibles()) == 0)
    except Exception:
        pass
    check('tuiles retirees apres refus du serveur', visibles() == [], visibles())
    mem = J("return JSON.parse(localStorage.getItem('portal_tuiles_srv')||'{}');")
    check('memoire remise a non', mem.get('pj') is False and mem.get('ri') is False and mem.get('rv') is False, mem)
    check('badge remis au texte normal', '3' not in J("return document.getElementById('hub-tile-prepjobs-desc').textContent;"))

    print('3. memoire d\'un autre compte : ignoree')
    charger({'u': 'autre@x', 'pj': True, 'ri': True, 'rv': True})
    check('aucune tuile au depart', visibles() == [], visibles())

    print('4. sans memoire : aucune tuile au depart')
    charger(None)
    check('aucune tuile au depart', visibles() == [], visibles())
finally:
    dv.quit()

print()
print('ECHECS : %d' % len(fails) if fails else 'TOUT PASSE')
for f in fails:
    print('  -', f)
sys.exit(1 if fails else 0)
