# -*- coding: utf-8 -*-
"""Demande d'ajout : verifier d'abord que la machine n'existe pas deja (Steve, 2026-10-08).

Le 8 octobre, Simon a demande « DX140lcr-7 (2026) » : la base a DX140LCR-7 pour 2026. Le
modele n'etait compare qu'a l'identique. js/machine-match.js compare sans casse, espaces ni
tirets, deplie « DX140LC-5 / -7 » et propose les modeles proches.

Soumission (invite) :
  1. « DX140lcr-7 » 2026 : fenetre « deja dans la base », Ouvrir -> DX140LCR-7 / 2026
     selectionnes, aucune demande ecrite ;
  2. « TB350CR » 2025 : machines semblables (TB350CR 2026, TB350R) ; « Aucune de celles-ci,
     continuer » -> panneau de demande ; choisir TB350R ouvre TB350R ;
  3. Annuler dans la liste : fenetre fermee, modele remis a vide ;
  4. modele inconnu « ZZ999 » : panneau de demande tout de suite (comportement d'avant).
Page Machine (invite) : « Nouveau modele » « dx140lcr-7 » sur 2026 -> deja dans la base.
Ecritures INTERCEPTEES : rien n'est ecrit dans la vraie liste. Aucune erreur JS SEVERE.

    py -3.13 scripts/selenium_machine_existante_test.py [--live]
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8798
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


def modal_texte():
    return dv.execute_script("var m=document.getElementById('custom-model-modal'); return m ? m.textContent : null;")


def charger(page):
    dv.get(BASE + '/' + page)
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))


def demande_soumission(fab, modele, annee):
    charger('soumission.html')
    choisir('select-type', 'Excavatrice')
    choisir('select-fabricant', fab)
    choisir('select-modele', '__OTHER__')
    time.sleep(0.4)
    dv.execute_script("""
      document.getElementById('custom-model-name').value=arguments[0];
      document.getElementById('custom-model-year').value=arguments[1];
      document.getElementById('modal-create').click();""", modele, annee)
    time.sleep(0.5)


def bouton(texte_partiel):
    return dv.execute_script("""
      var t=arguments[0], b=[...document.querySelectorAll('#custom-model-modal [data-mm]')].find(function(x){return x.textContent.indexOf(t)>=0;});
      if (b) { b.click(); return true; } return false;""", texte_partiel)


try:
    dv.get(BASE + '/index.html?guest=1')
    time.sleep(1.5)

    print('--- 1) Soumission : DX140lcr-7 (2026) existe deja ---')
    demande_soumission('Develon (Doosan)', 'DX140lcr-7', '2026')
    txt = modal_texte() or ''
    check('fenetre « deja dans la base » avec DX140LCR-7 (2026)', 'déjà dans la base' in txt and 'DX140LCR-7' in txt and '2026' in txt)
    check('pas de bouton « continuer » (meme machine)', not dv.execute_script(
        "return !!document.querySelector('#custom-model-modal [data-mm=continuer]');"))
    check('clic « Ouvrir cette machine »', bouton('Ouvrir'))
    time.sleep(0.6)
    check('fenetre fermee, DX140LCR-7 / 2026 selectionnes (%s / %s)' % tuple(dv.execute_script("return [selectModele.value, selectAnnee.value];")),
          modal_texte() is None and dv.execute_script("return selectModele.value === 'DX140LCR-7' && selectAnnee.value === '2026';"))
    check('aucun panneau de demande', not dv.execute_script("return !!document.getElementById('soumission-request-panel');"))
    check('aucune ecriture', dv.execute_script("return window.__ecrits.length;") == 0)

    print('--- 2) Soumission : TB350CR (2025) -> semblables ---')
    demande_soumission('Takeuchi', 'TB350CR', '2025')
    txt = modal_texte() or ''
    check('fenetre « semblables » avec TB350CR et TB350R', 'semblables' in txt and 'TB350CR' in txt and 'TB350R' in txt)
    check('« Aucune de celles-ci, continuer »', bouton('Aucune de celles-ci'))
    time.sleep(0.5)
    panneau = dv.execute_script("var p=document.getElementById('soumission-request-panel'); return p ? p.textContent : '';")
    check('panneau de demande « Takeuchi TB350CR (2025) »', 'Takeuchi TB350CR (2025)' in panneau)
    demande_soumission('Takeuchi', 'TB350CR', '2025')
    check('choisir TB350R dans la liste', bouton('TB350R —'))
    time.sleep(0.6)
    check('TB350R ouvert (%s / %s)' % tuple(dv.execute_script("return [selectModele.value, selectAnnee.value];")),
          dv.execute_script("return selectModele.value === 'TB350R' && !!selectAnnee.value;"))

    print('--- 3) Annuler dans la liste ---')
    demande_soumission('Takeuchi', 'TB350CR', '2025')
    check('clic Annuler', bouton('Annuler'))
    time.sleep(0.4)
    check('fenetre fermee, modele vide', modal_texte() is None and dv.execute_script("return selectModele.value;") == '')

    print('--- 4) modele inconnu : demande directe ---')
    demande_soumission('Takeuchi', 'ZZ999', '2026')
    check('aucune fenetre de verification', modal_texte() is None)
    panneau = dv.execute_script("var p=document.getElementById('soumission-request-panel'); return p ? p.textContent : '';")
    check('panneau de demande « Takeuchi ZZ999 (2026) »', 'Takeuchi ZZ999 (2026)' in panneau)

    print('--- 5) Page Machine : « Nouveau modele » ---')
    charger('machine.html')
    choisir('select-type', 'Excavatrice')
    choisir('select-fabricant', 'Develon (Doosan)')
    choisir('select-annee', '2026')
    if choisir('select-modele', '__OTHER__', delai=8):
        time.sleep(0.4)
        dv.execute_script("document.getElementById('custom-model-name').value='dx140lcr-7';"
                          "document.getElementById('modal-create').click();")
        time.sleep(0.5)
        txt = modal_texte() or ''
        check('fenetre « deja dans la base » avec DX140LCR-7', 'déjà dans la base' in txt and 'DX140LCR-7' in txt)
        check('clic « Ouvrir cette machine »', bouton('Ouvrir'))
        time.sleep(0.8)
        check('DX140LCR-7 / 2026 affiches (%s / %s)' % tuple(dv.execute_script("return [selectModele.value, selectAnnee.value];")),
              dv.execute_script("return selectModele.value === 'DX140LCR-7' && selectAnnee.value === '2026';"))
        check('aucune fiche creee ni ecriture', dv.execute_script("return window.__ecrits.length;") == 0)
    else:
        print('  [--] « Autre modele » absent pour l invite sur la page Machine : etape non testee')

    err = [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
           and 'version.json' not in l['message'] and 'favicon' not in l['message']]
    check('aucune erreur JS SEVERE (%d)' % len(err), not err)
    for m in err[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

print('\nRESULTAT :', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
