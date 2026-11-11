# -*- coding: utf-8 -*-
"""Refonte du kit nacelle (2026-11-11) : la hauteur suit la recette par boom.
Usage : python scripts/selenium_nacelle_recettes_test.py [http://localhost:8791]"""
import sys, io, time, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8791'
opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1400,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
erreurs = []

def choose(sid, txt):
    dv.execute_script("var s=document.getElementById(arguments[0]);for(var i=0;i<s.options.length;i++){if(s.options[i].text.trim()===arguments[1]){s.selectedIndex=i;break;}}s.dispatchEvent(new Event('change',{bubbles:true}));", sid, txt)

def lim(val):
    dv.execute_script("var v=arguments[0];var cs=document.querySelectorAll('#toggle-limiteur input[name=\"limiteur-type\"]');var t=null;cs.forEach(function(c){c.checked=(c.value===v);if(c.value===v)t=c;});if(t)t.dispatchEvent(new Event('change',{bubbles:true}));", val)
    time.sleep(0.8)

def etat():
    return dv.execute_script(r"""
      var w=document.getElementById('nacelle-recette-warning');
      var o=document.getElementById('toggle-nacelle-opts');
      var s=document.getElementById('sub-nac-0904');
      return {items:[].map.call(document.querySelectorAll('#selected-options-list tr'),function(l){return l.textContent.replace(/\s+/g,' ').trim();}).filter(function(t){return /\d{4}-\d{4}/.test(t);}),
              warn: !!(w && w.offsetParent!==null), titre: (document.getElementById('nac-rec-titre')||{}).textContent,
              mail: (document.getElementById('nac-rec-bouton')||{}).href || '',
              opts: !!(o && o.offsetParent!==null), o904: !!(s && s.style.display!=='none' && o && o.offsetParent!==null)};""")

def machine(fab, mod, annee='2024'):
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'Testeur'}));")
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 30).until(lambda x: x.execute_script("return [].some.call(document.querySelectorAll('#select-type option'),function(o){return o.text.trim()==='Nacelle';})"))
    choose('select-type', 'Nacelle')
    WebDriverWait(dv, 30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR, '#select-fabricant option')) > 2)
    choose('select-fabricant', fab)
    WebDriverWait(dv, 30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
    choose('select-modele', mod)
    try:
        WebDriverWait(dv, 10).until(lambda x: len(x.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
        choose('select-annee', annee)
    except Exception:
        pass
    time.sleep(2)

def codes(items):
    return [m for i in items for m in re.findall(r'\d{4}-\d{4}', i)[:1]]

def verifier(nom, cond, detail):
    print(('OK   ' if cond else 'ECHEC') + ' ' + nom + ('' if cond else '  ->  ' + json.dumps(detail, ensure_ascii=False)))
    if not cond: erreurs.append(nom)

try:
    # 1. Recette validee : Genie Z-45 HF = 0913 + 0911 + 0910, H+R
    machine('Genie', 'Z-45 HF'); lim('Hauteur + Rotation'); e = etat(); c = codes(e['items'])
    verifier('Z-45 HF : 0900, 0913, 0911, 0910, 0902', all(x in c for x in ['1500-0900', '1500-0913', '1500-0911', '1500-0910', '1500-0902']), e['items'])
    verifier('Z-45 HF : aucun code retire (0901/0903/0907)', not any(x in c for x in ['1500-0901', '1500-0903', '1500-0907']), e['items'])
    verifier('Z-45 HF : pas d avertissement', not e['warn'], e)
    verifier('Z-45 HF : tuile Options nacelle masquee', not e['opts'], e)
    lim('Rotation'); e = etat(); c = codes(e['items'])
    verifier('Z-45 HF Rotation seule : 0900 + 0902, sans hauteur', '1500-0902' in c and '1500-0913' not in c, e['items'])
    # 2. Sous reserve : Genie ZX-135/70 = 0912 + 0912 + 0911 (v 0)
    machine('Genie', 'ZX-135/70'); lim('Hauteur'); e = etat()
    verifier('ZX-135/70 : 0912 x2', any('1500-0912' in i and re.search(r'[x×]\s*2', i) for i in e['items']), e['items'])
    verifier('ZX-135/70 : avertissement sous reserve', e['warn'] and 'réserve' in (e['titre'] or ''), e)
    verifier('ZX-135/70 : courriel a Mathieu, Steve cc', 'm.robillard@e-trak.ca' in e['mail'] and 'steve%40gryb.ca' in e['mail'], e['mail'][:120])
    # 3. Sans recette : Genie S-125
    machine('Genie', 'S-125'); lim('Hauteur + Rotation'); e = etat(); c = codes(e['items'])
    verifier('S-125 : aucune hauteur chiffree, 0900 + 0902', '1500-0902' in c and not any(x.startswith('1500-091') for x in c), e['items'])
    verifier('S-125 : avertissement recette a etablir', e['warn'] and 'établir' in (e['titre'] or ''), e)
    lim('Rotation'); e = etat()
    verifier('S-125 Rotation seule : pas d avertissement', not e['warn'], e)
    # 4. Mat vertical : Haulotte Star 26 J (override 0915 r) -> un seul 0915
    machine('Haulotte', 'Star 26 J'); lim('Hauteur'); e = etat(); c = codes(e['items'])
    verifier('Star 26 J : 0915 une seule fois dans le limiteur', c.count('1500-0915') <= 1, e['items'])
    # 5. Option 0904 : Genie Z-30/20 N RJ
    machine('Genie', 'Z-30/20 N RJ'); lim('Hauteur'); e = etat()
    verifier('Z-30/20 N RJ : option 0904 offerte', e['o904'], e)
    machine('Genie', 'Z-30/20 N'); lim('Hauteur'); e = etat()
    verifier('Z-30/20 N : pas de 0904', not e['o904'], e)
    errs = [l for l in dv.get_log('browser') if l.get('level') == 'SEVERE'] if hasattr(dv, 'get_log') else []
    verifier('console sans erreur grave', not errs, [x.get('message', '')[:150] for x in errs][:3])
finally:
    dv.quit()
print('RESULTAT :', 'OK' if not erreurs else '%d ECHEC(S)' % len(erreurs))
