# -*- coding: utf-8 -*-
"""Page Admin : jamais d'ecriture de la liste des comptes sur une liste non chargee,
et jamais de succes affiche quand le serveur refuse (incident du 2026-10-01 : une liste
vide + un ajout a efface tous les comptes).

Serveur simule (fetch remplace) ; clics reels sur les boutons de la page.
  A. listusers en echec -> l'ajout est bloque, AUCUN 'save' envoye
  B. save refuse par le serveur -> message d'echec, pas d'identifiants, liste relue
  C. ajout normal -> 'save' porte la liste COMPLETE + le nouveau, identifiants affiches
  D. suppression normale -> 'save' porte la liste moins un compte, toast de succes
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8812
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

MOI = {'username': 't@e', 'email': 't@e', 'name': 'Test Admin', 'role': 'super_admin', 'token': 'T',
       'consentVersion': 99, 'permissions': {'modifAccounts': True}}
LISTE = [
    {'username': 'jcaron@gryb.com', 'email': 'jcaron@gryb.com', 'password': 'J', 'role': 'super_admin', 'name': 'Jacquot'},
    {'username': 't@e', 'email': 't@e', 'password': 'T', 'role': 'super_admin', 'name': 'Test Admin'},
    {'username': 'dealer@x.ca', 'email': 'dealer@x.ca', 'password': 'D', 'role': 'dealer', 'name': 'Dealer Un', 'vendeurEmail': 'v@x.ca'},
]

# mode : 'liste_ko' | 'save_ko' | 'ok'
STUB = """
(function () {
  var MOI = %s, LISTE = %s, MODE = %s, vrai = window.fetch.bind(window);
  window.__saves = []; window.__listusers = 0; window.__alertes = [];
  window.alert = function (m) { window.__alertes.push(String(m)); };
  window.confirm = function () { return true; };
  window.fetch = function (url, opts) {
    var b = opts && typeof opts.body === 'string' ? opts.body : '', rep = null;
    if (b.indexOf('"action":"whoami"') >= 0) rep = { ok: true, user: MOI };
    else if (b.indexOf('"action":"listusers"') >= 0) {
      window.__listusers++;
      if (MODE === 'liste_ko') return Promise.reject(new TypeError('Failed to fetch'));
      rep = { users: JSON.parse(JSON.stringify(LISTE)) };
    } else if (b.indexOf('"action":"save"') >= 0 && b.indexOf('authorized_users_v2') >= 0) {
      window.__saves.push(JSON.parse(JSON.parse(b).value));
      rep = MODE === 'save_ko' ? { error: 'server error' } : { ok: true };
    } else if (String(url).indexOf('key=vendeurs_list') >= 0) rep = { value: JSON.stringify([{ name: 'Vend', email: 'v@x.ca' }]) };
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
    print('  [%s] %s%s' % ('OK' if cond else 'X ', nom, ('  — ' + detail) if detail and not cond else ''))


def ouvrir(mode):
    o = Options()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1400,1000')
    o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    dv = webdriver.Chrome(options=o)
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument',
                       {'source': STUB % (json.dumps(MOI), json.dumps(LISTE), json.dumps(mode))})
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', %s)" % json.dumps(json.dumps(MOI)))
    dv.get(BASE + '/index.html')
    time.sleep(3)
    dv.execute_script('showAdminSection()')
    time.sleep(2)
    return dv


def ajouter(dv, nom, courriel):
    dv.execute_script(
        "document.getElementById('admin-new-name').value=arguments[0];"
        "document.getElementById('admin-new-email').value=arguments[1];"
        "var r=document.getElementById('admin-new-role'); r.value='administrateur';"
        "r.dispatchEvent(new Event('change',{bubbles:true}));", nom, courriel)
    dv.find_element(By.ID, 'admin-add-user-btn').click()
    time.sleep(2)


def etat(dv):
    return dv.execute_script(
        "return {saves: window.__saves, lu: window.__listusers, alertes: window.__alertes,"
        " popup: !!document.getElementById('cred-popup-overlay'),"
        " toast: (document.querySelector('.admin-toast')||{}).textContent || ''};")


def erreurs_js(dv):
    return [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
            and 'favicon' not in l['message'] and 'Failed to fetch' not in l['message']]


try:
    print('--- A. liste des comptes non chargee ---')
    dv = ouvrir('liste_ko')
    ajouter(dv, 'Joe Pepine', 'joe@x.ca')
    e = etat(dv)
    check('aucun save envoye', len(e['saves']) == 0, str(e['saves']))
    check('message « liste non chargee »', any('pas chargée' in a for a in e['alertes']), str(e['alertes']))
    check('pas d identifiants affiches', not e['popup'])
    err = erreurs_js(dv)
    check('aucune erreur JS', not err, str(err))
    dv.quit()

    print('--- B. le serveur refuse la sauvegarde ---')
    dv = ouvrir('save_ko')
    lu_avant = etat(dv)['lu']
    ajouter(dv, 'Neuf', 'neuf@x.ca')
    e = etat(dv)
    check('un save envoye, avec la liste complete + le nouveau', len(e['saves']) == 1 and len(e['saves'][0]) == 4, str(e['saves']))
    check('message d echec du serveur', any("PAS enregistré" in a for a in e['alertes']), str(e['alertes']))
    check('pas d identifiants affiches', not e['popup'])
    check('pas de toast « ajoute »', 'ajout' not in e['toast'].lower(), e['toast'])
    check('liste relue sur le serveur', e['lu'] > lu_avant, '%s -> %s' % (lu_avant, e['lu']))
    err = erreurs_js(dv)
    check('aucune erreur JS', not err, str(err))
    dv.quit()

    print('--- C. ajout normal ---')
    dv = ouvrir('ok')
    ajouter(dv, 'Neuf', 'neuf@x.ca')
    e = etat(dv)
    emails = [u.get('email') for u in (e['saves'][0] if e['saves'] else [])]
    check('save = liste complete + le nouveau', emails == ['jcaron@gryb.com', 't@e', 'dealer@x.ca', 'neuf@x.ca'], str(emails))
    check('identifiants affiches', e['popup'])
    check('aucune alerte', not e['alertes'], str(e['alertes']))
    # Invitation par defaut (decision Steve 2026-10-01) : aucun mot de passe dans le courriel
    mdp = (e['saves'][0][-1] if e['saves'] else {}).get('password', '???')
    lien = dv.execute_script("return decodeURIComponent(document.getElementById('cred-mailto-btn').getAttribute('href'))")
    check('invitation : aucun mot de passe affiche ni dans le courriel',
          not dv.execute_script("return !!document.getElementById('cred-password')") and mdp not in lien, lien[:120])
    check('invitation : explique « Premiere connexion » et le code', 'Première connexion' in lien and 'code' in lien and 'indésirables' in lien)
    dv.find_element(By.ID, 'cred-show-pwd').click()
    time.sleep(0.5)
    lien2 = dv.execute_script("return decodeURIComponent(document.getElementById('cred-mailto-btn').getAttribute('href'))")
    check('« Donner plutot un mot de passe temporaire » : mot de passe affiche et dans le courriel',
          dv.execute_script("return (document.getElementById('cred-password')||{}).textContent") == mdp and mdp in lien2)
    dv.execute_script("showCredentialsPopup('A', 'a@x.ca', 'PWD999', 'Dealer')")
    time.sleep(0.5)
    check('reinitialisation (sans mode) : mot de passe affiche comme avant',
          dv.execute_script("return (document.getElementById('cred-password')||{}).textContent") == 'PWD999')
    err = erreurs_js(dv)
    check('aucune erreur JS', not err, str(err))
    dv.quit()

    print('--- D. suppression normale ---')
    dv = ouvrir('ok')
    btns = dv.find_elements(By.CSS_SELECTOR, '#admin-user-tbody .admin-delete-btn')
    cible = None
    for b in btns:
        i = b.get_attribute('data-idx')
        if i is not None and dv.execute_script('return USERS[arguments[0]].email', int(i)) == 'dealer@x.ca':
            cible = b
    check('bouton supprimer du dealer trouve', cible is not None, '%d boutons' % len(btns))
    if cible is not None:
        dv.execute_script('arguments[0].click()', cible)
        time.sleep(2)
        e = etat(dv)
        emails = [u.get('email') for u in (e['saves'][0] if e['saves'] else [])]
        check('save = liste moins le dealer', emails == ['jcaron@gryb.com', 't@e'], str(emails))
        check('toast de suppression', 'supprim' in e['toast'].lower(), e['toast'])
    err = erreurs_js(dv)
    check('aucune erreur JS', not err, str(err))
    dv.quit()
finally:
    httpd.shutdown()

print('RESULTAT: %s' % ('OK' if ko == 0 else 'ECHEC (%d)' % ko))
sys.exit(1 if ko else 0)
