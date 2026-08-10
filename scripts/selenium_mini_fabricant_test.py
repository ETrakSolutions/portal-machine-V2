# -*- coding: utf-8 -*-
"""Verifie EN NAVIGATEUR, sur le site en ligne, que l option mini excavatrice
(1500-0004) s affiche selon la classification du fabricant.

Le jeton n est pas lu dans le JSON : on regarde la ligne tr[data-kit="mini"] de
machine.html telle qu elle est rendue — visible avec la pastille rouge cochee
pour une mini, masquee pour une machine que son fabricant classe midi.
"""
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = 'https://etraksolutions.github.io/portal-machine-V2'

# (fabricant, annee, modele, mini attendu, justification)
CAS = [
    ('Kubota',      '2026', 'KX080-4',   True,  'Kubota Canada : Mini-Excavatrice'),
    ('Kubota',      '2019', 'KX080-4',   True,  'meme modele, autre millesime'),
    ('Kubota',      '2026', 'KX057-4',   True,  'Kubota Canada : Mini-Excavatrice'),
    ('Kubota',      '2026', 'U48-5',     True,  'Kubota Canada : Mini-Excavatrice'),
    ('Kubota',      '2026', 'KX040-4',   True,  'deja mini avant la modif (non-regression)'),
    ('Caterpillar', '2026', '310',       True,  'Cat : Mini Excavators jusqu au 310'),
    ('Bobcat',      '2026', 'E88',       True,  'Bobcat : Compact (Mini) jusqu au E88'),
    ('Takeuchi',    '2026', 'TB290',     True,  'Takeuchi : Compact Excavators'),
    ('Volvo CE',    '2026', 'ECR88E',    True,  'Volvo : Compact Excavators'),
    ('Case',        '2026', 'CX80C',     False, 'Case : CX75C SR et + = MIDI'),
    ('Kobelco',     '2026', 'SK85CS-7',  False, 'Kobelco : SK75SR et + = serie SR'),
    ('Yanmar',      '2026', 'ViO80-7',   False, 'Yanmar : ViO80 = MIDI'),
    ('Caterpillar', '2026', '336',       False, 'grosse excavatrice : jamais mini'),
]

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=30):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T', permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    print('machine.html charge depuis le site en ligne\n')

    for fab, an, mod, attendu, pourquoi in CAS:
        ok = True
        for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', fab),
                         ('select-annee', an), ('select-modele', mod)):
            if not choisir(sid, val):
                check('selection %s = %s (%s %s)' % (sid, val, fab, mod), False)
                ok = False
                break
        if not ok:
            continue
        time.sleep(1.4)
        # etat REELLEMENT rendu : ligne visible ? pastille rouge cochee ?
        etat = dv.execute_script(
            "var tr=document.querySelector('.kit-table tbody tr[data-kit=\"mini\"]');"
            "if(!tr) return {absent:true};"
            "var vis = tr.offsetParent !== null && tr.style.display !== 'none';"
            "var red = tr.querySelector('.radio-red');"
            "return {visible:vis, rouge: !!(red && red.checked),"
            "        pn:(tr.querySelector('.kit-code')||{}).textContent||''};")
        libelle = '%s %s (%s) — %s' % (fab, mod, an, pourquoi)
        if attendu:
            check('%s : ligne mini VISIBLE' % libelle, etat.get('visible') is True)
            check('%s : pastille ROUGE (obligatoire)' % libelle, etat.get('rouge') is True)
            check('%s : code 1500-0004' % libelle, '1500-0004' in (etat.get('pn') or ''))
        else:
            check('%s : ligne mini MASQUEE' % libelle, etat.get('visible') is False)

    # --- 2) soumission : le kit facture doit contenir (ou non) le 1500-0004 ---
    # On appelle getKitSummary(), la fonction qui construit reellement le kit envoye,
    # plutot que de lire le texte de la page : le kit n est rendu qu a la generation.
    print('\n--- kit de soumission (getKitSummary) ---')
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData || {}).length > 0;"))
    for fab, an, mod, attendu, pourquoi in CAS:
        for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', fab),
                         ('select-modele', mod), ('select-annee', an)):
            choisir(sid, val)
        time.sleep(1.8)
        items = dv.execute_script(
            "var s=machinesData['Excavatrice'][arguments[0]][arguments[1]][arguments[2]]||{};"
            "return getKitSummary('Excavatrice',arguments[0],arguments[2],s);", fab, an, mod) or []
        mini = [i for i in items if '0004' in (i.get('code') or '')]
        lib = '%s %s (%s)' % (fab, mod, an)
        if attendu:
            check('%s : 1500-0004 au kit de soumission, Obligatoire' % lib,
                  len(mini) == 1 and mini[0].get('status') == 'Obligatoire')
        else:
            check('%s : 1500-0004 absent du kit de soumission' % lib, not mini)

    errs = [x for x in dv.get_log('browser')
            if x['level'] == 'SEVERE' and 'favicon' not in x['message']]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    if errs:
        for e in errs[:5]:
            print('     ', e['message'][:160])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
