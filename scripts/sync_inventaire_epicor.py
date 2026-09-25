"""Synchronise la quantite en main (Epicor) des pieces du portail vers le backend.

Lit, en LECTURE SEULE, dbo.PartWhse sur la replique SQL d'Epicor (societe ETRAK,
entrepot ETRAK) pour les numeros de piece utilises par le portail, puis envoie la
photo au backend Apps Script sous la cle protegee `inventory_etrak` (ecriture par
le PIN seulement, jamais lisible par le GET public). La page Soumission l'affiche
aux roles qui ont la permission « Inventaire » (action 'getinventory').

Liste des pieces : relue a chaque execution sur le site en ligne (data/price-codes.json,
_bom_labels de data/machines.json, lignes _custom des data/overrides/<type>.json,
PN ecrits en dur dans js/kit-rules.js et js/soumission.js, dont les harnais).
Aucune liste a tenir a jour ici.

Usage :
    py -3.12 scripts/sync_inventaire_epicor.py --dry-run    # affiche, n'envoie rien
    py -3.12 scripts/sync_inventaire_epicor.py              # envoie au portail

Options :
    --env PATH       identifiants SQL (defaut : %USERPROFILE%/GRYB-MCP/gryb-epicor/credentials.env,
                     le meme fichier que le connecteur Epicor de Claude)
    --pin-file PATH  NIP du portail (defaut : "PIN Portail.txt" a la racine du depot)
    --server / --database  surcharge du serveur SQL et de la base (defauts ci-dessous)

Les identifiants et le NIP ne sont jamais affiches.
"""
import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SITE = 'https://etraksolutions.github.io/portal-machine-V2/'
COMPANY = 'ETRAK'
WAREHOUSE = 'ETRAK'
INVENTORY_KEY = 'inventory_etrak'
# Serveur et base du connecteur Epicor de Claude (outil epicor_config). Le fichier
# d'identifiants ne porte que l'usager et le mot de passe ; il peut les surcharger.
DEFAULT_SERVER = 'SRV-SQL-BOX:1433'
DEFAULT_DATABASE = 'EpicorToolboxSaas'
REPO = Path(__file__).resolve().parent.parent
PN_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]*$')


def fetch(path):
    url = SITE + path + ('&' if '?' in path else '?') + 'cb=' + datetime.now().strftime('%Y%m%d%H%M%S')
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read().decode('utf-8')


def portal_part_numbers():
    pns = set(json.loads(fetch('data/price-codes.json')).keys())   # codes tarifes, sans montants
    machines = json.loads(fetch('data/machines.json'))
    for v in machines.values():
        if isinstance(v, dict):
            for lab in (v.get('_bom_labels') or {}).values():
                if isinstance(lab, dict) and lab.get('pn'):
                    pns.add(str(lab['pn']).strip())
    # Slugs des fichiers overrides : meme source que le frontend (overrides-loader.js)
    loader = fetch('js/overrides-loader.js')
    block = loader[loader.index('TYPE_SLUGS'):loader.index('};', loader.index('TYPE_SLUGS'))]
    for slug in re.findall(r":\s*'([a-z0-9-]+)'", block):
        try:
            ov = fetch('data/overrides/%s.json' % slug)
        except Exception:
            continue
        pns.update(p.strip() for p in re.findall(r'"pn":"([^"]+)"', ov))
    # PN ecrits en dur dans le code du kit (harnais Z03B-..., bases, options) :
    # absents des fichiers de donnees, ils sortiraient en « pas en stock » a tort.
    for js in ('js/kit-rules.js', 'js/soumission.js'):
        pns.update(re.findall(r'\b(?:\d{4}-\d{4}|[A-Z]\d{2}[A-Z]-\d{4}(?:_R\d+)?)\b', fetch(js)))
    return sorted(p for p in pns if p and PN_RE.match(p))


def read_env(path):
    env = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip().upper()] = v.strip().strip('"').strip("'")
    return env


def pick(env, *needles, exclude=()):
    for k, v in env.items():
        if any(n in k for n in needles) and not any(x in k for x in exclude):
            return v
    return ''


