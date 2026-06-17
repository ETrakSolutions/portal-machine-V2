# -*- coding: utf-8 -*-
# Ajoute le champ "PN raccord (Epicor)" au Loader, derive des GagePort e-Trak
# (catalogue _PartBin VS PrimBin). Mappe AS/ASX (code 61/62), JIC, ORF/ORFS, TN121.
import openpyxl, re, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CAT = r'C:\Users\ryb086\AppData\Local\Temp\partbin.xlsx'
PATH = 'data/machines.json'
ORDER = ["Capacite de levage","Puissance moteur","Poids operationnel",
         "Raccords hydrauliques","PN raccord (Epicor)","Boulons"]

wb=openpyxl.load_workbook(CAT,data_only=True,read_only=True)
ws=wb['PartBinVSPrimBinWCost']; rows=list(ws.iter_rows(values_only=True))
hdr=[('' if c is None else str(c)) for c in rows[0]]; ix={h:i for i,h in enumerate(hdr)}
nums=set(str(r[ix['Part_PartNum']] or '').strip() for r in rows[1:] if r[ix['Part_PartNum']])
def has(pn): return pn in nums

def seg_pn(seg):
    s=seg.strip(); low=s.lower()
    court='court' in low
    msz=re.search(r'#\s*(\d+)', s) or re.search(r'-\s*(\d+)', s) or re.search(r'\b(\d{1,2})\b', s)
    n=msz.group(1) if msz else None
    fam=None
    if re.search(r'\basx\s*[-#]?\s*\d', low) or 'code 62' in low: fam='ASX'
    elif re.search(r'\bas\s*[-#]\s*\d', low) or 'code 61' in low: fam='AS'
    elif 'jic' in low: fam='JIC'
    elif 'orf' in low or 'oring face' in low or "o'ring face" in low or 'o-ring face' in low: fam='ORF'
    elif 'tn121' in low: fam='TN121'
    if not fam: return None
    if fam=='TN121':
        mt=re.search(r'(TN121-\d+[A-Z])', s, re.I)
        return mt.group(1) if (mt and has(mt.group(1))) else None
    if not n: return None
    z=n.zfill(2)
    if fam=='AS':  pn=f'AS-{n}-GP';  return pn if has(pn) else None
    if fam=='ASX': pn=f'ASX-{n}-GP'; return pn if has(pn) else None
    if fam=='JIC': pn=f'GP-6504-{z}{z}-4'; return pn if has(pn) else None
    if fam=='ORF':
        if court and n=='12' and has('C02A-0021'): return 'C02A-0021'
        if court and n=='16' and has('C02A-0022'): return 'C02A-0022'
        pn=f'GPFS2406-{z}{z}-4'; return pn if has(pn) else None
    return None

def pns_of(val):
    pns=[]
    for p in re.split(r'[/;]', val):
        pn=seg_pn(p)
        if pn and pn not in pns: pns.append(pn)
    return ' / '.join(pns)

def reorder(specs):
    out={}
    for k in ORDER: out[k]=specs.get(k,'')
    for k in specs:
        if k not in out: out[k]=specs[k]
    return out

d=json.load(open(PATH,encoding='utf-8')); L=d['Loader']
filled=0; total=0
for b in L:
    if b.startswith('_'): continue
    for yr,ms in L[b].items():
        for m,sp in ms.items():
            total+=1
            v=(sp.get('Raccords hydrauliques') or '').strip()
            pn=pns_of(v) if v else ''
            sp['PN raccord (Epicor)']=pn
            if 'Boulons' not in sp: sp['Boulons']=''
            ms[m]=reorder(sp)
            if pn: filled+=1
json.dump(d, open(PATH,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
json.load(open(PATH,encoding='utf-8'))
print(f"Loader entrees: {total} | PN raccord rempli: {filled}")
# echantillon
for b,m in [('Komatsu','WA470'),('Caterpillar','950E'),('Volvo','L60'),('John Deere','644E')]:
    for yr,ms in L.get(b,{}).items():
        if m in ms:
            s=ms[m]; print(f"  {b} {yr} {m}: raccord={s['Raccords hydrauliques']!r} -> PN={s['PN raccord (Epicor)']!r}"); break
