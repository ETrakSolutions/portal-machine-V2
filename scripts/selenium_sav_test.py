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
    'produits': ['LIMIT-ELG', 'LIMIT-ELN', 'LIMIT-ELP', 'Guide-Pro', 'IDC', 'Scale-Pro / Lite', 'Autre'],
    'routage': [{'cle': 'mathieu', 'nom': 'Mathieu Robillard', 'courriel': '', 'regle': 'Machine arrêtée'},
                {'cle': 'steve', 'nom': 'Steve Martineau', 'courriel': 'steve@test', 'regle': 'Pièce'},
                {'cle': 'luna', 'nom': 'Luna Briceno', 'courriel': 'luna@test', 'regle': 'Déplacement'},
                {'cle': 'compta', 'nom': 'Comptabilité', 'courriel': '', 'regle': 'Facturation'},
                {'cle': 'kevin', 'nom': 'Kevin Bérubé', 'courriel': 'kevin@test', 'regle': 'Directeur de service'}],
    'cc': ['kevin@test'],
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
        v('7 produits en cases', len(d.find_elements(By.CSS_SELECTOR, '#f-produits input')) == 7)

        print('2) Client')
        items = choisir(d, 'f-compagnie', 'waj lav', 'Laval')
        v('recherche « waj lav » : une seule succursale + nouveau client', len(items) == 2 and 'Laval' in items[0], items)
        v('client choisi : nom rempli', d.find_element(By.ID, 'f-compagnie').get_attribute('value') == 'Wajax Limitée - Laval')
        v('type deduit : Dealer coche', d.find_element(By.CSS_SELECTOR, 'input[name=f-type][value=dealer]').is_selected())
        v('champ client final visible pour un dealer', d.find_element(By.ID, 'w-final').is_displayed())
        v('lieu pre-rempli par la ville', d.find_element(By.ID, 'f-lieu').get_attribute('value') == 'Laval, QC')
        items = choisir(d, 'f-compagnie', 'gravier', 'Gravier')
        v('changement de client : Client direct coche', d.find_element(By.CSS_SELECTOR, 'input[name=f-type][value=direct]').is_selected())
        el = d.find_element(By.ID, 'f-compagnie'); el.clear(); el.send_keys('Nouvelle Excavation Inc'); time.sleep(0.4)
        v('nom inconnu : marque « nouveau client »', 'nouveau client' in d.find_element(By.ID, 'f-type-tag').text)
        choisir(d, 'f-compagnie', 'gravier dun', 'Gravier')

        print('3) Routage et pieces')
        rt = lambda: d.execute_script("var r=document.querySelector('input[name=f-routage]:checked');return r&&r.value")
        v('sans indice : Mathieu suggere, sans courriel -> repli sur Kevin', rt() == 'kevin'
          and 'Mathieu Robillard' in d.find_element(By.ID, 'f-routage-hint').text, rt())
        v('Mathieu et Compta desactives (courriel a completer)',
          d.find_element(By.CSS_SELECTOR, 'input[name=f-routage][value=mathieu]').get_attribute('disabled') is not None
          and d.find_element(By.CSS_SELECTOR, 'input[name=f-routage][value=compta]').get_attribute('disabled') is not None)
        d.find_element(By.ID, 'b-piece').click(); time.sleep(0.2)
        p = d.find_element(By.CSS_SELECTOR, '#f-pieces .p-pn')
        p.send_keys('E03A'); time.sleep(0.4)
        d.execute_script("document.querySelector('#f-pieces .sav-ac-list div').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))")
        time.sleep(0.3)
        v('piece choisie : numero + description', p.get_attribute('value').startswith('E03A-0013 — Câble'), p.get_attribute('value'))
        v('une piece -> Steve suggere', rt() == 'steve', rt())
        d.find_element(By.CSS_SELECTOR, 'input[name=f-depl][value=oui]').click()
        v('deplacement -> Luna suggeree', rt() == 'luna', rt())
        d.find_element(By.CSS_SELECTOR, 'input[name=f-bypass][value=oui]').click()
        v('bypass -> Mathieu, repli Kevin', rt() == 'kevin', rt())
        d.find_element(By.CSS_SELECTOR, 'input[name=f-routage][value=steve]').click()
        d.find_element(By.CSS_SELECTOR, 'input[name=f-arret][value=non]').click()
        v('choix manuel respecte (Steve reste coche)', rt() == 'steve', rt())

        print('4) Validation et envoi')
        d.find_element(By.ID, 'b-envoyer').click(); time.sleep(0.3)
        alerte = d.find_element(By.ID, 'sav-alert').text
        v('envoi refuse tant que manquent contact, tel, produit, description',
          all(x in alerte for x in ('nom du contact', 'téléphone', 'produit', 'description'))
          and not d.execute_script('return window.__mailto'), alerte)
        d.find_element(By.ID, 'f-contact').send_keys('Marc Girard')
        d.find_element(By.ID, 'f-tel').send_keys('819-555-0101')
        d.find_element(By.CSS_SELECTOR, '#f-produits input[value="LIMIT-ELG"]').click()
        d.find_element(By.ID, 'f-desc').send_keys('Besoin pièces E03A-0013, câble M12 3 m.')
        d.find_element(By.ID, 'f-rappel').send_keys('avant 14 h')
        d.find_element(By.ID, 'b-envoyer').click(); time.sleep(0.5)
        u = d.execute_script('return window.__mailto') or ''
        v('courriel ouvert', u.startswith('mailto:'), u[:60])
        q = urllib.parse.urlparse(u)
        dest = urllib.parse.unquote(q.path)
        prm = urllib.parse.parse_qs(q.query)
        corps = (prm.get('body') or [''])[0]
        v('destinataire = Steve', dest == 'steve@test', dest)
        v('copie = Kevin', (prm.get('cc') or [''])[0] == 'kevin@test', prm.get('cc'))
        v('sujet : URGENT (bypass) + compagnie + produit',
          (prm.get('subject') or [''])[0] == 'SAV — URGENT — Gravier Duncan Simard — LIMIT-ELG', prm.get('subject'))
        v('corps : client, contact, piece, bypass, routage, rappel',
          all(x in corps for x in ('Compagnie : Gravier Duncan Simard', 'Contact : Marc Girard', '1 × E03A-0013',
                                   'Demande de bypass : OUI', 'Assigné à : Steve Martineau', 'Rappel promis : avant 14 h')), corps[:200])
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
