# -*- coding: utf-8 -*-
"""Test du panier multi-machines de la Soumission (demande de Gord, decisions de Steve
du 2026-09-29 : unites et installation par machine, un bloc Epicor par machine, 10 max).

Verifie :
  1. ajout d'une machine : le panier l'affiche (« 2 x Caterpillar 320 (2024) »), l'ecran
     machine se vide, les informations du client restent ;
  2. garde-fous d'ajout : sans unites, sans reponse d'installation, rien a l'ecran ;
  3. « Dupliquer » remet la machine a l'ecran A L'IDENTIQUE (meme texte, meme Epicor) ;
  4. « Modifier » la sort du panier et la remet a SA place quand on la rajoute ;
  5. « Retirer » (avec confirmation) ;
  6. le panier survit a un rechargement de la page ;
  7. envoi : un courriel, une section et UN BLOC EPICOR PAR MACHINE, quantites x unites,
     total general = somme des machines, objet avec le nombre de machines ; panier vide apres ;
  8. machine a l'ecran non ajoutee au moment d'envoyer : proposee, puis incluse ;
  9. lieu non exige si toutes les machines sont installees par le client ;
 10. limite de 10 machines ;
 11. aucune erreur JS SEVERE.
"""
import sys, io, os, json, threading, http.server, socketserver, time
from urllib.parse import unquote
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8803
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

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
              " inst: it.photo.installation, epicor: texteEpicor(it.photo.epicor), texte: texteMachine(it.photo) }; });")


def libelles_affiches():
    return js("return [...document.querySelectorAll('#panier-liste .panier-item-titre')].map(e=>e.textContent.trim());")


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
    check('ecran machine vide apres l ajout', js("return document.getElementById('options-section').style.display") == 'none'
          and js("return document.getElementById('select-type').value") == '')
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
    ecran = js("var p=photoMachine(); return { texte: texteMachine(p), epicor: texteEpicor(p.epicor), unites: unitesMachine(), inst: reponseInstall() };")
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
    js("document.getElementById('soumission-submit').click();")
    time.sleep(1.2)
    m = js("return window.__lastSoumissionEmail;")
    check('un courriel genere', bool(m))
    if m:
        corps = m['body']
        check('objet : 2 machines, avec la liste', m['subject'] == 'Demande de soumission — 2 machine(s) : Caterpillar 320 (2024), Bobcat E08 (2015)', m['subject'])
        check('« Nombre de machines : 2 »', 'Nombre de machines : 2' in corps)
        check('section machine 1 : « === Machine 1 de 2 : 2 × Caterpillar 320 (2024) === »', '=== Machine 1 de 2 : 2 × Caterpillar 320 (2024) ===' in corps)
        check('section machine 2 : « === Machine 2 de 2 : 1 × Bobcat E08 (2015) === »', '=== Machine 2 de 2 : 1 × Bobcat E08 (2015) ===' in corps)
        entete = js("return i18n.t('email.epicor_header');")
        check('UN bloc Epicor par machine (2)', corps.count(entete) == 2)
        check('bloc de la machine 1 = celui du panier (qte x 2)', ('\n' + avant[0]['epicor'] + '\n') in corps and '1500-0000\t2' in avant[0]['epicor'])
        check('bloc de la machine 2 = celui du panier (qte x 1, pas de pose)', ('\n' + avant[1]['epicor'] + '\n') in corps and '-install' not in avant[1]['epicor'].lower())
        check('texte de chaque machine repris tel quel', all(x['texte'] in corps for x in avant))
        # Total general = somme des machines
        tot = js("var t={p:0,i:0}; JSON.parse(sessionStorage.getItem('soumission_panier_v1')||'[]'); return t;")
        attendu = js("return arguments[0];", 0)
        check('« TOTAL DE LA SOUMISSION » present', 'TOTAL DE LA SOUMISSION' in corps)
        check('lieu et entreprise une seule fois', corps.count('Victoriaville') == 1 and corps.count('Test Claude inc.') == 1)
        check('Copier pour Epicor : les deux blocs', js("return window.__lastSoumissionEpicor;") == avant[0]['epicor'] + '\n\n' + avant[1]['epicor'])
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
    js("document.getElementById('soumission-submit').click();"); time.sleep(1.2)
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
    js("window.__confirms=[]; document.getElementById('soumission-submit').click();"); time.sleep(1.2)
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
    js("window.__lastSoumissionEmail=null; document.getElementById('soumission-submit').click();"); time.sleep(1.2)
    check('envoye sans lieu', bool(js("return window.__lastSoumissionEmail;")))
    ouvrir()
    machine('Excavatrice', 'Caterpillar', '320', '2024', ['lim-hauteur'], 1, 'oui')
    champ('soumission-company', 'Test Claude inc.'); champ('soumission-lieu', '')
    ajouter()
    vendeur()
    js("window.__lastSoumissionEmail=null; document.getElementById('soumission-submit').click();"); time.sleep(1.2)
    check('pose e-Trak : le lieu est exige', not js("return window.__lastSoumissionEmail;")
          and 'rgb(255, 68, 68)' in js("return getComputedStyle(document.getElementById('soumission-lieu')).borderColor"))

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
