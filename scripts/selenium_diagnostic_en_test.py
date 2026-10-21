"""Anglais des fiches de la base de diagnostic (Steve, 2026-10-21), serveur SIMULE.

Verifie ce que la page montre et envoie (les regles sont prouvees par banc_diag.js) :
  1. le formulaire a ses champs anglais (symptome, mots-cles, cause et solution de chaque cause) ;
  2. l'enregistrement envoie fiche.en avec le meme nombre de causes que le francais ;
  3. « Modifier » pre-remplit l'anglais de la fiche ; une correction de l'anglais est envoyee ;
  4. validateur, portail en francais : l'anglais d'un brouillon s'affiche sous le francais pour revision ;
  5. brouillon a l'anglais incomplet : etiquette « Anglais incomplet », le bouton Valider avertit
     sans appeler le serveur ;
  6. portail en anglais : la fiche s'affiche en anglais ; recherche avec un mot anglais.

    py -3.12 scripts/selenium_diagnostic_en_test.py
"""
import json
import sys
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

sys.stdout.reconfigure(encoding='utf-8')
PAGE = (Path(__file__).resolve().parent.parent / 'diagnostic.html').as_uri()
VALIDEE = {'id': 'v1', 'statut': 'valide', 'produit': 'Caméras', 'symptome': 'Écran noir au démarrage', 'code': 'NO SIGNAL',
           'motsCles': 'moniteur', 'causes': [{'cause': 'Fusible grillé', 'solution': 'Remplacer le fusible 5 A', 'pieces': 'F-005'}],
           'en': {'symptome': 'Black screen at startup', 'motsCles': 'monitor', 'causes': [{'cause': 'Blown fuse', 'solution': 'Replace the 5 A fuse'}]},
           'anglaisComplet': True, 'auteurNom': 'Kevin', 'creeLe': '2026-10-01T12:00:00Z', 'remplace': '', 'mien': False}
BROUILLON = {'id': 'b1', 'statut': 'brouillon', 'produit': 'Caméras', 'symptome': 'Image qui saute', 'code': '',
             'motsCles': '', 'causes': [{'cause': 'Connecteur oxydé', 'solution': 'Nettoyer le connecteur', 'pieces': ''}],
             'en': {'symptome': 'Jumping image', 'motsCles': '', 'causes': [{'cause': '', 'solution': ''}]},
             'anglaisComplet': False, 'auteurNom': 'Tech', 'creeLe': '2026-10-02T12:00:00Z', 'remplace': '', 'mien': False}
ok, ko = [], []


def v(nom, cond, det=''):
    (ok if cond else ko).append(nom)
    print(('  OK    ' if cond else '  ECHEC ') + nom + (('  — ' + str(det)) if det else ''))


SERVEUR = """
    localStorage.setItem('portal_user', JSON.stringify({ email: 'k@e', name: 'Kevin', role: 'ingenierie', token: 'T' }));
    localStorage.setItem('portal_lang', %(lang)s);
    window.__appels = []; window.__alertes = [];
    window.alert = function (m) { window.__alertes.push(m); };
    var S = { fiches: %(fiches)s, n: 0 };
    window.fetch = function (url, o) {
        var b = JSON.parse((o && o.body) || '{}'), r = { ok: true };
        window.__appels.push(b);
        if (b.action === 'getdiag') r = { ok: true, peutValider: true, produits: ['Caméras', 'Autre'], fiches: JSON.parse(JSON.stringify(S.fiches)) };
        else if (b.action === 'savediag') {
            var x = b.fiche, f = S.fiches.filter(function (q) { return q.id === x.id; })[0];
            if (!f) { f = { id: 'n' + (++S.n), statut: 'brouillon', mien: true, auteurNom: 'Kevin', creeLe: '2026-10-21T12:00:00Z', remplace: '' }; S.fiches.push(f); }
            ['produit', 'symptome', 'code', 'motsCles', 'causes'].forEach(function (k) { f[k] = x[k]; });
            var t = function (fr, s) { return s || (fr ? '[EN] ' + fr : ''); };
            f.en = { symptome: t(x.symptome, x.en.symptome), motsCles: t(x.motsCles, x.en.motsCles),
                     causes: x.causes.map(function (c, i) { var k = x.en.causes[i] || {}; return { cause: t(c.cause, k.cause), solution: t(c.solution, k.solution) }; }) };
            f.anglaisComplet = true;
            r = { ok: true, fiche: JSON.parse(JSON.stringify(f)) };
        }
        return Promise.resolve({ json: function () { return Promise.resolve(r); } });
    };
"""


def ouvrir(dv, lang, fiches):
    dv.get('about:blank')
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': SERVEUR % {'lang': json.dumps(lang), 'fiches': json.dumps(fiches)}})
    dv.get(PAGE)
    time.sleep(1.2)


o = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1300,1100', '--allow-file-access-from-files']:
    o.add_argument(a)
