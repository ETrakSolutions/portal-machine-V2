# -*- coding: utf-8 -*-
"""Verifie EN NAVIGATEUR le bouton « Annuler » de la boite de reinitialisation
(soumission.html).

Bogue constate le 2026-09-28 : avec une option cochee, changer de modele ouvre la
boite « Reinitialiser / Annuler ». « Annuler » fermait la boite sans remettre
l'ancien modele : l'ecran affichait la NOUVELLE machine, mais les pieces restaient
celles de l'ANCIENNE (HIAB X-HiPro 362EP-5 affiche avec la piece 1500-0321 du
Hiab 192). Attendu : Annuler remet le selecteur a sa valeur precedente ;
Reinitialiser charge la nouvelle machine.

Usage :
    py -3.13 scripts/selenium_annuler_reinitialiser_test.py                 # site en ligne
    py -3.13 scripts/selenium_annuler_reinitialiser_test.py http://127.0.0.1:8795
"""
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://etraksolutions.github.io/portal-machine-V2').rstrip('/')
TYPE, FAB, AN = 'Camion Girafe (Boom Truck)', 'HIAB', '2015'
M1, P1 = 'Hiab 192', '1500-0321'
M2, P2 = 'X-HiPro 362EP-5', '1500-0320'

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
ETAT = ("return {modele: document.getElementById('select-modele').value,"
        " annee: document.getElementById('select-annee').value,"
        " boite: (document.getElementById('modal-reset')||{style:{}}).style.display,"
        " hauteur: !!(document.getElementById('lim-hauteur')||{}).checked,"
        " pieces: ((window.currentBomOverrides||{})._custom||[]).map(function(c){return c.pn;}),"
        " liste: (document.getElementById('selected-options-list')||{}).innerText||''};")


def choisir(sid, val, delai=30):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


def machine(modele):
    for sid, val in (('select-type', TYPE), ('select-fabricant', FAB),
                     ('select-modele', modele), ('select-annee', AN)):
        if not choisir(sid, val):
            check('selection %s = %s' % (sid, val), False)
            return False
    time.sleep(2)
    return True


def cocher_hauteur():
    dv.execute_script("var c=document.getElementById('lim-hauteur'); if(c && !c.checked) c.click();")
    time.sleep(1)


try:
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData || {}).length > 0;"))
    print('soumission.html charge depuis', BASE, '\n')

    # --- 1) Annuler : on reste sur l'ancienne machine, ecran compris ---
    if machine(M1):
        cocher_hauteur()
        e0 = dv.execute_script(ETAT)
        check('%s : piece %s chargee' % (M1, P1), P1 in e0['pieces'])
        choisir('select-modele', M2)
        time.sleep(0.6)
        check('changer de modele avec Hauteur cochee ouvre la boite',
              dv.execute_script(ETAT)['boite'] == 'flex')
        dv.execute_script("document.getElementById('modal-reset-cancel').click();")
        time.sleep(0.8)
        e1 = dv.execute_script(ETAT)
        check('Annuler : boite fermee', e1['boite'] == 'none')
        check('Annuler : le selecteur revient a %s (lu : %s)' % (M1, e1['modele']), e1['modele'] == M1)
        check('Annuler : les pieces restent celles de %s' % M1, e1['pieces'] == e0['pieces'])
        check('Annuler : Hauteur reste cochee', e1['hauteur'] is True)
        check('Annuler : liste des produits inchangee', e1['liste'] == e0['liste'])

    # --- 2) Reinitialiser : la nouvelle machine est chargee ---
        choisir('select-modele', M2)
        time.sleep(0.6)
        dv.execute_script("document.getElementById('modal-reset-confirm').click();")
        time.sleep(0.8)
        choisir('select-annee', AN)
        time.sleep(2)
        e2 = dv.execute_script(ETAT)
        check('Reinitialiser : selecteur sur %s' % M2, e2['modele'] == M2)
        check('Reinitialiser : piece %s chargee (lu : %s)' % (P2, e2['pieces']), P2 in e2['pieces'])
        check('Reinitialiser : plus la piece %s' % P1, P1 not in e2['pieces'])
        check('Reinitialiser : options remises a zero', e2['hauteur'] is False)

    # --- 3) Annuler sur l'annee et sur le type : meme garantie ---
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData || {}).length > 0;"))
    if machine(M1):
        cocher_hauteur()
        autre_an = dv.execute_script(
            "var s=document.getElementById('select-annee');"
            "for (var i=0;i<s.options.length;i++){ var v=s.options[i].value; if(v && v!==arguments[0]) return v; }"
            "return null;", AN)
        if autre_an:
            choisir('select-annee', autre_an)
            time.sleep(0.6)
            dv.execute_script("document.getElementById('modal-reset-cancel').click();")
            time.sleep(0.6)
            check('Annuler sur l annee : revient a %s' % AN, dv.execute_script(ETAT)['annee'] == AN)
        choisir('select-type', 'Excavatrice')
        time.sleep(0.6)
        dv.execute_script("document.getElementById('modal-reset-cancel').click();")
        time.sleep(0.6)
        check('Annuler sur le type : revient a %s' % TYPE,
              dv.execute_script("return document.getElementById('select-type').value;") == TYPE)

    # --- 4) Sans option cochee : pas de boite, changement direct (non-regression) ---
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 90).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData || {}).length > 0;"))
    if machine(M1):
        choisir('select-modele', M2)
        time.sleep(0.6)
        e4 = dv.execute_script(ETAT)
        check('sans option : aucune boite', e4['boite'] in ('', 'none'))
        choisir('select-annee', AN)
        time.sleep(2)
        check('sans option : %s chargee directement' % M2, P2 in dv.execute_script(ETAT)['pieces'])

    errs = [x for x in dv.get_log('browser')
            if x['level'] == 'SEVERE' and 'favicon' not in x['message']]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:5]:
        print('     ', e['message'][:160])
except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(0 if not fails else 1)
