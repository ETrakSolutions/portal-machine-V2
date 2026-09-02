# -*- coding: utf-8 -*-
"""Champ anglais des textes libres de la BD (note, avertissement, ligne custom).

Decision de Jacquot le 2026-09-02 : plutot que de laisser le francais s'afficher
au milieu d'une page anglaise, la BD porte une version anglaise FACULTATIVE. Vide,
c'est le francais qui sort — les 3 290 textes existants ne bougent pas.

Verifie :
  1. edit-machine offre les quatre zones (note FR/EN, avertissement FR/EN) et la
     description anglaise des lignes custom ;
  2. taper dans une zone anglaise compte comme une modification ;
  3. la requete envoyee au backend porte bien notes_en / warning_en ;
  4. en soumission, l'anglais s'affiche en mode EN et le francais en mode FR ;
  5. sans version anglaise, le francais s'affiche en anglais aussi (repli) ;
  6. la bascule de langue rejoue le choix sans rechargement ;
  7. l'etiquette du lieu d'installation devient « facultatif » quand le client
     installe, et redevient « obligatoire » sinon ;
  8. aucune erreur JS SEVERE.

L'ecriture reelle n'est PAS testee ici : elle exige le redeploiement du Web App
Apps Script. On intercepte fetch() pour lire la charge utile sans rien ecrire.

Usage : python scripts/selenium_texte_bd_anglais_test.py [--live]
"""
import sys, io, os, json, threading, http.server, socketserver, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8801
LIVE = 'https://etraksolutions.github.io/portal-machine-V2'
SUR_LE_LIVE = '--live' in sys.argv
BASE = LIVE if SUR_LE_LIVE else 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


if not SUR_LE_LIVE:
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('CIBLE :', BASE)

opts = Options()
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1500,1200']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
fails = []

TYPE, FAB, YEAR, MODEL = 'Excavatrice', 'Case', '2026', 'CX90E'   # porte deja un _notes FR
NOTE_EN = 'CLAUDE TEST English note'
WARN_EN = 'CLAUDE TEST English warning'


def check(label, cond):
    print(('  [OK] ' if cond else '  [X ] ') + label)
    if not cond:
        fails.append(label)


CHOISIR = ("var s=document.getElementById(arguments[0]); if(!s) return false;"
           "for (var i=0;i<s.options.length;i++){ if(s.options[i].value===arguments[1]){"
           "  s.selectedIndex=i; s.dispatchEvent(new Event('change',{bubbles:true})); return true; } }"
           "return false;")


def choisir(sid, val, delai=25):
    fin = time.time() + delai
    while time.time() < fin:
        if dv.execute_script(CHOISIR, sid, val):
            return True
        time.sleep(0.3)
    return False


def taper(el_id, texte):
    dv.execute_script(
        "var e=document.getElementById(arguments[0]); e.value=arguments[1];"
        "e.dispatchEvent(new Event('input',{bubbles:true}));", el_id, texte)
    time.sleep(0.4)


