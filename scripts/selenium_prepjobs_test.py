# -*- coding: utf-8 -*-
"""Preparation des jobs (decision de Jacquot, 2026-10-15).

Le serveur est simule : 'getprepjobs' repond avec un jeu fourni (--fixture, ecrit par
`node scripts/banc_backend/banc_prepjobs.js reel`, sinon un jeu fabrique ici) ;
'whoami' confirme la session. Rien n'est demande a ProgressionLive.

Verifie :
  1. tuile de l'accueil : visible avec le nombre de jobs a completer quand le serveur
     repond ok ; cachee s'il refuse ; dealer, distributeur et invite ne le demandent meme pas ;
  2. page : refusee pour dealer et invite (sans appel) et quand le serveur refuse ;
  3. par defaut seulement les jobs a completer, case decochee = toutes ; chaque verdict
     (commande, contact, emplacement) = les donnees recues ; resume chiffre exact ;
  4. liseré des jobs a 3 jours ou moins ; clic sur un numero = copie ;
  5. anglais ; erreur serveur -> message ; aucune erreur JS SEVERE.

    py -3.13 scripts/selenium_prepjobs_test.py [--live] [--fixture fichier.json] [--capture fichier.png]
"""
import sys, io, os, json, threading, http.server, socketserver, time, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8804
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
def arg(nom):
    return sys.argv[sys.argv.index(nom) + 1] if nom in sys.argv else None
os.chdir(REPO)


def jeu_fabrique():
    now = datetime.datetime.now(datetime.timezone.utc)
    def J(code, jours, **kw):
        j = {'code': code, 'type': 'Installation', 'rv': (now + datetime.timedelta(days=jours)).isoformat(),
             'tech': 'Tech A', 'client': 'Client ' + code, 'lieu': 'Chantier ' + code, 'ville': 'Laval',
             'etat': 'Assigné', 'noCommande': '1' + code[-1] * 4, 'confirme': False, 'commande': True, 'contactNom': True, 'telOk': True, 'telChiffres': 10, 'emplacement': True}
        j.update(kw)
        return j
    return {'genere': now.isoformat(), 'du': '', 'au': '', 'jobs': [
        J('INS1', 1, commande=False),
        J('SAV2', 2, type='SAV', contactNom=False, telOk=False, telChiffres=0),
        J('INS3', 6, telOk=False, telChiffres=5, aCorriger=['bc_tel', 'nc_texte']),
        J('INS4', 8, emplacement=False, lieu='', noCommande=''),
        J('INS5', 9, confirme=True),
        J('SAV6', 3, type='SAV', commande=False),   # SAV sans PDF mais complet : commande non requise
        J('INS7', 1, tech='_A Planifier', emplacement=False),   # en attente : incomplete mais jamais urgente
    ]}


PREP = json.load(open(arg('--fixture'), encoding='utf-8')) if arg('--fixture') else jeu_fabrique()
est_sav = lambda j: j['type'].strip().lower() == 'sav'
cmd_ok = lambda j: est_sav(j) or j['commande']   # SAV : pas de commande avant la visite
complete = lambda j: cmd_ok(j) and j['contactNom'] and j['telOk'] and j['emplacement']
A_FAIRE = [j for j in PREP['jobs'] if not complete(j)]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE, '| jobs :', len(PREP['jobs']), '| a completer :', len(A_FAIRE))
fails = []


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


