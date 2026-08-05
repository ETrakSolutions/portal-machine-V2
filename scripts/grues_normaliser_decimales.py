# -*- coding: utf-8 -*-
"""Normalise les separateurs decimaux du type Grue Mobile : « 31,3 t » -> « 31.3 t ».

Defaut PREEXISTANT (55 entrees, Kobelco et Manitowoc) : la virgule cohabite avec
le point dans le meme champ, ce qui casse toute lecture numerique (tri, controle
de vraisemblance, export). Changement purement typographique — la valeur reste
identique.

N'y touche que si le motif est « nombre,nombre unite » : on ne modifie pas les
chaines qui contiennent une virgule de ponctuation.

Usage : python scripts/grues_normaliser_decimales.py [--write]
"""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
WRITE = '--write' in sys.argv

# « 12,5 t » / « 43,6 m » / « 9,1 kW » : un seul nombre a virgule suivi d'une unite
MOTIF = re.compile(r'^(\d+),(\d+)(\s*)(t|m|kW|hp)$')
CHAMPS = ['Contrepoids max', 'Hauteur max', 'Capacite max', 'Puissance moteur',
          'Fleche telescopique']

db = json.load(open(MJ, encoding='utf-8'))
gm = db['Grue Mobile']
change = collections.Counter()
exemples = set()
for f in gm:
    if f.startswith('_'):
        continue
    for y in gm[f]:
        for m, v in gm[f][y].items():
            if not isinstance(v, dict):
                continue
            for c in CHAMPS:
                val = str(v.get(c) or '').strip()
                mt = MOTIF.match(val)
                if mt:
                    neuf = '%s.%s%s%s' % (mt.group(1), mt.group(2), mt.group(3), mt.group(4))
                    exemples.add('%-16s %-20s %-18s %r -> %r' % (f[:16], m[:20], c, val, neuf))
                    change[(f, c)] += 1
                    if WRITE:
                        v[c] = neuf

print('entrees normalisees : %d' % sum(change.values()))
for (f, c), n in sorted(change.items()):
    print('   %-16s %-24s %4d' % (f[:16], c, n))
print()
for e in sorted(exemples)[:12]:
    print('  ', e)

if WRITE:
    with open(MJ, 'w', encoding='utf-8') as fh:
        json.dump(db, fh, ensure_ascii=False, separators=(',', ':'))
    print('\nECRIT dans data/machines.json')
else:
    print('\n(simulation — relancer avec --write)')
