# -*- coding: utf-8 -*-
# Audit #2 : retrait du repli legacy data/overrides.json du loader.
# Verifie : (1) loadMergedOverrides() ne charge QUE les fichiers par type,
# (2) les orphelines presentes seulement dans le legacy DISPARAISSENT du merge,
# (3) un override valide par type est toujours present, (4) la note migree 301.8 est la,
# (5) zero erreur JS severe sur database/machine/soumission/export.
import sys, io, os, time, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8781
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
fails = []

def severe(url):
    bad = [l for l in dv.get_log('browser') if l['level'] == 'SEVERE'
           and 'favicon' not in l['message'] and 'apps-script' not in l['message'].lower()
           and 'script.google' not in l['message']]
    return bad

try:
    # 1) charge database.html et evalue loadMergedOverrides()
    dv.get(BASE + '/database.html')
    time.sleep(2)
    res = dv.execute_async_script("""
      var cb = arguments[arguments.length-1];
      window.loadMergedOverrides().then(function(ov){
        function leaf(t,f,y,m){ try{return ov[t][f][y][m];}catch(e){return null;} }
        cb({
          hasExc: !!ov['Excavatrice'],
          hasPompe: !!(ov['Pompe a Beton']),
          orphanDevelon: leaf('Excavatrice','Develon (Doosan)','2020','DW140LC-5 / -7'),
          validHitachi: leaf('Excavatrice','Hitachi','2016','ZX470LC-6'),
          note3018: leaf('Excavatrice','Caterpillar','2026','301.8')
        });
      }).catch(function(e){ cb({error:String(e)}); });
    """)
    print('Resultat merge:', res)
    def ck(label, cond):
        print('  [%s] %s' % ('OK' if cond else 'X', label));  (None if cond else fails.append(label))
    ck('Excavatrice presente', res.get('hasExc') is True)
    ck('Pompe a Beton presente', res.get('hasPompe') is True)
    ck('Orphan Develon DW140LC ABSENTE (legacy non charge)', res.get('orphanDevelon') is None)
    ck('Override valide Hitachi ZX470LC-6 2016 present (par type)', res.get('validHitachi') is not None)
    ck('Note migree 301.8 2026 presente', bool(res.get('note3018') and res['note3018'].get('_notes')))
    e = severe('database.html')
    ck('database.html sans erreur JS severe', len(e) == 0)
    if e: print('   severe:', [x['message'][:160] for x in e])

    # 5) smoke des autres pages
    for page in ['machine.html','soumission.html','export.html']:
        dv.get(BASE + '/' + page); time.sleep(2)
        e = severe(page)
        ck(page + ' sans erreur JS severe', len(e) == 0)
        if e: print('   severe:', [x['message'][:160] for x in e])
finally:
    dv.quit(); httpd.shutdown()

print('\n=== RESULTAT:', 'TOUT OK' if not fails else ('ECHECS: ' + ', '.join(fails)), '===')
sys.exit(1 if fails else 0)
