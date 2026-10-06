# -*- coding: utf-8 -*-
"""Test du panier multi-machines de la Soumission (demande de Gord, decisions de Steve
du 2026-09-29 : unites et installation par machine, 10 max ; 2026-09-30 : UN seul bloc
Epicor au bas du courriel, qui repete les lignes de chaque machine a la suite).

Verifie :
  1. ajout d'une machine : le panier l'affiche (« 2 x Caterpillar 320 (2024) »), l'ecran
     machine se vide, les informations du client restent ;
  2. garde-fous d'ajout : sans unites, sans reponse d'installation, rien a l'ecran ;
  3. « Dupliquer » remet la machine a l'ecran A L'IDENTIQUE (meme texte, meme Epicor) ;
  4. « Modifier » la sort du panier et la remet a SA place quand on la rajoute ;
  5. « Retirer » (avec confirmation) ;
  6. le panier survit a un rechargement de la page ;
  7. envoi : un courriel, une section par machine, UN SEUL BLOC EPICOR au bas (lignes de
     chaque machine a la suite), quantites x unites,
     total general = somme des machines, objet avec le nombre de machines ; panier vide apres ;
  8. machine a l'ecran non ajoutee au moment d'envoyer : proposee, puis incluse ;
  9. lieu non exige si toutes les machines sont installees par le client ;
 10. limite de 10 machines ;
 11. aucune erreur JS SEVERE ;
 12. (2026-10-06) panier de 2 machines et plus : a l'envoi, la question « une seule
     soumission / une soumission par machine / Annuler ». Par machine : chaque machine
     suivie de SON bloc Epicor, pas de total general ni de bloc au bas, objet
     « Demande de N soumissions (1 par machine) ». Annuler : rien ne part, panier intact.
"""
import sys, io, os, json, threading, http.server, socketserver, time
from urllib.parse import unquote
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8803
# « --live » rejoue le test sur le site en ligne (aucun courriel ne part : l'ouverture
# d'Outlook est interceptee).
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
from _prix_test import PRIX, installer_prix, SESSION_TEST_JS   # prix : serveur simule

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


