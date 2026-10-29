"""Test navigateur de la banque d'installation (installation.html) et de la page
Soutien technique (soutien.html), serveur SIMULE — aucun appel reseau.

Le fetch vers le backend est remplace avant le chargement de la page par un petit
serveur en memoire qui imite getinst / saveinst / validateinst / deleteinst /
uploadinstphoto / getinstphoto. Les regles elles-memes sont prouvees par
scripts/banc_backend/banc_inst.js sur le vrai Code.gs ; ici on controle ce que
l'utilisateur voit et ce que la page envoie (demandes de Steve du 2026-10-28/29).

    py -3.12 scripts/selenium_installation_test.py
"""
import json
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

RACINE = Path(__file__).resolve().parent.parent
PAGE = (RACINE / 'installation.html').as_uri()
SOUTIEN = (RACINE / 'soutien.html').as_uri()
EXEMPLE = {'id': 'v1', 'statut': 'valide', 'type': 'Excavatrice', 'fabricant': 'Case', 'modele': 'CX19D', 'produit': 'limiteur',
           'option': 'hauteur_rotation', 'temps': '6 h', 'texte': 'Installer le capteur sur la flèche', 'photos': [],
           'pieces': [{'txt': 'Z03B-0041 — Harnais', 'qte': '1'}], 'pieges': 'Attention au câble',
           'en': {'texte': 'Install the sensor on the boom', 'pieges': 'Watch the cable'}, 'auteurNom': 'Mathieu',
           'creeLe': '2026-10-28T12:00:00Z', 'modifieParNom': 'Mathieu', 'modifieLe': '2026-10-28T12:00:00Z',
           'valideParNom': 'Mathieu', 'valideLe': '2026-10-28T12:00:00Z', 'remplace': '', 'mien': False, 'bilingue': True}
HORS_BASE = dict(EXEMPLE, id='v2', type='Chariot élévateur', fabricant='Toyota', modele='8FGU25', produit='camera', option='')
ok, ko = [], []


def v(nom, cond, det=''):
    (ok if cond else ko).append(nom)
    print(('  OK    ' if cond else '  ECHEC ') + nom + (('  — ' + str(det)) if det else ''))


SERVEUR = """
    localStorage.setItem('portal_user', %(user)s);
    localStorage.setItem('portal_lang', %(lang)s);
    window.__appels = [];
    var S = { notes: %(notes)s, valideur: %(valideur)s, n: 0, photos: {} };
    function vue(x) { return JSON.parse(JSON.stringify(x)); }
    var vraiFetch = window.fetch.bind(window);
    window.fetch = function (url, o) {
        if (!o || o.method !== 'POST') return vraiFetch(url, o);      // data/machines.json : le vrai fichier
        var b = JSON.parse((o && o.body) || '{}'), r;
        window.__appels.push(b.action === 'uploadinstphoto' ? { action: b.action, taille: (b.data || '').length } : b);
        if (b.action === 'getinst') r = { ok: true, peutValider: S.valideur, nom: 'Testeur', notes: S.notes.map(vue) };
        else if (b.action === 'saveinst') {
            var x = b.note, ex = S.notes.filter(function (n) { return n.id === x.id; })[0];
            var n = ex || { id: 'n' + (++S.n), statut: S.valideur ? 'valide' : 'brouillon', mien: true, auteurNom: 'Testeur', creeLe: '2026-10-29T12:00:00Z', remplace: '' };
            ['type', 'fabricant', 'modele', 'produit', 'option', 'temps', 'texte', 'photos', 'pieces', 'pieges'].forEach(function (k) { n[k] = x[k]; });
            n.en = { texte: x.en.texte || (x.texte ? 'EN:' + x.texte : ''), pieges: x.en.pieges || (x.pieges ? 'EN:' + x.pieges : '') };
            n.bilingue = true;
            if (!ex) S.notes.push(n);
            r = { ok: true, note: vue(n) };
        } else if (b.action === 'uploadinstphoto') { var pid = 'PHOTO_' + String(++S.n).padStart(10, '0'); S.photos[pid] = b.data; r = { ok: true, id: pid }; }
        else if (b.action === 'getinstphoto') r = S.photos[b.id] ? { ok: true, type: 'image/jpeg', data: S.photos[b.id] } : { error: 'not found' };
        else if (b.action === 'getsav') r = { ok: true, sav: { pieces: [['Z03B-0041', 'Harnais Link-Belt/Case']] } };
        else r = { ok: true };
        return Promise.resolve({ json: function () { return Promise.resolve(r); } });
    };
    window.confirm = function () { return true; };
"""


