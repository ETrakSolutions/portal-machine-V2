# -*- coding: utf-8 -*-
# Test #14 : la regle harnais est centralisee dans js/kit-rules.js et identique partout.
# 1) Tests unitaires des fonctions window.KitRules.* (vrai moteur JS du navigateur).
# 2) Rendu reel du harnais dans machine.html (chemin defaut).
# 3) Smoke-load machine/soumission/database/export : zero erreur JS SEVERE.
# Sert le repo LOCAL (fichiers modifies) via http.server.
import sys, io, time, os, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8777
BASE = 'http://127.0.0.1:%d' % PORT

os.chdir(REPO)
Handler = http.server.SimpleHTTPRequestHandler
class Quiet(Handler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)

fails = []

def check(label, got, exp):
    ok = (got == exp)
    if not ok: fails.append(label)
    print('  [%s] %s : got=%s attendu=%s' % ('OK' if ok else 'X', label, got, exp))

def choose(sid, txt):
    dv.execute_script("var s=document.getElementById(arguments[0]);for(var i=0;i<s.options.length;i++){if(s.options[i].text.trim().indexOf(arguments[1])===0){s.selectedIndex=i;break;}}s.dispatchEvent(new Event('change',{bubbles:true}));", sid, txt)

def severe_errors():
    return [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']

try:
    # ---- 1) Tests unitaires KitRules ----
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'T',permissions:{modifBom:true}}));")
    dv.get(BASE + '/machine.html')
    WebDriverWait(dv, 30).until(lambda x: x.execute_script("return !!(window.KitRules && window.KitRules.harnais);"))
    print('--- 1) KitRules.harnais (defaut, Z03B + nom) ---')
    cases = [
        (['Caterpillar','320'], 'Z03B-0080|Caterpillar'),
        (['CAT','320'],         'Z03B-0080|Caterpillar'),
        (['Hitachi','ZX130-7'], 'Z03B-0121|Hitachi -7'),
        (['Hitachi','ZX130-5A'],'Z03B-0031|Hitachi -5/-6'),
        (['John Deere','350'],  'Z03B-0031|Hitachi/JD'),
        (['Komatsu','PC130'],   'Z03B-0032|Komatsu'),
        (['Develon','DX235'],   'Z03B-0033|Doosan'),
        (['Doosan','DX235'],    'Z03B-0033|Doosan'),
        (['Volvo','EC160'],     'Z03B-0034|Volvo'),
        (['Link-Belt','300X4'], 'Z03B-0041|Link-Belt/Case'),
        (['Case','CX210'],      'Z03B-0041|Link-Belt/Case'),
        (['Kubota','KX027-4'],  'Z03B-0043|Generique'),
    ]
    for args, exp in cases:
        got = dv.execute_script("var h=window.KitRules.harnais(arguments[0],arguments[1]);return h.code+'|'+h.name;", args[0], args[1])
        check('harnais(%s,%s)' % (args[0], args[1]), got, exp)

    print('--- 2) KitRules.harnaisDefaultH (H-code) ---')
    for args, exp in [(['Caterpillar','320'],'H0080'),(['Hitachi','ZX130-7'],'H0121'),(['John Deere','350'],'H0031'),(['Kubota','KX027-4'],'H0043')]:
        got = dv.execute_script("return window.KitRules.harnaisDefaultH(arguments[0],arguments[1]);", args[0], args[1])
        check('harnaisDefaultH(%s,%s)' % (args[0], args[1]), got, exp)

    print('--- 3) KitRules.harnaisOverride (libelles canoniques) ---')
    for h, exp in [('H0031','Z03B-0031|Hitachi/JD'),('H0080','Z03B-0080|Caterpillar'),('H0100','Z03B-0100|Caterpillar (ECU)'),('H0121','Z03B-0121|Hitachi -7'),('H0043','Z03B-0043|Generique')]:
        got = dv.execute_script("var o=window.KitRules.harnaisOverride(arguments[0]);return o.code+'|'+o.name;", h)
        check('harnaisOverride(%s)' % h, got, exp)

    print('--- 4) KitRules.harnaisPN ---')
    for h, exp in [('H0080','Z03B-0080'),('Z03B-0080','Z03B-0080'),('H0043','Z03B-0043')]:
        got = dv.execute_script("return window.KitRules.harnaisPN(arguments[0]);", h)
        check('harnaisPN(%s)' % h, got, exp)

    # ---- 5) Rendu reel machine.html (chemin defaut) ----
    print('--- 5) machine.html rendu harnais (UI reelle) ---')
    def machine_harnais(fab, model):
        dv.get(BASE + '/machine.html')
        WebDriverWait(dv,30).until(lambda x: any('Excavatrice' in op.text for op in x.find_elements(By.CSS_SELECTOR,'#select-type option')))
        choose('select-type','Excavatrice')
        WebDriverWait(dv,30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-fabricant option'))>2)
        choose('select-fabricant', fab)
        WebDriverWait(dv,30).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-modele option'))>2)
        choose('select-modele', model)
        WebDriverWait(dv,20).until(lambda x: len(x.find_elements(By.CSS_SELECTOR,'#select-annee option'))>1)
        sel = dv.find_element(By.CSS_SELECTOR,'#select-annee option:nth-child(2)').text
        choose('select-annee', sel)
        time.sleep(1.5)
        code = dv.execute_script("var e=document.getElementById('kit-harnais-code');return e?e.textContent.trim():'(absent)';")
        label = dv.execute_script("var e=document.getElementById('kit-harnais-label');return e?e.textContent.trim():'(absent)';")
        return code + '|' + label
    check('UI Caterpillar 308', machine_harnais('Caterpillar','308'), 'Z03B-0080|Caterpillar')
    check('UI Hitachi ZX130-7', machine_harnais('Hitachi','ZX130-7'), 'Z03B-0121|Hitachi -7')
    check('UI John Deere 350', machine_harnais('John Deere','350'), 'Z03B-0031|Hitachi/JD')

    # ---- 6) Smoke-load : zero erreur JS SEVERE ----
    print('--- 6) Smoke-load (zero erreur JS SEVERE) ---')
    for page in ['machine.html','soumission.html','database.html','export.html','edit-machine.html?type=Excavatrice&fab=Caterpillar&year=2026&model=308']:
        dv.get(BASE + '/' + page)
        time.sleep(2.5)
        errs = severe_errors()
        # ignorer les erreurs reseau Apps Script (CORS/backend non joignable en local)
        errs = [e for e in errs if 'script.google.com' not in e['message'] and 'favicon' not in e['message']]
        check('console %s' % page.split('?')[0], 'clean' if not errs else ('%d err' % len(errs)), 'clean')
        for e in errs[:3]: print('       >', e['message'][:160])

    print('\nRESULTAT:', 'OK' if not fails else ('ECHEC (%d): %s' % (len(fails), ', '.join(fails))))
finally:
    dv.quit()
    httpd.shutdown()
