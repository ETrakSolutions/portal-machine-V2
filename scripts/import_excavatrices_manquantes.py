# -*- coding: utf-8 -*-
"""Import des excavatrices manquantes 2015-2026 (lot valide _to_add.json, 230 modeles).

Source : audit du 2026-07-01, colonne « A ajouter ? » = « o » dans
CLAUDE_CODE/Audit_Excavatrices_Manquantes_2015-2026.xlsx.

Regles appliquees (voir le rapport imprime) :
  - Fabricant   : « Hyundai (HD Hyundai Construction Equipment) » -> « Hyundai ».
  - Nom modele  : parentheses descriptives retirees (aucun modele de la BD n'en
                  contient) ; les « / » sont conserves (64 modeles en BD en ont).
  - Classe      : RECALCULEE a partir des voisins reels de la BD par poids
                  (+/-7 %). La « classe estimee » de l'audit etait deduite du
                  numero de modele -> aberrations sur les minis (ex. Wacker
                  Neuson 2503, 2430 kg, classe « 270 »).
  - Poids       : chaine nettoyee « kg / lbs ». Les plages (ex. 15700-18000)
                  sont conservees telles quelles, les lbs calculees sur la plage.
  - Voltage     : 12V DC si < 5000 kg, sinon 24V DC (regle du projet).
  - Type de boom: Roue -> « Boom 2 parties (articule) », Chenille -> « Boom 1 partie ».
  - Swing boom  : « A completer » (valeur inconnue ; convention deja utilisee en
                  BD). Consequence : le code BOM 0008 reste « na » tant que non
                  rempli (voir js/kit-rules.js excDefaults).
  - Puissance / fleche / stick / capacite de levage : vides (inconnues, a
                  completer via la liste de travail des specs).
  - _harnais    : defaut du fabricant, calque sur js/kit-rules.js harnais().
  - Annees      : intersection avec les annees deja presentes pour le fabricant
                  (on ne cree pas d'annee neuve pour une marque).

Usage :
  python scripts/import_excavatrices_manquantes.py            # simulation
  python scripts/import_excavatrices_manquantes.py --write    # ecrit machines.json
"""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
LOT_PATH = os.path.join(ROOT, 'scripts', 'data', 'excavatrices_manquantes_2026-07.json')
WRITE = '--write' in sys.argv

FAB_MAP = {'Hyundai (HD Hyundai Construction Equipment)': 'Hyundai'}

# Harnais par fabricant — miroir de js/kit-rules.js harnais()
HARNAIS = {
    'HITACHI': 'Z03B-0031 - Hitachi -5/-6', 'HITACHI7': 'Z03B-0121 - Hitachi -7',
    'JOHN DEERE': 'Z03B-0031 - Hitachi/JD', 'KOMATSU': 'Z03B-0032 - Komatsu',
    'DOOSAN': 'Z03B-0033 - Doosan', 'VOLVO': 'Z03B-0034 - Volvo',
    'CASE': 'Z03B-0041 - Link-Belt/Case', 'CATERPILLAR': 'Z03B-0080 - Caterpillar',
    'GENERIQUE': 'Z03B-0043 - Generique',
}


def harnais_pour(fab, modele):
    f = fab.upper()
    if f == 'HITACHI':
        is7 = re.search(r'-7(?![0-9])', modele) is not None
        is56 = re.search(r'-[56](?![0-9])', modele) is not None
        return HARNAIS['HITACHI7'] if (is7 and not is56) else HARNAIS['HITACHI']
    if f == 'JOHN DEERE':
        return HARNAIS['JOHN DEERE']
    if f == 'KOMATSU':
        return HARNAIS['KOMATSU']
    if 'DOOSAN' in f or 'DEVELON' in f:
        return HARNAIS['DOOSAN']
    if 'VOLVO' in f:
        return HARNAIS['VOLVO']
    if 'LINK' in f or f == 'CASE':
        return HARNAIS['CASE']
    if 'CATERPILLAR' in f or f == 'CAT':
        return HARNAIS['CATERPILLAR']
    return HARNAIS['GENERIQUE']


def clean_modele(m):
    m = re.sub(r'\s*\([^)]*\)', '', str(m))        # retire les parentheses
    m = re.sub(r'\s+', ' ', m).strip()
    return m


def norm(name):
    return re.sub(r'[^A-Z0-9]', '', str(name).upper())


def poids_kg_list(s):
    """Retourne la liste des nombres kg trouves avant toute parenthese lbs."""
    s = str(s).split('(')[0]
    return [int(n.replace(' ', '')) for n in re.findall(r'\d[\d\s]*', s)]


def fmt_poids(s):
    """« 15700-18000 » -> « 15700-18000 kg / 34612-39683 lbs »."""
    nums = poids_kg_list(s)
    if not nums:
        return ''
    lbs = [int(round(n * 2.20462)) for n in nums]
    if len(nums) == 1:
        return '%d kg / %d lbs' % (nums[0], lbs[0])
    return '%s kg / %s lbs' % ('-'.join(str(n) for n in nums[:2]),
                               '-'.join(str(n) for n in lbs[:2]))


def load_db():
    return json.load(open(MJ, encoding='utf-8'))


