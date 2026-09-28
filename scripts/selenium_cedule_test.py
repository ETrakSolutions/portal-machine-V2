# -*- coding: utf-8 -*-
"""Cedule des techniciens (decision de Jacquot, 2026-09-25).

Le serveur est simule : 'getcedule' repond avec une cedule fournie (--fixture, par
defaut une cedule fabriquee ici) ; 'whoami' confirme la session. Rien n'est demande a
ProgressionLive.

Verifie :
  1. tuile de l'accueil : visible pour vente externe / technicien, cachee pour dealer,
     distributeur et invite ;
  2. page : acces refuse pour dealer et invite, sans appel getcedule ;
  3. compte interne : une ligne par technicien, nom + competence, 10 cases (5 jours x
     AM/PM), chaque case = la cedule recue (Ouvert / Ferme) ;
  4. navigation semaine par semaine, boutons bornes aux 4 semaines ;
  5. aucune donnee client dans la page (seulement noms, jours, cases) ;
  6. anglais sans perdre la grille ; erreur serveur -> message, pas de page blanche ;
  7. aucune erreur JS SEVERE. Capture : scratch cedule_capture.png

    py -3.13 scripts/selenium_cedule_test.py [--live] [--fixture fichier.json] [--capture fichier.png]
"""
import sys, io, os, json, threading, http.server, socketserver, time, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8803
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
def arg(nom):
    return sys.argv[sys.argv.index(nom) + 1] if nom in sys.argv else None
os.chdir(REPO)


def cedule_fabriquee():
    d = datetime.date.today()
    jours = []
    while len(jours) < 20:
        if d.weekday() < 5:
            jours.append(d.isoformat())
        d += datetime.timedelta(days=1)
    techs = []
    for i, nom in enumerate(['Alpha Test (hydraulique)', 'Bravo Test']):
        techs.append({'nom': nom, 'cases': {j: [(k + i) % 3 == 0, (k + i) % 4 == 0] for k, j in enumerate(jours)}})
    return {'genere': datetime.datetime.utcnow().isoformat() + 'Z', 'jours': jours, 'techs': techs}


