# -*- coding: utf-8 -*-
# Importe "liste fitting sur loader.xls" dans le type Loader de machines.json.
# Ajoute 2 champs (Loader uniquement): "Raccords hydrauliques" (rempli) + "Boulons" (vide, manuel futur).
# Remplit les modeles existants (match exact) et ajoute une ligne pour chaque machine absente.
import openpyxl, re, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

XLSX = r'C:\Users\ryb086\AppData\Local\Temp\loader_fitting.xlsx'
PATH = 'data/machines.json'
ORDER = ["Capacite de levage","Puissance moteur","Poids operationnel",
         "Raccords hydrauliques","Boulons"]

BRAND_MAP = {
 'case':'Case','caterpillar':'Caterpillar','deawoo':'Daewoo','daewoo':'Daewoo','doosan':'Develon (Doosan)',
 'dresser':'Dresser','hyundai':'Hyundai','jcb':'JCB','john deere':'John Deere','john deer':'John Deere',
 'johm deere':'John Deere','john-derr':'John Deere','kawasaki':'Kawasaki','komatsu':'Komatsu',
 'kubota':'Kubota','new holland':'New Holland','scoope':'Scoop','scoop':'Scoop','terex':'Terex','volvo':'Volvo',
}
def s(x): return '' if x is None else str(x).strip()
def norm_brand(a):
    al=a.lower()
    for k,v in BRAND_MAP.items():
        if al.startswith(k): return v
    return a.split()[0].capitalize() if a else ''
def key(x): return re.sub(r'[^a-z0-9]','',x.lower())
def clean_fit(v):
    v=s(v)
    return '' if v in ('','0') else v
def parse_year(c):
    m=re.search(r'\b(19|20)\d{2}\b', s(c))
    return m.group(0) if m else 'N/D'

# ---- lecture Excel ----
wb=openpyxl.load_workbook(XLSX,data_only=True)
ws=wb['Feuil1']
rows=[r for r in ws.iter_rows(values_only=True) if any(c not in (None,'') for c in r)][1:]
from collections import defaultdict, OrderedDict
agg=OrderedDict()  # (brand, modelkey) -> {brand,model,years:set,fits:set,notes:set}
for r in rows:
    colA=s(r[0]); model=s(r[1]); year=s(r[2]); note=s(r[3]); fit=clean_fit(r[4] if len(r)>4 else '')
    brand=norm_brand(colA)
    if not model or model=='0':
        # modele dans col A : "Dresser 520B", "Terex TLX 400"
        parts=colA.split()
        if len(parts)>=2: model=' '.join(parts[1:])
        else: continue
    mk=key(model)
    if not mk: continue
    g=agg.setdefault((brand,mk),{'brand':brand,'model':model,'years':set(),'fits':[],'notes':[]})
    y=parse_year(year)
    if y!='N/D': g['years'].add(y)
    f=fit or clean_fit(note)
    if f and f not in g['fits']: g['fits'].append(f)
    nn=clean_fit(note)
    if nn and nn not in g['notes'] and nn!=f: g['notes'].append(nn)

def fitting_of(g):
    return ' ; '.join(g['fits']) if g['fits'] else ''

# ---- BD ----
d=json.load(open(PATH,encoding='utf-8'))
L=d['Loader']
# index brand -> {normkey: realmodel}
idx={}
for b in L:
    if b.startswith('_'): continue
    idx[b]={}
    for yr,ms in L[b].items():
        for m in ms: idx[b].setdefault(key(m),m)

def reorder(specs):
    out=OrderedDict()
    for k in ORDER:
        out[k]=specs.get(k, '')
    for k in specs:
        if k not in out: out[k]=specs[k]
    return dict(out)

# 1) Ajouter les 2 champs a TOUTES les entrees loader existantes (vides) + reorder
for b in L:
    if b.startswith('_'): continue
    for yr,ms in L[b].items():
        for m,specs in ms.items():
            specs.setdefault("Raccords hydrauliques","")
            specs.setdefault("Boulons","")
            ms[m]=reorder(specs)

filled=0; added=0; new_brands=set(); added_list=[]
for (brand,mk),g in agg.items():
    fit=fitting_of(g)
    real = idx.get(brand,{}).get(mk)
    if real:
        # remplir sur toutes les annees du modele existant
        for yr,ms in L[brand].items():
            if real in ms and fit:
                ms[real]["Raccords hydrauliques"]=fit
        filled+=1
    else:
        # nouvelle ligne
        if brand not in L:
            L[brand]={}; new_brands.add(brand)
        years=sorted(g['years']) if g['years'] else ['N/D']
        specs={
            "Capacite de levage":"","Puissance moteur":"","Poids operationnel":"",
            "Raccords hydrauliques":fit,"Boulons":"",
            "_note_tech_texte":' ; '.join(g['notes']),
            "_note_tech_auteur":"","_note_tech_date":"","_actif":"Oui",
        }
        for y in years:
            L[brand].setdefault(y,{})
            L[brand][y][g['model']]=reorder(dict(specs))
        added+=1
        added_list.append(f"{brand} | {g['model']} | {','.join(years)} | {fit}")

json.dump(d, open(PATH,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
json.load(open(PATH,encoding='utf-8'))

print(f"Machines Excel uniques: {len(agg)}")
print(f"  modeles existants remplis: {filled}")
print(f"  nouvelles lignes ajoutees: {added}")
print(f"  nouvelles marques creees: {sorted(new_brands)}")
print("\n--- nouvelles lignes ---")
for x in added_list: print("  ", x)
EOF_GUARD = None
