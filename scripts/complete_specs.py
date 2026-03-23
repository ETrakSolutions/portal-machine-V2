#!/usr/bin/env python3
"""Complete missing excavator specs in machines.json"""
import json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'machines.json')

with open(DB_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

def fmt_w(kg):
    return f"{kg} kg / {round(kg * 2.205)} lbs"

def fmt_p(kw, hp):
    return f"{kw} kW / {hp} HP"

# Specs database per manufacturer
# Keys: short field names -> p=power, b=boom, f=fleche, s=stick, sw=swing, v=voltage, c=capacity, w=weight, cl=class
FIELD_MAP = {
    'p': 'Puissance moteur (kW / HP)',
    'b': 'Type de boom',
    'f': 'Longueur de fleche (m / pi)',
    's': 'Longueur de stick (m / pi)',
    'sw': 'Swing boom',
    'v': 'Voltage machine (V/type)',
    'c': 'Capacite max de levage (kg / lbs)',
    'w': 'Poids operationnel (kg / lbs)',
    'cl': 'Classe machine'
}

ALL_SPECS = {
    'Bobcat': {
        'E08': {'p': fmt_p(7.0, 9.4), 'b': 'Boom 1 partie', 'f': '1.38 m / 4\'06"', 's': '0.85 m / 2\'10"', 'sw': 'Non', 'v': '12V DC', 'c': '200 kg / 441 lbs', 'w': fmt_w(985), 'cl': 'Mini'},
        'E10': {'p': fmt_p(7.0, 9.4), 'b': 'Boom 1 partie', 'f': '1.52 m / 5\'00"', 's': '0.90 m / 2\'11"', 'sw': 'Non', 'v': '12V DC', 'c': '280 kg / 617 lbs', 'w': fmt_w(1080), 'cl': 'Mini'},
        'E20': {'p': fmt_p(12.0, 16.1), 'b': 'Boom 1 partie', 'f': '2.00 m / 6\'07"', 's': '1.10 m / 3\'07"', 'sw': 'Oui', 'v': '12V DC', 'c': '500 kg / 1102 lbs', 'w': fmt_w(1800), 'cl': 'Mini'},
        'E26': {'p': fmt_p(15.0, 20.1), 'b': 'Boom 1 partie', 'f': '2.42 m / 7\'11"', 's': '1.30 m / 4\'03"', 'sw': 'Oui', 'v': '12V DC', 'c': '780 kg / 1720 lbs', 'w': fmt_w(2540), 'cl': 'Mini'},
        'E32': {'p': fmt_p(19.0, 25.5), 'b': 'Boom 1 partie', 'f': '2.60 m / 8\'06"', 's': '1.40 m / 4\'07"', 'sw': 'Non', 'v': '12V DC', 'c': '950 kg / 2094 lbs', 'w': fmt_w(3280), 'cl': 'Mini'},
        'E35': {'p': fmt_p(19.0, 25.5), 'b': 'Boom 1 partie', 'f': '2.70 m / 8\'10"', 's': '1.50 m / 4\'11"', 'sw': 'Non', 'v': '12V DC', 'c': '1050 kg / 2315 lbs', 'w': fmt_w(3430), 'cl': 'Mini'},
        'E42': {'p': fmt_p(24.0, 32.2), 'b': 'Boom 1 partie', 'f': '3.00 m / 9\'10"', 's': '1.60 m / 5\'03"', 'sw': 'Non', 'v': '12V DC', 'c': '1300 kg / 2866 lbs', 'w': fmt_w(4180), 'cl': 'Mini'},
        'E50': {'p': fmt_p(33.0, 44.3), 'b': 'Boom 1 partie', 'f': '3.20 m / 10\'06"', 's': '1.70 m / 5\'07"', 'sw': 'Non', 'v': '12V DC', 'c': '1500 kg / 3307 lbs', 'w': fmt_w(4900), 'cl': 'Mini'},
        'E55': {'p': fmt_p(33.0, 44.3), 'b': 'Boom 2 parties', 'f': '3.40 m / 11\'02"', 's': '1.80 m / 5\'11"', 'sw': 'Non', 'v': '12V DC', 'c': '1700 kg / 3748 lbs', 'w': fmt_w(5370), 'cl': 'Standard'},
        'E60': {'p': fmt_p(36.0, 48.3), 'b': 'Boom 2 parties', 'f': '3.60 m / 11\'10"', 's': '1.90 m / 6\'03"', 'sw': 'Non', 'v': '24V DC', 'c': '1900 kg / 4189 lbs', 'w': fmt_w(6030), 'cl': 'Standard'},
        'E85': {'p': fmt_p(42.0, 56.3), 'b': 'Boom 2 parties', 'f': '4.05 m / 13\'03"', 's': '2.40 m / 7\'10"', 'sw': 'Non', 'v': '24V DC', 'c': '2800 kg / 6173 lbs', 'w': fmt_w(8370), 'cl': 'Standard'},
    },
    'Case': {
        'CX75C SR': {'p': fmt_p(42.0, 56.3), 'b': 'Boom 2 parties', 'f': '3.85 m / 12\'08"', 's': '2.20 m / 7\'03"', 'sw': 'Non', 'v': '24V DC', 'c': '2500 kg / 5512 lbs', 'w': fmt_w(7500), 'cl': 'Standard'},
    },
    'SANY': {
        'SY135C': {'p': fmt_p(73.0, 97.9), 'b': 'Boom 2 parties', 'f': '4.75 m / 15\'07"', 's': '2.61 m / 8\'07"', 'sw': 'Non', 'v': '24V DC', 'c': '5200 kg / 11466 lbs', 'w': fmt_w(13500), 'cl': 'Standard'},
        'SY155H': {'p': fmt_p(82.0, 109.9), 'b': 'Boom 2 parties', 'f': '5.00 m / 16\'05"', 's': '2.70 m / 8\'10"', 'sw': 'Non', 'v': '24V DC', 'c': '5800 kg / 12787 lbs', 'w': fmt_w(15200), 'cl': 'Standard'},
        'SY215C': {'p': fmt_p(117.0, 156.9), 'b': 'Boom 2 parties', 'f': '5.70 m / 18\'08"', 's': '2.95 m / 9\'08"', 'sw': 'Non', 'v': '24V DC', 'c': '8500 kg / 18739 lbs', 'w': fmt_w(21500), 'cl': '270'},
        'SY265C': {'p': fmt_p(130.0, 174.3), 'b': 'Boom 2 parties', 'f': '5.90 m / 19\'04"', 's': '3.10 m / 10\'02"', 'sw': 'Non', 'v': '24V DC', 'c': '10500 kg / 23152 lbs', 'w': fmt_w(25800), 'cl': '270'},
        'SY365H': {'p': fmt_p(200.0, 268.2), 'b': 'Boom 2 parties', 'f': '6.50 m / 21\'04"', 's': '3.30 m / 10\'10"', 'sw': 'Non', 'v': '24V DC', 'c': '15000 kg / 33075 lbs', 'w': fmt_w(36500), 'cl': '300'},
    },
    'Hitachi': {
        'ZX17U-5N': {'p': fmt_p(10.5, 14.1), 'b': 'Boom 1 partie', 'f': '1.80 m / 5\'11"', 's': '1.05 m / 3\'05"', 'sw': 'Oui', 'v': '12V DC', 'c': '450 kg / 992 lbs', 'w': fmt_w(1750), 'cl': 'Mini'},
        'ZX26U-5N': {'p': fmt_p(15.2, 20.4), 'b': 'Boom 1 partie', 'f': '2.20 m / 7\'03"', 's': '1.20 m / 3\'11"', 'sw': 'Oui', 'v': '12V DC', 'c': '680 kg / 1499 lbs', 'w': fmt_w(2730), 'cl': 'Mini'},
        'ZX35U-5N': {'p': fmt_p(21.2, 28.4), 'b': 'Boom 1 partie', 'f': '2.50 m / 8\'02"', 's': '1.35 m / 4\'05"', 'sw': 'Oui', 'v': '12V DC', 'c': '900 kg / 1984 lbs', 'w': fmt_w(3580), 'cl': 'Mini'},
        'ZX50U-5N': {'p': fmt_p(28.6, 38.4), 'b': 'Boom 1 partie', 'f': '3.00 m / 9\'10"', 's': '1.60 m / 5\'03"', 'sw': 'Non', 'v': '12V DC', 'c': '1300 kg / 2866 lbs', 'w': fmt_w(5150), 'cl': 'Standard'},
        'ZX55U-5N': {'p': fmt_p(28.6, 38.4), 'b': 'Boom 1 partie', 'f': '3.10 m / 10\'02"', 's': '1.70 m / 5\'07"', 'sw': 'Non', 'v': '12V DC', 'c': '1400 kg / 3086 lbs', 'w': fmt_w(5440), 'cl': 'Standard'},
        'ZX75US-5N': {'p': fmt_p(38.2, 51.2), 'b': 'Boom 1 partie', 'f': '3.60 m / 11\'10"', 's': '2.00 m / 6\'07"', 'sw': 'Non', 'v': '24V DC', 'c': '2100 kg / 4630 lbs', 'w': fmt_w(7530), 'cl': 'Standard'},
        'ZX85USB-5N': {'p': fmt_p(41.1, 55.1), 'b': 'Boom 1 partie', 'f': '3.80 m / 12\'06"', 's': '2.20 m / 7\'03"', 'sw': 'Non', 'v': '24V DC', 'c': '2500 kg / 5512 lbs', 'w': fmt_w(8420), 'cl': 'Standard'},
    },
    'Kubota': {
        'K008-5': {'p': fmt_p(6.3, 8.4), 'b': 'Boom 1 partie', 'f': '1.20 m / 3\'11"', 's': '0.80 m / 2\'07"', 'sw': 'Oui', 'v': '12V DC', 'c': '150 kg / 331 lbs', 'w': fmt_w(960), 'cl': 'Mini'},
        'KX018-4': {'p': fmt_p(11.9, 16.0), 'b': 'Boom 1 partie', 'f': '1.85 m / 6\'01"', 's': '1.05 m / 3\'05"', 'sw': 'Oui', 'v': '12V DC', 'c': '450 kg / 992 lbs', 'w': fmt_w(1845), 'cl': 'Mini'},
        'KX040-4': {'p': fmt_p(24.5, 32.9), 'b': 'Boom 1 partie', 'f': '2.78 m / 9\'01"', 's': '1.52 m / 4\'11"', 'sw': 'Oui', 'v': '12V DC', 'c': '1050 kg / 2315 lbs', 'w': fmt_w(4365), 'cl': 'Mini'},
        'KX057-4': {'p': fmt_p(33.7, 45.2), 'b': 'Boom 1 partie', 'f': '3.20 m / 10\'06"', 's': '1.80 m / 5\'11"', 'sw': 'Non', 'v': '12V DC', 'c': '1600 kg / 3527 lbs', 'w': fmt_w(5480), 'cl': 'Standard'},
        'U15-5': {'p': fmt_p(9.3, 12.5), 'b': 'Boom 1 partie', 'f': '1.58 m / 5\'02"', 's': '0.92 m / 3\'00"', 'sw': 'Oui', 'v': '12V DC', 'c': '350 kg / 772 lbs', 'w': fmt_w(1540), 'cl': 'Mini'},
        'U27-4': {'p': fmt_p(15.5, 20.8), 'b': 'Boom 1 partie', 'f': '2.10 m / 6\'11"', 's': '1.20 m / 3\'11"', 'sw': 'Oui', 'v': '12V DC', 'c': '650 kg / 1433 lbs', 'w': fmt_w(2710), 'cl': 'Mini'},
        'U35-4': {'p': fmt_p(18.5, 24.8), 'b': 'Boom 1 partie', 'f': '2.50 m / 8\'02"', 's': '1.35 m / 4\'05"', 'sw': 'Non', 'v': '12V DC', 'c': '850 kg / 1874 lbs', 'w': fmt_w(3590), 'cl': 'Mini'},
        'U55-4': {'p': fmt_p(33.7, 45.2), 'b': 'Boom 2 parties', 'f': '3.40 m / 11\'02"', 's': '1.80 m / 5\'11"', 'sw': 'Non', 'v': '12V DC', 'c': '1500 kg / 3307 lbs', 'w': fmt_w(5280), 'cl': 'Standard'},
    },
    'Takeuchi': {
        'TB216': {'p': fmt_p(10.7, 14.3), 'b': 'Boom 1 partie', 'f': '1.75 m / 5\'09"', 's': '1.00 m / 3\'03"', 'sw': 'Oui', 'v': '12V DC', 'c': '400 kg / 882 lbs', 'w': fmt_w(1680), 'cl': 'Mini'},
        'TB225': {'p': fmt_p(13.2, 17.7), 'b': 'Boom 1 partie', 'f': '2.10 m / 6\'11"', 's': '1.15 m / 3\'09"', 'sw': 'Oui', 'v': '12V DC', 'c': '600 kg / 1323 lbs', 'w': fmt_w(2460), 'cl': 'Mini'},
        'TB230': {'p': fmt_p(14.7, 19.7), 'b': 'Boom 1 partie', 'f': '2.30 m / 7\'07"', 's': '1.25 m / 4\'01"', 'sw': 'Non', 'v': '12V DC', 'c': '750 kg / 1654 lbs', 'w': fmt_w(3000), 'cl': 'Mini'},
        'TB235-2': {'p': fmt_p(17.9, 24.0), 'b': 'Boom 1 partie', 'f': '2.50 m / 8\'02"', 's': '1.35 m / 4\'05"', 'sw': 'Non', 'v': '12V DC', 'c': '900 kg / 1984 lbs', 'w': fmt_w(3560), 'cl': 'Mini'},
        'TB240': {'p': fmt_p(22.4, 30.0), 'b': 'Boom 1 partie', 'f': '2.80 m / 9\'02"', 's': '1.50 m / 4\'11"', 'sw': 'Non', 'v': '12V DC', 'c': '1100 kg / 2425 lbs', 'w': fmt_w(4200), 'cl': 'Mini'},
        'TB260': {'p': fmt_p(30.5, 40.9), 'b': 'Boom 2 parties', 'f': '3.30 m / 10\'10"', 's': '1.75 m / 5\'09"', 'sw': 'Non', 'v': '12V DC', 'c': '1600 kg / 3527 lbs', 'w': fmt_w(5750), 'cl': 'Standard'},
        'TB290': {'p': fmt_p(41.0, 55.0), 'b': 'Boom 2 parties', 'f': '3.80 m / 12\'06"', 's': '2.20 m / 7\'03"', 'sw': 'Non', 'v': '24V DC', 'c': '2600 kg / 5732 lbs', 'w': fmt_w(8800), 'cl': 'Standard'},
        'TB2150': {'p': fmt_p(72.1, 96.7), 'b': 'Boom 2 parties', 'f': '4.70 m / 15\'05"', 's': '2.60 m / 8\'06"', 'sw': 'Non', 'v': '24V DC', 'c': '5000 kg / 11025 lbs', 'w': fmt_w(14800), 'cl': 'Standard'},
    },
}

grand_total = 0
for fab_name, specs_db in ALL_SPECS.items():
    if fab_name not in data.get('Excavatrice', {}):
        print(f"{fab_name}: NOT FOUND in data")
        continue
    count = 0
    for annee in data['Excavatrice'][fab_name]:
        for modele in data['Excavatrice'][fab_name][annee]:
            specs = data['Excavatrice'][fab_name][annee][modele]
            if not any(v == 'A completer' for v in specs.values()):
                continue
            # Skip placeholders
            if 'Mini' in modele and '/' in modele: continue
            if 'Petites' in modele: continue
            if 'Hybrides' in modele: continue
            if 'Next Gen' in modele: continue
            # Exact match
            matched = specs_db.get(modele)
            if matched:
                for short_key, val in matched.items():
                    field = FIELD_MAP[short_key]
                    if specs.get(field) == 'A completer':
                        specs[field] = val
                        count += 1
    print(f"{fab_name}: {count} fields updated")
    grand_total += count

with open(DB_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nTotal: {grand_total} fields updated. Saved to {DB_PATH}")
