"""Test navigateur de la base de diagnostic (diagnostic.html) et du lien depuis la
demande SAV (sav.html), serveur SIMULE — aucun appel reseau.

Le fetch vers le backend est remplace avant le chargement de la page par un petit
serveur en memoire qui imite getdiag / savediag / validediag / deletediag (brouillon
pour un non-validateur, validation, proposition). Les regles elles-memes sont prouvees
par scripts/banc_backend/banc_diag.js sur le vrai Code.gs ; ici on controle ce que
l'utilisateur voit et ce que la page envoie.

    py -3.12 scripts/selenium_diagnostic_test.py
"""
import json
import sys
import time
import urllib.parse
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

RACINE = Path(__file__).resolve().parent.parent
PAGE = (RACINE / 'diagnostic.html').as_uri()
SAV_PAGE = (RACINE / 'sav.html').as_uri()
PRODUITS = ["Limiteur d'excavatrice (LPE)", 'Creusage 2D (Guide-Pro GP)', 'Caméras', 'Autre']
VALIDEE = {'id': 'v1', 'statut': 'valide', 'produit': 'Caméras', 'symptome': 'Écran noir au démarrage', 'code': 'NO SIGNAL',
           'motsCles': 'moniteur', 'causes': [{'cause': 'Fusible grillé', 'solution': 'Remplacer le fusible 5 A', 'pieces': 'F-005'}],
           'auteurNom': 'Kevin Service', 'creeLe': '2026-10-01T12:00:00Z', 'modifieParNom': 'Kevin Service',
           'modifieLe': '2026-10-01T12:00:00Z', 'valideParNom': 'Kevin Service', 'valideLe': '2026-10-01T12:00:00Z',
           'remplace': '', 'mien': False}
ok, ko = [], []


def v(nom, cond, det=''):
    (ok if cond else ko).append(nom)
    print(('  OK    ' if cond else '  ECHEC ') + nom + (('  — ' + str(det)) if det else ''))


SERVEUR = """
    localStorage.setItem('portal_user', %(user)s);
    window.__appels = [];
    var S = { fiches: %(fiches)s, valideur: %(valideur)s, n: 0 };
    function vue(f) { return JSON.parse(JSON.stringify(f)); }
    window.fetch = function (url, o) {
        var b = JSON.parse((o && o.body) || '{}'), r;
        window.__appels.push(b);
        if (b.action === 'getdiag') r = { ok: true, peutValider: S.valideur, produits: %(produits)s, fiches: S.fiches.map(vue) };
        else if (b.action === 'savediag') {
            var x = b.fiche, ex = S.fiches.filter(function (f) { return f.id === x.id; })[0];
            if (ex && ex.statut === 'valide' && !S.valideur) {
                var p = { id: 'p' + (++S.n), statut: 'brouillon', remplace: ex.id, mien: true, auteurNom: 'Testeur', creeLe: '2026-10-13T12:00:00Z' };
                ['produit', 'symptome', 'code', 'motsCles', 'causes'].forEach(function (k) { p[k] = x[k]; });
                S.fiches.push(p); r = { ok: true, proposition: true, fiche: vue(p) };
            } else {
                var f = ex || { id: 'n' + (++S.n), statut: S.valideur ? 'valide' : 'brouillon', mien: true, auteurNom: 'Testeur', creeLe: '2026-10-13T12:00:00Z', remplace: '' };
                ['produit', 'symptome', 'code', 'motsCles', 'causes'].forEach(function (k) { f[k] = x[k]; });
                if (!ex) S.fiches.push(f);
                r = { ok: true, fiche: vue(f) };
            }
        } else if (b.action === 'validediag') {
            var g = S.fiches.filter(function (f) { return f.id === b.id; })[0]; g.statut = 'valide'; g.valideParNom = 'Testeur';
            r = { ok: true, fiche: vue(g) };
        } else if (b.action === 'deletediag') { S.fiches = S.fiches.filter(function (f) { return f.id !== b.id; }); r = { ok: true }; }
        else if (b.action === 'getsav') r = { ok: true, sav: { clients: [], pieces: [], produits: %(produits)s, routage: [], cc: [] } };
        else r = { ok: true };
        return Promise.resolve({ json: function () { return Promise.resolve(r); } });
    };
    window.confirm = function () { return true; };
    window.__savOuvrir = function (u) { window.__ouvert = u; };
"""


