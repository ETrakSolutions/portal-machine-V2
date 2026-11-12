# -*- coding: utf-8 -*-
# CAT 315 GC : harnais Z03B-0142 au lieu de Z03B-0080 (Steve, 2026-11-12). La 315 (non GC)
# garde Z03B-0080. Verifie le texte Epicor de la Soumission (limiteur Hauteur + Rotation).
import sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8083'
o = Options()
for a in ('--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1600,1000'):
    o.add_argument(a)
d = webdriver.Chrome(options=o)
ok = True
JS = """
var f=arguments[0], a=arguments[1], m=arguments[2], done=arguments[3];
function ch(id,v){var s=document.getElementById(id); s.value=v; s.dispatchEvent(new Event('change',{bubbles:true}));}
ch('select-type','Excavatrice');
setTimeout(function(){ ch('select-fabricant',f);
 setTimeout(function(){ ch('select-annee',a);
  setTimeout(function(){ ch('select-modele',m);
   setTimeout(function(){ var hr=document.getElementById('lim-hr'); if(hr&&hr.checked) hr.click(); if(hr) hr.click();
    setTimeout(function(){ done({mod:document.getElementById('select-modele').value, txt:texteEpicor(buildEpicorRows())}); },2500);},3500);},1500);},1000);},1000);
"""
try:
    d.get(BASE + '/index.html')
    d.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    d.set_script_timeout(40)
    for an, mod, attendu, interdit in [('2024', '315', 'Z03B-0080', 'Z03B-0142'), ('2024', '315 GC', 'Z03B-0142', 'Z03B-0080'), ('2021', '315 GC', 'Z03B-0142', 'Z03B-0080')]:
        # Page rechargee a chaque cas : un changement de modele dans la meme page peut
        # garder le kit du modele precedent (rafraichissement asynchrone, hors de ce test).
        d.get(BASE + '/soumission.html')
        for _ in range(90):
            if d.execute_script("return typeof machinesData==='object' && !!machinesData.Excavatrice;"):
                break
            time.sleep(0.5)
        time.sleep(3)
        r = d.execute_async_script(JS, 'Caterpillar', an, mod)
        bon = r['mod'] == mod and attendu in r['txt'] and interdit not in r['txt']
        print(('  [OK] ' if bon else '  [X ] ') + 'CAT %s %s : %s present, %s absent' % (an, mod, attendu, interdit))
        if not bon:
            print('     mod=%r' % r['mod'], [l for l in r['txt'].splitlines() if l.startswith('Z03B')])
        ok = ok and bon
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); ok = False
finally:
    d.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
