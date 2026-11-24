# -*- coding: utf-8 -*-
"""Verifie EN NAVIGATEUR l'import des restes de la tournee 2026-10 (2026-11-23 : 6 modeles, 12 entrees).

Chaque modele se choisit dans machine.html (type > fabricant > annee > modele), une spec relevee
s'affiche, la note technique est la ; le kit de soumission (getKitSummary) suit le type, avec
les overrides recopies : EC18 Electric = 1500-0004-Install obligatoire (comme l'EC18E), Maeda MK3053C =
limiteur sans cabine 1500-0803 (comme les MC). Controle aussi database.html et la console.

Usage : python scripts/selenium_import_tournee_restes_2026_11_test.py --fichier (copie locale, sans serveur)
        python scripts/selenium_import_tournee_restes_2026_11_test.py --live    (site en ligne)
"""
import sys, io, time, os, pathlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

if '--live' in sys.argv:
    BASE = 'https://etraksolutions.github.io/portal-machine-V2'
elif '--fichier' in sys.argv:
    BASE = pathlib.Path(os.getcwd()).as_uri()
else:
    BASE = 'http://localhost:8083'
# (type, fabricant, annee, modele, texte attendu, (code, statut) attendu dans le kit ou None, code interdit ou None)
CAS = [
    ('Retrocaveuse', 'Case', '2026', '575N EP', '18 298 lb', None, None),
    ('Camion Vacuum', 'Vacall', '2025', 'AJV 1215', '23\'6"', None, None),
    ('Pompe a Beton', 'Betonstar', '2026', 'H58-5RZ', 'Portee 57.2m', None, None),
    ('Grue Mobile', 'Liebherr', '2025', 'LTC 1050-3.1E', '243 kW', ('1500-0800', 'Obligatoire'), None),
    ('Grue Mobile', 'Maeda', '2026', 'MK3053C', '16.95 m', ('1500-0803', 'Obligatoire'), '1500-0800'),
    ('Excavatrice', 'Volvo CE', '2026', 'EC18 Electric', '4321 lbs', ('1500-0004-Install', 'Obligatoire'), None),
]

o = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    o.add_argument(a)
if '--fichier' in sys.argv:
    o.add_argument('--allow-file-access-from-files')
o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=o)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CH = ("var s=document.getElementById(arguments[0]);if(!s)return false;"
      "for(var i=0;i<s.options.length;i++){if(s.options[i].value===arguments[1]||s.options[i].text.trim()===arguments[1]){"
      "s.selectedIndex=i;s.dispatchEvent(new Event('change',{bubbles:true}));return true;}}return false;")


def choisir(sid, val, delai=30):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CH, sid, val):
            return True
        time.sleep(0.3)
    return False


try:
    print('Site :', BASE)
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user',JSON.stringify("
                      "{role:'super_admin',email:'t@e',name:'T',permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return typeof machinesData!=='undefined'&&Object.keys(machinesData).length>0;"))
    for t, fab, an, mod, attendu, _, _ in CAS:
        ok = all(choisir(s, v) for s, v in (('select-type', t), ('select-fabricant', fab),
                                            ('select-annee', an), ('select-modele', mod)))
        check('%s %s (%s) : selectionnable' % (fab, mod, an), ok)
        if not ok:
            continue
        time.sleep(1.6)
        txt = dv.execute_script("return document.body.innerText;")
        check('%s %s (%s) : affiche %s' % (fab, mod, an, attendu), attendu in txt)

    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return typeof machinesData!=='undefined'&&Object.keys(machinesData||{}).length>0;"))
    for t, fab, an, mod, _, voulu, interdit in CAS:
        for s, v in (('select-type', t), ('select-fabricant', fab), ('select-modele', mod), ('select-annee', an)):
            choisir(s, v)
        time.sleep(2.0)
        it = dv.execute_script(
            "var s=machinesData[arguments[0]][arguments[1]][arguments[2]][arguments[3]]||{};"
            "return getKitSummary(arguments[0],arguments[1],arguments[3],s);", t, fab, an, mod) or []
        codes = [(i.get('code'), i.get('status')) for i in it]
        check('%s %s (%s) : kit non vide %s' % (fab, mod, an, codes), len(codes) > 0)
        if voulu:
            check('%s %s (%s) : %s %s' % (fab, mod, an, voulu[0], voulu[1]), tuple(voulu) in codes)
        if interdit:
            check('%s %s (%s) : pas de %s' % (fab, mod, an, interdit), all(c != interdit for c, _ in codes))

    dv.get(BASE + '/database.html')
    time.sleep(6)
    errs = [x for x in dv.get_log('browser') if x['level'] == 'SEVERE' and 'favicon' not in x['message']]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:5]:
        print('     ', e['message'][:160])
except Exception as e:
    print('!! ERREUR', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()
print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
