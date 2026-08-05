# -*- coding: utf-8 -*-
"""Quelle convention la BD applique-t-elle deja pour « Hauteur max » ?

Compare, sur les modeles ou les deux champs sont renseignes, la « Hauteur max »
a la longueur maximale de « Fleche telescopique ». Si les deux sont proches,
la convention en place est « fleche principale seule ». Si la hauteur depasse
nettement la fleche, la convention inclut la fleche additionnelle (jib).
"""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
gm = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))['Grue Mobile']
fam = {tuple(k.split('|', 1)): v for k, v in
       json.load(open(os.path.join(ROOT, 'scripts', 'data', 'grues_familles.json'),
                      encoding='utf-8')).items()}

VIDE = ('', 'a completer', 'à compléter', 'n/d', 'nd', '-')


def vide(v):
    return str(v or '').strip().lower() in VIDE


def maxi(s):
    """Plus grand nombre d'une chaine (« 12-47 m » -> 47)."""
    n = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', str(s or ''))]
    return max(n) if n else None


vus = {}
for f in gm:
    if f.startswith('_'):
        continue
    for y in gm[f]:
        for m, v in gm[f][y].items():
            if isinstance(v, dict):
                vus.setdefault((f, m), v)

paires = []
for (f, m), v in vus.items():
    h, fl = v.get('Hauteur max'), v.get('Fleche telescopique')
    if vide(h) or vide(fl):
        continue
    hn, fn = maxi(h), maxi(fl)
    if not hn or not fn:
        continue
    paires.append((f, m, fam[(f, m)], fn, hn, hn / fn))

print('modeles avec hauteur ET fleche renseignees : %d' % len(paires))
if not paires:
    sys.exit(0)

seuil_egal = [p for p in paires if 0.95 <= p[5] <= 1.05]
seuil_plus = [p for p in paires if p[5] > 1.05]
seuil_moins = [p for p in paires if p[5] < 0.95]
print('  hauteur ~= fleche (0.95-1.05) : %3d  -> convention « fleche seule »' % len(seuil_egal))
print('  hauteur > fleche (>1.05)      : %3d  -> convention « avec fleche additionnelle »' % len(seuil_plus))
print('  hauteur < fleche (<0.95)      : %3d' % len(seuil_moins))

print('\npar famille (ratio median hauteur/fleche) :')
parfam = collections.defaultdict(list)
for f, m, fa, fn, hn, r in paires:
    parfam[fa].append(r)
for fa in sorted(parfam):
    v = sorted(parfam[fa])
    print('   %-30s n=%3d  median=%.2f  min=%.2f  max=%.2f'
          % (fa, len(v), v[len(v) // 2], v[0], v[-1]))

print('\nexemples hauteur > fleche :')
for f, m, fa, fn, hn, r in sorted(seuil_plus, key=lambda p: -p[5])[:12]:
    print('   %-16s %-22s fleche %6.1f m  hauteur %6.1f m  (x%.2f)' % (f[:16], m[:22], fn, hn, r))
print('\nexemples hauteur ~= fleche :')
for f, m, fa, fn, hn, r in seuil_egal[:12]:
    print('   %-16s %-22s fleche %6.1f m  hauteur %6.1f m  (x%.2f)' % (f[:16], m[:22], fn, hn, r))
