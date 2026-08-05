# -*- coding: utf-8 -*-
"""Codes produit TARIFES dans data/prices.json mais jamais proposes a la vente.

Un code present dans prices.json et absent de toute l interface est un produit
qu on ne peut pas mettre en soumission : le prix existe, l option non.
Verifie aussi l inverse : un code propose sans prix.
"""
import json, os, re, sys, glob, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

prix = json.load(open(os.path.join(ROOT, 'data', 'prices.json'), encoding='utf-8'))
codes_tarifes = {k for k in prix if re.fullmatch(r'\d{4}-\d{4}', k)}

# tous les codes cites dans le code source de l application (hors prices.json)
sources = (glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, 'js', '*.js')))
cites = collections.defaultdict(set)
for p in sources:
    s = open(p, encoding='utf-8').read()
    for c in re.findall(r'\d{4}-\d{4}', s):
        cites[c].add(os.path.basename(p))

# codes presents dans le catalogue BD (_bom_labels) et dans les overrides
mj = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))
catalogue = set()
for t, v in mj.items():
    for k, lab in (v.get('_bom_labels') or {}).items():
        pn = (lab or {}).get('pn') if isinstance(lab, dict) else None
        if pn and re.fullmatch(r'\d{4}-\d{4}', str(pn).strip()):
            catalogue.add(str(pn).strip())

print('codes tarifes dans prices.json      : %d' % len(codes_tarifes))
print('codes cites dans l interface        : %d' % len(cites))
print('codes references par les _bom_labels : %d' % len(catalogue))

orphelins = sorted(c for c in codes_tarifes if c not in cites and c not in catalogue)
print('\n=== TARIFES MAIS JAMAIS PROPOSES (%d) ===' % len(orphelins))
for c in orphelins:
    p = prix[c]
    voisins = sorted(x for x in codes_tarifes if x[:4] == c[:4])
    print('   %-10s piece %-8s installation %-8s   famille %s : %s'
          % (c, p.get('item'), p.get('install'), c[:4], ', '.join(voisins)))

sans_prix = sorted(c for c in (set(cites) | catalogue) if c not in codes_tarifes)
print('\n=== PROPOSES MAIS SANS PRIX (%d) ===' % len(sans_prix))
for c in sans_prix[:25]:
    print('   %-10s cite dans %s' % (c, ', '.join(sorted(cites.get(c, ['(catalogue BD)'])))))