def choisir(select_id, valeur, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if js(CHOISIR, select_id, valeur):
            return True
        time.sleep(0.3)
    return False


def champ(cid, val):
    js("var e=document.getElementById(arguments[0]); e.value=arguments[1];"
       "e.dispatchEvent(new Event('input',{bubbles:true}));", cid, val)


def ouvrir(vider=True):
    dv.get(BASE + '/soumission.html')
    # Vendeurs et courriels de vente viennent du VRAI serveur du portail : il lui arrive
    # de mettre plus de 40 s a repondre. On attend plus longtemps et, si ca echoue, on
    # dit ce qui manque (sinon l'echec ressemble a un defaut du panier).
    etat = ("return {bd: typeof machinesData!=='undefined' && Object.keys(machinesData).length>0,"
            " prix: typeof priceData!=='undefined' && Object.keys(priceData).length>0,"
            " ventes: typeof salesEmails!=='undefined' && salesEmails.length>0,"
            " vendeurs: typeof vendeursList!=='undefined' && vendeursList.length>0};")
    try:
        WebDriverWait(dv, 120).until(lambda d: all(d.execute_script(etat).values()))
    except Exception:
        raise RuntimeError('page pas prete apres 120 s : %r' % dv.execute_script(etat))
    if vider:
        js("sessionStorage.removeItem('soumission_panier_v1'); panier = []; rendrePanier();")
    # Boites de dialogue et courriel interceptes : le test lit ce qui aurait ete montre.
    js("window.__alertes=[]; window.__confirms=[]; window.__reponse=true; window.__liens=[];"
       "window.alert=function(m){ window.__alertes.push(String(m)); };"
       "window.confirm=function(m){ window.__confirms.push(String(m)); return window.__reponse; };"
       "window.ouvrirLienCourriel=function(u){ window.__liens.push(u); };")
    time.sleep(0.5)


def machine(type_, fab, modele, annee, options, unites, install):
    for sid, val in (('select-type', type_), ('select-fabricant', fab), ('select-modele', modele), ('select-annee', annee)):
        check('selection %s' % val, choisir(sid, val))
    time.sleep(0.6)
    for o in options:
        js("document.getElementById(arguments[0]).click();", o)
        time.sleep(0.5)
    if unites is not None:
        champ('soumission-nb-systemes', str(unites))
    if install:
        js("document.getElementById('install-etrak-%s').click();" % install)
    time.sleep(0.5)


def vendeur():
    js("var b=document.getElementById('soumission-vendeur-box'),s=document.getElementById('soumission-vendeur');"
       "if(!b||b.style.display==='none') return;"
       "for(var i=0;i<s.options.length;i++){ if(s.options[i].value==='rdesrosiers@e-trak.ca'){ s.selectedIndex=i;"
       " s.dispatchEvent(new Event('change',{bubbles:true})); } }")


def ajouter():
    js("document.getElementById('panier-ajouter').click();")
    time.sleep(0.8)


def panier_js():
    return js("return panier.map(function(it){ return { lib: it.unites + ' x ' + libelleMachine(it.photo),"
              " inst: it.photo.installation, epicor: texteEpicor(it.photo.epicor), texte: texteMachine(it.photo, true) }; });")


def libelles_affiches():
    return js("return [...document.querySelectorAll('#panier-liste .panier-item-titre')].map(e=>e.textContent.trim());")


def envoyer(choix=None):
    """Clique « Envoyer ». choix : 'une' ou 'par-machine' pour repondre a la question du
    format (panier de 2 machines et plus), 'cancel' pour Annuler, None si aucune question
    n'est attendue. Renvoie True si la question est apparue."""
    js("window.__lastSoumissionEmail=null; document.getElementById('soumission-submit').click();")
    time.sleep(1.0)
    vue = js("var m=document.getElementById('modal-format'); return !!m && m.style.display==='flex';")
    if vue and choix:
        js("document.getElementById('modal-format-' + arguments[0]).click();", choix)
        time.sleep(1.0)
    return vue


def action(i, act):
    js("document.querySelectorAll('#panier-liste .panier-item')[arguments[0]].querySelector('[data-act=\"%s\"]').click();" % act, i)
    time.sleep(1.2)


try:
    dv.get(BASE + '/index.html')
    js(SESSION_TEST_JS + "localStorage.setItem('portal_lang','fr');")

    print('--- 1) ajout d une premiere machine ---')
    ouvrir()
    check('panier cache au depart', js("return document.getElementById('panier-section').style.display") == 'none')
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 2, 'oui')
    champ('soumission-company', 'Test Claude inc.')
    champ('soumission-lieu', 'Victoriaville')
    check('tableau : quantites x 2 unites (Epicor 1500-0000 qte 2)', '1500-0000\t2' in js("return epicorBlockText();"))
    ajouter()
    p = panier_js()
    check('1 machine dans le panier : 2 x Caterpillar 320 (2024)', [x['lib'] for x in p] == ['2 x Caterpillar 320 (2024)'], p)
    check('le panier est affiche', js("return document.getElementById('panier-section').style.display") == '')
    check('liste affichee : « 1. 2 × Caterpillar 320 (2024) »', libelles_affiches() == ['1. 2 × Caterpillar 320 (2024)'], libelles_affiches())
    check('apres l ajout : type et fabricant gardes, modele et options vides',
          js("return document.getElementById('select-type').value") == 'Excavatrice'
          and js("return document.getElementById('select-fabricant').value") == 'Caterpillar'
          and js("return document.getElementById('select-modele').value") == ''
          and js("return document.getElementById('options-section').style.display") == 'none')
    check('les modeles du fabricant sont deja proposes', js("return document.getElementById('select-modele').options.length") > 2)
    check('les specifications de la machine ajoutee ne restent pas affichees',
          js("return document.getElementById('specs-section').style.display") == 'none')
    check('infos du client gardees', js("return document.getElementById('soumission-company').value") == 'Test Claude inc.'
          and js("return document.getElementById('soumission-lieu').value") == 'Victoriaville')
    check('section client + envoi toujours visible', js("return document.getElementById('commun-section').style.display") == '')
    check('bouton d envoi : « (1 machine(s)) »', '(1 machine(s))' in js("return document.getElementById('soumission-submit').textContent"))

    print('--- 2) garde-fous d ajout ---')
    js("document.getElementById('panier-ajouter').click();")
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], None, None)
    check('infos du client toujours la apres un changement de machine',
          js("return document.getElementById('soumission-company').value") == 'Test Claude inc.')
    ajouter()
    check('sans unites : pas ajoutee, champ en rouge', len(panier_js()) == 1 and
          'rgb(255, 68, 68)' in js("return getComputedStyle(document.getElementById('soumission-nb-systemes')).borderColor"))
    champ('soumission-nb-systemes', '1')
    ajouter()
    check('sans reponse d installation : pas ajoutee', len(panier_js()) == 1)
    js("document.getElementById('install-etrak-non').click();")
    time.sleep(0.4)
    ajouter()
    p = panier_js()
    check('2e machine ajoutee : 1 x Bobcat E08 (2015), installee par le client',
          [x['lib'] for x in p] == ['2 x Caterpillar 320 (2024)', '1 x Bobcat E08 (2015)'] and p[1]['inst'] == 'non', p)
    js("window.__alertes=[];")
    ajouter()
    check('rien a l ecran : message, rien ajoute', len(panier_js()) == 2 and js("return window.__alertes.length") == 1)

    print('--- 3) Dupliquer : la machine revient a l ecran a l identique ---')
    ref = panier_js()[0]
    action(0, 'dupliquer')
    ecran = js("var p=photoMachine(); return { texte: texteMachine(p, true), epicor: texteEpicor(p.epicor), unites: unitesMachine(), inst: reponseInstall() };")
    check('meme texte de courriel que la machine du panier', ecran['texte'] == ref['texte'])
    check('meme bloc Epicor', ecran['epicor'] == ref['epicor'], (ecran['epicor'], ref['epicor']))
    check('memes unites (2) et installation (oui)', ecran['unites'] == 2 and ecran['inst'] == 'oui', ecran)
    check('l original reste dans le panier', len(panier_js()) == 2)
    champ('soumission-nb-systemes', '3')
    ajouter()
    check('copie ajoutee avec 3 unites', [x['lib'] for x in panier_js()][2:] == ['3 x Caterpillar 320 (2024)'], panier_js())

    print('--- 4) Modifier : sort du panier, revient a sa place ---')
    action(1, 'modifier')
    check('sortie du panier (2 machines restantes)', [x['lib'] for x in panier_js()] == ['2 x Caterpillar 320 (2024)', '3 x Caterpillar 320 (2024)'])
    check('Bobcat E08 a l ecran', js("return document.getElementById('select-modele').value") == 'E08'
          and js("return document.getElementById('lim-hauteur').checked"))
    ajouter()
    check('revenue en 2e position', [x['lib'] for x in panier_js()] ==
          ['2 x Caterpillar 320 (2024)', '1 x Bobcat E08 (2015)', '3 x Caterpillar 320 (2024)'], panier_js())

    print('--- 5) Retirer ---')
    js("window.__reponse=false;")
    action(2, 'retirer')
    check('retrait annule : 3 machines', len(panier_js()) == 3)
    js("window.__reponse=true;")
    action(2, 'retirer')
    check('retrait confirme : 2 machines', [x['lib'] for x in panier_js()] == ['2 x Caterpillar 320 (2024)', '1 x Bobcat E08 (2015)'])

    print('--- 6) rechargement de la page ---')
    ouvrir(vider=False)
    check('le panier survit au rechargement', [x['lib'] for x in panier_js()] == ['2 x Caterpillar 320 (2024)', '1 x Bobcat E08 (2015)'])
    check('panier et section client visibles sans machine a l ecran',
          js("return document.getElementById('panier-section').style.display") == ''
          and js("return document.getElementById('commun-section').style.display") == '')
    champ('soumission-company', 'Test Claude inc.')
    champ('soumission-lieu', 'Victoriaville')
    vendeur()

    print('--- 7) envoi du panier ---')
    avant = panier_js()
    js("window.__lastSoumissionEmail=null; document.getElementById('soumission-submit').click();")
    time.sleep(1.0)
    check('2 machines : la question du format apparait',
          js("return document.getElementById('modal-format').style.display") == 'flex')
    check('texte de la question : « Le panier contient 2 machines »',
          'Le panier contient 2 machines' in js("return document.getElementById('modal-format-text').textContent"))
    check('rien ne part avant la reponse', not js("return window.__lastSoumissionEmail;"))
    js("document.getElementById('modal-format-une').click();"); time.sleep(1.0)
    check('la fenetre se ferme', js("return document.getElementById('modal-format').style.display") == 'none')
    m = js("return window.__lastSoumissionEmail;")
    check('un courriel genere', bool(m))
    if m:
        corps = m['body']
        if os.environ.get('PANIER_EXEMPLE'):
            open(os.environ['PANIER_EXEMPLE'], 'w', encoding='utf-8').write(m['subject'] + '\n\n' + corps)
        check('objet : 2 machines, avec la liste', m['subject'] == 'Demande de soumission — 2 machine(s) : Caterpillar 320 (2024), Bobcat E08 (2015)', m['subject'])
        check('« Nombre de machines : 2 »', 'Nombre de machines : 2' in corps)
        check('« Format demandé : une seule soumission pour les 2 machines »',
              'Format demandé : une seule soumission pour les 2 machines' in corps)
        check('section machine 1 : « === Machine 1 de 2 : 2 × excavatrice Caterpillar 320 (2024) === »', '=== Machine 1 de 2 : 2 × excavatrice Caterpillar 320 (2024) ===' in corps)
        check('section machine 2 : « === Machine 2 de 2 : 1 × excavatrice Bobcat E08 (2015) === »', '=== Machine 2 de 2 : 1 × excavatrice Bobcat E08 (2015) ===' in corps)
        entete = js("return i18n.t('email.epicor_header');")
        # 2026-09-30 : UN seul bloc Epicor au bas, lignes de chaque machine a la suite.
        bloc_attendu = avant[0]['epicor'] + '\n' + avant[1]['epicor']
        check('UN SEUL bloc Epicor dans le courriel', corps.count(entete) == 1, corps.count(entete))
        check('bloc = lignes machine 1 puis machine 2, sans ligne vide', ('\n' + entete + '\n' + bloc_attendu + '\n') in corps)
        check('bloc au bas : apres le total general, avant la signature',
              corps.find('TOTAL DE LA SOUMISSION') < corps.find(entete) < corps.find('Portail e-Trak'))
        check('machine 1 : qte x 2 ; machine 2 : qte x 1, pas de pose',
              '1500-0000\t2' in avant[0]['epicor'] and '-install' not in avant[1]['epicor'].lower())
        check('texte de chaque machine repris tel quel', all(x['texte'] in corps for x in avant))
        # Bobcat E08 installee par le client : la main-d'oeuvre pure 1500-0004-Install
        # n'est pas facturee, donc absente des produits comme du bloc Epicor (Steve, 2026-09-30).
        check('Bobcat posee par le client : pas de 1500-0004-Install dans ses produits',
              '1500-0004' not in avant[1]['texte'] and '1500-0004' not in avant[1]['epicor'], avant[1]['texte'])
        # Total general = somme des machines
        tot = js("var t={p:0,i:0}; JSON.parse(sessionStorage.getItem('soumission_panier_v1')||'[]'); return t;")
        attendu = js("return arguments[0];", 0)
        check('« TOTAL DE LA SOUMISSION » present', 'TOTAL DE LA SOUMISSION' in corps)
        check('lieu et entreprise une seule fois', corps.count('Victoriaville') == 1 and corps.count('Test Claude inc.') == 1)
        check('Copier pour Epicor = le bloc du bas', js("return window.__lastSoumissionEpicor;") == bloc_attendu)
    check('le panier est vide apres l envoi', len(panier_js()) == 0 and js("return sessionStorage.getItem('soumission_panier_v1')") == '[]')
    check('bouton d envoi revenu a « Envoyer la demande »', js("return document.getElementById('soumission-submit').textContent.trim()").endswith('Envoyer la demande'))

    print('--- 7b) total general = somme des machines ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 2, 'oui')
    champ('soumission-company', 'Test Claude inc.'); champ('soumission-lieu', 'Victoriaville')
    ajouter()
    machine('Retrocaveuse', 'Case', '580SN', '2015', ['lim-multi'], 1, 'oui')
    ajouter()
    sommes = js("var P=0,I=0; panier.forEach(function(it){ var t=totauxLignes(it.photo.lignes); P+=t.pieces; I+=t.installation; }); return [P,I, fmtPrice(P), fmtPrice(I)];")
    vendeur()
    envoyer('une')
    corps = js("return window.__lastSoumissionEmail.body;")
    ligne_tot = corps.split('TOTAL DE LA SOUMISSION\n')[1].split('\n')[0] if 'TOTAL DE LA SOUMISSION\n' in corps else ''
    check('total general = %s + %s' % (sommes[2], sommes[3]), sommes[2] in ligne_tot and sommes[3] in ligne_tot, ligne_tot)
    cat = PRIX['1500-0000']['item'] + PRIX['1500-0001']['item'] + PRIX['1500-0009']['item']
    check('la machine 1 compte bien pour 2 kits (pieces >= 2 x %d)' % cat, sommes[0] >= 2 * cat, sommes)

    print('--- 8) machine a l ecran non ajoutee au moment d envoyer ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 1, 'oui')
    champ('soumission-company', 'Test Claude inc.'); champ('soumission-lieu', 'Victoriaville')
    ajouter()
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    check('lieu toujours « obligatoire » : la machine du panier est posee par e-Trak',
          'obligatoire' in js("return document.querySelector('label[for=soumission-lieu]').textContent"),
          js("return document.querySelector('label[for=soumission-lieu]').textContent"))
    vendeur()
    js("window.__confirms=[];")
    check('la question du format suit l ajout (2 machines)', envoyer('une'))
    check('on propose de l ajouter', len(js("return window.__confirms;")) == 1 and "pas encore dans la soumission" in js("return window.__confirms[0];"))
    corps = js("return window.__lastSoumissionEmail ? window.__lastSoumissionEmail.body : '';")
    check('acceptee : incluse (2 machines)', 'Nombre de machines : 2' in corps and 'Bobcat E08 (2015)' in corps)

    print('--- 9) lieu non exige si tout est installe par le client ---')
    ouvrir()
    champ('soumission-lieu', '')
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    champ('soumission-company', 'Test Claude inc.')
    ajouter()
    vendeur()
    check('1 seule machine : aucune question de format', not envoyer())
    check('envoye sans lieu', bool(js("return window.__lastSoumissionEmail;")))
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 1, 'oui')
    champ('soumission-company', 'Test Claude inc.'); champ('soumission-lieu', '')
    ajouter()
    vendeur()
    js("window.__lastSoumissionEmail=null; document.getElementById('soumission-submit').click();"); time.sleep(1.2)
    check('pose e-Trak : le lieu est exige', not js("return window.__lastSoumissionEmail;")
          and 'rgb(255, 68, 68)' in js("return getComputedStyle(document.getElementById('soumission-lieu')).borderColor"))

    print('--- 12) une soumission par machine (Steve, 2026-10-06) ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 2, 'oui')
    champ('soumission-company', 'Test Claude inc.'); champ('soumission-lieu', 'Victoriaville')
    ajouter()
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    ajouter()
    vendeur()
    avant = panier_js()
    check('Annuler : la question est posee', envoyer('cancel'))
    check('Annuler : rien ne part, panier intact (2 machines)',
          not js("return window.__lastSoumissionEmail;") and len(panier_js()) == 2
          and js("return document.getElementById('modal-format').style.display") == 'none')
    check('par machine : la question est posee', envoyer('par-machine'))
    m = js("return window.__lastSoumissionEmail;")
    check('par machine : un courriel genere', bool(m))
    if m:
        corps = m['body']
        if os.environ.get('PANIER_EXEMPLE_PAR_MACHINE'):
            open(os.environ['PANIER_EXEMPLE_PAR_MACHINE'], 'w', encoding='utf-8').write(m['subject'] + '\n\n' + corps)
        check('objet « Demande de 2 soumissions (1 par machine) : ... »',
              m['subject'] == 'Demande de 2 soumissions (1 par machine) : Caterpillar 320 (2024), Bobcat E08 (2015)', m['subject'])
        check('« Format demandé : UNE SOUMISSION PAR MACHINE (2 soumissions) »',
              'Format demandé : UNE SOUMISSION PAR MACHINE (2 soumissions)' in corps)
        check('« === Soumission 1 de 2 : 2 × excavatrice Caterpillar 320 (2024) === »',
              '=== Soumission 1 de 2 : 2 × excavatrice Caterpillar 320 (2024) ===' in corps)
        check('« === Soumission 2 de 2 : 1 × excavatrice Bobcat E08 (2015) === »',
              '=== Soumission 2 de 2 : 1 × excavatrice Bobcat E08 (2015) ===' in corps)
        e1 = js("return i18n.t('email.epicor_header_soumission', {i: 1});")
        e2 = js("return i18n.t('email.epicor_header_soumission', {i: 2});")
        check('bloc Epicor de la soumission 1 = lignes de la machine 1', ('\n' + e1 + '\n' + avant[0]['epicor'] + '\n') in corps)
        check('bloc Epicor de la soumission 2 = lignes de la machine 2', ('\n' + e2 + '\n' + avant[1]['epicor'] + '\n') in corps)
        check('chaque bloc sous SA machine (1, bloc 1, 2, bloc 2)',
              corps.find('Soumission 1 de 2') < corps.find(e1) < corps.find('Soumission 2 de 2') < corps.find(e2))
        check('pas de total general', 'TOTAL DE LA SOUMISSION' not in corps)
        check('pas de bloc Epicor commun au bas', js("return i18n.t('email.epicor_header');") not in corps)
        check('texte de chaque machine repris tel quel (avec son total)', all(x['texte'] in corps for x in avant))
        check('signature a la fin', corps.rstrip().endswith('portal-machine-V2/'))
        check('Copier pour Epicor = lignes des 2 machines',
              js("return window.__lastSoumissionEpicor;") == avant[0]['epicor'] + '\n' + avant[1]['epicor'])
    check('par machine : panier vide apres l envoi', len(panier_js()) == 0)
    js("localStorage.setItem('portal_lang','en'); window.dispatchEvent(new Event('langchange'));"); time.sleep(0.5)
    check('anglais : « One single quote » / « One quote per machine »',
          js("return i18n.t('panier.format_une') + ' / ' + i18n.t('panier.format_par_machine')") == 'One single quote / One quote per machine')
    js("localStorage.setItem('portal_lang','fr'); window.dispatchEvent(new Event('langchange'));"); time.sleep(0.5)

    print('--- 9b) sans machine : les unites ne multiplient pas (decision de Steve) ---')
    ouvrir()
    check('type « sans machine »', choisir('select-type', '__sans_machine__'))
    time.sleep(0.8)
    champ('soumission-equipement', 'Chargeuse maison')
    js("document.getElementById('toggle-camera').click();"); time.sleep(0.4)
    js("document.getElementById('cam-quad').click();"); time.sleep(0.4)
    js("var q=document.getElementById('cam-qte'); q.value='7'; q.dispatchEvent(new Event('change',{bubbles:true}));"); time.sleep(0.5)
    champ('soumission-nb-systemes', '2')
    js("document.getElementById('install-etrak-oui').click();"); time.sleep(0.5)
    epi = js("return epicorBlockText();")
    check('7 cameras x 2 unites -> Epicor 1300-0003 qte 7 (pas 14)', '1300-0003\t7' in epi and '\t14' not in epi, epi)
    ajouter()
    check('ajoutee au panier avec le meme bloc Epicor', panier_js() and panier_js()[0]['epicor'] == epi, panier_js())
    check('apres l ajout : on reste en mode sans machine, equipement a ressaisir',
          js("return document.getElementById('select-type').value") == '__sans_machine__'
          and js("return document.getElementById('soumission-equipement').value") == '')

    print('--- 10) limite de 10 machines ---')
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 1, 'oui')
    ajouter()
    js("while (panier.length < 10) panier.push(JSON.parse(JSON.stringify(panier[0]))); panierSauver(); rendrePanier();")
    machine('Excavatrice', 'Bobcat', 'E08', '2015', ['lim-hauteur'], 1, 'non')
    js("window.__alertes=[];"); ajouter()
    check('11e machine refusee avec message', len(panier_js()) == 10 and 'au plus 10' in ''.join(js("return window.__alertes;")))
    check('compteur « (10 / 10) »', js("return document.getElementById('panier-compte').textContent") == '(10 / 10)')

    print('--- 11) anglais ---')
    js("localStorage.setItem('portal_lang','en'); window.dispatchEvent(new Event('langchange'));"); time.sleep(0.6)
    check('bouton Edit/Duplicate/Remove', js("return document.querySelector('#panier-liste [data-act=modifier]').textContent") == 'Edit')
    check('envoi : « Send request (10 machine(s)) »', '(10 machine(s))' in js("return document.getElementById('soumission-submit').textContent"))
    js("localStorage.setItem('portal_lang','fr'); sessionStorage.removeItem('soumission_panier_v1');")

    print('--- 12) console propre ---')
    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE' and 'mailto' not in e['message'].lower()]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:4]:
        print('     ', e['message'][:220])
except Exception as e:
    import traceback; traceback.print_exc()
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails:
    print('  -', f)
sys.exit(1 if fails else 0)
