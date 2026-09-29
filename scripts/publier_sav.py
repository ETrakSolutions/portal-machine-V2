"""Publie les listes de reference de la page SAV vers le backend (jamais sur le site).

Decision de Jacquot, 2026-09-29 : la page « Demande de service apres-vente » est un
guide d'appel pour toute l'equipe interne. La liste des clients est confidentielle et
le depot est public : elle passe par le serveur (action 'setsav', NIP du portail) et
n'en sort que vers une session d'un role interne (getsav).

Sources :
  - Master Booking (classeur Epicor de l'equipe, lu sur une COPIE) :
      clients  = nom, ville, province, type (dealer / direct / interco d'apres le
                 groupe client Epicor) — aucune adresse, aucun telephone, aucun montant ;
      pieces   = numero + description des pieces vendues ou soumissionnees par e-Trak,
                 sans main-d'oeuvre, kilometrage, garantie, installation ni divers.
  - SharePoint E-Trak Production > General > _Portail e-Trak > sav-reglages.json :
      produits, routage (cle, nom, courriel, regle) et cc — modifiable sans toucher au code.

Usage :
    py -3.13 scripts/publier_sav.py --dry-run    # construit et resume, n'envoie rien
    py -3.13 scripts/publier_sav.py              # envoie au portail

Le NIP n'est jamais affiche.
"""
import argparse
import collections
import json
import shutil
import sys
import tempfile
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from publier_prix import dossier_portail, read_pin, post, REPO  # noqa: E402

MASTER_BOOKING = (Path.home() / 'e-Trak' / 'E-Trak - Finances - Documents' / 'General' /
                  '_e-Trak - gestion' / 'VENTE' / 'Copie de Master Booking CLOUD.xlsm')
# Copie rafraichie 4 fois par jour par la tache « Master e-Trak - Rafraichir Master
# Booking » (Epicor du jour). L'original n'avance que quand quelqu'un clique
# « Actualiser tout » : on prend la plus recente des deux.
MB_LIVE = Path.home() / 'Master e-Trak' / '_cache' / 'mb_live.xlsm'


def classeur_par_defaut():
    cands = [p for p in (MB_LIVE, MASTER_BOOKING) if p.exists()]
    return str(max(cands, key=lambda p: p.stat().st_mtime)) if cands else str(MASTER_BOOKING)
# Groupes de produits qui ne sont PAS des pieces qu'un client commande au telephone.
GROUPES_EXCLUS = ('3116', '3117', '3140', '3120', '32', '9001', '1930')
# Au-dela, la liste pese sur le quota des proprietes du script (500 Ko au total).
PLAFOND_OCTETS = 150_000


def _norm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower().strip()


def type_client(groupe):
    g = _norm(groupe)
    if g.startswith('deal'):
        return 'dealer'
    if g.startswith('pdsf'):
        return 'direct'
    if g.startswith('i/c'):
        return 'interco'
    return ''


def groupe_exclu(pg):
    pg = str(pg or '').strip()
    if not pg or pg == 'None':
        return True                      # lignes Misc (goodwill, transport, garantie)
    return pg.split('-')[0].strip().startswith(GROUPES_EXCLUS)


def lire_classeur(chemin):
    import openpyxl
    tmp = Path(tempfile.mkdtemp()) / 'mb.xlsm'
    shutil.copy2(chemin, tmp)            # jamais l'original : il est souvent ouvert
    wb = openpyxl.load_workbook(tmp, read_only=True, data_only=True, keep_links=False)
    feuilles = {}
    try:
        for nom, soc in (('OrdersData', None), ('QuotesData', 'QuoteHed_Company'),
                         ('InvoicesData', 'InvcHead_Company')):
            it = wb[nom].iter_rows(values_only=True)
            h = [str(c) if c is not None else '' for c in next(it)]
            ix = {c: i for i, c in enumerate(h)}
            lignes = []
            for r in it:
                if soc and str(r[ix[soc]] or '').upper() != 'ETRAK':
                    continue
                lignes.append({c: r[i] for c, i in ix.items()})
            feuilles[nom] = lignes
    finally:
        wb.close()
    return feuilles


