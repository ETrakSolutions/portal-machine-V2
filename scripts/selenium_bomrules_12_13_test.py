# -*- coding: utf-8 -*-
# Tests #12 + #13 (divergences regle BOM edition/affichage).
# #12 : en soumission, un override 'r' sur un code optionnel (0001/0002/0005/0008)
#       doit s'afficher "Obligatoire" (avant : fige "Optionnel"). Inverse : override 'j'
#       sur un code obligatoire -> "Optionnel". On pilote le VRAI getKitSummary (global).
# #13 : le drain (0009) ne peut jamais etre jaune. applyOverride le force a 'r' a
#       l'affichage ; l'editeur (edit-machine) doit afficher 'r' et masquer l'option 'j'.
# Sert le repo LOCAL (fichiers modifies) via http.server.
import sys, io, time, os, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8778
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new','--no-sandbox','--disable-gpu','--window-size=1400,1000']: opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []
def check(label, got, exp):
    ok = (got == exp)
    if not ok: fails.append(label)
    print('  [%s] %s : got=%s attendu=%s' % ('OK' if ok else 'X', label, got, exp))

# Statut renvoye par le VRAI getKitSummary de soumission.js, override injecte.
KIT_JS = r"""
var fab=arguments[0], model=arguments[1], year=arguments[2], ov=arguments[3], code=arguments[4];
var specs=machinesData['Excavatrice'][fab][year][model];
window.currentBomOverrides = ov;
var kit = getKitSummary('Excavatrice', fab, model, specs);
window.currentBomOverrides = null;
for (var i=0;i<kit.length;i++){ if(String(kit[i].code).indexOf(code)>=0) return kit[i].status; }
return '(absent)';
"""
def kit_status(fab, model, year, ov, code):
    return dv.execute_script(KIT_JS, fab, model, year, ov, code)

def choose(sid, txt):
    dv.execute_script("var s=document.getElementById(arguments[0]);for(var i=0;i<s.options.length;i++){if(s.options[i].text.trim().indexOf(arguments[1])===0){s.selectedIndex=i;break;}}s.dispatchEvent(new Event('change',{bubbles:true}));", sid, txt)

try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify({role:'super_admin',email:'t@e',name:'T',permissions:{modifBom:true}}));")

    # ---- 1) Unit : coerceExcState (drain jamais jaune) ----
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv,30).until(lambda x: x.execute_script("return !!(window.KitRules && window.KitRules.coerceExcState && typeof getKitSummary==='function' && Object.keys(machinesData||{}).length>0);"))
    print('--- 1) KitRules.coerceExcState ---')
    check('coerce 0009 j->r', dv.execute_script("return window.KitRules.coerceExcState('0009','j');"), 'r')
    check('coerce 0009 r->r', dv.execute_script("return window.KitRules.coerceExcState('0009','r');"), 'r')
    check('coerce 0001 j->j', dv.execute_script("return window.KitRules.coerceExcState('0001','j');"), 'j')

    # ---- 2) #12 : soumission, override 'r' sur code optionnel -> Obligatoire ----
    # 308 (Caterpillar) : drain par defaut, non-mini, non-GC.
    F, M, Y = 'Caterpillar', '308', '2026'
    print('--- 2) #12 override sur %s %s ---' % (F, M))
    check('defaut 0001 (sans override)', kit_status(F,M,Y,{}, '0001'), 'Optionnel')
    check('override 0001=r -> Obligatoire', kit_status(F,M,Y,{'0001':'r'}, '0001'), 'Obligatoire')
    check('override 0002=r -> Obligatoire', kit_status(F,M,Y,{'0002':'r'}, '0002'), 'Obligatoire')
    check('override 0005=r -> Obligatoire', kit_status(F,M,Y,{'0005':'r'}, '0005'), 'Obligatoire')
    check('override 0008=r -> Obligatoire', kit_status(F,M,Y,{'0008':'r'}, '0008'), 'Obligatoire')
    check('override 0001=v -> A verifier', kit_status(F,M,Y,{'0001':'v'}, '0001'), 'À vérifier')
    # Inverse : override 'j' sur un code obligatoire par defaut (0000) -> Optionnel
    check('override 0000=j -> Optionnel', kit_status(F,M,Y,{'0000':'j'}, '0000'), 'Optionnel')
    # Defaut obligatoire conserve
    check('defaut 0000 -> Obligatoire', kit_status(F,M,Y,{}, '0000'), 'Obligatoire')

    # ---- 3) #13 : drain jamais jaune cote soumission (coercition) ----
    print('--- 3) #13 drain 0009 cote soumission ---')
    check('0009 defaut (drain) -> Obligatoire', kit_status(F,M,Y,{}, '0009'), 'Obligatoire')
    check('0009 override j -> Obligatoire (coerce)', kit_status(F,M,Y,{'0009':'j'}, '0009'), 'Obligatoire')

    # ---- 4) #13 : editeur (edit-machine) sur un cas reel 0009=j (Case CX210E 2026) ----
    print('--- 4) #13 edit-machine Case CX210E 2026 (override reel 0009=j) ---')
    dv.get(BASE + '/edit-machine.html?type=Excavatrice&fab=Case&year=2026&model=' + 'CX210E')
    WebDriverWait(dv,30).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.bom-table select[data-code="0009"]'))
    time.sleep(1)
    drain_val = dv.execute_script("var s=document.querySelector('.bom-table select[data-code=\"0009\"]');return s?s.value:'(absent)';")
    has_j = dv.execute_script("var s=document.querySelector('.bom-table select[data-code=\"0009\"]');if(!s)return 'absent';for(var i=0;i<s.options.length;i++){if(s.options[i].value==='j')return 'oui';}return 'non';")
    check('drain affiche r (coerce au chargement)', drain_val, 'r')
    check("option 'j' (Optionnel) masquee sur drain", has_j, 'non')
    # Un code optionnel garde bien son option 'j'
    has_j_0001 = dv.execute_script("var s=document.querySelector('.bom-table select[data-code=\"0001\"]');if(!s)return 'absent';for(var i=0;i<s.options.length;i++){if(s.options[i].value==='j')return 'oui';}return 'non';")
    check("option 'j' conservee sur 0001", has_j_0001, 'oui')

    print('\nRESULTAT:', 'OK' if not fails else ('ECHEC (%d): %s' % (len(fails), ', '.join(fails))))
finally:
    dv.quit()
    httpd.shutdown()
