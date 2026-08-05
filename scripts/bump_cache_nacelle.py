# -*- coding: utf-8 -*-
"""Bump du cache pour la livraison « options nacelle ».

Fichiers modifies : js/kit-rules.js, js/soumission.js, js/translations.js.

LECON DU PREMIER JET : un remplacement large sur « js/kit-rules.js » a colle un
« ?v= » dans des COMMENTAIRES de database.html (« source unique = js/kit-rules.js »).
On ne touche donc QUE les attributs src/href de balises, jamais le texte libre.

Le garde-fou du 2026-07-10 s applique : lire avant d ecrire, refuser tout
fichier suspect (trop court), pour ne jamais vider un HTML.
"""
import io, os, re, sys, glob

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
MIN = 200

# fichier -> nouvelle version. On agit uniquement dans src="..." / href="...".
CIBLES = {'js/kit-rules.js': 8, 'js/soumission.js': 263, 'js/translations.js': 207}
# nettoyage des commentaires pollues par le premier jet
POLLUTION = ('js/kit-rules.js?v=2', 'js/kit-rules.js')


def version_dans_balise(html, fichier, version):
    motif = re.compile(r'(src|href)="' + re.escape(fichier) + r'(?:\?v=\d+)?"')
    return motif.sub(lambda m: '%s="%s?v=%d"' % (m.group(1), fichier, version), html)


print('=== bump ===')
for p in sorted(glob.glob('*.html')):
    s = io.open(p, encoding='utf-8').read()
    if len(s) < MIN:
        print('   IGNORE (suspect, %d o) : %s' % (len(s), p))
        continue
    neuf = s.replace(*POLLUTION)          # retire le ?v=2 mis dans les commentaires
    for f, v in CIBLES.items():
        neuf = version_dans_balise(neuf, f, v)
    if neuf != s:
        io.open(p, 'w', encoding='utf-8', newline='').write(neuf)
        print('   maj %-26s %d octets' % (p, len(neuf)))

print('\n=== versions APRES (balises uniquement) ===')
for p in sorted(glob.glob('*.html')):
    for m in re.findall(r'(?:src|href)="(js/(?:kit-rules|soumission|translations)\.js[^"]*)"',
                        io.open(p, encoding='utf-8').read()):
        print('   %-26s %s' % (p, m))

print('\n=== reste-t-il un ?v= dans du texte libre ? ===')
reste = 0
for p in sorted(glob.glob('*.html')):
    for l in io.open(p, encoding='utf-8').read().splitlines():
        if 'kit-rules.js?v=' in l and 'src=' not in l:
            print('   %s : %s' % (p, l.strip()[:110]))
            reste += 1
print('   %s' % ('aucun' if not reste else '%d ligne(s) a revoir' % reste))
