"""Apres l'ajout de DRAIN_EXCLUS (js/kit-rules.js) : garder l'etat drain AFFICHE de
chaque excavatrice identique, et retirer les overrides 0009 devenus redondants.

1. Etat voulu = regle SANS exclusions + overrides (= ce que le portail affichait).
2. Si la regle AVEC exclusions + overrides donne autre chose -> override explicite.
3. Un override 0009 ajoute le 2026-11-06 (absent au commit 255d197) et egal au
   nouveau defaut est retire ; un _bom ou une fiche d'override vides sont retires
   s'ils n'existaient pas au 255d197.
Usage : python scripts/drain_defaut_preserver_etat.py [--ecrire]
"""
import json, re, sys, subprocess, pathlib

R = pathlib.Path(__file__).resolve().parent.parent
BD, OVR = R / 'data' / 'machines.json', R / 'data' / 'overrides' / 'excavatrice.json'
REF = '255d197'
# fiches renommees le 2026-11-06 : (annee, nouveau nom) -> ancien nom au 255d197
ANCIEN_NOM = {(str(a), '308 CR'): '308' for a in (2019, 2020, 2021)}
ANCIEN_NOM.update({(str(a), '308E2 CR'): '308' for a in range(2015, 2019)})
ANCIEN_NOM.update({(str(a), '316F L'): '316' for a in range(2021, 2027)})


def regle(src):
    pre = re.findall(r"'([^']+)'", re.search(r"DRAIN_PREFIXES = \[(.*?)\];", src, re.S).group(1))
    exc = re.findall(r"'([^']+)'", re.search(r"DRAIN_EXCLUS = \[(.*?)\];", src, re.S).group(1))
    return pre, [x.upper() for x in exc]


def defaut(mod, pre, exc):
    u = mod.upper().strip()
    if u in exc: return 'na'
    return 'r' if any(u.startswith(p.upper()) for p in pre) else 'na'


def effectif(bom, d):
    if '0009' in bom.get('_removed', []): return 'na'
    st = bom.get('0009', d)
    return 'r' if st == 'j' else st          # coerceExcState : drain jamais jaune


def main(ecrire):
    pre, exc = regle((R / 'js' / 'kit-rules.js').read_text(encoding='utf-8'))
    bd = json.loads(BD.read_text(encoding='utf-8'))['Excavatrice']
    ov_txt = OVR.read_text(encoding='utf-8'); ov = json.loads(ov_txt)
    oe = ov['Excavatrice']
    ref = json.loads(subprocess.check_output(['git', 'show', f'{REF}:data/overrides/excavatrice.json'], cwd=R).decode('utf-8'))['Excavatrice']
    poses, retires, vides = [], [], []
    for fab, ans in bd.items():
        if fab == '_bom_labels': continue
        for an, mods in ans.items():
            for mod in mods:
                ent = oe.get(fab, {}).get(an, {}).get(mod)
                bom = (ent or {}).get('_bom', {})
                voulu = effectif(bom, defaut(mod, pre, []))
                nouveau_def = defaut(mod, pre, exc)
                if effectif(bom, nouveau_def) != voulu:
                    poses.append(f'{fab} {mod} {an} : 0009={voulu}')
                    if ecrire:
                        oe.setdefault(fab, {}).setdefault(an, {}).setdefault(mod, {}).setdefault('_bom', {})['0009'] = voulu
                    continue
                if ent is None or '0009' not in bom: continue
                anc = ANCIEN_NOM.get((an, mod), mod) if fab == 'Caterpillar' else mod
                ref_ent = ref.get(fab, {}).get(an, {}).get(anc)
                ref_bom = (ref_ent or {}).get('_bom')
                if bom['0009'] == nouveau_def and (ref_bom is None or '0009' not in ref_bom):
                    retires.append(f'{fab} {mod} {an}')
                    if ecrire:
                        del bom['0009']
                        if not bom and ref_bom is None:
                            del ent['_bom']
                        if not ent and ref_ent is None:
                            del oe[fab][an][mod]; vides.append(f'{fab} {mod} {an}')
                            if not oe[fab][an]: del oe[fab][an]
    print(f'Overrides poses ({len(poses)}) :'); print('  ' + '\n  '.join(poses))
    print(f'0009 redondants retires ({len(retires)}) :', ', '.join(retires))
    print(f'Fiches d\'override vides retirees : {len(vides)}')
    if ecrire:
        OVR.write_text(json.dumps(ov, ensure_ascii=ov_txt.isascii(), separators=(',', ':')), encoding='utf-8', newline='\n')
        print('Ecrit.')


if __name__ == '__main__':
    main('--ecrire' in sys.argv)
