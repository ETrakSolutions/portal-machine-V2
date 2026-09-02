# -*- coding: utf-8 -*-
"""Les libelles du kit doivent etre en ANGLAIS quand la page est en anglais.

Le defaut signale par Jacquot (2026-09-02, capture EN) : « Z03B-0041 Harnais
Link-Belt/Case » restait en francais. Le libelle du harnais est construit dans
js/kit-rules.js (« Harnais » + nom), il n'existe donc dans aucun catalogue et
n'avait jamais ete entre au dictionnaire.

Deux niveaux de controle :
  1. cible — harnais (marque avec harnais dedie, puis marque generique) et les
     deux options Nacelle ajoutees en juin 2026 ;
  2. invariant, sur TOUS les types : aucun libelle affiche en anglais ne doit
     encore avoir une traduction anglaise DIFFERENTE de lui-meme. Si c'etait le
     cas, c'est que tBom ne l'a pas appliquee.

La couverture du dictionnaire (« chaque libelle a-t-il une cle ? ») est verifiee
a part, sans navigateur : scripts/audit_i18n_bom.py.

Usage : python scripts/selenium_i18n_bom_test.py [--live]
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)

MJ = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


def ouvrir_en():
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))


def libelles():
    """Libelles affiches dans le tableau, code produit retire."""
    return dv.execute_script("""
var out=[];
document.querySelectorAll('#selected-options-list table tbody tr').forEach(function(tr){
  var tds=tr.querySelectorAll('td');
  if(!tds.length || tds[0].getAttribute('colspan')) return;
  var c=tds[0].cloneNode(true);
  var m=c.querySelector('span[style*="JetBrains"]'); if(m) m.remove();
  var t=c.textContent.replace(/^\\s*[\\u25cf\\u2022]\\s*/,'').trim();
  if(t) out.push(t);
});
return out;
""")


def premier_modele(typ):
    for fab in MJ[typ]:
        if fab.startswith('_'):
            continue
        for y in sorted(MJ[typ][fab]):
            for m in MJ[typ][fab][y]:
                return fab, y, m
    return None


def tout_activer():
    dv.execute_script("""
var h=document.getElementById('lim-hauteur'); if(h && !h.checked) h.click();
document.querySelectorAll('.toggle-box').forEach(function(b){
  if(getComputedStyle(b).display==='none') return;
  if(!b.classList.contains('active') && !b.querySelector('.toggle-sub-panel')) b.click();
});
""")
    time.sleep(1.2)


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'Test Claude',"
                      " permissions:{modifBom:true, voirPrix:true}}));")
    dv.execute_script("localStorage.setItem('portal_lang','en');")

    print('--- 1) harnais dedie : Case -> « Harness Link-Belt/Case » ---')
    ouvrir_en()
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Case')):
        check('selection %s = %s' % (sid, val), choisir(sid, val))
    fab, an, mod = None, None, None
    for y in sorted(MJ['Excavatrice']['Case']):
        for m in MJ['Excavatrice']['Case'][y]:
            fab, an, mod = 'Case', y, m
            break
        if mod:
            break
    choisir('select-modele', mod)
    choisir('select-annee', an)
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(1.2)
    lbl = libelles()
    harn = [l for l in lbl if 'arness' in l or 'arnais' in l]
    check('une ligne de harnais est affichee (%s)' % (harn or '—'), len(harn) == 1)
    if harn:
        check('elle est en anglais : « %s »' % harn[0], harn[0] == 'Harness Link-Belt/Case')

    print('--- 2) harnais generique : Bobcat -> « Generic harness » ---')
    ouvrir_en()
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Bobcat'),
                     ('select-modele', 'E08'), ('select-annee', '2015')):
        choisir(sid, val)
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(1.2)
    harn = [l for l in libelles() if 'arness' in l or 'arnais' in l]
    check('harnais generique en anglais (%s)' % (harn or '—'),
          len(harn) == 1 and harn[0] == 'Generic harness')

    print('--- 3) options Nacelle 0906 / 0907 ---')
    cible = premier_modele('Nacelle')
    ouvrir_en()
    choisir('select-type', 'Nacelle')
    choisir('select-fabricant', cible[0])
    choisir('select-modele', cible[2])
    choisir('select-annee', cible[1])
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(0.8)
    for opt in ('nac-0906', 'nac-0907'):
        dv.execute_script("var e=document.getElementById(arguments[0]);"
                          "if(e && !e.checked){ e.click(); }", opt)
    time.sleep(1.2)
    lbl = libelles()
    check('« Rack-and-pinion rotation option » affiche',
          'Rack-and-pinion rotation option' in lbl)
    check('« Boom lift jib option » affiche', 'Boom lift jib option' in lbl)

    print('--- 4) invariant sur les 11 types : plus rien a traduire a l ecran ---')
    for typ in [t for t in MJ if not t.startswith('_')]:
        cible = premier_modele(typ)
        if not cible:
            continue
        fab, an, mod = cible
        ouvrir_en()
        choisir('select-type', typ)
        choisir('select-fabricant', fab)
        choisir('select-modele', mod)
        choisir('select-annee', an)
        tout_activer()
        restants = dv.execute_script("""
var dict = window.TRANSLATIONS && window.TRANSLATIONS['en'] || {};
var out=[];
document.querySelectorAll('#selected-options-list table tbody tr').forEach(function(tr){
  var tds=tr.querySelectorAll('td');
  if(!tds.length || tds[0].getAttribute('colspan')) return;
  var c=tds[0].cloneNode(true);
  var m=c.querySelector('span[style*="JetBrains"]'); if(m) m.remove();
  var t=c.textContent.replace(/^\\s*[\\u25cf\\u2022]\\s*/,'').trim();
  var en=dict['bom.'+t];
  if(en !== undefined && en !== t) out.push(t);
});
return out;
""")
        check('%-28s aucun libelle non traduit (%d lignes)'
              % (typ, len(libelles())), not restants)
        if restants:
            print('       ', restants)

    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:4]:
        print('     ', e['message'][:200])

except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails:
    print('  -', f)
sys.exit(0 if not fails else 1)
