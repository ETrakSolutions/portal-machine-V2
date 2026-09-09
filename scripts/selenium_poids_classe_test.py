# -*- coding: utf-8 -*-
"""Test navigateur des remplissages de POIDS OPERATIONNEL et de CLASSE MACHINE.

Pourquoi ce test existe : un modele sans poids exploitable n'affiche AUCUNE
ligne « Classe machine », ni sur machine.html ni dans la soumission client --
les deux la recalculent a partir du poids (js/app.js:476, js/soumission.js:831)
et sautent le champ de la BD. Et kit-rules.js:63 fait tomber le 1500-0004 sur
« na » faute d'un poids sous 5 t. C'est cette regression que le test verrouille.

Piloté par la table LOTS : ajouter un lot au fur et a mesure des remplissages,
ne pas dupliquer ce fichier par fabricant.

Trois niveaux de controle :
  A. TOUTES les entrees-annees, en memoire : machinesData porte bien le poids
     de la BD, et plus aucun « A completer » ;
  B. un ECHANTILLON de 3 annees par modele, rendu reellement dans le navigateur :
     libelle du selecteur avec la classe entre crochets, poids affiche, et
     ligne « Classe machine » presente et non vide ;
  C. kit-rules.js et soumission.html.

Les valeurs attendues sont LUES DANS LA BD -- rien n'est code en dur.
"""
import sys, io, os, json, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

# fabricant -> modeles remplis (voir les commits pour les sources fabricant)
LOTS = {
    'Liebherr': ['R 922 Litronic G8', 'R 924 Litronic G8', 'R 926 Litronic G8',
                 'R 928 Litronic G8', 'R 930 Litronic G8', 'R 934 Litronic G8',
                 'R 938 Litronic G8', 'R 945 Litronic G8'],
    'Volvo CE': ['EC140D/E', 'EC180D/E', 'EC200D/E', 'EC220D/E', 'EC250D/E',
                 'EC300D/E', 'EC350D/E', 'EC380D/E', 'EC480D/E', 'EC750D/E',
                 'EW160D/E', 'EW180D/E', 'EW205D/E', 'EW220D/E'],
}

_DB = json.load(open(os.path.join(REPO, 'data', 'machines.json'),
                     encoding='utf-8'))['Excavatrice']


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1000']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    if not cond:
        print('  [X ] ' + label)
        fails.append(label)
    return cond


def annees_de(fab, mod):
    return sorted(a for a in _DB[fab] if mod in _DB[fab][a])


