"""Test navigateur de la page SAV (sav.html), serveur SIMULE — aucun appel reseau.

Le fetch vers le backend est remplace avant le chargement de la page par une reponse
fabriquee (clients et pieces fictifs + E03A-0013), et l'ouverture du courriel est
interceptee (window.__savMailto). Controle le flux complet : acces, recherche client,
type deduit, pieces, suggestion de routage, repli sur Kevin, validation, fiche et lien
mailto (destinataire, copie, sujet, corps).

    py -3.13 scripts/selenium_sav_test.py
"""
import json
import sys
import time
import urllib.parse
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

PAGE = (Path(__file__).resolve().parent.parent / 'sav.html').as_uri()
SAV = {
    'updated': '2026-09-29T15:00:00Z',
    'clients': [['Gravier Duncan Simard', 'Saint-Ferdinand', 'QC', 'direct'],
                ['Wajax Limitée - Laval', 'Laval', 'QC', 'dealer'],
                ['Wajax Limitée - Chambly', 'Chambly', 'QC', 'dealer'],
                ['Prospect Sans Groupe', 'Rimouski', 'QC', '']],
    'pieces': [['E03A-0013', 'Câble Can Femelle et male M12, 5 pôles - 3m, 2 Connecteurs M12'],
               ['C01A-0005-73-360-0-250', 'Inclino e-trak 73 360 pos 0']],
    # Liste de Steve du 2026-10-07, dans l'ordre des 3 colonnes lues de haut en bas.
    'produits': ["Limiteur d'excavatrice", 'Creusage 2D', 'Indicateur de charge', 'Limiteur de rétrocaveuse',
                 'Limiteur de pompe à béton', 'Limiteur de téléhandler', 'Limiteur de camion girafe', 'Limiteur de camion Vac',
                 'Limiteur de nacelle', 'Limiteur de grue', 'Limiteur de foreuse', 'Balance', 'Caméras', 'Autre'],
    'routage': [{'cle': 'mathieu', 'nom': 'Mathieu Robillard', 'courriel': '', 'regle': 'Machine arrêtée'},
                {'cle': 'steve', 'nom': 'Steve Martineau', 'courriel': 'steve@test', 'regle': 'Pièce'},
                {'cle': 'luna', 'nom': 'Luna Briceno', 'courriel': 'luna@test', 'regle': 'Déplacement'},
                {'cle': 'compta', 'nom': 'Comptabilité', 'courriel': '', 'regle': 'Facturation'},
                {'cle': 'kevin', 'nom': 'Kevin Bérubé', 'courriel': 'kevin@test', 'regle': 'Directeur de service'}],
    'cc': ['kevin@test'],
    'contacts': {'Gravier Duncan Simard': [['Marc Girard', 'Contremaître', '819-555-0101', 'mgirard@test'],
                                           ['Julie Roy', '', '819-555-0102', '']],
                 # complete par Salesforce (2026-10-07) : la source est dans la fonction
                 'Wajax Limitée - Chambly': [['Paul Test', 'Gérant de service · Salesforce', '450-555-0100', 'ptest@test']]},
}
ok, ko = [], []


def v(nom, cond, det=''):
    (ok if cond else ko).append(nom)
    print(('  OK    ' if cond else '  ECHEC ') + nom + (('  — ' + str(det)) if det else ''))


