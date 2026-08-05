# -*- coding: utf-8 -*-
"""CONTROLE A POSTERIORI de la regle B (extension du voltage par preuve interne).

Les agents de recherche ont montre que le voltage n'est pas uniforme a
l'interieur d'une meme famille chez certaines marques (Link-Belt, Grove).
Ce script confronte chaque voltage ECRIT PAR LA REGLE B aux valeurs trouvees
en fiche constructeur par les agents, et liste les contradictions a corriger.
"""
import json, os, re, sys, glob, subprocess, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(os.path.expanduser('~'), 'AppData', 'Local', 'Temp', 'claude',
                   'C--Users-jcaron', '47e45715-d2c5-4e2a-9869-7921f4a79b27',
                   'scratchpad', 'grues_recherche')
CHAMP = 'Voltage machine (V/type)'
VIDE = ('', 'a completer', 'à compléter', 'n/d', 'nd', '-')

# etat AVANT la regle (commit precedent) pour savoir ce que la regle a ecrit
avant = json.loads(subprocess.run(['git', 'show', '53b8d58:data/machines.json'],
                                  capture_output=True, cwd=ROOT).stdout.decode('utf-8'))['Grue Mobile']
apres = json.load(open(os.path.join(ROOT, 'data', 'machines.json'),
                       encoding='utf-8'))['Grue Mobile']


def vide(v):
    return str(v or '').strip().lower() in VIDE


# ce que la regle a ecrit, par modele
ecrit = {}
for f in apres:
    if f.startswith('_'):
        continue
    for y in apres[f]:
        for m, v in apres[f][y].items():
            if not isinstance(v, dict):
                continue
            a = avant.get(f, {}).get(y, {}).get(m, {})
            if vide(a.get(CHAMP)) and not vide(v.get(CHAMP)):
                ecrit.setdefault((f, m), v[CHAMP])

print('voltages ecrits par les regles A+B : %d modeles' % len(ecrit))
par_val = collections.Counter(ecrit.values())
print('   ', dict(par_val))

# ce que les agents ont trouve
trouve = {}
for p in glob.glob(os.path.join(RES, '*.json')):
    try:
        d = json.load(open(p, encoding='utf-8'))
    except Exception:
        continue
    if 'resultats' not in d:
        continue
    for r in d['resultats']:
        mq = r.get('marque') or d.get('marque')
        ch = (r.get('champs') or {}).get(CHAMP)
        if ch and ch.get('valeur'):
            trouve[(mq, r.get('modele'))] = (ch['valeur'], ch.get('source_type'),
                                             ch.get('confiance'))

print('voltages trouves par les agents : %d modeles' % len(trouve))

print('\n=== CONTRADICTIONS regle vs fiche constructeur ===')
n = 0
for cle, val_regle in sorted(ecrit.items()):
    if cle in trouve:
        val_doc, st, conf = trouve[cle]
        if str(val_doc).strip() != str(val_regle).strip():
            n += 1
            print('   %-16s %-22s regle=%-28s doc=%-14s (%s/%s)'
                  % (cle[0][:16], cle[1][:22], val_regle, val_doc, st, conf))
print('   total : %d' % n)

print('\n=== recouvrement : modeles ou la regle a ecrit ET l\'agent a cherche ===')
print('   %d' % len({c for c in ecrit if c in trouve}))