def navigateur(role, valideur=False, notes=None, page=PAGE, lang='fr'):
    o = Options()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1300,1600')
    o.add_argument('--allow-file-access-from-files')     # fetch de data/machines.json en file://
    o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    d = webdriver.Chrome(options=o)
    user = {'token': 'TOK', 'role': role, 'name': 'Testeur', 'email': 't@e'}
    d.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': SERVEUR % {
        'user': json.dumps(json.dumps(user)), 'lang': json.dumps(lang), 'notes': json.dumps(notes or []),
        'valideur': 'true' if valideur else 'false'}})
    d.get(page)
    time.sleep(2.0)
    return d


def appels(d, action):
    return [a for a in d.execute_script('return window.__appels') if a.get('action') == action]


def severes(d):
    return [l['message'] for l in d.get_log('browser') if l['level'] == 'SEVERE' and 'favicon' not in l['message']]


def choisir(d, id_, val):
    d.execute_script("var s=document.getElementById(arguments[0]); s.value=arguments[1]; s.dispatchEvent(new Event('change',{bubbles:true}));", id_, val)


def options(d, id_):
    return d.execute_script("return [...document.getElementById(arguments[0]).options].map(o=>o.text).filter(Boolean)", id_)


def titres(d):
    return d.execute_script("return [...document.querySelectorAll('.in-card .in-head b')].map(b=>b.textContent)")


