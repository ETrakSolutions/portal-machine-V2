# -*- coding: utf-8 -*-
# Audit #6 : la ligne "sans-cabine" doit lire le code 0003 (kit de base sans cabine),
# PAS 0004 (mini excavatrice). Test sur une mini (Bobcat E26 2015, 0004='r', aucun 0003) :
#   - ligne mini visible (red)        -> True
#   - ligne sans-cabine NON visible   -> False  (avant le fix : True, car lisait 0004)
#   - ligne cabine visible            -> True
import sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8766'
FAB = sys.argv[2] if len(sys.argv) > 2 else 'Bobcat'
MODELE = sys.argv[3] if len(sys.argv) > 3 else 'E26'
YEAR = sys.argv[4] if len(sys.argv) > 4 else '2015'

opts = Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: opts.add_argument(a)
driver = webdriver.Chrome(options=opts)
ok = True
def wait_options(sel_id, value, t=30):
    WebDriverWait(driver, t).until(lambda d: any(
        o.text.strip().startswith(value) for o in d.find_elements(By.CSS_SELECTOR, '#'+sel_id+' option')))
def choose(sel_id, text):
    driver.execute_script('''
      var s=document.getElementById(arguments[0]); if(!s) return;
      for (var i=0;i<s.options.length;i++){ if(s.options[i].text.trim().indexOf(arguments[1])===0){ s.selectedIndex=i; break; } }
      s.dispatchEvent(new Event('change', {bubbles:true}));
    ''', sel_id, text)
try:
    driver.get(BASE + '/index.html')
    driver.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    driver.get(BASE + '/machine.html')
    wait_options('select-type', 'Excavatrice'); choose('select-type','Excavatrice')
    wait_options('select-fabricant', FAB); choose('select-fabricant',FAB)
    wait_options('select-modele', MODELE)
    print('%s present dans le menu modele : OUI' % MODELE)
    choose('select-modele',MODELE)
    wait_options('select-annee', YEAR); choose('select-annee',YEAR)
    time.sleep(3)
    info = driver.execute_script('''
        function vis(k){ var tr=document.querySelector('tr[data-kit="'+k+'"]');
          return tr ? (tr.offsetParent!==null) : null; }
        function codeOf(k){ var tr=document.querySelector('tr[data-kit="'+k+'"]');
          var c=tr?tr.querySelector('.kit-code'):null; return c?c.textContent.trim():null; }
        return { mini:vis('mini'), sanscabine:vis('sans-cabine'), cabine:vis('cabine'),
                 sanscabineCode:codeOf('sans-cabine') };
    ''')
    print('Kit -> mini visible        :', info['mini'], '(attendu True)')
    print('Kit -> cabine visible      :', info['cabine'], '(attendu True)')
    print('Kit -> sans-cabine visible :', info['sanscabine'], '(attendu False/None apres fix)')
    print('Kit -> sans-cabine code PN :', repr(info['sanscabineCode']), '(doit referer 1500-0003)')
    ok = (info['mini'] is True and info['cabine'] is True and not info['sanscabine'])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, str(e)[:160]); ok = False
finally:
    try:
        for l in driver.get_log('browser'):
            if l['level']=='SEVERE' and 'favicon' not in l['message']: print('CONSOLE:', l['message'][:160])
    except: pass
    driver.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
