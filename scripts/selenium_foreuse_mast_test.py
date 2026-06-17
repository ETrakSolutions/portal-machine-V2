# -*- coding: utf-8 -*-
# Verifie dans le vrai navigateur que la page d'edition d'une Foreuse affiche
# les 3 nouveaux champs de spec : Type de mat (lead/kelly), Longueur du mat, Longueur du kelly.
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8767'
opts = Options()
opts.add_argument('--headless=new'); opts.add_argument('--no-sandbox'); opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1500,1000')
driver = webdriver.Chrome(options=opts)
ok = True
try:
    driver.get(BASE + '/index.html')
    driver.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    url = BASE + '/edit-machine.html?type=Foreuse&fab=Bauer&year=2015&model=BG%2012%20H'
    driver.get(url)
    # attend que le formulaire de specs soit rendu
    WebDriverWait(driver, 45).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.spec-edit')) > 0)
    labels = [e.text.strip() for e in driver.find_elements(By.CSS_SELECTOR, '.spec-edit label')]
    print('Champs de spec rendus :')
    for l in labels: print('   -', l)
    expected = ['Type de mat (lead/kelly)', 'Longueur du mat', 'Longueur du kelly']
    missing = [x for x in expected if x not in labels]
    forbidden = [x for x in ['Type de traction', 'Type de boom', 'Swing boom'] if x in labels]
    print('\nNouveaux champs presents :', not missing, '| manquants:', missing)
    print('Aucun champ traction/boom :', not forbidden, '| trouves:', forbidden)
    ok = (not missing) and (not forbidden)
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); ok = False
finally:
    driver.quit()
print('\nRESULTAT:', 'OK' if ok else 'ECHEC')
sys.exit(0 if ok else 1)
