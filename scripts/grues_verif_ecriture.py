# -*- coding: utf-8 -*-
"""Verifie l'ecriture de la passe 2 : rien d'ecrase, rien de perdu, formats bons."""
import json, os, re, sys, subprocess, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
VIDE = ('', 'a completer', 'à compléter', 'n/d', 'nd', '-')
CHAMPS = ['Contrepoids max', 'Essieux', 'Fleche telescopique', 'Hauteur max',
          'Puissance moteur', 'Voltage machine (V/type)', 'Capacite max']


def vide(v):
    return str(v or '').strip().lower() in VIDE


avant = json.loads(subprocess.run(['git', 'show', '%s:data/machines.json' % BASE],
                                  capture_output=True, cwd=ROOT).stdout.decode('utf-8'))
apres = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))

# 1. aucun autre type de machine ne doit avoir bouge
for t in apres:
    if t == 'Grue Mobile':
        continue
    if json.dumps(apres[t], sort_keys=True) != json.dumps(avant.get(t), sort_keys=True):
        print('!! le type « %s » a ete modifie alors qu il ne devait pas' % t)
print('types autres que Grue Mobile : inchanges')

a, b = avant['Grue Mobile'], apres['Grue Mobile']
ecrases, remplis, vides_nouveaux, disparus = [], collections.Counter(), [], []
n_av = n_ap = 0
for f in b:
    if f.startswith('_'):
        continue
    for y in b[f]:
        for m, v in b[f][y].items():
            n_ap += 1
            ancienne = a.get(f, {}).get(y, {}).get(m)
            if ancienne is None:
                disparus.append(('AJOUTE', f, y, m))
                continue
            for c in CHAMPS:
                av, ap = ancienne.get(c), v.get(c)
                if not vide(av) and not vide(ap) and str(av).strip() != str(ap).strip():
                    ecrases.append((f, m, c, av, ap))
                elif vide(av) and not vide(ap):
                    remplis[c] += 1
                elif not vide(av) and vide(ap):
                    vides_nouveaux.append((f, m, c, av))
for f in a:
    if f.startswith('_'):
        continue
    for y in a[f]:
        n_av += len(a[f][y])

print('entrees avant : %d | apres : %d' % (n_av, n_ap))
print('\nchamps remplis (etaient vides) :')
for c, n in remplis.most_common():
    print('   %-30s %5d' % (c, n))
print('   TOTAL %d' % sum(remplis.values()))

print('\nVALEURS EXISTANTES ECRASEES : %d' % len(ecrases))
for f, m, c, av, ap in ecrases[:20]:
    print('   %-16s %-22s %-26s %r -> %r' % (f[:16], m[:22], c, av, ap))

print('\nvaleurs REMISES A VIDE (retrait volontaire Link-Belt) : %d' % len(vides_nouveaux))
par = collections.Counter((x[0], x[2]) for x in vides_nouveaux)
for (f, c), n in par.most_common():
    print('   %-16s %-30s %5d' % (f[:16], c, n))

print('\nmodeles ajoutes/supprimes : %d' % len(disparus))

# 2. formats
GAB = {
    'Contrepoids max': re.compile(r'^(Aucun|A completer|\d+(\.\d+)?\s?t)$'),
    'Hauteur max': re.compile(r'^(A completer|\d+(\.\d+)?\s?m)$'),
    'Essieux': re.compile(r'^(Chenilles|Selon châssis|A completer|\d)$'),
    'Voltage machine (V/type)': re.compile(
        r'^(A completer|24V DC|12V DC|12V ou 24V \(selon châssis\)|Électrique \(380V triphasé\))$'),
}
mauvais = collections.Counter()
exemples = collections.defaultdict(list)
for f in b:
    if f.startswith('_'):
        continue
    for y in b[f]:
        for m, v in b[f][y].items():
            for c, g in GAB.items():
                val = str(v.get(c) or '').strip()
                if val and not g.match(val):
                    mauvais[c] += 1
                    if len(exemples[c]) < 5:
                        exemples[c].append('%s %s = %r' % (f, m, val))
print('\nformats non conformes :', dict(mauvais) or 'aucun')
for c, ex in exemples.items():
    for e in ex:
        print('   %-30s %s' % (c, e))
