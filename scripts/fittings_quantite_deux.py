# -*- coding: utf-8 -*-
"""Passe a 2 la quantite des lignes RACCORD promues le 2026-09-03.

Decision de Jacquot, 2026-09-03 : « mettre la quantite a 2 ». Le raccord se pose
par paire — un a chaque bout — ce que ses propres saisies a la main montraient deja
(980 XE, 844 P-Tier, 835HV : qty 2), alors que le fichier source
« liste fitting sur loader.xls » ne portait aucune quantite et que les lignes
promues sont donc restees a 1.

PERIMETRE STRICT : uniquement les lignes de `data/machines.json` qui sont des
raccords de balance (statut `r` + `opt` = "balance") et dont la quantite est
absente ou vaut 1. On ne touche PAS :
  - les lignes BOULONS (aucun PN Epicor, laissees de cote depuis le depart) ;
  - les saisies manuelles de Jacquot, qui vivent dans les overrides et sont deja a 2 ;
  - toute ligne dont la quantite a ete fixee volontairement a autre chose que 1.

Ecriture COMPACTE (machines.json tient sur une ligne). --essai n'ecrit rien.
"""
import json
import io
import os
import sys
import argparse
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(REPO, 'data', 'machines.json')

ap = argparse.ArgumentParser()
ap.add_argument('--essai', action='store_true', help='n ecrit rien')
ap.add_argument('--qte', type=int, default=2)
args = ap.parse_args()

d = json.load(open(PATH, encoding='utf-8'))
L = d['Loader']

touchees = 0
avant = Counter()
ignorees = Counter()
for b in sorted(L):
    if b.startswith('_'):
        continue
    for y in sorted(L[b]):
        for m in sorted(L[b][y]):
            bom = L[b][y][m].get('_bom')
            if not (isinstance(bom, dict) and isinstance(bom.get('_custom'), list)):
                continue
            for c in bom['_custom']:
                if c.get('code') == 'BOULONS':
                    ignorees['BOULONS'] += 1
                    continue
                if c.get('status') != 'r' or not c.get('opt'):
                    ignorees['pas un raccord de balance'] += 1
                    continue
                q = c.get('qty')
                avant[q if q is not None else '(absent)'] += 1
                if q is None or q == 1:
                    c['qty'] = args.qte
                    touchees += 1
                else:
                    ignorees['quantite deja fixee a %s' % q] += 1

print('Lignes de raccord de balance dans machines.json, quantite AVANT : %s' % dict(avant))
print('Lignes passees a %d : %d' % (args.qte, touchees))
if ignorees:
    print('Laissees intactes : %s' % dict(ignorees))

if args.essai:
    print('\n--essai : rien n a ete ecrit.')
    sys.exit(0)

tmp = PATH + '.tmp'
with open(tmp, 'w', encoding='utf-8', newline='') as f:
    json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
json.load(open(tmp, encoding='utf-8'))        # relu avant de remplacer
os.replace(tmp, PATH)
print('\ndata/machines.json reecrit (compact, une ligne).')
