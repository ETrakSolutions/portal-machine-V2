# -*- coding: utf-8 -*-
"""Test du bouton « Copier pour Epicor » du panneau de la Soumission, en CLIQUANT dessus
(signalement de Steve, 2026-09-30 : « Aucun item a copier » avec un panier).

Scenarios :
  A. une machine, envoyee, puis clic : copie le bloc de la machine ;
  B. panier de 2 machines, envoye, puis clic : copie le bloc du bas du courriel ;
  C. panier de 2 machines PAS encore envoye, ecran vide, panneau ouvert par « ? », puis
     clic : doit copier les lignes du panier (pas « Aucun item a copier ») ;
  D. rien du tout (ni ecran ni panier) : le message « Aucun item a copier » reste juste ;
  E. panier d'une machine + une machine a l'ecran pas ajoutee : panier puis ecran ;
  F. une machine a l'ecran, sans envoi : ses lignes (preparer sans s'envoyer de courriel).
  G-I. « Copier la demande » : panier non envoye, machine a l ecran, rien du tout.
  J. mini excavatrice : 1500-0004-Install (main-d oeuvre pure) seulement si e-Trak installe.

    py -3.12 scripts/selenium_copier_epicor_test.py [--live]
"""
import sys, io, os, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8804
SUR_LE_LIVE = '--live' in sys.argv
BASE = 'https://etraksolutions.github.io/portal-machine-V2' if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)

sys.path.insert(0, os.path.join(REPO, 'scripts'))
from _prix_test import installer_prix, SESSION_TEST_JS

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
dv = webdriver.Chrome(options=opts)
installer_prix(dv)
fails = []


def check(label, cond, detail=None):
    print(('  [OK] ' if cond else '  [X ] ') + label + ('' if cond or detail is None else '  -> %r' % (detail,)))
    if not cond:
        fails.append(label)