def navigateur(role, valideur=False, fiches=None, page=PAGE):
    o = Options()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1300,1600')
    o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    d = webdriver.Chrome(options=o)
    user = {'token': 'TOK', 'role': role, 'name': 'Testeur', 'email': 't@e'}
    d.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': SERVEUR % {
        'user': json.dumps(json.dumps(user)), 'fiches': json.dumps(fiches or []),
        'valideur': 'true' if valideur else 'false', 'produits': json.dumps(PRODUITS)}})
    d.get(page)
    time.sleep(1.2)
    return d


def appels(d, action):
    return [a for a in d.execute_script('return window.__appels') if a.get('action') == action]


def severes(d):
    return [l['message'] for l in d.get_log('browser') if l['level'] == 'SEVERE' and 'favicon' not in l['message']]


def ouvrir(carte):
    if 'open' not in carte.get_attribute('class'):
        carte.find_element(By.CSS_SELECTOR, '.dg-head').click()


def remplir_cause(d, i, cause, sol, pieces=''):
    bloc = d.find_elements(By.CSS_SELECTOR, '#e-causes .dg-ec')[i]
    bloc.find_element(By.CSS_SELECTOR, '.c-cause').send_keys(cause)
    bloc.find_element(By.CSS_SELECTOR, '.c-sol').send_keys(sol)
    if pieces:
        bloc.find_element(By.CSS_SELECTOR, '.c-pieces').send_keys(pieces)


