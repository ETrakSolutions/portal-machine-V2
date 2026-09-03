# -*- coding: utf-8 -*-
"""DIAGNOSTIC : pourquoi les fittings n'apparaissent pas quand on soumet une
balance sur un Loader ou un Tracteur.

Ne modifie rien. Lit ce que la page produit reellement :
  window.__selectionRows (le tableau a l'ecran = le courriel) et epicorBlockText().
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
PORT = 8791
BASE = 'http://127.0.0.1:%d' % PORT

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)

CH = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
      "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
      "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
      "return false;")

def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CH, sid, val): return True
        time.sleep(0.3)
    return False

def cocher(cb_id):
    return dv.execute_script(
        "var c=document.getElementById(arguments[0]); if(!c) return false;"
        "c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); return true;", cb_id)

def etat():
    return dv.execute_script(
        "return {rows:(window.__selectionRows||[]).map(function(r){return r.code+' | '+r.name+(r.oblig?' [OBLIG]':'');}),"
        " epicor:(typeof epicorBlockText==='function'?epicorBlockText():''),"
        " kit:(typeof getKitAllItems==='function'?getKitAllItems().map(function(i){return i.code+' | '+i.name+' | '+i.status+' | optExplicit='+!!i.optExplicit;}):[]) };")

def cas(titre, typ, fab, annee, modele, coches, attendu):
    print('\n' + '=' * 78)
    print(titre)
    print('  %s / %s / %s / %s   coche: %s' % (typ, fab, annee, modele, ', '.join(coches)))
    dv.get(BASE + '/soumission.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin', email:'diag@e-trak', name:'Diagnostic'}));")
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData||{}).length > 0;"))
    for sid, val in (('select-type', typ), ('select-fabricant', fab),
                     ('select-modele', modele), ('select-annee', annee)):
        if not choisir(sid, val):
            print('  !! selection impossible : %s = %s' % (sid, val)); return None
    time.sleep(1.2)
    for c in coches:
        if not cocher(c): print('  !! case introuvable : ' + c)
    time.sleep(1.2)
    e = etat()
    print('  --- kit machine calcule (getKitAllItems) ---')
    for k in e['kit']: print('      ' + k)
    print('  --- lignes du tableau / du courriel (__selectionRows) ---')
    for r in e['rows']: print('      ' + r)
    print('  --- bloc Epicor ---')
    print('      ' + (e['epicor'].replace('\n', '\n      ') if e['epicor'] else '(vide)'))
    trouve = attendu and (attendu in e['epicor'] or any(attendu in r for r in e['rows']))
    if attendu:
        print('  >>> %s : %s' % (attendu, 'PRESENT' if trouve else 'ABSENT'))
    return e

try:
    cas('CAS A - CONTROLE : fitting saisi correctement (status r + opt balance)',
        'Loader', 'Caterpillar', '2024', '980 XE', ['bal-loader'], 'AS-16-GP')

    cas('CAS B - fitting importe de la liste Excel (status j, sans opt)',
        'Loader', 'Caterpillar', '1997', 'IT38F', ['bal-loader'], 'GPFS2406-1212-4')

    cas('CAS C - meme machine, mais avec le LIMITEUR aussi',
        'Loader', 'Caterpillar', '1997', 'IT38F', ['bal-loader', 'lim-hauteur'], 'GPFS2406-1212-4')

    cas('CAS D - Tracteur avec balance Scale Lite',
        'Tracteur', 'John Deere', '2024', '6155M', ['bal-scalelite'], '1200-0020')
finally:
    dv.quit(); httpd.shutdown()
