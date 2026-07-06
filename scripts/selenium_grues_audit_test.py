# -*- coding: utf-8 -*-
# Verifie l'audit Grue Mobile : nouvelles marques presentes + marques completees + specs en tonnes.
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8083'
opts = Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1600,1000']:
    opts.add_argument(a)
d = webdriver.Chrome(options=opts)
ok = True

def fabricants():
    return [o.get_attribute('value') for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')]

def models(fab, year):
    Select(d.find_element(By.ID, 'select-fabricant')).select_by_value(fab)
    WebDriverWait(d, 15).until(lambda x: len(x.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
    Select(d.find_element(By.ID, 'select-annee')).select_by_value(year)
    WebDriverWait(d, 10).until(lambda x: len(x.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
    return [o.get_attribute('value') for o in d.find_elements(By.CSS_SELECTOR, '#select-modele option')]

try:
    d.get(BASE + '/index.html')
    d.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    d.get(BASE + '/machine.html')
    WebDriverWait(d, 45).until(lambda x: any(o.get_attribute('value') == 'Grue Mobile' for o in x.find_elements(By.CSS_SELECTOR, '#select-type option')))
    Select(d.find_element(By.ID, 'select-type')).select_by_value('Grue Mobile')
    WebDriverWait(d, 20).until(lambda x: len(x.find_elements(By.CSS_SELECTOR, '#select-fabricant option')) > 5)
    fabs = fabricants()
    print('Fabricants Grue Mobile:', [f for f in fabs if f])

    new_brands = ['Kobelco','National Crane','Manitowoc','XCMG','Elliott','Altec']
    for nb in new_brands:
        ok = ok and (nb in fabs)
        print(('  [OK] ' if nb in fabs else '  [X ] ') + 'nouvelle marque ' + nb)

    kob = models('Kobelco', '2022')
    print('Kobelco 2022:', [m for m in kob if m and m!='__OTHER__'][:8], '...')
    ok = ok and ('CK1200G-2' in kob)               # G-2 present en 2022
    kob24 = models('Kobelco', '2024')
    ok = ok and ('CK1200G-3' in kob24)             # G-3 present en 2024 (lance 2023)
    print(('  [OK] ' if 'CK1200G-2' in kob and 'CK1200G-3' in kob24 else '  [X ] ') + 'Kobelco G-2 (2022) et G-3 (2024)')

    grv = models('Grove (Manitowoc)', '2022')
    ok = ok and ('GMK4090' in grv)
    print(('  [OK] ' if 'GMK4090' in grv else '  [X ] ') + 'Grove complete (GMK4090 2022)')

    tad = models('Tadano', '2018')
    ok = ok and ('CC 2800-1' in tad)
    print(('  [OK] ' if 'CC 2800-1' in tad else '  [X ] ') + 'Demag CC replie dans Tadano (CC 2800-1)')

    # spec en tonnes : selectionner un modele et verifier " t"
    Select(d.find_element(By.ID, 'select-modele')).select_by_value('CC 2800-1')
    body = ''
    try:
        WebDriverWait(d, 8).until(lambda x: ' t' in x.find_element(By.TAG_NAME,'body').text)
        body = d.find_element(By.TAG_NAME,'body').text
    except Exception:
        body = d.find_element(By.TAG_NAME,'body').text
    has_t = '600 t' in body
    ok = ok and has_t
    print(('  [OK] ' if has_t else '  [X ] ') + 'Capacite affichee en tonnes (600 t)')

except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); ok = False
finally:
    d.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
