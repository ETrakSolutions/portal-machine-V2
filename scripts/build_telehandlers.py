# -*- coding: utf-8 -*-
"""Reconstruit le type Telehandler : union (catalogue actuel + dossier e-Trak + gamme NA workflow),
construction seulement (exclut agricole). Applique les coupures par marque + rotation (fixe=na)
+ commentaire pour coupures electriques. Ecrit machines.json + data/overrides/telehandler.json."""
import json, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

WF = r"C:\Users\ryb086\AppData\Local\Temp\claude\C--Users-ryb086\edf9ac33-58f3-4ed2-aa94-e48f97c01d5b\tasks\wxruwtotz.output"
T = 'Telehandler'; AC = 'À compléter'
YEARS = [str(y) for y in range(2015, 2027)]

AG = re.compile(r'\bagri|farm|pivot|\bmlt\b|^ag\s?\d', re.I)            # agricole -> exclu
ROT = re.compile(r'roto|\bmrt\b|pegasus|magni|\bR13|R1370|R1385|R13100', re.I)  # rotatif
SKYTRAK = re.compile(r'skytrak', re.I)

# mapping marque workflow -> nom fabricant catalogue
BRANDMAP = {'Bobcat':'Bobcat','CAT (Caterpillar)':'CAT','Genie (Terex)':'Genie (Terex)','JCB':'JCB',
            'JLG':'JLG','Manitou':'Manitou','Dieci':'Dieci','Merlo':'Merlo','SANY':'SANY','Skyjack':'Skyjack'}

# modeles du dossier e-Trak (Kit machine/LP Telehandler)
FOLDER = {'CAT':['TH220B'],'Dieci':['T70'],'Genie (Terex)':['GTH-5519'],
          'JCB':['506-36','507-42','509-42','510-56','512.56 F'],
          'JLG':['10054','1055','6042','642','G10-55A TURBO'],
          'Manitou':['MT1440','MT730','MTA9050'],'Merlo':['P50.18HP'],
          'SANY':['STH1056A10'],'Skyjack':['SJ1055']}

# coupure par marque : 'drain'->0403, 'gc'->0070, 'elec'->commentaire, None->rien
COUPURE = {'Genie (Terex)':'drain','Skyjack':'drain','CAT':'gc','JLG':'gc',
           'JCB':'elec','Manitou':'elec','Dieci':'elec','SANY':'elec','Bobcat':None,'Merlo':None}
ELEC_NOTE = 'Coupure électrique (type de coupure : élec — voir doc e-Trak).'

d = json.load(open('data/machines.json', encoding='utf-8'))
th = d[T]
labels = th.get('_bom_labels')
prev = {f: th[f] for f in th if not f.startswith('_')}  # noeuds actuels (pour preserver les specs)

# specs existantes par (fab, modele) -> dict specs (sans meta)
def specs_of(e): return {k: v for k, v in e.items() if not k.startswith('_')}
existing = {}
for fab, annees in prev.items():
    for an, mods in annees.items():
        if not isinstance(mods, dict): continue
        for mo, e in mods.items():
            existing.setdefault((fab, mo), specs_of(e))

# workflow : specs par (fab, modele), construction seulement
wf = json.load(open(WF, encoding='utf-8'))['result']['results']
wf_specs = {}; wf_models = {}
for r in wf:
    fab = BRANDMAP.get(r['brand'], r['brand'])
    wf_models.setdefault(fab, [])
    for m in r['models']:
        mo = m['model'].strip()
        if AG.search(mo + ' ' + (m.get('note') or '')): continue   # exclut agricole
        wf_models[fab].append(mo)
        wf_specs[(fab, mo)] = {
            'Capacite max': m.get('capacity') or AC,
            'Hauteur levee max': m.get('lift_height') or AC,
            'Portee avant max': m.get('reach') or AC,
            'Puissance moteur': AC, 'Poids operationnel': AC,
        }

FIELDS = ['Capacite max', 'Hauteur levee max', 'Portee avant max', 'Puissance moteur', 'Poids operationnel']
def entry(specs):
    e = {f: (specs.get(f) or AC) for f in FIELDS}
    e.update({'_note_tech_texte': '', '_note_tech_auteur': '', '_note_tech_date': '', '_actif': 'Oui'})
    return e

# union des modeles par fabricant
all_fabs = sorted(set(list(prev) + list(FOLDER) + list(wf_models)))
new_th = {}
override = {T: {}}
total_models = 0; rot_count = 0
for fab in all_fabs:
    models = set()
    models |= {mo for (f, mo) in existing if f == fab}
    models |= set(FOLDER.get(fab, []))
    models |= set(wf_models.get(fab, []))
    new_th[fab] = {}
    coup = COUPURE.get(fab)
    for an in YEARS:
        new_th[fab][an] = {}
    for mo in sorted(models):
        # specs : existant prioritaire, sinon workflow, sinon vide
        sp = existing.get((fab, mo)) or wf_specs.get((fab, mo)) or {}
        for an in YEARS:
            new_th[fab][an][mo] = entry(sp)
        total_models += 1
        # ----- override kit -----
        bom = {}
        is_rot = bool(ROT.search(mo))
        if not is_rot:
            bom['0401'] = 'na'          # rotation N/A sur les fixes
        else:
            rot_count += 1
        # coupure
        is_skytrak = bool(SKYTRAK.search(mo))
        ov_entry = {}
        if coup == 'drain' or (fab == 'JLG' and is_skytrak):
            bom['0403'] = 'r'; bom['0070'] = 'na'
        elif coup == 'gc':
            bom['0070'] = 'r'; bom['0403'] = 'na'
        elif coup == 'elec':
            bom['0070'] = 'na'; bom['0403'] = 'na'
            ov_entry['_notes'] = ELEC_NOTE
        if bom: ov_entry['_bom'] = bom
        if ov_entry:
            for an in YEARS:
                override[T].setdefault(fab, {}).setdefault(an, {})[mo] = json.loads(json.dumps(ov_entry))

# remettre le noeud Telehandler (en gardant _bom_labels)
d[T] = {'_bom_labels': labels} if labels else {}
for fab in new_th: d[T][fab] = new_th[fab]

json.dump(d, open('data/machines.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(override, open('data/overrides/telehandler.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.loads(open('data/machines.json', encoding='utf-8').read()); json.loads(open('data/overrides/telehandler.json', encoding='utf-8').read())

print('Fabricants:', len(new_th), '| modeles total:', total_models, '| rotatifs:', rot_count)
for fab in all_fabs:
    n = len(new_th[fab][YEARS[0]]); coup = COUPURE.get(fab)
    print('  %-14s %3d modeles | coupure=%s' % (fab, n, coup))
