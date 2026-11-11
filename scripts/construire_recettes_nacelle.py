# -*- coding: utf-8 -*-
r"""Construit data/nacelle-recettes.json : la recette de hauteur de chaque nacelle du portail.

Source : le classeur « Nacelle - recettes par boom (lot 2 rév. N).xlsx » (Projet Liste de prix\livrables),
onglet Machines, colonnes « Recette de hauteur », « Option 0904 » et « Validé au portail ».
S'y ajoutent les machines tranchées hors du lot 2 (table SUPPLEMENT ci-dessous).

Une recette vide (« INCONNU ») ou qui contient le 0916 (course > 15 m, « sur demande », sans prix) est écartée.
Une nacelle absente du fichier n'a PAS de recette : le portail n'offre alors que le bouton
« Demander une analyse » pour la hauteur.

Format (compact, une ligne) :
  {"_meta":{...}, "Fabricant|Modèle": {"h":["0913","0912","0910"], "o":1, "v":1}}
  h = codes de hauteur dans l'ordre des booms (un code peut revenir) ; o = 0904 offert en option ;
  v = recette validée (1) ou sous réserve d'analyse (0).

Usage : python scripts/construire_recettes_nacelle.py "<chemin du classeur>"
"""
import sys, os, json, re, datetime
import openpyxl

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, '..', 'data', 'nacelle-recettes.json')

# Machines tranchées hors du classeur du lot 2.
#  - Lot 1 Genie : fichier de Mathieu « Genie_TEST-10_v3.xlsx » (courriel du 2026-11-04 11 h 11).
#    SX-180 exclu (0916, groupe des 100 pi et plus) ; ZX-135/70 à 0 (règle des 80 pi et plus).
#  - Mâts verticaux : 0915, courriel de Mathieu du 2026-11-04 11 h 43.
SUPPLEMENT = {
    'Genie|Z-45 XC':      (['0913', '0911', '0910'], 0, 1),
    'Genie|S-65 XC':      (['0912', '0910'], 0, 1),
    'Genie|ZX-135/70':    (['0912', '0912', '0911'], 0, 0),
    'Genie|Z-80/60':      (['0912', '0912', '0910'], 0, 1),
    'Genie|S-60 FE':      (['0912', '0910'], 0, 1),
    'Genie|Z-30/20 N RJ': (['0913', '0912', '0910'], 1, 1),
    'Genie|TZ-34/20':     (['0913', '0912'], 0, 1),
    'Genie|S-40 XC':      (['0911'], 0, 1),
    'Genie|Z-62/40':      (['0913', '0912', '0910'], 0, 1),
    'Haulotte|Star 26 J': (['0915'], 0, 1),
    'Manitou|VJR 26':     (['0915'], 0, 1),
}
CODES_OK = {'0910', '0911', '0912', '0913', '0914', '0915'}


def main(classeur):
    wb = openpyxl.load_workbook(classeur, read_only=True, data_only=True)
    ws = wb['Machines']
    rows = ws.iter_rows(values_only=True)
    H = list(next(rows))
    ix = {h: i for i, h in enumerate(H)}
    out, ecartees = {}, []
    for r in rows:
        if not r[ix['Fabricant']]:
            continue
        cle = '%s|%s' % (r[ix['Fabricant']], r[ix['Modèle']])
        codes = re.findall(r'09\d\d', str(r[ix['Recette de hauteur']] or ''))
        if not codes or '0916' in codes:
            ecartees.append(cle)
            continue
        if not codes or any(c not in CODES_OK for c in codes):
            raise SystemExit('Recette illisible ou code hors liste pour %s : %r' % (cle, r[ix['Recette de hauteur']]))
        o = 1 if str(r[ix['Option 0904']] or '').strip().lower() == 'oui' else 0
        v = 1 if r[ix['Validé au portail']] == 1 else 0
        out[cle] = {'h': codes, 'o': o, 'v': v}
    for cle, (h, o, v) in SUPPLEMENT.items():
        if cle in out:
            raise SystemExit('Doublon classeur / SUPPLEMENT : ' + cle)
        out[cle] = {'h': h, 'o': o, 'v': v}
    meta = {'source': os.path.basename(classeur), 'genere': datetime.date.today().isoformat(),
            'machines': len(out), 'validees': sum(1 for x in out.values() if x['v'] == 1),
            'ecartees_0916': sorted(ecartees)}
    data = {'_meta': meta}
    data.update(dict(sorted(out.items())))
    with open(SORTIE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1])
