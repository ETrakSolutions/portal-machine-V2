# -*- coding: utf-8 -*-
"""Verifie que ce qui est EN LIGNE est bien ce qui est dans le depot local.

Compare, fichier par fichier, l empreinte du contenu servi par GitHub Pages a
celle du fichier local (cache-buste a chaque requete).
"""
import hashlib, json, os, sys, urllib.request, random

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://etraksolutions.github.io/portal-machine-V2/'
FICHIERS = ['data/machines.json', 'data/overrides/excavatrice.json',
            'data/overrides/grue-mobile.json', 'data/prices.json',
            'js/kit-rules.js', 'js/app.js', 'js/soumission.js', 'js/edit-machine.js',
            'index.html', 'machine.html', 'database.html', 'soumission.html',
            'edit-machine.html']

ecarts = 0
for rel in FICHIERS:
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        print('  [!!] %-40s absent en local' % rel)
        ecarts += 1
        continue
    local = open(p, 'rb').read()
    url = BASE + rel + '?cb=%d' % random.randint(1, 10 ** 9)
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            live = r.read()
    except Exception as e:
        print('  [!!] %-40s inaccessible : %s' % (rel, e))
        ecarts += 1
        continue
    hl = hashlib.sha256(local).hexdigest()[:12]
    hv = hashlib.sha256(live).hexdigest()[:12]
    if hl == hv:
        print('  [ok] %-40s %9d o  %s' % (rel, len(local), hl))
    else:
        # tolere une simple difference de fin de ligne
        if local.replace(b'\r\n', b'\n') == live.replace(b'\r\n', b'\n'):
            print('  [ok] %-40s identique (fins de ligne differentes)' % rel)
        else:
            print('  [!!] %-40s DIFFERENT  local=%s live=%s (%d vs %d o)'
                  % (rel, hl, hv, len(local), len(live)))
            ecarts += 1

print('\n%s' % ('PARITE COMPLETE : le live correspond au depot local'
                if not ecarts else 'ECARTS : %d fichier(s)' % ecarts))
sys.exit(1 if ecarts else 0)
