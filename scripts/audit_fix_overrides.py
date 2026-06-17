# -*- coding: utf-8 -*-
# Corrections audit (overrides): renommer cles doublons + purger orphelins (machines absentes de la BD).
import json, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

m=json.load(open('data/machines.json',encoding='utf-8'))
SLUG={'Excavatrice':'excavatrice','Telehandler':'telehandler','Pompe a Beton':'pompe-a-beton',
 'Grue Mobile':'grue-mobile','Camion Girafe (Boom Truck)':'camion-girafe','Foreuse':'foreuse',
 'Camion Vacuum':'camion-vacuum','Retrocaveuse':'retrocaveuse','Loader':'loader'}
CANON={
 ('Excavatrice','John Deere'):{'130P-TIER':'130 P-Tier'},
 ('Excavatrice','Link-Belt'):{'145X4':'145 X4','350X4':'350 X4'},
 ('Excavatrice','Takeuchi'):{'TB210 R':'TB210R','TB257 FR':'TB257FR'},
 ('Telehandler','Manitou'):{'MT1440':'MT 1440'},
}

def load(slug):
    p=f'data/overrides/{slug}.json'
    return p, json.load(open(p,encoding='utf-8'))

# ---- A. renommer les cles doublons dans les overrides ----
print("=== A. RENOMMAGE OVERRIDES DOUBLONS ===")
for (t,b),mp in CANON.items():
    p,ov=load(SLUG[t]); root=ov.get(t)
    if not isinstance(root,dict) or b not in root:
        print(f"  {t}/{b}: aucun override"); continue
    fabnode=root[b]; ren=0
    for yr,ms in fabnode.items():
        if not isinstance(ms,dict): continue
        for nonc,canon in mp.items():
            if nonc in ms:
                if canon in ms: del ms[nonc]      # garde canonical
                else: ms[canon]=ms.pop(nonc); ren+=1
    json.dump(ov, open(p,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
    print(f"  {t}/{b}: cles renommees={ren}")

# ---- C. purge orphelins (toutes les overrides) ----
print("\n=== C. PURGE ORPHELINS ===")
for t,slug in SLUG.items():
    p=f'data/overrides/{slug}.json'
    if not os.path.exists(p): continue
    ov=json.load(open(p,encoding='utf-8')); root=ov.get(t)
    if not isinstance(root,dict): continue
    removed=[]
    for b in list(root.keys()):
        years=root[b]
        if not isinstance(years,dict): continue
        for yr in list(years.keys()):
            ms=years[yr]
            if not isinstance(ms,dict): continue
            for model in list(ms.keys()):
                try: exists = model in m[t][b][yr]
                except: exists=False
                if not exists:
                    removed.append(f"{b}/{yr}/{model}"); del ms[model]
            if not ms: del years[yr]
        if not years: del root[b]
    if removed:
        json.dump(ov, open(p,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
        print(f"  [{t}] {len(removed)} orphelins supprimes:")
        for r in removed: print(f"      - {r}")
    else:
        print(f"  [{t}] 0 orphelin")
print("\nOverrides OK")