try:
    dv.get(BASE + '/index.html')
    dv.execute_script("localStorage.setItem('portal_user', JSON.stringify("
                      "{role:'super_admin', email:'t@e', name:'Test Claude',"
                      " permissions:{modifBom:true, voirPrix:true}}));")
    dv.execute_script("localStorage.setItem('portal_lang','fr');")

    # =====================================================================
    print('--- 1) edit-machine : les quatre zones de saisie ---')
    dv.get(BASE + '/edit-machine.html?type=%s&fab=%s&year=%s&model=%s' % (TYPE, FAB, YEAR, MODEL))
    WebDriverWait(dv, 40).until(lambda d: d.find_elements('id', 'notes-area'))
    for zid in ('notes-area', 'notes-area-en', 'warning-area', 'warning-area-en'):
        check('zone « %s » presente' % zid, bool(dv.find_elements('id', zid)))
    check('la note francaise existante est chargee',
          bool((dv.find_element('id', 'notes-area').get_attribute('value') or '').strip()))
    check('la zone anglaise part vide',
          not (dv.find_element('id', 'notes-area-en').get_attribute('value') or '').strip())
    lbl = dv.execute_script(
        "var l=[].slice.call(document.querySelectorAll('label'));"
        "return l.map(function(e){return e.textContent.trim();}).filter(function(t){"
        "return t.indexOf('anglais')>=0;});")
    check('les etiquettes annoncent le facultatif (%d)' % len(lbl),
          len(lbl) >= 2 and all('facultatif' in t for t in lbl))

    print('--- 2) taper en anglais compte comme une modification ---')
    avant = dv.execute_script("var b=document.querySelector('.btn-row button'); "
                              "return b ? b.textContent : '';")
    taper('notes-area-en', NOTE_EN)
    taper('warning-area-en', WARN_EN)
    apres = dv.execute_script("var b=document.querySelector('.btn-row button'); "
                              "return b ? b.textContent : '';")
    check('le bouton Sauvegarder compte les changements (« %s » -> « %s »)'
          % (avant.strip(), apres.strip()), avant != apres)

    print('--- 3) la requete backend porte notes_en / warning_en ---')
    dv.execute_script("""
window.__envois = [];
var vrai = window.fetch;
window.fetch = function(url, opts){
  try { if (opts && opts.body) window.__envois.push(String(opts.body)); } catch(e){}
  // On NE laisse PAS partir l'ecriture : ce test ne doit rien changer en base.
  return Promise.resolve(new Response('{"ok":true}', {status:200}));
};
""")
    dv.execute_script("document.getElementById('btn-save').click();")
    time.sleep(1.0)
    check('le modal de confirmation s ouvre', dv.execute_script(
        "var m=document.getElementById('modal-save');"
        "return !!m && m.classList.contains('show');"))
    dv.execute_script("document.getElementById('save-confirm-btn').click();")
    time.sleep(1.5)
    envois = dv.execute_script("return window.__envois || [];")
    notes_env = [e for e in envois if 'updateMachineNotes' in e]
    check('un appel updateMachineNotes est parti (%d envoi(s))' % len(envois), len(notes_env) == 1)
    if notes_env:
        corps = json.loads(notes_env[0])
        check('il porte notes_en = « %s »' % corps.get('notes_en'), corps.get('notes_en') == NOTE_EN)
        check('il porte warning_en = « %s »' % corps.get('warning_en'), corps.get('warning_en') == WARN_EN)
        check('il porte toujours la note francaise', bool(corps.get('notes')))

    # =====================================================================
    print('--- 4) soumission : l anglais sort en anglais, le francais en francais ---')

    def preparer_soumission(langue, injecter):
        dv.execute_script("localStorage.setItem('portal_lang', arguments[0]);", langue)
        dv.get(BASE + '/soumission.html')
        WebDriverWait(dv, 40).until(lambda d: d.execute_script(
            "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
        if injecter:
            dv.execute_script("""
var e = machinesData[arguments[0]][arguments[1]][arguments[2]][arguments[3]];
e._notes = arguments[4]; e._notes_en = arguments[5];
e._warning = arguments[6]; e._warning_en = arguments[7];
""", TYPE, FAB, YEAR, MODEL, 'Note en francais', NOTE_EN, 'Avertissement francais', WARN_EN)
        for sid, val in (('select-type', TYPE), ('select-fabricant', FAB),
                         ('select-modele', MODEL), ('select-annee', YEAR)):
            choisir(sid, val)
        dv.execute_script("var h=document.getElementById('lim-hauteur'); if(h && !h.checked) h.click();")
        time.sleep(1.2)

    def note_affichee():
        return dv.execute_script(
            "var t=document.querySelectorAll('#selected-options-list table tbody tr');"
            "for (var i=0;i<t.length;i++){ var td=t[i].querySelector('td[colspan]');"
            "  if (td) return td.textContent.trim(); } return '';")

    def bandeau():
        return dv.execute_script(
            "var w=document.getElementById('machine-warning');"
            "if(!w || getComputedStyle(w).display==='none') return '';"
            "var t=w.querySelector('.idc-warning-text'); return t ? t.textContent.trim() : '';")

    preparer_soumission('en', True)
    check('EN : la note anglaise s affiche (%s)' % note_affichee()[:60], NOTE_EN in note_affichee())
    check('EN : l avertissement anglais s affiche (%s)' % bandeau()[:60], WARN_EN in bandeau())

    preparer_soumission('fr', True)
    check('FR : la note francaise s affiche (%s)' % note_affichee()[:60],
          'Note en francais' in note_affichee())
    check('FR : l avertissement francais s affiche (%s)' % bandeau()[:60],
          'Avertissement francais' in bandeau())

    print('--- 5) sans version anglaise, le francais sert de repli ---')
    dv.execute_script("localStorage.setItem('portal_lang','en');")
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for sid, val in (('select-type', TYPE), ('select-fabricant', FAB),
                     ('select-modele', MODEL), ('select-annee', YEAR)):
        choisir(sid, val)
    dv.execute_script("var h=document.getElementById('lim-hauteur'); if(h && !h.checked) h.click();")
    time.sleep(1.2)
    repli = note_affichee()
    check('EN sans traduction : la note francaise de la BD s affiche quand meme (%s)'
          % repli[:60], len(repli) > 6)

    print('--- 6) la bascule de langue rejoue le choix, sans rechargement ---')
    dv.execute_script("""
var e = machinesData[arguments[0]][arguments[1]][arguments[2]][arguments[3]];
e._notes = 'Note en francais'; e._notes_en = arguments[4];
""", TYPE, FAB, YEAR, MODEL, NOTE_EN)
    dv.execute_script("i18n.setLang('fr');")
    time.sleep(1.0)
    check('apres bascule FR : note francaise (%s)' % note_affichee()[:50],
          'Note en francais' in note_affichee())
    dv.execute_script("i18n.setLang('en');")
    time.sleep(1.0)
    check('apres bascule EN : note anglaise (%s)' % note_affichee()[:50],
          NOTE_EN in note_affichee())

    print('--- 7) etiquette du lieu d installation ---')
    dv.execute_script("localStorage.setItem('portal_lang','fr');")
    dv.get(BASE + '/soumission.html')
    WebDriverWait(dv, 40).until(lambda d: d.execute_script(
        "return (typeof machinesData !== 'undefined') && Object.keys(machinesData).length > 0;"))
    for sid, val in (('select-type', TYPE), ('select-fabricant', FAB),
                     ('select-modele', MODEL), ('select-annee', YEAR)):
        choisir(sid, val)
    dv.execute_script("var h=document.getElementById('lim-hauteur'); if(h && !h.checked) h.click();")
    time.sleep(1.2)

    def etiquette():
        return dv.execute_script(
            "var l=document.querySelector('label[for=\"soumission-lieu\"]');"
            "return l ? l.textContent.trim() : '';")

    dv.execute_script("document.getElementById('install-etrak-oui').click();")
    time.sleep(0.6)
    check('« Oui » : etiquette obligatoire (%s)' % etiquette(), 'obligatoire' in etiquette())
    dv.execute_script("document.getElementById('install-etrak-non').click();")
    time.sleep(0.6)
    check('« Non » : etiquette facultative (%s)' % etiquette(), 'facultatif' in etiquette())
    dv.execute_script("i18n.setLang('en');")
    time.sleep(0.8)
    check('bascule EN : l etiquette reste facultative (%s)' % etiquette(),
          'optional' in etiquette().lower())
    dv.execute_script("i18n.setLang('fr'); document.getElementById('install-etrak-oui').click();")
    time.sleep(0.8)
    check('retour a « Oui » : etiquette obligatoire (%s)' % etiquette(),
          'obligatoire' in etiquette())

    # « beforeunload » bloque : artefact du mode headless (on quitte la page d'edition
    # avec des changements non sauves, sans geste utilisateur). Un vrai navigateur
    # affiche la demande de confirmation ; ce n'est pas un defaut de la page.
    errs = [e for e in dv.get_log('browser')
            if e['level'] == 'SEVERE' and 'beforeunload' not in e['message']]
    check('aucune erreur JS SEVERE (%d)' % len(errs), not errs)
    for e in errs[:4]:
        print('     ', e['message'][:220])

except Exception as e:
    print('!! ERREUR:', type(e).__name__, e)
    fails.append(str(e))
finally:
    dv.quit()

print('\nRESULTAT:', 'OK' if not fails else 'ECHEC (%d)' % len(fails))
for f in fails:
    print('  -', f)
sys.exit(0 if not fails else 1)
