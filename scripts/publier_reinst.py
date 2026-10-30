"""Publie les montants de la tuile Reinstallation vers le backend (jamais sur le site public).

Decision Jacquot, 2026-10-29. Liste maitresse sur SharePoint, a cote de prix-portail.json :

    E-Trak Production > General > _Portail e-Trak > prix-reinstallation.json

Format :
    {
      "vigueur": "AAAA-MM-JJ",
      "source": "texte libre (fichier d'ou viennent les prix)",
      "prix":   { "TAUX_H": 185, "KM": 2.34, ..., "PIECES_LIM": 868.79, ... },
      "pieces": { "LIM": [["Z03B-0062", 1, 145.97], ...], ... }
    }

"pieces" ne quitte jamais le poste : il sert a RECALCULER chaque sous-total PIECES_<X>.
Un ecart d'un cent refuse la publication (le sous-total ne peut pas deriver de ses pieces).
Seuls "prix" et "vigueur" partent au serveur (action 'setreinst', NIP du portail), qui
ne les remet qu'aux quatre personnes admises (getreinst).

Catalogue (ajout manuel de pieces, decision Jacquot 2026-10-30) : prix-pieces.json, meme
dossier, { "vigueur", "source", "prix": { "<PN>": prix } } (onglet Pieces de l'import
Epicor de l'annee). Les descriptions et le statut viennent d'Epicor (lecture seule, memes
identifiants que sync_inventaire_epicor.py) : une piece inactive dans Epicor n'est pas
publiee, puisque Luna ne pourrait pas la commander. Envoye compresse (catalogueGz).

Usage :
    py -3.12 scripts/publier_reinst.py --dry-run    # valide et resume, n'envoie rien
    py -3.12 scripts/publier_reinst.py              # envoie au portail
    py -3.12 scripts/publier_reinst.py --sans-catalogue   # montants seulement

Options :
    --fichier PATH   liste maitresse (defaut : prix-reinstallation.json dans _Portail e-Trak)
    --pin-file PATH  NIP du portail (defaut : "PIN Portail.txt" a la racine du depot)
    --pieces PATH    catalogue (defaut : prix-pieces.json dans _Portail e-Trak)
    --env PATH       identifiants SQL Epicor (defaut : celui de sync_inventaire_epicor.py)

Le NIP n'est jamais affiche.
"""
import argparse
import json
import re
import sys
import urllib.request
from decimal import Decimal
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE = 'https://etraksolutions.github.io/portal-machine-V2/'

# Codes attendus par js/reinstallation.js : un code manquant laisserait la page sans total.
OBLIGATOIRES = ['TAUX_H', 'KM', 'HOTEL', 'REPAS', 'LETTRE', 'MINI', 'RACCORDS',
                'INST_LIM', 'INST_GP_1100-0007', 'INST_GP_1100-0011', 'INST_GP_1000-0007',
                'INST_GP_1000-0011', 'INST_LS6', 'INST_LS7',
                'PIECES_LIM', 'PIECES_GP', 'PIECES_LS6', 'PIECES_LS7']


def dossier_portail():
    for lib in (Path.home() / 'e-Trak').glob('E-Trak*Production - Documents'):
        d = lib / 'General' / '_Portail e-Trak'
        if d.is_dir():
            return d
    for lib in (Path.home() / 'e-Trak').glob('E-Trak*Production - General'):
        d = lib / '_Portail e-Trak'
        if d.is_dir():
            return d
    return None


def read_pin(pin_file):
    lines = [l.strip() for l in Path(pin_file).read_text(encoding='utf-8-sig').splitlines()]
    cands = [l for l in lines if l and ' ' not in l]
    if len(cands) != 1:
        sys.exit('NIP introuvable sans ambiguite dans %s (%d ligne(s) candidate(s))' % (pin_file, len(cands)))
    return cands[0]


def api_url():
    with urllib.request.urlopen(SITE + 'js/config.js', timeout=60) as r:
        cfg = r.read().decode('utf-8')
    return re.search(r"https://script\.google\.com/macros/s/[^'\"]+", cfg).group(0)


def post(body):
    req = urllib.request.Request(api_url(), data=json.dumps(body).encode('utf-8'),
                                 headers={'Content-Type': 'text/plain'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode('utf-8'))


def valider(m):
    err = []
    prix = m.get('prix')
    if not isinstance(prix, dict) or not prix:
        sys.exit('Liste refusee : "prix" absent ou vide.')
    for code, v in prix.items():
        if not re.fullmatch(r'[A-Z0-9_-]{2,40}', code):
            err.append('%s : code invalide' % code)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0:
            err.append('%s = %r (doit etre un nombre positif)' % (code, v))
    for code in OBLIGATOIRES:
        if code not in prix:
            err.append('%s : manquant' % code)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(m.get('vigueur', ''))):
        err.append('vigueur : date AAAA-MM-JJ attendue')
    # Chaque sous-total de pieces doit egaler la somme de ses pieces, au cent pres.
    pieces = m.get('pieces') or {}
    for code in [c for c in prix if c.startswith('PIECES_')]:
        sys_ = code[len('PIECES_'):]
        lignes = pieces.get(sys_)
        if not lignes:
            err.append('%s : detail des pieces absent (pieces.%s)' % (code, sys_))
            continue
        total = sum(Decimal(str(q)) * Decimal(str(p)) for _, q, p in lignes)
        if total != Decimal(str(prix[code])):
            err.append('%s = %s mais ses %d pieces font %s' % (code, prix[code], len(lignes), total))
    if err:
        sys.exit('Liste refusee :\n  ' + '\n  '.join(err))


