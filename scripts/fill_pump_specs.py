#!/usr/bin/env python3
"""Fill missing pump specs with defaults + specific data"""
import json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB = os.path.join(os.path.dirname(__file__), '..', 'data', 'machines.json')
with open(DB, 'r', encoding='utf-8') as f:
    data = json.load(f)

pompes = data['Pompe a Beton']

BOOM = {
    'Voltage machine (V/type)': '24V DC',
    'Type de rotation': '360 continu',
    'Console operateur': 'Telecommande radio + filaire',
    'E-stop': 'Arret urgence filaire + radio',
}
STAT = {
    'Voltage machine (V/type)': '24V DC',
    'Type de rotation': 'N/A',
    'Console operateur': 'Telecommande filaire',
    'E-stop': 'Arret urgence filaire',
    'Nombre de sections': 'N/A',
    'Longueur de chaque section': 'N/A',
}

# Specific boom section data
SPEC = {
    'Putzmeister': {
        'M24-4': ('4','24m'), 'M28-4': ('4','28m'), 'M32-5': ('5','32m'),
        'M36-5': ('5','36m'), 'M38-5': ('5','38m'), 'M42-5': ('5','42m'),
        'M43-5': ('5','43m'), 'M47-5': ('5','47m'), 'M52-5': ('5','52m'),
        'M56-5': ('5','56m'), 'M58-5': ('5','58m'), 'M63-5': ('5','63m'),
        'MX24-4': ('4','24m'), 'MX28-4': ('4','28m'), 'MX32-5': ('5','32m'),
        'MX34Z': ('4','34m'), 'MX36-5': ('5','36m'), 'MX42-5': ('5','42m'),
        'MX43-5': ('5','43m'), 'MX47-5': ('5','47m'), 'MX52-5': ('5','52m'),
        'MX56-5': ('5','56m'), 'MX58-5': ('5','58m'),
        'Telebelt TB110': ('4','33m'), 'Telebelt TB130': ('4','40m'), 'Telebelt TB160': ('4','49m'),
        'Thom-Katt TK40': ('3','12m'), 'Thom-Katt TK50': ('3','15m'),
        'Thom-Katt TK60': ('3','18m'), 'Thom-Katt TK70': ('3','21m'),
    },
    'Schwing': {
        'S 20': ('4','20m'), 'S 24 X': ('4','24m'), 'S 28 X': ('4','28m'),
        'S 31 XT': ('4','31m'), 'S 32 X': ('4','32m'), 'S 36 SX': ('4','36m'),
        'S 36 X': ('4','36m'), 'S 38 SX': ('4','38m'), 'S 39 SX': ('4','39m'),
        'S 42 SX': ('5','42m'), 'S 43 SX': ('5','43m'), 'S 46 SX': ('5','46m'),
        'S 47 SX': ('5','47m'), 'S 48 SX': ('5','48m'), 'S 52 SX': ('5','52m'),
        'S 58 SX': ('5','58m'), 'S 61 SX': ('6','61m'), 'S 65 SX': ('6','65m'),
        'KVM 32 X': ('4','32m'), 'KVM 34 X': ('4','34m'),
        'SPB 12': ('3','12m'), 'SPB 22': ('3','22m'), 'SPB 36': ('4','36m'),
    },
    'Liebherr': {
        '31 XXT': ('5','31m'), '36 XXT': ('5','36m'), '37 XXT': ('4','37m'),
        '39 XXT': ('4','39m'), '41 XXT': ('5','41m'), '42 XXT': ('5','42m'),
        '43 XXT': ('5','43m'), '47 XXT': ('5','47m'), '50 XXT': ('5','50m'),
        '53 XXT': ('5','53m'), '56 XXT': ('5','56m'), 'LTB 24+4': ('4','24m'),
    },
    'SANY': {
        'SY5190THB 28-4': ('4','28m'), 'SY5230THB 33-4': ('4','33m'),
        'SY5260THB 37-4': ('4','37m'), 'SY5280THB 38-4': ('4','38m'),
        'SY5310THB 40-4': ('4','40m'), 'SY5330THB 43': ('5','43m'),
        'SY5360THB 47': ('5','47m'), 'SY5380THB 49-6': ('6','49m'),
        'SY5419THB 52-6': ('6','52m'), 'SY5440THB 56-6': ('6','56m'),
        'SY5502THB 62-6': ('6','62m'),
        'SYG5360THB 43': ('5','43m'), 'SYG5401THB 49': ('6','49m'),
        'SYG5419THB 52': ('6','52m'), 'SYG5502THB 62': ('6','62m'),
    },
    'Zoomlion': {
        '38X-5RZ': ('5','38m'), '47X-6RZ': ('6','47m'), '49X-6RZ': ('6','49m'),
        '52X-6RZ': ('6','52m'), '56X-6RZ': ('6','56m'), '58X-6RZ': ('6','58m'),
        '63X-7RZ': ('7','63m'),
    },
    'XCMG': {
        'HB30K': ('4','30m'), 'HB37V': ('4','37m'), 'HB39K': ('4','39m'),
        'HB43K': ('5','43m'), 'HB46K': ('5','46m'), 'HB48K': ('5','48m'),
        'HB52K': ('5','52m'), 'HB56K': ('5','56m'), 'HB58K': ('5','58m'),
        'HB62K': ('6','62m'), 'HB62V': ('6','62m'),
    },
    'Alliance': {
        'LP28': ('4','28m'), 'LP32': ('4','32m'), 'LP33': ('4','33m'),
        'LP36': ('4','36m'), 'LP38': ('5','38m'), 'LP42': ('5','42m'),
        'LP47': ('5','47m'), 'LP52': ('5','52m'), 'LP56': ('5','56m'),
        'LP58': ('5','58m'), 'LP63': ('5','63m'),
    },
    'Concord': {
        'CCP28': ('4','28m'), 'CCP32': ('4','32m'), 'CCP37': ('4','37m'),
        'CCP42': ('5','42m'), 'CCP47': ('5','47m'), 'CCP52': ('5','52m'),
    },
    'Reed': {
        'C50HP': ('4','15m'), 'C65D': ('4','20m'),
        'B17X': ('3','17m'), 'B20X': ('3','20m'), 'B24X': ('4','24m'),
        'B28X': ('4','28m'), 'B32X': ('4','32m'), 'B33X': ('4','33m'),
        'B36X': ('4','36m'), 'B38X': ('5','38m'), 'B42X': ('5','42m'),
        'B47X': ('5','47m'), 'B52X': ('5','52m'),
    },
}

total = 0
for fab in pompes:
    fab_spec = SPEC.get(fab, {})
    for annee in pompes[fab]:
        for modele in pompes[fab][annee]:
            specs = pompes[fab][annee][modele]
            typ = specs.get('Type', '')

            is_stat = ('Stationnaire' in typ or 'BSA' in modele or 'SP ' in modele
                       or 'HBT' in modele or 'THS' in modele)

            defaults = STAT if is_stat else BOOM
            for field, val in defaults.items():
                if specs.get(field) == 'A completer':
                    specs[field] = val
                    total += 1

            if modele in fab_spec:
                sec, reach = fab_spec[modele]
                if specs.get('Nombre de sections') == 'A completer' or specs.get('Nombre de sections') == 'N/A':
                    specs['Nombre de sections'] = sec
                    total += 1
                if specs.get('Longueur de chaque section') == 'A completer' or specs.get('Longueur de chaque section') == 'N/A':
                    specs['Longueur de chaque section'] = f'Portee {reach}'
                    total += 1

with open(DB, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'Total fields updated: {total}')
