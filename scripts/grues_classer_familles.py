# -*- coding: utf-8 -*-
"""Classe les 385 modeles de grues par famille, pour separer :
  - ce qui depend du CAMION PORTEUR (boom trucks) : essieux, voltage, moteur ;
  - ce qui est propre a la grue (RT/AT/chenilles) : a chercher chez le fabricant.

La famille vient du « Type » de l'Excel d'audit quand il existe, sinon d'une
regle marque + prefixe de modele. Toute regle appliquee est imprimee.
"""
import json, os, re, sys, collections
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
gm = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))['Grue Mobile']
XLSX = os.path.join(os.path.dirname(ROOT), 'Audit_Grues_Mobiles_2026-07.xlsx')

VIDE = ('', 'a completer', 'à compléter', 'a compléter', 'n/d', 'nd', '-')
CHAMPS = ['Contrepoids max', 'Essieux', 'Fleche telescopique', 'Hauteur max',
          'Puissance moteur', 'Voltage machine (V/type)']


def vide(v):
    return str(v or '').strip().lower() in VIDE


ws = openpyxl.load_workbook(XLSX, read_only=True)['Audit grues mobiles']
rows = list(ws.iter_rows(values_only=True))
h = {str(c): i for i, c in enumerate(rows[0])}
TYPE_XL = {}
for r in rows[1:]:
    marque = str(r[h['Marque']]).strip()
    for part in str(r[h['Modele']]).split('/'):        # « GMK4090 / GMK4090-1 »
        TYPE_XL[(marque, part.strip())] = str(r[h['Type']] or '')

# Marques dont TOUTE la gamme du portail est du boom truck monte sur camion client
BOOM_TRUCK_MARQUES = {'Elliott', 'Altec', 'National Crane', 'Manitex'}
# Prefixes boom truck chez les marques mixtes
BOOM_TRUCK_PREFIXES = {
    'Terex': ('BT ', 'Crossover', 'RS '),
    'Tadano': ('TM-',),
}


def famille(fab, mod):
    t = TYPE_XL.get((fab, mod), '')
    tl = t.lower()
    if 'treillis' in tl:
        return 'Chenilles treillis'
    if 'chenilles' in tl:
        return 'Chenilles telescopique'
    if 'boom truck' in tl or 'crossover' in tl:
        return 'Boom truck (camion client)'
    if 'carry-deck' in tl or 'pick&carry' in tl or 'industrielle' in tl:
        return 'Carry-deck / industrielle'
    if 'araignee' in tl or 'spider' in tl or 'mini' in tl:
        return 'Mini / araignee'
    if 'rough' in tl:
        return 'Rough-terrain'
    if 'tout-terrain' in tl or 'compacte' in tl:
        return 'Tout-terrain'
    if 'camion' in tl:
        return 'Camion (grue routiere)'
    # --- pas de type dans l'Excel : regle marque + prefixe
    if fab in BOOM_TRUCK_MARQUES:
        return 'Boom truck (camion client)'
    for p in BOOM_TRUCK_PREFIXES.get(fab, ()):
        if mod.startswith(p):
            return 'Boom truck (camion client)'
    if fab == 'Broderson':
        return 'Carry-deck / industrielle'
    if fab == 'Maeda':
        return 'Mini / araignee'
    if fab in ('Manitowoc', 'Kobelco'):
        return 'Chenilles treillis'
    if fab == 'Grove (Manitowoc)':
        if mod.startswith('GMK'):
            return 'Tout-terrain'
        if mod.startswith(('RT', 'GRT')):
            return 'Rough-terrain'
        if mod.startswith(('TMS', 'TTS')):
            return 'Camion (grue routiere)'
        if mod.startswith(('YB', 'GCD')):
            return 'Carry-deck / industrielle'
    if fab == 'Liebherr':
        if mod.startswith('LTM') or mod.startswith('LTC'):
            return 'Tout-terrain'
        if mod.startswith('LRT'):
            return 'Rough-terrain'
        if mod.startswith('LTF'):
            return 'Camion (grue routiere)'
    if fab == 'Link-Belt':
        if 'RT' in mod:
            return 'Rough-terrain'
        if mod.startswith('TCC'):
            return 'Chenilles telescopique'
        if mod.startswith('ATC') or mod.endswith('AT'):
            return 'Tout-terrain'
        if 'HT' in mod or mod.startswith('HTC'):
            return 'Camion (grue routiere)'
        if 'HSL' in mod or re.match(r'^\d{3}', mod):
            return 'Chenilles treillis'
    if fab == 'Tadano':
        if mod.startswith(('GR-', 'TR-', 'eGR')):
            return 'Rough-terrain'
        if mod.startswith(('AC ', 'ATF')):
            return 'Tout-terrain'
        if mod.startswith('GTC'):
            return 'Chenilles telescopique'
        if mod.startswith('CC '):
            return 'Chenilles treillis'
        if mod.startswith('GT-'):
            return 'Camion (grue routiere)'
    if fab == 'SANY':
        if mod.startswith('SRA'):
            return 'Rough-terrain'
        if mod.startswith('SCA') and 'TB' in mod:
            return 'Chenilles telescopique'
        if mod.startswith('SCA'):
            return 'Chenilles treillis'
        if mod.startswith('SAT'):
            return 'Tout-terrain'
    if fab == 'XCMG':
        if mod.startswith('XCR'):
            return 'Rough-terrain'
        if mod.startswith('XCA'):
            return 'Tout-terrain'
        if mod.startswith('XCT'):
            return 'Camion (grue routiere)'
    if fab == 'Zoomlion':
        return 'Rough-terrain'
    if fab == 'Terex':
        if mod.startswith('RT'):
            return 'Rough-terrain'
        if mod.startswith('T '):
            return 'Camion (grue routiere)'
        if mod.startswith('Explorer'):
            return 'Tout-terrain'
    return '? INCONNU'


par_modele = {}
for fab in gm:
    if fab.startswith('_'):
        continue
    for y, mm in gm[fab].items():
        for m, v in mm.items():
            if isinstance(v, dict):
                par_modele.setdefault((fab, m), v)

fam = {}
for (fab, m) in par_modele:
    fam[(fab, m)] = famille(fab, m)

print('=== familles ===')
for f, n in collections.Counter(fam.values()).most_common():
    print('   %-30s %3d modeles' % (f, n))

inconnus = [(f, m) for (f, m), t in fam.items() if t == '? INCONNU']
if inconnus:
    print('\n--- non classes (%d) ---' % len(inconnus))
    for f, m in inconnus:
        print('   %-18s %s' % (f[:18], m))

print('\n=== trous par famille et par champ (modeles) ===')
tab = collections.defaultdict(collections.Counter)
for (fab, m), v in par_modele.items():
    for c in CHAMPS:
        if vide(v.get(c)):
            tab[fam[(fab, m)]][c] += 1
print('   %-30s %s' % ('famille', ' '.join('%-14s' % c[:14] for c in CHAMPS)))
for f in sorted(tab):
    print('   %-30s %s' % (f, ' '.join('%-14d' % tab[f][c] for c in CHAMPS)))

tot = sum(sum(v.values()) for v in tab.values())
bt = sum(tab['Boom truck (camion client)'].values())
print('\n   TOTAL valeurs manquantes (modele x champ) : %d' % tot)
print('   dont boom trucks (dependent du camion client) : %d (%.0f %%)' % (bt, 100.0 * bt / tot))

json.dump({f + '|' + m: t for (f, m), t in fam.items()},
          open(os.path.join(ROOT, 'scripts', 'data', 'grues_familles.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('\nfamilles ecrites : scripts/data/grues_familles.json')
