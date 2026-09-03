# -*- coding: utf-8 -*-
"""saveKitOverride ne doit PAS effacer les lignes custom (fittings).

Defaut trouve le 2026-09-03 : l'editeur de kit inline de machine.html AFFICHE les
lignes `_custom` posees dans edit-machine, mais ne les collecte pas au moment de
sauver. saveKitOverride preservait `_specs`, `_removed` et `harnais` du precedent
override -- et pas `_custom`. Toute sauvegarde de kit depuis machine.html effacait
donc les fittings de la machine.

Le test appelle la VRAIE fonction de la page, avec un override deja pose portant
un fitting, et lit le payload qui part vers le backend (fetch intercepte -- rien
n'est envoye, rien n'est ecrit).
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
PORT = 8795
BASE = 'http://127.0.0.1:%d' % PORT


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1400,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


# Machine reelle portant un fitting : Caterpillar 980 XE 2024 (saisie de Jacquot,
# opt:"balance", statut r). Si le test la perd, c'est le defaut.
SCENARIO = """
var t='Loader', f='Caterpillar', y='2024', m='980 XE';
var e = machinesData[t] && machinesData[t][f] && machinesData[t][f][y] && machinesData[t][f][y][m];
if (!e || !e._bom || !e._bom._custom) return {erreur:'pas de fitting sur la machine temoin'};
var avant = JSON.parse(JSON.stringify(e._bom._custom));

// On se place comme la page le fait quand l'editeur de kit est ouvert.
currentKitType=t; currentKitFab=f; currentKitModele=m; currentKitAnnee=y;

// fetch neutralise : on CAPTURE le payload au lieu de l'envoyer.
var capture = null;
var vraiFetch = window.fetch;
window.fetch = function(u, o){
  try { capture = JSON.parse(o.body); } catch(err) {}
  return Promise.resolve({ok:true, json:function(){return Promise.resolve({});}});
};
try {
  // Ce que produit l'editeur inline : des drapeaux de kit, AUCUNE ligne custom.
  saveKitOverride({ rows: { hauteur:'red' } });
} finally {
  window.fetch = vraiFetch;
}
return {avant:avant, envoye: capture && capture.bomOverride, action: capture && capture.action};
"""

try:
    dv.get(BASE + '/machine.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e-trak', name:'Test'}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData||{}).length > 0"
        " && typeof saveKitOverride === 'function';"))
    time.sleep(1.0)

    r = dv.execute_script(SCENARIO)
    if r is None or r.get('erreur'):
        print('  !! ' + str(r))
        fails.append('scenario impossible')
    else:
        env = r['envoye'] or {}
        print('  fitting sur la machine  :', json.dumps(r['avant'], ensure_ascii=False))
        print('  payload _custom envoye  :', json.dumps(env.get('_custom'), ensure_ascii=False))
        check('la sauvegarde part bien vers updateMachineBom', r['action'] == 'updateMachineBom')
        check('le drapeau modifie est present (hauteur -> r)', env.get('0001') == 'r')
        check('_custom PRESERVE dans le payload', isinstance(env.get('_custom'), list)
              and len(env['_custom']) == len(r['avant']))
        if isinstance(env.get('_custom'), list) and env['_custom']:
            c = env['_custom'][0]
            check('le PN du fitting est intact (%s)' % c.get('pn'), c.get('pn') == 'AS-16-GP')
            check('le statut obligatoire est intact (%s)' % c.get('status'), c.get('status') == 'r')
            check('l etiquette opt:balance est intacte (%s)' % c.get('opt'), c.get('opt') == 'balance')
            check('la quantite est intacte (%s)' % c.get('qty'), c.get('qty') == 2)

    errs = [l for l in dv.get_log('browser') if l['level'] == 'SEVERE'
            and 'favicon' not in l['message'] and 'script.google' not in l['message']]
    for l in errs:
        print('     ' + l['message'][:200])
    check('console sans erreur SEVERE', not errs)
finally:
    print('\n' + ('TOUT VERT' if not fails else 'ECHECS (%d) : %s' % (len(fails), fails)))
    dv.quit()
    httpd.shutdown()
    sys.exit(1 if fails else 0)
