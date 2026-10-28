"""Base de diagnostic bilingue (Steve, 2026-10-21), serveur SIMULE.

Verifie ce que la page montre et envoie (les regles sont prouvees par banc_diag.js) :
  1. page en francais : champs francais en premier, anglais en dessous (pointille) ;
     l'enregistrement envoie fiche.en avec autant de causes que le francais ;
  2. « Modifier » pre-remplit les deux langues ; une correction de l'anglais est envoyee ;
  3. validateur : la traduction d'un brouillon s'affiche sous chaque ligne ; brouillon
     incomplet = etiquette « Traduction incomplete », Valider avertit sans appeler le serveur ;
  4. page en anglais (techniciens de Val-trak) : interface traduite (titre, boutons, compteur,
     formulaire), champs anglais en premier ; une fiche ECRITE EN ANGLAIS seulement est acceptee
     par la page (francais vide) ; la fiche s'affiche en anglais ; recherche avec un mot anglais ;
  5. bascule FR/EN sans recharger ; aucune erreur JS.

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
           'bilingue': True, 'auteurNom': 'Kevin', 'creeLe': '2026-10-01T12:00:00Z', 'remplace': '', 'mien': False}
BROUILLON = {'id': 'b1', 'statut': 'brouillon', 'produit': 'Caméras', 'symptome': 'Image qui saute', 'code': '',
             'motsCles': '', 'causes': [{'cause': 'Connecteur oxydé', 'solution': 'Nettoyer le connecteur', 'pieces': ''}],
             'en': {'symptome': 'Jumping image', 'motsCles': '', 'causes': [{'cause': '', 'solution': ''}]},
             'bilingue': False, 'auteurNom': 'Tech', 'creeLe': '2026-10-02T12:00:00Z', 'remplace': '', 'mien': False}
ok, ko = [], []


def v(nom, cond, det=''):
    (ok if cond else ko).append(nom)
    print(('  OK    ' if cond else '  ECHEC ') + nom + (('  — ' + str(det)) if det else ''))


SERVEUR = """
    if (location.protocol === 'file:') {
    localStorage.setItem('portal_user', JSON.stringify({ email: 'k@e', name: 'Kevin', role: 'ingenierie', token: 'T' }));
    localStorage.setItem('portal_lang', %(lang)s);
    window.__appels = []; window.__alertes = [];
    window.alert = function (m) { window.__alertes.push(m); };
    var S = { fiches: %(fiches)s, n: 0 };
    window.fetch = function (url, o) {
        var b = JSON.parse((o && o.body) || '{}'), r = { ok: true };
        window.__appels.push(b);
        if (b.action === 'getdiag') r = { ok: true, peutValider: %(valideur)s, produits: ['Caméras', 'Autre'], fiches: JSON.parse(JSON.stringify(S.fiches)) };
        else if (b.action === 'savediag') {
            var x = b.fiche, f = S.fiches.filter(function (q) { return q.id === x.id; })[0];
            if (!f) { f = { id: 'n' + (++S.n), statut: 'brouillon', mien: true, auteurNom: 'Kevin', creeLe: '2026-10-21T12:00:00Z', remplace: '' }; S.fiches.push(f); }
            var t = function (a, b, p) { return a || (b ? p + b : ''); };
            f.produit = x.produit; f.code = x.code;
            f.symptome = t(x.symptome, x.en.symptome, '[FR] '); f.motsCles = t(x.motsCles, x.en.motsCles, '[FR] ');
            f.causes = x.causes.map(function (c, i) { var k = x.en.causes[i] || {}; return { cause: t(c.cause, k.cause, '[FR] '), solution: t(c.solution, k.solution, '[FR] '), pieces: c.pieces }; });
            f.en = { symptome: t(x.en.symptome, x.symptome, '[EN] '), motsCles: t(x.en.motsCles, x.motsCles, '[EN] '),
                     causes: x.causes.map(function (c, i) { var k = x.en.causes[i] || {}; return { cause: t(k.cause, c.cause, '[EN] '), solution: t(k.solution, c.solution, '[EN] ') }; }) };
            f.bilingue = true;
            r = { ok: true, fiche: JSON.parse(JSON.stringify(f)) };
        }
        return Promise.resolve({ json: function () { return Promise.resolve(r); } });
    };
    }
