# -*- coding: utf-8 -*-
# Verifie le statut de codes kit pour une machine (kit generique).
# usage: python selenium_kit_status_test.py BASE TYPE FAB MODEL code:expected ...
# expected = r (obligatoire) | na (cache) | j (optionnel)
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE, TYPE, FAB, MODEL = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
checks = [c.split(':') for c in sys.argv[5:]]  # [['0303','r'],['0300','na']]
opts = Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: opts.add_argument(a)
dv = webdriver.Chrome(options=opts)

JS = r"""
var code=arguments[0];
var rows=document.querySelectorAll('#kit-generic-tbody tr');
for (var i=0;i<rows.length;i++){
  if(rows[i].innerText.indexOf('-'+code)>=0){
    var cell=rows[i].querySelector('.kit-status-cell'); var html=cell?cell.innerHTML:'';
    if(html.indexOf('CC0000')>=0) return 'r';
    if(html.indexOf('E6B400')>=0) return 'j';
    if(html.indexOf('verif')>=0) return 'v';
    return 'autre';
  }
}
return 'na';  // pas de ligne = cache = na
"""

def choose(sid, txt):
    dv.execute_script("var s=document.getElementById(arguments[0]);for(var i=0;i<s.options.length;i++){if(s.options[i].text.trim().indexOf(arguments[1])===0){s.selectedIndex=i;break;}}s.dispatchEvent(new Event('change',{bubbles:true}));", sid, txt)

try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'T'}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv,30).until(lambda x: any(TYPE in op.text for op in x.find_elements(By.CSS_SELECTOR,'#select-type option')))
    choose('select-type', TYPE)
    WebDriverWait(dv,30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-fabricant option'))>2)
    choose('select-fabricant', FAB)
    WebDriverWait(dv,30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-modele option'))>2)
    choose('select-modele', MODEL)
    WebDriverWait(dv,20).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-annee option'))>1)
    choose('select-annee','2026'); time.sleep(2)
    allok=True
    for code, exp in checks:
        got = dv.execute_script(JS, code)
        ok = got == exp
        allok = allok and ok
        print('  %s/%s 1500-%s : got=%s attendu=%s %s' % (FAB, MODEL, code, got, exp, 'OK' if ok else 'X'))
    print('RESULTAT:', 'OK' if allok else 'ECHEC')
finally:
    dv.quit()
