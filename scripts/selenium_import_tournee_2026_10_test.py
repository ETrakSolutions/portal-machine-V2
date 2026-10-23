# -*- coding: utf-8 -*-
"""Test navigateur de l'import de la tournee des modeles manquants (2026-10-23).

Sert le repo LOCAL (ou le site en ligne avec --live) et verifie :
  - machine.html : un modele temoin de CHAQUE type apparait pour la bonne annee et
    sa fiche affiche une spec relevee a la source ;
  - soumission.html : le kit FACTURE (getKitSummary) des temoins de facturation :
    mini Develon DX63-7 (0004 par override), millesime NH E57C 2025 (override recopie),
    Volvo ECR25 Electric (mini par le poids), Liebherr A 917 (pas de 0004),
    nacelle articulee (0903 obligatoire), nacelle telescopique (pas de 0903),
    pompe 5 sections (0205 obligatoire) ;
  - database.html trouve un nouveau modele par la recherche ;
  - aucune erreur JS SEVERE.
"""
import sys, io, os, json, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = '--live' in sys.argv
PORT = 8793
BASE = 'https://etraksolutions.github.io/portal-machine-V2' if LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

if not LIVE:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'), encoding='utf-8'))
# (type, fabricant, annee, modele, cle de spec a voir dans la fiche) — valeurs LUES dans la BD
TEMOINS = [
    ('Excavatrice', 'Komatsu', '2026', 'PC365LC-11', 'Poids operationnel (kg / lbs)'),
    ('Loader', 'Hyundai', '2026', 'HL955A XT', 'Puissance moteur'),
    ('Loader', 'JCB', '2026', '427', 'Puissance moteur'),
    ('Tracteur', 'CLAAS', '2026', 'AXION 9.450 CMATIC', 'Puissance moteur'),
    ('Grue Mobile', 'Grove (Manitowoc)', '2026', 'GHC110', 'Capacite max'),
    ('Camion Girafe (Boom Truck)', 'Palfinger', '2026', 'PK 4200', 'Longueur de boom'),
    ('Telehandler', 'Manitou', '2026', 'MTA 634', 'Capacite max'),
    ('Nacelle', 'JLG', '2026', 'X600AJ', 'Hauteur plateforme (pi)'),
    ('Pompe a Beton', 'Putzmeister', '2026', 'BSF 39-4', 'Nombre de sections'),
    ('Foreuse', 'Soilmec', '2026', 'SF-65', 'Poids operationnel'),
    ('Camion Vacuum', 'Vacall', '2026', None, 'Longueur de boom'),
    ('Retrocaveuse', 'JCB', '2026', '3CX Compact', 'Puissance moteur'),
    # lot 2
    ('Grue Mobile', 'Liebherr', '2026', 'LR 1300.1 SX', 'Capacite max'),
    ('Excavatrice', 'Komatsu', '2026', 'PC4000-11', 'Poids operationnel (kg / lbs)'),
    ('Excavatrice', 'Liebherr', '2026', 'R 992 E Litronic', 'Poids operationnel (kg / lbs)'),
    ('Foreuse', 'Bauer', '2026', 'BG 28', 'Poids operationnel'),
    # lot 3 + corrections
    ('Telehandler', 'LGMG', '2026', 'H1256', 'Capacite max'),
    ('Telehandler', 'Manitou', '2026', 'MRT 2660', 'Capacite max'),
    ('Nacelle', 'Niftylift', '2026', 'SP45 4x4', 'Hauteur plateforme (pi)'),
    ('Loader', 'John Deere', '2017', '944K', 'Puissance moteur'),
    ('Tracteur', 'Kubota', '2026', 'BX2390', 'Puissance moteur'),
    ('Foreuse', 'Sandvik', '2026', 'Ranger DX700', 'Poids operationnel'),
    ('Pompe a Beton', 'Liebherr', '2026', '32 XXT', 'Nombre de sections'),
    ('Telehandler', 'JLG', '2026', 'SkyTrak 10054', 'Capacite max'),
]

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'SEVERE'})
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


