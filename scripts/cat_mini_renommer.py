# -*- coding: utf-8 -*-
"""Renomme les mini-excavatrices Cat au nom EXACT utilise par Caterpillar (suffixe CR).

Motif : la base ecrivait « 308 CR » avec son suffixe mais « 305 », « 306 », « 309 »,
« 303 », « 302 » sans, alors que Caterpillar les nomme toutes « CR ». Une machine
cherchee sous son vrai nom (ex. « 305 CR ») restait donc introuvable.

POINT CRITIQUE : le nom du modele est une CLE. 63 overrides BOM y sont rattaches,
dont la 305 qui porte une configuration complete de 9 codes sur 10 annees. Le
renommage deplace donc EN VERROU :
  - data/machines.json
  - data/overrides/excavatrice.json          (lu par le portail)
  - data/overrides.json                      (repli legacy : renomme aussi, sinon
                                              un repli rendrait les machines sans config)

Controles avant ecriture : aucune collision de nom, et apres ecriture : meme
nombre d entrees, contenu des overrides identique octet pour octet.

Usage : python scripts/cat_mini_renommer.py [--write]
"""
import json, os, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WRITE = '--write' in sys.argv

RENOMMAGES = {
    '301.7': '301.7 CR', '302': '302 CR', '302.7': '302.7 CR',
    '303': '303 CR', '303.5': '303.5 CR', '305': '305 CR',
    '306': '306 CR', '309': '309 CR',
}
# Volontairement NON renommes :
#   304, 301.8, 307.5, 310  -> Caterpillar ne leur met pas de « CR »
#   300.9, 301.4, 301.6, 302.4, 305.5, 308 -> generations anterieures (D/E/E2),
#     dont le nom exact varie selon le millesime : a traiter separement.
FICHIERS = [
    ('data/machines.json', True),
    ('data/overrides/excavatrice.json', False),
    ('data/overrides.json', False),
]


def charger(rel):
    p = os.path.join(ROOT, rel.replace('/', os.sep))
    return (p, json.load(open(p, encoding='utf-8'))) if os.path.exists(p) else (p, None)


def cat_de(doc):
    return (doc or {}).get('Excavatrice', {}).get('Caterpillar')


# --- controle prealable : collisions
print('=== CONTROLE DES COLLISIONS ===')
stop = False
for rel, _ in FICHIERS:
    p, doc = charger(rel)
    c = cat_de(doc)
    if not c:
        print('   %-36s (pas de section Caterpillar)' % rel)
        continue
    for vieux, neuf in RENOMMAGES.items():
        for y in c:
            if neuf in c[y] and vieux in c[y]:
                print('   !! %s %s : « %s » ET « %s » coexistent' % (rel, y, vieux, neuf))
                stop = True
    print('   %-36s ok' % rel)
if stop:
    sys.exit('\nARRET : collision detectee, rien ecrit.')

# --- empreinte avant
avant = {}
for rel, _ in FICHIERS:
    p, doc = charger(rel)
    c = cat_de(doc)
    if not c:
        continue
    for y in c:
        for m, e in c[y].items():
            if m in RENOMMAGES:
                avant[(rel, y, RENOMMAGES[m])] = json.dumps(e, sort_keys=True, ensure_ascii=False)

print('\n=== RENOMMAGE (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
compte = collections.Counter()
for rel, _ in FICHIERS:
    p, doc = charger(rel)
    c = cat_de(doc)
    if not c:
        continue
    n = 0
    for y in list(c):
        for vieux, neuf in RENOMMAGES.items():
            if vieux in c[y]:
                if WRITE:
                    c[y][neuf] = c[y].pop(vieux)
                n += 1
                compte[(rel, vieux)] += 1
    print('   %-36s %3d entrees' % (rel, n))
    if WRITE and n:
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))

print('\n   detail par modele :')
for vieux, neuf in sorted(RENOMMAGES.items()):
    tot = sum(v for (r, m), v in compte.items() if m == vieux)
    par = {os.path.basename(r): v for (r, m), v in compte.items() if m == vieux}
    print('      %-8s -> %-10s %3d  %s' % (vieux, neuf, tot, par))

if not WRITE:
    print('\n(simulation — relancer avec --write)')
    sys.exit(0)

# --- verification apres ecriture
print('\n=== VERIFICATION APRES ECRITURE ===')
pb = 0
for rel, _ in FICHIERS:
    p, doc = charger(rel)
    c = cat_de(doc)
    if not c:
        continue
    restants = [(y, m) for y in c for m in c[y] if m in RENOMMAGES]
    if restants:
        print('   !! %s : ancien nom encore present %s' % (rel, restants[:5]))
        pb += 1
    for y in c:
        for m, e in c[y].items():
            cle = (rel, y, m)
            if cle in avant:
                if json.dumps(e, sort_keys=True, ensure_ascii=False) != avant[cle]:
                    print('   !! %s %s %s : contenu MODIFIE par le renommage' % (rel, y, m))
                    pb += 1
                del avant[cle]
if avant:
    print('   !! %d entree(s) attendue(s) introuvable(s) apres renommage :' % len(avant))
    for k in list(avant)[:5]:
        print('        ', k)
    pb += 1
print('   contenu preserve, aucun ancien nom restant' if not pb else '   %d PROBLEME(S)' % pb)
sys.exit(1 if pb else 0)
