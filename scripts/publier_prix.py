"""Publie la liste de prix du portail vers le backend (jamais sur le site public).

Depuis le 2026-09-25 (decision de Jacquot), les prix ne sont plus dans le depot :
l'ancien data/prices.json se telechargeait sans connexion. La liste maitresse du
portail vit sur SharePoint, a cote de la liste de prix officielle :

    E-Trak Production > General > _Portail e-Trak > prix-portail.json

Format : { "<PN>": { "item": <nombre|null>, "install": <nombre|null>,
                     "installCode": "<PN de pose>" (facultatif) } }

Ce script :
  1. valide le fichier (montants numeriques ou null, aucun texte) ;
  2. l'envoie au backend (action 'setprices', NIP du portail), qui le garde en
     Script Properties et ne le remet qu'aux vraies sessions ayant la Soumission ;
  3. regenere data/price-codes.json (codes SANS montants : 1 = a une pose), le seul
     fichier public, qu'il faut ensuite committer et pousser.

Usage :
    py -3.13 scripts/publier_prix.py --dry-run     # valide et resume, n'envoie rien
    py -3.13 scripts/publier_prix.py               # envoie au portail
    py -3.13 scripts/publier_prix.py --journal     # qui a obtenu les prix, et quand

Options :
    --fichier PATH   liste maitresse (defaut : prix-portail.json dans _Portail e-Trak)
    --pin-file PATH  NIP du portail (defaut : "PIN Portail.txt" a la racine du depot)

Le NIP n'est jamais affiche.
"""
import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE = 'https://etraksolutions.github.io/portal-machine-V2/'


def dossier_portail():
    # Le tiret apres « E-Trak » est un demi-cadratin : on lit le disque plutot que
    # de retaper le nom.
    for lib in (Path.home() / 'e-Trak').glob('E-Trak*Production - Documents'):
        d = lib / 'General' / '_Portail e-Trak'
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


def valider(prix):
    if not isinstance(prix, dict) or not prix:
        sys.exit('Liste vide ou mal formee.')
    erreurs = []
    for code, v in prix.items():
        if not isinstance(v, dict):
            erreurs.append('%s : pas un objet' % code)
            continue
        for champ in ('item', 'install'):
            x = v.get(champ)
            if x is not None and (isinstance(x, bool) or not isinstance(x, (int, float))):
                erreurs.append('%s.%s = %r (doit etre un nombre ou null)' % (code, champ, x))
    if erreurs:
        sys.exit('Liste refusee :\n  ' + '\n  '.join(erreurs))


def codes_publics(prix):
    return {k: (1 if isinstance(v.get('install'), (int, float)) and v.get('install') != 0 else 0)
            for k, v in sorted(prix.items())}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    d = dossier_portail()
    ap.add_argument('--fichier', default=str(d / 'prix-portail.json') if d else '')
    ap.add_argument('--pin-file', default=str(REPO / 'PIN Portail.txt'))
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--journal', action='store_true')
    a = ap.parse_args()

    if a.journal:
        res = post({'action': 'getpriceslog', 'pin': read_pin(a.pin_file)})
        if not res.get('ok'):
            sys.exit('Refus du serveur : %s' % res.get('error', res))
        print('Liste publiee le : %s' % (res.get('updated') or '?'))
        log = res.get('log') or {}
        for u, e in sorted(log.items(), key=lambda kv: kv[1].get('last', ''), reverse=True):
            print('  %-40s %4d fois  derniere : %s  premiere : %s' % (u, e.get('n', 0), e.get('last'), e.get('first')))
        if not log:
            print('  (personne encore)')
        return

    if not a.fichier or not Path(a.fichier).is_file():
        sys.exit('Liste maitresse introuvable : %s' % (a.fichier or '(dossier _Portail e-Trak absent)'))
    prix = json.loads(Path(a.fichier).read_text(encoding='utf-8'))
    valider(prix)
    codes = codes_publics(prix)
    taille = len(json.dumps(prix, ensure_ascii=False, separators=(',', ':')))
    print('Liste : %s' % a.fichier)
    print('Codes : %d | avec pose : %d | taille : %d octets' % (len(prix), sum(codes.values()), taille))
    if a.dry_run:
        print('--dry-run : rien envoye.')
        return

    res = post({'action': 'setprices', 'prices': prix, 'pin': read_pin(a.pin_file)})
    if not res.get('ok'):
        sys.exit('Refus du serveur : %s' % res.get('error', res))
    print('Serveur : %d codes enregistres en %d tranche(s).' % (res['codes'], res['chunks']))

    out = REPO / 'data' / 'price-codes.json'
    avant = out.read_text(encoding='utf-8') if out.is_file() else ''
    apres = json.dumps(codes, ensure_ascii=False, separators=(',', ':'))
    if apres != avant:
        out.write_text(apres, encoding='utf-8', newline='\n')
        print('data/price-codes.json mis a jour : a committer et pousser.')
    else:
        print('data/price-codes.json inchange.')


if __name__ == '__main__':
    main()
