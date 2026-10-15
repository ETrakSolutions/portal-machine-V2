# -*- coding: utf-8 -*-
"""Soumission : « Camera 360 » en une seule case + questionnaire 4 ou 6 cameras + choix du kit
(Steve, 2026-10-14, 2e version).

Regle de la fiche du fournisseur (Panoramic Calibration Camera Installation Instructions) :
la camera de cote doit voir la charte jusqu'au coin le plus eloigne + 1 m de marge.

Verifie :
  1. une seule case « Caméra 360 » visible ; les kits 4 / 6 sont des cases cachees ;
     cocher la case ouvre le questionnaire, statut « 360 (kit à choisir) », aucun kit coche ;
  2. cas du document (3 m, coin a 9 m) -> 4 cameras, bouton « Kit 4 caméras — recommandé » ;
  3. sans kit choisi : envoi bloque (kit360Manquant), questionnaire encadre en rouge ;
  4. bouton Kit 6 -> case 6 cochee, statut « 360 (6 cameras) » ; bouton Kit 4 -> bascule ;
  5. coin a 10 m -> 6 recommande ; le kit deja choisi reste (la personne decide) ;
  6. pieds ; camera trop basse ; hauteur sous le tableau ;
  7. courriel : ligne « Couverture 360 » + code 1300-0004 dans le bloc Epicor ;
  8. panier : l'etat (Camera 360 + kit 6) se restaure ;
  9. cocher « Recul » decoche Camera 360, cache le questionnaire, decoche le kit ;
 10. anglais ; aucune erreur JS SEVERE.

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
    clic = lambda i: dv.execute_script("document.getElementById(arguments[0]).click();", i) or time.sleep(0.4)
    statut = lambda: dv.execute_script("return document.querySelector('#toggle-camera .toggle-status').textContent;")
    classe = lambda i: dv.execute_script("return document.getElementById(arguments[0]).className;", i)
    texte = lambda i: dv.execute_script("return document.getElementById(arguments[0]).textContent;", i)

    print('--- 1) une seule case ---')
    check('kits 4 et 6 caches (inputs hidden)', dv.execute_script(
        "return document.getElementById('cam-360').hidden && document.getElementById('cam-360-6').hidden;"))
    check('questionnaire cache sans Camera 360', not visible('cam-calc'))
    clic('cam-360-choix')
    check('Camera 360 cochee -> questionnaire visible', visible('cam-calc'))
    check('statut « %s »' % statut(), statut() == '360 (kit à choisir)')
    check('aucun kit coche', not coche('cam-360') and not coche('cam-360-6'))

    print('--- 1a) dessin selon le type de machine ---')
    vu = lambda: dv.execute_script("""var g=[...document.querySelectorAll('.cam-schema .sch-veh')].find(g=>g.style.display!=='none');
        return g ? g.getAttribute('data-type') : (document.getElementById('sch-veh-defaut').style.display!=='none' ? 'defaut' : 'rien');""")
    check('type %s -> dessin %s' % (dv.execute_script("return document.getElementById('select-type').value;"), vu()),
          vu() == dv.execute_script("return document.getElementById('select-type').value;"))
    dv.execute_script("var s=document.getElementById('select-type'); s.value='Nacelle'; s.dispatchEvent(new Event('change',{bubbles:true}));"); time.sleep(0.4)
    check('choix Nacelle -> dessin %s' % vu(), vu() == 'Nacelle')
    dv.execute_script("var s=document.getElementById('select-type'); s.value=''; s.dispatchEvent(new Event('change',{bubbles:true}));"); time.sleep(0.4)
    check('aucun type -> camion par defaut (%s)' % vu(), vu() == 'defaut')
    charger()
    clic('cam-360-choix')

    print('--- 1b) longueur totale, hauteur de base, unites ---')
    val = lambda i: dv.execute_script("return document.getElementById(arguments[0]).value;", i)
    def taper(i, v):
        dv.execute_script("var e=document.getElementById(arguments[0]); e.value=arguments[1]; e.dispatchEvent(new Event('input',{bubbles:true}));", i, v)
        time.sleep(0.3)
    check('hauteur de base = 2 (%s)' % val('cam-calc-h'), val('cam-calc-h') == '2')
    taper('cam-calc-total', '11')
    check('totale 11 -> 5,5 et 5,5 (%s / %s)' % (val('cam-calc-av'), val('cam-calc-ar')), val('cam-calc-av') == '5,5' and val('cam-calc-ar') == '5,5')
    check('verdict avec 2 m de haut : 6,5 m <= 8,4 m -> 4 (%s)' % res(), res().startswith('4 caméras'))
    taper('cam-calc-ar', '9')
    check('arriere 9 -> totale 14,5 (%s)' % val('cam-calc-total'), val('cam-calc-total') == '14,5')
    taper('cam-calc-av', '2')
    check('avant 2 -> totale 11 (%s)' % val('cam-calc-total'), val('cam-calc-total') == '11')
    taper('cam-calc-total', '')
    check('totale effacee -> longueurs effacees (%s / %s)' % (val('cam-calc-av'), val('cam-calc-ar')), val('cam-calc-av') == '' and val('cam-calc-ar') == '')
    taper('cam-calc-total', '11')
    taper('cam-calc-ar', '')
    check('arriere efface -> totale effacee (%s)' % val('cam-calc-total'), val('cam-calc-total') == '')
    taper('cam-calc-ar', '9'); taper('cam-calc-av', '2')
    dv.execute_script("var u=document.getElementById('cam-calc-unite'); u.value='pi'; u.dispatchEvent(new Event('change',{bubbles:true}));"); time.sleep(0.3)
    check('passage en pi : 2 m -> 6,56 pi, 11 m -> 36,09 pi (%s / %s)' % (val('cam-calc-h'), val('cam-calc-total')),
          val('cam-calc-h') == '6,56' and val('cam-calc-total') == '36,09')
    dv.execute_script("var u=document.getElementById('cam-calc-unite'); u.value='m'; u.dispatchEvent(new Event('change',{bubbles:true}));"); time.sleep(0.3)
    check('retour en m : 2 et 11 (%s / %s)' % (val('cam-calc-h'), val('cam-calc-total')), val('cam-calc-h') == '2' and val('cam-calc-total') == '11')

    print('--- 2) cas du document ---')
    saisir('3', '2', '9')
    check('3 m / 9 m -> « 4 caméras suffisent », portée 10,5 m (%s)' % res(), res().startswith('4 caméras suffisent') and '10,5 m' in res())
    check('bouton « %s » recommande' % texte('cam-kit-4'), 'reco' in classe('cam-kit-4') and 'recommandé' in texte('cam-kit-4')
          and 'reco' not in classe('cam-kit-6'))

    print('--- 3) blocage sans kit ---')
    check('kit360Manquant() = vrai', dv.execute_script("return window.kit360Manquant();") is True)
    check('questionnaire encadre (manquant) + message « %s »' % texte('cam-kit-msg'),
          'manquant' in classe('cam-calc') and 'Choisissez' in texte('cam-kit-msg'))

    print('--- 4) choix du kit ---')
    clic('cam-kit-6')
    check('Kit 6 : case 6 cochee, statut « %s »' % statut(), coche('cam-360-6') and not coche('cam-360') and '6' in statut())
    check('Kit 6 marque choisi, encadre rouge retire', 'choisi' in classe('cam-kit-6') and 'manquant' not in classe('cam-calc'))
    check('Camera 360 toujours cochee, plus de blocage', coche('cam-360-choix') and dv.execute_script("return window.kit360Manquant();") is False)
    clic('cam-kit-4')
    check('Kit 4 : bascule (4 coche, 6 decoche)', coche('cam-360') and not coche('cam-360-6') and 'choisi' in classe('cam-kit-4'))

    print('--- 5) coin a 10 m ---')
    saisir('3', '2', '10')
    check('6 recommande (%s), kit 4 garde' % res(), res().startswith('6 caméras recommandées')
          and 'reco' in classe('cam-kit-6') and coche('cam-360'))

    print('--- 6) pieds et hauteurs hors regle ---')
    saisir('9.84', '6.56', '32.81', 'pi')
    check('pieds : 6 cameras, valeurs en pi (%s)' % res(), res().startswith('6 caméras') and ' pi)' in res())
    saisir('0.8', '1', '3')
    check('0,8 m : trop basse, minimum 0,87 m (%s)' % res(), 'trop basse' in res() and '0,87 m' in res())
    saisir('1.0', '1', '3')
    check('1,0 m : sous le tableau, connue a partir de 1,35 m (%s)' % res(), 'sous le tableau' in res() and '1,35 m' in res())

    print('--- 7) courriel ---')
    saisir('3', '2', '9')
    dv.execute_script("updateSelectedSummary();")
    ph = dv.execute_script("var p=photoMachine(); return {t: texteMachine(p, true), e: JSON.stringify(p.epicor)};")
    check('ligne « Couverture 360 ... → 4 caméras »', 'Couverture 360 : caméra de côté à 3,0 m' in ph['t'] and '→ 4 caméras' in ph['t'])
    check('code 1300-0004 dans le bloc Epicor (%s)' % ph['e'][:120], '1300-0004' in ph['e'])

    print('--- 8) panier ---')
    clic('cam-kit-6')
    etat = dv.execute_script("return etatEcran();")
    clic('cam-360-choix')
    check('Camera 360 decochee : kit decoche', not coche('cam-360-6') and not coche('cam-360-choix'))
    dv.execute_script("restaurerEtat(arguments[0]);", etat); time.sleep(1.5)
    check('restauration : Camera 360 + kit 6 coches, questionnaire visible',
          coche('cam-360-choix') and coche('cam-360-6') and visible('cam-calc'))

    print('--- 9) Recul ---')
    clic('cam-recul')
    check('Recul : Camera 360 decochee, kit decoche, questionnaire cache, statut « %s »' % statut(),
          not coche('cam-360-choix') and not coche('cam-360-6') and not visible('cam-calc') and statut() == 'Recul')

    print('--- 10) anglais et console ---')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    charger()
    clic('cam-360-choix')
    saisir('3', '2', '9')
    lib = dv.execute_script("return document.querySelector('label [data-i18n=\"soumission.cam_360_choix\"]').textContent;")
    check('EN : case « %s », kit « %s », résultat « %s »' % (lib, texte('cam-kit-4'), res()),
          lib == '360 camera' and texte('cam-kit-4') == '4-camera kit — recommended' and '10.5 m' in res())
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
