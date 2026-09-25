"""Outil commun des tests Selenium qui ont besoin des prix.

Depuis le 2026-09-25, les prix ne sont plus dans le depot : la Soumission les demande
au backend (action 'getprices') avec un vrai jeton de session. Un test ne se connecte
pas vraiment ; il lit donc la liste MAITRESSE (SharePoint _Portail e-Trak) et installe
dans le navigateur, avant tout script de la page, un faux serveur pour deux actions :

  - getprices -> { ok, prices: <liste maitresse> }
  - whoami    -> { ok, user } (sinon admin.js jette le faux jeton et deconnecte)

Tout le reste part au vrai backend. Marche en local comme avec --live.

    from _prix_test import PRIX, installer_prix, SESSION_TEST_JS
    installer_prix(dv)                       # une fois, juste apres webdriver.Chrome()
    dv.execute_script(SESSION_TEST_JS)       # a la place de l'ancien localStorage.setItem
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from publier_prix import dossier_portail  # noqa: E402

_d = dossier_portail()
if not _d or not (_d / 'prix-portail.json').is_file():
    sys.exit('Liste maitresse introuvable (SharePoint _Portail e-Trak/prix-portail.json).')
PRIX = json.loads((_d / 'prix-portail.json').read_text(encoding='utf-8'))

USER_TEST = {'username': 't@e', 'email': 't@e', 'name': 'Test Claude', 'role': 'super_admin',
             'token': 'TEST-SELENIUM', 'consentVersion': 99,
             'permissions': {'modifBom': True, 'soumissionAccess': True}}

SESSION_TEST_JS = "localStorage.setItem('portal_user', %s);" % json.dumps(json.dumps(USER_TEST))

_STUB = """
(function () {
  var PRIX = %s, USER = %s, vrai = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var body = opts && typeof opts.body === 'string' ? opts.body : '';
    var rep = null;
    if (body.indexOf('"action":"getprices"') >= 0) rep = { ok: true, prices: PRIX };
    else if (body.indexOf('"action":"whoami"') >= 0) rep = { ok: true, user: USER };
    if (rep) return Promise.resolve(new Response(JSON.stringify(rep),
                     { headers: { 'Content-Type': 'application/json' } }));
    return vrai(url, opts);
  };
})();
""" % (json.dumps(PRIX), json.dumps(USER_TEST))


def installer_prix(driver):
    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': _STUB})
