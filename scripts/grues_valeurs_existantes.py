# -*- coding: utf-8 -*-
"""Ce que la BD dit DEJA pour les grues : valeurs existantes par champ, pour
juger si une regle interne peut combler un trou sans source externe.

Joint aussi le « Type » de l'Excel d'audit (absent de machines.json) pour
identifier les valeurs structurellement non applicables.
"""
import json, os, sys, collections
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
gm = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))['Grue Mobile']
XLSX = os.path.join(os.path.dirname(ROOT), 'Audit_Grues_Mobiles_2026-07.xlsx')

VIDE = ('', 'a completer', 'à compléter', 'a compléter', 'n/d', 'nd', '-')


def vide(v):
    return str(v or '').strip().lower() in VIDE


# type par (marque, modele) depuis l'Excel d'audit
ws = openpyxl.load_workbook(XLSX, read_only=True)['Audit grues mobiles']
rows = list(ws.iter_rows(values_only=True))
h = {str(c): i for i, c in enumerate(rows[0])}
TYPE = {}
for r in rows[1:]:
    TYPE[(str(r[h['Marque']]).strip(), str(r[h['Modele']]).strip())] = str(r[h['Type']] or '')

# valeurs existantes
vals = collections.defaultdict(collections.Counter)
par_modele = {}
for fab in gm:
    if fab.startswith('_'):
        continue
    for y, mm in gm[fab].items():
        for m, v in mm.items():
            if not isinstance(v, dict):
                continue
            par_modele.setdefault((fab, m), v)
            for k, val in v.items():
                if k.startswith('_') or k in ('Flag', 'Image'):
                    continue
                if not vide(val):
                    vals[k][str(val).strip()] += 1

for champ in ['Voltage machine (V/type)', 'Essieux', 'Fleche telescopique']:
    print('=== %s : valeurs presentes ===' % champ)
    for v, n in vals[champ].most_common(15):
        print('   %-28s %5d entrees' % (v[:28], n))
    print()

# couverture du type via l'Excel
manque_type = [(f, m) for (f, m) in par_modele if (f, m) not in TYPE]
print('modeles BD sans correspondance de Type dans l\'Excel : %d / %d'
      % (len(manque_type), len(par_modele)))
for f, m in manque_type[:15]:
    print('   %-18s %s' % (f[:18], m))

# quels modeles sont sur chenilles (essieux non applicables) ?
chen = [(f, m) for (f, m) in par_modele if 'henille' in TYPE.get((f, m), '')]
chen_vide = [(f, m) for (f, m) in chen if vide(par_modele[(f, m)].get('Essieux'))]
print('\nmodeles sur chenilles : %d — dont « Essieux » vide : %d'
      % (len(chen), len(chen_vide)))

# et la fleche telescopique sur les treillis ?
tre = [(f, m) for (f, m) in par_modele if 'treillis' in TYPE.get((f, m), '')]
tre_vide = [(f, m) for (f, m) in tre if vide(par_modele[(f, m)].get('Fleche telescopique'))]
print('modeles chenilles treillis : %d — dont « Fleche telescopique » vide : %d'
      % (len(tre), len(tre_vide)))

# voltage : y a-t-il une regle interne visible ?
print('\n=== voltage renseigne : par marque et type ===')
c = collections.Counter()
for (f, m), v in par_modele.items():
    if not vide(v.get('Voltage machine (V/type)')):
        c[(f, TYPE.get((f, m), '?').split('(')[0].strip(),
           str(v['Voltage machine (V/type)']).strip())] += 1
for (f, t, val), n in sorted(c.items()):
    print('   %-18s %-26s %-10s %3d modeles' % (f[:18], t[:26], val, n))
