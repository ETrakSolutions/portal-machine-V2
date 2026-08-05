# -*- coding: utf-8 -*-
"""Ajoute 1500-0906 et 1500-0907 au catalogue _bom_labels du type Nacelle.

Les deux codes etaient TARIFES dans data/prices.json (280 $ et 1 365 $) mais
n existaient dans aucun catalogue ni interface. Libelles fournis par Jacquot
le 2026-08-05 :
    1500-0906 : Option rotation pignon et cremaillere
    1500-0907 : Option fleche de nacelle

Statut par defaut « j » (option secondaire), conforme a la regle metier :
0900 = kit de base obligatoire, tout le reste en option.

Usage : python scripts/nacelle_catalogue_0906_0907.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
WRITE = '--write' in sys.argv

NOUVEAUX = {
    '0906 Rotation pignon-cremaillere': {
        'pn': '1500-0906',
        'desc': 'Option rotation pignon et cremaillere',
        'def': 'j',
    },
    '0907 Fleche de nacelle': {
        'pn': '1500-0907',
        'desc': 'Option fleche de nacelle',
        'def': 'j',
    },
}

db = json.load(open(MJ, encoding='utf-8'))
lab = db['Nacelle']['_bom_labels']

print('=== catalogue Nacelle AVANT (%d codes) ===' % len(lab))
for k, v in lab.items():
    print('   %-34s %-12s %s' % (k, v.get('pn'), v.get('def')))

for k, v in NOUVEAUX.items():
    if any((x or {}).get('pn') == v['pn'] for x in lab.values()):
        print('\n   %s deja au catalogue — ignore' % v['pn'])
        continue
    print('\n   + %-34s %-12s %s   %s' % (k, v['pn'], v['def'], v['desc']))
    if WRITE:
        lab[k] = v

if WRITE:
    with open(MJ, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
    print('\nECRIT. Catalogue Nacelle : %d codes' % len(lab))
else:
    print('\n(simulation — relancer avec --write)')
