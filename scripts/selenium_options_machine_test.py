# -*- coding: utf-8 -*-
"""Portail Machine : section « Options compatibles avec cette machine » (Steve, 2026-10-21).

Verifie, avec les memes regles que la tuile Soumission :
  1. excavatrice (Cat 320 2017) : Limiteur EN PREMIER, puis creusage, IDC, camera ; pas de balance ;
     Multi-axe offert ; codes 1100-0007 / 1000-0009 / 1300-0004 ; aucun point rouge ;
  2. loader (LiuGong 835HV 2023) : Limiteur = Hauteur seule ; Balance ST-7 avec les 3 raccords
     obligatoires (points rouges) H01C-0023/24/25 ; pas de creusage ;
  3. tracteur : pas de Limiteur, Balance Scale Lite en premier ;
  4. camion vacuum : Hauteur + extension (1500-0505), pas de Hauteur + Rotation ;
  5. telehandler sans base rotative : pas de Rotation ;
  6. piece de limiteur propre a la machine (Komatsu PC220LC-12 2025, Z03B-0142, rouge) ;
     piece « avec la Rotation » (Rotobec ELITE 915-F 2015) ;
  7. anglais ; section cachee sans machine ; aucune erreur JS.

    py -3.12 scripts/selenium_options_machine_test.py [--live]
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
PORT = 8799
BASE = LIVE if '--live' in sys.argv else 'http://127.0.0.1:%d' % PORT
if BASE != LIVE:
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Q)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)

o = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1300,1000']:
    o.add_argument(a)
o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=o)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CH = ("var s=document.getElementById(arguments[0]); if(!s) return false; for (var i=0;i<s.options.length;i++){"
      " if(s.options[i].value===arguments[1]){ s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } } return false;")


def choisir(type_, fab, annee, modele):
    ok = True
    for sid, v in (('select-type', type_), ('select-fabricant', fab), ('select-annee', annee), ('select-modele', modele)):
        fin = time.time() + 20
        while not dv.execute_script(CH, sid, v):
            if time.time() > fin:
                ok = False; break
            time.sleep(0.3)
    time.sleep(1.2)
    return ok


ETAT = """var s = document.getElementById('options-compat-section');
return { vis: !!s && s.style.display !== 'none', titre: (s && s.querySelector('h3')) ? s.querySelector('h3').textContent : '',
  cartes: s ? [...s.querySelectorAll('.optm-carte')].map(c => ({ t: c.querySelector('.optm-titre').textContent,
     l: [...c.querySelectorAll('.optm-ligne')].map(x => ({ lab: x.querySelector('.optm-lab').textContent, code: x.querySelector('.optm-code').textContent,
         r: x.querySelector('.optm-dot').classList.contains('optm-r') })) })) : [] };"""

TROUVER = """var t = arguments[0], test = arguments[1];
var d = machinesData[t]; if (!d) return null;
for (var f in d) { if (f[0] === '_') continue; for (var a in d[f]) for (var m in d[f][a]) {
  var e = d[f][a][m]; if (new Function('e', 'return ' + test)(e)) return [f, a, m]; } }
