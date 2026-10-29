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

Usage :
    py -3.13 scripts/publier_reinst.py --dry-run    # valide et resume, n'envoie rien
    py -3.13 scripts/publier_reinst.py              # envoie au portail

Options :
    --fichier PATH   liste maitresse (defaut : prix-reinstallation.json dans _Portail e-Trak)
    --pin-file PATH  NIP du portail (defaut : "PIN Portail.txt" a la racine du depot)

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


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    d = dossier_portail()
    ap.add_argument('--fichier', default=str(d / 'prix-reinstallation.json') if d else '')
    ap.add_argument('--pin-file', default=str(REPO / 'PIN Portail.txt'))
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    if not a.fichier or not Path(a.fichier).is_file():
        sys.exit('Liste maitresse introuvable : %s' % (a.fichier or '(dossier _Portail e-Trak absent)'))
    m = json.loads(Path(a.fichier).read_text(encoding='utf-8'))
    valider(m)
    print('Liste : %s' % a.fichier)
    print('En vigueur : %s | codes : %d' % (m['vigueur'], len(m['prix'])))
    for code in sorted(m['prix']):
        print('  %-20s %s' % (code, m['prix'][code]))
    if a.dry_run:
        print('--dry-run : rien envoye.')
        return
    res = post({'action': 'setreinst', 'reinst': {'prix': m['prix'], 'vigueur': m['vigueur']},
                'pin': read_pin(a.pin_file)})
    if not res.get('ok'):
        sys.exit('Refus du serveur : %s' % res.get('error', res))
    print('Serveur : %d codes enregistres.' % res['codes'])


if __name__ == '__main__':
    main()
