# -*- coding: utf-8 -*-
"""Test de la question « Installation par e-Trak ? » posee sur TOUTE soumission,
et des installations dans le bloc Epicor (demandes de Jacquot, 2026-09-02).

Verifie :
  1. la boite de question est au-dessus du tableau de prix, sans reponse par defaut ;
  2. sans reponse : aucune ligne d'installation, aucun code de pose, total = pieces ;
  3. « Oui » : les lignes de pose apparaissent avec LEUR code et LEUR prix, et la
     somme des lignes egale le TOTAL affiche ;
  4. « Non » : plus une seule ligne de pose ;
  5. le bloc Epicor contient les codes de pose, avec la MEME quantite que le produit
     (c'est le defaut signale : les poses ne partaient jamais dans le collage) ;
  6. le 1500-0004 « option mini » sort sous 1500-0004_install, et disparait quand le
     client installe (c'est du temps de tech, pas une piece) ;
  7. sans machine : la quantite se propage au produit ET a sa pose (camera x7) ;
  8. l'envoi est bloque tant que la question est sans reponse, et le courriel porte
     le bloc Epicor complet une fois la reponse donnee ;
  9. libelles FR/EN de la question ;
 10. aucune erreur JS SEVERE.

Les attendus sont LUS dans data/prices.json, jamais recopies : le test survit a une
mise a jour de la liste de prix.
"""
import sys, io, os, re, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
# « --live » rejoue exactement les memes controles sur le site en ligne : c'est ce
# qui prouve que l'utilisateur final voit le bon resultat, pas seulement le clone.
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)

PRIX = json.load(open(os.path.join(REPO, 'data', 'prices.json'), encoding='utf-8'))

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
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


def choisir(select_id, valeur, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, select_id, valeur):
            return True
        time.sleep(0.3)
    return False


def ouvrir_soumission():
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return typeof priceData !== 'undefined' && Object.keys(priceData).length > 0;"))


LIRE_TABLEAU = """
var out=[];
document.querySelectorAll('#selected-options-list table tbody tr').forEach(function(tr){
  var tds=tr.querySelectorAll('td');
  if(!tds.length) return;
  if(tds[0].getAttribute('colspan')) return;             // ligne de note
  var mono=tds[0].querySelector('span[style*="JetBrains"]');
  out.push({code: mono ? mono.textContent.trim() : '',
            label: tds[0].textContent.trim(),
            prix: tds[tds.length-1].textContent.trim()}); // LA derniere cellule EST le prix
});
return out;
"""


def montant(txt):
    """« 11 060 $ » -> 11060 ; « — » -> None."""
    n = re.sub(r'[^0-9]', '', txt or '')
    return int(n) if n else None


def tableau():
    """(lignes, total) — le total est la ligne portant le libelle TOTAL."""
    brut = dv.execute_script(LIRE_TABLEAU)
    libtot = dv.execute_script("return i18n.t('soum.tbl_total');")
    lignes, total = [], None
    for r in brut:
        if r['label'].strip() == libtot.strip():
            total = montant(r['prix'])
        else:
            r['montant'] = montant(r['prix'])
            lignes.append(r)
    return lignes, total


def epicor():
    """[(code, qte)] tels que le bouton « Copier pour Epicor » les produirait."""
    txt = dv.execute_script("return epicorBlockText();") or ''
    out = []
    for l in txt.split('\n'):
        if not l.strip():
            continue
        p = l.split('\t')
        out.append((p[0], int(p[1]) if len(p) > 1 and p[1].isdigit() else None))
    return out


def repondre(valeur):
    dv.execute_script("document.getElementById('install-etrak-%s').click();" % valeur)
    time.sleep(0.6)


def codes_pose():
    return set(v['installCode'] for v in PRIX.values() if v.get('installCode'))


POSES = codes_pose()