return null;"""


def etat():
    return dv.execute_script(ETAT)


def titres(e):
    return [c['t'] for c in e['cartes']]


def carte(e, debut):
    return next((c for c in e['cartes'] if c['t'].startswith(debut)), None)


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'vente_interne', email:'t@e', name:'T', permissions:{}}));"
                      "localStorage.setItem('portal_lang','fr');")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script("return typeof machinesData!=='undefined' && Object.keys(machinesData).length>0;"))
    check('section cachee sans machine', not etat()['vis'])

    print('--- 1) excavatrice Cat 320 (2017) ---')
    check('selection', choisir('Excavatrice', 'Caterpillar', '2017', '320'))
    e = etat()
    check('section visible, titre « %s »' % e['titre'], e['vis'] and e['titre'] == 'Options compatibles avec cette machine')
    check('cartes %s' % titres(e), titres(e) == ['Limiteur', 'Guide de creusage', 'Indicateur de charge', 'Caméra'])
    lim = carte(e, 'Limiteur')
    check('Limiteur : Hauteur, Rotation, H+R, Multi-axe', [x['lab'] for x in lim['l']] == ['Hauteur', 'Rotation', 'Hauteur + Rotation', 'Multi-axe'])
    codes = [x['code'] for c in e['cartes'] for x in c['l']]
    check('codes 1100-0007, 1000-0009, 1000-0400, 1300-0004, 1300-0005 presents', all(k in codes for k in ('1100-0007', '1000-0009', '1000-0400', '1300-0004', '1300-0005')))
    check('aucun point rouge', not any(x['r'] for c in e['cartes'] for x in c['l']))

    print('--- 2) loader LiuGong 835HV (2023) ---')
    check('selection', choisir('Loader', 'LiuGong', '2023', '835HV'))
    e = etat()
    check('cartes %s' % titres(e), titres(e) == ['Limiteur', 'Balance ST-7', 'Caméra'])
    check('Limiteur : Hauteur seule', [x['lab'] for x in carte(e, 'Limiteur')['l']] == ['Hauteur'])
    bal = carte(e, 'Balance')
    rouges = [x['code'] for x in bal['l'] if x['r']]
    check('Balance : 3 raccords rouges %s' % rouges, rouges == ['H01C-0023', 'H01C-0024', 'H01C-0025'])
    check('Balance : options jaunes 1200-0010/14/15', [x['code'] for x in bal['l'] if not x['r']] == ['1200-0010', '1200-0014', '1200-0015'])
    check('raccord avec quantite (×2)', '(×2)' in bal['l'][3]['lab'])

    print('--- 3) tracteur ---')
    tr = dv.execute_script(TROUVER, 'Tracteur', 'true')
    check('un tracteur trouve %s' % tr, bool(tr) and choisir('Tracteur', *tr))
    e = etat()
    check('tracteur : %s' % titres(e), titres(e)[:1] == ['Balance Scale Lite'] and 'Limiteur' not in titres(e))
    check('Scale Lite 1200-0020 / 1200-0023', [x['code'] for x in carte(e, 'Balance')['l']][:2] == ['1200-0020', '1200-0023'])

    print('--- 4) camion vacuum ---')
    va = dv.execute_script(TROUVER, 'Camion Vacuum', 'true')
    check('un vacuum trouve %s' % va, bool(va) and choisir('Camion Vacuum', *va))
    labs = [x['lab'] for x in carte(etat(), 'Limiteur')['l']]
    check('vacuum : %s' % labs, labs == ['Hauteur', 'Hauteur + extension', 'Rotation'])

    print('--- 5) telehandler sans base rotative ---')
    te = dv.execute_script(TROUVER, 'Telehandler', "(e['Base rotative'] || (e._specs && e._specs['Base rotative'])) !== 'Oui'")
    check('un telehandler sans base rotative %s' % te, bool(te) and choisir('Telehandler', *te))
    labs = [x['lab'] for x in carte(etat(), 'Limiteur')['l']]
    check('telehandler : %s' % labs, labs == ['Hauteur'])

    print('--- 6) pieces de limiteur propres a la machine ---')
    check('Komatsu PC220LC-12 (2025)', choisir('Excavatrice', 'Komatsu', '2025', 'PC220LC-12'))
    lim = carte(etat(), 'Limiteur')
    check('Z03B-0142 rouge dans le Limiteur', any(x['code'] == 'Z03B-0142' and x['r'] for x in lim['l']))
    check('Rotobec ELITE 915-F (2015)', choisir('Camion Girafe (Boom Truck)', 'Rotobec', '2015', 'ELITE 915-F'))
    lim = carte(etat(), 'Limiteur')
    check('piece « avec la Rotation » (1500-0322, rouge)', any(x['code'] == '1500-0322' and x['r'] and 'avec la Rotation' in x['lab'] for x in lim['l']))

    print('--- 7) anglais et console ---')
    dv.execute_script("i18n.setLang('en');"); time.sleep(0.8)
    e = etat()
    check('EN : « %s », %s' % (e['titre'], titres(e)), e['titre'] == 'Options compatible with this machine' and titres(e)[0] == 'Limiter')
    dv.execute_script("i18n.setLang('fr');")
    err = [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
           and 'version.json' not in l['message'] and 'favicon' not in l['message']]
    check('aucune erreur JS SEVERE (%d)' % len(err), not err)
    for m in err[:5]:
        print('      ', m[:160])
except Exception as ex:
    print('!! ERREUR :', type(ex).__name__, ex)
    fails.append(str(ex))
finally:
    dv.quit()

print('\nRESULTAT :', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
