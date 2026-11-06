"""Caterpillar Next Gen : drain hydraulique (1500-0009) retire du kit.

Decision terrain 2026-11-06 (Kevin + installateur Ontario) : les excavatrices
Caterpillar Next Gen n'ont pas besoin de drain. Decision Jacquot : annees >= 2018
seulement (une machine 2017 inscrite sous le meme nom est probablement une serie F).

N'ecrit que si l'etat EFFECTIF (regle DRAIN_PREFIXES + override) est encore 'r'.
Usage : python scripts/cat_next_gen_sans_drain.py [--ecrire]
"""
import json, re, sys, pathlib

RACINE = pathlib.Path(__file__).resolve().parent.parent
OVR = RACINE / 'data' / 'overrides' / 'excavatrice.json'
BD = RACINE / 'data' / 'machines.json'

# Modele -> premiere annee Next Gen. Frontiere lue dans les specs de la BD :
# 320 passe de 138 a 162 HP en 2018 ; 336 de 263 a 311 HP en 2019 ; les GC
# n'existent qu'en Next Gen ; 315/315 GC lances en 2020 (l'ancien = 315FL).
NEXT_GEN = {
    '320': 2018, '320 GC': 2018, '336': 2019, '336 GC': 2018,
    '315': 2020, '315 GC': 2020,
    # Minis : Cat annonce le 308 CR "Next Generation" le 2018-11-05. 2018 garde le
    # drain (annee de transition non confirmee). La fiche "308" sans suffixe
    # regroupe l'ancien 308E2 CR et le 308 CR Next Gen : meme frontiere.
    '308 CR': 2019, '308': 2019,
}

def main(ecrire):
    src = (RACINE / 'js' / 'kit-rules.js').read_text(encoding='utf-8')
    pre = re.findall(r"'([^']+)'", re.search(r"DRAIN_PREFIXES = \[(.*?)\];", src, re.S).group(1))
    bd = json.loads(BD.read_text(encoding='utf-8'))['Excavatrice']['Caterpillar']
    brut = OVR.read_text(encoding='utf-8')
    ovr = json.loads(brut)
    cat = ovr['Excavatrice'].setdefault('Caterpillar', {})
    changes, deja = [], []
    for annee in sorted(bd):
        for mod in bd[annee]:
            if mod not in NEXT_GEN or int(annee) < NEXT_GEN[mod]:
                continue
            defaut = 'r' if any(mod.upper().startswith(p.upper()) for p in pre) else 'na'
            bom = cat.get(annee, {}).get(mod, {}).get('_bom', {})
            eff = 'na' if '0009' in bom.get('_removed', []) else bom.get('0009', defaut)
            if eff != 'r':
                deja.append(f'{mod} {annee}'); continue
            changes.append(f'{mod} {annee}')
            if ecrire:
                cat.setdefault(annee, {}).setdefault(mod, {}).setdefault('_bom', {})['0009'] = 'na'
    print(f'A changer ({len(changes)}) :', ', '.join(changes))
    print(f'Deja sans drain ({len(deja)}) :', ', '.join(deja))
    if ecrire:
        ascii_ = brut.isascii()
        OVR.write_text(json.dumps(ovr, ensure_ascii=ascii_, separators=(',', ':')), encoding='utf-8', newline='\n')
        print('Ecrit :', OVR)

if __name__ == '__main__':
    main('--ecrire' in sys.argv)
