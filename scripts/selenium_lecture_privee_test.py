# -*- coding: utf-8 -*-
"""Pages du portail apres le correctif « lecture publique » (etape 2, 2026-10-06).

Verifie, AVANT toute mise en ligne et sans dependre du nouveau serveur :
  1. aucune page ne lit plus une cle protegee par le GET public
     (machine_requests, *_emails internes, db_changelog, user_active_*, inactivity_notice_*) ;
  2. ces lectures partent par l'action 'getprivate' AVEC le jeton de session ;
  3. les pages affichent quand meme les donnees (le faux serveur repond avec les
     vraies valeurs, lues sur le serveur actuel) ;
  4. l'INVITE (aucun jeton serveur) garde sa soumission : sales_emails et
     vendeurs_list se lisent toujours par le GET public, et la liste des
     representants se remplit ;
  5. aucune erreur JS SEVERE.

Le faux serveur est injecte dans la page (fetch intercepte, meme technique que
scripts/_prix_test.py) : 'getprivate' est servi a partir du GET actuel, 'whoami' et
'listusers' rendent un compte de test. Rien n'est ecrit sur le serveur.

Usage : python scripts/selenium_lecture_privee_test.py [--live]
        --live : pages servies par GitHub Pages (apres l'etape 2), sinon serveur local.
"""
import functools, http.server, json, os, socketserver, sys, threading, time
sys.stdout.reconfigure(encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8811
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
if '--live' in sys.argv:
    BASE = LIVE
else:
    class Muet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    H = functools.partial(Muet, directory=REPO)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    BASE = 'http://127.0.0.1:%d' % PORT

PRIVEES = ['machine_requests', 'machine_request_emails', 'notes_emails', 'target_emails',
           'kit_emails', 'db_changelog']
PREFIXES = ['user_active_', 'inactivity_notice_']

ADMIN = {'username': 'test.admin@e-trak.ca', 'email': 'test.admin@e-trak.ca', 'name': 'Test Admin',
         'role': 'administrateur', 'token': 'JETON-TEST-ADMIN',
         'permissions': {'modifBom': True, 'flagBom': True, 'writeNotes': True, 'modifAccounts': True,
                         'databaseAccess': True, 'soumissionAccess': True}}

STUB = r"""
(function () {
  var USER = %s, PRIVEES = %s, PREFIXES = %s, vrai = window.fetch.bind(window);
  window.__appels = [];
  function privee(k) {
    if (PRIVEES.indexOf(k) >= 0) return true;
    for (var i = 0; i < PREFIXES.length; i++) if (String(k).indexOf(PREFIXES[i]) === 0) return true;
    return false;
  }
  function rep(o) { return Promise.resolve(new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } })); }
  window.fetch = function (url, opts) {
    url = String(url);
    var body = opts && typeof opts.body === 'string' ? opts.body : '';
    var m = url.match(/[?&]action=get&key=([^&]*)/);
    if (m) {
      var k = decodeURIComponent(m[1]);
      window.__appels.push({ voie: 'GET', key: k, privee: privee(k) });
    }
    if (body) {
      var b = {}; try { b = JSON.parse(body); } catch (e) {}
      if (b.action === 'getprivate') {
        window.__appels.push({ voie: 'POST', key: b.key, jeton: b.token || b.pin || '' });
        // Faux serveur : sert la VRAIE valeur lue sur le serveur actuel (etape 1 non requise).
        return vrai(url.split('?')[0] + '?action=get&key=' + encodeURIComponent(b.key))
          .then(function (r) { return r.json(); })
          .then(function (d) { return rep(b.token ? { value: d.value || '' } : { error: 'authentication required' }); });
      }
      if (b.action === 'whoami') return rep({ ok: true, user: USER });
      if (b.action === 'listusers') return rep({ ok: true, users: [
        { username: USER.username, email: USER.email, name: USER.name, role: USER.role, active: true },
        { username: 'test.dealer@x.ca', email: 'test.dealer@x.ca', name: 'Test Dealer', role: 'dealer', active: true }] });
      if (b.action === 'save' || b.action === 'delete') return rep({ ok: true });   // jamais d'ecriture reelle
    }
    return vrai(url, opts);
  };
})();
"""

o = webdriver.ChromeOptions()
for a in ('--headless=new', '--window-size=1500,1200'):
    o.add_argument(a)
o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
fails = []


def check(lbl, ok):
    print('  [%s] %s' % ('OK' if ok else 'ECHEC', lbl))
    if not ok:
        fails.append(lbl)


def ouvrir(page, user, attendre):
    dv = webdriver.Chrome(options=o)
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument',
                       {'source': STUB % (json.dumps(user or {}), json.dumps(PRIVEES), json.dumps(PREFIXES))})
    dv.get(BASE + '/index.html?cb=%d' % time.time())   # meme origine pour localStorage
    if user:
        dv.execute_script("localStorage.setItem('portal_user', arguments[0]);", json.dumps(user))
    else:
        dv.execute_script("localStorage.removeItem('portal_user');")
    dv.get(BASE + '/' + page + ('&' if '?' in page else '?') + 'cb=%d' % time.time())
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(attendre))
    time.sleep(3)
    return dv


