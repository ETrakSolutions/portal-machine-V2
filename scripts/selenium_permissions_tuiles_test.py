"""Test navigateur des tuiles reglables (Cedule, SAV, Export, Price List), serveur SIMULE.

Decision Jacquot du 2026-09-30 : ces quatre tuiles se reglent dans le tableau des
permissions par role. Le fetch est remplace avant le chargement : `roles_permissions`
renvoie le reglage du scenario, `getsav` / `getcedule` repondent selon le role.
Controle le hub, le tableau d'administration (colonnes, cases verrouillees des roles
externes, sauvegarde d'un clic) et le garde de chaque page.

    py -3.13 scripts/selenium_permissions_tuiles_test.py
"""
import json
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

sys.stdout.reconfigure(encoding='utf-8')
RACINE = Path(__file__).resolve().parent.parent
ok, ko = [], []


def v(nom, cond, det=''):
    (ok if cond else ko).append(nom)
    print(('  OK    ' if cond else '  ECHEC ') + nom + (('  — ' + str(det)) if det else ''))


def ouvrir(page, role, sauve, serveur_refuse=False):
    o = Options()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1400,1600')
    d = webdriver.Chrome(options=o)
    user = {'username': 'u@e', 'email': 'u@e', 'token': 'TOK', 'role': role, 'name': 'Testeur',
            'consentVersion': 999}
    d.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': """
        localStorage.setItem('portal_user', %s);
        window.__saves = [];
        var SAUVE = %s, REFUSE = %s;
        window.fetch = function (url, o) {
            var r = { ok: true };
            if (String(url).indexOf('key=roles_permissions') >= 0) r = { value: SAUVE ? JSON.stringify(SAUVE) : '' };
            else if (String(url).indexOf('action=get') >= 0) r = { value: '' };
            else {
                var b = JSON.parse((o && o.body) || '{}');
                if (b.action === 'save') window.__saves.push(b);
                if (b.action === 'getsav') r = REFUSE ? { error: 'forbidden' } : { ok: true, sav: { clients: [], pieces: [] } };
                if (b.action === 'getcedule') r = REFUSE ? { error: 'forbidden' } : { ok: true, cedule: { jours: [], techs: [] } };
                if (b.action === 'whoami') r = { error: 'unknown action' };
            }
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve(r); } });
        };
    """ % (json.dumps(json.dumps(user)), json.dumps(sauve), 'true' if serveur_refuse else 'false')})
    d.get((RACINE / page).as_uri())
    time.sleep(1.8)
    return d


def visible(d, id_):
    return d.execute_script("var e=document.getElementById(arguments[0]); return !!e && getComputedStyle(e).display!=='none';", id_)


TUILES = ['hub-tile-cedule', 'hub-tile-sav', 'hub-tile-export', 'hub-tile-pricelist']


def hub(role, sauve):
    d = ouvrir('index.html', role, sauve)
    try:
        return {t: visible(d, t) for t in TUILES}
    finally:
        d.quit()


print('Hub — defauts (aucun reglage enregistre)')
h = hub('ingenierie', None)
v('ingenierie : Cedule et SAV visibles, Export et Price List caches',
  h == {'hub-tile-cedule': True, 'hub-tile-sav': True, 'hub-tile-export': False, 'hub-tile-pricelist': False}, h)
h = hub('administrateur', None)
v('administrateur : les quatre visibles', all(h.values()), h)
h = hub('dealer', None)
v('dealer : aucune des quatre', not any(h.values()), h)

print('Hub — reglages enregistres')
h = hub('ingenierie', {'ingenierie': {'savAccess': False, 'ceduleAccess': True}})
v('ingenierie, SAV decoche : tuile SAV cachee, Cedule visible', not h['hub-tile-sav'] and h['hub-tile-cedule'], h)
h = hub('vente_interne', {'vente_interne': {'exportAccess': True}})
v('vente interne, Export coche : tuile Export visible', h['hub-tile-export'] and not h['hub-tile-pricelist'], h)
h = hub('dealer', {'dealer': {'savAccess': True, 'ceduleAccess': True, 'exportAccess': True}})
v('dealer coche par erreur : SAV et Cedule restent caches, Export suit la case',
  not h['hub-tile-sav'] and not h['hub-tile-cedule'] and h['hub-tile-export'], h)
h = hub('super_admin', {'super_admin': {'savAccess': False}})
v('super admin : toujours les quatre', all(h.values()), h)

print('Tableau des permissions (super admin)')
d = ouvrir('index.html', 'super_admin', None)
try:
    d.execute_script("showAdminSection()")
    time.sleep(0.8)
    entetes = d.execute_script("return [...document.querySelectorAll('#admin-perm-table thead th')].map(x=>x.textContent.trim())")
    v('14 colonnes, dont les quatre nouvelles', len(entetes) == 14 and entetes[-4:] == ['Cédule techs', 'SAV', 'Export', 'Price List'], entetes)
    lignes = d.execute_script("""return [...document.querySelectorAll('#admin-perm-tbody tr')].map(tr =>
        [tr.cells[0].innerText.trim(), [...tr.cells].slice(1).map(c => c.textContent + (c.dataset.perm ? '' : '#'))])""")
    par_role = {l[0]: l[1] for l in lignes}
    v('chaque ligne a 13 cases', all(len(c) == 13 for c in par_role.values()), {k: len(c) for k, c in par_role.items()})
    dealer = par_role.get('Dealer', [])
    v('Dealer : Cedule et SAV verrouillees (✗, non cliquables)', dealer[9:11] == ['✗#', '✗#'], dealer[9:])
    v('Dealer : Export et Price List reglables', dealer[11].endswith('#') is False and dealer[12].endswith('#') is False, dealer[9:])
    ing = par_role.get('Ingenierie') or par_role.get('Ingénierie') or []
    v('Ingenierie par defaut : Cedule ✓ SAV ✓ Export ✗ Price List ✗', ing[9:] == ['✓', '✓', '✗', '✗'], ing[9:])
    d.execute_script("""var td=[...document.querySelectorAll('#admin-perm-tbody td[data-perm="savAccess"]')]
        .find(c=>c.dataset.role==='ingenierie'); td.click();""")
    time.sleep(0.6)
    saves = d.execute_script("return window.__saves")
    enreg = json.loads(saves[-1]['value']) if saves else {}
    v('clic sur SAV / Ingenierie : enregistre savAccess = false',
      saves and saves[-1]['key'] == 'roles_permissions' and enreg.get('ingenierie', {}).get('savAccess') is False, saves[-1]['key'] if saves else None)
    v('la case affiche maintenant ✗', d.execute_script("""return [...document.querySelectorAll('#admin-perm-tbody td[data-perm="savAccess"]')]
        .find(c=>c.dataset.role==='ingenierie').textContent""") == '✗')
    d.execute_script("""[...document.querySelectorAll('#admin-perm-tbody td')].filter(c=>!c.dataset.perm && c.cellIndex===10)
        .forEach(c=>c.click());""")
    time.sleep(0.4)
    v('clic sur une case verrouillee : rien d\'enregistre', len(d.execute_script("return window.__saves")) == len(saves))
finally:
    d.quit()

print('Pages')
for page, root, denied in [('sav.html', 'sav-root', 'sav-denied'), ('cedule.html', 'ced-root', 'ced-denied')]:
    d = ouvrir(page, 'technicien', None)
    v(page + ' : technicien accepte par le serveur -> page ouverte', visible(d, root) and not visible(d, denied))
    d.quit()
    d = ouvrir(page, 'technicien', None, serveur_refuse=True)
    v(page + ' : refus du serveur -> page « acces refuse »', not visible(d, root) and visible(d, denied))
    d.quit()
    d = ouvrir(page, 'dealer', None)
    v(page + ' : dealer -> refuse sans appeler le serveur', not visible(d, root) and visible(d, denied))
    d.quit()

for page, root, denied, perm in [('export.html', 'exp-root', 'exp-denied', 'exportAccess'),
                                 ('price-list.html', 'pl-root', 'pl-denied', 'pricelistAccess')]:
    d = ouvrir(page, 'administrateur', None)
    v(page + ' : administrateur par defaut -> ouverte', visible(d, root) and not visible(d, denied))
    d.quit()
    d = ouvrir(page, 'technicien', None)
    v(page + ' : technicien par defaut -> refusee', not visible(d, root) and visible(d, denied))
    d.quit()
    d = ouvrir(page, 'technicien', {'technicien': {perm: True}})
    v(page + ' : technicien coche -> ouverte', visible(d, root) and not visible(d, denied))
    d.quit()
    d = ouvrir(page, 'administrateur', {'administrateur': {perm: False}})
    v(page + ' : administrateur decoche -> refusee', not visible(d, root) and visible(d, denied))
    d.quit()

print('\n%d OK, %d ECHEC' % (len(ok), len(ko)))
sys.exit(1 if ko else 0)
