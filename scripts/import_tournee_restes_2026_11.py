"""Restes de la tournee des modeles manquants 2026-10, tranches par Jacquot le 2026-11-23.

Six modeles, annees 2025-2026, specs relevees a la source fabricant (citations dans le message
de commit). Champ non publie = « A completer », jamais devine.
Ecartes le meme jour : Komatsu PC158USLC(i)-12 (pas encore lances), Volvo EC560 (debut 2027),
Super Products Durasucker (aucune fleche), Haulotte 45/55 XA (categorie non publiee).

    py -3.13 scripts/import_tournee_restes_2026_11.py           # simulation
    py -3.13 scripts/import_tournee_restes_2026_11.py --ecrire  # ecriture
"""
import copy
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
OV = os.path.join(ROOT, 'data', 'overrides')
FAM = os.path.join(ROOT, 'scripts', 'data', 'grues_familles.json')
SLUG = {'Excavatrice': 'excavatrice', 'Grue Mobile': 'grue-mobile', 'Pompe a Beton': 'pompe-a-beton',
        'Camion Vacuum': 'camion-vacuum', 'Retrocaveuse': 'retrocaveuse'}
AC = 'A completer'
ANNEES = ['2025', '2026']
NOTE = {'_note_tech_auteur': 'Claude (tournee 2026-10, restes)', '_note_tech_date': '2026-11-23'}
META = {'_note_tech_texte': '', '_note_tech_auteur': '', '_note_tech_date': '', '_actif': 'Oui'}

# (type, fabricant, modele, specs, modele voisin dont on recopie l'override de kit (ou None), note tech)
MODELES = [
    ('Retrocaveuse', 'Case', '575N EP', {
        'Puissance moteur': '74 hp',
        'Profondeur fouille max': '14.4 ft',
        'Hauteur chargement': '11.9 ft',
        'Godet chargeur': '1.20 yd3',
        'Force cavage': '12 359 lb',
        'Poids operationnel': '18 298 lb',
    }, None, "Nom commercial « Utility Plus » (fiche Case : UTILITY PLUS 575N EP BACKHOE LOADER). "
             "Profondeur 14 ft 5 in (Extendahoe 18 ft 4 in), hauteur de chargement retro 11 ft 11 in, "
             "force de cavage au verin de godet."),
    ('Camion Vacuum', 'Vacall', 'AJV 1215', {
        'Longueur de boom': '23\'6" (portee max)',
        'Nombre de sections de boom': AC,
        'Angle de rotation': '180°',
        'Voltage': '12V',
    }, 'AJV 1015', "AllJetVac 12 vg (fiche 1215 SPECIFICATIONS) : fleche avant tube-in-tube, serie P (180°), "
                   "differente de « AllJetVac 12yd » (8'6\", 270°)."),
    ('Pompe a Beton', 'Betonstar', 'H58-5RZ', {
        'Type': 'Automotrice',
        'Nombre de sections': '5',
        'Type de pliage': 'RZ-Fold',
        'Longueur de chaque section': 'Portee 57.2m',
        'Voltage machine (V/type)': AC,
        'Type de rotation': '360°',
        'Console operateur': 'Telecommande HBC',
        'E-stop': AC,
        'Notes': 'Portée verticale 57.2 m, horizontale 52.2 m',
        'Section telescopique': AC,
        '_source_bom': 'Defaut',
    }, None, "Nom de la brochure ABD-H58-5RZ et du tableau de specs. La page liste Betonstar USA affiche "
             "« H58-7RRZ, 7 sections » : contradiction du fabricant, nom tranche par Jacquot le 2026-11-23."),
    ('Grue Mobile', 'Liebherr', 'LTC 1050-3.1E', {
        'Capacite max': '50 t',
        'Fleche telescopique': '8.1-36 m',
        'Hauteur max': '48 m',
        'Essieux': '3',
        'Puissance moteur': '243 kW (Cummins diesel) + moteur electrique optionnel pour les mouvements de grue',
        'Voltage machine (V/type)': AC,
        'Contrepoids max': '6.5 t',
    }, None, "Version electrique de la LTC 1050-3.1 (memes donnees de fleche, page Liebherr Canada). "
             "Voltage non publie sur la page de la E."),
    ('Grue Mobile', 'Maeda', 'MK3053C', {
        'Capacite max': AC,
        'Fleche telescopique': 'Fleche articulee (knuckle boom)',
        'Hauteur max': '12.0 m (16.95 m avec fléchette)',
        'Essieux': 'Chenilles',
        'Puissance moteur': AC,
        'Voltage machine (V/type)': AC,
        'Contrepoids max': AC,
    }, 'MC305C', "Mini-grue a fleche articulee (menu Maeda America « Knuckle Boom Crane »). Capacite non "
                 "inscrite : la page affiche « 6,560 lb x 5.9 ft » et « 2,200t x 17.1ft with Jib », la page "
                 "Battery Cranes « 6,210 lb x 4.5 ft ». Versions batterie et diesel/electrique."),
    ('Excavatrice', 'Volvo CE', 'EC18 Electric', {
        'Flag': 'FALSE',
        'Puissance moteur (kW / HP)': AC,
        'Type de traction': 'Chenille',
        'Type de boom': AC,
        'Longueur de fleche (m / pi)': AC,
        'Longueur de stick (m / pi)': AC,
        'Swing boom': AC,
        'Voltage machine (V/type)': AC,
        'Capacite max de levage (kg / lbs)': AC,
        'Poids operationnel (kg / lbs)': '1960 kg / 4321 lbs',
        'Classe machine': 'Mini',
        'Test Robin': '',
        '_harnais': 'Z03B-0034 - Volvo',
        '_source_bom': 'Defaut',
        '_notes': '',
    }, 'EC18E', "Excavatrice compacte electrique 1,8 t (batterie 20 kWh, 48 V), distincte de l'EC18E diesel. "
                "Poids 4 321 lbs (page Volvo CE Canada). Swing boom et dimensions non publies."),
]


