# -*- coding: utf-8 -*-
"""Audit de couverture anglaise des libelles BOM affiches en soumission.

`i18n.tBom(desc)` traduit un libelle francais en cherchant la cle « bom.<desc> »
dans le dictionnaire EN. Ce script enumere TOUS les libelles susceptibles d'etre
affiches — les `desc` de `_bom_labels` (11 types), les harnais de `kit-rules.js`,
et les descriptions codees dans `js/soumission.js` — puis dit lesquels n'ont pas
de traduction. Sans argument il ne modifie rien.
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lire(p):
    return io.open(os.path.join(REPO, p), encoding='utf-8', newline='').read()


# --- 1. les libelles du catalogue, par type -------------------------------
machines = json.loads(lire('data/machines.json'))
libelles = {}   # desc -> [d'ou il vient]
for typ, contenu in machines.items():
    if typ.startswith('_'):
        continue
    for cle, val in (contenu.get('_bom_labels') or {}).items():
        d = (val or {}).get('desc')
        if d:
            libelles.setdefault(d, []).append('%s / %s' % (typ, cle))

# --- 2. les harnais (kit-rules.js) ----------------------------------------
kr = lire('js/kit-rules.js')
noms_harnais = set(re.findall(r"name:\s*'([^']+)'", kr))
noms_harnais |= set(re.findall(r"H\d{4}:\s*'([^']+)'", kr))
for n in sorted(noms_harnais):
    libelles.setdefault('Harnais ' + n, []).append('kit-rules.js / harnais')

# --- 3. les descriptions ecrites dans soumission.js -----------------------
soum = lire('js/soumission.js')
for desc in re.findall(r"desc:\s*'([^']+)'", soum):
    libelles.setdefault(desc, []).append('soumission.js / desc')

# --- 4. le dictionnaire anglais -------------------------------------------
trad = lire('js/translations.js')
en = trad[trad.index('\nen: {'):]
cles_en = set(re.findall(r"'bom\.([^']+)'", en))

manquants = sorted(d for d in libelles if d not in cles_en)
couverts = len(libelles) - len(manquants)

print('Libelles BOM affichables : %d' % len(libelles))
print('Traduits en anglais      : %d' % couverts)
print('SANS traduction anglaise : %d' % len(manquants))
if manquants:
    print()
    for d in manquants:
        print('  %-52s  <- %s' % (d, ', '.join(sorted(set(libelles[d])))[:70]))

# --- 5. cles bom. orphelines (traduites mais plus affichees) --------------
orphelines = sorted(c for c in cles_en if c not in libelles)
if orphelines:
    print('\nCles « bom. » sans libelle correspondant (%d) — vestiges ou libelles '
          'venus des overrides :' % len(orphelines))
    for c in orphelines[:40]:
        print('  %s' % c)

sys.exit(1 if manquants else 0)