def construire(feuilles):
    ville = collections.defaultdict(collections.Counter)
    prov = collections.defaultdict(collections.Counter)
    typ = collections.defaultdict(collections.Counter)
    for nom in ('OrdersData', 'QuotesData', 'InvoicesData'):
        for r in feuilles[nom]:
            c = str(r.get('Customer_Name') or '').strip()
            if not c:
                continue
            if r.get('Customer_City'):
                ville[c][str(r['Customer_City']).strip()] += 1
            if r.get('Customer_State'):
                prov[c][str(r['Customer_State']).strip().upper()] += 1
            t = type_client(r.get('CustGrup_GroupDesc') or r.get('Calculated_CustomerGroup'))
            if t:
                typ[c][t] += 1
            else:
                typ[c]                      # le client existe meme sans groupe connu
    # Comptes marques « DOUBLONS » dans Epicor : ecartes. Deux ecritures d'un meme
    # nom (« Societe VIA » / « Societe Via ») : fusionnees sous la plus frequente.
    freq = collections.Counter()
    for nom in ('OrdersData', 'QuotesData', 'InvoicesData'):
        for r in feuilles[nom]:
            c = str(r.get('Customer_Name') or '').strip()
            if c:
                freq[c] += 1
    groupes = collections.defaultdict(list)
    for c in set(ville) | set(prov) | set(typ):
        if _norm(c).startswith('doublon'):
            continue
        groupes[''.join(ch for ch in _norm(c) if ch.isalnum())].append(c)
    clients = []
    for noms in groupes.values():
        c = max(noms, key=lambda n: freq[n])
        v, pv, t = collections.Counter(), collections.Counter(), collections.Counter()
        for n in noms:
            v.update(ville[n]); pv.update(prov[n]); t.update(typ[n])
        clients.append([c, v.most_common(1)[0][0] if v else '',
                        pv.most_common(1)[0][0] if pv else '',
                        t.most_common(1)[0][0] if t else ''])
    clients.sort(key=lambda x: _norm(x[0]))

    desc = collections.defaultdict(collections.Counter)
    for nom, pn, d in (('OrdersData', 'OrderDtl_PartNum', 'OrderDtl_LineDesc'),
                       ('QuotesData', 'QuoteDtl_PartNum', 'Part_PartDescription'),
                       ('InvoicesData', 'InvcDtl_PartNum', 'InvcDtl_LineDesc')):
        for r in feuilles[nom]:
            p = str(r.get(pn) or '').strip()
            if not p or groupe_exclu(r.get('ProdGrup_Description')):
                continue
            desc[p][str(r.get(d) or '').strip()] += 1
    # « ****Ne pas prendre**** » : piece retiree dans Epicor, a ne jamais proposer.
    pieces = sorted(([p, desc[p].most_common(1)[0][0]] for p in desc
                     if 'ne pas prendre' not in _norm(desc[p].most_common(1)[0][0])
                     and 'ne pas utiliser' not in _norm(desc[p].most_common(1)[0][0])),
                    key=lambda x: x[0])
    return clients, pieces


def lire_reglages(fichier):
    r = json.loads(Path(fichier).read_text(encoding='utf-8'))
    for k in ('produits', 'routage'):
        if not isinstance(r.get(k), list) or not r[k]:
            sys.exit('sav-reglages.json : « %s » manquant ou vide' % k)
    for x in r['routage']:
        if not x.get('cle') or not x.get('nom'):
            sys.exit('sav-reglages.json : chaque routage doit avoir « cle » et « nom »')
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--classeur', default=None)
    ap.add_argument('--reglages', default=None)
    ap.add_argument('--pin-file', default=str(REPO / 'PIN Portail.txt'))
    a = ap.parse_args()

    reg_path = Path(a.reglages) if a.reglages else ((dossier_portail() or Path('.')) / 'sav-reglages.json')
    if not reg_path.exists():
        sys.exit('Reglages introuvables : %s' % reg_path)
    reglages = lire_reglages(reg_path)
    a.classeur = a.classeur or classeur_par_defaut()
    print('Classeur : %s' % a.classeur)
    if not Path(a.classeur).exists():
        sys.exit('Master Booking introuvable : %s' % a.classeur)
    clients, pieces = construire(lire_classeur(a.classeur))
    sav = {'clients': clients, 'pieces': pieces, 'produits': reglages['produits'],
           'routage': reglages['routage'], 'cc': reglages.get('cc') or []}
    taille = len(json.dumps(sav, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    nt = collections.Counter(c[3] or '(inconnu)' for c in clients)
    print('Clients : %d (%s)' % (len(clients), ', '.join('%s %d' % kv for kv in nt.most_common())))
    print('Pieces  : %d' % len(pieces))
    print('Routage : %s' % ', '.join('%s <%s>' % (x['nom'], x.get('courriel') or 'SANS COURRIEL')
                                     for x in reglages['routage']))
    print('Taille  : %d octets' % taille)
    if taille > PLAFOND_OCTETS:
        sys.exit('Liste trop lourde (%d octets > %d) : resserrer les pieces' % (taille, PLAFOND_OCTETS))
    sans = [x['nom'] for x in reglages['routage'] if not x.get('courriel')]
    if sans:
        print('⚠ Routage sans courriel (la page le desactive) : %s' % ', '.join(sans))
    if a.dry_run:
        print('--dry-run : rien envoye.')
        return
    # Envoi COMPRESSE : le serveur stocke la liste en gzip (quota de 500 Ko partage par
    # tout le portail ; il restait ~80 Ko le 2026-09-29, la liste brute en fait 86).
    import base64, gzip
    gz = base64.b64encode(gzip.compress(json.dumps(sav, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)).decode('ascii')
    res = post({'action': 'setsav', 'savGz': gz, 'pin': read_pin(a.pin_file)})
    if not res.get('ok'):
        sys.exit('Refus du portail : %s' % res)
    print('Publie : %d clients, %d pieces, %d tranche(s), %s octets stockes.' % (res['clients'], res['pieces'], res['chunks'], res.get('octets', '?')))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
