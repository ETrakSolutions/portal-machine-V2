# -*- coding: utf-8 -*-
"""Test du repli « demande trop longue pour le lien courriel » (2026-09-28).

Au-dela de MAILTO_MAX (lien encode), le courriel ne s'ouvre plus directement :
limite Windows ~32 000 mesuree le 2026-09-28, et limites inconnues chez les
dealers (Gmail web, nouvel Outlook, Mac). Verifie :
  1. demande normale : lien complet (bloc Epicor + signature), sous MAILTO_MAX ;
  2. demande longue : le lien n'a plus que destinataires + objet + la ligne
     « colle ici », le presse-papiers contient le corps COMPLET, et le panneau
     explique quoi faire ;
  3. copie impossible : AUCUN courriel ouvert (il serait vide), panneau en alerte ;
  4. le panneau suit la bascule FR -> EN ;
  5. aucune erreur JS SEVERE.

    python scripts/selenium_courriel_long_test.py          # clone local
    python scripts/selenium_courriel_long_test.py --live   # site en ligne
"""
import sys, io, os, threading, http.server, socketserver, time
from urllib.parse import unquote
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

sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import installer_prix, SESSION_TEST_JS   # prix : serveur simule

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
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


def choisir(select_id, valeur, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, select_id, valeur):
            return True
        time.sleep(0.3)
    return False


def preparer(commentaire):
    """Soumission CAT 320 2024 prete a envoyer ; le lien courriel est capture."""
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return typeof machinesData!=='undefined' && Object.keys(machinesData).length>0"
        " && typeof priceData!=='undefined' && Object.keys(priceData).length>0;"))
    dv.execute_script("window.__liens=[]; window.ouvrirLienCourriel=function(u){ window.__liens.push(u); };")
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '320'), ('select-annee', '2024')):
        check('selection %s' % val, choisir(sid, val))
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(1.2)
    dv.execute_script("document.getElementById('install-etrak-oui').click();")
    for cid, val in (('soumission-company', 'Test Claude inc.'), ('soumission-nb-systemes', '1'),
                     ('soumission-lieu', 'Victoriaville'), ('soumission-comment', commentaire)):
        dv.execute_script("var e=document.getElementById(arguments[0]); e.value=arguments[1];"
                          "e.dispatchEvent(new Event('input',{bubbles:true}));", cid, val)
    fin = time.time() + 20
    while time.time() < fin and not dv.execute_script(
            "var b=document.getElementById('soumission-vendeur-box'),s=document.getElementById('soumission-vendeur');"
            "if(!b||b.style.display==='none') return true;"
            "for(var i=0;i<s.options.length;i++){ if(s.options[i].value){ s.selectedIndex=i;"
            " s.dispatchEvent(new Event('change',{bubbles:true})); return true; } } return false;"):
        time.sleep(0.3)


def envoyer():
    dv.execute_script("window.__lastSoumissionEmail=null; document.getElementById('soumission-submit').click();")
    WebDriverWait(dv, 20).until(lambda d: d.execute_script("return !!window.__lastSoumissionEmail;"))
    time.sleep(2.2)   # laisse passer armMailtoFallback (1,5 s)
    return dv.execute_script("return window.__liens;")


def panneau():
    return dv.execute_script("var b=document.getElementById('soumission-fallback');"
                             "return b ? {vis: b.style.display!=='none', auto: b.classList.contains('is-auto'),"
                             " txt: b.innerText} : null;")


def corps_du_lien(u):
    return unquote(u.split('&body=', 1)[1]) if '&body=' in u else ''