def main():
    print('1) Acces et page Soutien technique')
    d = navigateur('dealer')
    v('dealer : banque refusee', d.find_element(By.ID, 'in-denied').is_displayed() and not appels(d, 'getinst'))
    d.quit()
    d = navigateur('dealer', page=SOUTIEN)
    v('dealer : Soutien technique refuse', d.find_element(By.ID, 'st-denied').is_displayed() and not d.find_element(By.ID, 'st-root').is_displayed())
    d.quit()
    d = navigateur('technicien', page=SOUTIEN)
    try:
        v('technicien : Soutien technique avec les 2 outils', d.find_element(By.ID, 'st-diag').get_attribute('href').endswith('diagnostic.html')
          and d.find_element(By.ID, 'st-inst').get_attribute('href').endswith('installation.html'))
        v('titre traduit', d.find_element(By.CSS_SELECTOR, '.admin-hero-title').text == 'Soutien technique')
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print('2) Filtres : modeles sans suffixe, « Autres », produits selon la machine')
    d = navigateur('technicien', notes=[EXEMPLE, HORS_BASE])
    try:
        v('les 2 notes affichees, fermees', len(titres(d)) == 2 and not d.find_elements(By.CSS_SELECTOR, '.in-card.open'))
        v('retour : vers Soutien technique', d.find_element(By.CSS_SELECTOR, '.header-back').get_attribute('href').endswith('soutien.html'))
        v('Type : « Autres (hors base) » en dernier', options(d, 'f-type')[-1] == 'Autres (hors base)')
        choisir(d, 'f-type', '__autre')
        v('Type Autres : seulement la note hors base', titres(d) == ['Caméra — Toyota 8FGU25'], titres(d))
        choisir(d, 'f-type', 'Excavatrice')
        choisir(d, 'f-fab', 'Case')
        mods = options(d, 'f-modele')
        v('modeles Case sans suffixe (CX19 regroupe CX19D)', 'CX19 (CX19D)' in mods and 'CX19D' not in mods and mods[-1] == 'Autres (hors base)', mods[:6])
        choisir(d, 'f-modele', 'CX19')
        v('filtre CX19 : trouve la note du CX19D', len(titres(d)) == 1 and titres(d)[0].endswith('Case CX19D'), titres(d))
        prods = options(d, 'f-produit')
        v('Excavatrice : pas d\'options nacelle ni de balance', 'Options nacelle' not in prods and 'Balance ST-7' not in prods and 'Indicateur de charge' in prods, prods)
        choisir(d, 'f-type', 'Loader')
        prods = options(d, 'f-produit')
        v('Loader : Limiteur, Camera, Balance ST-7 seulement', prods == ['Tous les produits', 'Limiteur de portée', 'Caméra', 'Balance ST-7'], prods)
        choisir(d, 'f-type', '')
        d.find_element(By.ID, 'f-q').send_keys('CX19E')
        time.sleep(0.3)
        v('recherche « CX19E » trouve la note du CX19D', len(titres(d)) == 1, titres(d))
        d.find_element(By.ID, 'f-q').clear()
        d.execute_script("document.getElementById('f-q').dispatchEvent(new Event('input'))")
        cartes = d.find_elements(By.CSS_SELECTOR, '.in-card .in-head')
        cartes[0].click(); cartes[1].click()
        v('une seule fiche ouverte a la fois', len(d.find_elements(By.CSS_SELECTOR, '.in-card.open')) == 1)
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print('3) Nouvelle note : « Autre… », une seule langue, photo, enregistrement')
    jpeg = Path(tempfile.gettempdir()) / 'essai_installation.jpg'
    Image.new('RGB', (2400, 1600), (200, 120, 40)).save(jpeg, 'JPEG', quality=95)
    d = navigateur('technicien')
    try:
        d.find_element(By.ID, 'b-nouvelle').click()
        time.sleep(0.4)
        v('edition : filtres et liste caches', not d.find_element(By.ID, 'in-vue-liste').is_displayed() and d.find_element(By.ID, 'in-edit').is_displayed())
        langues = d.execute_script("return [...document.querySelectorAll('#in-edit [data-l]')].map(x=>x.dataset.l+':'+(getComputedStyle(x).display!=='none'))")
        v('francais : seulement les champs francais', langues == ['fr:true', 'en:false', 'fr:true', 'en:false'], langues)
        v('« Autre… » en fin de liste des types', options(d, 'e-type')[-1] == 'Autre…')
        choisir(d, 'e-type', 'Loader')
        choisir(d, 'e-produit', 'limiteur')
        v('Loader : limiteur Hauteur seulement', options(d, 'e-option') == ['— Aucune —', 'Hauteur'], options(d, 'e-option'))
        choisir(d, 'e-type', '__autre')
        v('type Autre : fabricant et modele aussi, 3 cases a preciser',
          d.execute_script("return ['type','fab','modele'].every(k=>document.getElementById('e-'+k).value==='__autre' && getComputedStyle(document.getElementById('e-'+k+'-autre')).display!=='none')"))
        d.find_element(By.ID, 'e-type-autre').send_keys('Chariot élévateur')
        d.find_element(By.ID, 'e-fab-autre').send_keys('Toyota')
        d.find_element(By.ID, 'e-modele-autre').send_keys('8FGU25H')
        choisir(d, 'e-produit', 'camera')
        d.find_element(By.ID, 'e-texte').send_keys('Fixer la caméra sur le contrepoids')
        d.find_element(By.ID, 'e-file').send_keys(str(jpeg))
        time.sleep(1.5)
        up = appels(d, 'uploadinstphoto')
        v('photo reduite avant l\'envoi (< 470 000 car. base64)', len(up) == 1 and 0 < up[0]['taille'] < 470000, up)
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.8)
        s = appels(d, 'saveinst')
        n = s[0]['note'] if s else {}
        v('envoye : machine ecrite a la main, modele sans suffixe, photo', n.get('type') == 'Chariot élévateur' and n.get('fabricant') == 'Toyota'
          and n.get('modele') == '8FGU25' and len(n.get('photos', [])) == 1, n)
        v('retour a la liste, note visible et ouverte', d.find_element(By.ID, 'in-vue-liste').is_displayed()
          and titres(d) == ['Caméra — Toyota 8FGU25'] and len(d.find_elements(By.CSS_SELECTOR, '.in-card.open')) == 1, titres(d))
        v('nouveau type dans le filtre Type : Autres', options(d, 'f-type')[-1] == 'Autres (hors base)')
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print('4) Anglais : seulement les champs anglais')
    d = navigateur('technicien', notes=[EXEMPLE], lang='en')
    try:
        d.find_element(By.ID, 'b-nouvelle').click()
        time.sleep(0.4)
        langues = d.execute_script("return [...document.querySelectorAll('#in-edit [data-l]')].map(x=>x.dataset.l+':'+(getComputedStyle(x).display!=='none'))")
        v('anglais : seulement les champs anglais', sorted(langues) == ['en:true', 'en:true', 'fr:false', 'fr:false'], langues)
        v('« Other… » en anglais', options(d, 'e-type')[-1] == 'Other…')
    finally:
        d.quit()

    print()
    print('RESULTAT: %s (%d OK, %d ECHEC)' % ('OK' if not ko else 'ECHEC', len(ok), len(ko)))
    sys.exit(1 if ko else 0)


if __name__ == '__main__':
    main()
