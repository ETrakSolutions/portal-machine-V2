# -*- coding: utf-8 -*-
"""Complement d'import (decisions du 2026-08-05) :

  1. Les 4 Bobcat laisses en suspens dans l'Excel d'audit (E25, E45, E48, E80),
     confirmes absents de la BD.
  2. Les annees 2015-2019 creees pour Yanmar, afin d'accueillir les modeles
     dont la periode NA commence avant 2020 (ViO35-6A, ViO45-6A, ViO50-6A).

Memes regles que scripts/import_excavatrices_manquantes.py (classe deduite des
voisins BD par poids, voltage par seuil de 5000 kg, harnais par marque).

Usage : python scripts/import_lot2_bobcat_yanmar.py [--write]
"""
import json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_excavatrices_manquantes import (MJ, harnais_pour, clean_modele, poids_kg_list,
                                            fmt_poids, db_weight_points, classe_voisins,
                                            LOT_PATH, norm)

WRITE = '--write' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Bobcat : donnees de la feuille « Manquants a valider » (lignes non tranchees)
BOBCAT = [
    {'fab': 'Bobcat', 'modele': 'E25', 'annees': '2015-2018', 'poids': '2440', 'traction': 'Chenille'},
    {'fab': 'Bobcat', 'modele': 'E45', 'annees': '2015-2021', 'poids': '4570', 'traction': 'Chenille'},
    {'fab': 'Bobcat', 'modele': 'E48', 'annees': '2020-2026', 'poids': '4460', 'traction': 'Chenille'},
    {'fab': 'Bobcat', 'modele': 'E80', 'annees': '2019-2025', 'poids': '8478', 'traction': 'Chenille'},
]

# Annees a creer pour une marque (decision utilisateur)
NEW_YEARS = {'Yanmar': ['2015', '2016', '2017', '2018', '2019']}


def entry_for(fab, modele, poids, traction):
    nums = poids_kg_list(poids)
    kg = nums[0] if nums else 0
    return {
        'Flag': 'FALSE',
        'Puissance moteur (kW / HP)': '',
        'Type de traction': traction,
        'Type de boom': 'Boom 2 parties (articule)' if traction == 'Roue' else 'Boom 1 partie',
        'Longueur de fleche (m / pi)': '',
        'Longueur de stick (m / pi)': '',
        'Swing boom': 'A completer',
        'Voltage machine (V/type)': '12V DC' if (kg and kg < 5000) else '24V DC',
        'Capacite max de levage (kg / lbs)': '',
        'Poids operationnel (kg / lbs)': fmt_poids(poids),
        'Classe machine': '',
        'Test Robin': '',
        '_harnais': harnais_pour(fab, modele),
        '_source_bom': 'Defaut',
        '_note_tech_texte': '',
        '_note_tech_auteur': '',
        '_note_tech_date': '',
        '_actif': 'Oui',
        '_notes': '',
    }


def main():
    db = json.load(open(MJ, encoding='utf-8'))
    ex = db['Excavatrice']
    pts = db_weight_points(ex)
    lot = json.load(open(LOT_PATH, encoding='utf-8'))
    ajouts = []

    # ---- 1) Bobcat ----
    for x in BOBCAT:
        fab, modele = x['fab'], x['modele']
        if any(norm(modele) == norm(m) for y in ex[fab] for m in ex[fab][y]):
            print('  DEJA EN BD (ignore) : %s %s' % (fab, modele))
            continue
        e = entry_for(fab, modele, x['poids'], x['traction'])
        kg = poids_kg_list(x['poids'])[0]
        e['Classe machine'] = classe_voisins(kg, pts)[0]
        a = re.findall(r'\d{4}', x['annees'])
        years = [str(y) for y in range(int(a[0]), int(a[-1]) + 1) if str(y) in ex[fab]]
        ajouts.append((fab, modele, years, e, '%d kg, classe %s' % (kg, e['Classe machine'])))

    # ---- 2) Yanmar : annees 2015-2019 + modeles concernes ----
    for fab, years in NEW_YEARS.items():
        for y in years:
            if y not in ex[fab]:
                print('  CREE annee %s pour %s' % (y, fab))
                if WRITE:
                    ex[fab][y] = {}
    yanmar_src = [x for x in lot
                  if x['fab'] == 'Yanmar' and int(re.findall(r'\d{4}', x['annees'])[0]) < 2020]
    for x in yanmar_src:
        fab, modele = 'Yanmar', clean_modele(x['modele'])
        e = entry_for(fab, modele, x['poids'], x['traction'])
        kg = poids_kg_list(x['poids'])[0]
        e['Classe machine'] = classe_voisins(kg, pts)[0]
        a = re.findall(r'\d{4}', x['annees'])
        # bornee aux annees desormais disponibles (2015 est le plancher du portail)
        want = [str(y) for y in range(max(int(a[0]), 2015), int(a[-1]) + 1)]
        years = [y for y in want if y in ex[fab] or y in NEW_YEARS[fab]]
        years = [y for y in years
                 if not (y in ex[fab] and modele in ex[fab].get(y, {}))]   # pas de doublon
        ajouts.append((fab, modele, years, e, '%d kg, classe %s (annees %s)'
                       % (kg, e['Classe machine'], ','.join(years) if years else 'aucune')))

    print('\n=== PLAN (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
    n = 0
    for fab, modele, years, e, info in ajouts:
        print('  %-8s %-10s %-12s %s' % (fab, modele,
                                         ('%s-%s' % (years[0], years[-1])) if years else '-', info))
        n += len(years)
    print('  total : %d modeles / %d entrees' % (len(ajouts), n))

    if WRITE:
        for fab, modele, years, e, _ in ajouts:
            for y in years:
                ex[fab].setdefault(y, {})[modele] = json.loads(json.dumps(e))
        with open(MJ, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
        print('\nECRIT dans data/machines.json')
    else:
        print('\n(simulation — relancer avec --write)')


if __name__ == '__main__':
    main()
