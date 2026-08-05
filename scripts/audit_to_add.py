# -*- coding: utf-8 -*-
"""Audit qualite du lot _to_add.json avant import dans data/machines.json.

Ne modifie RIEN. Produit un rapport :
  - collisions avec des modeles deja en BD
  - noms de modeles non conformes aux conventions de la BD (parentheses, slash)
  - poids non parsables / incoherents
  - classes divergentes entre l'audit et la bande de poids observee en BD
  - annees hors des annees existantes du fabricant
"""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))
EX = DB['Excavatrice']
LOT = json.load(open(os.path.join(ROOT, 'scripts', 'data',
                                  'excavatrices_manquantes_2026-07.json'), encoding='utf-8'))

FAB_MAP = {'Hyundai (HD Hyundai Construction Equipment)': 'Hyundai'}

# Bandes de classe deduites des donnees existantes (kg -> classe)
BANDS = [(5000, 'Mini'), (10000, 'Compact'), (14000, '120'), (22000, '200'),
         (30000, '270'), (40000, '300'), (55000, '400'), (70000, '500'),
         (101000, '700-800'), (10**9, '1000+')]


def classe_par_poids(kg):
    for lim, c in BANDS:
        if kg < lim:
            return c
    return '1000+'


def parse_kg(s):
    m = re.search(r'(\d[\d\s]*)', str(s))
    return int(m.group(1).replace(' ', '')) if m else 0


def norm(name):
    return re.sub(r'[^A-Z0-9]', '', str(name).upper())


# index des modeles existants par fabricant
existing = collections.defaultdict(dict)   # fab -> normalized -> (nom, annees)
for fab, yy in EX.items():
    if fab.startswith('_'):
        continue
    for y, mm in yy.items():
        for m in mm:
            existing[fab].setdefault(norm(m), [m, set()])[1].add(y)

print('=== 1. CONVENTIONS DE NOMMAGE EN BD ===')
allnames = [m for fab in existing for m, _ in [(v[0], 0) for v in existing[fab].values()]]
print('  modeles distincts en BD :', len(allnames))
print('  contenant "/" :', sum(1 for m in allnames if '/' in m), '| ex.:',
      [m for m in allnames if '/' in m][:5])
print('  contenant "(" :', sum(1 for m in allnames if '(' in m), '| ex.:',
      [m for m in allnames if '(' in m][:5])

print('\n=== 2. COLLISIONS (modele deja en BD) ===')
ncol = 0
for x in LOT:
    fab = FAB_MAP.get(x['fab'], x['fab'])
    hit = existing.get(fab, {}).get(norm(x['modele']))
    if hit:
        ncol += 1
        print('  %-16s %-28s -> deja en BD sous "%s" (%s)' %
              (fab[:16], x['modele'], hit[0], '-'.join(sorted(hit[1])[:1] + sorted(hit[1])[-1:])))
print('  total collisions :', ncol)

print('\n=== 3. NOMS NON CONFORMES (parenthese / slash / espaces doubles) ===')
for x in LOT:
    m = x['modele']
    if '(' in m or '/' in m or '  ' in m:
        print('  %-16s %s' % (FAB_MAP.get(x['fab'], x['fab'])[:16], m))

print('\n=== 4. POIDS : parsing + coherence classe ===')
divergences = []
for x in LOT:
    fab = FAB_MAP.get(x['fab'], x['fab'])
    kg = parse_kg(x['poids'])
    cp = classe_par_poids(kg) if kg else '?'
    if kg == 0:
        print('  POIDS ILLISIBLE  %-16s %-24s %r' % (fab[:16], x['modele'], x['poids']))
    elif cp != x['classe']:
        divergences.append((fab, x['modele'], kg, x['classe'], cp))
print('  divergences classe audit vs bande de poids : %d' % len(divergences))
for fab, m, kg, ca, cp in divergences:
    print('    %-16s %-26s %7d kg  audit=%-22s bande=%s' % (fab[:16], m, kg, ca, cp))

print('\n=== 5. ANNEES hors couverture du fabricant ===')
for x in LOT:
    fab = FAB_MAP.get(x['fab'], x['fab'])
    dbyears = set(EX.get(fab, {}).keys())
    a = re.findall(r'\d{4}', x['annees'])
    if not a:
        print('  ANNEES ILLISIBLES %-16s %-24s %r' % (fab[:16], x['modele'], x['annees']))
        continue
    lo, hi = int(a[0]), int(a[-1])
    want = set(str(y) for y in range(lo, hi + 1))
    miss = sorted(want - dbyears)
    if miss:
        print('  %-16s %-24s %s -> annees absentes du fab : %s' %
              (fab[:16], x['modele'], x['annees'], ','.join(miss)))

print('\n=== 6. FABRICANTS ===')
for f in sorted(set(FAB_MAP.get(x['fab'], x['fab']) for x in LOT)):
    print('  %-20s %s' % (f, 'OK (existe)' if f in EX else '*** NOUVEAU ***'))