def sql_connect(env_path, server_arg='', database_arg=''):
    import pyodbc
    env = read_env(env_path)
    server = server_arg or pick(env, 'SERVER', 'HOST') or DEFAULT_SERVER
    port = pick(env, 'PORT')
    database = database_arg or pick(env, 'DATABASE', 'DB_NAME', '_DB', exclude=('SCHEMA',)) or DEFAULT_DATABASE
    user = pick(env, 'USER', 'UID', 'LOGIN')
    password = pick(env, 'PASSWORD', 'PWD', 'PASS')
    missing = [n for n, v in (('serveur', server), ('base', database), ('usager', user), ('mot de passe', password)) if not v]
    if missing:
        sys.exit('Identifiants incomplets dans %s : %s' % (env_path, ', '.join(missing)))
    if port and ':' not in server and ',' not in server:
        server = '%s,%s' % (server, port)
    server = server.replace(':', ',')
    drivers = [d for d in pyodbc.drivers() if 'ODBC Driver' in d and 'SQL Server' in d] or ['SQL Server']
    cs = ('DRIVER={%s};SERVER=%s;DATABASE=%s;UID=%s;PWD=%s;'
          'Encrypt=yes;TrustServerCertificate=yes;ApplicationIntent=ReadOnly;'
          % (sorted(drivers)[-1], server, database, user, password))
    return pyodbc.connect(cs, timeout=30, readonly=True)


def read_on_hand(conn, pns):
    qty = {}
    cur = conn.cursor()
    for i in range(0, len(pns), 200):
        chunk = pns[i:i + 200]
        sql = ('SELECT PartNum, SUM(OnHandQty) FROM dbo.PartWhse '
               'WHERE Company = ? AND WarehouseCode = ? AND PartNum IN (%s) GROUP BY PartNum'
               % ','.join('?' * len(chunk)))
        for pn, q in cur.execute(sql, [COMPANY, WAREHOUSE] + chunk).fetchall():
            qty[str(pn).strip()] = float(q or 0)
    return qty


def read_pin(pin_file):
    # « PIN Portail.txt » porte des lignes d'explication + le NIP seul sur sa ligne.
    # On retient l'unique ligne sans espace ; sinon on s'arrete plutot que deviner.
    lines = [l.strip() for l in Path(pin_file).read_text(encoding='utf-8-sig').splitlines()]
    cands = [l for l in lines if l and ' ' not in l]
    if len(cands) != 1:
        sys.exit('NIP introuvable sans ambiguite dans %s (%d ligne(s) candidate(s))' % (pin_file, len(cands)))
    return cands[0]


def send(snapshot, pin_file):
    pin = read_pin(pin_file)
    cfg = fetch('js/config.js')
    api = re.search(r"https://script\.google\.com/macros/s/[^'\"]+", cfg).group(0)
    body = json.dumps({'action': 'save', 'key': INVENTORY_KEY,
                       'value': json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')),
                       'pin': pin}).encode('utf-8')
    req = urllib.request.Request(api, data=body, headers={'Content-Type': 'text/plain'})
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.loads(r.read().decode('utf-8'))
    if not res.get('ok'):
        sys.exit('Refus du serveur : %s' % res.get('error', res))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--env', default=str(Path.home() / 'GRYB-MCP' / 'gryb-epicor' / 'credentials.env'))
    ap.add_argument('--pin-file', default=str(REPO / 'PIN Portail.txt'))
    ap.add_argument('--server', default='', help='defaut : ' + DEFAULT_SERVER)
    ap.add_argument('--database', default='', help='defaut : ' + DEFAULT_DATABASE)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    pns = portal_part_numbers()
    conn = sql_connect(a.env, a.server, a.database)
    try:
        qty = read_on_hand(conn, pns)
    finally:
        conn.close()
    snapshot = {'updated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                'company': COMPANY, 'warehouse': WAREHOUSE, 'qty': qty}
    size = len(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    absents = [p for p in pns if p not in qty]
    print('Pieces du portail : %d | trouvees dans %s/%s : %d | absentes : %d | taille : %d octets'
          % (len(pns), COMPANY, WAREHOUSE, len(qty), len(absents), size))
    if absents:
        print('Absentes : ' + ', '.join(absents))
    if size > 8500:   # Script Property : 9 ko max par valeur
        sys.exit('Photo trop grosse pour une Script Property (%d octets)' % size)
    if a.dry_run:
        for pn in sorted(qty):
            print('  %-20s %g' % (pn, qty[pn]))
        print('--dry-run : rien envoye.')
        return
    send(snapshot, a.pin_file)
    print('Envoye au portail (%s).' % snapshot['updated'])


if __name__ == '__main__':
    main()
