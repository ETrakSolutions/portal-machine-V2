# -*- coding: utf-8 -*-
"""Audit anglais du 2026-11-26 (Steve) : verifie en local, ecran en EN, que
1) la fenetre d'identifiants (invitation / mot de passe temporaire) s'ouvre en anglais ;
2) i18n.tPiece traduit les pieces des fiches d'installation (table exacte + regles) ;
3) les titres de la banque d'installation sont en anglais ;
4) aucune erreur JS SEVERE sur les pages touchees.
Les fiches elles-memes exigent une vraie session : elles se verifient sur le site en ligne."""
import sys, os, json, threading, http.server, socketserver, time, tempfile
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
PORT = 8873
from selenium import webdriver
from selenium.webdriver.chrome.options import Options


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except (ConnectionAbortedError, ConnectionResetError): pass


socketserver.ThreadingTCPServer.daemon_threads = True
socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Q)
threading.Thread(target=srv.serve_forever, daemon=True).start()
o = Options()
for a in ['--headless=new', '--window-size=1400,1000', '--user-data-dir=' + tempfile.mkdtemp(), '--disable-extensions']:
    o.add_argument(a)
o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
d = webdriver.Chrome(options=o)
res = []


def ok(nom, c, detail=''):
    res.append(bool(c)); print(('OK    ' if c else 'ECHEC ') + nom + (('  -> ' + str(detail)) if detail else ''))


def charger(page):
    d.get('http://127.0.0.1:%d/%s' % (PORT, page))
    d.execute_script("localStorage.setItem('portal_lang','en'); localStorage.removeItem('portal_user');")
    d.get('http://127.0.0.1:%d/%s' % (PORT, page))
    time.sleep(2.5)


charger('index.html')
d.execute_script("showCredentialsPopup('Pat Test','pat@example.com','Ab12cd','Dealer','invitation');")
time.sleep(0.5)
t = d.execute_script("return document.getElementById('cred-popup-overlay').innerText;")
ok('fenetre invitation en anglais', 'Account created' in t and 'Compte créé' not in t, t[:60])
href = d.execute_script("return document.getElementById('cred-mailto-btn').href;")
ok('courriel prepare en anglais', 'Your%20account%20has%20been%20created' in href or 'Your account has been created' in href)
d.execute_script("document.getElementById('cred-popup-overlay').remove(); showCredentialsPopup('Pat Test','pat@example.com','Ab12cd','Dealer');")
time.sleep(0.5)
t = d.execute_script("return document.getElementById('cred-popup-overlay').innerText;")
ok('fenetre mot de passe temporaire en anglais', 'Temporary password' in t and 'Mot de passe temporaire' not in t, t[:60])
d.execute_script("localStorage.setItem('portal_lang','fr'); document.getElementById('cred-popup-overlay').remove(); showCredentialsPopup('Pat','pat@example.com','x','Dealer','invitation');")
t = d.execute_script("return document.getElementById('cred-popup-overlay').innerText;")
ok('ecran FR : fenetre toujours en francais', 'Compte créé' in t, t[:40])
d.execute_script("localStorage.setItem('portal_lang','en');")

CAS = {
    '1200-0014 — Imprimante thermique (si demandée)': '1200-0014 — Thermal printer (if requested)',
    '1200-0010 — Balance loader': '1200-0010 — Loader scale',
    'C02A-0021 — Raccord ORF12 côté tige (constaté dans ProgressionLive)': 'C02A-0021 — Fitting ORF12 rod side (as found in ProgressionLive)',
    'Raccords AS16 côté tige et côté piston (constaté dans ProgressionLive)': 'Fittings AS16 rod and piston sides (as found in ProgressionLive)',
    'Harnais Doosan/Develon': 'Doosan/Develon harness',
    'Aucune': 'None',
}
for fr, en in CAS.items():
    r = d.execute_script("return i18n.tPiece(arguments[0]);", fr)
    ok('tPiece : ' + fr[:40], r == en, r)
r = d.execute_script("localStorage.setItem('portal_lang','fr'); var x = i18n.tPiece('Raccord ORF12 côté tige'); localStorage.setItem('portal_lang','en'); return x;")
ok('tPiece en FR : texte inchange', r == 'Raccord ORF12 côté tige', r)

charger('installation.html')
ok('titre de page installation en anglais', d.title == 'e-Trak | Installation library', d.title)
tt = d.execute_script("return [].map.call(document.querySelectorAll('header [title]'), function(e){return e.title;}).join(' | ');")
ok('infobulles de l\'en-tete en anglais', 'Retour' not in tt, tt)
ty = d.execute_script("return [window.TRANSLATIONS.en['type.Souffleuse'], window.TRANSLATIONS.en['prod.Caméras']].join('|');")
ok('cles type/prod presentes', ty == 'Snow blower|Cameras', ty)

for page in ['diagnostic.html', 'soumission.html', 'machine.html', 'soutien.html']:
    charger(page)
err = [e['message'][:160] for e in d.get_log('browser') if e['level'] == 'SEVERE'
       and 'favicon' not in e['message'] and 'Failed to load resource' not in e['message'] and 'script.google.com' not in e['message'] and 'googleusercontent' not in e['message']]
ok('aucune erreur JS SEVERE', not err, err[:3])
d.quit(); srv.shutdown()
print('\n%d / %d' % (sum(res), len(res)))
sys.exit(0 if all(res) else 1)
