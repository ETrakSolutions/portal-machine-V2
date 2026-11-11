"""Test navigateur de la fiche Reinstallation : codes d'installation par type de machine.

Refonte du 2026-11-11 (Luna) : plus de 1000-1001 ; Limiteur = type de machine + axes ;
pompe = sections cumulatives ; heures de desinstallation saisies.

Page locale (file://), reponse du serveur SIMULEE : les montants viennent des fichiers
maitres sur ce poste (prix-reinstallation.json + liste de prix de l'annee), jamais du
depot. Rien n'est envoye nulle part.

    py -3.13 scripts/selenium_reinst_types_test.py --prix-portail <prix-portail.json de l'annee>
"""
import argparse
import json
import sys
from decimal import Decimal
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / 'scripts'))
import publier_reinst as pub  # noqa: E402

ok = ko = 0


def verif(cond, texte):
    global ok, ko
    if cond:
        ok += 1
        print('  OK  ' + texte)
    else:
        ko += 1
        print('  ECHEC  ' + texte)


def main():
    ap = argparse.ArgumentParser()
    d = pub.dossier_portail()
    ap.add_argument('--fichier', default=str(d / 'prix-reinstallation.json'))
    ap.add_argument('--prix-portail', default=str(d / 'prix-portail.json'))
    a = ap.parse_args()
    m = json.loads(Path(a.fichier).read_text(encoding='utf-8'))
    pub.valider(m)
    prix = {k: v for k, v in m['prix'].items() if k != 'INST_LIM'}
    prix.update(pub.installations_lim(a.prix_portail, prix['MINI']))
    cat = {}
    for lignes in m['pieces'].values():
        for pn, _q, px in lignes:
            cat[pn] = [pn, px]
    rep = {'ok': True, 'reinst': {'prix': prix, 'vigueur': m['vigueur'], 'catalogue': cat}}
    stub = """
      localStorage.setItem('portal_user', JSON.stringify({username:'test', name:'Test', role:'admin', token:'t'}));
      window.fetch = function (url, opt) {
        var b = {}; try { b = JSON.parse(opt && opt.body || '{}'); } catch (e) {}
        var d = b.action === 'getreinst' ? %s : {};
        return Promise.resolve({ json: function () { return Promise.resolve(d); }, ok: true });
      };""" % json.dumps(rep)

    o = webdriver.ChromeOptions()
    o.add_argument('--headless=new')
    o.add_argument('--window-size=1400,1000')
    o.add_argument('--allow-file-access-from-files')
    dr = webdriver.Chrome(options=o)
    dr.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {'source': stub})
    try:
        dr.get((REPO / 'reinstallation.html').as_uri())
        dr.implicitly_wait(3)
        dr.find_element(By.ID, 'ri-lines')
        js = dr.execute_script
        vis = lambda i: js("var e=document.getElementById(arguments[0]); return !!(e && e.offsetParent);", i)
        codes = lambda: js("return Array.from(document.querySelectorAll('#ri-epi-rows code')).map(function(c){return c.textContent;});")
        qte = lambda code: js("var k=arguments[0],r=Array.from(document.querySelectorAll('#ri-epi-rows tr')).filter(function(t){var c=t.querySelector('code');return c&&c.textContent===k;})[0];return r?r.querySelector('.q').textContent:null;", code)
        lignes = lambda: dr.find_element(By.ID, 'ri-lines').text
        cents = lambda v: int((Decimal(str(v)) * 100).to_integral_value())

        def choisir(id_, val):
            Select(dr.find_element(By.ID, id_)).select_by_value(val)

        def total():
            t = js("var r=document.querySelector('#ri-lines tr.tot .amt');return r?r.textContent:'';")
            return int(''.join(ch for ch in t if ch.isdigit()) or 0)

        print('1. Limiteur excavatrice H+R, desinstallation + reinstallation')
        verif(vis('ri-root'), 'la page s\'affiche')
        verif('montant manque' not in lignes(), 'aucun montant manquant')
        verif(vis('ri-lt-field') and vis('ri-axes-field'), 'type de machine et axes visibles')
        verif(dr.find_element(By.ID, 'ri-lt').get_attribute('value') == 'exc', 'excavatrice par defaut')
        verif(Select(dr.find_element(By.ID, 'ri-axes')).first_selected_option.get_attribute('value') == 'HR', 'H+R par defaut')
        c = codes()
        verif('1500-0001-Install' in c and '1500-0002-Install' in c, 'codes 1500-0001-Install et 1500-0002-Install dans Epicor')
        verif('1000-1001' not in c, 'plus de 1000-1001')
        verif(qte('SHR01') == '4', 'SHR01 = 4 h par defaut')
        verif('Prix à saisir' not in dr.find_element(By.ID, 'ri-epi-rows').text.split('1400-0000')[0], 'aucun prix a saisir sur les installations')
        verif(vis('ri-std-field') and not vis('ri-noens'), 'ensemble excavatrice affiche')
        attendu = (4 * cents(prix['TAUX_H']) + cents(prix['INST_1500-0001']) + cents(prix['INST_1500-0002'])
                   + cents(prix['LETTRE']) + cents(prix['PIECES_LIM']))
        verif(total() == attendu, 'total = 4 h + 0001 + 0002 + lettre + ensemble (%d c)' % attendu)
        verif('Excavatrice'.lower() in dr.find_element(By.ID, 'ri-qtitle').text.lower(), 'titre nomme la machine')

        print('2. Heures saisies : 6,5 h')
        h = dr.find_element(By.ID, 'ri-h')
        h.clear(); h.send_keys('6.5')
        verif(qte('SHR01') == '6.5', 'SHR01 = 6.5')
        verif(total() == attendu + int(2.5 * cents(prix['TAUX_H'])), 'total suit les heures')
        h.clear()
        verif('Inscris les heures' in lignes(), 'heures vides = message, pas de total')
        h.send_keys('4')

        print('3. Excavatrice multi-axe')
        choisir('ri-axes', 'M')
        c = codes()
        verif('1500-0005-Install' in c and '1500-0001-Install' not in c and '1500-0002-Install' not in c, 'multi-axe = 1500-0005-Install seul')
        choisir('ri-axes', 'H')
        c = codes()
        verif('1500-0001-Install' in c and '1500-0002-Install' not in c, 'hauteur seule = 1500-0001-Install')

        print('4. Telehandler')
        choisir('ri-lt', 'tele')
        opts = [x.get_attribute('value') for x in Select(dr.find_element(By.ID, 'ri-axes')).options]
        verif(opts == ['H', 'HR'], 'axes offerts : hauteur, H+R (pas de rotation seule ni multi-axe) : %s' % opts)
        choisir('ri-axes', 'HR')
        c = codes()
        verif('1500-0400-Install' in c and '1500-0401-Install' in c, '1500-0400-Install + 1500-0401-Install')
        verif(vis('ri-noens') and not vis('ri-std-field'), 'aucun ensemble : avis affiche, cases cachees')
        verif('Pièces remplacées' not in lignes(), 'pas de ligne d\'ensemble')
        verif(not vis('ri-mini-row'), 'option mini cachee')

        print('5. Pompe a beton, sections cumulatives')
        choisir('ri-lt', 'pompe')
        verif(vis('ri-sec-field'), 'champ sections visible')
        choisir('ri-axes', 'H')
        choisir('ri-sec', '5')
        c = codes()
        verif('1500-0201-Install' in c and '1500-0204-Install' in c and '1500-0205-install' in c and '1500-0206-Install' not in c,
              '5 sections = 0201 + 0204 + 0205')
        choisir('ri-sec', '3')
        verif('1500-0204-Install' not in codes(), '3 sections = aucune option')
        choisir('ri-sec', '6')
        verif('1500-0206-Install' in codes(), '6 sections = 0206 aussi')

        print('6. Autres types : un code par axe')
        for k, hc, rc in [('retro', '1500-0601-Install', '1500-0602-Install'), ('boom', '1500-0301-Install', '1500-0302-Install'),
                          ('vac', '1500-0501-Install', '1500-0502-Install'), ('foreuse', '1500-0701-Install', '1500-0702-Install'),
                          ('grue', '1500-0801-Install', '1500-0802-Install')]:
            choisir('ri-lt', k)
            choisir('ri-axes', 'R')
            c = codes()
            verif(rc in c and hc not in c, '%s rotation = %s' % (k, rc))
        verif('nacelle' not in dr.find_element(By.ID, 'ri-lt').text.lower(), 'nacelle absente')

        print('7. Reinstallation seule et desinstallation seule')
        choisir('ri-lt', 'exc'); choisir('ri-axes', 'HR')
        dr.find_element(By.ID, 'ri-t-ri').click()
        verif(not vis('ri-h-field') and 'SHR01' not in codes(), 'reinstallation seule : pas d\'heures ni SHR01')
        dr.find_element(By.ID, 'ri-t-de').click()
        c = codes()
        verif('SHR01' in c and not any(x.lower().endswith('-install') and x != '1500-0004-Install' for x in c), 'desinstallation seule : SHR01, aucune installation')
        verif(not vis('ri-axes-field'), 'axes caches en desinstallation seule')
        dr.find_element(By.ID, 'ri-t-re').click()

        print('8. Guide Pro et Balance : codes d\'installation, plus de 1000-1001')
        dr.find_element(By.ID, 'ri-p-gp').click()
        verif(not vis('ri-lt-field') and not vis('ri-axes-field'), 'type et axes caches')
        verif(dr.find_element(By.ID, 'ri-h').get_attribute('value') == '5', 'Guide Pro : 5 h par defaut')
        c = codes()
        verif('1100-0007-Install' in c and '1000-1001' not in c, 'Guide Pro = 1100-0007-Install')
        dr.find_element(By.ID, 'ri-p-ls7').click()
        c = codes()
        verif('1200-0010-Install' in c and '1000-1001' not in c, 'LS7 = 1200-0010-Install')
        verif(dr.find_element(By.ID, 'ri-h').get_attribute('value') == '4', 'LS7 : 4 h par defaut')
        dr.save_screenshot(str(Path(__file__).resolve().parent / '_reinst_types.png'))
        dr.find_element(By.ID, 'ri-p-lim').click()
        choisir('ri-lt', 'boom')
        dr.save_screenshot(str(Path(__file__).resolve().parent / '_reinst_boom.png'))
        errs = [l for l in dr.get_log('browser') if l['level'] == 'SEVERE' and 'reinstallation' in l['message']]
        verif(not errs, 'aucune erreur JS de la page : %s' % errs[:2])
    finally:
        dr.quit()
    print('\n%d OK, %d ECHEC' % (ok, ko))
    sys.exit(1 if ko else 0)


if __name__ == '__main__':
    main()
