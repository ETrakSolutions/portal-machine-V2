# -*- coding: utf-8 -*-
"""Perimetre reel des specs manquantes du type Grue Mobile, au niveau MODELE
(pas au niveau entree annee x modele, qui gonfle artificiellement les chiffres).

Distingue trois natures de trou :
  A) comblable par PROPAGATION INTERNE : une autre annee du meme modele porte
     deja la valeur -> recopie sans risque ;
  B) STRUCTUREL : la valeur n'a pas de sens pour ce type de grue (essieux d'une
     grue sur chenilles, fleche telescopique d'une treillis) -> « N/A » ;
  C) A CHERCHER : reellement inconnu, necessite une source constructeur.
"""
import json, os, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))
gm = db['Grue Mobile']

VIDE = ('', 'a completer', 'à compléter', 'a compléter', 'n/d', 'nd', '-')


def est_vide(v):
    return str(v or '').strip().lower() in VIDE


# modele -> {champ -> set(valeurs non vides)} + annees
modeles = collections.defaultdict(lambda: collections.defaultdict(set))
annees = collections.defaultdict(set)
champs = set()
for fab in gm:
    if fab.startswith('_'):
        continue
    for y, mm in gm[fab].items():
        for m, v in mm.items():
            if not isinstance(v, dict):
                continue
            annees[(fab, m)].add(y)
            for k, val in v.items():
                if k.startswith('_') or k in ('Flag', 'Image'):
                    continue
                champs.add(k)
                if not est_vide(val):
                    modeles[(fab, m)][k].add(str(val).strip())

print('champs du type Grue Mobile :')
for c in sorted(champs):
    print('   -', c)
print('\nmodeles distincts : %d' % len(modeles))

SPECS = [c for c in sorted(champs) if c not in ('Type de grue', 'Type')]

# --- A) propagation interne possible ?
propagation = collections.Counter()
a_chercher = collections.defaultdict(list)
incoherences = []
for (fab, m), vals in modeles.items():
    for c in SPECS:
        v = vals.get(c, set())
        if len(v) > 1:
            incoherences.append((fab, m, c, sorted(v)[:4]))
        if not v:
            a_chercher[c].append((fab, m))
        else:
            # une valeur existe : reste-t-il des annees vides pour ce modele ?
            manquantes = 0
            for y in annees[(fab, m)]:
                e = gm[fab][y].get(m)
                if isinstance(e, dict) and est_vide(e.get(c)):
                    manquantes += 1
            if manquantes:
                propagation[c] += manquantes

print('\n--- A) PROPAGATION INTERNE (entrees comblables sans source externe) ---')
tot_prop = 0
for c, n in propagation.most_common():
    print('   %-30s %5d entrees' % (c, n))
    tot_prop += n
print('   TOTAL : %d entrees' % tot_prop)

print('\n--- valeurs contradictoires entre annees d\'un meme modele ---')
for fab, m, c, v in incoherences[:15]:
    print('   %-16s %-22s %-24s %s' % (fab[:16], m[:22], c, v))
print('   total : %d' % len(incoherences))

print('\n--- C) MODELES SANS AUCUNE VALEUR (a chercher) ---')
for c in SPECS:
    lst = a_chercher.get(c, [])
    print('   %-30s %3d modeles' % (c, len(lst)))

# repartition par marque du plus gros trou
print('\n--- detail par marque (modeles sans valeur) ---')
lignes = collections.defaultdict(lambda: collections.Counter())
for c in SPECS:
    for fab, m in a_chercher.get(c, []):
        lignes[fab][c] += 1
entete = [c for c in SPECS]
print('   %-20s %s' % ('marque', ' '.join('%-12s' % c[:12] for c in entete)))
for fab in sorted(lignes):
    print('   %-20s %s' % (fab[:20], ' '.join('%-12d' % lignes[fab][c] for c in entete)))

# --- B) structurel : type de grue
print('\n--- types de grue presents (pour la regle « N/A structurel ») ---')
types = collections.Counter()
for fab in gm:
    if fab.startswith('_'):
        continue
    for y, mm in gm[fab].items():
        for m, v in mm.items():
            if isinstance(v, dict):
                types[str(v.get('Type de grue') or v.get('Type') or '?')] += 1
for t, n in types.most_common():
    print('   %-40s %5d' % (t, n))
