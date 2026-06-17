# -*- coding: utf-8 -*-
# Convertit les fittings Loader (champs specs Raccords/PN/Boulons) en VRAIES lignes
# BOM custom (_bom._custom) -> affichage identique aux autres pieces (PN, desc, statut).
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
PATH='data/machines.json'
FIT=["Raccords hydrauliques","PN raccord (Epicor)","Boulons"]

d=json.load(open(PATH,encoding='utf-8')); L=d['Loader']
converted=0; total=0
for b in L:
    if b.startswith('_'): continue
    for yr,ms in L[b].items():
        for m,sp in ms.items():
            total+=1
            rac=(sp.get('Raccords hydrauliques') or '').strip()
            pn=(sp.get('PN raccord (Epicor)') or '').strip()
            bo=(sp.get('Boulons') or '').strip()
            # retire les anciens champs specs
            for k in FIT: sp.pop(k,None)
            if not (rac or pn or bo):
                continue  # pas de fitting -> pas de ligne BOM
            custom=[]
            rac_desc='Raccord hydraulique' + ((' ('+rac+')') if (rac and rac!=pn) else '')
            custom.append({'code':'RACCORD','pn':pn,'desc':rac_desc,'status':'v'})
            bo_desc='Boulons' + ((' ('+bo+')') if bo else '')
            custom.append({'code':'BOULONS','pn':'','desc':bo_desc,'status':'na'})
            bom=sp.get('_bom') if isinstance(sp.get('_bom'),dict) else {}
            bom['_custom']=custom
            sp['_bom']=bom
            converted+=1
json.dump(d, open(PATH,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
json.load(open(PATH,encoding='utf-8'))
print(f"Loader entrees: {total} | converties en lignes BOM custom: {converted}")
# echantillon
s=L['Komatsu']['2015']['WA470']
print("Exemple Komatsu/2015/WA470 _bom._custom:", json.dumps(s.get('_bom'),ensure_ascii=False))
print("Champs specs restants:", [k for k in s if not k.startswith('_')])
