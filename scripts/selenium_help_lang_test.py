# -*- coding: utf-8 -*-
"""Le panneau ouvert par le bouton « ? » de la page Soumission reste-t-il en
francais quand la langue est English ?

Signale par Jacquot le 2026-08-06. renderSoumissionFallback() a bien deux
versions (fr/en) et lit la meme cle localStorage que le moteur i18n : le defaut
ne se voit pas a la lecture, il faut l observer dans le navigateur.

Deux chemins d ouverture testes :
  1. bascule EN AVANT d ouvrir le panneau ;
  2. panneau ouvert en FR, puis bascule EN pendant qu il est affiche.

La page est chargee UNE seule fois par cas (machines.json fait 13,6 Mo).
Sortie non bufferisee pour pouvoir suivre en direct.
"""
import sys, os, threading, http.server, socketserver, time

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def dire(*a):
    print(*a)
    sys.stdout.flush()

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8843
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
dire('serveur local pret sur %s' % BASE)

import tempfile
opts = Options()
# Profil isole obligatoire : sans lui, Chrome sort aussitot si une session du
# navigateur de l utilisateur tient deja le profil par defaut.
_prof = tempfile.mkdtemp(prefix='chromeprof_')
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
          '--window-size=1500,1100', '--user-data-dir=' + _prof,
          '--no-first-run', '--no-default-browser-check', '--disable-extensions']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
dv.set_page_load_timeout(120)
fails = []

FR = ['Envoyer autrement', 'Copier la demande', 'Configurer mon courriel',
      'ne s’est pas ouvert', "ne s'est pas ouvert"]
EN = ['Send another way', 'Copy the request', 'Set up my default email',
      "didn't open"]

# --- une seule visite : on pose la langue puis on recharge ---
dire('chargement initial...')
dv.get(BASE + '/soumission.html')
WebDriverWait(dv, 60).until(lambda d: d.find_element(By.ID, 'soumission-help-toggle'))
dire('page chargee')

dv.execute_script("localStorage.setItem('portal_lang','en');")
dv.refresh()
WebDriverWait(dv, 60).until(lambda d: d.find_element(By.ID, 'soumission-help-toggle'))
dire('recharge en EN, portal_lang=%r' %
     dv.execute_script("return localStorage.getItem('portal_lang');"))

dire('\n' + '=' * 66)
dire('CAS 1 — langue EN choisie AVANT d ouvrir le panneau')
dire('=' * 66)
dv.execute_script("document.getElementById('soumission-help-toggle').click();")
time.sleep(0.8)
box = dv.find_element(By.ID, 'soumission-fallback')
txt = box.get_attribute('textContent') or ''
dire('panneau visible : %s' % box.is_displayed())
dire('--- texte rendu ---')
dire(txt[:700])
fr_vus = [m for m in FR if m in txt]
en_vus = [m for m in EN if m in txt]
dire('\nmarqueurs FR : %s' % (fr_vus or 'aucun'))
dire('marqueurs EN : %s' % (en_vus or 'aucun'))
if fr_vus:
    fails.append('CAS 1 : panneau en francais alors que portal_lang=en -> %s' % fr_vus)

btn = dv.find_element(By.ID, 'soumission-help-toggle')
dire('title du bouton « ? » : %r' % btn.get_attribute('title'))

# --- CAS 2 : ouvert en FR puis bascule EN, sans recharger ---
dire('\n' + '=' * 66)
dire('CAS 2 — panneau ouvert en FR, puis bascule EN pendant qu il est ouvert')
dire('=' * 66)
_fr = dv.find_elements(By.CSS_SELECTOR, '.lang-btn[data-lang="fr"]')
if _fr:
    dv.execute_script('arguments[0].click();', _fr[0])
time.sleep(0.5)
# fermer puis rouvrir pour repartir d un panneau rendu en FR
dv.execute_script("document.getElementById('soumission-help-toggle').click();")
time.sleep(0.4)
dv.execute_script("document.getElementById('soumission-help-toggle').click();")
time.sleep(0.6)
box = dv.find_element(By.ID, 'soumission-fallback')
dire('ouvert en FR : %r' % (box.get_attribute('textContent') or '')[:90])
_en = dv.find_elements(By.CSS_SELECTOR, '.lang-btn[data-lang="en"]')
ok = bool(_en)
if ok:
    dv.execute_script('arguments[0].click();', _en[0])
if not ok:
    fails.append('CAS 2 : bouton EN introuvable')
else:
    time.sleep(0.9)
    box = dv.find_element(By.ID, 'soumission-fallback')
    txt2 = box.get_attribute('textContent') or ''
    dire('--- apres bascule EN, panneau toujours ouvert ---')
    dire(txt2[:500])
    fr2 = [m for m in FR if m in txt2]
    if fr2:
        fails.append('CAS 2 : le panneau deja ouvert ne se retraduit pas -> %s' % fr2)

dire('\n' + '=' * 66)
if fails:
    dire('VERDICT : DEFAUT CONFIRME')
    for f in fails:
        dire('  - %s' % f)
else:
    dire('VERDICT : aucun defaut reproduit')
dire('=' * 66)

dv.quit()
httpd.shutdown()
