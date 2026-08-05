# -*- coding: utf-8 -*-
"""Avant de renommer : ou le nom d'un modele Cat sert-il de CLE ?

Recense tout ce qui serait perdu ou orpheline par un renommage :
machines.json, overrides par type, ancien overrides.json, parc installe.
"""
import json, os, sys, glob, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RENOMMAGES = {
    '301.7': '301.7 CR', '302': '302 CR', '302.7': '302.7 CR',
    '303': '303 CR', '303.5': '303.5 CR', '305': '305 CR',
    '306': '306 CR', '309': '309 CR',
}

mj = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))
cat = mj['Excavatrice']['Caterpillar']

print('=== 1. machines.json : entrees par modele a renommer ===')
tot = 0
for vieux, neuf in sorted(RENOMMAGES.items()):
    annees = sorted(y for y in cat if vieux in cat[y])
    collision = sorted(y for y in cat if neuf in cat[y])
    tot += len(annees)
    print('   %-8s -> %-10s %2d annees (%s-%s)%s'
          % (vieux, neuf, len(annees), annees[0] if annees else '-', annees[-1] if annees else '-',
             '   *** COLLISION : %s existe deja en %s ***' % (neuf, collision) if collision else ''))
print('   total : %d entrees annee-modele' % tot)

print('\n=== 2. overrides par type : BOM et notes rattaches ===')
ovp = os.path.join(ROOT, 'data', 'overrides', 'excavatrice.json')
ov = json.load(open(ovp, encoding='utf-8'))
ovcat = ov.get('Excavatrice', {}).get('Caterpillar', {})
total_ov = 0
for vieux, neuf in sorted(RENOMMAGES.items()):
    lignes = []
    for y in sorted(ovcat):
        e = ovcat[y].get(vieux)
        if e:
            bom = e.get('_bom') or {}
            codes = {k: v for k, v in bom.items() if k.isdigit()}
            lignes.append((y, len(codes), bool(bom.get('_removed')), bool(e.get('_notes'))))
    if lignes:
        total_ov += len(lignes)
        print('   %-8s : %d annee(s) avec override' % (vieux, len(lignes)))
        for y, nc, rem, note in lignes:
            print('       %s  %d code(s)%s%s' % (y, nc, '  _removed' if rem else '',
                                                 '  NOTE' if note else ''))
print('   total : %d overrides a deplacer' % total_ov)

print('\n=== 3. ancien overrides.json (repli legacy) ===')
leg = os.path.join(ROOT, 'data', 'overrides.json')
if os.path.exists(leg):
    l = json.load(open(leg, encoding='utf-8'))
    lc = l.get('Excavatrice', {}).get('Caterpillar', {})
    n = sum(1 for y in lc for m in lc[y] if m in RENOMMAGES)
    print('   %d entree(s) concernee(s) — fichier NON lu tant que les 10 fichiers par type existent'
          % n)

print('\n=== 4. parc installe (installed_machines.json) ===')
inst = json.load(open(os.path.join(ROOT, 'data', 'installed_machines.json'), encoding='utf-8'))
s = json.dumps(inst, ensure_ascii=False)
touche = collections.Counter()
for vieux in RENOMMAGES:
    for it in inst:
        if isinstance(it, dict) and any(str(v).strip() == vieux for v in it.values()):
            touche[vieux] += 1
print('   references exactes a un modele renomme :', dict(touche) or 'aucune')

print('\n=== 5. autres fichiers ou le nom pourrait servir de cle ===')
for p in glob.glob(os.path.join(ROOT, 'data', '*.json')) + glob.glob(os.path.join(ROOT, 'js', '*.js')):
    txt = open(p, encoding='utf-8').read()
    hits = [v for v in RENOMMAGES if ('"%s"' % v) in txt]
    if hits and os.path.basename(p) not in ('machines.json',):
        print('   %-34s contient %s' % (os.path.relpath(p, ROOT), hits))
