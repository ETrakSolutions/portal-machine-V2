# -*- coding: utf-8 -*-
"""Verifie EN NAVIGATEUR l'import de la tournee Loader du 2026-11-20 (131 modeles, 266 entrees).

Pour un echantillon couvrant chaque fabricant ajoute : la machine se choisit dans machine.html
(type Loader > fabricant > annee > modele), ses specs s'affichent, la note de distribution
apparait pour Mecalac / Hidromek / Wolf America, et le kit de soumission (getKitSummary)
est celui du type (1500-0603 en option). Controle aussi database.html et l'absence d'erreur JS.

Usage : python scripts/selenium_import_tournee_loader_2026_11_test.py          (local, http://localhost:8083)
        python scripts/selenium_import_tournee_loader_2026_11_test.py --fichier (copie locale, sans serveur)
        python scripts/selenium_import_tournee_loader_2026_11_test.py --live   (site en ligne)
"""
import sys, io, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

import os, pathlib
if '--live' in sys.argv:
    BASE = 'https://etraksolutions.github.io/portal-machine-V2'
elif '--fichier' in sys.argv:   # pages ouvertes depuis le disque (sans serveur)
    BASE = pathlib.Path(os.getcwd()).as_uri()
else:
    BASE = 'http://localhost:8083'
# (fabricant, annee, modele, texte attendu dans la page ou None, note attendue ou None)
CAS = [
    ('Wacker Neuson', '2026', 'WL95', '22 906 lb', None),
    ('Wacker Neuson', '2025', 'WL28', '6 195 lb', None),
    ('Weidemann', '2025', '9580T', '24 714 lb', None),
    ('Weidemann', '2024', '4060T', '12 853 lb', None),
    ('Bobcat', '2023', 'L95', '11 993 lb', None),
    ('Bobcat', '2026', 'L23', '1 159 lb', None),
    ('Gehl', '2026', 'AL750', '2 889 lb', None),
    ('Takeuchi', '2025', 'TW95', '18 188 lb', None),
    ('Yanmar', '2023', 'V7', '9 370 lb', None),
    ('SANY', '2026', 'SW940L', '32 849 lb', None),
    ('XCMG', '2026', 'XC968U', '47 620 lb', None),
    ('Schäffer', '2026', '9660 T', '177 hp', None),
    ('Avant', '2025', '760i', '56 hp', None),
    ('Giant (Tobroco-Giant)', '2026', 'G5000', '9 920 lb', None),
    ('HEVI', '2026', 'H65L', '48 942 lb', None),
    ('Vermeer', '2026', 'ATX960', '2 158 lb', None),
    ('Manitou', '2026', 'MLA 7-75 H-Z', '2 889 lb', None),
    ('Mecalac', '2026', 'AS1600', '24 074 lb', 'Distribution nord-américaine à confirmer'),
    ('Hidromek', '2025', 'HMK 640 WL', '57 982 lb', 'Launching Soon'),
    ('Wolf America', '2026', 'WL200', '74 hp', 'Importateur américain'),
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
    n = dv.execute_script(
        "var L=machinesData['Loader'],n=0;for(var f in L){if(f[0]==='_')continue;"
        "for(var y in L[f])n+=Object.keys(L[f][y]).length;}return n;")
    print('entrees Loader chargees :', n)
    check('au moins 2 508 entrees Loader (2 242 + 266)', n >= 2508)
    for fab, an, mod, attendu, note in CAS:
        ok = all(choisir(s, v) for s, v in (('select-type', 'Loader'), ('select-fabricant', fab),
                                            ('select-annee', an), ('select-modele', mod)))
        check('%s %s (%s) : selectionnable' % (fab, mod, an), ok)
        if not ok:
            continue
        time.sleep(1.6)
        txt = dv.execute_script("return document.body.innerText;")
        check('%s %s (%s) : affiche %s' % (fab, mod, an, attendu), attendu in txt)
        nv = dv.execute_script("var t=document.getElementById('notes-textarea');return t?t.value:'';")
        if note:
            check('%s %s (%s) : note de distribution' % (fab, mod, an), note in nv)
        kit = dv.execute_script(
            "return Array.from(document.querySelectorAll('#kit-generic-tbody tr'))"
            ".filter(function(t){return t.offsetParent!==null;}).map(function(t){return t.innerText;}).join(' ');")
        check('%s %s (%s) : kit 1500-0603 affiche' % (fab, mod, an), '1500-0603' in kit)

    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return typeof machinesData!=='undefined'&&Object.keys(machinesData||{}).length>0;"))
    for fab, an, mod, _, _ in CAS[::4]:
        for s, v in (('select-type', 'Loader'), ('select-fabricant', fab), ('select-modele', mod), ('select-annee', an)):
            choisir(s, v)
        time.sleep(1.8)
        it = dv.execute_script(
            "var s=machinesData['Loader'][arguments[0]][arguments[1]][arguments[2]]||{};"
            "return getKitSummary('Loader',arguments[0],arguments[2],s);", fab, an, mod) or []
        codes = [(i.get('code'), i.get('status')) for i in it]
        check('%s %s (%s) : kit de soumission %s' % (fab, mod, an, codes), ('1500-0603', 'Optionnel') in codes)

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
