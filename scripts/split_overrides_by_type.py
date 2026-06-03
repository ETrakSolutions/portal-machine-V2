#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Split data/overrides.json en un fichier par type : data/overrides/<slug>.json (compact).
Migration ADDITIVE : chaque section type est copiee telle quelle. Les excavatrices ne sont
jamais modifiees, juste deplacees dans leur propre fichier.
Idempotent : relancable. N'ecrit PAS dans les fichiers des types absents de overrides.json
(ils restent vides/non crees jusqu'a la 1re sauvegarde).
"""
import json, os, sys

# Table de correspondance CANONIQUE type -> slug (doit etre identique cote frontend ET Apps Script)
TYPE_SLUGS = {
    'Excavatrice': 'excavatrice',
    'Pompe a Beton': 'pompe-a-beton',
    'Grue Mobile': 'grue-mobile',
    'Camion Girafe (Boom Truck)': 'camion-girafe',
    'Telehandler': 'telehandler',
    'Foreuse': 'foreuse',
    'Camion Vacuum': 'camion-vacuum',
    'Retrocaveuse': 'retrocaveuse',
}

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, '..', 'data'))
SRC  = os.path.join(DATA, 'overrides.json')
OUTDIR = os.path.join(DATA, 'overrides')

def main():
    with open(SRC, 'r', encoding='utf-8') as f:
        ov = json.load(f)

    os.makedirs(OUTDIR, exist_ok=True)
    unknown = [t for t in ov.keys() if t not in TYPE_SLUGS]
    if unknown:
        print('ATTENTION : types sans slug (ignores) : %s' % unknown, file=sys.stderr)

    written = []
    for t, slug in TYPE_SLUGS.items():
        # On garde le wrapper de type DANS le fichier -> { "<type>": { fab: {...} } }
        # pour que le merge frontend (for t in ov) marche sans changement.
        payload = {t: ov[t]} if t in ov else {t: {}}
        path = os.path.join(OUTDIR, slug + '.json')
        with open(path, 'w', encoding='utf-8') as out:
            json.dump(payload, out, ensure_ascii=False, separators=(',', ':'))  # compact
        size = os.path.getsize(path)
        n = sum(1 for fab in payload[t].values() for yr in fab.values() for _ in yr.values())
        written.append((slug, n, size))

    print('%-22s %8s %12s' % ('fichier', 'entrees', 'octets'))
    for slug, n, size in written:
        print('%-22s %8d %12d' % ('overrides/%s.json' % slug, n, size))

if __name__ == '__main__':
    main()