def nouveaux(t, fab, an):
    """Modeles ajoutes par l'import pour ce type/fabricant/annee (lot A + specs)."""
    lot = json.load(open(os.path.join(REPO, 'scripts', 'data', 'tournee_2026-10', 'lot_A.json'), encoding='utf-8'))
    return [x['Modèle (nom officiel)'] for x in lot if x['Type'] == t and x['Fabricant'] == fab
            and x['Modèle (nom officiel)'] in DB[t][fab].get(an, {})]


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T', permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))

    print('--- 1) Fiche machine : un temoin par type ---')
    for t, fab, an, mod, cle in TEMOINS:
        if mod is None or mod not in DB[t][fab].get(an, {}):
            cand = nouveaux(t, fab, an)
            check('%s %s : au moins un nouveau modele en %s' % (t, fab, an), bool(cand))
            if not cand:
                continue
            mod = cand[0]
        attendu = str(DB[t][fab][an][mod].get(cle, ''))
        Select(dv.find_element(By.ID, 'select-type')).select_by_value(t)
        WebDriverWait(dv, 20).until(lambda d: any(
            o.get_attribute('value') == fab for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
        Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(fab)
        WebDriverWait(dv, 20).until(lambda d: any(
            o.get_attribute('value') == an for o in d.find_elements(By.CSS_SELECTOR, '#select-annee option')))
        Select(dv.find_element(By.ID, 'select-annee')).select_by_value(an)
        WebDriverWait(dv, 20).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
        models = [o.get_attribute('value') for o in dv.find_elements(By.CSS_SELECTOR, '#select-modele option')]
        check('%s | %s %s %s dans la liste' % (t, fab, mod, an), mod in models)
        if mod not in models:
            continue
        Select(dv.find_element(By.ID, 'select-modele')).select_by_value(mod)
        bout = attendu.split(' ')[0]
        try:
            WebDriverWait(dv, 15).until(lambda d: bout in d.find_element(By.TAG_NAME, 'body').text)
        except Exception:
            pass
        check('   fiche affiche %s = "%s"' % (cle, bout), bout in dv.find_element(By.TAG_NAME, 'body').text)

    print('--- 2) Kit facture (soumission.html, getKitSummary) ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0"
        " && typeof getKitSummary === 'function';"))
    JS = ("var s = machinesData[arguments[0]][arguments[1]][arguments[2]][arguments[3]];"
          "if (!s) return null;"
          "currentBomOverrides = s._bom || null;"   # comme loadBomOverrides() a la selection
          "return getKitSummary(arguments[0], arguments[1], arguments[3], s)"
          ".filter(function(k){return k.status==='Obligatoire';}).map(function(k){return k.code;});")

    def oblig(t, fab, an, mod):
        r = dv.execute_script(JS, t, fab, an, mod)
        return r if r is not None else ['<absent>']

    def a(code, lst):
        return any(code in c for c in lst)

    k = oblig('Excavatrice', 'Develon (Doosan)', '2026', 'DX63-7')
    check('DX63-7 (6,2 t, mini Develon) : 0004 obligatoire %s' % k, a('0004', k))
    k = oblig('Excavatrice', 'New Holland', '2025', 'E57C')
    check('E57C 2025 (millesime, override recopie) : 0004 obligatoire %s' % k, a('0004', k))
    k = oblig('Excavatrice', 'Volvo CE', '2026', 'ECR25 Electric')
    check('ECR25 Electric (2,7 t) : 0004 obligatoire %s' % k, a('0004', k))
    k = oblig('Excavatrice', 'Liebherr', '2026', 'A 917 Litronic')
    check('A 917 Litronic : PAS de 0004 %s' % k, not a('0004', k) and a('0000', k))
    nac = DB['Nacelle']
    art = next(m for m in nouveaux('Nacelle', 'JLG', '2026') if 'articul' in nac['JLG']['2026'][m]['Categorie'].lower())
    tel = next(m for m in nouveaux('Nacelle', 'JLG', '2026') if 'lescop' in nac['JLG']['2026'][m]['Categorie'].lower())
    ND = "return window.KitRules.nacelleDefaults(machinesData['Nacelle']['JLG']['2026'][arguments[0]]);"
    d0 = dv.execute_script(ND, '600AJ')
    d1 = dv.execute_script(ND, art)
    d2 = dv.execute_script(ND, tel)
    # 0903 (Articule) est une sous-option ajoutee a la generation, pas dans getKitSummary : on juge le defaut
    check('Nacelle articulee %s : 0903 = r, comme 600AJ existante (%s / %s)' % (art, d1.get('0903'), d0.get('0903')),
          d1.get('0903') == 'r' == d0.get('0903'))
    check('Nacelle telescopique %s : 0903 = na (%s)' % (tel, d2.get('0903')), d2.get('0903') == 'na')
    k = oblig('Nacelle', 'JLG', '2026', tel)
    check('Nacelle %s : kit de base 0900 obligatoire %s' % (tel, k), a('0900', k))
    pz = next(m for m in nouveaux('Pompe a Beton', 'DY', '2026') if DB['Pompe a Beton']['DY']['2026'][m]['Nombre de sections'] == '5') \
        if nouveaux('Pompe a Beton', 'DY', '2026') else None
    if pz:
        k = oblig('Pompe a Beton', 'DY', '2026', pz)
        check('Pompe 5 sections %s : 0204 + 0205 obligatoires %s' % (pz, k), a('0204', k) and a('0205', k))
    # Lot 2 : les Hitachi -7H heritent du kit ajuste a la main sur leur jumelle -7
    if 'ZX210LC-7H' in DB['Excavatrice']['Hitachi'].get('2026', {}):
        k = oblig('Excavatrice', 'Hitachi', '2026', 'ZX210LC-7H')
        k7 = oblig('Excavatrice', 'Hitachi', '2026', 'ZX210LC-7')
        check('ZX210LC-7H : meme kit que ZX210LC-7, sans drain 0009 %s' % k, sorted(k) == sorted(k7) and not a('0009', k))
        k = oblig('Excavatrice', 'Hitachi', '2026', 'ZX490LC-7H')
        check('ZX490LC-7H : support Z01A-0279 obligatoire %s' % k, a('Z01A-0279', k))
        check('ZX490LC-7H : harnais Hitachi -7 Z03B-0121', a('Z03B-0121', k))
    # Corrections : renommage = meme kit qu'avant ; suppressions effectives
    if '32 XXT' in DB['Pompe a Beton']['Liebherr'].get('2026', {}):
        k = oblig('Pompe a Beton', 'Liebherr', '2026', '32 XXT')
        check('32 XXT (ex 31 XXT) garde son kit 0203 + 0208 obligatoires %s' % k, a('0203', k) and a('0208', k))
        check('31 XXT n existe plus', not dv.execute_script(
            "return !!(machinesData['Pompe a Beton']['Liebherr']['2026']['31 XXT']);"))
        k = oblig('Telehandler', 'JLG', '2026', 'SkyTrak 10054')
        check('SkyTrak 10054 (ex 10054) garde 0070 obligatoire %s' % k, a('0070', k))
        check('Takeuchi TB350CR retire', not dv.execute_script(
            "return !!(machinesData['Excavatrice']['Takeuchi']['2026']['TB350CR']);"))
        check('Hitachi ZW160-7 : 2023 retiree, 2024 gardee', dv.execute_script(
            "var h=machinesData['Loader']['Hitachi']; return !(h['2023']||{})['ZW160-7'] && !!h['2024']['ZW160-7'];"))
    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE en soumission (%d)' % len(errs), not errs)
    for e in errs[:5]:
        print('     ', e['message'][:200])

    print('--- 3) database.html (recherche) ---')
    dv.get(BASE + '/database.html')
    WebDriverWait(dv, 60).until(lambda d: any(
        o.get_attribute('value') == 'Loader' for o in d.find_elements(By.CSS_SELECTOR, '#db-type option')))
    Select(dv.find_element(By.ID, 'db-type')).select_by_value('Loader')
    WebDriverWait(dv, 90).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'table tbody tr')) > 5)
    box = dv.find_element(By.ID, 'db-search')
    box.clear()
    box.send_keys('HL955A XT')
    WebDriverWait(dv, 20).until(lambda d: 'hl955a xt' in d.find_element(By.CSS_SELECTOR, 'table tbody').text.lower())
    check('database.html trouve « HL955A XT » (Hyundai)', 'hyundai' in dv.find_element(By.CSS_SELECTOR, 'table tbody').text.lower())
    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE en database (%d)' % len(errs), not errs)

except Exception as e:
    print('!! ERREUR:', type(e).__name__, str(e)[:300])
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
