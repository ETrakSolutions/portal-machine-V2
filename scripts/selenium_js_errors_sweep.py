# -*- coding: utf-8 -*-
"""Balayage des erreurs JS sur toutes les pages du portail (probleme #20 de
l'audit V2 : TypeError JS).

Pour chaque page : charge, attend le rendu, exerce les interactions de base
(selection type/fabricant/annee/modele la ou ca s'applique), puis releve :
  - les erreurs console SEVERE ;
  - les window.onerror / unhandledrejection captures des le debut du chargement.

Sert le repo LOCAL par defaut ; passer une URL en argument pour tester le live.
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8793
BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:%d' % PORT

if len(sys.argv) <= 1:
    os.chdir(REPO)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)

# Capte les erreurs avant meme que les scripts de la page tournent
HOOK = """
window.__errs = [];
window.addEventListener('error', function(e){
  window.__errs.push({type:'error', msg:String(e.message),
                      src:(e.filename||'')+':'+(e.lineno||''),
                      stack:(e.error && e.error.stack) ? String(e.error.stack).slice(0,400) : ''});
}, true);
window.addEventListener('unhandledrejection', function(e){
  window.__errs.push({type:'rejection', msg:String(e.reason && e.reason.message || e.reason),
                      src:'', stack:(e.reason && e.reason.stack) ? String(e.reason.stack).slice(0,400) : ''});
});
"""
try:
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': HOOK})
except Exception as e:
    print('(CDP indisponible : %s)' % e)

SESSION = ("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',"
           "email:'robin@gryb.ca', name:'Test', token:'x',"
           "permissions:{modifBom:true, modifAccounts:true, voirPrix:true}}));"
           "localStorage.setItem('portal_consent_v', '99');")

PAGES = ['index.html', 'machine.html', 'database.html', 'soumission.html',
         # edit-machine exige type/fab/year/model, sinon la page s'arrete sur
         # « parametres manquants » et le balayage ne prouve rien.
         'edit-machine.html?type=Excavatrice&fab=Caterpillar&year=2024&model=336%20GC',
         'edit-machine.html?type=Excavatrice&fab=Yanmar&year=2017&model=ViO45-6A',
         'export.html', 'price-list.html', 'machine-requests.html']

total = 0
rapport = {}
try:
    dv.get(BASE + '/index.html')
    dv.execute_script(SESSION)

    for page in PAGES:
        dv.get(BASE + '/' + page)
        time.sleep(6)
        # interactions de base quand la page a les selecteurs standards
        try:
            if dv.find_elements(By.ID, 'select-type'):
                WebDriverWait(dv, 40).until(lambda d: len(
                    d.find_elements(By.CSS_SELECTOR, '#select-type option')) > 1)
                Select(dv.find_element(By.ID, 'select-type')).select_by_value('Excavatrice')
                WebDriverWait(dv, 20).until(lambda d: len(
                    d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')) > 1)
                Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value('Caterpillar')
                WebDriverWait(dv, 20).until(lambda d: len(
                    d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
                Select(dv.find_element(By.ID, 'select-annee')).select_by_value('2024')
                WebDriverWait(dv, 20).until(lambda d: len(
                    d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
                opts_m = [o.get_attribute('value') for o in
                          dv.find_elements(By.CSS_SELECTOR, '#select-modele option')
                          if o.get_attribute('value') not in ('', '__OTHER__')]
                if opts_m:
                    Select(dv.find_element(By.ID, 'select-modele')).select_by_value(opts_m[0])
                time.sleep(3)
            if dv.find_elements(By.ID, 'db-type'):
                WebDriverWait(dv, 40).until(lambda d: len(
                    d.find_elements(By.CSS_SELECTOR, '#db-type option')) > 1)
                Select(dv.find_element(By.ID, 'db-type')).select_by_value('Excavatrice')
                time.sleep(6)
        except Exception as e:
            print('  (interaction %s : %s %s)' % (page, type(e).__name__, str(e)[:120]))

        errs = dv.execute_script("return window.__errs || [];")
        # Chrome classe SEVERE des avis de politique du navigateur qui ne sont
        # PAS des erreurs de la page. Le plus frequent ici : le garde-fou
        # « modifications non sauvegardees » de edit-machine.html declare un
        # handler beforeunload, et Chrome refuse d'afficher la boite faute de
        # geste utilisateur en mode automatise. Bruit de test, pas defaut.
        BENINS = ('beforeunload',)
        sev = [e for e in dv.get_log('browser')
               if e['level'] == 'SEVERE' and not any(b in e.get('message', '') for b in BENINS)]
        # preuve que la page a vraiment rendu quelque chose (sinon « OK » ne veut rien dire)
        etat = dv.execute_script(
            "return {url: location.pathname.split('/').pop(), texte: (document.body.innerText||'').length,"
            " selects: document.querySelectorAll('select').length,"
            " lignes: document.querySelectorAll('table tbody tr').length,"
            " boutons: document.querySelectorAll('button').length};")
        rapport[page] = {'window': errs, 'console': sev, 'etat': etat}
        n = len(errs) + len(sev)
        total += n
        print('%-24s %-16s [rendu: page=%s texte=%d car., %d select, %d lignes, %d boutons]'
              % (page, 'OK' if n == 0 else '%d probleme(s)' % n,
                 etat['url'], etat['texte'], etat['selects'], etat['lignes'], etat['boutons']))
        for e in errs:
            print('   [JS ] %s  (%s)' % (e['msg'], e['src']))
            if e.get('stack'):
                print('         %s' % e['stack'].replace('\n', ' | ')[:300])
        for e in sev:
            print('   [CON] %s' % e['message'][:400])
finally:
    dv.quit()

print('\nTOTAL : %d probleme(s) sur %d pages' % (total, len(PAGES)))
out = os.path.join(REPO, 'scripts', 'data', 'js_errors_sweep.json')
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(rapport, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('rapport : %s' % out)
sys.exit(0 if total == 0 else 1)
