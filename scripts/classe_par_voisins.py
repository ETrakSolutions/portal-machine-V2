# -*- coding: utf-8 -*-
"""Deduit la classe machine d'un poids a partir des VOISINS reels de la BD.

Methode : pour un poids P, on prend toutes les excavatrices de la BD dont le
poids est dans +/- 7 % de P et on retient la classe majoritaire. C'est la
convention reellement observee dans machines.json (les classes sont des
classes de tonnage constructeur, pas des bandes strictes).
"""
import json, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_db_weights():
    db = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))
    pts = []   # (kg, classe)
    for fab, yy in db['Excavatrice'].items():
        if fab.startswith('_'):
            continue
        for y, mm in yy.items():
            for m, v in mm.items():
                if not isinstance(v, dict):
                    continue
                kg = parse_kg(v.get('Poids operationnel (kg / lbs)'))
                c = v.get('Classe machine')
                if kg and c:
                    pts.append((kg, c))
    pts.sort()
    return pts


def parse_kg(s):
    m = re.search(r'(\d[\d\s]*)', str(s or ''))
    return int(m.group(1).replace(' ', '')) if m else 0


def classe_voisins(kg, pts, tol=0.07):
    lo, hi = kg * (1 - tol), kg * (1 + tol)
    c = collections.Counter(cl for w, cl in pts if lo <= w <= hi)
    if not c:
        # elargit progressivement
        for t in (0.12, 0.20, 0.35):
            lo, hi = kg * (1 - t), kg * (1 + t)
            c = collections.Counter(cl for w, cl in pts if lo <= w <= hi)
            if c:
                break
    if not c:
        return '', 0, 0
    top, n = c.most_common(1)[0]
    return top, n, sum(c.values())


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    pts = load_db_weights()
    print('points BD :', len(pts))
    for kg in (1780, 2478, 3770, 4540, 4970, 5150, 6000, 7500, 8500, 10625,
               13500, 15000, 17000, 22000, 24900, 29200, 33500, 37000, 39000,
               48000, 50700, 54885, 74400, 90000, 95000):
        c, n, tot = classe_voisins(kg, pts)
        print('  %7d kg -> %-8s (%d/%d voisins)' % (kg, c, n, tot))
