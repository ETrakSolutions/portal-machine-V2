# -*- coding: utf-8 -*-
"""Test de la charpente du type « Tracteur » (avant tout modele).

Verifie que le type est cable partout cote frontend et que la soumission se
comporte comme decide : Scale Lite seule, sans imprimante, sans limiteur.
Le type est encore VIDE (aucun modele) : on teste donc le cablage, pas le
contenu.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8801
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

TYPE = 'Tracteur'
MJ = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1100']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(l, c):
    print(('  [OK] ' if c else '  [X ] ') + l)
    if not c:
        fails.append(l)


def visible(eid):
    """Visibilite REELLE : offsetParent est null des qu'un ancetre est masque.
    Regarder seulement le display de l'element ferait passer pour visible une
    case dont toute la section parente est cachee."""
    return dv.execute_script(
        "var e=document.getElementById(arguments[0]);"
        "return !!e && e.offsetParent !== null;", eid)


def offerte(eid):
    """Une sous-option vit dans un panneau replie tant que la tuile n'est pas
    ouverte : offsetParent y est toujours null. On lit donc le display de la
    case (ou de son libelle) et celui de la tuile, pas la visibilite a l'ecran."""
    return dv.execute_script(
        "var e=document.getElementById(arguments[0]); if(!e) return false;"
        "var l=e.tagName==='INPUT' ? e.closest('.sub-option') : e;"
        "var b=document.getElementById('toggle-balance');"
        "return l.style.display!=='none' && b.style.display!=='none';", eid)


def choisir_machine(typ):
    fabs = [f for f in MJ[typ] if not f.startswith('_')]
    f = fabs[0]; y = sorted(MJ[typ][f])[0]; m = list(MJ[typ][f][y])[0]
    for sid, val in (('select-type', typ), ('select-fabricant', f),
                     ('select-modele', m), ('select-annee', y)):
        dv.execute_script(
            "var s=document.getElementById(arguments[0]);"
            "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
            "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); } }",
            sid, val)
        time.sleep(0.8)
    time.sleep(1.5)