def navigateur(role):
    o = Options()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1300,1600')
    o.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    d = webdriver.Chrome(options=o)
    user = {'token': 'TOK', 'role': role, 'name': 'Testeur Interne', 'email': 't@e'}
    d.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': """
        localStorage.setItem('portal_user', %s);
        window.__appels = [];
        window.fetch = function (url, o) {
            var b = JSON.parse((o && o.body) || '{}'); window.__appels.push(b.action);
            var r = b.action === 'getsav' ? { ok: true, sav: %s } : { ok: true };
            return Promise.resolve({ json: function () { return Promise.resolve(r); } });
        };
        window.__savMailto = function (u) { window.__mailto = u; };
    """ % (json.dumps(json.dumps(user)), json.dumps(SAV))})
    d.get(PAGE)
    time.sleep(1.5)
    return d


def choisir(d, champ_id, texte, attendu):
    el = d.find_element(By.ID, champ_id) if champ_id else champ_id
    el.clear()
    el.send_keys(texte)
    time.sleep(0.4)
    items = d.execute_script("return [...arguments[0].parentElement.querySelectorAll('.sav-ac-list div')].map(x=>x.innerText)", el)
    cible = [i for i, t in enumerate(items) if attendu in t]
    if cible:
        d.execute_script("arguments[0].parentElement.querySelectorAll('.sav-ac-list div')[arguments[1]]"
                         ".dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))", el, cible[0])
        time.sleep(0.3)
    return items


def main():
    print('1) Acces')
    d = navigateur('dealer')
    v('dealer : page refusee', d.find_element(By.ID, 'sav-denied').is_displayed()
      and not d.find_element(By.ID, 'sav-root').is_displayed())
    d.quit()

    d = navigateur('technicien')
    try:
        v('technicien : page ouverte', d.find_element(By.ID, 'sav-root').is_displayed())
        v('liste demandee au serveur (getsav)', 'getsav' in d.execute_script('return window.__appels'))
        v('bandeau : nombre de clients et de pieces', '4 clients et 2 pièces' in d.find_element(By.ID, 'sav-load').text,
          d.find_element(By.ID, 'sav-load').text)
        v('recu par = personne connectee', d.find_element(By.ID, 'f-recu').get_attribute('value') == 'Testeur Interne')
        v('14 produits en cases', len(d.find_elements(By.CSS_SELECTOR, '#f-produits input')) == 14)
        pos = d.execute_script("return [...document.querySelectorAll('#f-produits label')].map(l => [l.innerText.trim(), Math.round(l.getBoundingClientRect().left), Math.round(l.getBoundingClientRect().top)])")
        xs = sorted({x for _, x, _ in pos})
        col = lambda t: [x for n, x, _ in pos if n == t][0]
        row = lambda t: [y for n, _, y in pos if n == t][0]
        v('3 colonnes alignees', len(xs) == 3, xs)
        v('colonne 1 : excavatrice a pompe a beton ; colonne 2 : telehandler a grue ; colonne 3 : foreuse, balance, cameras',
          col("Limiteur d'excavatrice") == col('Limiteur de pompe à béton') == xs[0]
          and col('Limiteur de téléhandler') == col('Limiteur de grue') == xs[1]
          and col('Limiteur de foreuse') == col('Caméras') == xs[2], pos)
        v('« Autre » en bas de la 3e colonne, sur la rangee de « pompe a beton »',
          col('Autre') == xs[2] and row('Autre') == row('Limiteur de pompe à béton'), pos)
        v('champ « Precisez Autre » cache au depart', not d.find_element(By.ID, 'w-autre').is_displayed())

        print('2) Client')
        d.find_element(By.ID, 'f-contact').send_keys('Avant')
        items = choisir(d, 'f-compagnie', 'waj lav', 'Laval')
        v('premier choix de client : le contact deja tape reste', d.find_element(By.ID, 'f-contact').get_attribute('value') == 'Avant')
        v('recherche « waj lav » : une seule succursale + nouveau client', len(items) == 2 and 'Laval' in items[0], items)
        v('client choisi : nom rempli', d.find_element(By.ID, 'f-compagnie').get_attribute('value') == 'Wajax Limitée - Laval')
        v('type deduit : Dealer coche', d.find_element(By.CSS_SELECTOR, 'input[name=f-type][value=dealer]').is_selected())
        v('champ client final visible pour un dealer', d.find_element(By.ID, 'w-final').is_displayed())
        v('lieu PAS pre-rempli par la ville (chantiers ailleurs, Steve 2026-10-07)', d.find_element(By.ID, 'f-lieu').get_attribute('value') == '')
        v('client sans contact Epicor : zone contacts masquee', not d.find_element(By.ID, 'w-contacts').is_displayed())
        choisir(d, 'f-compagnie', 'waj cham', 'Chambly')
        btn = d.find_elements(By.CSS_SELECTOR, '#f-contacts button')
        lab = d.find_element(By.CSS_SELECTOR, '#w-contacts label').text
        v('contact Salesforce : propose et marque comme tel', len(btn) == 1 and 'Salesforce' in btn[0].text
          and 'Salesforce' in lab, [b.text for b in btn] + [lab])
        btn[0].click(); time.sleep(0.2)
        v('clic sur le contact Salesforce : nom, telephone, courriel remplis',
          [d.find_element(By.ID, i).get_attribute('value') for i in ('f-contact', 'f-tel', 'f-courriel')]
          == ['Paul Test', '450-555-0100', 'ptest@test'])
        for i in ('f-contact', 'f-tel', 'f-courriel'): d.find_element(By.ID, i).clear()
        items = choisir(d, 'f-compagnie', 'gravier', 'Gravier')
        btn = d.find_elements(By.CSS_SELECTOR, '#f-contacts button')
        v('client avec contacts : 2 contacts proposes', d.find_element(By.ID, 'w-contacts').is_displayed() and len(btn) == 2,
          [b.text for b in btn])
        v('rien de rempli tant qu on ne clique pas', d.find_element(By.ID, 'f-contact').get_attribute('value') == '')
        btn[0].click(); time.sleep(0.2)
        v('clic : nom, telephone, courriel remplis', [d.find_element(By.ID, i).get_attribute('value') for i in ('f-contact', 'f-tel', 'f-courriel')]
          == ['Marc Girard', '819-555-0101', 'mgirard@test'])
        for i in ('f-contact', 'f-tel', 'f-courriel'): d.find_element(By.ID, i).clear()
        v('changement de client : Client direct coche', d.find_element(By.CSS_SELECTOR, 'input[name=f-type][value=direct]').is_selected())

        print('2b) Changement de client : contact, telephone, courriel, type et client final vides (Steve, 2026-10-07)')
        champs = ('f-contact', 'f-tel', 'f-courriel', 'f-final')
        lire = lambda: [d.find_element(By.ID, i).get_attribute('value') for i in champs]
        coches = lambda: [r.get_attribute('value') for r in d.find_elements(By.CSS_SELECTOR, 'input[name=f-type]') if r.is_selected()]
        d.find_element(By.ID, 'f-contact').send_keys('Marc Girard'); d.find_element(By.ID, 'f-tel').send_keys('819-555-0101')
        d.find_element(By.ID, 'f-courriel').send_keys('mgirard@test')
        choisir(d, 'f-compagnie', 'waj lav', 'Laval')
        v('Gravier -> Wajax Laval : contact, telephone, courriel vides', lire()[:3] == ['', '', ''], lire())
        v('Gravier -> Wajax Laval : type du NOUVEAU client (Dealer)', coches() == ['dealer'], coches())
        d.find_element(By.ID, 'f-final').send_keys('Client X'); d.find_element(By.ID, 'f-contact').send_keys('Pierre'); d.find_element(By.ID, 'f-lieu').send_keys('Chantier Laval')
        choisir(d, 'f-compagnie', 'waj cham', 'Chambly')
        v('Laval -> Chambly : contact et client final vides', lire() == ['', '', '', ''], lire())
        v('Laval -> Chambly : lieu vide (le lieu tape pour Laval ne reste pas)', d.find_element(By.ID, 'f-lieu').get_attribute('value') == '',
          d.find_element(By.ID, 'f-lieu').get_attribute('value'))
        d.find_element(By.ID, 'f-contact').send_keys('Paul')
        el = d.find_element(By.ID, 'f-compagnie'); el.clear(); el.send_keys('Nouvelle Excavation Inc'); time.sleep(0.4)
        v('client Epicor -> nouveau client tape : contact vide, aucun type coche', lire()[0] == '' and coches() == [], [lire(), coches()])
        v('client Epicor -> nouveau client tape : lieu vide', d.find_element(By.ID, 'f-lieu').get_attribute('value') == '',
          d.find_element(By.ID, 'f-lieu').get_attribute('value'))
        d.find_element(By.ID, 'f-contact').send_keys('Robert')
        el.send_keys(' Ltee'); time.sleep(0.3)
        v('en continuant de taper le nouveau nom : le contact saisi reste', lire()[0] == 'Robert', lire())
        v('nom inconnu : marque « nouveau client »', 'nouveau client' in d.find_element(By.ID, 'f-type-tag').text)
        d.find_element(By.ID, 'f-contact').clear()
        choisir(d, 'f-compagnie', 'gravier dun', 'Gravier')

        print('3) Nom tape sans choisir dans la liste (correctif 2026-09-30)')
        el = d.find_element(By.ID, 'f-compagnie'); el.clear(); time.sleep(0.2)
        el.send_keys('gravier duncan simard'); d.find_element(By.ID, 'f-billet').click(); time.sleep(0.4)
        btn = d.find_elements(By.CSS_SELECTOR, '#f-contacts button')
        v('nom tape au complet (casse ignoree) : contacts proposes', d.find_element(By.ID, 'w-contacts').is_displayed()
          and len(btn) == 2, [b.text for b in btn])
        el.send_keys(' Inc'); time.sleep(0.3)
        v('nom qui ne correspond plus : contacts masques', not d.find_element(By.ID, 'w-contacts').is_displayed())
        choisir(d, 'f-compagnie', 'gravier dun', 'Gravier')

        print('4) Sections 5 et 6 retirees, destinataires fixes')
        titres = [h.text for h in d.find_elements(By.CSS_SELECTOR, '.sav-sec h2')]
        v('4 sections seulement (plus de Routage ni de Suivi)', len(titres) == 4
          and not any(('Routage' in t or 'Suivi' in t) for t in titres), titres)
        v('aucun champ de routage ni de suivi', not d.find_elements(By.CSS_SELECTOR,
          'input[name=f-routage], #f-rappel, #f-action, input[name=f-res], #f-ferme-le, #f-ferme-par'))
        v('destinataires annonces : Kevin et Luna', d.find_element(By.ID, 'f-dest').text
          == 'Le courriel part à : Kevin Bérubé et Luna Briceno.', d.find_element(By.ID, 'f-dest').text)
        d.find_element(By.ID, 'b-piece').click(); time.sleep(0.2)
        p = d.find_element(By.CSS_SELECTOR, '#f-pieces .p-pn')
        p.send_keys('E03A'); time.sleep(0.4)
        d.execute_script("document.querySelector('#f-pieces .sav-ac-list div').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))")
        time.sleep(0.3)
        v('piece choisie : numero + description', p.get_attribute('value').startswith('E03A-0013 — Câble'), p.get_attribute('value'))
        d.find_element(By.CSS_SELECTOR, 'input[name=f-bypass][value=oui]').click()
        d.find_element(By.CSS_SELECTOR, 'input[name=f-arret][value=non]').click()

        print('5) Validation et envoi')
        d.find_element(By.ID, 'b-envoyer').click(); time.sleep(0.3)
        alerte = d.find_element(By.ID, 'sav-alert').text
        v('envoi refuse tant que manquent contact, tel, produit, description',
          all(x in alerte for x in ('nom du contact', 'téléphone', 'produit', 'description'))
          and 'routage' not in alerte and not d.execute_script('return window.__mailto'), alerte)
        d.find_element(By.ID, 'f-contact').send_keys('Marc Girard')
        d.find_element(By.ID, 'f-tel').send_keys('819-555-0101')
        d.find_elements(By.CSS_SELECTOR, '#f-produits input')[0].click()
        d.find_element(By.ID, 'f-desc').send_keys('Besoin pièces E03A-0013, câble M12 3 m.')
        d.find_element(By.CSS_SELECTOR, '#f-produits input[value="Autre"]').click(); time.sleep(0.2)
        v('« Autre » coche : champ de precision affiche', d.find_element(By.ID, 'w-autre').is_displayed())
        d.find_element(By.ID, 'b-envoyer').click(); time.sleep(0.3)
        v('« Autre » sans precision : envoi refuse', 'précision du produit « Autre »' in d.find_element(By.ID, 'sav-alert').text
          and not d.execute_script('return window.__mailto'), d.find_element(By.ID, 'sav-alert').text)
        d.find_element(By.CSS_SELECTOR, '#f-produits input[value="Autre"]').click(); time.sleep(0.2)
        v('« Autre » decoche : champ cache', not d.find_element(By.ID, 'w-autre').is_displayed())
        d.find_element(By.CSS_SELECTOR, '#f-produits input[value="Autre"]').click(); time.sleep(0.2)
        d.find_element(By.ID, 'f-autre').send_keys('Module GPS')
        d.find_element(By.ID, 'b-envoyer').click(); time.sleep(0.5)
        u = d.execute_script('return window.__mailto') or ''
        v('courriel ouvert', u.startswith('mailto:'), u[:60])
        q = urllib.parse.urlparse(u)
        dest = urllib.parse.unquote(q.path)
        prm = urllib.parse.parse_qs(q.query)
        corps = (prm.get('body') or [''])[0]
        v('destinataires = Kevin et Luna, meme avec une piece et un bypass', dest == 'kevin@test,luna@test', dest)
        v('pas de copie en double (Kevin deja destinataire)', not prm.get('cc'), prm.get('cc'))
        v('sujet : URGENT (bypass) + compagnie + produit',
          (prm.get('subject') or [''])[0] == "SAV — URGENT — Gravier Duncan Simard — Limiteur d'excavatrice / Autre : Module GPS", prm.get('subject'))
        v('corps : produits avec la precision de « Autre »', "Produit : Limiteur d'excavatrice, Autre : Module GPS" in corps, corps[:400])
        v('corps : client, contact, piece, bypass ; plus de routage ni de suivi',
          all(x in corps for x in ('Compagnie : Gravier Duncan Simard', 'Contact : Marc Girard', '1 × E03A-0013',
                                   'Demande de bypass : OUI'))
          and not any(x in corps for x in ('ROUTAGE', 'SUIVI', 'Assigné à', 'Rappel promis')), corps[:200])
        v('aucune erreur console', not [l for l in d.get_log('browser') if l['level'] == 'SEVERE'],
          [l['message'][:120] for l in d.get_log('browser') if l['level'] == 'SEVERE'])
        d.save_screenshot(str(Path.home() / 'AppData' / 'Local' / 'Temp' / 'sav_test.png'))
    finally:
        d.quit()
    print('\nRESULTAT : %d/%d' % (len(ok), len(ok) + len(ko)))
    sys.exit(1 if ko else 0)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
