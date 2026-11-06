"""Nettoyage Caterpillar 316 / 308 (decision Jacquot 2026-11-06, plan complet).

Preuve : numeros de serie des bons d'installation ProgressionLive (type INS).
  - "316" chenilles : CAT0316E... (2016-2024) et CAT0316F... (2021). Cat ne vend
    pas de 316 chenilles Next Gen en Amerique du Nord ; specs 121 HP = 316F L.
      -> "316" renomme "316F L" (drain conserve).
  - "308" melange l'ancien 308E/E2 CR (CAT0308E..., 2017-2025) et le 308 CR Next
    Gen (CAT00308...GG8..., installe des nov. 2020 ; annonce Cat 2018-11-05).
      -> 2015-2018 : renomme "308E2 CR" (drain conserve)
      -> 2019-2021 : devient "308 CR" (specs du 308 CR, notes du 308)
      -> 2022-2026 : retire (doublon du 308 CR) ; ses notes passent au 308 CR.
Usage : python scripts/nettoyage_cat_316_308.py [--ecrire]
"""
import json, sys, copy, pathlib

R = pathlib.Path(__file__).resolve().parent.parent
BD, OVR = R / 'data' / 'machines.json', R / 'data' / 'overrides' / 'excavatrice.json'
NOTES = ('_notes', '_notes_en', 'Test Robin')


def renommer(d, ancien, nouveau):
    """Renomme une cle en gardant sa position."""
    return {(nouveau if k == ancien else k): v for k, v in d.items()}


def main(ecrire):
    bd_txt, ov_txt = BD.read_text(encoding='utf-8'), OVR.read_text(encoding='utf-8')
    bd, ov = json.loads(bd_txt), json.loads(ov_txt)
    cat = bd['Excavatrice']['Caterpillar']
    oc = ov['Excavatrice']['Caterpillar']
    journal = []
    for an in sorted(cat):
        mods, om = cat[an], oc.get(an, {})
        if '316' in mods:
            assert '316F L' not in mods
            cat[an] = mods = renommer(mods, '316', '316F L')
            if '316' in om: oc[an] = om = renommer(om, '316', '316F L')
            journal.append(f'{an} 316 -> 316F L')
        if '308' not in mods:
            continue
        a = int(an)
        if a <= 2018:
            assert '308E2 CR' not in mods
            cat[an] = renommer(mods, '308', '308E2 CR')
            if '308' in om: oc[an] = renommer(om, '308', '308E2 CR')
            journal.append(f'{an} 308 -> 308E2 CR')
        elif '308 CR' not in mods:
            fiche = copy.deepcopy(cat['2022']['308 CR'])
            for k in NOTES:
                if mods['308'].get(k): fiche[k] = mods['308'][k]
            mods['308'] = fiche
            cat[an] = renommer(mods, '308', '308 CR')
            if '308' in om: oc[an] = renommer(om, '308', '308 CR')
            journal.append(f'{an} 308 -> 308 CR (specs 308 CR, notes 308)')
        else:
            cr = mods['308 CR']
            for k in NOTES:
                if mods['308'].get(k) and not cr.get(k): cr[k] = mods['308'][k]
            del mods['308']
            om.pop('308', None)
            journal.append(f'{an} 308 retire (notes recopiees sur 308 CR)')
    print('\n'.join(journal))
    if ecrire:
        BD.write_text(json.dumps(bd, ensure_ascii=bd_txt.isascii(), separators=(',', ':')), encoding='utf-8', newline='\n')
        OVR.write_text(json.dumps(ov, ensure_ascii=ov_txt.isascii(), separators=(',', ':')), encoding='utf-8', newline='\n')
        print('Ecrit.')


if __name__ == '__main__':
    main('--ecrire' in sys.argv)