def echantillon(annees):
    """Premiere, mediane et derniere annee -- assez pour prouver le rendu sans
    recharger la page 187 fois."""
    if len(annees) <= 3:
        return annees
    return [annees[0], annees[len(annees) // 2], annees[-1]]


def charger(page):
    dv.get(BASE + '/' + page)
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined')"
        " && Object.keys(machinesData).length > 0;"))


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'T',"
                      " permissions:{modifBom:true}}));")

    print('--- A) toutes les entrees-annees, en memoire ---')
    charger('machine.html')
    n_tot = 0
    for fab, modeles in LOTS.items():
        for mod in modeles:
            for an in annees_de(fab, mod):
                n_tot += 1
                attendu = _DB[fab][an][mod]['Poids operationnel (kg / lbs)']
                vu = dv.execute_script(
                    "var e=machinesData['Excavatrice'][arguments[0]][arguments[1]]"
                    "[arguments[2]]; return e && e['Poids operationnel (kg / lbs)'];",
                    fab, an, mod)
                check('%s %s %s : poids en memoire = BD' % (fab, mod, an),
                      vu == attendu)
                check('%s %s %s : poids exploitable' % (fab, mod, an),
                      bool(vu) and vu != 'A completer' and vu[0].isdigit())
    print('  %d entrees-annees verifiees' % n_tot)

    print('--- B) rendu navigateur, 3 annees par modele ---')
    n_ech = 0
    for fab, modeles in LOTS.items():
        for mod in modeles:
            for an in echantillon(annees_de(fab, mod)):
                n_ech += 1
                e = _DB[fab][an][mod]
                poids, classe_bd = (e['Poids operationnel (kg / lbs)'],
                                    e['Classe machine'])
                # Selectionner un modele restreint la liste des annees a CE
                # modele, et re-selectionner une valeur deja choisie ne declenche
                # aucun 'change' : il faut recharger entre deux modeles.
                charger('machine.html')
                Select(dv.find_element(By.ID, 'select-type')).select_by_value('Excavatrice')
                WebDriverWait(dv, 20).until(lambda d: any(
                    o.get_attribute('value') == fab
                    for o in d.find_elements(By.CSS_SELECTOR, '#select-fabricant option')))
                Select(dv.find_element(By.ID, 'select-fabricant')).select_by_value(fab)
                WebDriverWait(dv, 20).until(lambda d: len(
                    d.find_elements(By.CSS_SELECTOR, '#select-annee option')) > 1)
                Select(dv.find_element(By.ID, 'select-annee')).select_by_value(an)
                WebDriverWait(dv, 20).until(lambda d: len(
                    d.find_elements(By.CSS_SELECTOR, '#select-modele option')) > 1)
                libelles = {o.get_attribute('value'): o.text for o in
                            dv.find_elements(By.CSS_SELECTOR, '#select-modele option')}
                if not check('%s %s %s present dans la liste' % (fab, mod, an),
                             mod in libelles):
                    continue
                check('%s %s %s libelle porte [%s]' % (fab, mod, an, classe_bd),
                      ('[' + classe_bd + ']') in libelles[mod])
                Select(dv.find_element(By.ID, 'select-modele')).select_by_value(mod)
                WebDriverWait(dv, 20).until(
                    lambda d: poids in d.find_element(By.TAG_NAME, 'body').text)
                check('%s %s %s poids affiche = BD' % (fab, mod, an),
                      poids in dv.find_element(By.TAG_NAME, 'body').text)
                vue = dv.execute_script(
                    "var t=document.querySelectorAll('.specs-table tr');"
                    "for (var i=0;i<t.length;i++){var c=t[i].querySelectorAll('td');"
                    "if(c.length>1 && /classe|class/i.test(c[0].textContent))"
                    "return c[1].textContent.trim();} return null;")
                check('%s %s %s ligne "Classe machine" presente (%r)'
                      % (fab, mod, an, vue), bool(vue))
    print('  %d rendus verifies' % n_ech)

    print('--- C) kit-rules.js + soumission.html ---')
    JS = ("var s = machinesData['Excavatrice'][arguments[0]][arguments[1]][arguments[2]];"
          "return window.KitRules.excDefaults(s, arguments[2]);")
    charger('machine.html')
    for fab, modeles in LOTS.items():
        for mod in modeles:
            an = annees_de(fab, mod)[-1]
            dft = dv.execute_script(JS, fab, an, mod)
            # aucun modele de ces lots ne pese moins de 5 t
            check('%s %s : 0004 = na (pas un mini)' % (fab, mod),
                  dft.get('0004') == 'na')
            check('%s %s : 0000 cabine = r' % (fab, mod), dft.get('0000') == 'r')
    charger('soumission.html')
    for fab, modeles in LOTS.items():
        for mod in modeles:
            an = annees_de(fab, mod)[0]
            p = dv.execute_script(
                "var e=machinesData['Excavatrice'][arguments[0]][arguments[1]]"
                "[arguments[2]]; return e && e['Poids operationnel (kg / lbs)'];",
                fab, an, mod)
            check('soumission : %s %s %s a un poids exploitable' % (fab, mod, an),
                  bool(p) and p != 'A completer')

    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE']
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:5]:
        print('     ', e['message'][:200])

except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails[:25]:
    print('   -', f)
sys.exit(0 if not fails else 1)
