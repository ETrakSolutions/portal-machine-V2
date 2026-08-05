# -*- coding: utf-8 -*-
"""Normalise les « Hauteur max » Altec sur la convention de la base.

CONVENTION (etablie par la mesure, pas par hypothese) : « Hauteur max » = hauteur
maximale ATTEIGNABLE, flechette incluse. Sur les 279 modeles ou hauteur et fleche
sont toutes deux renseignees, 249 ont hauteur > fleche, ratio median 1.40
(scripts/grues_convention_hauteur.py). Altec etait la seule exception : ses
valeurs etaient des hauteurs en fleche seule.

Valeurs verifiees une par une sur les spec sheets officielles Altec.

CAS PARTICULIERS — a ne PAS toucher :
  * AC30-53T   : aucune flechette au catalogue (grue-tracteur a sellette, fleche
                 3 sections de 53 pi). Sa hauteur en fleche seule EST sa hauteur
                 max atteignable. 19.2 m est deja conforme.
  * AC40E-152S : deja a la bonne valeur (63.1 m, avec flechette).

PIEGE ECARTE : les fiches AC40E-152S et AC65E-155S contiennent une table AERIAL
SPECIFICATIONS (ANSI A92.2) avec des « Platform Working Height » de 65.6 / 67.7
et 65.8 m. Ce sont des hauteurs de plancher de nacelle, PAS des hauteurs de
poulie de grue. Ne pas les reprendre.

Ce script ECRASE des valeurs existantes — c'est une correction voulue, pas un
remplissage. Il verifie donc la valeur de depart avant de changer quoi que ce soit.

Usage : python scripts/grues_normaliser_hauteurs_altec.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
WRITE = '--write' in sys.argv
CHAMP = 'Hauteur max'

# modele : (valeur attendue avant, valeur apres, fleche seule, note)
CORRECTIONS = {
    'AC18-70B':   ('24.4 m', '36.6 m', '24.4 m', 'flechette 2 pieces 24-40 pi (option)'),
    'AC23-95S':   ('32.0 m', '45.4 m', '32.0 m', 'flechette 1 piece 26 pi / 2 pieces 26-44 pi'),
    'AC38-127S':  ('41.8 m', '58.5 m', '41.8 m', 'flechette 1 piece 31 pi / 2 pieces 55 pi'),
    'AC45E-127S': ('41.1 m', '57.6 m', '41.2 m', 'flechette IJ26 / 1 piece 31 pi / 2 pieces 55 pi'),
    'AC65E-155S': ('',       '65.5 m', '50.2 m', 'deux flechettes 2 etages de 50 pi'),
}
INCHANGES = {
    'AC30-53T':   'aucune flechette au catalogue -> 19.2 m est deja la hauteur max atteignable',
    'AC40E-152S': 'deja conforme (63.1 m, avec flechette)',
}

db = json.load(open(MJ, encoding='utf-8'))
alt = db['Grue Mobile']['Altec']

print('=== CONTROLE AVANT ECRITURE ===')
ok = True
for mod, (attendu, _neuf, _fs, _n) in CORRECTIONS.items():
    annees = sorted(y for y in alt if mod in alt[y])
    if not annees:
        print('  !! %s absent de la BD' % mod)
        ok = False
        continue
    valeurs = {str(alt[y][mod].get(CHAMP) or '').strip() for y in annees}
    attendu_norm = attendu if attendu else 'A completer'
    inattendu = valeurs - {attendu_norm}
    if inattendu:
        print('  !! %s : valeur de depart inattendue %s (attendu %r)'
              % (mod, sorted(inattendu), attendu_norm))
        ok = False
    else:
        print('  ok %-12s %-12s -> %-10s (%d annees)  [%s]'
              % (mod, attendu_norm, CORRECTIONS[mod][1], len(annees), CORRECTIONS[mod][3]))
if not ok:
    sys.exit('\nARRET : etat de depart different de celui verifie. Rien ecrit.')

print('\n=== LAISSES INCHANGES ===')
for mod, motif in INCHANGES.items():
    annees = sorted(y for y in alt if mod in alt[y])
    val = str(alt[annees[0]][mod].get(CHAMP) or '').strip() if annees else '?'
    print('  -- %-12s %-10s %s' % (mod, val, motif))

n = 0
if WRITE:
    for mod, (_a, neuf, _fs, _note) in CORRECTIONS.items():
        for y in alt:
            if mod in alt[y]:
                alt[y][mod][CHAMP] = neuf
                n += 1
    with open(MJ, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
    print('\nECRIT : %d entrees' % n)
else:
    print('\n(simulation — relancer avec --write)')

# ratios resultants, pour controle de coherence avec la mediane de 1.40
print('\n=== ratios hauteur/fleche apres normalisation ===')
import re
for mod in sorted(set(list(CORRECTIONS) + list(INCHANGES))):
    annees = sorted(y for y in alt if mod in alt[y])
    if not annees:
        continue
    e = alt[annees[0]][mod]
    h = CORRECTIONS.get(mod, (None, str(e.get(CHAMP))))[1] if mod in CORRECTIONS else str(e.get(CHAMP))
    fl = str(e.get('Fleche telescopique') or '')
    hn = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', h)]
    fn = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', fl)]
    if hn and fn:
        print('   %-12s fleche %6.1f m  hauteur %6.1f m  x%.2f'
              % (mod, max(fn), max(hn), max(hn) / max(fn)))
