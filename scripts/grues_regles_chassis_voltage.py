# -*- coding: utf-8 -*-
"""Passe 1 des specs Grue Mobile : remplissage par REGLES, sans source externe.

Regle A — boom trucks (grue montee sur un camion fourni par le client) :
  « Essieux », « Puissance moteur » et « Voltage machine » ne sont pas des
  caracteristiques de la grue. On inscrit la dependance au chassis plutot
  qu'une fausse valeur unique. Le libelle voltage reprend celui deja utilise
  en BD pour Manitex.

Regle B — voltage des autres familles : on n'etend une valeur que si la BD
  porte deja une PREUVE INTERNE, c.-a-d. au moins un modele renseigne de la
  MEME marque et de la MEME famille, et que ces modeles sont unanimes.
  Sinon : rien n'est ecrit, le modele part en recherche.

Usage : python scripts/grues_regles_chassis_voltage.py [--write]
"""
import json, os, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
FAM = os.path.join(ROOT, 'scripts', 'data', 'grues_familles.json')
WRITE = '--write' in sys.argv

VIDE = ('', 'a completer', 'à compléter', 'a compléter', 'n/d', 'nd', '-')
V_CHASSIS = '12V ou 24V (selon châssis)'
CHASSIS = 'Selon châssis'


def vide(v):
    return str(v or '').strip().lower() in VIDE


db = json.load(open(MJ, encoding='utf-8'))
gm = db['Grue Mobile']
fam = {tuple(k.split('|', 1)): v for k, v in json.load(open(FAM, encoding='utf-8')).items()}

par_modele = {}
for f in gm:
    if f.startswith('_'):
        continue
    for y, mm in gm[f].items():
        for m, v in mm.items():
            if isinstance(v, dict):
                par_modele.setdefault((f, m), v)

# ---- Regle B : preuve interne du voltage par (marque, famille)
preuve = collections.defaultdict(collections.Counter)
for (f, m), v in par_modele.items():
    if not vide(v.get('Voltage machine (V/type)')):
        preuve[(f, fam[(f, m)])][str(v['Voltage machine (V/type)']).strip()] += 1

print('=== preuves internes de voltage (marque + famille) ===')
volt_regle = {}
for cle, c in sorted(preuve.items()):
    unanime = len(c) == 1
    val = c.most_common(1)[0][0]
    print('   %-18s %-28s %-30s %s'
          % (cle[0][:18], cle[1][:28], '%s (%d modeles)' % (val[:22], sum(c.values())),
             'RETENU' if unanime else 'ECARTE (valeurs divergentes: %s)' % dict(c)))
    if unanime:
        volt_regle[cle] = val

# ---- application
plan = collections.Counter()
detail = collections.defaultdict(list)
for (f, m), _ in par_modele.items():
    famille = fam[(f, m)]
    boom = famille == 'Boom truck (camion client)'
    for y in gm[f]:
        e = gm[f][y].get(m)
        if not isinstance(e, dict):
            continue
        if boom:
            for champ, val in (('Essieux', CHASSIS), ('Puissance moteur', CHASSIS),
                               ('Voltage machine (V/type)', V_CHASSIS)):
                if vide(e.get(champ)):
                    plan['A ' + champ] += 1
                    detail['A ' + champ].append((f, m))
                    if WRITE:
                        e[champ] = val
        else:
            val = volt_regle.get((f, famille))
            if val and vide(e.get('Voltage machine (V/type)')):
                plan['B Voltage'] += 1
                detail['B Voltage'].append((f, m))
                if WRITE:
                    e['Voltage machine (V/type)'] = val

print('\n=== entrees remplies (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
for k in sorted(plan):
    print('   %-34s %5d entrees  (%d modeles)'
          % (k, plan[k], len(set(detail[k]))))
print('   TOTAL : %d entrees' % sum(plan.values()))

# ce qui reste, pour la campagne de recherche
CHAMPS = ['Contrepoids max', 'Essieux', 'Fleche telescopique', 'Hauteur max',
          'Puissance moteur', 'Voltage machine (V/type)']
reste = collections.defaultdict(list)
for (f, m), _ in par_modele.items():
    e = par_modele[(f, m)]
    for c in CHAMPS:
        # relit l'etat courant (apres ecriture eventuelle)
        y0 = sorted(gm[f].keys())[0]
        cur = None
        for y in gm[f]:
            if m in gm[f][y]:
                cur = gm[f][y][m].get(c)
                break
        if vide(cur):
            reste[c].append((f, m, fam[(f, m)]))

print('\n=== reste a chercher (par champ) ===')
tot = 0
for c in CHAMPS:
    print('   %-30s %3d modeles' % (c, len(reste[c])))
    tot += len(reste[c])
print('   TOTAL : %d valeurs' % tot)

print('\n=== reste a chercher (par marque) ===')
parmarque = collections.defaultdict(collections.Counter)
for c in CHAMPS:
    for f, m, _fa in reste[c]:
        parmarque[f][c] += 1
for f in sorted(parmarque):
    print('   %-20s %s' % (f[:20], dict(parmarque[f])))

if WRITE:
    with open(MJ, 'w', encoding='utf-8') as fh:
        json.dump(db, fh, ensure_ascii=False, separators=(',', ':'))
    print('\nECRIT dans data/machines.json')
    # liste de travail pour la campagne de recherche
    out = os.path.join(ROOT, 'scripts', 'data', 'grues_a_chercher.json')
    travail = collections.defaultdict(lambda: collections.defaultdict(list))
    for c in CHAMPS:
        for f, m, fa in reste[c]:
            travail[f][m].append(c)
    payload = {f: {m: {'famille': fam[(f, m)], 'champs': sorted(set(cs))}
                   for m, cs in mods.items()} for f, mods in travail.items()}
    json.dump(payload, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('liste de travail : %s' % out)
else:
    print('\n(simulation — relancer avec --write)')
