# -*- coding: utf-8 -*-
"""Retire les voltages Link-Belt issus de la REGLE B (deduction interne).

Motif : la campagne a prouve que le voltage Link-Belt varie a l'interieur d'une
meme famille, et que deux des valeurs deduites sont FAUSSES —
  * HTT-8660       : deduit 24V DC, document officiel « 12-volt neg. ground »
  * HTC-8675 SII   : deduit 24V DC, document officiel 12V
La preuve interne (3 modeles « Camion » en 24V, 1 treillis en 24V) ne tient donc
pas pour cette marque. On remet ces modeles a « A completer » plutot que de
garder une valeur non fiable : un champ vide se voit, une valeur fausse non.

Les autres marques restent en place mais sont listees pour verification
(scripts/data/grues_voltage_a_verifier.json).

Usage : python scripts/grues_retirer_voltage_linkbelt.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
WRITE = '--write' in sys.argv
CHAMP = 'Voltage machine (V/type)'

liste = json.load(open(os.path.join(ROOT, 'scripts', 'data',
                                    'grues_voltage_a_verifier.json'), encoding='utf-8'))
cibles = {x['modele'] for x in liste if x['marque'] == 'Link-Belt'}
print('modeles Link-Belt concernes : %d' % len(cibles))
for m in sorted(cibles):
    print('   -', m)

db = json.load(open(MJ, encoding='utf-8'))
gm = db['Grue Mobile']
n = 0
for y in gm['Link-Belt']:
    for m, v in gm['Link-Belt'][y].items():
        if m in cibles and isinstance(v, dict) and str(v.get(CHAMP) or '').strip():
            if WRITE:
                v[CHAMP] = 'A completer'
            n += 1
print('\nentrees remises a « A completer » : %d' % n)

if WRITE:
    with open(MJ, 'w', encoding='utf-8') as fh:
        json.dump(db, fh, ensure_ascii=False, separators=(',', ':'))
    print('ECRIT dans data/machines.json')
else:
    print('(simulation — relancer avec --write)')
