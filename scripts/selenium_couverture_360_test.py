# -*- coding: utf-8 -*-
"""Soumission : calculateur « Couverture 360 : 4 ou 6 cameras ? » (Steve, 2026-10-14).

Regle de la fiche du fournisseur (Panoramic Calibration Camera Installation Instructions) :
la camera de cote doit voir la charte jusqu'au coin le plus eloigne + 1 m de marge.

Verifie :
  1. le calculateur est cache tant qu'aucun 360 n'est coche, visible avec 360 (4) ;
  2. cas du document : camera a 3 m, coin arriere a 9 m -> 4 cameras (portee 10,5 m) ;
  3. coin a 10 m -> 6 cameras recommandees ; le bouton coche 360 (6) et decoche 360 (4) ;
  4. pieds : 9,84 pi / 32,81 pi donnent le meme resultat que 3 m / 10 m ;
  5. camera trop basse (0,8 m) et hauteur sous le tableau (1,0 m) : messages, pas de verdict ;
  6. le courriel porte la ligne « Couverture 360 : ... → 6 cameras » ;
  7. 360 decoche : calculateur cache, plus de ligne dans le courriel ;
  8. anglais ; aucune erreur JS SEVERE.

    py -3.12 scripts/selenium_couverture_360_test.py [--live]
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8791
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
sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import installer_prix, SESSION_TEST_JS   # prix : serveur simule

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1100']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
installer_prix(dv)
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


def charger():
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '320'), ('select-annee', '2024')):
        choisir(sid, val)
    time.sleep(1.5)


def saisir(h, av, ar, unite='m'):
    dv.execute_script("""
      var u=document.getElementById('cam-calc-unite'); u.value=arguments[3]; u.dispatchEvent(new Event('change',{bubbles:true}));
      [['cam-calc-h',arguments[0]],['cam-calc-av',arguments[1]],['cam-calc-ar',arguments[2]]].forEach(function(p){
        var e=document.getElementById(p[0]); e.value=p[1]; e.dispatchEvent(new Event('input',{bubbles:true})); });""", h, av, ar, unite)
    time.sleep(0.3)


res = lambda: dv.execute_script("return document.getElementById('cam-calc-res').textContent;")
# Le panneau du bloc Camera peut etre replie dans ce scenario : on teste l etat affiche/cache de l element lui-meme.
visible = lambda i: dv.execute_script("var e=document.getElementById(arguments[0]); return !!e && e.style.display !== 'none';", i)
coche = lambda i: dv.execute_script("return document.getElementById(arguments[0]).checked;", i)

try:
    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION_TEST_JS)
    charger()

    print('--- 1) visibilite ---')
    check('cache sans 360', not visible('cam-calc'))
    dv.execute_script("document.getElementById('cam-360').click();"); time.sleep(0.4)
    check('visible avec 360 (4 cameras)', visible('cam-calc'))

    print('--- 2) cas du document ---')
    saisir('3', '2', '9')
    r = res()
    check('3 m / 2 m / 9 m -> « 4 caméras suffisent », portée 10,5 m (%s)' % r, r.startswith('4 caméras suffisent') and '10,5 m' in r and '10,0 m' in r)
    check('pas de bouton : 360 (4) deja coche', not visible('cam-calc-choisir'))

    print('--- 3) coin a 10 m ---')
    saisir('3', '2', '10')
    r = res()
    check('-> « 6 caméras recommandées » (%s)' % r, r.startswith('6 caméras recommandées') and '11,0 m' in r)
    b = dv.execute_script("return document.getElementById('cam-calc-choisir').textContent;")
    check('bouton « %s »' % b, visible('cam-calc-choisir') and '6' in b)
    dv.execute_script("document.getElementById('cam-calc-choisir').click();"); time.sleep(0.4)
    check('360 (6) coche, 360 (4) decoche, bouton cache', coche('cam-360-6') and not coche('cam-360') and not visible('cam-calc-choisir'))
    check('calculateur toujours visible avec 360 (6)', visible('cam-calc'))

    print('--- 4) pieds ---')
    saisir('9.84', '6.56', '32.81', 'pi')
    r = res()
    check('9,84 pi / 32,81 pi -> 6 cameras, valeurs en m et pi (%s)' % r, r.startswith('6 caméras') and ' pi)' in r)

    print('--- 5) hauteurs hors regle ---')
    saisir('0.8', '1', '3')
    check('0,8 m : trop basse, minimum 0,9 m (%s)' % res(), 'trop basse' in res() and '0,9 m' in res())
    saisir('1.0', '1', '3')
    check('1,0 m : sous le tableau, a valider (%s)' % res(), 'sous le tableau' in res())

    print('--- 6) courriel ---')
    saisir('3', '2', '10')
    ligne = dv.execute_script("return texteMachine(photoMachine(), true);")
    check('ligne « Couverture 360 : caméra de côté à 3,0 m ... → 6 caméras »',
          'Couverture 360 : caméra de côté à 3,0 m' in ligne and '→ 6 caméras' in ligne)

    print('--- 7) 360 decoche ---')
    dv.execute_script("document.getElementById('cam-360-6').click();"); time.sleep(0.4)
    check('calculateur cache', not visible('cam-calc'))
    check('plus de ligne dans le courriel', 'Couverture 360' not in dv.execute_script("return texteMachine(photoMachine(), true);"))

    print('--- 8) anglais et console ---')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    charger()
    dv.execute_script("document.getElementById('cam-360').click();"); time.sleep(0.4)
    saisir('3', '2', '9')
    titre = dv.execute_script("return document.querySelector('#cam-calc .cam-calc-titre').textContent;")
    check('EN : titre « %s », résultat « %s »' % (titre, res()), titre == '360 coverage: 4 or 6 cameras?' and res().startswith('4 cameras are enough') and '10.5 m' in res())
    dv.execute_script("localStorage.setItem('portal_lang','fr');")
    err = [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
           and 'version.json' not in l['message'] and 'favicon' not in l['message']]
    check('aucune erreur JS SEVERE (%d)' % len(err), not err)
    for m in err[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

print('\nRESULTAT :', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