def bilan(dv, nom):
    ap = dv.execute_script('return window.__appels || [];')
    pub_priv = [a['key'] for a in ap if a['voie'] == 'GET' and a.get('privee')]
    sans_jeton = [a['key'] for a in ap if a['voie'] == 'POST' and not a.get('jeton')]
    check('%s : aucune lecture PUBLIQUE de cle protegee %s' % (nom, pub_priv or ''), not pub_priv)
    err = [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
           and 'favicon' not in l['message']]
    check('%s : aucune erreur JS SEVERE %s' % (nom, err[:2] or ''), not err)
    return ap, sans_jeton


try:
    print('--- 1) hub + Administration (admin) ---')
    dv = ouvrir('index.html', ADMIN, "return typeof showAdminSection === 'function';")
    dv.execute_script('showAdminSection();')
    time.sleep(5)
    ap, sj = bilan(dv, 'Administration')
    lus = sorted({a['key'] for a in ap if a['voie'] == 'POST'})
    print('     lectures getprivate :', lus)
    for k in ('kit_emails', 'notes_emails', 'machine_request_emails', 'machine_requests'):
        check('Administration : %s lu par getprivate' % k, k in lus)
    check('Administration : activite des usagers (user_active_) lue par getprivate',
          any(k.startswith('user_active_') for k in lus))
    check('Administration : toutes les lectures privees portent le jeton', not sj)
    pub = sorted({a['key'] for a in ap if a['voie'] == 'GET'})
    check('Administration : sales_emails et vendeurs_list restent en GET public',
          'sales_emails' in pub and 'vendeurs_list' in pub)
    dv.quit()

    print('--- 2) page des demandes de machines (admin) ---')
    dv = ouvrir('machine-requests.html', ADMIN, "return document.readyState === 'complete';")
    ap, sj = bilan(dv, 'Demandes')
    check('Demandes : machine_requests lu par getprivate avec jeton',
          any(a['voie'] == 'POST' and a['key'] == 'machine_requests' and a.get('jeton') for a in ap))
    dv.quit()

    print('--- 3) fiche machine et base de donnees (admin) ---')
    for page in ('machine.html', 'database.html'):
        dv = ouvrir(page, ADMIN, "return document.readyState === 'complete';")
        bilan(dv, page)
        dv.quit()

    print('--- 4) INVITE : soumission sans jeton serveur ---')
    dv = ouvrir('soumission.html', None, "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;")
    ap, sj = bilan(dv, 'Soumission invite')
    pub = sorted({a['key'] for a in ap if a['voie'] == 'GET'})
    check('Soumission invite : sales_emails lu en GET public', 'sales_emails' in pub)
    check('Soumission invite : vendeurs_list lu en GET public', 'vendeurs_list' in pub)
    nb = dv.execute_script("var s=document.getElementById('soumission-vendeur'); return s ? s.options.length : -1;")
    check('Soumission invite : liste des representants remplie (%d options)' % nb, nb > 1)
    dv.quit()
except Exception as e:
    import traceback
    traceback.print_exc()
    fails.append('exception : %r' % e)

print('RESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails:
    print('   -', f)
sys.exit(1 if fails else 0)
