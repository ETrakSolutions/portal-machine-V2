# -*- coding: utf-8 -*-
"""Non-regression de la « photo » d'une machine (preparation du panier, 2026-09-28).

La construction du courriel de soumission est decoupee en trois morceaux
(photoMachine / texteMachine / assemblage) pour que le futur panier puisse
empiler plusieurs machines. Pour UNE machine, le courriel doit rester IDENTIQUE,
caractere pour caractere. Ce test rejoue des soumissions types et compare
destinataires, objet, corps et bloc Epicor a une reference capturee AVANT le
decoupage :

    python scripts/selenium_photo_machine_test.py --capture ref.json   # sur l'ancien code
    python scripts/selenium_photo_machine_test.py --compare ref.json   # sur le nouveau

Sans argument : verifie seulement que photoMachine() existe et que texteMachine()
recompose le courriel envoye.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8801
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)
CAPTURE = sys.argv[sys.argv.index('--capture') + 1] if '--capture' in sys.argv else None
COMPARE = sys.argv[sys.argv.index('--compare') + 1] if '--compare' in sys.argv else None


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)   # plusieurs requetes a la fois
threading.Thread(target=httpd.serve_forever, daemon=True).start()

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


def js(code, *a):
    return dv.execute_script(code, *a)


def champ(cid, val):
    js("var e=document.getElementById(arguments[0]); if(!e) return; e.value=arguments[1];"
       "e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));", cid, val)


# Chaque scenario : langue, machine (ou None = sans machine), actions, reponse installation.
SCENARIOS = [
    ('CAT 320 hauteur, pose e-Trak', 'fr', ('Excavatrice', 'Caterpillar', '320', '2024'), ['lim-hauteur'], 'oui'),
    ('CAT 320 hauteur, client installe', 'fr', ('Excavatrice', 'Caterpillar', '320', '2024'), ['lim-hauteur'], 'non'),
    ('CAT 320 hauteur + rotation + creusage 2D + laser', 'fr', ('Excavatrice', 'Caterpillar', '320', '2024'),
     ['lim-hauteur', 'lim-rotation', 'creus-2d', 'creus-laser'], 'oui'),
    ('Bobcat E08 mini (1500-0004-Install)', 'fr', ('Excavatrice', 'Bobcat', 'E08', '2015'), ['lim-hauteur'], 'oui'),
    ('Hitachi ZX490LC-6 (ligne libre Z01A-0279)', 'fr', ('Excavatrice', 'Hitachi', 'ZX490LC-6', '2016'), ['lim-hauteur'], 'oui'),
    ('Hitachi ZX48U-5A (item a valider)', 'fr', ('Excavatrice', 'Hitachi', 'ZX48U-5A', '2015'), ['lim-hauteur'], 'oui'),
    ('Retrocaveuse Case 580SN multi-axe', 'fr', ('Retrocaveuse', 'Case', '580SN', '2015'), ['lim-multi'], 'oui'),
    ('Sans machine, camera Quad x7', 'fr', None, ['camera-quad-7'], 'oui'),
    ('CAT 320 hauteur, en anglais', 'en', ('Excavatrice', 'Caterpillar', '320', '2024'), ['lim-hauteur'], 'oui'),
]


def jouer(nom, lang, machine, actions, install):
    dv.get(BASE + '/index.html')
    js(SESSION_TEST_JS + "localStorage.setItem('portal_lang', arguments[0]);", lang)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return typeof machinesData!=='undefined' && Object.keys(machinesData).length>0"
        " && typeof priceData!=='undefined' && Object.keys(priceData).length>0;"))
    js("window.__liens=[]; window.ouvrirLienCourriel=function(u){ window.__liens.push(u); };")
    # Courriels de vente et vendeurs : charges en asynchrone. Sans cette attente, le
    # test envoyait parfois avant (alerte « pas encore charges », ou boite vendeur
    # pas encore affichee -> destinataires differents d'un passage a l'autre).
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return typeof salesEmails!=='undefined' && salesEmails.length>0"
        " && typeof vendeursList!=='undefined' && vendeursList.length>0;"))
    time.sleep(0.5)
    ok = True
    if machine:
        for sid, val in zip(('select-type', 'select-fabricant', 'select-modele', 'select-annee'), machine):
            ok = choisir(sid, val) and ok
    else:
        ok = choisir('select-type', '__sans_machine__')
        time.sleep(0.8)
        champ('soumission-equipement', 'Chargeuse maison')
    time.sleep(0.8)
    for a in actions:
        if a == 'camera-quad-7':
            js("document.getElementById('toggle-camera').click();")
            time.sleep(0.5)
            js("document.getElementById('cam-quad').click();")
            time.sleep(0.5)
            js("var q=document.getElementById('cam-qte'); q.value='7'; q.dispatchEvent(new Event('change',{bubbles:true}));")
        else:
            if a.startswith('creus-'):
                js("var t=document.getElementById('toggle-creusage'); if(t && !t.classList.contains('active')) t.click();")
                time.sleep(0.4)
            js("document.getElementById(arguments[0]).click();", a)
        time.sleep(0.8)
    js("document.getElementById('install-etrak-%s').click();" % install)
    time.sleep(0.5)
    champ('soumission-company', 'Test Claude inc.')
    champ('soumission-client-email', 'client@exemple.com')
    champ('soumission-nb-systemes', '2')
    champ('soumission-lieu', 'Victoriaville')
    champ('soumission-comment', 'Livraison au garage principal.')
    # Vendeur FIXE (la liste se charge en asynchrone : « le premier » variait d'un
    # passage a l'autre et faisait changer destinataires et corps).
    fin = time.time() + 20
    while time.time() < fin and not js(
            "var b=document.getElementById('soumission-vendeur-box'),s=document.getElementById('soumission-vendeur');"
            "if(!b||b.style.display==='none') return true;"
            "for(var i=0;i<s.options.length;i++){ if(s.options[i].value==='rdesrosiers@e-trak.ca'){ s.selectedIndex=i;"
            " s.dispatchEvent(new Event('change',{bubbles:true})); return true; } } return false;"):
        time.sleep(0.3)
    js("window.__lastSoumissionEmail=null; document.getElementById('soumission-submit').click();")
    WebDriverWait(dv, 20).until(lambda d: d.execute_script("return !!window.__lastSoumissionEmail;"))
    time.sleep(0.3)
    m = js("return window.__lastSoumissionEmail;")
    res = {'selection_ok': ok, 'to': m['to'], 'subject': m['subject'], 'body': m['body'],
           'epicor': js("return window.__lastSoumissionEpicor || '';")}
    # Nouveau code : la photo doit exister et recomposer le meme texte machine.
    res['photo'] = js("if (typeof photoMachine !== 'function') return null;"
                      "var p = photoMachine(); return { ok: true, texte: texteMachine(p), p: p };")
    return res


try:
    resultats = {}
    for nom, lang, machine, actions, install in SCENARIOS:
        print('---', nom)
        r = jouer(nom, lang, machine, actions, install)
        check('selection de la machine', r['selection_ok'])
        check('courriel genere (%d caracteres)' % len(r['body']), len(r['body']) > 200)
        resultats[nom] = r
        if r['photo']:
            check('photoMachine() : texte machine contenu tel quel dans le courriel',
                  r['photo']['texte'] and r['photo']['texte'] in r['body'])
            check('photo : bloc Epicor identique a celui du courriel',
                  '\n'.join('%s\t%s' % (l['code'], l['qty']) for l in r['photo']['p']['epicor']) == r['epicor'])
        elif not CAPTURE:
            check('photoMachine() existe', False)

    if CAPTURE:
        json.dump({k: {c: v[c] for c in ('to', 'subject', 'body', 'epicor')} for k, v in resultats.items()},
                  open(CAPTURE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('\nReference ecrite :', CAPTURE, '(%d scenarios)' % len(resultats))
    if COMPARE:
        ref = json.load(open(COMPARE, encoding='utf-8'))
        print('\n--- comparaison avec la reference ---')
        for nom in ref:
            for c in ('to', 'subject', 'body', 'epicor'):
                a, b = ref[nom][c], resultats.get(nom, {}).get(c)
                if a != b:
                    import difflib
                    print('\n'.join(list(difflib.unified_diff((a or '').splitlines(), (b or '').splitlines(),
                                                             'reference', 'nouveau', lineterm=''))[:30]))
                check('%s : %s identique' % (nom, c), a == b)

    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE' and 'mailto' not in e['message'].lower()]
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