def main():
    print('1) Acces')
    d = navigateur('dealer')
    v('dealer : page refusee', d.find_element(By.ID, 'dg-denied').is_displayed() and not d.find_element(By.ID, 'dg-root').is_displayed())
    v('dealer : aucun appel a la base', not [a for a in d.execute_script('return window.__appels') if 'diag' in str(a.get('action'))])
    d.quit()

    print('2) Technicien : base vide, nouvelle fiche')
    d = navigateur('technicien')
    try:
        v('page ouverte', d.find_element(By.ID, 'dg-root').is_displayed())
        v('base demandee au serveur (getdiag, avec jeton)', appels(d, 'getdiag') and appels(d, 'getdiag')[0].get('token') == 'TOK')
        v('message de base vide', 'La base est vide' in d.find_element(By.ID, 'dg-liste').text)
        v('liste de produits du serveur dans le filtre', len(Select(d.find_element(By.ID, 'f-produit')).options) == len(PRODUITS) + 1)
        d.find_element(By.ID, 'b-nouvelle').click()
        time.sleep(0.3)
        v('formulaire ouvert, une cause vide', d.find_element(By.ID, 'dg-edit').is_displayed()
          and len(d.find_elements(By.CSS_SELECTOR, '#e-causes .dg-ec')) == 1)
        v('note : brouillon jusqu\'a validation', 'brouillon' in d.find_element(By.ID, 'e-note').text)
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.2)
        al = d.find_element(By.ID, 'e-alert').text
        v('enregistrement vide refuse : produit, symptome, cause', all(m in al for m in ('produit', 'symptôme', 'cause')), al)
        v('rien envoye au serveur', not appels(d, 'savediag'))
        Select(d.find_element(By.ID, 'e-produit')).select_by_visible_text("Limiteur d'excavatrice (LPE)")
        d.find_element(By.ID, 'e-symptome').send_keys('Alarme en rotation sans charge')
        d.find_element(By.ID, 'e-code').send_keys('E-12')
        remplir_cause(d, 0, 'Câble CAN abîmé', 'Remplacer le câble', 'E03A-0013')
        d.find_element(By.ID, 'b-cause').click()
        remplir_cause(d, 1, 'Inclino mal calibré', 'Refaire la calibration :\n1. Mettre la flèche à plat\n2. Valider')
        d.find_elements(By.CSS_SELECTOR, '#e-causes .dg-ec')[1].find_element(By.CSS_SELECTOR, '[data-m="haut"]').click()
        v('cause remontee : numerotation a jour', [e.text for e in d.find_elements(By.CSS_SELECTOR, '#e-causes .n')] == ['Cause 1', 'Cause 2']
          and d.find_elements(By.CSS_SELECTOR, '#e-causes .c-cause')[0].get_attribute('value') == 'Inclino mal calibré')
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.8)
        s = appels(d, 'savediag')
        f = s[-1]['fiche'] if s else {}
        v('savediag envoye avec le bon contenu', f.get('produit') == "Limiteur d'excavatrice (LPE)" and f.get('symptome') == 'Alarme en rotation sans charge'
          and f.get('code') == 'E-12' and 'id' not in f, f)
        v('causes dans l\'ordre choisi, retours de ligne conserves', [c['cause'] for c in f.get('causes', [])] == ['Inclino mal calibré', 'Câble CAN abîmé']
          and '\n2. Valider' in f['causes'][0]['solution'] and f['causes'][1]['pieces'] == 'E03A-0013', f.get('causes'))
        v('formulaire ferme, message brouillon', not d.find_element(By.ID, 'dg-edit').is_displayed()
          and 'brouillon' in d.find_element(By.ID, 'dg-ok').text, d.find_element(By.ID, 'dg-ok').text)
        carte = d.find_element(By.CSS_SELECTOR, '.dg-card')
        v('la fiche apparait, marquee « Brouillon a valider », ouverte', 'Brouillon à valider' in carte.text and 'open' in carte.get_attribute('class'))
        v('solution affichee avec ses lignes', '1. Mettre la flèche à plat\n2. Valider' in carte.find_element(By.CSS_SELECTOR, '.dg-sol').text)
        v('technicien : pas de bouton Valider, mais Modifier et Supprimer sur son brouillon',
          not carte.find_elements(By.CSS_SELECTOR, '[data-act="valider"]') and carte.find_elements(By.CSS_SELECTOR, '[data-act="modifier"]')
          and carte.find_elements(By.CSS_SELECTOR, '[data-act="supprimer"]'))
        v('compteur « Mes brouillons (1) »', d.find_element(By.ID, 'c-brouillons').text == 'Mes brouillons (1)', d.find_element(By.ID, 'c-brouillons').text)
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print('3) Recherche, filtre, fiche validee (technicien)')
    d = navigateur('technicien', fiches=[VALIDEE, dict(VALIDEE, id='v2', produit="Limiteur d'excavatrice (LPE)", symptome='Alarme de surcharge intempestive',
                                                       code='', motsCles='', causes=[{'cause': 'Capteur de pression', 'solution': 'Vérifier', 'pieces': ''}])])
    try:
        v('2 fiches affichees', d.find_element(By.ID, 'dg-compte').text.startswith('2 fiches'), d.find_element(By.ID, 'dg-compte').text)
        q = d.find_element(By.ID, 'f-q')
        q.send_keys('fusible')
        v('recherche dans les causes et solutions', len(d.find_elements(By.CSS_SELECTOR, '.dg-card')) == 1
          and 'Écran noir' in d.find_element(By.CSS_SELECTOR, '.dg-card').text)
        q.clear(); q.send_keys('ecran signal')
        v('recherche sans accents, plusieurs mots (symptome + code)', len(d.find_elements(By.CSS_SELECTOR, '.dg-card')) == 1)
        q.clear(); q.send_keys('zzz')
        v('aucun resultat : invitation a ajouter la fiche', 'Aucune fiche ne correspond' in d.find_element(By.ID, 'dg-liste').text)
        q.clear(); q.send_keys(' ')
        Select(d.find_element(By.ID, 'f-produit')).select_by_visible_text('Caméras')
        v('filtre par produit', len(d.find_elements(By.CSS_SELECTOR, '.dg-card')) == 1)
        d.find_element(By.CSS_SELECTOR, '.dg-card .dg-head').click()
        carte = d.find_element(By.CSS_SELECTOR, '.dg-card')
        v('clic sur l\'en-tete : la fiche s\'ouvre', 'open' in carte.get_attribute('class'))
        b = carte.find_elements(By.CSS_SELECTOR, '[data-act="modifier"]')
        v('fiche validee : « Proposer une modification », pas de Supprimer', b and b[0].text == 'Proposer une modification'
          and not carte.find_elements(By.CSS_SELECTOR, '[data-act="supprimer"]'))
        b[0].click()
        time.sleep(0.3)
        v('formulaire pre-rempli', d.find_element(By.ID, 'e-titre').text == 'Proposer une modification'
          and d.find_element(By.ID, 'e-symptome').get_attribute('value') == 'Écran noir au démarrage'
          and d.find_elements(By.CSS_SELECTOR, '#e-causes .c-pieces')[0].get_attribute('value') == 'F-005')
        d.find_elements(By.CSS_SELECTOR, '#e-causes .c-sol')[0].send_keys(' (vérifier aussi le relais)')
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.8)
        s = appels(d, 'savediag')
        v('proposition envoyee avec l\'id de la fiche d\'origine', s and s[-1]['fiche'].get('id') == 'v1')
        v('message : proposition envoyee au service', 'Proposition envoyée' in d.find_element(By.ID, 'dg-ok').text)
        Select(d.find_element(By.ID, 'f-produit')).select_by_index(0)
        d.find_element(By.ID, 'c-brouillons').click()
        cartes = d.find_elements(By.CSS_SELECTOR, '.dg-card')
        v('vue Brouillons : la proposition, marquee comme telle', len(cartes) == 1 and 'Proposition de modification' in cartes[0].text)
        ouvrir(cartes[0])
        v('elle dit quelle fiche elle remplacera', 'Remplacera la fiche validée « Écran noir au démarrage »' in cartes[0].text)
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print('4) Validateur')
    br = dict(VALIDEE, id='b1', statut='brouillon', symptome='Afficheur qui clignote', valideParNom='', valideLe='', mien=False, auteurNom='Tech Route')
    d = navigateur('ingenierie', valideur=True, fiches=[VALIDEE, br])
    try:
        v('compteur « Brouillons a valider (1) »', d.find_element(By.ID, 'c-brouillons').text == 'Brouillons à valider (1)')
        d.find_element(By.ID, 'c-brouillons').click()
        carte = d.find_element(By.CSS_SELECTOR, '.dg-card')
        ouvrir(carte)
        v('brouillon d\'un autre : Valider, Modifier, Supprimer', all(carte.find_elements(By.CSS_SELECTOR, '[data-act="%s"]' % a) for a in ('valider', 'modifier', 'supprimer')))
        carte.find_element(By.CSS_SELECTOR, '[data-act="valider"]').click()
        time.sleep(0.8)
        v('validediag envoye pour cette fiche', [a.get('id') for a in appels(d, 'validediag')] == ['b1'])
        v('message de validation, plus de brouillon', 'Fiche validée' in d.find_element(By.ID, 'dg-ok').text
          and d.find_element(By.ID, 'c-brouillons').text == 'Brouillons à valider (0)')
        d.find_element(By.CSS_SELECTOR, '.dg-chip[data-vue="tout"]').click()
        d.find_element(By.ID, 'b-nouvelle').click()
        v('validateur : note « publiee des l\'enregistrement »', 'publiée dès l\'enregistrement' in d.find_element(By.ID, 'e-note').text)
        d.find_element(By.ID, 'b-annuler').click()
        carte = d.find_elements(By.CSS_SELECTOR, '.dg-card')[0]
        ouvrir(carte)
        carte.find_element(By.CSS_SELECTOR, '[data-act="supprimer"]').click()
        time.sleep(0.8)
        v('suppression : deletediag puis liste rechargee', len(appels(d, 'deletediag')) == 1 and len(d.find_elements(By.CSS_SELECTOR, '.dg-card')) == 1)
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print('5) Arrivee depuis la demande SAV')
    d = navigateur('technicien', fiches=[VALIDEE], page=PAGE + '?produit=' + urllib.parse.quote('Caméras') + '&q=' + urllib.parse.quote('NO SIGNAL'))
    try:
        v('produit et recherche pre-remplis par l\'adresse', Select(d.find_element(By.ID, 'f-produit')).first_selected_option.text == 'Caméras'
          and d.find_element(By.ID, 'f-q').get_attribute('value') == 'NO SIGNAL' and len(d.find_elements(By.CSS_SELECTOR, '.dg-card')) == 1)
    finally:
        d.quit()
    d = navigateur('technicien', page=SAV_PAGE)
    try:
        v('SAV : lien vers la base en haut de page', d.find_element(By.ID, 'l-diag').get_attribute('href').endswith('diagnostic.html'))
        d.execute_script("document.querySelector('#f-produits input[value=\"Caméras\"]').click()")
        d.find_element(By.ID, 'f-code').send_keys('NO SIGNAL')
        d.find_element(By.ID, 'b-diag').click()
        u = d.execute_script('return window.__ouvert') or ''
        v('SAV : bouton « Chercher » ouvre la base avec le produit et le code', u == 'diagnostic.html?produit=' + urllib.parse.quote('Caméras', safe='') + '&q=NO%20SIGNAL', u)
        d.find_element(By.ID, 'f-code').clear()
        d.find_element(By.ID, 'f-desc').send_keys("l'écran reste noir quand on démarre la machine")
        d.find_element(By.ID, 'b-diag').click()
        u = d.execute_script('return window.__ouvert') or ''
        v('SAV : sans code, les 4 premiers mots de la description', u.endswith('&q=' + urllib.parse.quote("l'écran reste noir quand", safe="'")), u)
        v('SAV : la fiche en cours n\'est pas touchee', d.find_element(By.ID, 'f-desc').get_attribute('value').startswith("l'écran"))
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print()
    print('RESULTAT: %s (%d OK, %d ECHEC)' % ('OK' if not ko else 'ECHEC', len(ok), len(ko)))
    sys.exit(1 if ko else 0)


if __name__ == '__main__':
    main()
