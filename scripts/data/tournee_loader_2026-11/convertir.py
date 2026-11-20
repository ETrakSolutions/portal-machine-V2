# Conversion des specs relevees -> champs Loader du portail. Regles :
# Capacite de levage = capacite nominale ISO 14397 = 50 % charge de basculement GODET machine PIVOTEE (full turn),
#   borne basse ; ROC ISO articulee publie = pris tel quel. Fourches, droit, "rated load" ambigu -> A completer.
# Poids operationnel = poids en service/operating weight, borne basse ; a vide / brut / fourches -> A completer.
# Puissance = moteur de base (1re valeur), hp ; kW seul -> x1.34102 ; PS seul -> x0.98632.
import json,sys,re
S=sys.argv[1]
def nums(s):
    return [float(x.replace(',','')) for x in re.findall(r'\d[\d,]*\.?\d*',s)]
def lb_low(v):
    v=re.sub(r'\b(\d{1,3})\.(\d{3})\b(?=\s*kg)',r'\1\2',str(v))
    m=re.search(r'([\d][\d,\.\s]*?)\s*(?:-\s*[\d,\.]+\s*)?(lbs?|kg)\b',v,re.I)
    # prefere une valeur en lb
    mlb=re.search(r'(\d[\d,]*(?:\.\d+)?)\s*(?:-\s*\d[\d,]*(?:\.\d+)?\s*)?lbs?\b',v,re.I)
    if mlb: return float(mlb.group(1).replace(',',''))
    mkg=re.search(r'(\d[\d,]*(?:\.\d+)?)\s*(?:-\s*\d[\d,]*(?:\.\d+)?\s*)?kg\b',v,re.I)
    if mkg: return float(mkg.group(1).replace(',',''))*2.20462
    mt=re.search(r'(\d+(?:[\.,]\d+)?)\s*(?:-\s*\d+(?:[\.,]\d+)?\s*)?t\b',v)
    if mt: return float(mt.group(1).replace(',','.'))*2204.62
    return None
def _dec(x):
    return float(x.replace(',','.'))
def hp(v):
    v=str(v)
    if re.search(r'electri|driving mechanism',v,re.I): return None
    m=re.search(r'(\d+(?:[\.,]\d+)?)\s*(?:hp|ch|cv)',v,re.I)
    if m: return _dec(m.group(1))
    m=re.search(r'(\d+(?:[\.,]\d+)?)\s*kW',v)
    if m: return _dec(m.group(1))*1.34102
    m=re.search(r'(\d+(?:[\.,]\d+)?)\s*PS',v)
    if m: return _dec(m.group(1))*0.98632
    return None
fmt=lambda x:'{:,}'.format(int(round(x))).replace(',',' ')
def classe(k):
    kl=k.lower()
    if 'fourche' in kl or 'fork' in kl: return None
    if re.search(r'roc|operating capacity|capacite_nominale_articulee',kl): return 'roc'
    if re.search(r'(pivot|articul|full.?turn|full_turn)',kl) and re.search(r'(tip|bascul)',kl): return 'tip_piv'
    return None
def poids_ok(k):
    kl=k.lower()
    if re.search(r'vide|unladen|brut|fourche|fork|empty',kl): return False
    return bool(re.search(r'operating weight|poids_operationnel|poids_service',kl))
def conv(sp):
    cap=None;src_cap=None;pds=None;src_p=None;pw=None;src_h=None
    for k,v in sp.items():
        c=classe(k)
        if c and cap is None:
            x=lb_low(v)
            if x: cap=x/2 if c=='tip_piv' else x; src_cap=f'{k}: {v}'
    for k,v in sp.items():
        if poids_ok(k) and pds is None:
            x=lb_low(v)
            if x: pds=x; src_p=f'{k}: {v}'
    for k,v in sp.items():
        if re.search(r'puissance|horsepower|engine|output',k.lower()) and 'brute' not in k.lower() and pw is None:
            x=hp(v)
            if x: pw=x; src_h=f'{k}: {v}'
    return ({'Capacite de levage':fmt(cap)+' lb' if cap else 'A completer','Gage port':'A completer',
             'Puissance moteur':fmt(pw)+' hp' if pw else 'A completer','Poids operationnel':fmt(pds)+' lb' if pds else 'A completer'},
            src_cap,src_p,src_h)
out=json.load(open(S+'/consolide_dedoublonne.json',encoding='utf-8'))
res=[]
for r in out:
    if r['niv']=='C Non prouvé': continue
    sp,a,b,c=conv(r.get('specs_vues') or {})
    r['specs_portail']=sp; r['src']=[a,b,c]; res.append(r)
json.dump(res,open(S+'/a_importer.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
with open(S+'/_conv.txt','w',encoding='utf-8') as o:
    for r in res:
        o.write('%s|%s|%s|%s|%s\n   cap<-%s\n   pds<-%s\n   hp<-%s\n   VUES %s\n'%(r['fab'],r['modele'],r['specs_portail']['Capacite de levage'],r['specs_portail']['Poids operationnel'],r['specs_portail']['Puissance moteur'],r['src'][0],r['src'][1],r['src'][2],json.dumps(r.get('specs_vues'),ensure_ascii=False)))
print(len(res))
