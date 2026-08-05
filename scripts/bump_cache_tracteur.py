# -*- coding: utf-8 -*-
"""Bump du cache pour la creation du type « Tracteur ».

Fichiers modifies : admin.js, export.js, edit-machine.js, overrides-loader.js.
On ne touche QUE les attributs src/href (lecon du bump precedent, qui avait
colle un « ?v= » dans des commentaires).
"""
import io, os, re, sys, glob

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
MIN = 200
CIBLES = {'js/admin.js': 195, 'js/export.js': 3,
          'js/edit-machine.js': 7, 'js/overrides-loader.js': 6}

for p in sorted(glob.glob('*.html')):
    s = io.open(p, encoding='utf-8').read()
    if len(s) < MIN:
        print('IGNORE (suspect, %d o) : %s' % (len(s), p))
        continue
    neuf = s
    for fichier, version in CIBLES.items():
        motif = re.compile(r'(src|href)="' + re.escape(fichier) + r'(?:\?v=\d+)?"')
        neuf = motif.sub(lambda m, f=fichier, v=version: '%s="%s?v=%d"' % (m.group(1), f, v), neuf)
    if neuf != s:
        io.open(p, 'w', encoding='utf-8', newline='').write(neuf)
        print('maj %-24s %d octets' % (p, len(neuf)))

print('\n=== versions APRES ===')
for p in sorted(glob.glob('*.html')):
    for m in re.findall(r'(?:src|href)="(js/[^"]+\.js[^"]*)"', io.open(p, encoding='utf-8').read()):
        print('   %-24s %s' % (p, m))
