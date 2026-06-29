# -*- coding: utf-8 -*-
# Audit #7 : machines.json normalise -> 'A completer'. Verifie en navigateur :
# (1) database.html charge sans erreur JS severe, (2) la donnee chargee ne contient
# plus AUCUNE variante accentuee, (3) un champ jadis anomal (Manitex TM200 2020) est
# bien 'A completer' (donc detecte comme incomplet par le code).
import sys, io, os, time, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8783; BASE='http://127.0.0.1:%d'%PORT
os.chdir(REPO)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
httpd=socketserver.TCPServer(('127.0.0.1',PORT),Q)
threading.Thread(target=httpd.serve_forever,daemon=True).start()
opts=Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: opts.add_argument(a)
opts.set_capability('goog:loggingPrefs',{'browser':'ALL'})
dv=webdriver.Chrome(options=opts); fails=[]
def ck(l,c): print('  [%s] %s'%('OK' if c else 'X',l)); (None if c else fails.append(l))
try:
    dv.get(BASE+'/database.html'); time.sleep(2)
    res = dv.execute_async_script("""
      var cb=arguments[arguments.length-1];
      fetch('data/machines.json',{cache:'no-cache'}).then(r=>r.json()).then(function(m){
        var bad=0, sample=null;
        (function walk(o){ if(o&&typeof o==='object'){for(var k in o)walk(o[k]);}
          else if(typeof o==='string'){ var n=o.normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase();
            if(n==='a completer' && o!=='A completer') bad++; } })(m);
        try{ sample=m['Grue Mobile']['Manitex']['2020']['TM200']['Puissance moteur']; }catch(e){}
        cb({bad:bad, sample:sample});
      }).catch(e=>cb({error:String(e)}));
    """)
    print('Resultat:',res)
    ck('0 variante accentuee restante', res.get('bad')==0)
    ck("Manitex TM200 2020 Puissance = 'A completer'", res.get('sample')=='A completer')
    sev=[l for l in dv.get_log('browser') if l['level']=='SEVERE' and 'favicon' not in l['message'] and 'script.google' not in l['message']]
    ck('database.html 0 erreur JS severe', len(sev)==0)
    if sev: print('   ',[x['message'][:150] for x in sev])
finally:
    dv.quit(); httpd.shutdown()
print('\n=== RESULTAT:', 'TOUT OK' if not fails else 'ECHECS: '+', '.join(fails),'===')
sys.exit(1 if fails else 0)
