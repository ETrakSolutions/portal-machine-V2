# -*- coding: utf-8 -*-
"""Renomme le type « Tracteur de ferme » en « Tracteur » (et son slug).

Fait AVANT la configuration du backend et de la liste blanche, pour que Jacquot
ne configure qu une seule fois, avec le nom definitif. Le type est encore vide
(aucun modele, aucun override), le renommage est donc sans risque de perte —
contrairement au renommage des mini Cat, ou 63 overrides suivaient les noms.

Usage : python scripts/renommer_type_tracteur.py [--write]
"""
import io, json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITE = '--write' in sys.argv

ANCIEN, NOUVEAU = 'Tracteur de ferme', 'Tracteur'
ANCIEN_SLUG, NOUVEAU_SLUG = 'tracteur-de-ferme', 'tracteur'

# (fichier, [(avant, apres), ...])
REMPLACEMENTS = [
    ('js/overrides-loader.js', [("'Tracteur de ferme': 'tracteur-de-ferme'", "'Tracteur': 'tracteur'")]),
    ('js/translations.js', [("'type.Tracteur de ferme': 'Tracteur de ferme'", "'type.Tracteur': 'Tracteur'"),
                            ("'type.Tracteur de ferme': 'Farm Tractor'", "'type.Tracteur': 'Tractor'")]),
    ('js/export.js', [("'Tracteur de ferme'", "'Tracteur'")]),
    ('js/admin.js', [("'Tracteur de ferme'", "'Tracteur'")]),
    ('js/edit-machine.js', [("'Tracteur de ferme':'🚜'", "'Tracteur':'🚜'")]),
    ('js/soumission.js', [("type === 'Tracteur de ferme'", "type === 'Tracteur'")]),
    ('database.html', [("'Tracteur de ferme':", "'Tracteur':")]),
    ('scripts/selenium_type_tracteur_test.py', [("TYPE = 'Tracteur de ferme'", "TYPE = 'Tracteur'")]),
    ('scripts/creer_type_tracteur.py', [("TYPE = 'Tracteur de ferme'", "TYPE = 'Tracteur'"),
                                        ("SLUG = 'tracteur-de-ferme'", "SLUG = 'tracteur'")]),
]

print('=== CODE ===')
for rel, paires in REMPLACEMENTS:
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(p):
        print('   ABSENT : %s' % rel)
        continue
    s = io.open(p, encoding='utf-8').read()
    if len(s) < 100:
        print('   IGNORE (suspect) : %s' % rel)
        continue
    neuf, n = s, 0
    for a, b in paires:
        n += neuf.count(a)
        neuf = neuf.replace(a, b)
    print('   %-42s %d occurrence(s)' % (rel, n))
    if WRITE and neuf != s:
        io.open(p, 'w', encoding='utf-8', newline='').write(neuf)

print('\n=== DONNEES ===')
MJ = os.path.join(ROOT, 'data', 'machines.json')
db = json.load(open(MJ, encoding='utf-8'))
if ANCIEN in db:
    vide = not [f for f in db[ANCIEN] if not f.startswith('_')]
    print('   machines.json : « %s » present, vide de modeles : %s' % (ANCIEN, vide))
    if not vide:
        sys.exit('   ARRET : le type contient des modeles, renommage a traiter comme celui des Cat.')
    if WRITE:
        db[NOUVEAU] = db.pop(ANCIEN)
        with open(MJ, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
        print('   -> renomme en « %s »' % NOUVEAU)
else:
    print('   machines.json : « %s » deja absent' % ANCIEN)

ovA = os.path.join(ROOT, 'data', 'overrides', ANCIEN_SLUG + '.json')
ovB = os.path.join(ROOT, 'data', 'overrides', NOUVEAU_SLUG + '.json')
if os.path.exists(ovA):
    contenu = json.load(open(ovA, encoding='utf-8'))
    print('   overrides : %s -> %s (contenu : %s)'
          % (os.path.basename(ovA), os.path.basename(ovB), contenu or 'vide'))
    if WRITE:
        with open(ovB, 'w', encoding='utf-8') as f:
            json.dump(contenu, f, ensure_ascii=False)
        os.remove(ovA)
else:
    print('   overrides : %s absent' % os.path.basename(ovA))

if WRITE:
    print('\nECRIT.')
    reste = []
    for dirpath, _d, files in os.walk(ROOT):
        if '.git' in dirpath:
            continue
        for fn in files:
            if not fn.endswith(('.js', '.html', '.py', '.json')):
                continue
            fp = os.path.join(dirpath, fn)
            try:
                if ANCIEN in io.open(fp, encoding='utf-8').read():
                    reste.append(os.path.relpath(fp, ROOT))
            except Exception:
                pass
    print('fichiers contenant encore « %s » : %s' % (ANCIEN, reste or 'aucun'))
else:
    print('\n(simulation — relancer avec --write)')
