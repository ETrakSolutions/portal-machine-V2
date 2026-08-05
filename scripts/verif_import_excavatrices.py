# -*- coding: utf-8 -*-
"""Verification post-import : les 229 modeles sont-ils bien en BD, avec des
donnees coherentes ? Controle aussi qu'aucune entree existante n'a bouge."""
import json, os, re, sys, collections, subprocess

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_excavatrices_manquantes import FAB_MAP, clean_modele, poids_kg_list

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))
ex = db['Excavatrice']
lot = json.load(open(os.path.join(ROOT, 'scripts', 'data',
                                  'excavatrices_manquantes_2026-07.json'), encoding='utf-8'))

# --- 1. version AVANT (git HEAD) pour comparer
raw = subprocess.run(['git', 'show', 'HEAD:data/machines.json'],
                     capture_output=True, cwd=ROOT).stdout.decode('utf-8')
old = json.loads(raw)['Excavatrice']

old_entries, new_entries = {}, {}
for src, dst in ((old, old_entries), (ex, new_entries)):
    for fab, yy in src.items():
        if fab.startswith('_'):
            continue
        for y, mm in yy.items():
            for m, v in mm.items():
                dst[(fab, y, m)] = v

added = set(new_entries) - set(old_entries)
removed = set(old_entries) - set(new_entries)
modified = [k for k in set(new_entries) & set(old_entries)
            if json.dumps(new_entries[k], sort_keys=True) != json.dumps(old_entries[k], sort_keys=True)]

print('entrees avant  : %d' % len(old_entries))
print('entrees apres  : %d' % len(new_entries))
print('ajoutees       : %d' % len(added))
print('SUPPRIMEES     : %d %s' % (len(removed), sorted(removed)[:5]))
print('MODIFIEES      : %d %s' % (len(modified), sorted(modified)[:5]))

# --- 2. les modeles du lot sont-ils tous la ?
manquants = []
for x in lot:
    fab = FAB_MAP.get(x['fab'], x['fab'])
    m = clean_modele(x['modele'])
    if not any(k[0] == fab and k[2] == m for k in added):
        manquants.append((fab, m, x['annees']))
print('\nmodeles du lot absents apres import : %d' % len(manquants))
for f, m, a in manquants:
    print('   %-14s %-22s %s' % (f, m, a))

# --- 3. coherence des entrees ajoutees
REQ = ['Flag', 'Puissance moteur (kW / HP)', 'Type de traction', 'Type de boom',
       'Longueur de fleche (m / pi)', 'Longueur de stick (m / pi)', 'Swing boom',
       'Voltage machine (V/type)', 'Capacite max de levage (kg / lbs)',
       'Poids operationnel (kg / lbs)', 'Classe machine', 'Test Robin',
       '_harnais', '_source_bom', '_actif']
probs = collections.Counter()
for k in added:
    v = new_entries[k]
    for f in REQ:
        if f not in v:
            probs['champ manquant: ' + f] += 1
    kg = poids_kg_list(v.get('Poids operationnel (kg / lbs)', ''))
    if not kg:
        probs['poids illisible'] += 1
    else:
        volt = v.get('Voltage machine (V/type)')
        if (kg[0] < 5000) != (volt == '12V DC'):
            probs['voltage incoherent avec le poids'] += 1
    if v.get('Type de traction') == 'Roue' and v.get('Type de boom') != 'Boom 2 parties (articule)':
        probs['roue sans boom 2 parties'] += 1
    if not v.get('_harnais'):
        probs['harnais vide'] += 1
print('\nanomalies sur les entrees ajoutees : %s' % (dict(probs) or 'aucune'))

# --- 4. echantillon
print('\n--- echantillon ---')
for k in sorted(added)[:2] + sorted(added)[-2:]:
    print(k, '->', json.dumps(new_entries[k], ensure_ascii=False)[:260])

# --- 5. repartition
print('\nmodeles distincts ajoutes : %d' % len({(k[0], k[2]) for k in added}))
print('par marque :', dict(collections.Counter(k[0] for k in {(k[0], k[2]) for k in added})))
