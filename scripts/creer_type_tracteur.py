# -*- coding: utf-8 -*-
"""Cree le type de machine « Tracteur de ferme » (charpente vide).

Decisions (Jacquot, 2026-08-05) :
  - perimetre : toute la gamme, compacts inclus (les modeles viendront ensuite) ;
  - champs specs : les 3 memes que le type Loader ;
  - catalogue BOM : la balance Scale Lite 1200-0020 uniquement, sans imprimante.

Ce script ne fait que la partie DONNEES. Le cablage frontend (TYPE_SLUGS,
libelles, listes des pages) et surtout la synchronisation du backend Apps Script
(OV_TYPE_SLUGS) sont traites a part — sans cette derniere, les specs se
sauvegardent mais les BOM echouent (piege rencontre sur Loader et Nacelle).

Usage : python scripts/creer_type_tracteur.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
OVDIR = os.path.join(ROOT, 'data', 'overrides')
WRITE = '--write' in sys.argv

TYPE = 'Tracteur de ferme'
SLUG = 'tracteur-de-ferme'
CATALOGUE = {
    '0020 Balance Scale Lite': {
        'pn': '1200-0020',
        'desc': 'Balance Scale Lite (tracteur)',
        'def': 'j',
    },
}
# Gabarit d une entree machine : memes champs que le type Loader.
GABARIT = {
    'Capacite de levage': '',
    'Puissance moteur': '',
    'Poids operationnel': '',
    '_note_tech_texte': '',
    '_note_tech_auteur': '',
    '_note_tech_date': '',
    '_actif': 'Oui',
}

db = json.load(open(MJ, encoding='utf-8'))

print('=== ETAT ACTUEL ===')
print('   types en base : %d' % len([t for t in db]))
print('   « %s » present : %s' % (TYPE, TYPE in db))
print('   data/overrides/%s.json : %s'
      % (SLUG, os.path.exists(os.path.join(OVDIR, SLUG + '.json'))))

if TYPE in db:
    print('\n   le type existe deja — rien a creer')
else:
    print('\n=== A CREER ===')
    print('   type « %s » avec son catalogue :' % TYPE)
    for k, v in CATALOGUE.items():
        print('      %-28s %-12s def=%s   %s' % (k, v['pn'], v['def'], v['desc']))
    print('   gabarit d entree (%d champs) : %s'
          % (len([k for k in GABARIT if not k.startswith('_')]),
             ', '.join(k for k in GABARIT if not k.startswith('_'))))
    print('   fichier data/overrides/%s.json (vide)' % SLUG)

if WRITE:
    if TYPE not in db:
        db[TYPE] = {'_bom_labels': CATALOGUE}
        with open(MJ, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
        print('\n   ECRIT : type ajoute a machines.json')
    p = os.path.join(OVDIR, SLUG + '.json')
    if not os.path.exists(p):
        with open(p, 'w', encoding='utf-8') as f:
            json.dump({}, f, ensure_ascii=False)
        print('   ECRIT : %s' % os.path.relpath(p, ROOT))
    # gabarit conserve pour l import des modeles a venir
    g = os.path.join(ROOT, 'scripts', 'data', 'tracteur_gabarit.json')
    json.dump(GABARIT, open(g, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('   ECRIT : %s' % os.path.relpath(g, ROOT))
else:
    print('\n(simulation — relancer avec --write)')