def est_pose(code):
    return code in POSES


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'Test Claude',"
                      " permissions:{modifBom:true, voirPrix:true}}));")

    # =====================================================================
    print('--- 1) la question est au-dessus du tableau, sans reponse par defaut ---')
    ouvrir_soumission()
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '320'), ('select-annee', '2024')):
        check('selection %s = %s' % (sid, val), choisir(sid, val))
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(1.2)

    check('la boite de question est visible', dv.execute_script(
        "var e=document.getElementById('install-question-box');"
        "return !!e && getComputedStyle(e).display !== 'none';"))
    check('elle est AVANT le tableau de prix dans la page', dv.execute_script(
        "var q=document.getElementById('install-question-box');"
        "var t=document.getElementById('selected-options-list');"
        "return !!q && !!t && (q.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;"))
    check('aucune reponse cochee au depart', dv.execute_script(
        "return !document.querySelector('input[name=\"install-etrak\"]:checked');"))

    # =====================================================================
    print('--- 2) sans reponse : rien de facture en installation ---')
    lignes, total = tableau()
    check('au moins une ligne de produit (%d)' % len(lignes), len(lignes) > 0)
    check('aucun code de pose affiche',
          not [l for l in lignes if est_pose(l['code']) or '_install' in l['code']])
    somme = sum(l['montant'] for l in lignes if l['montant'] is not None)
    check('somme des lignes = TOTAL (%s = %s)' % (somme, total), somme == total)
    check('aucun code de pose dans le bloc Epicor',
          not [c for c, q in epicor() if est_pose(c)])

    # =====================================================================
    print('--- 3) « Oui » : les poses apparaissent, avec leur code et leur prix ---')
    repondre('oui')
    lignes, total = tableau()
    poses = [l for l in lignes if est_pose(l['code'])]
    check('des lignes de pose sont apparues (%d)' % len(poses), len(poses) > 0)
    for l in poses:
        produit = [c for c, v in PRIX.items() if v.get('installCode') == l['code']][0]
        attendu = PRIX[produit]['install']
        check('%-22s %s $ = liste de prix (%s $)' % (l['code'], l['montant'], attendu),
              l['montant'] == attendu)
        check('%-22s libelle « Installation ... »' % l['code'],
              l['label'].lower().find('installation') >= 0)
    somme = sum(l['montant'] for l in lignes if l['montant'] is not None)
    check('ARITHMETIQUE : somme des lignes = TOTAL (%s = %s)' % (somme, total), somme == total)

    print('--- 4) ... et elles descendent dans le bloc Epicor ---')
    epi = epicor()
    codes_epi = [c for c, q in epi]
    check('bloc Epicor : %d lignes' % len(epi), len(epi) == len(lignes))
    for l in poses:
        check('Epicor porte %s' % l['code'], l['code'] in codes_epi)
    check('aucune ligne Epicor sans code', all(c.strip() for c in codes_epi))
    check('toutes les quantites sont des entiers >= 1',
          all(q is not None and q >= 1 for c, q in epi))

    # =====================================================================
    print('--- 5) « Non » : plus une seule pose, ni a l ecran ni dans Epicor ---')
    repondre('non')
    lignes, total = tableau()
    check('aucune ligne de pose a l ecran',
          not [l for l in lignes if est_pose(l['code']) or '_install' in l['code']])
    check('aucune pose dans Epicor', not [c for c, q in epicor() if est_pose(c)])
    somme = sum(l['montant'] for l in lignes if l['montant'] is not None)
    check('somme des lignes = TOTAL (%s = %s)' % (somme, total), somme == total)

    # =====================================================================
    print('--- 6) le 1500-0004 « option mini » = du temps de pose ---')
    ouvrir_soumission()
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Bobcat'),
                     ('select-modele', 'E08'), ('select-annee', '2015')):
        check('selection %s = %s' % (sid, val), choisir(sid, val))
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(1.2)
    repondre('oui')
    lignes, total = tableau()
    mini = [l for l in lignes if l['code'] == '1500-0004_install']
    check('la ligne mini porte le code 1500-0004_install', len(mini) == 1)
    if mini:
        check('elle vaut %s $ (liste de prix)' % PRIX['1500-0004']['install'],
              mini[0]['montant'] == PRIX['1500-0004']['install'])
        check('son libelle dit « Installation »',
              mini[0]['label'].lower().find('installation') >= 0)
    check('aucune ligne nue « 1500-0004 » (sans suffixe)',
          not [l for l in lignes if l['code'] == '1500-0004'])
    check('Epicor porte 1500-0004_install en quantite 1',
          ('1500-0004_install', 1) in epicor())
    somme = sum(l['montant'] for l in lignes if l['montant'] is not None)
    check('ARITHMETIQUE mini : somme = TOTAL (%s = %s)' % (somme, total), somme == total)

    repondre('non')
    lignes, _ = tableau()
    check('client installe : la ligne mini disparait entierement',
          not [l for l in lignes if l['code'].startswith('1500-0004')])
    check('... et ne part pas dans Epicor',
          not [c for c, q in epicor() if c.startswith('1500-0004')])

    # =====================================================================
    print('--- 7) sans machine : la quantite se propage a la pose ---')
    ouvrir_soumission()
    check('type « sans machine »', choisir('select-type', '__sans_machine__'))
    time.sleep(0.8)
    dv.execute_script("var e=document.getElementById('soumission-equipement');"
                      "e.value='Lift Genie test'; e.dispatchEvent(new Event('input',{bubbles:true}));")
    dv.execute_script("document.getElementById('cam-quad').click();")
    time.sleep(0.5)
    dv.execute_script("var q=document.getElementById('cam-qte'); q.value='7';"
                      "q.dispatchEvent(new Event('change',{bubbles:true}));")
    time.sleep(0.8)
    repondre('oui')
    lignes, total = tableau()
    prod = [l for l in lignes if l['code'] == '1300-0003']
    pose = [l for l in lignes if l['code'] == '1300-0003-install']
    check('ligne produit camera Quad presente', len(prod) == 1)
    check('ligne de pose camera Quad presente', len(pose) == 1)
    if prod:
        check('produit = 7 x %s $ (%s)' % (PRIX['1300-0003']['item'], prod[0]['montant']),
              prod[0]['montant'] == 7 * PRIX['1300-0003']['item'])
    if pose:
        check('pose = 7 x %s $ (%s)' % (PRIX['1300-0003']['install'], pose[0]['montant']),
              pose[0]['montant'] == 7 * PRIX['1300-0003']['install'])
    check('Epicor : produit en quantite 7', ('1300-0003', 7) in epicor())
    check('Epicor : pose en quantite 7', ('1300-0003-install', 7) in epicor())
    somme = sum(l['montant'] for l in lignes if l['montant'] is not None)
    check('ARITHMETIQUE sans machine : somme = TOTAL (%s = %s)' % (somme, total), somme == total)

    # =====================================================================
    print('--- 8) garde-fou d envoi et contenu du courriel ---')
    ouvrir_soumission()
    for sid, val in (('select-type', 'Excavatrice'), ('select-fabricant', 'Caterpillar'),
                     ('select-modele', '320'), ('select-annee', '2024')):
        choisir(sid, val)
    dv.execute_script("document.getElementById('lim-hauteur').click();")
    time.sleep(1.2)
    for cid, val in (('soumission-company', 'Test Claude inc.'),
                     ('soumission-nb-systemes', '1'),
                     ('soumission-lieu', 'Victoriaville')):
        dv.execute_script("var e=document.getElementById(arguments[0]); e.value=arguments[1];"
                          "e.dispatchEvent(new Event('input',{bubbles:true}));", cid, val)
    dv.execute_script("window.__lastSoumissionEmail = null;")
    dv.execute_script("document.getElementById('soumission-submit').click();")
    time.sleep(1.0)
    check('sans reponse, le courriel ne part pas',
          dv.execute_script("return !window.__lastSoumissionEmail;"))
    check('la boite de question passe en rouge', dv.execute_script(
        "var b=document.getElementById('install-question-box');"
        "return !!b && /rgb\\(255, 68, 68\\)/.test(getComputedStyle(b).borderColor"
        " + ' ' + getComputedStyle(b).borderTopColor);"))

    repondre('oui')
    dv.execute_script("document.getElementById('soumission-submit').click();")
    time.sleep(1.5)
    corps = dv.execute_script("return window.__lastSoumissionEmail "
                              "? window.__lastSoumissionEmail.body : null;")
    check('le courriel est genere', bool(corps))
    if corps:
        entete = dv.execute_script("return i18n.t('email.epicor_header');")
        check('il porte le bloc Epicor', entete.strip() in corps)
        poses_attendues = [c for c, q in epicor() if est_pose(c)]
        manque = [c for c in poses_attendues if (c + '\t') not in corps]
        check('toutes les poses sont dans le bloc du courriel (%d, manquantes: %s)'
              % (len(poses_attendues), manque or 'aucune'), not manque)

    # =====================================================================
    print('--- 9) libelles de la question, FR puis EN ---')
    q_fr = dv.execute_script("var e=document.querySelector('[data-i18n=\"soumission.install_q\"]');"
                             "return e ? e.textContent.trim() : null;")
    check('libelle FR = « Installation par e-Trak ? » (%s)' % q_fr,
          q_fr == 'Installation par e-Trak ?')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    ouvrir_soumission()
    time.sleep(1.5)
    q_en = dv.execute_script("var e=document.querySelector('[data-i18n=\"soumission.install_q\"]');"
                             "return e ? e.textContent.trim() : null;")
    n_en = dv.execute_script("var e=document.querySelector('[data-i18n=\"soumission.install_non\"]');"
                             "return e ? e.textContent.trim() : null;")
    check('libelle EN = « Installation by e-Trak? » (%s)' % q_en, q_en == 'Installation by e-Trak?')
    check('« Non » EN = « No — installed by the customer » (%s)' % n_en,
          n_en == 'No — installed by the customer')
    dv.execute_script("localStorage.setItem('portal_lang','fr');")

    # =====================================================================
    print('--- 10) console propre ---')
    errs = [e for e in dv.get_log('browser') if e['level'] == 'SEVERE'
            and 'mailto' not in e['message'].lower()]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:4]:
        print('     ', e['message'][:220])

except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails:
    print('  -', f)
sys.exit(0 if not fails else 1)
