# -*- coding: utf-8 -*-
# Verifie que le warning "soumission Atlas -> ingenierie" s'affiche en soumission pour un Atlas,
# et pas pour un autre fabricant.
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8777'
opts = Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: opts.add_argument(a)
dv = webdriver.Chrome(options=opts)

def choose(sid, txt):
    dv.execute_script("var s=document.getElementById(arguments[0]);if(!s)return;for(var i=0;i<s.options.length;i++){if(s.options[i].text.trim().indexOf(arguments[1])===0){s.selectedIndex=i;break;}}s.dispatchEvent(new Event('change',{bubbles:true}));", sid, txt)

def warn_visible():
    return dv.execute_script("var w=document.getElementById('machine-warning');return !!(w && w.offsetParent!==null);")

def pick_limiteur():
    # coche le premier radio de type limiteur s'il existe (declenche l'update)
    dv.execute_script("var r=document.querySelector('input[name=\"limiteur-type\"]');if(r){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));}")

def run(fab, model):
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'T'}));")
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv,30).until(lambda x: any('Camion Girafe' in op.text for op in x.find_elements(By.CSS_SELECTOR,'#select-type option')))
    choose('select-type','Camion Girafe')
    WebDriverWait(dv,30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-fabricant option'))>2)
    choose('select-fabricant', fab)
    WebDriverWait(dv,30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-modele option'))>2)
    choose('select-modele', model)
    try:
        WebDriverWait(dv,15).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-annee option'))>1)
        choose('select-annee','2026')
    except Exception: pass
    time.sleep(1.5)
    after_select = warn_visible()
    pick_limiteur(); time.sleep(1.5)
    after_lim = warn_visible()
    return after_select, after_lim

try:
    a_sel, a_lim = run('Atlas','240.2e')
    print('Atlas 240.2e -> warning apres selection:', a_sel, '| apres choix limiteur:', a_lim)
    h_sel, h_lim = run('HIAB','Hiab 192')
    print('HIAB Hiab 192 -> warning apres selection:', h_sel, '| apres choix limiteur:', h_lim)
    ok = (a_sel or a_lim) and not h_sel and not h_lim
    print('RESULTAT:', 'OK' if ok else 'A VERIFIER')
finally:
    dv.quit()