try:
    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION_TEST_JS + "localStorage.setItem('portal_lang','fr');")
    dv.execute_cdp_cmd('Browser.grantPermissions', {
        'origin': BASE.split('/portal')[0] if SUR_LE_LIVE else BASE,
        'permissions': ['clipboardReadWrite', 'clipboardSanitizedWrite']})
    maxi = None

    print('--- 1) demande normale : lien complet ---')
    preparer('Livraison au garage principal.')
    maxi = dv.execute_script("return MAILTO_MAX;")
    liens = envoyer()
    check('un seul lien courriel ouvert', len(liens) == 1)
    if liens:
        u = liens[0]
        print('     longueur du lien : %d (limite %d)' % (len(u), maxi))
        check('lien sous la limite', len(u) <= maxi)
        corps = corps_du_lien(u)
        check('le lien porte le corps COMPLET (bloc Epicor + signature)',
              dv.execute_script("return i18n.t('email.epicor_header');").strip() in corps
              and 'portal-machine-V2' in corps)
        check('pas de ligne « colle ici »', '[Colle ici' not in corps)
    check('panneau normal, sans message « demande longue »',
          'Demande longue' not in (panneau() or {}).get('txt', ''))

    print('--- 2) demande longue : copie + courriel a coller ---')
    phrase = 'Le client veut une installation sur deux quarts, avec un suivi ecrit a chaque etape. '
    long_txt = (phrase * (maxi // len(phrase) + 1)).strip()   # depasse le seuil a coup sur
    preparer(long_txt)
    liens = envoyer()
    check('un seul lien courriel ouvert', len(liens) == 1)
    complet = dv.execute_script("return window.__lastSoumissionEmail.body;")
    if liens:
        u = liens[0]
        print('     demande complete : %d caracteres ; lien ouvert : %d' % (len(complet), len(u)))
        check('le lien est court (sous la limite)', len(u) <= maxi)
        check('il garde les destinataires et l objet',
              u.startswith('mailto:') and '?subject=' in u and '@' in u.split('?')[0])
        check('il porte la ligne « colle ici »', corps_du_lien(u).startswith('[Colle ici la demande complète'))
    presse = dv.execute_async_script(
        "var cb=arguments[0]; navigator.clipboard.readText().then(cb).catch(function(e){cb('ERR '+e);});")
    # Windows rend le presse-papiers en CRLF : on compare le texte, pas les fins de ligne.
    check('presse-papiers = corps COMPLET de la demande', presse.replace('\r\n', '\n') == complet)
    check('... avec le commentaire et le bloc Epicor', long_txt in presse and '1500-0001-install\t' in presse)
    p = panneau()
    # Sans navigateur visible, aucun logiciel de courriel ne prend le relais : le panneau
    # passe en « ne s'est pas ouvert », mais doit quand meme dire que tout est copie.
    check('panneau visible', p and p['vis'])
    check('il dit que la demande est copiee et de coller avec Ctrl+V',
          p and ('Demande longue' in p['txt'] or 'déjà copiée' in p['txt']) and 'Ctrl+V' in p['txt'])

    print('--- 3) copie impossible : aucun courriel vide ---')
    preparer(long_txt)
    dv.execute_script("navigator.clipboard.writeText=function(){return Promise.reject(new Error('refus'));};"
                      "document.execCommand=function(){return false;};")
    liens = envoyer()
    check('aucun lien courriel ouvert', len(liens) == 0)
    p = panneau()
    check('panneau en alerte', p and p['vis'] and p['auto'])
    check('il dit de cliquer « Copier la demande »', p and 'copie automatique' in p['txt'] and 'Copier la demande' in p['txt'])

    print('--- 4) bascule en anglais ---')
    dv.execute_script("localStorage.setItem('portal_lang','en'); window.dispatchEvent(new Event('langchange'));")
    time.sleep(0.5)
    p = panneau()
    check('titre du panneau en anglais', p and 'Long request' in p['txt'])
    dv.execute_script("localStorage.setItem('portal_lang','fr');")

    print('--- 5) console propre ---')
    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE'
            and 'mailto' not in e['message'].lower()]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:4]:
        print('     ', e['message'][:220])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails:
    print('  -', f)
sys.exit(1 if fails else 0)