def db_weight_points(ex):
    pts = []
    for fab, yy in ex.items():
        if fab.startswith('_'):
            continue
        for y, mm in yy.items():
            for m, v in mm.items():
                if not isinstance(v, dict):
                    continue
                n = poids_kg_list(v.get('Poids operationnel (kg / lbs)', ''))
                c = v.get('Classe machine')
                if n and c:
                    pts.append((n[0], c))
    return pts


def classe_voisins(kg, pts):
    for tol in (0.07, 0.12, 0.20, 0.35):
        lo, hi = kg * (1 - tol), kg * (1 + tol)
        c = collections.Counter(cl for w, cl in pts if lo <= w <= hi)
        if c:
            top, n = c.most_common(1)[0]
            return top, n, sum(c.values())
    return '', 0, 0


def main():
    db = load_db()
    ex = db['Excavatrice']
    pts = db_weight_points(ex)
    lot = json.load(open(LOT_PATH, encoding='utf-8'))

    existing = collections.defaultdict(dict)
    for fab, yy in ex.items():
        if fab.startswith('_'):
            continue
        for y, mm in yy.items():
            for m in mm:
                existing[fab].setdefault(norm(m), m)

    renommes, collisions, clamped, reclasses, ajouts = [], [], [], [], []
    plan = []   # (fab, modele, annees[], entry)

    for x in lot:
        fab = FAB_MAP.get(x['fab'], x['fab'])
        modele = clean_modele(x['modele'])
        if modele != x['modele']:
            renommes.append((fab, x['modele'], modele))

        if norm(modele) in existing.get(fab, {}):
            collisions.append((fab, x['modele'], modele, existing[fab][norm(modele)]))
            continue

        nums = poids_kg_list(x['poids'])
        kg = nums[0] if nums else 0
        classe, nv, tv = classe_voisins(kg, pts) if kg else ('', 0, 0)
        if not classe:
            classe = x['classe']
        if classe != x['classe']:
            reclasses.append((fab, modele, kg, x['classe'], classe, nv, tv))

        traction = x['traction']
        entry = {
            'Flag': 'FALSE',
            'Puissance moteur (kW / HP)': '',
            'Type de traction': traction,
            'Type de boom': 'Boom 2 parties (articule)' if traction == 'Roue' else 'Boom 1 partie',
            'Longueur de fleche (m / pi)': '',
            'Longueur de stick (m / pi)': '',
            'Swing boom': 'A completer',
            'Voltage machine (V/type)': '12V DC' if (kg and kg < 5000) else '24V DC',
            'Capacite max de levage (kg / lbs)': '',
            'Poids operationnel (kg / lbs)': fmt_poids(x['poids']),
            'Classe machine': classe,
            'Test Robin': '',
            '_harnais': harnais_pour(fab, modele),
            '_source_bom': 'Defaut',
            '_note_tech_texte': '',
            '_note_tech_auteur': '',
            '_note_tech_date': '',
            '_actif': 'Oui',
            '_notes': '',
        }

        a = re.findall(r'\d{4}', x['annees'])
        lo, hi = int(a[0]), int(a[-1])
        want = [str(y) for y in range(lo, hi + 1)]
        have = [y for y in want if y in ex.get(fab, {})]
        if len(have) != len(want):
            clamped.append((fab, modele, x['annees'], sorted(set(want) - set(have))))
        if not have:
            continue
        plan.append((fab, modele, have, entry))
        ajouts.append((fab, modele, have[0] + '-' + have[-1], kg, classe))

    print('=== RAPPORT D\'IMPORT (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
    print('lot valide      : %d modeles' % len(lot))
    print('a ajouter       : %d modeles / %d entrees annee-modele'
          % (len(plan), sum(len(p[2]) for p in plan)))
    print('collisions      : %d' % len(collisions))
    print('noms nettoyes   : %d' % len(renommes))
    print('classes revues  : %d' % len(reclasses))
    print('annees rognees  : %d' % len(clamped))

    if collisions:
        print('\n--- COLLISIONS (non ajoutes) ---')
        for fab, orig, m, hit in collisions:
            print('  %-14s %-28s -> "%s" existe deja' % (fab[:14], orig, hit))
    if renommes:
        print('\n--- NOMS NETTOYES ---')
        for fab, a_, b_ in renommes:
            print('  %-14s %-52s -> %s' % (fab[:14], a_, b_))
    if clamped:
        print('\n--- ANNEES ROGNEES (annee absente du fabricant en BD) ---')
        for fab, m, ann, miss in clamped:
            print('  %-14s %-22s %s : ignore %s' % (fab[:14], m, ann, ','.join(miss)))
    if reclasses:
        print('\n--- CLASSES RECALCULEES (audit -> voisins BD) ---')
        for fab, m, kg, ca, cn, nv, tv in reclasses:
            print('  %-14s %-24s %7d kg  %-24s -> %-8s (%d/%d voisins)'
                  % (fab[:14], m, kg, ca, cn, nv, tv))

    if WRITE:
        n = 0
        for fab, modele, years, entry in plan:
            for y in years:
                ex[fab][y][modele] = json.loads(json.dumps(entry))
                n += 1
        with open(MJ, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
        print('\nECRIT : %d entrees dans data/machines.json' % n)
    else:
        print('\n(simulation — rien ecrit ; relancer avec --write)')


if __name__ == '__main__':
    main()
