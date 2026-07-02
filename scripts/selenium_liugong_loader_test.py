# -*- coding: utf-8 -*-
# Verifie le parcours client : Loader > LiuGong peuple annees + modeles,
# que la generation HV n'apparait qu'a partir de 2023, et que 816C est limite a 2018-2019.
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8083'
opts = Options()
opts.add_argument('--headless=new'); opts.add_argument('--no-sandbox'); opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1600,1000')
driver = webdriver.Chrome(options=opts)
ok = True

def models_for_year(year):
    Select(driver.find_element(By.ID, 'select-annee')).select_by_value(year)
    WebDriverWait(driver, 10).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
    vals = [o.get_attribute('value') for o in driver.find_elements(By.CSS_SELECTOR, '#select-modele option')]
    return [v for v in vals if v and v != '__OTHER__']

try:
    driver.get(BASE + '/index.html')
    driver.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    driver.get(BASE + '/machine.html')
    WebDriverWait(driver, 45).until(lambda d: any(
        o.get_attribute('value') == 'Loader' for o in d.find_elements(By.CSS_SELECTOR, '#select-type option')))
    Select(driver.find_element(By.ID, 'select-type')).select_by_value('Loader')

    WebDriverWait(driver, 20).until(lambda d: any(
        o.get_attribute('value') == 'LiuGong' for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
    Select(driver.find_element(By.ID, 'select-fabricant')).select_by_value('LiuGong')

    WebDriverWait(driver, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
    years = sorted([o.get_attribute('value') for o in driver.find_elements(By.CSS_SELECTOR, '#select-annee option') if o.get_attribute('value')])
    print('Annees LiuGong Loader :', years)

    m2026 = models_for_year('2026')
    m2018 = models_for_year('2018')
    m2020 = models_for_year('2020')
    print('\n2026 (%d):' % len(m2026), m2026)
    print('2020 (%d):' % len(m2020), m2020)
    print('2018 (%d):' % len(m2018), m2018)

    checks = {
        '2018-2026 tous presents': years == [str(y) for y in range(2018, 2027)],
        '2026 contient 856HV (HV)': '856HV' in m2026,
        '2026 contient 856HE MAX': '856HE MAX' in m2026,
        '2026 contient 8128H (global)': '8128H' in m2026,
        '2020 SANS HV': not any('HV' in x for x in m2020),
        '2020 SANS 820TE': '820TE' not in m2020,
        '2018 contient 816C': '816C' in m2018,
        '2020 SANS 816C (fin 2019)': '816C' not in m2020,
        '2018 SANS HV': not any('HV' in x for x in m2018),
    }
    print()
    for k, v in checks.items():
        print(('  [OK] ' if v else '  [X ] ') + k)
        ok = ok and v
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); ok = False
finally:
    driver.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