def navigateur(reponse):
    opts = Options()
    for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1400,900']:
        opts.add_argument(a)
    opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    dv = webdriver.Chrome(options=opts)
    dv.execute_cdp_cmd('Browser.grantPermissions', {'permissions': ['clipboardReadWrite', 'clipboardSanitizedWrite'],
                                                     'origin': BASE.split('/portal')[0]})
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': """
      window.__getprep = 0; window.__copie = null; var REP = %s, vrai = window.fetch.bind(window);
      try { navigator.clipboard.writeText = function (s) { window.__copie = s; return Promise.resolve(); }; } catch (e) {}
      window.fetch = function (u, o) {
        var body = o && typeof o.body === 'string' ? o.body : '';
        var rep = null;
        if (body.indexOf('"action":"getprepjobs"') >= 0) { window.__getprep++; rep = REP; }
        else if (body.indexOf('"action":"whoami"') >= 0) {
          var u0 = JSON.parse(localStorage.getItem('portal_user') || '{}'); rep = { ok: true, user: u0 };
        }
        if (rep) return Promise.resolve(new Response(JSON.stringify(rep), { headers: { 'Content-Type': 'application/json' } }));
        return vrai(u, o);
      };""" % json.dumps(reponse)})
    return dv


def session(dv, role, guest=False):
    u = {'username': role + '@t', 'email': role + '@t', 'name': 'Test ' + role, 'role': role,
         'consentVersion': 99, 'permissions': {}}
    if guest:
        u = {'username': 'guest', 'name': 'Invite', 'role': 'dealer', 'permissions': {}, 'isGuest': True}
    else:
        u['token'] = 'TEST-' + role
    dv.execute_script("localStorage.setItem('portal_user', arguments[0]);", json.dumps(u))


def erreurs(dv):
    return [l['message'] for l in dv.get_log('browser') if l['level'] == 'SEVERE'
            and 'version.json' not in l['message'] and 'favicon' not in l['message']]


def tuile(dv):
    return dv.execute_script("var e=document.getElementById('hub-tile-prepjobs'); return e ? "
                             "[getComputedStyle(e).display !== 'none', document.getElementById('hub-tile-prepjobs-desc').textContent, window.__getprep] : [false,'',-1];")


OK_REP = {'ok': True, 'prep': PREP}
dv = navigateur(OK_REP)
try:
    print('--- 1) tuile de l accueil ---')
    dv.get(BASE + '/index.html'); session(dv, 'vente_interne'); dv.get(BASE + '/index.html'); time.sleep(2.5)
    vis, desc, n = tuile(dv)
    check('serveur ok : tuile visible', vis)
    check('nombre a completer sur la tuile (%s)' % desc, str(len(A_FAIRE)) in desc if A_FAIRE else True)
    check('une seule demande getprepjobs (%d)' % n, n == 1)
    for role, guest in [('dealer', False), ('distributeur', False), ('dealer', True)]:
        dv.get(BASE + '/index.html'); session(dv, role, guest); dv.get(BASE + '/index.html'); time.sleep(2)
        vis, desc, n = tuile(dv)
        check('%s%s : tuile cachee, aucune demande' % (role, ' (invite)' if guest else ''), not vis and n == 0)

    print('--- 2) acces refuse ---')
    for role, guest in [('dealer', False), ('dealer', True)]:
        dv.get(BASE + '/index.html'); session(dv, role, guest)
        dv.get(BASE + '/prep-jobs.html'); time.sleep(1.5)
        check('%s%s : page refusee, aucune demande' % (role, ' (invite)' if guest else ''),
              dv.execute_script("return getComputedStyle(document.getElementById('pj-denied')).display !== 'none' && window.__getprep === 0;"))

    print('--- 3) liste ---')
    dv.get(BASE + '/index.html'); session(dv, 'vente_interne')
    dv.get(BASE + '/prep-jobs.html')
    WebDriverWait(dv, 20).until(lambda d: d.execute_script("return !!document.querySelector('table.pj') || /complètes/.test(document.getElementById('pj-grid').textContent);"))
    LIRE = """return Array.from(document.querySelectorAll('table.pj tbody tr')).map(function(tr){
        var v = function(c){ var s = tr.querySelector(c + ' .pj-v'); return s.classList.contains('pj-ok') ? 'OK' : s.innerText.replace(/\\n/g,' | '); };
        return { code: tr.getAttribute('data-code'), urgent: tr.classList.contains('pj-urgent'),
                 nocmd: (tr.querySelector('.pj-nocmd').firstChild.textContent || '').trim(),
                 fix: tr.querySelectorAll('.pj-nocmd .pj-fix').length, col2: tr.cells[2].className,
                 conf: v('.pj-conf'), cmd: v('.pj-cmd'), contact: v('.pj-contact'), lieu: v('.pj-lieu') }; });"""
    lignes = dv.execute_script(LIRE)
    check('par defaut : %d lignes = jobs a completer (%d)' % (len(lignes), len(A_FAIRE)), len(lignes) == len(A_FAIRE))
    dv.execute_script("document.getElementById('pj-todo').click();"); time.sleep(0.3)
    toutes = dv.execute_script(LIRE)
    check('case decochee : %d lignes = toutes les jobs (%d)' % (len(toutes), len(PREP['jobs'])), len(toutes) == len(PREP['jobs']))
    par_code = {j['code']: j for j in PREP['jobs']}
    bon = True
    for l in toutes:
        j = par_code[l['code']]
        att_contact = 'OK' if (j['contactNom'] and j['telOk']) else None
        if est_sav(j) and l['cmd'] != 'Non requise (SAV)':
            bon = False; print('       SAV sans mention :', l)
        if not est_sav(j) and (l['cmd'] == 'OK') != j['commande'] or (l['lieu'] == 'OK') != j['emplacement'] or \
           (l['contact'] == 'OK') != bool(att_contact):
            bon = False; print('      ', l, j)
        if not j['telOk'] and j['telChiffres'] and (str(j['telChiffres']) + ' chiffres') not in l['contact']:
            bon = False; print('       chiffres absents :', l)
    check('chaque verdict = les donnees recues (commande, contact, emplacement)', bon)
    check('voyant « à corriger » : un par code recu, nulle part ailleurs',
          all(l['fix'] == len(par_code[l['code']].get('aCorriger') or []) for l in toutes))
    check('Confirmé client : OK si cochee, « — » en attente, sinon « À confirmer »',
          all(l['conf'] == ('OK' if par_code[l['code']].get('confirme') else '—' if par_code[l['code']]['tech'].strip().startswith('_')
                            else 'À confirmer') for l in toutes))
    check('# de commande juste apres la job, « — » si absent',
          all(l['col2'] == 'pj-nocmd' and l['nocmd'] == (par_code[l['code']].get('noCommande') or '—') for l in toutes))
    resume = dv.execute_script("return document.getElementById('pj-summary').innerText;")
    n_cmd = sum(1 for j in PREP['jobs'] if not cmd_ok(j))
    n_lieu = sum(1 for j in PREP['jobs'] if not j['emplacement'])
    check('resume chiffre (%s)' % resume.replace('\n', ' / '),
          ('%d job(s) sur %d' % (len(A_FAIRE), len(PREP['jobs']))) in resume and ('%d sans commande' % n_cmd) in resume
          and ('%d sans emplacement' % n_lieu) in resume)

    print('--- 4) urgence, copie ---')
    now = time.time()
    def att_urgent(j):
        if complete(j) or not j['rv'] or j['tech'].strip().startswith('_'):
            return False
        return datetime.datetime.fromisoformat(j['rv'].replace('Z', '+00:00')).timestamp() - now <= 3 * 86400
    check('liseré exactement sur les jobs incompletes a 3 jours ou moins, sauf _A Planifier / _HOLD / _Pas prêt',
          all(l['urgent'] == att_urgent(par_code[l['code']]) for l in toutes))
    premier = toutes[0]['code']
    dv.execute_script("document.querySelector('.pj-code').click();"); time.sleep(0.3)
    check('clic sur %s : numero copie' % premier, dv.execute_script("return window.__copie;") == premier)
    cap = arg('--capture')
    if cap:
        dv.execute_script("document.getElementById('pj-todo').click();"); time.sleep(0.3)
        dv.save_screenshot(cap); print('       capture :', cap)
        dv.execute_script("document.getElementById('pj-todo').click();")
    txt = dv.execute_script("return document.getElementById('pj-root').innerText;")
    import re
    check('aucun telephone ni courriel dans la page', not re.search(r'@|\d{3}[-. )]{1,2}\d{3}[-. ]\d{4}', txt))

    print('--- 5) anglais, erreurs ---')
    dv.execute_script("i18n.setLang('en');"); time.sleep(0.6)
    check('EN : tableau en anglais', dv.execute_script("return document.querySelector('table.pj thead').textContent.indexOf('Location') >= 0;"))
    dv.execute_script("i18n.setLang('fr');")
    e = erreurs(dv)
    check('aucune erreur JS SEVERE (%d)' % len(e), not e)
    for m in e[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

dv = navigateur({'error': 'forbidden'})
try:
    dv.get(BASE + '/index.html'); session(dv, 'vente_interne'); dv.get(BASE + '/index.html'); time.sleep(2.5)
    vis, desc, n = tuile(dv)
    check('serveur refuse : tuile cachee (vente interne hors liste)', not vis and n == 1)
    dv.get(BASE + '/prep-jobs.html'); time.sleep(2)
    check('serveur refuse : page « acces reserve »', dv.execute_script("return getComputedStyle(document.getElementById('pj-denied')).display !== 'none';"))
finally:
    dv.quit()

dv = navigateur({'error': 'prepjobs unavailable'})
try:
    dv.get(BASE + '/index.html'); session(dv, 'administrateur')
    dv.get(BASE + '/prep-jobs.html'); time.sleep(2)
    msg = dv.execute_script("return document.getElementById('pj-grid').textContent;")
    check('serveur en erreur : message « %s »' % msg[:60], 'indisponible' in msg)
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
