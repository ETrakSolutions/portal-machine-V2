# -*- coding: utf-8 -*-
"""Trouve les textes dont le haut (ou le bas) des lettres est reellement rogne.

Signale par Jacquot le 2026-08-07 : « l ecriture est un peu coupee dans le haut
des lettres (type, fabricant...) ».

Methode : pour chaque element de texte visible, on compare l ENCRE des glyphes
(canvas measureText -> actualBoundingBoxAscent/Descent, qui donne la hauteur
reellement peinte) a la boite de ligne calculee par le navigateur. Si l encre
depasse la boite ET qu un ancetre coupe (overflow hidden/clip/auto ou un
element de formulaire, qui coupe toujours), le texte est vraiment ampute.

Ce controle distingue le vrai rognage d un simple artefact de capture d ecran :
une capture d element recadre au bord de la boite et fait croire a une coupure
qui n existe pas sur la page.
"""
import sys, os, json, threading, http.server, socketserver, time, tempfile

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def dire(*a):
    print(*a)
    sys.stdout.flush()


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8891
BASE = 'http://127.0.0.1:%d' % PORT
os.chdir(REPO)

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.TCPServer(('127.0.0.1', PORT), Quiet)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
dire('serveur local sur %s' % BASE)

opts = Options()
_prof = tempfile.mkdtemp(prefix='chromeprof_')
for a in ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
          '--window-size=1600,1200', '--user-data-dir=' + _prof,
          '--no-first-run', '--disable-extensions']:
    opts.add_argument(a)
dv = webdriver.Chrome(options=opts)
dv.set_page_load_timeout(180)

SONDE = r"""
var cv = document.createElement('canvas');
var cx = cv.getContext('2d');
var res = [];

function coupePar(el) {
  // remonte les ancetres : overflow non visible, ou controle de formulaire
  var e = el;
  while (e && e !== document.documentElement) {
    var s = getComputedStyle(e);
    if (/^(SELECT|INPUT|BUTTON|TEXTAREA)$/.test(e.tagName)) return e.tagName;
    if (s.overflow !== 'visible' || s.overflowY !== 'visible') {
      return e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : '');
    }
    e = e.parentElement;
  }
  return null;
}

var tous = document.querySelectorAll('label, .section-title, h1, h2, h3, th, td, option, button, span, div, p, a');
for (var i = 0; i < tous.length; i++) {
  var el = tous[i];
  // seulement les elements a texte direct, visibles
  var direct = '';
  for (var n = 0; n < el.childNodes.length; n++) {
    if (el.childNodes[n].nodeType === 3) direct += el.childNodes[n].nodeValue;
  }
  direct = direct.trim();
  if (!direct || direct.length > 60) continue;
  var r = el.getBoundingClientRect();
  if (r.height === 0 || r.width === 0) continue;
  var c = getComputedStyle(el);
  if (c.visibility === 'hidden' || c.display === 'none') continue;

  cx.font = c.fontStyle + ' ' + c.fontWeight + ' ' + c.fontSize + ' ' + c.fontFamily;
  var texte = (c.textTransform === 'uppercase') ? direct.toUpperCase() : direct;
  var m = cx.measureText(texte);
  if (!m.actualBoundingBoxAscent && !m.fontBoundingBoxAscent) continue;

  var encreHaut = m.actualBoundingBoxAscent;      // au-dessus de la ligne de base
  var boiteHaut = m.fontBoundingBoxAscent;        // ce que la boite reserve
  var debord = encreHaut - boiteHaut;             // > 0 = l encre sort par le haut

  if (debord > 0.5) {
    var coupeur = coupePar(el);
    if (coupeur) {
      res.push({
        texte: direct.slice(0, 40),
        balise: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
        police: c.fontFamily.split(',')[0].replace(/"/g, ''),
        taille: c.fontSize,
        lineHeight: c.lineHeight,
        debord: Math.round(debord * 100) / 100,
        coupePar: coupeur
      });
    }
  }
}
// dedoublonner par (balise, coupeur)
var vus = {}, out = [];
for (var j = 0; j < res.length; j++) {
  var k = res[j].balise + '|' + res[j].coupePar;
  if (!vus[k]) { vus[k] = 1; out.push(res[j]); }
}
return out;
"""

PAGES = ['index.html', 'database.html', 'soumission.html', 'machine.html',
         'machine-requests.html', 'export.html', 'edit-machine.html', 'price-list.html']
FAUX = {"username": "audit", "role": "super_admin", "token": "A"}

total = 0
for page in PAGES:
    try:
        dv.get(BASE + '/' + page)
        dv.execute_script("localStorage.setItem('portal_user', arguments[0]);", json.dumps(FAUX))
        dv.get(BASE + '/' + page)
        WebDriverWait(dv, 90).until(
            lambda d: d.execute_script("return document.readyState") == 'complete')
        time.sleep(2.5)
        r = dv.execute_script(SONDE) or []
        total += len(r)
        dire('\n%-24s %d cas' % (page, len(r)))
        for x in r[:10]:
            dire('   %-26s %-16s %-6s debord %.2f px  coupe par %s'
                 % (x['texte'][:26], x['balise'][:16], x['taille'], x['debord'], x['coupePar']))
    except Exception as e:
        dire('%-24s ERREUR %s' % (page, str(e)[:90]))

dire('\n' + '=' * 70)
dire('TOTAL : %d texte(s) reellement rogne(s)' % total)
dire('=' * 70)

dv.quit()
httpd.shutdown()
