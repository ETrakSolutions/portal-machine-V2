# -*- coding: utf-8 -*-
# Balance loader : AS-16-GP x2 ajoute (Steve, 2026-11-12) sur SANY SW405K (nouveau fabricant
# Loader), JCB 437, Hyundai HL955 et Komatsu WA450-6. Verifie que la Soumission sort les raccords.
import sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8083'
o = Options()
for a in ('--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1600,1000'):
    o.add_argument(a)
d = webdriver.Chrome(options=o)
ok = True
CAS = [('SANY', '2024', 'SW405K'), ('JCB', '2025', '437'), ('Hyundai', '2018', 'HL955'), ('Komatsu', '2016', 'WA450-6')]
try:
    d.get(BASE + '/index.html')
    d.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    d.get(BASE + '/soumission.html')
    for _ in range(90):
        if d.execute_script("return typeof machinesData==='object' && !!machinesData.Loader && typeof loadMergedOverrides==='function';"):
            break
        time.sleep(0.5)
    time.sleep(3)
    for fab, an, mod in CAS:
        r = d.execute_script("""
            var f=arguments[0], a=arguments[1], m=arguments[2];
            function ch(id,v){var s=document.getElementById(id); s.value=v; s.dispatchEvent(new Event('change',{bubbles:true}));}
            ch('select-type','Loader');
            return new Promise(function(res){ setTimeout(function(){ ch('select-fabricant',f);
              setTimeout(function(){ ch('select-annee',a);
                setTimeout(function(){ ch('select-modele',m);
                  setTimeout(function(){ var b=document.getElementById('bal-loader'); if(!b.checked) b.click();
                    setTimeout(function(){ res({mod:document.getElementById('select-modele').value, txt:texteEpicor(buildEpicorRows())}); },800);
                  },1200);},500);},500);},500); });
        """, fab, an, mod)
        lig = [l for l in r['txt'].splitlines() if l.startswith('AS-16-GP')]
        bon = r['mod'] == mod and lig == ['AS-16-GP	2'] and '1200-0010' in r['txt']
        print(('  [OK] ' if bon else '  [X ] ') + '%s %s %s : %s' % (fab, an, mod, lig))
        if not bon:
            print(r["txt"][:600])
        ok = ok and bon
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); ok = False
finally:
    d.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
