# -*- coding: utf-8 -*-
# Verifie que Grue Mobile > Maeda > LC785M-6 apparait (2015-2026) et affiche ses specs.
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8083'
opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1600,1000']:
    opts.add_argument(a)
driver = webdriver.Chrome(options=opts)
ok = True
try:
    driver.get(BASE + '/index.html')
    driver.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    driver.get(BASE + '/machine.html')
    WebDriverWait(driver, 45).until(lambda d: any(
        o.get_attribute('value') == 'Grue Mobile' for o in d.find_elements(By.CSS_SELECTOR, '#select-type option')))
    Select(driver.find_element(By.ID, 'select-type')).select_by_value('Grue Mobile')
    WebDriverWait(driver, 20).until(lambda d: any(
        o.get_attribute('value') == 'Maeda' for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
    Select(driver.find_element(By.ID, 'select-fabricant')).select_by_value('Maeda')
    WebDriverWait(driver, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)

    Select(driver.find_element(By.ID, 'select-annee')).select_by_value('2024')
    WebDriverWait(driver, 10).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
    models = [o.get_attribute('value') for o in driver.find_elements(By.CSS_SELECTOR, '#select-modele option')]
    print('Maeda 2024 modeles:', [m for m in models if m and m != '__OTHER__'])
    present = 'LC785M-6' in models

    # select it and check specs render
    Select(driver.find_element(By.ID, 'select-modele')).select_by_value('LC785M-6')
    body = ''
    try:
        WebDriverWait(driver, 10).until(lambda d: '4.9 t' in d.find_element(By.TAG_NAME, 'body').text)
        body = driver.find_element(By.TAG_NAME, 'body').text
    except Exception:
        body = driver.find_element(By.TAG_NAME, 'body').text

    checks = {
        'LC785M-6 present dans la liste 2024': present,
        'Capacite 4.9 t affichee': '4.9 t' in body,
        'Hauteur 16.35 m affichee': '16.35 m' in body,
        'Essieux Chenilles affiche': 'Chenilles' in body,
    }
    for k, v in checks.items():
        print(('  [OK] ' if v else '  [X ] ') + k)
        ok = ok and v
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); ok = False
finally:
    driver.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
