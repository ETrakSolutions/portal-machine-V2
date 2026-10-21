# -*- coding: utf-8 -*-
# Fiche machine.html d'un tracteur : seul le kit generique (Scale Lite 1200-0020 / 0023) doit etre VISIBLE.
# Le kit d'excavatrice existe dans le HTML mais reste cache : juger la visibilite, pas la presence des lignes.
# Usage : python selenium_fiche_tracteur_test.py <BASE> <Fabricant>
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
BASE = sys.argv[1]
o=Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: o.add_argument(a)
dv=webdriver.Chrome(options=o)
def choose(sid, txt):
    return dv.execute_script("var s=document.getElementById(arguments[0]);if(!s)return 'nosel';for(var i=0;i<s.options.length;i++){if(s.options[i].text.trim().indexOf(arguments[1])===0){s.selectedIndex=i;s.dispatchEvent(new Event('change',{bubbles:true}));return s.options[i].text;}}return 'absent';", sid, txt)
def nopt(sid): return len(dv.find_elements(By.CSS_SELECTOR,'#'+sid+' option'))
try:
    dv.get(BASE+'/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'T'}));")
    dv.get(BASE+'/machine.html')
    WebDriverWait(dv,30).until(lambda x: any('Tracteur' in op.text for op in x.find_elements(By.CSS_SELECTOR,'#select-type option')))
    print('type:',choose('select-type','Tracteur'))
    WebDriverWait(dv,30).until(lambda x: nopt('select-fabricant')>2)
    print('fab:',choose('select-fabricant',sys.argv[2]))
    WebDriverWait(dv,30).until(lambda x: nopt('select-modele')>2)
    print('mod:',dv.execute_script("var s=document.getElementById('select-modele');s.selectedIndex=2;s.dispatchEvent(new Event('change',{bubbles:true}));return s.options[2].text"))
    try:
        WebDriverWait(dv,15).until(lambda x: nopt('select-annee')>1)
        print('an:',dv.execute_script("var s=document.getElementById('select-annee');s.selectedIndex=s.options.length-1;s.dispatchEvent(new Event('change',{bubbles:true}));return s.options[s.options.length-1].text"))
    except Exception: print('pas d annee')
    btn=dv.execute_script("var b=document.getElementById('btn-search')||document.querySelector('button[type=submit]');if(b){b.click();return b.id||'submit'}return null")
    print('bouton:',btn); time.sleep(4)
    r=dv.execute_script("""function v(id){var e=document.getElementById(id);return e?(e.style.display+'|'+(e.offsetParent!==null)):'absent'}
      function rows(id){var e=document.getElementById(id);return e?Array.from(e.querySelectorAll('tbody tr')).map(t=>t.innerText.split(String.fromCharCode(10)).join(' ').split(String.fromCharCode(9)).join(' ').trim()).slice(0,12):[]}
      return {exc:v('kit-machine-section'),gen:v('kit-generic-section'),excRows:rows('kit-machine-section'),genRows:rows('kit-generic-section'),
        visibleKits:Array.from(document.querySelectorAll('.kit-machine-section')).filter(e=>e.offsetParent!==null).map(e=>e.id)}""")
    for k,v in r.items(): print(k,':',v)
    ok = r['visibleKits']==['kit-generic-section'] and any('1200-0020' in x for x in r['genRows']) and any('1200-0023' in x for x in r['genRows'])
    print('RESULTAT:', 'OK' if ok else 'ECHEC')
    print('erreurs:',[l['message'][:200] for l in dv.get_log('browser') if l['level']=='SEVERE'][:5])
finally: dv.quit()
