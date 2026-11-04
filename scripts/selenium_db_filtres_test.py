# -*- coding: utf-8 -*-
# Base de donnees (database.html) : les cases Fabricant et Recherche sont menu deroulant + filtre
# dans une case, comme la Soumission (Steve, 2026-11-04).
import sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait, Select

BASE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8767'
opts = Options()
opts.add_argument('--headless=new'); opts.add_argument('--no-sandbox'); opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1600,1000')
driver = webdriver.Chrome(options=opts)
echecs = []


def verif(nom, cond, detail=''):
    print(('OK    ' if cond else 'ECHEC ') + nom + (('  | ' + str(detail)) if detail else ''))
    if not cond:
        echecs.append(nom)


def items(ul):
    return [li.text.strip() for li in driver.find_elements(By.CSS_SELECTOR, '#' + ul + ' .filtre-item')]


try:
    driver.get(BASE + '/index.html')
    driver.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'t@e', name:'T'}));")
    driver.get(BASE + '/database.html')
    WebDriverWait(driver, 45).until(lambda d: any(
        o.get_attribute('value') == 'Loader' for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(driver.find_element(By.ID, 'db-type')).select_by_value('Loader')
    WebDriverWait(driver, 40).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#db-fab option')) > 3)
    time.sleep(1)
    lignes = lambda: driver.find_elements(By.CSS_SELECTOR, '#db-tbody tr')
    fab_cellules = lambda: {td.get_attribute('textContent').strip() for td in driver.find_elements(By.CSS_SELECTOR, '#db-tbody td[data-col-cell="fab"]')}

    fab = driver.find_element(By.ID, 'db-fab-filtre')
    verif('Fabricant : case visible avec « Tous »', fab.is_displayed() and fab.get_attribute('value') == '', fab.get_attribute('placeholder'))
    fab.click(); time.sleep(0.3)
    liste = items('db-fab-resultats')
    verif('Fabricant : un clic ouvre la liste complete, « Tous » en tete', len(liste) > 5 and liste[0] == 'Tous', liste[:4])
    fab.send_keys('hita'); time.sleep(0.3)
    liste = items('db-fab-resultats')
    verif('Fabricant : taper « hita » ne garde que Hitachi', liste == ['Hitachi'], liste)
    fab.send_keys(Keys.ENTER); time.sleep(1)
    verif('Fabricant : Entree choisit Hitachi', driver.find_element(By.ID, 'db-fab').get_attribute('value') == 'Hitachi'
          and fab.get_attribute('value') == 'Hitachi')
    verif('Fabricant : le tableau ne montre que Hitachi', fab_cellules() == {'Hitachi'}, fab_cellules())

    srch = driver.find_element(By.ID, 'db-search')
    srch.click(); time.sleep(0.3)
    liste = items('db-search-resultats')
    verif('Recherche : un clic ouvre les modeles du fabricant choisi', len(liste) > 3, liste[:5])
    srch.send_keys('zw 150'); time.sleep(1)
    liste = items('db-search-resultats')
    verif('Recherche : « zw 150 » (espace) trouve ZW150-6', 'ZW150-6' in liste, liste)
    modeles = {td.get_attribute('textContent').strip() for td in driver.find_elements(By.CSS_SELECTOR, '#db-tbody td[data-col-cell="modele"]')}
    verif('Recherche : le tableau filtre en tapant (espace ignore)', modeles and all('ZW150' in m.replace(' ', '') for m in modeles), list(modeles)[:5])
    li = [e for e in driver.find_elements(By.CSS_SELECTOR, '#db-search-resultats .filtre-item') if e.text.strip() == 'ZW150-6'][0]
    li.click(); time.sleep(1)
    verif('Recherche : un clic sur ZW150-6 l\'ecrit dans la case', srch.get_attribute('value') == 'ZW150-6', srch.get_attribute('value'))
    verif('Recherche : la liste se ferme', not driver.find_element(By.ID, 'db-search-resultats').is_displayed())

    srch.clear(); srch.send_keys(' '); srch.send_keys(Keys.BACKSPACE); srch.send_keys(Keys.ESCAPE)
    fab.click(); time.sleep(0.3)
    tous = [e for e in driver.find_elements(By.CSS_SELECTOR, '#db-fab-resultats .filtre-item') if e.text.strip() == 'Tous'][0]
    tous.click(); time.sleep(1)
    # Le tableau rend les lignes par blocs de 100, triees par fabricant : on lit le compte des stats.
    verif('Fabricant : « Tous » remet tous les fabricants', driver.find_element(By.ID, 'db-fab').get_attribute('value') == ''
          and fab.get_attribute('value') == '' and fab_cellules() != {'Hitachi'}, driver.find_element(By.ID, 'db-stats').text)
    verif('Consignes dans les cases', fab.get_attribute('placeholder') == srch.get_attribute('placeholder') == '-- Sélectionnez ou tapez --',
          (fab.get_attribute('placeholder'), srch.get_attribute('placeholder')))

    # Retour d'une fiche machine : les filtres reviennent ; Retour au menu : on repart a zero (2026-11-04).
    Select(driver.find_element(By.ID, 'db-annee')).select_by_index(1)
    driver.execute_script("var s=document.getElementById('db-search'); s.value='ZW150'; s.dispatchEvent(new Event('input'));")
    time.sleep(1)
    driver.execute_script("document.querySelector('#db-tbody a[href*=\"edit-machine\"]').click();")
    WebDriverWait(driver, 20).until(lambda d: 'edit-machine' in d.current_url)
    driver.back()
    WebDriverWait(driver, 30).until(lambda d: d.find_element(By.ID, 'db-search').get_attribute('value') == 'ZW150')
    verif('Retour d\'une fiche : la recherche est restauree', True)
    driver.find_element(By.CSS_SELECTOR, '.header-back').click()
    WebDriverWait(driver, 20).until(lambda d: 'database' not in d.current_url)
    driver.get(BASE + '/database.html')
    WebDriverWait(driver, 45).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#db-type option')) > 2)
    time.sleep(3)
    verif('Apres Retour au menu : filtres vides', driver.find_element(By.ID, 'db-type').get_attribute('value') == ''
          and driver.find_element(By.ID, 'db-search').get_attribute('value') == '' and driver.find_element(By.ID, 'db-fab').get_attribute('value') == '',
          (driver.find_element(By.ID, 'db-type').get_attribute('value'), driver.find_element(By.ID, 'db-search').get_attribute('value')))
    verif('Aucune erreur JS', not [l for l in driver.get_log('browser') if l['level'] == 'SEVERE' and 'database' in l['message']],
          [l['message'][:120] for l in driver.get_log('browser') if l['level'] == 'SEVERE'][:3])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e); echecs.append('exception')
finally:
    driver.quit()
print('\nRESULTAT:', 'OK' if not echecs else 'ECHEC ' + ', '.join(echecs))
sys.exit(0 if not echecs else 1)
