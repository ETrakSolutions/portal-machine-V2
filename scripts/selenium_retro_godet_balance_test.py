# -*- coding: utf-8 -*-
"""Retrocaveuse : limiteur du godet avant + balance (decisions de Jacquot, 2026-09-25).

  - Tuile « Limiteur godet avant (front loader) » = 1500-0603, systeme COMPLET a lui
    seul : pris seul, il n'emporte ni la base 1500-0600 ni le kit arriere ; pris avec
    le limiteur arriere, les deux systemes s'additionnent.
  - Balance offerte sur la retrocaveuse avec les memes choix que le Loader.

Verifie, sur Caterpillar 430 (2026), prix simules depuis la liste maitresse :
  1. retrocaveuse : tuile godet visible ; tuile balance visible avec loader, valise et
     les deux imprimantes (pas la Scale Lite) ;
  2. godet SEUL : 1500-0603 et rien du limiteur arriere (ni 0600, 0601, 0602) ;
     prix = liste de prix ; pose 1500-0603-install si « Oui » ;
  3. arriere Hauteur + Rotation + godet : 0600, 0601, 0602 ET 0603, chacun une fois ;
  4. Multi-axe + godet : 1500-0005 et 0603, sans 0600 ;
  5. balance loader + imprimante thermique : 1200-0010 et 1200-0014 ;
  6. bloc Epicor : 1500-0603 present ;
  7. Excavatrice : ni godet ni balance ; Loader : balance oui, godet non ;
  8. libelle EN ; aucune erreur JS SEVERE.

    py -3.13 scripts/selenium_retro_godet_balance_test.py [--live]
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import PRIX, installer_prix, SESSION_TEST_JS   # noqa: E402

PORT = 8801
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
installer_prix(dv)

CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=20):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


def ouvrir(type_, fab, modele, annee):
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0"
        " && Object.keys(priceData).length > 0;"))
    for sid, val in (('select-type', type_), ('select-fabricant', fab),
                     ('select-modele', modele), ('select-annee', annee)):
        check('selection %s = %s' % (sid, val), choisir(sid, val))
    time.sleep(1.2)


def visible(id_):
    return dv.execute_script("var e=document.getElementById(arguments[0]);"
                             "return !!e && getComputedStyle(e).display !== 'none';", id_)


def sub_visible(input_id):
    return dv.execute_script("var c=document.getElementById(arguments[0]); var l=c&&c.closest('.sub-option');"
                             "return !!l && getComputedStyle(l).display !== 'none';", input_id)


def codes():
    return dv.execute_script("return (window.__selectionRows||[]).map(function(r){return r.code;});")


def lignes():
    return dv.execute_script("return lignesFacturables().map(function(l){return [l.code, l.montant, l.kind];});")


def clic(id_):
    dv.execute_script("document.getElementById(arguments[0]).click();", id_)
    time.sleep(0.5)


def godet(on):
    actif = dv.execute_script("return document.getElementById('toggle-godet-avant').classList.contains('active');")
    if actif != on:
        clic('toggle-godet-avant')


def lim(id_or_none):
    dv.execute_script("document.querySelectorAll('#toggle-limiteur input[name=\"limiteur-type\"]').forEach(function(c){"
                      " if (c.checked) c.click(); });")
    time.sleep(0.3)
    if id_or_none:
        clic(id_or_none)


try:
    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION_TEST_JS)

    print('--- 1) retrocaveuse : tuiles godet et balance ---')
    ouvrir('Retrocaveuse', 'Caterpillar', '430', '2026')
    lib_fr = dv.execute_script("return document.querySelector('#toggle-godet-avant .toggle-label').textContent;")
    check('tuile godet visible : « %s »' % lib_fr, visible('toggle-godet-avant') and lib_fr == 'Limiteur godet avant (front loader)')
    check('tuile balance visible', visible('toggle-balance'))
    check('balance loader, valise et 2 imprimantes offertes',
          all(sub_visible(i) for i in ('bal-loader', 'bal-valise', 'bal-imp-therm', 'bal-imp-carb')))
    check('Scale Lite non offerte', not sub_visible('bal-scalelite'))

    print('--- 2) godet SEUL ---')
    godet(True)
    c = codes()
    check('1500-0603 present (%s)' % c, '1500-0603' in c)
    check('aucune ligne sans code (le godet ne sort pas en double)', '' not in c)
    check('rien du limiteur arriere (0600/0601/0602)', not any(x in c for x in ('1500-0600', '1500-0601', '1500-0602')))
    l = dict((k, v) for k, v, kind in lignes() if kind == 'item')
    check('prix 1500-0603 = %s $ (liste : %s $)' % (l.get('1500-0603'), PRIX['1500-0603']['item']),
          l.get('1500-0603') == PRIX['1500-0603']['item'])
    dv.execute_script("document.getElementById('install-etrak-oui').click();")
    time.sleep(0.5)
    poses = dict((k, v) for k, v, kind in lignes() if kind == 'install')
    ic = PRIX['1500-0603'].get('installCode')
    check('pose %s = %s $ (liste : %s $)' % (ic, poses.get(ic), PRIX['1500-0603']['install']),
          poses.get(ic) == PRIX['1500-0603']['install'])
    check('bloc Epicor contient 1500-0603', '1500-0603' in (dv.execute_script("return epicorBlockText();") or ''))

    print('--- 3) arriere Hauteur + Rotation + godet ---')
    lim('lim-hr')
    c = codes()
    for x in ('1500-0600', '1500-0601', '1500-0602', '1500-0603'):
        check('%s present une seule fois (%d)' % (x, c.count(x)), c.count(x) == 1)

    print('--- 4) Multi-axe + godet ---')
    lim('lim-multi')
    c = codes()
    check('1500-0005 et 1500-0603 presents (%s)' % c, '1500-0005' in c and '1500-0603' in c)
    check('pas de base 1500-0600 avec le Multi-axe', '1500-0600' not in c)

    print('--- 5) balance loader + imprimante thermique ---')
    lim(None)
    godet(False)
    clic('bal-loader')
    clic('bal-imp-therm')
    c = codes()
    check('1200-0010 et 1200-0014 presents (%s)' % c, '1200-0010' in c and '1200-0014' in c)
    check('godet retire : 1500-0603 absent', '1500-0603' not in c)

    print('--- 7) les autres types ---')
    ouvrir('Excavatrice', 'Caterpillar', '320', '2024')
    check('Excavatrice : pas de tuile godet', not visible('toggle-godet-avant'))
    check('Excavatrice : pas de tuile balance', not visible('toggle-balance'))
    lf = dv.execute_script("var o=document.getElementById('select-fabricant').options;"
                           "return Array.from(o).map(function(x){return x.value;}).filter(function(v){return v && v.charAt(0)!=='_';});")
    fab_loader = None
    choisir('select-type', 'Loader')
    time.sleep(0.5)
    fabs = dv.execute_script("return Array.from(document.getElementById('select-fabricant').options).map(function(x){return x.value;})"
                             ".filter(function(v){return v && v.indexOf('__')!==0;});")
    if fabs:
        choisir('select-fabricant', fabs[0])
        time.sleep(0.5)
        mods = dv.execute_script("return Array.from(document.getElementById('select-modele').options).map(function(x){return x.value;})"
                                 ".filter(function(v){return v && v.indexOf('__')!==0;});")
        if mods:
            choisir('select-modele', mods[0])
            time.sleep(1)
    check('Loader : tuile balance visible', visible('toggle-balance'))
    check('Loader : pas de tuile godet', not visible('toggle-godet-avant'))

    print('--- 8) anglais et console ---')
    dv.execute_script("i18n.setLang('en');")
    ouvrir('Retrocaveuse', 'Caterpillar', '430', '2026')
    lib_en = dv.execute_script("return document.querySelector('#toggle-godet-avant .toggle-label').textContent;")
    check('libelle EN : « %s »' % lib_en, lib_en == 'Front loader bucket limiter')
    dv.execute_script("i18n.setLang('fr');")
    err = [x['message'] for x in dv.get_log('browser') if x['level'] == 'SEVERE'
           and 'version.json' not in x['message'] and 'favicon' not in x['message']]
    check('aucune erreur JS SEVERE (%d)' % len(err), not err)
    for m in err[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
