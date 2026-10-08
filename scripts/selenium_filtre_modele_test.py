# -*- coding: utf-8 -*-
"""Soumission : menu Modele avec filtre, en UNE case (Steve, 2026-10-08, 3e version).

La case ressemble aux autres menus : un clic ouvre la liste complete, taper (« 350 ») ne
garde que les modeles qui contiennent le texte. Le vrai <select> reste cache dans la page.

Verifie (invite, rien n'est ecrit) :
  1. la case est alignee avec les autres menus, grisee sans fabricant, active ensuite ;
  2. clic : liste complete (tous les modeles + « Autre modele ») ;
  3. « 350 » : seulement les modeles contenant 350, en-tete « N modele(s) contenant » ;
  4. casse, espaces, tirets ignores : Develon « dx 140 » -> tous les DX140... ;
  5. aucun resultat : « Aucun modele », seul « Autre modele » ;
  6. clic sur un resultat : modele choisi, annee remplie, la case affiche le modele ;
  7. fleche bas + Entree : 2e resultat choisi ;
  8. Echap : liste fermee, la case remontre le modele choisi ;
  9. « Autre modele » ouvre la fenetre de demande ;
 10. le code qui ecrit selectModele.value (panier, Annuler) met la case a jour ;
 11. changer de fabricant vide la case ;
 12. EN : texte de la case traduit ; aucune erreur JS SEVERE.

    py -3.12 scripts/selenium_filtre_modele_test.py [--live]
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8796
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
dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': """
  window.__ecrits = []; var vrai = window.fetch.bind(window);
  window.fetch = function (u, o) {
    var body = o && typeof o.body === 'string' ? o.body : '';
    if (/"action":"(save|saveModel|sendsoumission)"/.test(body)) {
      window.__ecrits.push(JSON.parse(body));
      return Promise.resolve(new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } }));
    }
    return vrai(u, o);
  };"""})

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


def charger():
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))


def taper(txt):
    f = dv.find_element('id', 'filtre-modele')
    f.clear()
    if txt:
        f.send_keys(txt)
    time.sleep(0.2)


def options():
    return dv.execute_script("return Array.from(selectModele.options).map(function(o){return [o.value,o.textContent];});")


def liste_ouverte():
    return dv.execute_script("var l=document.getElementById('filtre-modele-resultats'); return !!l && !l.hidden;")


def resultats():
    return dv.execute_script("""var l=document.getElementById('filtre-modele-resultats');
      var it=Array.from(l.querySelectorAll('.filtre-item'));
      return { entete: (l.querySelector('.filtre-entete')||{}).textContent || '',
               items: it.map(function(x){return x.textContent;}), valeurs: it.map(function(x){return x.getAttribute('data-valeur');}) };""")


try:
    dv.get(BASE + '/index.html?guest=1')
    time.sleep(1.5)
    charger()
    case = lambda: dv.find_element('id', 'filtre-modele')
    texte_case = lambda: dv.execute_script("return document.getElementById('filtre-modele').value;")

    print('--- 1) une case alignee ---')
    choisir('select-type', 'Excavatrice')
    check('grisee sans fabricant', dv.execute_script("return document.getElementById('filtre-modele').disabled;"))
    choisir('select-fabricant', 'Takeuchi')
    check('active apres le fabricant', not dv.execute_script("return document.getElementById('filtre-modele').disabled;"))
    check('alignee avec le menu Fabricant (meme hauteur, meme ligne)', dv.execute_script(
        "var a=document.getElementById('filtre-modele').getBoundingClientRect(), b=selectFabricant.getBoundingClientRect();"
        "return Math.abs(a.top-b.top) < 2 && Math.abs(a.height-b.height) < 3;"))
    check('le vrai menu est cache', dv.execute_script("return selectModele.getBoundingClientRect().width <= 2;"))
    check('un seul menu Modele dans la page, Annee sur la meme ligne', dv.execute_script(
        "return document.querySelectorAll('#select-modele').length === 1 &&"
        " Math.abs(selectAnnee.getBoundingClientRect().top - selectFabricant.getBoundingClientRect().top) < 2;"))
    tous = [v for v, _ in options() if v and v != '__OTHER__']

    print('--- 2) clic : liste complete ---')
    case().click()
    time.sleep(0.3)
    r = resultats()
    check('liste ouverte, %d modeles + « Autre modele »' % (len(r['items']) - 1),
          liste_ouverte() and r['valeurs'][:-1] == tous and r['valeurs'][-1] == '__OTHER__' and not r['entete'])

    print('--- 3) « 350 » ---')
    case().send_keys('350')
    time.sleep(0.2)
    r = resultats()
    attendus = [m for m in tous if '350' in m]
    check('seuls les modeles contenant 350 (%s)' % ', '.join(r['items'][:-1]), r['items'][:-1] == attendus and len(attendus) >= 2)
    check('en-tete « %s »' % r['entete'], str(len(attendus)) in r['entete'] and '350' in r['entete'])

    print('--- 4) casse, espaces, tirets ---')
    case().send_keys(Keys.ESCAPE)
    choisir('select-fabricant', 'Develon (Doosan)')
    time.sleep(0.3)
    case().click(); case().send_keys('dx 140'); time.sleep(0.2)
    r = resultats()
    check('« dx 140 » -> %d modeles, tous DX140' % (len(r['items']) - 1),
          len(r['items']) - 1 >= 4 and all(m.upper().replace(' ', '').startswith('DX140') for m in r['items'][:-1]))

    print('--- 5) aucun resultat ---')
    case().send_keys(Keys.CONTROL, 'a'); case().send_keys('zzz999'); time.sleep(0.2)
    r = resultats()
    check('« %s », seul « Autre modele »' % r['entete'], 'Aucun' in r['entete'] and r['valeurs'] == ['__OTHER__'])

    print('--- 6) clic sur un resultat ---')
    case().send_keys(Keys.CONTROL, 'a'); case().send_keys('140lcr7'); time.sleep(0.2)
    dv.execute_script("var li=document.querySelector('#filtre-modele-resultats .filtre-item');"
                      "li.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));")
    time.sleep(0.8)
    check('DX140LCR-7 choisi, annee remplie (%s / %s)' % tuple(dv.execute_script("return [selectModele.value, selectAnnee.value];")),
          dv.execute_script("return selectModele.value === 'DX140LCR-7' && !!selectAnnee.value;"))
    check('la case affiche « %s », liste fermee' % texte_case(), texte_case() == 'DX140LCR-7' and not liste_ouverte())

    print('--- 7) fleche bas + Entree ---')
    choisir('select-fabricant', 'Takeuchi')
    time.sleep(0.3)
    case().click(); case().send_keys('350'); time.sleep(0.2)
    deuxieme = resultats()['items'][1]
    case().send_keys(Keys.ARROW_DOWN); case().send_keys(Keys.ENTER)
    time.sleep(0.8)
    check('2e resultat choisi : %s (%s)' % (deuxieme, dv.execute_script("return selectModele.value;")),
          dv.execute_script("return selectModele.value;") == deuxieme and texte_case() == deuxieme)

    print('--- 8) Echap ---')
    case().click(); case().send_keys('zz'); time.sleep(0.2)
    case().send_keys(Keys.ESCAPE)
    time.sleep(0.4)
    check('liste fermee, la case remontre %s (%s)' % (deuxieme, texte_case()), not liste_ouverte() and texte_case() == deuxieme)

    print('--- 9) « Autre modele » ---')
    case().click(); case().send_keys('zzz999'); time.sleep(0.2)
    dv.execute_script("var li=document.querySelector('#filtre-modele-resultats .filtre-autre');"
                      "li.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));")
    time.sleep(0.6)
    check('fenetre de demande ouverte', dv.execute_script("return !!document.getElementById('custom-model-modal');"))
    dv.execute_script("var b=document.getElementById('modal-cancel'); if (b) b.click();")
    time.sleep(0.3)
    check('Annuler : case vide', texte_case() == '')

    print('--- 10) le code qui ecrit le menu met la case a jour ---')
    dv.execute_script("selectModele.value = 'TB350R';")
    check('selectModele.value = TB350R -> case « %s »' % texte_case(), texte_case() == 'TB350R')
    dv.execute_script("selectModele.value = '';")
    check('selectModele.value = vide -> case vide', texte_case() == '')

    print('--- 11) changer de fabricant ---')
    choisir('select-modele', 'TB350R')
    time.sleep(0.5)
    choisir('select-fabricant', 'Develon (Doosan)')
    time.sleep(0.4)
    check('case vide, liste fermee', texte_case() == '' and not liste_ouverte())
    check('aucune ecriture', dv.execute_script("return window.__ecrits.length;") == 0)

    print('--- 12) anglais et console ---')
    dv.execute_script("i18n.setLang('en');")
    charger()
    ph = dv.execute_script("return document.getElementById('filtre-modele').placeholder;")
    check('texte EN « %s »' % ph, ph == '-- Select or type --')
    dv.execute_script("i18n.setLang('fr');")
    err = [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
           and 'version.json' not in l['message'] and 'favicon' not in l['message']]
    check('aucune erreur JS SEVERE (%d)' % len(err), not err)
    for m in err[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

print('\nRESULTAT :', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
