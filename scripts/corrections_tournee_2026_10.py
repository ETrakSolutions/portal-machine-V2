# -*- coding: utf-8 -*-
"""Corrections de noms et d'entrees de la BD relevees par la tournee du 2026-10-23.

Decision de Jacquot (2026-10-23, point 7 : « ok on le fait »). Seules les corrections
appuyees par la source du fabricant sont appliquees ; les questions (nouvelle generation
distincte ? millesime de trop ?) restent dans le classeur.

  - SUPPRIMER : entree prouvee inexistante chez le fabricant ;
  - RENOMMER  : nom de la BD -> nom officiel du fabricant, sur toutes les annees, avec
                l'override de kit de chaque annee. Si le nom officiel existe deja pour
                une annee, l'entree officielle est gardee et l'ancienne retiree
                (fusion), seulement si les deux overrides de kit sont identiques.

Verifie avant : aucune cle serveur (notes_, product_codes_, deleted_...) ne porte ces
noms (listkeys du 2026-10-23), et aucune page ne les code en dur.

Usage :
  python scripts/corrections_tournee_2026_10.py            # simulation
  python scripts/corrections_tournee_2026_10.py --write
"""
import copy, json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from import_tournee_2026_10 import SLUGS, MJ, OV_DIR   # miroir de TYPE_SLUGS

WRITE = '--write' in sys.argv

SUPPRIMER = [
    # (type, fabricant, modele, annee ou None = toutes, source)
    ('Excavatrice', 'Takeuchi', 'TB350CR', None,
     'absent de la gamme Takeuchi NA (17 modeles, seul TB350R) ; /equipment/excavators/tb350cr = 404'),
    ('Loader', 'Hitachi', 'ZW160-7', '2023',
     'annee de lancement NA non prouvee ; sources tierces = 2024 (creee le 2026-10-22 depuis une demande)'),
]

RENOMMER = [
    # (type, fabricant, ancien, officiel, source)
    ('Pompe a Beton', 'Liebherr', '31 XXT', '32 XXT', 'fiche NA « 32 XXT with 5-part Z-fold », 31,7 m ; aucun 31 XXT'),
    ('Pompe a Beton', 'Alliance', '42-5 Meter', '43-5 Meter', 'page Alliance : 43m 5-SECTION RZ ; aucun 42 m'),
    ('Pompe a Beton', 'Everdigm', 'CP56RZ-5', 'ECP56RZ', 'everdigm.com : ECP56RZ'),
    ('Grue Mobile', 'Tadano', 'CC 3800-1 (Superlift)', 'CC 3800-1', 'parenthese descriptive retiree (regle de nommage BD)'),
    ('Grue Mobile', 'Manitowoc', 'MLC300 (VPC)', 'MLC300 VPC-MAX', 'manitowoc.com : « MLC300 VPC-MAX »'),
    ('Grue Mobile', 'Manitowoc', 'MLC650 (VPC)', 'MLC650 VPC-MAX', 'manitowoc.com : « MLC650 VPC-MAX »'),
    ('Telehandler', 'JLG', '10054', 'SkyTrak 10054', 'jlg.com : SkyTrak 10054'),
    ('Foreuse', 'IMT', 'AF260', 'A2F260', 'imtspa.com : A2F260 ; aucun AF260'),
    ('Foreuse', 'IMT', 'AF290', 'A290', 'imtspa.com : A290 ; aucun AF290'),
    ('Camion Vacuum', 'Tornado Global Hydrovacs', 'F4 ECO-LITE', 'F-Series F4', 'tornadotrucks.com : F-Series F4 ; ECO-LITE absent'),
    ('Retrocaveuse', 'Case', '580EV (Electrique)', '580EV', 'casece.com : 580EV Electric Backhoe Loader'),
    ('Loader', 'Volvo', '250G', 'L250G', 'archives Volvo : L250G (serie G)'),
    ('Loader', 'Volvo', '180G', 'L180G', 'archives Volvo : L180G (serie G) ; doublon de L180G 2015'),
    ('Loader', 'Hitachi', 'ZW120-06', 'ZW120-6', 'graphie : -06 = -6 (Hitachi/Wajax : ZW120-6)'),
    ('Nacelle', 'JLG', '1200SJ', '1200SJP', 'jlg.com ultra-series : 1200SJP ; aucun 1200SJ'),
]


def main():
    db = json.load(open(MJ, encoding='utf-8'))
    ovs = {t: json.load(open(os.path.join(OV_DIR, sl + '.json'), encoding='utf-8')) for t, sl in SLUGS.items()}
    touches, rapport, refus = set(), [], []

    for t, fab, mod, an, src in SUPPRIMER:
        yy = db[t][fab]
        annees = [a for a in yy if not a.startswith('_') and mod in yy[a] and (an is None or a == an)]
        for a in annees:
            del yy[a][mod]
            ovs[t][t].get(fab, {}).get(a, {}).pop(mod, None)
        touches.add(t)
        rapport.append('SUPPRIME  %s | %s | %s | %s | %s' % (t, fab, mod, ','.join(annees) or 'RIEN', src))

    for t, fab, old, new, src in RENOMMER:
        yy = db[t][fab]
        ov = ovs[t][t].get(fab, {})
        annees = sorted(a for a in yy if not a.startswith('_') and old in yy[a])
        conflits = [a for a in annees if new in yy[a] and ov.get(a, {}).get(old) != ov.get(a, {}).get(new)]
        if conflits:
            refus.append('REFUSE    %s | %s | %s -> %s : kits differents en %s' % (t, fab, old, new, ','.join(conflits)))
            continue
        fusion = []
        for a in annees:
            if new in yy[a]:
                fusion.append(a)          # l'entree officielle existe deja : on la garde
            else:
                yy[a][new] = yy[a][old]
                if old in ov.get(a, {}):
                    ov[a][new] = ov[a][old]
            del yy[a][old]
            if a in ov:
                ov[a].pop(old, None)
        touches.add(t)
        rapport.append('RENOMME   %s | %s | %s -> %s | %s%s | %s' % (
            t, fab, old, new, annees[0] + '-' + annees[-1] if annees else 'RIEN',
            ' (fusion %s)' % ','.join(fusion) if fusion else '', src))

    print('=== CORRECTIONS TOURNEE 2026-10 (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
    for l in rapport + refus:
        print(l)
    if WRITE:
        json.dump(db, open(MJ, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        for t in sorted(touches):
            f = os.path.join(OV_DIR, SLUGS[t] + '.json')
            json.dump(ovs[t], open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('ecrit :', MJ, '+ overrides', sorted(touches))


if __name__ == '__main__':
    main()
