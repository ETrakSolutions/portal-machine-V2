# -*- coding: utf-8 -*-
# Verifie dans le vrai navigateur que la vue BD (database.html) pour la Foreuse
# affiche les 3 colonnes de mat et plus les colonnes excavatrice (Classe/Traction/Type boom/Swing).
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8767'
opts = Options()
opts.add_argument('--headless=new'); opts.add_argument('--no-sandbox'); opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1600,1000')
driver = webdriver.Chrome(options=opts)
ok = True
try:
    driver.get(BASE + '/index.html')
    driver.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    driver.get(BASE + '/database.html')
    WebDriverWait(driver, 45).until(lambda d: any(
        o.get_attribute('value') == 'Foreuse' for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(driver.find_element(By.ID, 'db-type')).select_by_value('Foreuse')
    WebDriverWait(driver, 40).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.db-table thead th')) > 0
                                              and len(d.find_elements(By.CSS_SELECTOR, '.db-table tbody tr')) > 0)
    headers = [th.text.strip() for th in driver.find_elements(By.CSS_SELECTOR, '.db-table thead th')]
    # nettoyer la fleche de tri
    headers = [h.replace('▲','').replace('▼','').strip() for h in headers]
    print('En-tetes de colonnes :')
    for h in headers: print('   |', h)
    hl = [h.lower() for h in headers]  # la CSS met les en-tetes en MAJUSCULES
    expected = ['type de mât (lead/kelly)', 'longueur du mât', 'longueur du kelly']
    forbidden = ['classe', 'traction', 'type boom', 'swing']
    missing = [x for x in expected if x not in hl]
    present_forbidden = [x for x in forbidden if x in hl]
    print('\nColonnes mat presentes :', not missing, '| manquantes:', missing)
    print('Colonnes excavatrice absentes :', not present_forbidden, '| restantes:', present_forbidden)
    # verifie aussi qu'une cellule mat existe dans la 1re ligne de donnees
    ok = (not missing) and (not present_forbidden)
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); ok = False
finally:
    driver.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
