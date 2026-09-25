# -*- coding: utf-8 -*-
"""Soumission : « Ajout fabricant non repertorie » (Robert, 2026-09-25).

Un fabricant absent de la BD ne laissait aucun moyen de demander sa machine.

Verifie :
  1. l'option est la DERNIERE de la liste des fabricants, pour chaque type (FR) ;
  2. la choisir ouvre la fenetre avec trois champs (fabricant, modele, annee) ;
  3. champs vides / annee invalide : bordure rouge, pas de panneau ;
  4. un fabricant deja connu, tape avec une autre casse (« caterpillar ») :
     le fabricant existant est selectionne, aucune demande de doublon ;
  5. un vrai nouveau fabricant : panneau « n'est pas dans la base » puis
     demande enregistree avec type / fabricant / modele / annee (ecriture
     INTERCEPTEE : rien n'est ecrit dans la vraie liste machine_requests) ;
  6. Annuler remet la liste des fabricants a vide ;
  7. « Autre modele » d'un fabricant connu : toujours sans champ fabricant ;
  8. libelle EN ; aucune erreur JS SEVERE.

    py -3.13 scripts/selenium_autre_fabricant_test.py [--live]
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
# Toute ECRITURE vers le backend est interceptee et memorisee ; les lectures passent.
dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': """
  window.__ecrits = []; var vrai = window.fetch.bind(window);
  window.fetch = function (u, o) {
    var body = o && typeof o.body === 'string' ? o.body : '';
    if (/"action":"(save|sendsoumission)"/.test(body)) {
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


def modal_ouverte():
    return dv.execute_script("return !!document.getElementById('custom-model-modal');")


def remplir(fab, modele, annee):
    dv.execute_script("""
      var f=document.getElementById('custom-fab-name'); if (f) f.value=arguments[0];
      document.getElementById('custom-model-name').value=arguments[1];
      document.getElementById('custom-model-year').value=arguments[2];
      document.getElementById('modal-create').click();""", fab, modele, annee)
    time.sleep(0.5)


try:
    dv.get(BASE + '/index.html?guest=1')
    time.sleep(1.5)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))

    print('--- 1) l option est la derniere de la liste, pour chaque type ---')
    types = dv.execute_script("return Array.from(document.getElementById('select-type').options)"
                              ".map(function(o){return o.value;}).filter(function(v){return v && v !== SANS_MACHINE;});")
    libelle_fr = dv.execute_script("return i18n.t('soum.other_fab');")
    mauvais = []
    for ty in types:
        choisir('select-type', ty)
        der = dv.execute_script("var o=document.getElementById('select-fabricant').options; var d=o[o.length-1];"
                                "return [d.value, d.textContent];")
        if der != ['__OTHER_FAB__', libelle_fr]:
            mauvais.append((ty, der))
    check('%d types : derniere option = « %s »' % (len(types), libelle_fr), not mauvais and len(types) > 5)
    for m in mauvais[:5]:
        print('      ', m)

    print('--- 2) la fenetre a trois champs ---')
    choisir('select-type', 'Excavatrice')
    choisir('select-fabricant', '__OTHER_FAB__')
    time.sleep(0.4)
    check('fenetre ouverte', modal_ouverte())
    check('champ fabricant present et actif', dv.execute_script(
        "return !!document.getElementById('custom-fab-name') && document.activeElement.id === 'custom-fab-name';"))
    check('champs modele et annee presents', dv.execute_script(
        "return !!document.getElementById('custom-model-name') && !!document.getElementById('custom-model-year');"))

    print('--- 3) validation ---')
    remplir('', 'X1', '2026')
    check('fabricant vide : bordure rouge, fenetre toujours ouverte', modal_ouverte() and dv.execute_script(
        "return document.getElementById('custom-fab-name').style.borderColor === 'red';"))
    remplir('Zzfab Test', 'X1', '26')
    check('annee invalide : bordure rouge, fenetre toujours ouverte', modal_ouverte() and dv.execute_script(
        "return document.getElementById('custom-model-year').style.borderColor === 'red';"))

    print('--- 4) fabricant deja connu, autre casse ---')
    remplir('  caterpillar ', '', '')
    check('fenetre fermee', not modal_ouverte())
    check('le fabricant existant « Caterpillar » est selectionne',
          dv.execute_script("return selectFabricant.value;") == 'Caterpillar')
    check('ses modeles sont proposes', dv.execute_script("return selectModele.options.length;") > 3)
    check('aucune demande ecrite', dv.execute_script("return window.__ecrits.length;") == 0)

    print('--- 5) vrai nouveau fabricant : demande enregistree ---')
    choisir('select-fabricant', '__OTHER_FAB__')
    time.sleep(0.4)
    remplir('Zzfab Test', 'ZX 200', '2026')
    txt = dv.execute_script("var p=document.getElementById('soumission-request-panel'); return p ? p.textContent : '';")
    check('panneau « Zzfab Test ZX 200 (2026) ... » affiche', 'Zzfab Test ZX 200 (2026)' in txt)
    dv.execute_script("document.getElementById('soum-db-request-btn').click();")
    WebDriverWait(dv, 30).until(lambda d: d.execute_script("return window.__ecrits.length > 0;"))
    ecr = dv.execute_script("return window.__ecrits;")
    mr = [e for e in ecr if e.get('key') == 'machine_requests']
    derniere = json.loads(mr[0]['value'])[-1] if mr else {}
    check('demande : Excavatrice / Zzfab Test / ZX 200 / 2026 / active (%s)' % {k: derniere.get(k) for k in ('type', 'fab', 'modele', 'annee', 'status')},
          derniere.get('type') == 'Excavatrice' and derniere.get('fab') == 'Zzfab Test'
          and derniere.get('modele') == 'ZX 200' and str(derniere.get('annee')) == '2026'
          and derniere.get('status') == 'active')
    check('les demandes deja existantes sont conservees (%d)' % (len(json.loads(mr[0]['value'])) - 1 if mr else -1),
          bool(mr) and len(json.loads(mr[0]['value'])) > 1)

    print('--- 6) Annuler ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    choisir('select-type', 'Excavatrice')
    choisir('select-fabricant', '__OTHER_FAB__')
    time.sleep(0.4)
    dv.execute_script("document.getElementById('modal-cancel').click();")
    time.sleep(0.3)
    check('fenetre fermee, liste des fabricants remise a vide',
          not modal_ouverte() and dv.execute_script("return selectFabricant.value;") == '')

    print('--- 7) « Autre modele » inchange ---')
    choisir('select-fabricant', 'Caterpillar')
    choisir('select-modele', '__OTHER__')
    time.sleep(0.4)
    check('fenetre ouverte, SANS champ fabricant', modal_ouverte() and dv.execute_script(
        "return !document.getElementById('custom-fab-name');"))
    dv.execute_script("document.getElementById('modal-cancel').click();")

    print('--- 8) anglais et console ---')
    dv.execute_script("i18n.setLang('en');")
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    choisir('select-type', 'Excavatrice')
    lib_en = dv.execute_script("var o=document.getElementById('select-fabricant').options; return o[o.length-1].textContent;")
    check('libelle EN = « %s »' % lib_en, lib_en == '⊕ Add unlisted manufacturer')
    dv.execute_script("i18n.setLang('fr');")
    err = [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
           and 'version.json' not in l['message'] and 'favicon' not in l['message']]
    check('aucune erreur JS SEVERE (%d)' % len(err), not err)
    for m in err[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