dv = webdriver.Chrome(options=o)
try:
    print('--- 1-2) formulaire et envoi ---')
    ouvrir(dv, 'fr', [VALIDEE, BROUILLON])
    dv.find_element(By.ID, 'b-nouvelle').click(); time.sleep(0.3)
    v('champs anglais du symptome et des mots-cles', bool(dv.find_elements(By.ID, 'e-symptome-en')) and bool(dv.find_elements(By.ID, 'e-mots-en')))
    v('champs anglais de la cause', len(dv.find_elements(By.CSS_SELECTOR, '#e-causes .c-cause-en')) == 1 and len(dv.find_elements(By.CSS_SELECTOR, '#e-causes .c-sol-en')) == 1)
    Select(dv.find_element(By.ID, 'e-produit')).select_by_visible_text('Caméras')
    dv.find_element(By.ID, 'e-symptome').send_keys('Moniteur fige')
    dv.find_element(By.CSS_SELECTOR, '#e-causes .c-cause').send_keys('Logiciel bloque')
    dv.find_element(By.CSS_SELECTOR, '#e-causes .c-sol').send_keys('Redemarrer le moniteur')
    dv.find_element(By.ID, 'b-cause').click()
    dv.find_elements(By.CSS_SELECTOR, '#e-causes .c-cause')[1].send_keys('Alimentation faible')
    dv.find_elements(By.CSS_SELECTOR, '#e-causes .c-sol')[1].send_keys('Verifier la tension')
    dv.find_element(By.ID, 'b-enreg').click(); time.sleep(0.8)
    env = [a for a in dv.execute_script('return window.__appels;') if a.get('action') == 'savediag'][-1]['fiche']
    v('fiche.en envoyee avec 2 causes (vides : le serveur traduit)', 'en' in env and len(env['en']['causes']) == 2 and env['en']['symptome'] == '', env.get('en'))

    print('--- 3) modifier : anglais pre-rempli, correction envoyee ---')
    carte = dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"]')
    carte.find_element(By.CSS_SELECTOR, '.dg-head').click(); time.sleep(0.2)
    carte.find_element(By.CSS_SELECTOR, '[data-act="modifier"]').click(); time.sleep(0.3)
    v('symptome anglais pre-rempli', dv.find_element(By.ID, 'e-symptome-en').get_attribute('value') == 'Black screen at startup')
    v('cause et solution anglaises pre-remplies', dv.find_element(By.CSS_SELECTOR, '#e-causes .c-cause-en').get_attribute('value') == 'Blown fuse'
      and dv.find_element(By.CSS_SELECTOR, '#e-causes .c-sol-en').get_attribute('value') == 'Replace the 5 A fuse')
    ch = dv.find_element(By.CSS_SELECTOR, '#e-causes .c-cause-en'); ch.clear(); ch.send_keys('Fuse blown')
    dv.find_element(By.ID, 'b-enreg').click(); time.sleep(0.8)
    env = [a for a in dv.execute_script('return window.__appels;') if a.get('action') == 'savediag'][-1]['fiche']
    v('correction de l\'anglais envoyee', env['id'] == 'v1' and env['en']['causes'][0]['cause'] == 'Fuse blown')

    print('--- 4-5) validateur : revision et anglais incomplet ---')
    ouvrir(dv, 'fr', [VALIDEE, BROUILLON])
    c = dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="b1"]')
    v('etiquette « Anglais incomplet »', 'Anglais incomplet' in c.find_element(By.CSS_SELECTOR, '.dg-head').text)
    c.find_element(By.CSS_SELECTOR, '.dg-head').click(); time.sleep(0.2)
    en_lignes = [e.text for e in c.find_elements(By.CSS_SELECTOR, '.dg-en')]
    v('anglais du brouillon affiche sous le francais', any('Jumping image' in t for t in en_lignes) and any('à traduire' in t for t in en_lignes), en_lignes)
    n0 = len(dv.execute_script('return window.__appels;'))
    c.find_element(By.CSS_SELECTOR, '[data-act="valider"]').click(); time.sleep(0.3)
    al = dv.execute_script('return window.__alertes;')
    v('Valider avertit sans appeler le serveur', al and 'Anglais incomplet' in al[-1] and
      not any(a.get('action') == 'validediag' for a in dv.execute_script('return window.__appels;')[n0:]))
    cv = dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"]')
    v('fiche validee complete : pas d\'etiquette ni de lignes EN', 'Anglais incomplet' not in cv.text and not cv.find_elements(By.CSS_SELECTOR, '.dg-en'))

    print('--- 6) portail en anglais ---')
    ouvrir(dv, 'en', [VALIDEE, BROUILLON])
    t = dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"] .dg-head b').text
    v('titre en anglais (%s)' % t, t == 'Black screen at startup')
    dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"] .dg-head').click(); time.sleep(0.2)
    corps = dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"] .dg-body').text
    v('cause et solution en anglais', 'Blown fuse' in corps and 'Replace the 5 A fuse' in corps)
    v('brouillon sans cause anglaise : le francais reste affiche', 'Connecteur oxydé' in dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="b1"]').get_attribute('textContent'))
    q = dv.find_element(By.ID, 'f-q'); q.send_keys('fuse'); time.sleep(0.4)
    ids = [e.get_attribute('data-id') for e in dv.find_elements(By.CSS_SELECTOR, '.dg-card')]
    v('recherche avec un mot anglais (« fuse ») : %s' % ids, ids == ['v1'])
    errs = [x for x in dv.get_log('browser') if x['level'] == 'SEVERE' and 'favicon' not in x['message'] and 'version.json' not in x['message'] and not x['message'].startswith('about:blank')]
    v('aucune erreur JS (%d)' % len(errs), not errs, [e['message'][:120] for e in errs[:3]])
finally:
    dv.quit()
print('\nRESULTAT: %s (%d OK, %d ECHEC)' % ('OK' if not ko else 'ECHEC', len(ok), len(ko)))
sys.exit(1 if ko else 0)
