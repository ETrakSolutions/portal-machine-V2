#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Classe les machines des taches ProgressionLive en retrocaveuses (par marque)
   et compare au catalogue portail (data/machines.json) pour trouver les manquantes."""
import json, re, collections, os, sys
sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSONL = os.path.join(ROOT, '_pl_tasks_all.jsonl')
MACHINES = os.path.join(ROOT, 'data', 'machines.json')

def norm(s):
    return re.sub(r'\s+', ' ', (s or '').strip())

# --- collecte des paires marque/modele/year depuis les taches ---
pairs = collections.Counter()      # (marque_up, modele_up) -> n
years_for = collections.defaultdict(set)
raw_examples = {}
with open(JSONL, encoding='latin-1') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        t = json.loads(line)
        p = t.get('properties', {})
        mk = norm(p.get('machine.marque'))
        mo = norm(p.get('machine.modele') or p.get('machine.model'))
        yr = norm(p.get('machine.year'))
        if not (mk or mo):
            continue
        key = (mk.upper(), mo.upper())
        pairs[key] += 1
        if yr and yr.isdigit():
            years_for[key].add(int(yr))
        raw_examples.setdefault(key, (mk, mo))

# --- classificateur retrocaveuse par marque ---
# Chaque entree: marque normalisee -> regex de modele retrocaveuse
RETRO = {
    'CASE':        re.compile(r'\b(580|590|695)\b', re.I),
    'CATERPILLAR': re.compile(r'\b(41[0568]|42[0-9]|43[0-9]|44[0-9]|45[0-9])\b', re.I),
    'CAT':         re.compile(r'\b(41[0568]|42[0-9]|43[0-9]|44[0-9]|45[0-9])\b', re.I),
    'JCB':         re.compile(r'\b([1-5]CX|3C\b|4CX)', re.I),
    'JOHN DEERE':  re.compile(r'\b(310|315|410|510|710)\b', re.I),
    'DEERE':       re.compile(r'\b(310|315|410|510|710)\b', re.I),
    'NEW HOLLAND': re.compile(r'\b(B\s?75|B\s?90|B\s?95|B\s?110|B\s?115|LB\s?75|LB\s?90|LB\s?110|LB\s?115)\b', re.I),
    'NEWHOLLAND':  re.compile(r'\b(B\s?75|B\s?90|B\s?95|B\s?110|B\s?115|LB\s?75|LB\s?90|LB\s?110|LB\s?115)\b', re.I),
    'TEREX':       re.compile(r'\b(TLB|820|860|970|TX)\b', re.I),
    'KUBOTA':      re.compile(r'\b(L47|M62|B26|BX23)\b', re.I),
    'VOLVO':       re.compile(r'\b(BL60|BL61|BL70|BL71)\b', re.I),
    'KOMATSU':     re.compile(r'\b(WB9[0-9]|WB14[0-9]|WB97)\b', re.I),
    'MASSEY FERGUSON': re.compile(r'\b(MF\s?\d|860|760)\b', re.I),
    'FORD':        re.compile(r'\b(555|655|575|675)\b', re.I),
    'CASE IH':     re.compile(r'\b(580|590)\b', re.I),
}
# marques connues comme NON-retro (pour eviter faux positifs sur modeles ambigus)

retro_found = {}
for (mk, mo), n in pairs.items():
    rx = RETRO.get(mk)
    if rx and rx.search(mo):
        retro_found[(mk, mo)] = n

# --- catalogue portail actuel ---
data = json.load(open(MACHINES, encoding='utf-8'))
node = data['Retrocaveuse']
portal = collections.defaultdict(set)   # FAB_UP -> {model_up}
fab_display = {}
for fab in node:
    if fab.startswith('_'):
        continue
    fab_display[fab.upper()] = fab
    for yr, val in node[fab].items():
        if isinstance(val, dict):
            for m in val:
                if not m.startswith('_'):
                    portal[fab.upper()].add(m.upper())
        elif isinstance(val, list):
            for m in val:
                portal[fab.upper()].add(m.upper())

# alias marques PL -> marque portail
BRAND_ALIAS = {
    'CAT': 'CATERPILLAR', 'CATERPILLAR': 'CATERPILLAR',
    'CASE': 'CASE', 'CASE IH': 'CASE',
    'JCB': 'JCB',
    'JOHN DEERE': 'JOHN DEERE', 'DEERE': 'JOHN DEERE',
    'NEW HOLLAND': 'NEW HOLLAND', 'NEWHOLLAND': 'NEW HOLLAND',
    'TEREX': 'TEREX', 'KUBOTA': 'KUBOTA', 'VOLVO': 'VOLVO',
    'KOMATSU': 'KOMATSU', 'FORD': 'FORD', 'MASSEY FERGUSON': 'MASSEY FERGUSON',
}

print("=== RETROCAVEUSES dans ProgressionLive (taches) ===")
for (mk, mo), n in sorted(retro_found.items()):
    yrs = sorted(years_for[(mk, mo)])
    yr_s = f"{min(yrs)}-{max(yrs)}" if yrs else "?"
    print(f"  {mk:16} | {mo:22} x{n:<3} annees:{yr_s}")

print("\n=== MANQUANTES au portail (a ajouter) ===")
missing = []
for (mk, mo), n in sorted(retro_found.items()):
    pf = BRAND_ALIAS.get(mk)
    disp_mo = raw_examples[(mk, mo)][1]
    if pf is None:
        missing.append((mk, disp_mo, n, 'MARQUE absente du portail', sorted(years_for[(mk,mo)])))
        continue
    have = portal.get(pf, set())
    # match souple: le modele PL contient/egale un modele portail (ou inverse)
    matched = False
    for hm in have:
        a = re.sub(r'[^A-Z0-9]', '', mo)
        b = re.sub(r'[^A-Z0-9]', '', hm)
        if a == b or a in b or b in a:
            matched = True
            break
    if not matched:
        missing.append((mk, disp_mo, n, f'modele absent (marque {pf} existe)', sorted(years_for[(mk,mo)])))

for mk, mo, n, why, yrs in missing:
    yr_s = f"{min(yrs)}-{max(yrs)}" if yrs else "?"
    print(f"  [{mk}] {mo}  x{n}  ({why})  annees:{yr_s}")

print(f"\n{len(retro_found)} modeles retro distincts en PL, {len(missing)} potentiellement manquants au portail")