try:
    print('--- 1) donnees ---')
    check('type present dans machines.json', TYPE in MJ)
    check('catalogue = 1200-0020 Scale Lite (avec cabine)',
          any((v or {}).get('pn') == '1200-0020' for v in MJ[TYPE]['_bom_labels'].values()))
    check('catalogue = 1200-0023 Scale Lite sans cabine',
          any((v or {}).get('pn') == '1200-0023' for v in MJ[TYPE]['_bom_labels'].values()))
    check('fichier overrides cree',
          os.path.exists(os.path.join(REPO, 'data', 'overrides', 'tracteur.json')))

    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T',"
                      " permissions:{modifBom:true, voirPrix:true, modifAccounts:true}}));")

    print('--- 2) slug et libelles ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    slug = dv.execute_script("return (window.ETRAK_TYPE_SLUGS || {})['%s'];" % TYPE)
    check('slug = tracteur (%s)' % slug, slug == 'tracteur')
    lib = dv.execute_script("return (typeof i18n!=='undefined') ? i18n.t('type.%s') : null;" % TYPE)
    check('libelle FR resolu (%s)' % lib, lib == TYPE)

    print('--- 3) present dans les menus ---')
    for page, sid in (('machine.html', 'select-type'), ('database.html', 'db-type')):
        dv.get(BASE + '/' + page)
        WebDriverWait(dv, 40).until(lambda d: len(
            d.find_elements(By.CSS_SELECTOR, '#' + sid + ' option')) > 3)
        vals = [o.get_attribute('value') for o in dv.find_elements(By.CSS_SELECTOR, '#' + sid + ' option')]
        check('%-18s propose le type' % page, TYPE in vals)

    # soumission.html filtre les types via une LISTE BLANCHE SERVEUR
    # (cle soumission_allowed_types, geree dans le panneau Administration).
    # Tant que le type n'y est pas ajoute, il n'apparait pas — ce n'est pas un
    # defaut de code mais une etape de configuration.
    dv.get(BASE + '/soumission.html')
    time.sleep(6)
    vals = [o.get_attribute('value') for o in dv.find_elements(By.CSS_SELECTOR, '#select-type option')]
    if TYPE in vals:
        print('  [OK] soumission.html propose le type (liste blanche a jour)')
    else:
        print('  [--] soumission.html ne le propose pas encore : a ajouter dans')
        print('       Administration > types autorises (cle soumission_allowed_types).')

    print('--- 4) comportement en soumission ---')
    # La section des options ne s'affiche qu'une fois une MACHINE choisie. Tant
    # que le type n'a aucun modele, ce volet n'est pas testable : on le declare
    # explicitement plutot que de le faire passer a vide.
    fabricants = [f for f in MJ[TYPE] if not f.startswith('_')]
    if not fabricants:
        print('  [--] type encore vide (0 fabricant) : volet non testable tant que')
        print('       les modeles ne sont pas importes. A relancer apres la recherche.')
    else:
        f0 = fabricants[0]
        y0 = sorted(MJ[TYPE][f0])[0]
        m0 = list(MJ[TYPE][f0][y0])[0]
        dv.get(BASE + '/soumission.html')
        WebDriverWait(dv, 40).until(lambda d: d.execute_script(
            "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
        for sid, val in (('select-type', TYPE), ('select-fabricant', f0),
                         ('select-modele', m0), ('select-annee', y0)):
            dv.execute_script(
                "var s=document.getElementById(arguments[0]);"
                "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
                "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); } }",
                sid, val)
            time.sleep(0.8)
        time.sleep(1.5)
        check('bloc Balance visible', visible('toggle-balance'))
        check('Scale Lite avec cabine proposee', offerte('sub-bal-scalelite'))
        check('balance loader MASQUEE', not visible('bal-loader'))
        check('balance valise MASQUEE', not visible('bal-valise'))
        check('imprimante thermique MASQUEE', not visible('bal-imp-therm'))
        check('imprimante carbone MASQUEE', not visible('bal-imp-carb'))
        check('bloc Limiteur masque', not visible('toggle-limiteur'))

        # 2026-10-16 : titre « Balance Scale Lite » (plus « ST-7 ») au tracteur, et
        # deux variantes exclusives : 0020 avec cabine, 0023 sans cabine.
        titre = lambda: dv.execute_script(
            "return document.querySelector('#toggle-balance .toggle-label').textContent.trim();")
        check('titre = Balance Scale Lite (%s)' % titre(), titre() == 'Balance Scale Lite')
        check('variante sans cabine proposee', offerte('sub-bal-scalelite-sc'))
        def cocher(eid):
            dv.execute_script("var c=document.getElementById(arguments[0]); c.click();", eid)
            time.sleep(0.6)
        def resume():
            return dv.execute_script(
                "var e=document.getElementById('selected-summary')||document.body; return e.innerText;")
        cocher('bal-scalelite')
        r = resume()
        check('avec cabine -> 1200-0020 au resume', '1200-0020' in r and '1200-0023' not in r)
        cocher('bal-scalelite-sc')
        r = resume()
        check('sans cabine -> 1200-0023 seul (exclusif)', '1200-0023' in r and '1200-0020' not in r)
        check('une seule case cochee', dv.execute_script(
            "return document.querySelectorAll('input[name=\"balance-type\"]:checked').length;") == 1)
        # retour a une vraie machine Loader : le titre redevient ST-7
        choisir_machine('Loader')
        check('Loader : titre = Balance ST-7 (%s)' % titre(), titre() == 'Balance ST-7')
        check('Loader : Scale Lite masquee', not offerte('sub-bal-scalelite') and not offerte('sub-bal-scalelite-sc'))
        check('Loader : balance loader offerte', offerte('bal-loader'))

    errs = [e for e in dv.get_log('browser')
            if e['level'] == 'SEVERE' and 'beforeunload' not in e.get('message', '')]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:4]:
        print('     ', e['message'][:220])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
