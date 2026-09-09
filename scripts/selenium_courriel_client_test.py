# -*- coding: utf-8 -*-
"""Test navigateur du champ « Courriel du client » de la demande de soumission.

Ce que le champ doit faire, et surtout ce qu'il ne doit PAS faire :
  - visible pour les roles dealer et distributeur, absent pour les autres ;
  - facultatif : une demande part sans lui ;
  - s'il est rempli, l'adresse apparait dans le CORPS du courriel ;
  - ⚠️ elle n'entre JAMAIS dans les destinataires. Le courriel de soumission
    porte les totaux e-Trak : mettre le client du distributeur en copie lui
    montrerait la marge de son fournisseur. C'est le controle central de ce
    fichier -- si un jour quelqu'un « ameliore » le champ en l'ajoutant au
    mailto, c'est ici que ca doit casser.
  - une adresse mal formee bloque l'envoi.
"""
import sys, io, os, threading, http.server, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.common.exceptions import StaleElementReferenceException

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

CLIENT = 'jean.tremblay@constructionabc.com'
VENTES = 'ventes-test@e-trak.ca'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


def connecter(role):
    dv.get(BASE + '/index.html')
    dv.execute_script(
        "localStorage.setItem('portal_user', JSON.stringify({"
        "username:'t@e', email:'t@e', name:'Testeur', role:arguments[0],"
        "token:'x', permissions:{soumissionAccess:true, machineAccess:true}}));", role)
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 60).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined')"
        " && Object.keys(machinesData).length > 0;"))
    # Les courriels de vente viennent du backend : sans eux l'envoi s'arrete
    # avant d'avoir construit le corps. On les pose ici pour tester NOTRE regle.
    dv.execute_script("salesEmails = [arguments[0]];", VENTES)


def active_pour_role(el_id):
    """Le champ vit dans une section masquee tant qu'aucune machine n'est
    choisie : offsetParent y repondrait « invisible » quel que soit le role.
    Ici on lit donc la decision de gating elle-meme; la visibilite REELLE est
    verifiee en 2), machine selectionnee."""
    return dv.execute_script(
        "var e=document.getElementById(arguments[0]);"
        "return e ? (e.style.display !== 'none') : null;", el_id)


def choisir(select_id, valeur, essais=6):
    """La page se re-rend (i18n, data-refresh) entre le find et le select :
    une reference prise trop tot se perime. On la reprend a chaque essai."""
    derniere = None
    for _ in range(essais):
        try:
            WebDriverWait(dv, 20).until(lambda d: any(
                o.get_attribute('value') == valeur
                for o in d.find_elements(By.CSS_SELECTOR, '#%s option' % select_id)))
            Select(dv.find_element(By.ID, select_id)).select_by_value(valeur)
            return
        except StaleElementReferenceException as e:
            derniere = e
    raise derniere


def vraiment_visible(el_id):
    return dv.execute_script(
        "var e=document.getElementById(arguments[0]);"
        "return !!(e && e.offsetParent !== null);", el_id)


try:
    print('--- 1) visibilite par role ---')
    for role, attendu in [('distributeur', True), ('dealer', True),
                          ('admin', False), ('super_admin', False)]:
        connecter(role)
        check('role %-13s -> champ %s' % (role, 'actif' if attendu else 'desactive'),
              active_pour_role('soumission-client-email-box') == attendu)

    print('--- 2) parcours complet en distributeur ---')
    connecter('distributeur')
    # Une machine reelle, prise dans la BD via l'interface.
    choisir('select-type', 'Excavatrice')
    choisir('select-fabricant', 'Volvo CE')
    choisir('select-annee', '2026')
    choisir('select-modele', 'EC250D/E')
    WebDriverWait(dv, 20).until(lambda d: vraiment_visible('options-section'))
    check("champ reellement visible a l'ecran une fois la machine choisie",
          vraiment_visible('soumission-client-email'))

    # Un produit, sinon il n'y a rien a soumettre.
    dv.find_element(By.CSS_SELECTOR, '#toggle-limiteur').click()
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    # Champs obligatoires + reponse a « Installation par e-Trak ? » = non,
    # ce qui rend le lieu facultatif et evite un champ de plus.
    dv.execute_script(
        "document.getElementById('soumission-company').value='Construction ABC';"
        "document.getElementById('soumission-nb-systemes').value='2';")
    dv.execute_script(
        "var r=document.querySelector('input[name=\"install-etrak\"][value=\"non\"]');"
        "if(r){r.checked=true; r.dispatchEvent(new Event('change',{bubbles:true}));}")

    def champ():
        return dv.find_element(By.ID, 'soumission-client-email')

    print('  a) adresse mal formee : l\'envoi doit etre bloque')
    dv.execute_script("arguments[0].value='pasuncourriel';", champ())
    dv.execute_script("window.__lastSoumissionEmail = null;")
    dv.execute_script("window.alert = function(m){ window.__alerte = m; };")
    dv.find_element(By.ID, 'soumission-submit').click()
    WebDriverWait(dv, 10).until(lambda d: d.execute_script(
        "return window.__alerte !== undefined || window.__lastSoumissionEmail;"))
    check('envoi bloque (aucun courriel construit)',
          dv.execute_script("return !window.__lastSoumissionEmail;"))
    check('champ marque invalide',
          'champ-invalide' in (champ().get_attribute('class') or ''))

    print('  b) adresse valide : dans le corps, jamais dans les destinataires')
    dv.execute_script("arguments[0].value=arguments[1];"
                      "arguments[0].dispatchEvent(new Event('input',{bubbles:true}));",
                      champ(), CLIENT)
    dv.execute_script("window.__lastSoumissionEmail = null; window.__alerte = undefined;")
    dv.find_element(By.ID, 'soumission-submit').click()
    WebDriverWait(dv, 15).until(lambda d: d.execute_script(
        "return !!window.__lastSoumissionEmail;"))
    m = dv.execute_script("return window.__lastSoumissionEmail;")
    print('     destinataires : %r' % m.get('to'))
    check('le corps porte le courriel du client', CLIENT in (m.get('body') or ''))
    check('⚠️ le client N\'EST PAS destinataire (champ "to")',
          CLIENT.lower() not in (m.get('to') or '').lower())
    check('⚠️ le client N\'EST PAS en copie (champ "cc")',
          CLIENT.lower() not in (m.get('cc') or '').lower())
    # L'adresse injectee plus haut ne survit pas toujours : la page charge les
    # vraies adresses de vente depuis le backend et ecrase la liste. Ce qui
    # compte n'est pas QUELLE adresse s'y trouve, mais qu'il y en ait une.
    check('la demande a bien des destinataires', bool((m.get('to') or '').strip()))
    check('le corps porte encore les totaux (inchange)',
          'Total' in (m.get('body') or '') or 'total' in (m.get('body') or ''))

    print('  c) champ vide : la demande part quand meme')
    dv.execute_script("arguments[0].value='';", champ())
    dv.execute_script("window.__lastSoumissionEmail = null;")
    dv.find_element(By.ID, 'soumission-submit').click()
    WebDriverWait(dv, 15).until(lambda d: d.execute_script(
        "return !!window.__lastSoumissionEmail;"))
    m2 = dv.execute_script("return window.__lastSoumissionEmail;")
    check('demande construite sans courriel client', bool(m2 and m2.get('body')))
    check('aucune ligne "Courriel du client" quand le champ est vide',
          'Courriel du client' not in (m2.get('body') or ''))

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
for f in fails[:20]:
    print('   -', f)
sys.exit(0 if not fails else 1)
