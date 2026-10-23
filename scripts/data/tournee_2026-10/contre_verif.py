# Contre-verification independante des sorties d'agents : (1) le modele est-il vraiment absent
# de machines.json (correspondance tolerante) ; (2) la page citee contient-elle le nom du modele.
import json,glob,re,os,sys,hashlib,html,urllib.request,ssl,concurrent.futures as cf
AUD,PAGES,DB=sys.argv[1],sys.argv[2],sys.argv[3]
TYPES={'excav_a':'Excavatrice','excav_b':'Excavatrice','loader':'Loader','tracteur_a':'Tracteur','tracteur_b':'Tracteur'}
NOTE2T=[('Camion Girafe','Camion Girafe (Boom Truck)'),('Grue','Grue Mobile'),('Telehandler','Telehandler'),('Nacelle','Nacelle'),
        ('Pompe','Pompe a Beton'),('Foreuse','Foreuse'),('Vacuum','Camion Vacuum'),('Retro','Retrocaveuse'),('Rétro','Retrocaveuse')]
norm=lambda s:re.sub(r'[^a-z0-9]','',str(s).lower())
db=json.load(open(DB,encoding='utf-8'))
def typ(oid,x):
    if oid in TYPES: return TYPES[oid]
    t=(x.get('note') or '')+' '+(x.get('type') or '')
    for k,v in NOTE2T:
        if k.lower() in t.lower(): return v
    return None
rows=[]
for f in sorted(glob.glob(os.path.join(AUD,'out_*.json'))):
    oid=os.path.basename(f)[4:-5]
    for x in json.load(open(f,encoding='utf-8')).get('manquants',[]):
        rows.append(dict(x,lot=oid,type=typ(oid,x)))
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
UA={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36','Accept-Language':'en-US,en;q=0.9'}
def get(u):
    p=os.path.join(PAGES,hashlib.md5(u.encode()).hexdigest()+'.txt')
    if os.path.exists(p): return u,open(p,encoding='utf-8').read()
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40,context=ctx)
        b=r.read(8_000_000).decode('utf-8','replace'); t=html.unescape(b)
    except Exception as e: t='__ECHEC__ '+str(e)[:120]
    open(p,'w',encoding='utf-8').write(t); return u,t
urls=sorted({r['url'] for r in rows if r.get('url')})
with cf.ThreadPoolExecutor(16) as ex: pages=dict(ex.map(get,urls))
for r in rows:
    # (1) absence reelle en BD
    fabs=db.get(r['type'] or '',{}); fab=fabs.get(r.get('fabricant'),{})
    nm=norm(r.get('modele')); trouve=[]
    for a,ms in fab.items():
        if a.startswith('_'): continue
        for m in ms:
            if norm(m)==nm: trouve.append(int(a))
    r['bd_annees']=sorted(set(trouve))
    r['fab_en_bd']=r.get('fabricant') in fabs
    # (2) page
    t=pages.get(r.get('url'),'__ECHEC__ pas d url')
    if t.startswith('__ECHEC__'): r['page']='ECHEC_HTTP'
    else:
        nt=norm(t)
        if nm and nm in nt: r['page']='NOM_TROUVE'
        else:
            toks=[norm(k) for k in re.split(r'[\s/|]+',str(r.get('modele'))) if len(norm(k))>=2]
            r['page']='PARTIEL' if toks and all(k in nt for k in toks) else ('PAGE_JS_OU_VIDE' if len(nt)<3000 else 'NOM_ABSENT')
json.dump(rows,open(os.path.join(AUD,'consolide.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
import collections
print('types non resolus:',sum(1 for r in rows if not r['type']))
print('deja en BD (meme nom):',[(r['type'],r['fabricant'],r['modele'],r['bd_annees'],r['statut']) for r in rows if r['bd_annees'] and r['statut']=='absent'][:30])
print('fabricant inconnu de la BD:',collections.Counter((r['type'],r['fabricant']) for r in rows if not r['fab_en_bd']))
c=collections.Counter((r['lot'],r['page']) for r in rows)
for k in sorted(c): print(k,c[k])
