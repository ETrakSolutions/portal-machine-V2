# -*- coding: utf-8 -*-
"""Nettoie deux residus reperes par le controle de sante (data/overrides/excavatrice.json).

1. NEUF OVERRIDES ORPHELINS « Case / 145 D SR » (2018-2026). Ce modele a ete
   supprime en juillet (commit 17ebfa0) comme doublon mal nomme de « CX145D SR »,
   mais ses overrides sont restes. Ils sont identiques a ceux du modele conserve,
   A UNE EXCEPTION : la note technicien de 2026, « coupure 1 gars OK », qui n a
   pas ete reportee. On la remet sur CX145D SR 2026 (meme machine, simple
   renommage) avant de supprimer les orphelins — sinon la deduplication de
   juillet aura fait perdre une note de terrain.

2. CLES PARASITES sur « Takeuchi / TB216 / 2022 » : « rows », « customRows »
   (ancien format) et « undefined » (artefact d une sauvegarde UI). Elles sont
   deja ignorees a l affichage (kit-rules.js isOptionCode les filtre), mais le
   bloc « rows » CONTREDIT les codes numeriques du meme enregistrement
   (rows.mini = « na » alors que « 0004 » = « r »). Piege dormant : on le retire.

Ne touche PAS a l ancien data/overrides.json (repli legacy, non lu tant que les
10 fichiers par type existent).

Usage : python scripts/nettoyer_overrides_residus.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OV = os.path.join(ROOT, 'data', 'overrides', 'excavatrice.json')
WRITE = '--write' in sys.argv

d = json.load(open(OV, encoding='utf-8'))
case = d['Excavatrice']['Case']
tak = d['Excavatrice']['Takeuchi']

# --- 1. note a reporter avant suppression
note = None
for y in case:
    e = case[y].get('145 D SR')
    if e and e.get('_notes'):
        note = (y, e['_notes'])
print('=== 1. orphelins « 145 D SR » ===')
print('   annees concernees :', sorted(y for y in case if '145 D SR' in case[y]))
if note:
    y, txt = note
    cible = case.get(y, {}).get('CX145D SR')
    print('   note trouvee en %s : %r' % (y, txt))
    if cible is None:
        print('   !! CX145D SR absent en %s — note NON reportee' % y)
    elif cible.get('_notes'):
        print('   CX145D SR %s a deja une note (%r) : on ne l ecrase pas' % (y, cible['_notes']))
    else:
        print('   -> reportee sur CX145D SR %s' % y)
        if WRITE:
            cible['_notes'] = txt

n_sup = 0
for y in list(case):
    if '145 D SR' in case[y]:
        n_sup += 1
        if WRITE:
            del case[y]['145 D SR']
print('   overrides orphelins supprimes : %d' % n_sup)

# --- 2. cles parasites
print('\n=== 2. cles parasites TB216 2022 ===')
e = tak.get('2022', {}).get('TB216', {})
bom = e.get('_bom', {})
parasites = [k for k in ('rows', 'customRows', 'undefined') if k in bom]
print('   presentes :', parasites)
if 'rows' in bom:
    r = bom['rows']
    print('   controle de contradiction : rows.mini=%r vs code 0004=%r  -> le code numerique fait foi'
          % (r.get('mini'), bom.get('0004')))
codes = {k: v for k, v in bom.items() if k.isdigit()}
print('   codes numeriques conserves :', codes)
print('   _removed conserve :', bom.get('_removed'))
if WRITE:
    for k in parasites:
        del bom[k]

if WRITE:
    with open(OV, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
    print('\nECRIT dans data/overrides/excavatrice.json')
else:
    print('\n(simulation — relancer avec --write)')