def catalogue(pieces_path, env_path, standard):
    """{PN: [description Epicor, prix]} des pieces ACTIVES dans Epicor, plus les pieces
    des ensembles standard (standard = {PN: prix du fichier maitre}), meme inactives ou
    absentes de la liste de l'annee : la page coche / decoche chaque piece de l'ensemble et
    en retire le prix (decision Jacquot 2026-10-30). Une piece standard presente dans la
    liste de l'annee doit y avoir le meme prix que dans le fichier maitre."""
    import base64, gzip
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import sync_inventaire_epicor as sie
    src = json.loads(Path(pieces_path).read_text(encoding='utf-8'))
    prix = src.get('prix') or {}
    for pn, v in prix.items():
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0:
            sys.exit('Catalogue refuse : %s = %r' % (pn, v))
    conn = sie.sql_connect(env_path or str(Path.home() / 'GRYB-MCP' / 'gryb-epicor' / 'credentials.env'))
    cur = conn.cursor()
    pns = sorted(set(prix) | set(standard))
    info = {}
    for i in range(0, len(pns), 200):
        lot = pns[i:i + 200]
        cur.execute('SELECT PartNum, PartDescription, InActive FROM dbo.Part WHERE Company = ? AND PartNum IN (%s)'
                    % ','.join('?' * len(lot)), [sie.COMPANY] + lot)
        for pn, desc, inact in cur.fetchall():
            info[pn] = (' '.join(str(desc or '').split()), bool(inact))
    absents = [pn for pn in pns if pn not in info]
    inactifs = [pn for pn in pns if pn in info and info[pn][1]]
    cat = {pn: [info[pn][0][:90], round(float(prix[pn]), 2)] for pn in prix if pn in info and not info[pn][1]}
    ecarts = []
    for pn, px in standard.items():
        if pn in cat:
            if Decimal(str(cat[pn][1])) != Decimal(str(px)):
                ecarts.append('%s : %s dans la liste de l annee, %s dans le fichier maitre' % (pn, cat[pn][1], px))
        else:
            cat[pn] = [(info.get(pn, ('',))[0] or pn)[:90], round(float(px), 2)]
    if ecarts:
        sys.exit('Catalogue refuse, prix divergents :\n  ' + '\n  '.join(ecarts))
    absents = [pn for pn in absents if pn in prix]
    inactifs = [pn for pn in inactifs if pn in prix]
    gz = base64.b64encode(gzip.compress(json.dumps(cat, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)).decode('ascii')
    return cat, gz, absents, inactifs


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    d = dossier_portail()
    ap.add_argument('--fichier', default=str(d / 'prix-reinstallation.json') if d else '')
    ap.add_argument('--pin-file', default=str(REPO / 'PIN Portail.txt'))
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--pieces', default=str(d / 'prix-pieces.json') if d else '')
    ap.add_argument('--env', default='')
    ap.add_argument('--sans-catalogue', action='store_true')
    a = ap.parse_args()

    if not a.fichier or not Path(a.fichier).is_file():
        sys.exit('Liste maitresse introuvable : %s' % (a.fichier or '(dossier _Portail e-Trak absent)'))
    m = json.loads(Path(a.fichier).read_text(encoding='utf-8'))
    valider(m)
    print('Liste : %s' % a.fichier)
    print('En vigueur : %s | codes : %d' % (m['vigueur'], len(m['prix'])))
    for code in sorted(m['prix']):
        print('  %-20s %s' % (code, m['prix'][code]))
    body = {'action': 'setreinst', 'reinst': {'prix': m['prix'], 'vigueur': m['vigueur']}}
    if not a.sans_catalogue:
        if not a.pieces or not Path(a.pieces).is_file():
            sys.exit('Catalogue introuvable : %s (ou --sans-catalogue)' % (a.pieces or '?'))
        standard = {}
        for lignes in (m.get('pieces') or {}).values():
            for pn, _q, px in lignes:
                if pn in standard and Decimal(str(standard[pn])) != Decimal(str(px)):
                    sys.exit('Fichier maitre : %s a deux prix (%s et %s)' % (pn, standard[pn], px))
                standard[pn] = px
        cat, gz, absents, inactifs = catalogue(a.pieces, a.env, standard)
        print('Catalogue : %d pieces publiees | %d inactives dans Epicor, retirees : %s | %d absentes d\'Epicor : %s'
              % (len(cat), len(inactifs), ', '.join(inactifs) or '-', len(absents), ', '.join(absents) or '-'))
        body['catalogueGz'] = gz
    if a.dry_run:
        print('--dry-run : rien envoye.')
        return
    body['pin'] = read_pin(a.pin_file)
    res = post(body)
    if not res.get('ok'):
        sys.exit('Refus du serveur : %s' % res.get('error', res))
    print('Serveur : %d codes, %d pieces au catalogue.' % (res['codes'], res.get('catalogue', 0)))


if __name__ == '__main__':
    main()
