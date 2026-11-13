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
from selenium.webdriver.common.keys import Keys

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
    var S = { notes: %(notes)s, valideur: %(valideur)s, n: 0, photos: %(photos)s };
    function vue(x) { return JSON.parse(JSON.stringify(x)); }
    var vraiFetch = window.fetch.bind(window);
    window.fetch = function (url, o) {
        if (String(url).indexOf('key=roles_permissions') >= 0) return Promise.resolve({ json: function () { return Promise.resolve({ value: '' }); } });
        if (!o || o.method !== 'POST') return vraiFetch(url, o);      // data/machines.json : le vrai fichier
        var b = JSON.parse((o && o.body) || '{}'), r;
        window.__appels.push(b.action === 'uploadinstphoto' ? { action: b.action, taille: (b.data || '').length } : b);
        if (JSON.parse(%(user)s).role === 'dealer' && /inst/.test(b.action)) r = { error: 'forbidden' };   // case Soutien tech. decochee
        else if (b.action === 'getinst') r = { ok: true, peutValider: S.valideur, nom: 'Testeur', notes: S.notes.map(vue) };
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
        // window.__lent (ms) : reponse de saveinst retardee, pour le test d'enregistrements qui se chevauchent
        if (b.action === 'saveinst' && window.__lent) return new Promise(function (ok) { setTimeout(function () { ok({ json: function () { return Promise.resolve(r); } }); }, window.__lent); });
        return Promise.resolve({ json: function () { return Promise.resolve(r); } });
    };
    window.confirm = function () { return true; };
