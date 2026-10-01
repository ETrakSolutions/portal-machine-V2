# -*- coding: utf-8 -*-
"""Ecran « Premiere connexion ou mot de passe oublie ? » (page d'accueil).

Serveur simule (fetch remplace) ; clics reels.
  1. le lien est sous « Se connecter » et ouvre la fenetre, courriel pre-rempli
  2. etape 1 : courriel invalide refuse ; 'resetrequest' envoye avec la langue
  3. etape 2 : message « si un compte existe » ; code invalide -> message ; bon code -> connecte
  4. le mot de passe temporaire marche toujours (connexion normale + changement force)
  5. en anglais : libelles traduits
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8813
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

CLIENT = {'username': 'client@napa.ca', 'email': 'client@napa.ca', 'name': 'Client Napa', 'role': 'dealer',
          'consentVersion': 99, 'vendeurEmail': 'v@x.ca'}
STUB = """
(function () {
  var C = %s, vrai = window.fetch.bind(window);
  window.__appels = [];
  window.fetch = function (url, opts) {
    var b = opts && typeof opts.body === 'string' ? opts.body : '', rep = null, j = null;
    try { j = JSON.parse(b); } catch (e) {}
    if (j && j.action) window.__appels.push(j);
    if (j && j.action === 'resetrequest') rep = { ok: true };
    else if (j && j.action === 'resetconfirm') rep = j.code === '123456' ? { ok: true, token: 'TOK', user: C } : { error: 'invalid code' };
    else if (j && j.action === 'login') rep = j.password === 'TEMP123' ? { ok: true, token: 'TOK', user: Object.assign({ mustChangePassword: true }, C) } : { error: 'invalid credentials' };
    else if (j && j.action === 'whoami') rep = { ok: true, user: C };
    else if (String(url).indexOf('action=get') >= 0) rep = { value: '' };
    if (rep) return Promise.resolve(new Response(JSON.stringify(rep), { headers: { 'Content-Type': 'application/json' } }));
    return vrai(url, opts);
  };
})();
"""

ok = ko = 0


def check(nom, cond, detail=''):
    global ok, ko
    if cond:
        ok += 1
    else:
        ko += 1
    print('  [%s] %s%s' % ('OK' if cond else 'X ', nom, ('  — ' + str(detail)) if detail and not cond else ''))


def ouvrir(lang='fr'):
    o = Options()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1300,900')
    o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    dv = webdriver.Chrome(options=o)
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': STUB % json.dumps(CLIENT)})
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.clear(); localStorage.setItem('portal_lang', arguments[0]);", lang)
    dv.get(BASE + '/index.html')
    time.sleep(3)
    return dv


def val(dv, i, v):
    dv.execute_script("var e=document.getElementById(arguments[0]); e.value=arguments[1];", i, v)


def clic(dv, i):
    dv.find_element(By.ID, i).click()
    time.sleep(1)


def txt(dv, i):
    return dv.execute_script("var e=document.getElementById(arguments[0]); return e ? e.textContent : null;", i)


def visible(dv, i):
    # getComputedStyle : offsetParent est toujours null pour un element en position fixe (les fenetres)
    return dv.execute_script("var e=document.getElementById(arguments[0]); if(!e) return false;"
                             " for(var n=e;n&&n.nodeType===1;n=n.parentElement){var c=getComputedStyle(n);"
                             " if(c.display==='none'||c.visibility==='hidden') return false;} return true;", i)


def erreurs_js(dv):
    return [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE' and 'favicon' not in l['message']]


try:
    print('--- Parcours complet par code ---')
    dv = ouvrir()
    dv.execute_script("document.getElementById('hub-login-modal').style.display='flex'")
    val(dv, 'hub-login-username', 'Client@Napa.ca')
    check('lien sous « Se connecter »', visible(dv, 'hub-login-forgot') and 'oubli' in (txt(dv, 'hub-login-forgot') or ''))
    clic(dv, 'hub-login-forgot')
    check('fenetre ouverte, courriel pre-rempli', visible(dv, 'reset-pwd-modal') and dv.execute_script("return document.getElementById('reset-email').value") == 'client@napa.ca')
    val(dv, 'reset-email', 'pas-un-courriel'); clic(dv, 'reset-send')
    check('courriel invalide : refuse sans appel serveur', visible(dv, 'reset-error') and not any(a['action'] == 'resetrequest' for a in dv.execute_script('return window.__appels')))
    val(dv, 'reset-email', 'client@napa.ca'); clic(dv, 'reset-send')
    appels = [a for a in dv.execute_script('return window.__appels') if a['action'] == 'resetrequest']
    check('resetrequest envoye avec le courriel et la langue', len(appels) == 1 and appels[0]['email'] == 'client@napa.ca' and appels[0]['lang'] == 'fr', appels)
    check('etape 2 : message « si un compte existe » + indesirables', visible(dv, 'reset-step2') and 'client@napa.ca' in (txt(dv, 'reset-sent') or '') and 'indésirables' in (txt(dv, 'reset-sent') or ''))
    val(dv, 'reset-code', '999999'); val(dv, 'reset-new', 'nouveau1'); val(dv, 'reset-confirm', 'nouveau1'); clic(dv, 'reset-submit')
    check('mauvais code : message clair, fenetre ouverte', visible(dv, 'reset-pwd-modal') and 'Code invalide' in (txt(dv, 'reset-error') or ''))
    val(dv, 'reset-new', 'nouveau1'); val(dv, 'reset-confirm', 'autre'); clic(dv, 'reset-submit')
    check('confirmation differente : refusee avant le serveur', visible(dv, 'reset-error') and len([a for a in dv.execute_script('return window.__appels') if a['action'] == 'resetconfirm']) == 1)
    val(dv, 'reset-code', '123456'); val(dv, 'reset-new', 'nouveau1'); val(dv, 'reset-confirm', 'nouveau1'); clic(dv, 'reset-submit')
    time.sleep(2)
    sess = dv.execute_script("try { return JSON.parse(localStorage.getItem('portal_user')); } catch(e) { return null; }")
    check('bon code : fenetre fermee et session ouverte', not visible(dv, 'reset-pwd-modal') and sess and sess.get('token') == 'TOK' and sess.get('email') == 'client@napa.ca', sess)
    err = erreurs_js(dv)
    check('aucune erreur JS', not err, err)
    dv.quit()

    print('--- Mot de passe temporaire : toujours possible ---')
    dv = ouvrir()
    dv.execute_script("document.getElementById('hub-login-modal').style.display='flex'")
    val(dv, 'hub-login-username', 'client@napa.ca'); val(dv, 'hub-login-password', 'TEMP123')
    clic(dv, 'hub-login-submit'); time.sleep(1)
    check('connexion avec le mot de passe temporaire -> changement force', visible(dv, 'change-pwd-modal'))
    err = erreurs_js(dv)
    check('aucune erreur JS', not err, err)
    dv.quit()

    print('--- Anglais ---')
    dv = ouvrir('en')
    dv.execute_script("document.getElementById('hub-login-modal').style.display='flex'")
    check('lien en anglais', 'forgot' in (txt(dv, 'hub-login-forgot') or ''), txt(dv, 'hub-login-forgot'))
    clic(dv, 'hub-login-forgot')
    val(dv, 'reset-email', 'client@napa.ca'); clic(dv, 'reset-send')
    appels = [a for a in dv.execute_script('return window.__appels') if a['action'] == 'resetrequest']
    check('demande en anglais (lang=en) et message traduit', appels and appels[-1]['lang'] == 'en' and 'junk' in (txt(dv, 'reset-sent') or ''), txt(dv, 'reset-sent'))
    err = erreurs_js(dv)
    check('aucune erreur JS', not err, err)
    dv.quit()
finally:
    httpd.shutdown()

print('RESULTAT: %s' % ('OK' if ko == 0 else 'ECHEC (%d)' % ko))
sys.exit(1 if ko else 0)
