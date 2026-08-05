# -*- coding: utf-8 -*-
"""Retire les frais d installation du 1200-0011 (balance en valise).

Le 1200-0011 est la balance livree en valise que le CLIENT installe lui-meme :
elle ne doit pas porter de frais d installation. Elle affichait pourtant
1 320 $, exactement comme le 1200-0010 (balance loader posee par les
techniciens e-Trak) — les deux lignes etaient identiques au dollar pres, ce qui
a mis la puce a l oreille. Erreur confirmee par Jacquot le 2026-08-05.

Usage : python scripts/corriger_prix_balance_valise.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'data', 'prices.json')
WRITE = '--write' in sys.argv

prix = json.load(open(P, encoding='utf-8'))
print('=== famille 1200 AVANT ===')
for k in sorted(prix):
    if k.startswith('1200'):
        print('   %-12s piece %-8s installation %s' % (k, prix[k].get('item'), prix[k].get('install')))

cible = prix.get('1200-0011')
if not cible:
    sys.exit('\n1200-0011 absent de prices.json')
if cible.get('install') in (0, None):
    print('\n   installation deja a %r — rien a faire' % cible.get('install'))
else:
    print('\n   1200-0011 : installation %s -> 0' % cible.get('install'))
    if WRITE:
        cible['install'] = 0
        with open(P, 'w', encoding='utf-8') as f:
            json.dump(prix, f, ensure_ascii=False, indent=1)
        print('   ECRIT')

if WRITE:
    print('\n=== famille 1200 APRES ===')
    prix2 = json.load(open(P, encoding='utf-8'))
    for k in sorted(prix2):
        if k.startswith('1200'):
            print('   %-12s piece %-8s installation %s' % (k, prix2[k].get('item'), prix2[k].get('install')))
else:
    print('\n(simulation — relancer avec --write)')
