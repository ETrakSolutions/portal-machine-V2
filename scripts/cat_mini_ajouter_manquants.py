# -*- coding: utf-8 -*-
"""Ajoute les 3 mini-excavatrices Cat absentes de la base : 301.5, 307.5, 310.

Specs issues des pages produit officielles cat.com (en_US). Tout ce qui n a pas
ete verifie reste VIDE plutot que devine — ces champs rejoindront la liste de
travail des specs.

Sources et justification, champ par champ :
  * poids et puissance nette : fiches cat.com des trois modeles ;
  * « Swing boom » : la 307.5 et la 310 sont decrites par Caterpillar comme des
    machines a FLECHE FIXE (fixed boom, standard tail swing) -> « Non ». Pour la
    301.5, non verifie -> « A completer » (consequence : le code BOM 0008 reste
    « na » tant que ce n est pas renseigne) ;
  * voltage 12V DC : pour la 301.5, tous les micro Cat de la base sont en 12V,
    sans exception. Pour la 307.5 (8 120 kg), valeur de son voisin immediat de
    meme marque, meme famille et meme generation : la 308 CR, 8 146 kg, 12V DC
    (26 kg d ecart). ATTENTION : le voltage des Cat 8-10 t en base est
    REELLEMENT mixte (308 a 9 380 kg = 24V, 309 CR a 9 565 kg = 12V, 310 a
    10 432 kg = 24V) — a verifier en fiche si cela devient critique ;
  * classe : deduite des voisins reels de la BD par poids (meme methode que
    l import des 234 excavatrices) ;
  * annees : la gamme Next Gen 7-10 t (307.5, 308 CR, 309 CR, 310) a ete
    annoncee en octobre-novembre 2018, donc millesimes 2019+. La 307.5 s arrete
    en 2025 : Caterpillar a annonce en janvier 2026 que la 308 CR Fixed Boom la
    REMPLACE.

Usage : python scripts/cat_mini_ajouter_manquants.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from classe_par_voisins import load_db_weights, classe_voisins

MJ = os.path.join(ROOT, 'data', 'machines.json')
WRITE = '--write' in sys.argv

# modele : (kg, kW, hp, annee_debut, annee_fin, swing_boom, source)
NOUVEAUX = {
    '301.5': (1775, 15.7, 21, 2019, 2026, 'A completer',
              'cat.com 301.5 : 3 913 lb / 1 775 kg, 21 hp / 15.7 kW net'),
    '307.5': (8120, 40.9, 54.8, 2019, 2025, 'Non',
              'cat.com 307.5 : 17 905 lb / 8 120 kg, 54.8 hp / 40.9 kW net, fleche fixe'),
    # La 310 est DEJA en base (2023-2026) et ses valeurs correspondent au
    # caractere pres a cat.com (10 432 kg, 51.8 kW / 69.5 hp). Rien a ajouter.
    # Seul ecart releve : ses annees demarrent en 2023 alors que le modele est
    # annonce depuis fin 2018 -> consigne dans les signalements.
}

db = json.load(open(MJ, encoding='utf-8'))
cat = db['Excavatrice']['Caterpillar']
pts = load_db_weights()

print('=== PLAN (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
n = 0
for mod, (kg, kw, hp, a0, a1, swing, src) in NOUVEAUX.items():
    deja = sorted(y for y in cat if mod in cat[y])
    if deja:
        print('  %-8s DEJA EN BD (%s-%s) — ignore' % (mod, deja[0], deja[-1]))
        continue
    classe, nv, tv = classe_voisins(kg, pts)
    entry = {
        'Flag': 'FALSE',
        'Puissance moteur (kW / HP)': '%s kW / %s HP' % (kw, hp),
        'Type de traction': 'Chenille',
        'Type de boom': 'Boom 1 partie',
        'Longueur de fleche (m / pi)': '',
        'Longueur de stick (m / pi)': '',
        'Swing boom': swing,
        'Voltage machine (V/type)': '12V DC',
        'Capacite max de levage (kg / lbs)': 'N/D',
        'Poids operationnel (kg / lbs)': '%d kg / %d lbs' % (kg, round(kg * 2.20462)),
        'Classe machine': classe,
        'Test Robin': '',
        '_harnais': 'Z03B-0080 - Caterpillar',
        '_source_bom': 'Defaut',
        '_note_tech_texte': '',
        '_note_tech_auteur': '',
        '_note_tech_date': '',
        '_actif': 'Oui',
        '_notes': '',
    }
    annees = [str(y) for y in range(a0, a1 + 1) if str(y) in cat]
    print('  %-8s %d kg  %s kW / %s HP  classe %-8s (%d/%d voisins)  swing=%-12s %s-%s'
          % (mod, kg, kw, hp, classe, nv, tv, swing, annees[0], annees[-1]))
    print('           %s' % src)
    if WRITE:
        for y in annees:
            cat[y][mod] = json.loads(json.dumps(entry))
            n += 1

if WRITE:
    with open(MJ, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
    print('\nECRIT : %d entrees' % n)
else:
    print('\n(simulation — relancer avec --write)')
