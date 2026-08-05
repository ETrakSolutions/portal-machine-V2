# -*- coding: utf-8 -*-
"""Contre-verification des classes recalculees : compare avec le modele de la
MEME marque dont le poids est le plus proche (accord = classe coherente)."""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_excavatrices_manquantes import (FAB_MAP, clean_modele, poids_kg_list,
                                            db_weight_points, classe_voisins, norm)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))
ex = db['Excavatrice']
pts = db_weight_points(ex)
lot = json.load(open(os.path.join(ROOT, 'scripts', 'data',
                                  'excavatrices_manquantes_2026-07.json'), encoding='utf-8'))

# poids/classe par marque
bybrand = collections.defaultdict(dict)
for fab, yy in ex.items():
    if fab.startswith('_'):
        continue
    for y, mm in yy.items():
        for m, v in mm.items():
            if not isinstance(v, dict):
                continue
            n = poids_kg_list(v.get('Poids operationnel (kg / lbs)', ''))
            if n and v.get('Classe machine'):
                bybrand[fab][m] = (n[0], v['Classe machine'])

accord = desaccord = sansvoisin = 0
lignes = []
for x in lot:
    fab = FAB_MAP.get(x['fab'], x['fab'])
    m = clean_modele(x['modele'])
    nums = poids_kg_list(x['poids'])
    if not nums:
        continue
    kg = nums[0]
    calc, _, _ = classe_voisins(kg, pts)
    cands = bybrand.get(fab, {})
    if not cands:
        sansvoisin += 1
        continue
    best = min(cands.items(), key=lambda kv: abs(kv[1][0] - kg))
    bm, (bkg, bcl) = best
    if abs(bkg - kg) > kg * 0.15:
        sansvoisin += 1
        continue
    if bcl == calc:
        accord += 1
    else:
        desaccord += 1
        lignes.append('  %-14s %-22s %7d kg  calcule=%-8s | voisin marque %-18s %7d kg = %s'
                      % (fab[:14], m, kg, calc, bm, bkg, bcl))

print('accord avec le voisin de la meme marque : %d' % accord)
print('desaccord                                : %d' % desaccord)
print('pas de voisin marque a +/-15 %%           : %d' % sansvoisin)
if lignes:
    print('\n--- DESACCORDS ---')
    print('\n'.join(lignes))
