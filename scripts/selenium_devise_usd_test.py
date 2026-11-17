"""Soumission en CAD ou en USD (Jacquot, 2026-11-16).

Verifie, avec un faux serveur de prix (comme _prix_test.py) :
  1. invite : pas de bouton de devise ;
  2. super_admin : bouton CAD/USD, CAD par defaut, prix en « $ » et question d'installation ;
  3. bascule en USD : prix = itemUS de la liste (« $ US »), aucune ligne de pose, question
     d'installation retiree, note USD, total = somme des itemUS ; courriel « Devise : USD » ;
  4. panier non vide : CAD grise, on ne change plus de devise ;
  5. chariot en USD : aimants AT0001 offerts en $ US (Jacquot, 2026-11-17), note des droits de douane US ;
  6. dealer dont le compte est en USD : USD seul, sans bouton CAD.

Liste de prix : --prix <fichier> (defaut : la liste maitresse SharePoint ; tant qu'elle n'a
pas les champs itemUS, passer la sortie du convertisseur, travail\\prix-portail_2027.json).

    py -3.13 scripts/selenium_devise_usd_test.py --prix "<chemin>"   [--live]
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import PRIX as PRIX_MAITRE  # noqa: E402

PRIX = PRIX_MAITRE
if '--prix' in sys.argv:
    PRIX = json.loads(open(sys.argv[sys.argv.index('--prix') + 1], encoding='utf-8').read())
if not any('itemUS' in v for v in PRIX.values()):
    sys.exit('La liste de prix n\'a aucun itemUS : passer --prix <sortie du convertisseur>.')


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)

ADMIN = {'username': 't@e', 'email': 't@e', 'name': 'Test Claude', 'role': 'super_admin',
         'token': 'TEST-SELENIUM', 'consentVersion': 99,
         'permissions': {'modifBom': True, 'soumissionAccess': True}}
DEALER_US = {'username': 'd@us', 'email': 'd@us', 'name': 'Dealer US', 'role': 'dealer', 'devise': 'USD',
             'token': 'TEST-SELENIUM-D', 'consentVersion': 99, 'vendeurEmail': 'rdesrosiers@e-trak.ca',
             'permissions': {'soumissionAccess': True}}

STUB = """
(function () {
  var PRIX = %s, vrai = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var body = opts && typeof opts.body === 'string' ? opts.body : '';
    var rep = null, u = null;
    try { u = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    if (body.indexOf('"action":"getprices"') >= 0) rep = { ok: true, prices: PRIX };
    else if (body.indexOf('"action":"whoami"') >= 0) rep = { ok: true, user: u };
    else if (body.indexOf('"action":"listusers"') >= 0) rep = { users: u ? [u] : [] };
    if (rep) return Promise.resolve(new Response(JSON.stringify(rep), { headers: { 'Content-Type': 'application/json' } }));
    return vrai(url, opts);
  };
})();
""" % json.dumps(PRIX)

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': STUB})
fails = []
J = dv.execute_script


def check(label, cond, detail=None):
    print(('  [OK] ' if cond else '  [X ] ') + label + ('' if cond or detail is None else '  -> %r' % (detail,)))
    if not cond:
        fails.append(label)


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if J(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


def ouvrir(user, attendre_prix=True):
    dv.get(BASE + '/soumission.html')
    if user is None:
        J("localStorage.removeItem('portal_user');")
    else:
        J("localStorage.setItem('portal_user', arguments[0]);", json.dumps(user))
    J("sessionStorage.removeItem('soumission_panier_v1');")
    dv.get(BASE + '/soumission.html')
    etat = ("return (typeof machinesData!=='undefined' && Object.keys(machinesData).length>0)"
            + (" && typeof priceData!=='undefined' && Object.keys(priceData).length>0;" if attendre_prix else ";"))
    WebDriverWait(dv, 120).until(lambda d: d.execute_script(etat))
    time.sleep(1.5)


def vis(i):
    return J("var e=document.getElementById(arguments[0]); return !!(e && e.offsetParent!==null);", i)


def boutons():
    return J("var o={}; document.querySelectorAll('#devise-box button[data-devise]').forEach(function(b){"
             "o[b.dataset.devise]={vis:b.offsetParent!==null, actif:b.classList.contains('actif'), off:b.disabled};}); return o;")


def tableau():
    return J("return document.getElementById('selected-options-list').innerText;")


def excavatrice():
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '320'), ('select-annee', '2024')):
        check('selection %s' % val, choisir(sid, val))
    time.sleep(0.6)
    J("document.getElementById('lim-hauteur').click();")
    time.sleep(0.5)
    J("var e=document.getElementById('soumission-nb-systemes'); e.value='1'; e.dispatchEvent(new Event('input',{bubbles:true}));")
    time.sleep(0.4)


try:
    print('1. invite (pas de session)')
    ouvrir(None, attendre_prix=False)
    check('bouton de devise cache', not vis('devise-box'))

    print('2. super_admin : CAD par defaut')
    ouvrir(ADMIN)
    b = boutons()
    check('bouton visible, CAD actif, USD offert', vis('devise-box') and b['CAD']['actif'] and b['USD']['vis'] and not b['USD']['off'], b)
    excavatrice()
    check('question d\'installation visible en CAD', vis('install-question-box'))
    J("document.getElementById('install-etrak-oui').click();")
    time.sleep(0.5)
    t_cad = tableau()
    lignes_cad = J("return lignesFacturables().map(function(l){return {code:l.code, kind:l.kind, m:l.montant};});")
    check('lignes de pose presentes en CAD', any(l['kind'] == 'install' for l in lignes_cad), lignes_cad)
    check('montants en « $ » sans « US »', ' $' in t_cad and '$ US' not in t_cad)

    print('3. bascule en USD')
    J("document.querySelector('#devise-box button[data-devise=USD]').click();")
    time.sleep(0.8)
    b = boutons()
    check('USD actif', b['USD']['actif'] and not b['CAD']['actif'], b)
    check('question d\'installation retiree', not vis('install-question-box'))
    check('reponse d\'installation effacee', J("return reponseInstall();") == '')
    lignes = J("return lignesFacturables().map(function(l){return {code:l.code, kind:l.kind, m:l.montant, q:l.qty};});")
    check('aucune ligne de pose en USD', not any(l['kind'] == 'install' for l in lignes), lignes)
    attendu = True
    for l in lignes:
        if not l['code'] or l['m'] is None:
            continue
        us = PRIX.get(l['code'], {}).get('itemUS')
        if us is None or abs(l['m'] - us * (l['q'] or 1)) > 0.001:
            attendu = False
            print('     ecart', l, 'itemUS', us)
    check('chaque montant = itemUS x quantite', attendu and len(lignes) > 0)
    t_us = tableau()
    total = sum(l['m'] for l in lignes if isinstance(l['m'], (int, float)))
    tot_txt = '{:,.2f}'.format(total).replace(',', ' ').replace('.', ',') + ' $ US'
    check('total affiche = somme des itemUS (%s)' % tot_txt, tot_txt.replace(' ', ' ') in t_us.replace(' ', ' ').replace(' ', ' '), t_us[-300:])
    check('note USD sous le tableau', 'dollars US' in t_us)
    check('note USD en tete de page', vis('devise-note'))
    mail = J("return texteMachine(photoMachine(), false);")
    check('courriel : « Devise : USD »', 'Devise : USD' in mail, mail[-400:])
    check('courriel : montants « $ US »', '$ US' in mail)

    print('4. panier non vide : devise figee')
    J("document.getElementById('panier-ajouter').click();")
    time.sleep(1)
    b = boutons()
    check('panier rempli', J("return panier.length;") == 1)
    check('CAD grise tant que le panier a une machine', b['CAD']['off'] and b['USD']['actif'], b)
    check('panier garde devise USD', J("return panier[0].photo.devise;") == 'USD')
    J("document.querySelector('#devise-box button[data-devise=CAD]').click();")
    time.sleep(0.4)
    check('clic sur CAD sans effet', J("return DEVISE;") == 'USD')
    J("panier = []; sessionStorage.removeItem('soumission_panier_v1'); rendrePanier();")
    time.sleep(0.3)
    check('panier vide : CAD de nouveau permis', not boutons()['CAD']['off'])

    print('5. chariot en USD : aimants offerts en $ US, note des tarifs')
    J("APERCU_COMPTES.push('t@e'); var v=selectType.value; while (selectType.options.length > 1) selectType.remove(1); populateTypes();")
    choisir('select-type', '__chariot__')
    time.sleep(1)
    if not J("return document.getElementById('toggle-camera').classList.contains('open');"):
        J("document.querySelector('#toggle-camera .toggle-label').click();")
    time.sleep(0.3)
    J("document.getElementById('ch-fourche-0127').click();")
    time.sleep(0.5)
    check('option aimants visible en USD', vis('ch-aim-rack-lab'))
    prix_ch = J("var o={}; document.querySelectorAll('#cam-chariot .grue-prix').forEach(function(e){o[e.dataset.code]=e.textContent;}); return o;")
    check('prix camera 1300-0127 en $ US', '$ US' in prix_ch.get('1300-0127', ''), prix_ch)
    check('prix aimants en $ US', '$ US' in prix_ch.get('AT0001', ''), prix_ch)
    J("document.querySelector('#devise-box button[data-devise=CAD]').click();")
    time.sleep(0.6)
    check('en CAD : option aimants toujours la', vis('ch-aim-rack-lab'))
    J("document.querySelector('#devise-box button[data-devise=USD]').click();")
    time.sleep(0.6)
    J("document.getElementById('ch-cab-arriere').click(); document.getElementById('ch-mon-7').click();")
    time.sleep(0.4)
    J("document.getElementById('ch-aim-arriere').click();")
    time.sleep(0.4)
    J("var e=document.getElementById('ch-batt-10'); e.value='2'; e.dispatchEvent(new Event('input',{bubbles:true}));"
      "var c=document.getElementById('ch-chargeur'); c.value='2'; c.dispatchEvent(new Event('input',{bubbles:true}));")
    time.sleep(0.8)
    t = tableau()
    check('note des droits de douane US eleves', 'Droits de douane US' in t, t[-400:])
    check('AT0001 present en USD', 'AT0001' in t, t[-600:])

    print('6. dealer au compte USD')
    ouvrir(DEALER_US)
    b = boutons()
    check('USD seul, actif, sans bouton CAD', b['USD']['actif'] and b['USD']['vis'] and not b['CAD']['vis'], b)
    check('DEVISE = USD', J("return DEVISE;") == 'USD')
    J("changerDevise('CAD');")
    check('changerDevise refuse au dealer', J("return DEVISE;") == 'USD')

    print('7. anglais')
    J("i18n.setLang && i18n.setLang('en');")
    time.sleep(0.6)
    check('libelle Currency', J("return document.querySelector('#devise-box .devise-label').textContent;") == 'Currency')
finally:
    dv.quit()

print()
print('ECHECS : %d' % len(fails) if fails else 'TOUT PASSE')
for f in fails:
    print('  -', f)
sys.exit(1 if fails else 0)