"""


def navigateur(role, valideur=False, notes=None, page=PAGE, lang='fr', photos=None):
    o = Options()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1300,1600')
    o.add_argument('--allow-file-access-from-files')     # fetch de data/machines.json en file://
    o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    d = webdriver.Chrome(options=o)
    user = {'token': 'TOK', 'role': role, 'name': 'Testeur', 'email': 't@e'}
    d.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': SERVEUR % {
        'user': json.dumps(json.dumps(user)), 'lang': json.dumps(lang), 'notes': json.dumps(notes or []),
        'valideur': 'true' if valideur else 'false', 'photos': json.dumps(photos or {})}})
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
    # Case Soutien tech. (Steve, 2026-10-29) : distributeur coche par defaut, dealer decoche.
    d = navigateur('dealer')
    v('dealer (case decochee) : refus du serveur -> banque refusee', d.find_element(By.ID, 'in-denied').is_displayed() and not d.find_element(By.ID, 'in-root').is_displayed())
    d.quit()
    d = navigateur('dealer', page=SOUTIEN)
    v('dealer (case decochee) : Soutien technique refuse', d.find_element(By.ID, 'st-denied').is_displayed() and not d.find_element(By.ID, 'st-root').is_displayed())
    d.quit()
    d = navigateur('distributeur', page=SOUTIEN)
    v('distributeur : Soutien technique ouvert', d.find_element(By.ID, 'st-root').is_displayed())
    d.quit()
    d = navigateur('distributeur', notes=[EXEMPLE])
    v('distributeur : banque ouverte, note visible, bouton Nouvelle note', d.find_element(By.ID, 'in-root').is_displayed() and len(titres(d)) == 1
      and d.find_element(By.ID, 'b-nouvelle').is_displayed())
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

    print('5) Fabricant / Modele : menu et filtre dans une case (Steve, 2026-11-09)')
    d = navigateur('technicien', notes=[EXEMPLE, HORS_BASE])
    try:
        cases = d.execute_script("return ['f-fab','f-modele','e-fab','e-modele'].map(i=>!!document.getElementById(i+'-filtre') && document.getElementById(i).classList.contains('select-cache'))")
        v('4 cases filtrables, menus caches', cases == [True] * 4, cases)
        v('Type et Produit restent des menus simples', d.execute_script("return !document.getElementById('f-type-filtre') && !document.getElementById('f-produit-filtre')"))
        v('case vide : invite Tous les fabricants', d.find_element(By.ID, 'f-fab-filtre').get_attribute('placeholder').startswith('Tous les fabricants'))
        choisir(d, 'f-type', 'Excavatrice')
        f = d.find_element(By.ID, 'f-fab-filtre')
        f.click(); f.send_keys('hita')
        time.sleep(0.3)
        items = d.execute_script("return [...document.querySelectorAll('#f-fab-resultats .filtre-item')].map(l=>l.textContent)")
        v('taper « hita » : Hitachi, puis « Autres (hors base) » au bout', items == ['Hitachi', 'Autres (hors base)'], items)
        d.find_element(By.CSS_SELECTOR, '#f-fab-resultats .filtre-item').click()
        time.sleep(0.3)
        v('choix : le vrai menu prend Hitachi, la case affiche le choix', d.execute_script("return document.getElementById('f-fab').value") == 'Hitachi'
          and f.get_attribute('value') == 'Hitachi')
        m = d.find_element(By.ID, 'f-modele-filtre')
        m.click(); m.send_keys('490')
        time.sleep(0.3)
        items = d.execute_script("return [...document.querySelectorAll('#f-modele-resultats .filtre-item')].map(l=>l.dataset.valeur)")
        v('taper « 490 » : les ZX490 (sans « Autres »… en tete)', items[:3] == ['ZX490LC-5', 'ZX490LC-6', 'ZX490LC-7'], items)
        m.clear(); m.send_keys('490lc-7h')
        time.sleep(0.3)
        items = d.execute_script("return [...document.querySelectorAll('#f-modele-resultats .filtre-item')].map(l=>l.dataset.valeur)")
        v('taper « 490lc-7h » trouve ZX490LC-7 (texte ZX490LC-7H)', items[0] == 'ZX490LC-7', items)
        d.find_element(By.CSS_SELECTOR, '#f-modele-resultats .filtre-item').click()
        time.sleep(0.3)
        v('modele choisi', d.execute_script("return document.getElementById('f-modele').value") == 'ZX490LC-7')
        choisir(d, 'f-type', '')
        time.sleep(0.3)
        v('type remis a Tous : cases Fabricant et Modele videes', d.find_element(By.ID, 'f-fab-filtre').get_attribute('value') == ''
          and d.find_element(By.ID, 'f-modele-filtre').get_attribute('value') == '')
        choisir(d, 'f-type', '__autre')
        time.sleep(0.3)
        v('« Autres (hors base) » affiche dans la case Type... et Fabricant reste filtrable', d.find_element(By.ID, 'f-fab-filtre').is_enabled())
        choisir(d, 'f-type', '')
        d.find_element(By.ID, 'b-nouvelle').click()
        time.sleep(0.4)
        choisir(d, 'e-type', 'Excavatrice')
        e = d.find_element(By.ID, 'e-fab-filtre')
        e.click(); e.send_keys('hitachi')
        time.sleep(0.3)
        it = d.execute_script("return [...document.querySelectorAll('#e-fab-resultats .filtre-item')].map(l=>l.textContent)")
        v('formulaire : « Autre… » toujours au bout de la liste', it[-1] == 'Autre…', it)
        d.find_element(By.CSS_SELECTOR, '#e-fab-resultats .filtre-item').click()
        time.sleep(0.3)
        em = d.find_element(By.ID, 'e-modele-filtre')
        em.click(); em.send_keys('zx490lc6')
        time.sleep(0.3)
        d.find_element(By.CSS_SELECTOR, '#e-modele-resultats .filtre-item').click()
        time.sleep(0.3)
        v('formulaire : Hitachi ZX490LC-6 choisis au clavier', d.execute_script("return [document.getElementById('e-fab').value, document.getElementById('e-modele').value]") == ['Hitachi', 'ZX490LC-6'])
        em.click(); em.send_keys('zzz')
        time.sleep(0.3)
        d.find_element(By.CSS_SELECTOR, '#e-modele-resultats .filtre-autre').click()
        time.sleep(0.3)
        v('« Autre… » choisi : la case le montre et la case a preciser apparait', em.get_attribute('value') == 'Autre…'
          and d.find_element(By.ID, 'e-modele-autre').is_displayed())
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()
    d = navigateur('technicien', notes=[EXEMPLE], lang='en')
    try:
        v('anglais : invite All manufacturers', d.find_element(By.ID, 'f-fab-filtre').get_attribute('placeholder').startswith('All manufacturers'))
        f = d.find_element(By.ID, 'f-fab-filtre')
        f.click(); f.send_keys('hit')
        time.sleep(0.3)
        ent = d.execute_script("return document.querySelector('#f-fab-resultats .filtre-entete').textContent")
        v('anglais : en-tete de la liste filtree', 'manufacturer' in ent, ent)
    finally:
        d.quit()

    print('6) Fiches en double (Steve, 2026-11-10)')
    AUTRE_FICHE = dict(EXEMPLE, id='v3', fabricant='Hitachi', modele='ZX490LC-6', option='')
    d = navigateur('technicien', valideur=True, notes=[EXEMPLE, AUTRE_FICHE])
    try:
        d.find_element(By.ID, 'b-nouvelle').click()
        time.sleep(0.4)
        choisir(d, 'e-type', 'Excavatrice'); choisir(d, 'e-fab', 'Case'); choisir(d, 'e-modele', 'CX19')
        choisir(d, 'e-produit', 'limiteur'); choisir(d, 'e-option', 'hauteur_rotation')
        time.sleep(0.3)
        z = d.find_element(By.ID, 'e-doublon')
        v('avis des le choix de la machine et du produit', z.is_displayed() and 'existe déjà' in z.text and 'Case CX19' in z.text, z.text)
        v('avis : lien vers la fiche existante', d.execute_script("var a=document.querySelector('#e-doublon a[data-fiche]'); return a && a.dataset.fiche==='v1' && /[?]fiche=v1$/.test(a.getAttribute('href'))"))
        choisir(d, 'e-option', 'hauteur')
        time.sleep(0.3)
        v("autre option : plus d'avis", not z.is_displayed())
        choisir(d, 'e-option', 'hauteur_rotation')
        d.find_element(By.ID, 'e-texte').send_keys('Doublon')
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.6)
        v('Enregistrer : rien envoye au serveur', not appels(d, 'saveinst'))
        al = d.find_element(By.ID, 'e-alert')
        v('Enregistrer : message au demandeur avec le lien', al.is_displayed() and 'modifiez la fiche originale' in al.text
          and d.execute_script("return !!document.querySelector('#e-alert a[data-fiche=\"v1\"]')"), al.text)
        d.find_element(By.CSS_SELECTOR, '#e-alert a[data-fiche]').click()
        time.sleep(0.6)
        v('lien : retour a la liste, fiche originale ouverte', d.find_element(By.ID, 'in-vue-liste').is_displayed()
          and d.execute_script("return [...document.querySelectorAll('.in-card.open')].map(c=>c.dataset.id)") == ['v1'])
        v('lien : adresse ?fiche=v1 (partageable)', d.execute_script("return location.search") == '?fiche=v1')
        d.execute_script("document.querySelector('.in-card[data-id=\"v1\"] [data-act=modifier]').click()")
        time.sleep(0.4)
        v("modifier l'originale : aucun avis de doublon", not d.find_element(By.ID, 'e-doublon').is_displayed())
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.6)
        s6 = appels(d, 'saveinst')
        v("modifier l'originale : enregistree sur la meme fiche", len(s6) == 1 and s6[0]['note'].get('id') == 'v1', s6)
        # Enregistrement lent + autre fiche ouverte avant la reponse (cause du doublon PC138)
        d.execute_script("window.__lent = 1500")
        d.execute_script("document.querySelector('.in-card[data-id=\"v1\"] [data-act=modifier]').click()")
        time.sleep(0.4)
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.2)
        d.execute_script("document.querySelector('.in-card[data-id=\"v3\"] [data-act=modifier]').click()")
        time.sleep(0.3)
        v('enregistrement en cours : autre fiche refusee, message', d.find_element(By.ID, 'in-ok').is_displayed()
          and 'Enregistrement en cours' in d.find_element(By.ID, 'in-ok').text)
        time.sleep(2.0)
        v('apres la reponse : toujours 2 fiches, aucune creee', len(titres(d)) == 2 and len(appels(d, 'saveinst')) == 2
          and all(a['note'].get('id') == 'v1' for a in appels(d, 'saveinst')), titres(d))
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()
    d = navigateur('technicien', notes=[EXEMPLE, AUTRE_FICHE], page=PAGE + '?fiche=v3')
    try:
        v("lien direct ?fiche=v3 : la fiche s'ouvre", d.execute_script("return [...document.querySelectorAll('.in-card.open')].map(c=>c.dataset.id)") == ['v3'])
    finally:
        d.quit()

    print('7) Galerie : photo precedente / suivante sans fermer (Steve, 2026-11-10)')
    import base64, io
    def jpeg(c):
        b = io.BytesIO(); Image.new('RGB', (40, 30), c).save(b, 'JPEG'); return base64.b64encode(b.getvalue()).decode()
    PH = {'PHOTO_A0000001': jpeg('red'), 'PHOTO_B0000002': jpeg('green'), 'PHOTO_C0000003': jpeg('blue')}
    AVEC = dict(EXEMPLE, photos=list(PH))
    d = navigateur('technicien', notes=[AVEC], photos=PH)
    try:
        d.find_element(By.CSS_SELECTOR, '.in-card .in-head').click()
        time.sleep(1.0)
        src = lambda: d.execute_script("return document.querySelector('#in-boite img').getAttribute('src')||''")
        cpt = lambda: d.find_element(By.ID, 'boite-compteur').text
        vign = d.find_elements(By.CSS_SELECTOR, '.in-card.open .in-photo')
        vign[1].click()
        time.sleep(0.4)
        v('ouverture sur la photo cliquee (2 / 3)', d.find_element(By.ID, 'in-boite').is_displayed() and cpt() == '2 / 3' and PH['PHOTO_B0000002'] in src(), cpt())
        d.find_element(By.ID, 'boite-suiv').click(); time.sleep(0.3)
        v('fleche suivante : 3 / 3, sans fermer', d.find_element(By.ID, 'in-boite').is_displayed() and cpt() == '3 / 3' and PH['PHOTO_C0000003'] in src(), cpt())
        d.find_element(By.ID, 'boite-suiv').click(); time.sleep(0.3)
        v('apres la derniere : retour a la 1re', cpt() == '1 / 3' and PH['PHOTO_A0000001'] in src(), cpt())
        d.find_element(By.ID, 'boite-prec').click(); time.sleep(0.3)
        v('fleche precedente : 3 / 3', cpt() == '3 / 3', cpt())
        d.find_element(By.TAG_NAME, 'body').send_keys(Keys.ARROW_LEFT); time.sleep(0.3)
        v('clavier fleche gauche : 2 / 3', cpt() == '2 / 3', cpt())
        d.find_element(By.TAG_NAME, 'body').send_keys(Keys.ARROW_RIGHT); time.sleep(0.3)
        v('clavier fleche droite : 3 / 3', cpt() == '3 / 3', cpt())
        tr = lambda: d.execute_script("return document.querySelector('#in-boite img').style.transform")
        d.find_element(By.ID, 'boite-zplus').click(); time.sleep(0.2)
        v('bouton + : photo agrandie (scale 1.5)', 'scale(1.5)' in tr(), tr())
        d.find_element(By.ID, 'boite-zplus').click(); time.sleep(0.2)
        d.find_element(By.ID, 'boite-zmoins').click(); time.sleep(0.2)
        v('bouton - : revient a 1.5', 'scale(1.5)' in tr(), tr())
        d.execute_script("var i=document.querySelector('#in-boite img'),r=i.getBoundingClientRect();i.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}))")
        time.sleep(0.2)
        v('molette : zoom plus fort (1.8)', 'scale(1.8)' in tr(), tr())
        d.find_element(By.ID, 'boite-suiv').click(); time.sleep(0.3)
        v('photo suivante : zoom remis a zero', tr() == '' and cpt() == '1 / 3', tr())
        d.execute_script("var i=document.querySelector('#in-boite img'),r=i.getBoundingClientRect();i.dispatchEvent(new MouseEvent('dblclick',{clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true}))")
        time.sleep(0.2)
        v('double-clic : zoom 2.5', 'scale(2.5)' in tr(), tr())
        d.execute_script("var i=document.querySelector('#in-boite img'),r=i.getBoundingClientRect();i.dispatchEvent(new MouseEvent('dblclick',{clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true}))")
        time.sleep(0.2)
        v('2e double-clic : retour a la taille normale', tr() == '', tr())
        d.find_element(By.CSS_SELECTOR, '#in-boite img').click(); time.sleep(0.2)
        v('clic sur la photo : ne ferme pas', d.find_element(By.ID, 'in-boite').is_displayed())
        d.find_element(By.ID, 'boite-ferme').click(); time.sleep(0.3)
        v('bouton X : ferme', not d.find_element(By.ID, 'in-boite').is_displayed())
        vign[0].click(); time.sleep(0.3)
        d.find_element(By.TAG_NAME, 'body').send_keys(Keys.ESCAPE); time.sleep(0.3)
        v('Echap : ferme', not d.find_element(By.ID, 'in-boite').is_displayed())
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()
    UNE = dict(EXEMPLE, photos=['PHOTO_A0000001'])
    d = navigateur('technicien', notes=[UNE], photos={'PHOTO_A0000001': PH['PHOTO_A0000001']})
    try:
        d.find_element(By.CSS_SELECTOR, '.in-card .in-head').click(); time.sleep(1.0)
        d.find_element(By.CSS_SELECTOR, '.in-card.open .in-photo').click(); time.sleep(0.3)
        v('une seule photo : pas de fleches ni de compteur', not d.find_element(By.ID, 'boite-prec').is_displayed()
          and not d.find_element(By.ID, 'boite-suiv').is_displayed() and not d.find_element(By.ID, 'boite-compteur').is_displayed())
    finally:
        d.quit()

    print('8) Vider un champ efface aussi la traduction cachee (Steve, 2026-11-10)')
    for lang, champ, autre in (('fr', 'e-pieges', 'en'), ('en', 'e-pieges-en', 'fr')):
        d = navigateur('technicien', valideur=True, notes=[EXEMPLE], lang=lang)
        try:
            d.execute_script("document.querySelector('.in-card [data-act=modifier]').click()")
            time.sleep(0.5)
            d.find_element(By.ID, champ).clear()
            d.find_element(By.ID, 'b-enreg').click(); time.sleep(0.6)
            s8 = appels(d, 'saveinst'); n8 = s8[0]['note'] if s8 else {}
            v(lang + ' : pieges vides dans les 2 langues', n8.get('pieges') == '' and n8.get('en', {}).get('pieges') == '', n8.get('pieges', '?') + ' | ' + n8.get('en', {}).get('pieges', '?'))
            v(lang + ' : informations intactes', n8.get('texte') == EXEMPLE['texte'] and n8.get('en', {}).get('texte') == EXEMPLE['en']['texte'])
        finally:
            d.quit()

    print('9) Proposition de modification : ce qui change (Steve, 2026-11-10)')
    import base64 as _b, io as _io
    def _j(c):
        bb = _io.BytesIO(); Image.new('RGB', (40, 30), c).save(bb, 'JPEG'); return _b.b64encode(bb.getvalue()).decode()
    PH9 = {'PHOTO_A0000001': _j('red'), 'PHOTO_B0000002': _j('green'), 'PHOTO_C0000003': _j('blue')}
    ORIG = dict(EXEMPLE, photos=['PHOTO_A0000001', 'PHOTO_B0000002'])
    PROP = dict(EXEMPLE, id='p1', statut='brouillon', remplace='v1', temps='7 h', photos=['PHOTO_A0000001', 'PHOTO_C0000003'],
                texte='Installer le capteur sur la flèche avec deux boulons', pieges='',
                pieces=[{'txt': 'Z03B-0041 — Harnais', 'qte': '2'}], en=dict(EXEMPLE['en'], pieges=''))
    d = navigateur('technicien', valideur=True, notes=[ORIG, PROP], photos=PH9)
    try:
        d.execute_script("document.querySelector('.in-card[data-id=\"p1\"] .in-head').click()")
        time.sleep(1.0)
        bloc = d.find_elements(By.CSS_SELECTOR, '.in-card[data-id="p1"] .in-diff')
        tx9 = bloc[0].text if bloc else ''
        v('bloc des changements visible sur la proposition', len(bloc) == 1 and 'Ce qui change' in tx9, tx9[:200])
        v('resume : temps 6 h -> 7 h', '6 h' in tx9 and '7 h' in tx9)
        v('resume : informations, mots ajoutes', 'Informations' in tx9 and 'ajouté' in tx9)
        v('resume : pieges retires', 'Pièges connus' in tx9)
        v('resume : photos 1 ajoutee, 1 retiree', '1 ajoutée(s), 1 retirée(s)' in tx9, tx9)
        v('resume : piece modifiee (qte 1 -> 2)', 'Pièces' in tx9)
        ins = d.execute_script("return [...document.querySelectorAll('.in-card[data-id=\"p1\"] .in-diff ins')].map(x=>x.textContent).join('|')")
        v('texte ajoute en vert (ins)', 'deux boulons' in ins, ins)
        v('photo ajoutee (vert) et retiree (rouge)', d.execute_script("return [document.querySelectorAll('.in-card[data-id=\"p1\"] .in-diff .in-photo.ajout').length, document.querySelectorAll('.in-card[data-id=\"p1\"] .in-diff .in-photo.retrait').length]") == [1, 1])
        d.execute_script("document.querySelector('.in-card[data-id=\"v1\"] .in-head').click()")
        time.sleep(0.5)
        v('fiche publiee : pas de bloc de changements', not d.find_elements(By.CSS_SELECTOR, '.in-card[data-id="v1"] .in-diff'))
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()

    print('10) Validateur : case « Envoyer comme proposition » (Steve, 2026-11-13)')
    d = navigateur('technicien', valideur=True, notes=[EXEMPLE])
    try:
        d.execute_script("document.querySelector('.in-card[data-id=\"v1\"] .in-head').click()")
        time.sleep(0.5)
        d.execute_script("[...document.querySelectorAll('.in-card[data-id=\"v1\"] button')].find(b=>b.dataset.act==='modifier').click()")
        time.sleep(0.6)
        zone = d.find_element(By.ID, 'e-proposer-zone')
        v('validateur : case visible et decochee', zone.is_displayed() and not d.find_element(By.ID, 'e-proposer').is_selected())
        v('note : publiee des enregistrement', 'publiée dès' in d.find_element(By.ID, 'e-note').text)
        d.find_element(By.ID, 'e-proposer').click()
        time.sleep(0.2)
        v('cochee : la note dit que original reste affiche', 'reste affichée' in d.find_element(By.ID, 'e-note').text, d.find_element(By.ID, 'e-note').text)
        d.find_element(By.ID, 'b-enreg').click()
        time.sleep(0.8)
        s10 = appels(d, 'saveinst')
        v('envoye avec proposer:true', len(s10) == 1 and s10[0].get('proposer') is True, s10[-1:] and {k: s10[-1].get(k) for k in ('proposer',)})
        d.find_element(By.ID, 'b-nouvelle').click()
        time.sleep(0.4)
        v('nouvelle edition : case remise decochee', not d.find_element(By.ID, 'e-proposer').is_selected())
        v('aucune erreur JS', not severes(d), severes(d))
    finally:
        d.quit()
    d = navigateur('technicien', valideur=False, notes=[EXEMPLE])
    try:
        d.find_element(By.ID, 'b-nouvelle').click()
        time.sleep(0.4)
        v('technicien : pas de case', not d.find_element(By.ID, 'e-proposer-zone').is_displayed())
        d.find_element(By.ID, 'e-texte').send_keys('x')
    finally:
        d.quit()

    print()
    print('RESULTAT: %s (%d OK, %d ECHEC)' % ('OK' if not ko else 'ECHEC', len(ok), len(ko)))
    sys.exit(1 if ko else 0)


if __name__ == '__main__':
    main()
