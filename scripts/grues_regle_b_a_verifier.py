# -*- coding: utf-8 -*-
"""Liste nominative des modeles dont le voltage vient de la REGLE B (deduction
interne), donc jamais confirme par une fiche constructeur.

Les agents ont prouve que le voltage varie a l'interieur d'une meme famille
chez Link-Belt et Grove : ces deductions doivent etre verifiees une par une.
"""
import json, os, sys, subprocess, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAMP = 'Voltage machine (V/type)'
VIDE = ('', 'a completer', 'à compléter', 'n/d', 'nd', '-')
CHASSIS = '12V ou 24V (selon châssis)'

avant = json.loads(subprocess.run(['git', 'show', '53b8d58:data/machines.json'],
                                  capture_output=True, cwd=ROOT).stdout.decode('utf-8'))['Grue Mobile']
apres = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))['Grue Mobile']
fam = {tuple(k.split('|', 1)): v for k, v in
       json.load(open(os.path.join(ROOT, 'scripts', 'data', 'grues_familles.json'),
                      encoding='utf-8')).items()}


def vide(v):
    return str(v or '').strip().lower() in VIDE


regle_b = collections.defaultdict(list)
for f in apres:
    if f.startswith('_'):
        continue
    vus = set()
    for y in apres[f]:
        for m, v in apres[f][y].items():
            if not isinstance(v, dict) or m in vus:
                continue
            a = avant.get(f, {}).get(y, {}).get(m, {})
            if vide(a.get(CHAMP)) and not vide(v.get(CHAMP)) and v[CHAMP] != CHASSIS:
                vus.add(m)
                regle_b[f].append((m, fam.get((f, m), '?'), v[CHAMP]))

total = sum(len(v) for v in regle_b.values())
print('modeles dont le voltage vient de la regle B (non verifie en fiche) : %d\n' % total)
for f in sorted(regle_b):
    print('=== %s (%d) ===' % (f, len(regle_b[f])))
    for m, fa, val in sorted(regle_b[f]):
        print('   %-24s %-28s %s' % (m[:24], fa[:28], val))
    print()

# Fichier de verification : TOUS les modeles issus de la regle B.
# ATTENTION : « A completer » est une valeur VIDE, pas une valeur remplie —
# un comptage qui l'oublie gonfle le total (253 au lieu de 81).
RISQUE = ('Link-Belt', 'Grove (Manitowoc)')   # non-uniformite prouvee par la campagne
liste = []
for f in sorted(regle_b):
    for m, fa, val in sorted(regle_b[f]):
        annees = sorted(y for y in apres[f] if m in apres[f][y])
        liste.append({
            'marque': f, 'modele': m, 'famille': fa,
            'annees': '%s-%s' % (annees[0], annees[-1]),
            'voltage_deduit': val,
            'capacite': apres[f][annees[0]][m].get('Capacite max', ''),
            'priorite': 'haute' if f in RISQUE else 'normale',
        })
json.dump(liste, open(os.path.join(ROOT, 'scripts', 'data', 'grues_voltage_a_verifier.json'),
                      'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('a verifier : %d modeles (dont %d en priorite haute)'
      % (len(liste), sum(1 for x in liste if x['priorite'] == 'haute')))
print('ecrit : scripts/data/grues_voltage_a_verifier.json')
