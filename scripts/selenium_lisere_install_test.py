# -*- coding: utf-8 -*-
"""Liseré ambré + mention « réponse requise » sur « Installation par e-Trak ? ».

Ce que le test prouve, a l'ecran et non dans le DOM seul :
  1. la boite n'apparait que si la selection contient une pose facturable ;
  2. des qu'elle apparait SANS reponse, elle porte le liseré ambré et la mention ;
  3. au PREMIER clic (Oui comme Non), les deux disparaissent ;
  4. l'encadre ROUGE de l'envoi refuse l'emporte toujours sur l'ambre ;
  5. la mention est traduite en anglais, y compris sur bascule a chaud.
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
PORT = 8793
BASE = 'http://127.0.0.1:%d' % PORT


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CH = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
      "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
      "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
      "return false;")


def choisir(sid, val, delai=30):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CH, sid, val):
            return True
        time.sleep(0.3)
    return False


ETAT = """
  var b=document.getElementById('install-question-box');
  var h=document.getElementById('install-q-hint');
  if(!b) return null;
  var cs=getComputedStyle(b);
  return {boite_visible: b.offsetParent!==null,
          classe_ambre: b.classList.contains('install-q-required'),
          bordure: cs.borderTopColor, largeur: cs.borderTopWidth,
          fond: cs.backgroundColor,
          mention_visible: !!h && h.offsetParent!==null,
          mention_texte: h ? h.textContent.trim() : null};
"""


def etat():
    """Ce que l'utilisateur VOIT : couleur calculee du liseré, texte et visibilite
    reelle de la mention (offsetParent, pas seulement l'attribut hidden)."""
    return dv.execute_script(ETAT)


def aller(lang='fr'):
    dv.get(BASE + '/soumission.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e-trak', name:'Test'}));")
    dv.execute_script("localStorage.setItem('portal_lang', arguments[0]);", lang)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData||{}).length > 0;"))


def machine():
    for sid, val in (('select-type', 'Loader'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '980 XE'), ('select-annee', '2024')):
        assert choisir(sid, val), sid
    time.sleep(1.2)


def cocher(cid):
    return dv.execute_script(
        "var c=document.getElementById(arguments[0]); if(!c) return false;"
        "c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); return true;", cid)


AMBRE = 'rgb(255, 170, 0)'
ROUGE = 'rgb(255, 68, 68)'
try:
    print('\n1) Avant toute selection d option - la question ne se pose pas')
    aller('fr')
    machine()
    e = etat()
    check('boite masquee tant que rien n est a installer', not e['boite_visible'])
    check('mention masquee aussi', not e['mention_visible'])

    print('\n2) Une option avec pose -> liseré et mention, sans avoir clique Envoyer')
    cocher('bal-loader')
    time.sleep(1.2)
    e = etat()
    check('boite visible', e['boite_visible'])
    check('classe install-q-required posee', e['classe_ambre'])
    check('bordure ambre calculee (%s)' % e['bordure'], e['bordure'] == AMBRE)
    check('fond ambre tres pale (%s)' % e['fond'], '255, 170, 0' in e['fond'])
    check('mention visible a l ecran', e['mention_visible'])
    check('mention = reponse requise (%r)' % e['mention_texte'],
          e['mention_texte'] == 'réponse requise')
    dv.save_screenshot(os.path.join(REPO, 'scripts', '_lisere_fr_avant.png'))

    print('\n3) Premier clic sur Non -> tout disparait')
    cocher('install-etrak-non')
    time.sleep(0.8)
    e = etat()
    check('classe retiree', not e['classe_ambre'])
    check('bordure revenue au gris neutre (%s)' % e['bordure'], e['bordure'] != AMBRE)
    check('mention masquee', not e['mention_visible'])

    print('\n4) Retour a sans-reponse -> le liseré revient')
    dv.execute_script("document.querySelectorAll('input[name=install-etrak]')"
                      ".forEach(function(r){r.checked=false;}); updateSelectedSummary();")
    time.sleep(0.6)
    e = etat()
    check('liseré de retour', e['classe_ambre'] and e['bordure'] == AMBRE)
    check('mention de retour', e['mention_visible'])

    print('\n5) Envoi refuse -> le ROUGE l emporte sur l ambre')
    dv.execute_script("var b=document.getElementById('soumission-submit'); if(b) b.click();")
    time.sleep(0.8)
    e = etat()
    check('bordure rouge (%s)' % e['bordure'], e['bordure'] == ROUGE)
    check('epaisseur 2px (%s)' % e['largeur'], e['largeur'] == '2px')
    check('mention toujours la (rien n est repondu)', e['mention_visible'])
    dv.save_screenshot(os.path.join(REPO, 'scripts', '_lisere_fr_rouge.png'))

    print('\n6) En anglais')
    aller('en')
    machine()
    cocher('bal-loader')
    time.sleep(1.2)
    e = etat()
    check('mention visible', e['mention_visible'])
    check('mention = answer required (%r)' % e['mention_texte'],
          e['mention_texte'] == 'answer required')
    check('liseré aussi en anglais', e['bordure'] == AMBRE)
    dv.save_screenshot(os.path.join(REPO, 'scripts', '_lisere_en_avant.png'))

    print('\n7) Bascule de langue A CHAUD (le piege du contenu genere en JS)')
    dv.execute_script("i18n.setLang('fr');")
    time.sleep(0.8)
    e = etat()
    check('mention retraduite en FR sans rechargement (%r)' % e['mention_texte'],
          e['mention_texte'] == 'réponse requise')
    check('mention toujours visible apres la bascule', e['mention_visible'])

    print('\n8) Aucune erreur JS')
    errs = [l for l in dv.get_log('browser') if l['level'] == 'SEVERE'
            and 'favicon' not in l['message'] and 'script.google' not in l['message']]
    for l in errs:
        print('     ' + l['message'][:200])
    check('console sans erreur SEVERE', not errs)
finally:
    print('\n' + ('TOUT VERT' if not fails else 'ECHECS (%d) : %s' % (len(fails), fails)))
    dv.quit()
    httpd.shutdown()
    sys.exit(1 if fails else 0)