def main(ecrire):
    db = json.load(open(MJ, encoding='utf-8'))
    ovs = {t: json.load(open(os.path.join(OV, s + '.json'), encoding='utf-8')) for t, s in SLUG.items()}
    fam = json.load(open(FAM, encoding='utf-8'))
    n = 0
    for t, fab, mod, specs, voisin, note in MODELES:
        yy = db[t][fab]
        for a in ANNEES:
            assert a in yy, (t, fab, a)
            assert mod not in yy[a], ('deja en BD', t, fab, mod, a)
            e = dict(specs)
            for k, v in META.items():
                e.setdefault(k, v)
            e['_note_tech_texte'] = note
            e.update(NOTE)
            yy[a][mod] = e
            n += 1
            if voisin:
                o = ovs[t][t].get(fab, {}).get(a, {}).get(voisin)
                if o:
                    ovs[t][t].setdefault(fab, {}).setdefault(a, {})[mod] = copy.deepcopy(o)
                    print('  override de %s recopie : %s %s %s %s' % (voisin, t, fab, mod, a))
        print('%-14s %-10s %-14s %s' % (t, fab, mod, ','.join(ANNEES)))
    fam['Liebherr|LTC 1050-3.1E'] = fam['Liebherr|LTC 1050-3.1']
    fam['Maeda|MK3053C'] = 'Mini / araignee'
    print('entrees ajoutees : %d' % n)
    if not ecrire:
        print('SIMULATION : rien ecrit')
        return
    json.dump(db, open(MJ, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for t, s in SLUG.items():
        json.dump(ovs[t], open(os.path.join(OV, s + '.json'), 'w', encoding='utf-8'), ensure_ascii=False,
                  separators=(',', ':'))
    json.dump(fam, open(FAM, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('ecrit : machines.json, overrides, grues_familles.json')


if __name__ == '__main__':
    main('--ecrire' in sys.argv)