"""


def ouvrir(dv, lang, fiches, valideur=True):
    dv.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': SERVEUR % {
        'lang': json.dumps(lang), 'fiches': json.dumps(fiches), 'valideur': json.dumps(valideur)}})
    dv.get(PAGE)
    time.sleep(1.2)


def appels(dv, action):
    return [a for a in dv.execute_script('return window.__appels;') if a.get('action') == action]


def premier_champ(dv, grille_css):
    return dv.execute_script("var g=document.querySelector(arguments[0]); var c=[].filter.call(g.children,function(x){return x.getAttribute('data-l');}); return c.length ? c[0].getAttribute('data-l') : '';", grille_css)


def nouveau_navigateur():
    o = Options()
    for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1300,1100', '--allow-file-access-from-files']:
        o.add_argument(a)
    o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    return webdriver.Chrome(options=o)


errs_total = []
try:
    print('--- 1) page en francais : formulaire et envoi ---')
    dv = nouveau_navigateur()
    ouvrir(dv, 'fr', [VALIDEE, BROUILLON])
    dv.find_element(By.ID, 'b-nouvelle').click(); time.sleep(0.3)
    v('francais en premier (formulaire et cause)', premier_champ(dv, '#dg-edit > .dg-grid') == 'fr' and premier_champ(dv, '#e-causes .dg-grid') == 'fr')
    v('champs anglais en pointille (classe en)', 'en' in dv.find_element(By.ID, 'w-symptome-en').get_attribute('class').split())
    Select(dv.find_element(By.ID, 'e-produit')).select_by_visible_text('Caméras')
    dv.find_element(By.ID, 'e-symptome').send_keys('Moniteur fige')
    dv.find_element(By.CSS_SELECTOR, '#e-causes .c-cause').send_keys('Logiciel bloque')
    dv.find_element(By.CSS_SELECTOR, '#e-causes .c-sol').send_keys('Redemarrer le moniteur')
    dv.find_element(By.ID, 'b-cause').click()
    dv.find_elements(By.CSS_SELECTOR, '#e-causes .c-cause')[1].send_keys('Alimentation faible')
    dv.find_elements(By.CSS_SELECTOR, '#e-causes .c-sol')[1].send_keys('Verifier la tension')
    dv.find_element(By.ID, 'b-enreg').click(); time.sleep(0.8)
    env = appels(dv, 'savediag')[-1]['fiche']
    v('fiche.en envoyee avec 2 causes', len(env['en']['causes']) == 2 and env['en']['symptome'] == '', env.get('en'))

    print('--- 2) modifier : deux langues pre-remplies ---')
    carte = dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"]')
    carte.find_element(By.CSS_SELECTOR, '.dg-head').click(); time.sleep(0.2)
    carte.find_element(By.CSS_SELECTOR, '[data-act="modifier"]').click(); time.sleep(0.3)
    v('anglais pre-rempli', dv.find_element(By.ID, 'e-symptome-en').get_attribute('value') == 'Black screen at startup'
      and dv.find_element(By.CSS_SELECTOR, '#e-causes .c-sol-en').get_attribute('value') == 'Replace the 5 A fuse')
    ch = dv.find_element(By.CSS_SELECTOR, '#e-causes .c-cause-en'); ch.clear(); ch.send_keys('Fuse blown')
    dv.find_element(By.ID, 'b-enreg').click(); time.sleep(0.8)
    env = appels(dv, 'savediag')[-1]['fiche']
    v('correction de l\'anglais envoyee', env['id'] == 'v1' and env['en']['causes'][0]['cause'] == 'Fuse blown' and env['causes'][0]['cause'] == 'Fusible grillé')

    print('--- 3) validateur : revision, traduction incomplete ---')
    dv.quit(); dv = nouveau_navigateur()
    ouvrir(dv, 'fr', [VALIDEE, BROUILLON])
    c = dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="b1"]')
    v('etiquette « Traduction incomplète »', 'Traduction incomplète' in c.find_element(By.CSS_SELECTOR, '.dg-head').text)
    c.find_element(By.CSS_SELECTOR, '.dg-head').click(); time.sleep(0.2)
    lignes = [e.text for e in c.find_elements(By.CSS_SELECTOR, '.dg-en')]
    v('traduction sous le francais (EN)', any(t.startswith('EN') and 'Jumping image' in t for t in lignes) and any('à traduire' in t for t in lignes), lignes)
    n0 = len(dv.execute_script('return window.__appels;'))
    c.find_element(By.CSS_SELECTOR, '[data-act="valider"]').click(); time.sleep(0.3)
    al = dv.execute_script('return window.__alertes;')
    v('Valider avertit sans appeler le serveur', bool(al) and 'Traduction incomplète' in al[-1]
      and not [a for a in dv.execute_script('return window.__appels;')[n0:] if a.get('action') == 'validediag'])
    errs_total += [x for x in dv.get_log('browser') if x['level'] == 'SEVERE']

    print('--- 4) page en anglais (Val-trak) ---')
    dv.quit(); dv = nouveau_navigateur()
    ouvrir(dv, 'en', [VALIDEE, BROUILLON], valideur=False)
    txt = lambda css: dv.find_element(By.CSS_SELECTOR, css).text
    v('titre « %s »' % txt('.admin-hero-title'), txt('.admin-hero-title') == 'Diagnostic database')
    v('bouton « %s »' % txt('#b-nouvelle'), txt('#b-nouvelle') == '+ New sheet')
    v('compteur « %s »' % txt('#dg-compte'), txt('#dg-compte') == '2 sheets shown of 2')
    v('puce « %s »' % txt('#c-brouillons'), txt('#c-brouillons') == 'My drafts (1)')
    v('recherche en anglais (placeholder)', dv.find_element(By.ID, 'f-q').get_attribute('placeholder').startswith('Search'))
    v('titre de l\'onglet', dv.title == 'e-Trak | Diagnostic database', dv.title)
    t1 = txt('.dg-card[data-id="v1"] .dg-head b')
    v('fiche en anglais (%s)' % t1, t1 == 'Black screen at startup')
    dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"] .dg-head').click(); time.sleep(0.2)
    corps = txt('.dg-card[data-id="v1"] .dg-body')
    v('cause, solution et meta en anglais', 'Blown fuse' in corps and 'Replace the 5 A fuse' in corps and 'Parts : F-005' in corps and 'Written by Kevin' in corps, corps[:160])
    v('bouton « Suggest a change »', dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="v1"] [data-act="modifier"]').text == 'Suggest a change')
    v('brouillon sans cause anglaise : le francais en repli', 'Connecteur oxydé' in dv.find_element(By.CSS_SELECTOR, '.dg-card[data-id="b1"]').get_attribute('textContent'))
    q = dv.find_element(By.ID, 'f-q'); q.send_keys('fuse'); time.sleep(0.4)
    ids = [e.get_attribute('data-id') for e in dv.find_elements(By.CSS_SELECTOR, '.dg-card')]
    v('recherche « fuse » : %s' % ids, ids == ['v1'])
    q.clear(); q.send_keys(' '); time.sleep(0.2)
    dv.find_element(By.ID, 'b-nouvelle').click(); time.sleep(0.3)
    v('formulaire : anglais en premier, titre « %s »' % txt('#e-titre'), premier_champ(dv, '#dg-edit > .dg-grid') == 'en'
      and premier_champ(dv, '#e-causes .dg-grid') == 'en' and txt('#e-titre') == 'New sheet')
    v('libelles du formulaire en anglais', 'Symptom (what the customer sees)' in txt('#w-symptome-en') and 'Symptom — French' in txt('#w-symptome')
      and txt('#b-enreg') == 'Save' and txt('#e-causes .n') == 'Cause 1')
    Select(dv.find_element(By.ID, 'e-produit')).select_by_visible_text('Caméras')
    dv.find_element(By.ID, 'e-symptome-en').send_keys('Screen flickers')
    dv.find_element(By.CSS_SELECTOR, '#e-causes .c-cause-en').send_keys('Loose connector')
    dv.find_element(By.CSS_SELECTOR, '#e-causes .c-sol-en').send_keys('Reseat the connector')
    dv.find_element(By.ID, 'b-enreg').click(); time.sleep(0.8)
    s = appels(dv, 'savediag')
    v('fiche ecrite en anglais seulement : envoyee (francais vide)', bool(s) and s[-1]['fiche']['symptome'] == '' and s[-1]['fiche']['en']['symptome'] == 'Screen flickers'
      and s[-1]['fiche']['en']['causes'][0]['solution'] == 'Reseat the connector')
    v('message en anglais', 'draft' in txt('#dg-ok').lower(), txt('#dg-ok'))
    dv.find_element(By.ID, 'b-nouvelle').click(); time.sleep(0.3)
    dv.find_element(By.ID, 'b-enreg').click(); time.sleep(0.3)
    v('champs manquants signales en anglais', txt('#e-alert').startswith('To complete:') and 'product' in txt('#e-alert'), txt('#e-alert'))
    dv.find_element(By.ID, 'b-annuler').click()

    print('--- 5) bascule FR/EN sans recharger ---')
    dv.execute_script("i18n.setLang('fr');"); time.sleep(0.5)
    v('retour en francais : titre et premiere fiche', txt('.admin-hero-title') == 'Base de diagnostic'
      and txt('.dg-card[data-id="v1"] .dg-head b') == 'Écran noir au démarrage' and txt('#b-nouvelle') == '+ Nouvelle fiche')
    errs_total += [x for x in dv.get_log('browser') if x['level'] == 'SEVERE']
    errs = [x for x in errs_total if 'favicon' not in x['message'] and 'version.json' not in x['message']]
    v('aucune erreur JS (%d)' % len(errs), not errs, [e['message'][:140] for e in errs[:3]])
finally:
    dv.quit()
print('\nRESULTAT: %s (%d OK, %d ECHEC)' % ('OK' if not ko else 'ECHEC', len(ok), len(ko)))
sys.exit(1 if ko else 0)
