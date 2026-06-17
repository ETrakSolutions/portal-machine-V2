# -*- coding: utf-8 -*-
# Corrections audit (machines.json): fusion doublons modeles, nettoyage bruit raccords Loader, annees N/D.
import json, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
PATH='data/machines.json'
d=json.load(open(PATH,encoding='utf-8'))

def filled(sp):
    return sum(1 for k,v in sp.items() if not k.startswith('_') and str(v).strip() not in ('','N/D','A completer','0'))

# ---- A. Fusion doublons (nonCanonical -> canonical), union des annees, prefere canonical ----
CANON={
 ('Excavatrice','John Deere'):{'130P-TIER':'130 P-Tier'},
 ('Excavatrice','Link-Belt'):{'145X4':'145 X4','350X4':'350 X4'},
 ('Excavatrice','Takeuchi'):{'TB210 R':'TB210R','TB257 FR':'TB257FR'},
 ('Telehandler','Manitou'):{'MT1440':'MT 1440'},
}
print("=== A. FUSION DOUBLONS ===")
for (t,b),mp in CANON.items():
    for nonc,canon in mp.items():
        moved=0; kept=0
        for yr,ms in d[t][b].items():
            if nonc in ms:
                if canon in ms:
                    # garder canonical ; supprimer nonc
                    del ms[nonc]; kept+=1
                else:
                    ms[canon]=ms.pop(nonc); moved+=1
        print(f"  {t}/{b}: '{nonc}' -> '{canon}' (annees deplacees={moved}, annees doublon supprimees={kept})")

# ---- B. Nettoyage bruit raccords Loader ----
NOISE=re.compile(r'(switch|support|machin|voir |credit|demont|hoses|rembours|kit used|3000psi|pression)', re.I)
print("\n=== B. NETTOYAGE BRUIT RACCORDS LOADER ===")
cleaned=0
for b,years in d['Loader'].items():
    if b.startswith('_'): continue
    for yr,ms in years.items():
        for m,sp in ms.items():
            bom=sp.get('_bom')
            if not isinstance(bom,dict): continue
            for c in bom.get('_custom',[]) or []:
                if c.get('code')!='RACCORD': continue
                desc=str(c.get('desc',''))
                mt=re.search(r'\(([^)]*)\)', desc)
                inner=mt.group(1) if mt else ''
                if inner and NOISE.search(inner):
                    # deplacer le texte vers la note tech
                    note=(sp.get('_note_tech_texte') or '').strip()
                    sp['_note_tech_texte']=(note+' | ' if note else '')+'Fitting (a clarifier): '+inner
                    pn=str(c.get('pn',''))
                    if pn.strip():
                        c['desc']='Raccord hydraulique'   # garde le PN reel
                    else:
                        c['desc']='Raccord hydraulique'; c['status']='na'
                    cleaned+=1
                    print(f"  {b}/{yr}/{m}: bruit deplace en note (pn conserve='{pn}')")
print(f"  total raccords nettoyes: {cleaned}")

# ---- D. Annees N/D Loader -> 2015 + note 'annee a confirmer' ----
print("\n=== D. ANNEES 'N/D' LOADER -> 2015 ===")
moved_nd=0
for b in list(d['Loader'].keys()):
    if b.startswith('_'): continue
    years=d['Loader'][b]
    if 'N/D' not in years: continue
    ndmodels=years.pop('N/D')
    dest=years.setdefault('2015',{})
    for m,sp in ndmodels.items():
        note=(sp.get('_note_tech_texte') or '').strip()
        sp['_note_tech_texte']=(note+' | ' if note else '')+'Annee a confirmer (import liste fittings)'
        if m in dest:
            print(f"  COLLISION {b}/2015/{m} : conserve l'existant"); continue
        dest[m]=sp; moved_nd+=1
        print(f"  {b}/N∕D/{m} -> 2015")
print(f"  total deplaces: {moved_nd}")

json.dump(d, open(PATH,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
json.load(open(PATH,encoding='utf-8'))
print("\nmachines.json OK")