CED = json.load(open(arg('--fixture'), encoding='utf-8')) if arg('--fixture') else cedule_fabriquee()


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE, '| techniciens :', len(CED['techs']))
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
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': """
      window.__getcedule = 0; var REP = %s, vrai = window.fetch.bind(window);
      window.fetch = function (u, o) {
        var body = o && typeof o.body === 'string' ? o.body : '';
        var rep = null;
        if (body.indexOf('"action":"getcedule"') >= 0) { window.__getcedule++; rep = REP; }
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


dv = navigateur({'ok': True, 'cedule': CED})
try:
    print('--- 1) tuile de l accueil ---')
    for role, guest, attendu in [('vente_externe', False, True), ('technicien', False, True),
                                 ('dealer', False, False), ('distributeur', False, False), ('dealer', True, False)]:
        dv.get(BASE + '/index.html')
        session(dv, role, guest)
        dv.get(BASE + '/index.html')
        time.sleep(2.5)
        vis = dv.execute_script("var e=document.getElementById('hub-tile-cedule'); return !!e && getComputedStyle(e).display !== 'none';")
        check('%s%s : tuile %s' % (role, ' (invite)' if guest else '', 'visible' if attendu else 'cachee'), vis == attendu)

    print('--- 2) acces refuse ---')
    for role, guest in [('dealer', False), ('dealer', True)]:
        dv.get(BASE + '/index.html'); session(dv, role, guest)
        dv.get(BASE + '/cedule.html'); time.sleep(1.5)
        check('%s%s : page refusee, aucune demande getcedule' % (role, ' (invite)' if guest else ''),
              dv.execute_script("return getComputedStyle(document.getElementById('ced-denied')).display !== 'none'"
                                " && window.__getcedule === 0;"))

    print('--- 3) grille pour un compte interne ---')
    dv.get(BASE + '/index.html'); session(dv, 'vente_externe')
    dv.get(BASE + '/cedule.html')
    WebDriverWait(dv, 20).until(lambda d: d.execute_script("return !!document.querySelector('table.ced');"))
    lignes = dv.execute_script("""return Array.from(document.querySelectorAll('table.ced tbody tr')).map(function(tr){
        var n = tr.querySelector('td.ced-name');
        return { nom: n.childNodes[0].textContent.trim(), note: (n.querySelector('small')||{}).textContent || '',
                 cases: Array.from(tr.querySelectorAll('.ced-cell')).map(function(c){
                     return c.classList.contains('ced-closed') ? 'F' : c.classList.contains('ced-open') ? 'O' : '-'; }) }; });""")
    check('%d lignes = %d techniciens' % (len(lignes), len(CED['techs'])), len(lignes) == len(CED['techs']))
    check('10 cases par ligne', all(len(l['cases']) == 10 for l in lignes))
    # Semaine affichee = celle du premier jour de la cedule
    j0 = datetime.date.fromisoformat(CED['jours'][0]); lun = j0 - datetime.timedelta(days=j0.weekday())
    semaine = [(lun + datetime.timedelta(days=i)).isoformat() for i in range(5)]
    bon = True
    for l, tech in zip(lignes, sorted(CED['techs'], key=lambda t: CED['techs'].index(t))):
        att = []
        for j in semaine:
            c = tech['cases'].get(j)
            att += ['-', '-'] if c is None else [('F' if x else 'O') for x in c]
        if l['cases'] != att:
            bon = False
            print('      ', l['nom'], l['cases'], '!=', att)
    check('chaque case = la cedule recue (semaine du %s)' % lun, bon)
    check('competence affichee sous le nom (%s)' % lignes[0]['note'], any(l['note'] for l in lignes))

    print('--- 4) navigation ---')
    check('Semaine precedente desactivee au depart', dv.execute_script("return document.getElementById('ced-prev').disabled;"))
    n = 0
    while not dv.execute_script("return document.getElementById('ced-next').disabled;") and n < 10:
        dv.execute_script("document.getElementById('ced-next').click();"); n += 1
    check('%d clics jusqu a la derniere semaine (4 ou 5 semaines civiles)' % n, n in (3, 4))
    check('Semaine precedente reactivee', not dv.execute_script("return document.getElementById('ced-prev').disabled;"))
    for _ in range(n):
        dv.execute_script("document.getElementById('ced-prev').click();")

    print('--- 5) aucune donnee client ---')
    txt = dv.execute_script("return document.getElementById('ced-root').innerText;")
    check('ni client, ni adresse, ni type de tache dans la page',
          not any(m in txt for m in ['Installation', 'SAV', 'Congé', 'client', 'Client', '@']))
    cap = arg('--capture')
    if cap:
        dv.save_screenshot(cap)
        print('       capture :', cap)

    print('--- 6) anglais, erreur serveur ---')
    dv.execute_script("i18n.setLang('en');"); time.sleep(0.6)
    check('EN : la grille reste la (%s)' % dv.execute_script("return document.getElementById('ced-week').textContent;"),
          dv.execute_script("return !!document.querySelector('table.ced') && document.getElementById('ced-week').textContent.indexOf('Week of') === 0;"))
    check('EN : cases « Open / Booked »', dv.execute_script(
        "var t=document.querySelector('table.ced').innerText; return t.indexOf('Open')>=0 || t.indexOf('Booked')>=0;"))
    dv.execute_script("i18n.setLang('fr');")
    e = erreurs(dv)
    check('aucune erreur JS SEVERE (%d)' % len(e), not e)
    for m in e[:5]:
        print('      ', m[:160])
finally:
    dv.quit()

dv = navigateur({'error': 'cedule unavailable'})
try:
    dv.get(BASE + '/index.html'); session(dv, 'administrateur')
    dv.get(BASE + '/cedule.html'); time.sleep(2)
    msg = dv.execute_script("return document.getElementById('ced-grid').textContent;")
    check('serveur en erreur : message « %s »' % msg[:60], 'indisponible' in msg)
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
sys.exit(1 if fails else 0)