def js(code, *a):
    return dv.execute_script(code, *a)


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if js(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


def champ(cid, val):
    js("var e=document.getElementById(arguments[0]); e.value=arguments[1];"
       "e.dispatchEvent(new Event('input',{bubbles:true}));", cid, val)


def ouvrir():
    dv.get(BASE + '/soumission.html')
    etat = ("return {bd: typeof machinesData!=='undefined' && Object.keys(machinesData).length>0,"
            " prix: typeof priceData!=='undefined' && Object.keys(priceData).length>0,"
            " ventes: typeof salesEmails!=='undefined' && salesEmails.length>0,"
            " vendeurs: typeof vendeursList!=='undefined' && vendeursList.length>0};")
    try:
        WebDriverWait(dv, 120).until(lambda d: all(d.execute_script(etat).values()))
    except Exception:
        raise RuntimeError('page pas prete apres 120 s : %r' % dv.execute_script(etat))
    js("sessionStorage.removeItem('soumission_panier_v1'); panier = []; rendrePanier();")
    # Dialogues, courriel et presse-papiers interceptes : on lit ce qui aurait ete fait.
    js("window.__alertes=[]; window.__confirms=[]; window.__liens=[]; window.__copie=null;"
       "window.alert=function(m){ window.__alertes.push(String(m)); };"
       "window.confirm=function(m){ window.__confirms.push(String(m)); return true; };"
       "window.ouvrirLienCourriel=function(u){ window.__liens.push(u); };"
       "try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {"
       "  writeText: function(t){ window.__copie = t; return Promise.resolve(); } } }); } catch (e) {}"
       "window.legacyCopy = function(t, done){ window.__copie = t; if (done) done(); };")
    time.sleep(0.5)


def machine(type_, fab, modele, annee, options, unites, install):
    for sid, val in (('select-type', type_), ('select-fabricant', fab), ('select-modele', modele), ('select-annee', annee)):
        check('selection %s' % val, choisir(sid, val))
    time.sleep(0.6)
    for o in options:
        js("document.getElementById(arguments[0]).click();", o)
        time.sleep(0.5)
    champ('soumission-nb-systemes', str(unites))
    js("document.getElementById('install-etrak-%s').click();" % install)
    time.sleep(0.5)


def client():
    champ('soumission-company', 'Test Claude inc.')
    champ('soumission-lieu', 'Victoriaville')
    js("var b=document.getElementById('soumission-vendeur-box'),s=document.getElementById('soumission-vendeur');"
       "if(!b||b.style.display==='none') return;"
       "for(var i=0;i<s.options.length;i++){ if(s.options[i].value==='rdesrosiers@e-trak.ca'){ s.selectedIndex=i;"
       " s.dispatchEvent(new Event('change',{bubbles:true})); } }")


def ajouter():
    js("document.getElementById('panier-ajouter').click();")
    time.sleep(0.8)


def cliquer_copier():
    js("window.__alertes=[]; window.__copie=null;")
    btn = js("return !!document.getElementById('soumission-copy-epicor-btn');")
    if btn:
        js("document.getElementById('soumission-copy-epicor-btn').click();")
        time.sleep(0.6)
    return btn, js("return window.__copie;"), js("return window.__alertes;")


def panier_epicor():
    return js("return panier.map(function(it){ return texteEpicor(it.photo.epicor); }).filter(Boolean).join('\\n');")


try:
    dv.get(BASE + '/index.html')
    js(SESSION_TEST_JS + "localStorage.setItem('portal_lang','fr');")

    print('--- A) une machine envoyee, puis « Copier pour Epicor » ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 1, 'oui')
    client()
    attendu = js("return epicorBlockText();")
    js("document.getElementById('soumission-submit').click();")
    time.sleep(1.2)
    btn, copie, alertes = cliquer_copier()
    check('bouton present apres l envoi', btn)
    check('copie = bloc Epicor de la machine', copie == attendu and bool(attendu), (copie, attendu))
    check('aucun message « Aucun item »', not alertes, alertes)

    print('--- B) panier de 2 machines envoye, puis « Copier pour Epicor » ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 2, 'oui')
    client()
    ajouter()
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    ajouter()
    attendu = panier_epicor()
    js("document.getElementById('soumission-submit').click();")
    time.sleep(1.2)
    btn, copie, alertes = cliquer_copier()
    check('bouton present apres l envoi', btn)
    check('copie = lignes des 2 machines a la suite', copie == attendu and bool(attendu), (copie, attendu))
    check('aucun message « Aucun item »', not alertes, alertes)

    print('--- C) panier de 2 machines PAS envoye, panneau ouvert par « ? » ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 2, 'oui')
    client()
    ajouter()
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    ajouter()
    attendu = panier_epicor()
    js("document.getElementById('soumission-help-toggle').click();")
    time.sleep(0.6)
    btn, copie, alertes = cliquer_copier()
    check('panneau ouvert par « ? »', btn)
    check('copie = lignes du panier', copie == attendu and bool(attendu), (copie, attendu))
    check('aucun message « Aucun item »', not alertes, alertes)

    print('--- E) panier d une machine + une machine a l ecran pas encore ajoutee ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 2, 'oui')
    client()
    ajouter()
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    attendu = panier_epicor() + '\n' + js("return epicorBlockText();")
    js("document.getElementById('soumission-help-toggle').click();")
    time.sleep(0.6)
    btn, copie, alertes = cliquer_copier()
    check('copie = panier puis machine a l ecran', copie == attendu, (copie, attendu))
    check('aucun envoi de courriel', not js("return window.__liens;"))

    print('--- F) une machine a l ecran, sans panier ni envoi ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 1, 'oui')
    attendu = js("return epicorBlockText();")
    js("document.getElementById('soumission-help-toggle').click();")
    time.sleep(0.6)
    btn, copie, alertes = cliquer_copier()
    check('copie = machine a l ecran, sans envoi', copie == attendu and bool(attendu) and not js("return window.__liens;"), (copie, attendu))

    print('--- G) « Copier la demande » : panier de 2 machines PAS envoye ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 2, 'oui')
    client()
    ajouter()
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    ajouter()
    attendu_epi = panier_epicor()
    js("document.getElementById('soumission-help-toggle').click();")
    time.sleep(0.6)
    js("window.__alertes=[]; window.__copie=null; document.getElementById('soumission-copy-btn').click();")
    time.sleep(0.6)
    copie = js("return window.__copie;") or ''
    entete = js("return i18n.t('email.epicor_header');")
    check('texte copie, sans message', bool(copie) and not js("return window.__alertes;"), js("return window.__alertes;"))
    check('objet des 2 machines', 'Objet : Demande de soumission — 2 machine(s) : Caterpillar 320 (2024), Bobcat E08 (2015)' in copie)
    check('les 2 sections machine et UN seul bloc Epicor au bas',
          '=== Machine 1 de 2' in copie and '=== Machine 2 de 2' in copie and copie.count(entete) == 1
          and ('\n' + entete + '\n' + attendu_epi + '\n') in copie)
    check('destinataires et entreprise repris', copie.startswith('A : ') and 'Test Claude inc.' in copie)
    check('aucun courriel ouvert, panier intact', not js("return window.__liens;") and js("return panier.length;") == 2)

    print('--- H) « Copier la demande » : une machine a l ecran, sans envoi ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 1, 'oui')
    client()
    js("document.getElementById('soumission-help-toggle').click();")
    time.sleep(0.6)
    js("window.__alertes=[]; window.__copie=null; document.getElementById('soumission-copy-btn').click();")
    time.sleep(0.6)
    copie = js("return window.__copie;") or ''
    objet = js("return i18n.t('email.soumission_subject', {fab: selectFabricant.value, modele: selectModele.value, annee: selectAnnee.value});")
    check('objet = celui de l envoi', ('\nObjet : ' + objet + '\n') in copie, (objet, copie.split('\n')[:2]))
    check('corps avec la machine et le bloc Epicor', 'Machine : Excavatrice Caterpillar 320 (2024)' in copie and (entete + '\n' + js("return epicorBlockText();")) in copie)
    check('aucun courriel ouvert', not js("return window.__liens;"))

    print('--- I) « Copier la demande » sans rien : message ---')
    ouvrir()
    js("document.getElementById('soumission-help-toggle').click();")
    time.sleep(0.6)
    js("window.__alertes=[]; window.__copie=null; document.getElementById('soumission-copy-btn').click();")
    time.sleep(0.6)
    al = js("return window.__alertes;")
    check('message « Aucune demande a copier »', not js("return window.__copie;") and len(al) == 1 and 'Aucune demande' in al[0], al)

    print('--- J) mini excavatrice : 1500-0004-Install selon qui installe ---')
    ouvrir()
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'oui')
    p = js("var p=photoMachine(); return {texte: texteMachine(p), epicor: texteEpicor(p.epicor), n: p.produits.length};")
    check('posee par e-Trak : 1500-0004-Install dans les produits ET dans Epicor',
          '1500-0004-Install' in p['texte'] and '1500-0004' in p['epicor'], p)
    n_etrak = p['n']
    js("document.getElementById('install-etrak-non').click();")
    time.sleep(0.6)
    p = js("var p=photoMachine(); return {texte: texteMachine(p), epicor: texteEpicor(p.epicor), n: p.produits.length};")
    check('posee par le client : absente des produits et d Epicor, un produit de moins',
          '1500-0004' not in p['texte'] and '1500-0004' not in p['epicor'] and p['n'] == n_etrak - 1, p)
    check('les autres produits restent (kit de base)', '1500-0000' in p['texte'], p['texte'])

    print('--- D) rien a l ecran ni au panier : le message reste ---')
    ouvrir()
    js("document.getElementById('soumission-help-toggle').click();")
    time.sleep(0.6)
    btn, copie, alertes = cliquer_copier()
    check('message « Aucun item a copier »', btn and not copie and len(alertes) == 1 and 'Aucun item' in alertes[0], (copie, alertes))

    print('--- console propre ---')
    sev = [l for l in dv.get_log('browser') if l['level'] == 'SEVERE' and 'favicon' not in l['message']]
    check('aucune erreur JS SEVERE (%d)' % len(sev), not sev, [l['message'][:160] for l in sev])
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails:
    print('  -', f)
sys.exit(1 if fails else 0)
