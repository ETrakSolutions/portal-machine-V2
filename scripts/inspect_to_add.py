# -*- coding: utf-8 -*-
"""Inspection du lot _to_add.json (230 excavatrices validees) avant import."""
import json, os, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
j = json.load(open(os.path.join(ROOT, 'scripts', 'data',
                                'excavatrices_manquantes_2026-07.json'), encoding='utf-8'))
CANON = {'Mini', 'Compact', 'Standard', '100', '120', '200', '270', '300',
         '330', '400', '500', '700-800', '1000+'}

print('--- classe "330" ---')
for x in j:
    if x['classe'] == '330':
        print('  %-20s %-16s %7s kg' % (x['fab'][:20], x['modele'], x['poids']))

print('\n--- classes non canoniques ---')
for x in j:
    if x['classe'] not in CANON:
        print("  %-20s %-16s %7s kg  classe='%s'" % (x['fab'][:20], x['modele'], x['poids'], x['classe']))

print('\n--- poids non numeriques / vides ---')
for x in j:
    p = str(x.get('poids', '')).strip()
    if not p.isdigit():
        print('  %-20s %-16s poids=%r' % (x['fab'][:20], x['modele'], p))
