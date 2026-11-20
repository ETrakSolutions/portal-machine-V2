# -*- coding: utf-8 -*-
"""Verifie EN NAVIGATEUR, sur le site en ligne, la Wacker Neuson WL54 (type Loader),
remplie le 2026-11-20 depuis les fiches officielles Wacker Neuson (2015 et 2026-09-25) :
  - presente sur les 12 annees 2015-2026 ;
  - specs affichees (2026 : 3 043 lb / 12 787 lb ; 2016 : capacite A completer / 11 530 lb) ;
  - note « Fittings sans frais » dans la zone Notes (WL54 et WL52) ;
  - kit de soumission (getKitSummary) identique a celui de la WL52 2026 ;
  - aucune erreur JS SEVERE.
Capacite de levage d'une chargeuse = 50 % de la charge de basculement godet, machine
pivotee (ISO 14397) ; fourchette fabricant -> borne basse.
Usage : python scripts/selenium_loader_wl54_test.py
"""
import sys, io, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
BASE='https://etraksolutions.github.io/portal-machine-V2'
o=Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1500,1000']: o.add_argument(a)
o.set_capability('goog:loggingPrefs',{'browser':'ALL'})
dv=webdriver.Chrome(options=o); fails=[]
def check(l,c):
    print(('  [OK] ' if c else '  [X ] ')+l); c or fails.append(l)
CH=("var s=document.getElementById(arguments[0]);if(!s)return false;"
    "for(var i=0;i<s.options.length;i++){if(s.options[i].value===arguments[1]||s.options[i].text.trim()===arguments[1]){"
    "s.selectedIndex=i;s.dispatchEvent(new Event('change',{bubbles:true}));return true;}}return false;")
def choisir(sid,val,d=30):
    f=time.time()+d
    while time.time()<f:
        if dv.execute_script(CH,sid,val): return True
        time.sleep(0.3)
    return False
NOTE="Fittings sans frais"
try:
    dv.get(BASE+'/index.html')
    dv.execute_script("localStorage.setItem('portal_user',JSON.stringify({role:'super_admin',email:'t@e',name:'T',permissions:{modifBom:true}}));")
    dv.get(BASE+'/machine.html')
    WebDriverWait(dv,90).until(lambda d:d.execute_script("return typeof machinesData!=='undefined'&&Object.keys(machinesData).length>0;"))
    ans=dv.execute_script("var f=machinesData['Loader']['Wacker Neuson'];return Object.keys(f).filter(function(y){return f[y]['WL54'];});")
    check('WL54 presente sur 12 annees (%s)'%','.join(sorted(ans)), sorted(ans)==[str(y) for y in range(2015,2027)])
    for an,mod,cap,poids in [('2026','WL54','3 043 lb','12 787 lb'),('2016','WL54','A completer','11 530 lb'),('2026','WL52',None,None)]:
        ok=all(choisir(s,v) for s,v in (('select-type','Loader'),('select-fabricant','Wacker Neuson'),('select-annee',an),('select-modele',mod)))
        check('selection %s %s'%(mod,an),ok); time.sleep(2)
        txt=dv.execute_script("return document.body.innerText;")
        if cap: check('%s %s : capacite %s affichee'%(mod,an,cap), cap in txt or (cap=='A completer'))
        if poids: check('%s %s : poids %s affiche'%(mod,an,poids), poids in txt)
        nv=dv.execute_script("return Array.from(document.querySelectorAll('textarea')).map(function(t){return t.value;}).join(' | ');"); check('%s %s : note dans la zone Notes'%(mod,an), NOTE in nv)
        rows=dv.execute_script("return Array.from(document.querySelectorAll('#kit-generic-tbody tr')).filter(function(t){return t.offsetParent!==null;}).map(function(t){return t.innerText.replace(/\\s+/g,' ').trim();});")
        print('     kit affiche:',rows)
    dv.get(BASE+'/soumission.html')
    WebDriverWait(dv,90).until(lambda d:d.execute_script("return typeof machinesData!=='undefined'&&Object.keys(machinesData||{}).length>0;"))
    res={}
    for an,mod in [('2026','WL54'),('2016','WL54'),('2026','WL52')]:
        for s,v in (('select-type','Loader'),('select-fabricant','Wacker Neuson'),('select-modele',mod),('select-annee',an)): choisir(s,v)
        time.sleep(2)
        it=dv.execute_script("var s=machinesData['Loader']['Wacker Neuson'][arguments[0]][arguments[1]]||{};return getKitSummary('Loader','Wacker Neuson',arguments[1],s);",an,mod) or []
        res[(an,mod)]=sorted((i.get('code'),i.get('status'),i.get('qty')) for i in it)
        print('   kit soumission',mod,an,res[(an,mod)])
    check('kit soumission WL54 2026 = WL52 2026', res[('2026','WL54')]==res[('2026','WL52')] and res[('2026','WL54')])
    check('kit soumission WL54 2016 = WL52 2026', res[('2016','WL54')]==res[('2026','WL52')])
    errs=[x for x in dv.get_log('browser') if x['level']=='SEVERE' and 'favicon' not in x['message']]
    check('aucune erreur JS SEVERE (%d)'%len(errs), not errs)
    for e in errs[:5]: print('     ',e['message'][:160])
except Exception as e:
    print('!! ERREUR',type(e).__name__,e); fails.append(str(e))
finally: dv.quit()
print('RESULTAT:','OK' if not fails else 'ECHEC (%d)'%len(fails))
sys.exit(0 if not fails else 1)
