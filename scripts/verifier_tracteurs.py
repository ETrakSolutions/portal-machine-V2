# -*- coding: utf-8 -*-
"""Controle qualite des fichiers de recherche Tracteur, AVANT import.

Ne modifie rien. Lit scripts/data/tracteurs_recherche/*.json et signale tout ce
qui doit etre arbitre par un humain avant d ecrire dans machines.json.

Motivation : lors de la collecte du 2026-08-06, un agent a invente 31 modeles
avec numeros de brochure, poids et puissances plausibles, livres en
« confiance: haute ». Le rapport d un agent ne vaut donc pas preuve. Ce script
cherche les signatures d une donnee fabriquee autant que les fautes de format.

Usage :
  python scripts/verifier_tracteurs.py
"""
import glob, json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'scripts', 'data', 'tracteurs_recherche')
MARQUES = os.path.join(ROOT, 'scripts', 'data', 'tracteurs_marques.json')

RX_HP = re.compile(r'^\d+ hp$')
RX_LB = re.compile(r'^\d{1,3}( \d{3})* lb$')
RX_AN = re.compile(r'^\d{4}(-\d{4})?$')
CONFIANCES = {'haute', 'moyenne', 'faible', 'nulle'}
SOURCE_TYPES = {'fabricant', 'deux_sources', 'aucune'}
AN_MIN, AN_MAX = 2015, 2026


def norm(s):
    # Doit rester identique a celle de importer_tracteurs.py : le « + »
    # distingue H24 de H24+ chez Solis.
    return re.sub(r'[^a-z0-9+]', '', str(s or '').lower())


def nombre(v):
    """'12 346 lb' -> 12346 ; '' -> None"""
    if not v:
        return None
    d = re.sub(r'[^0-9]', '', v)
    return int(d) if d else None


def main():
    fichiers = sorted(glob.glob(os.path.join(RES, '*.json')))
    if not fichiers:
        sys.exit('Aucun fichier de recherche dans %s' % RES)

    attendues = set()
    if os.path.exists(MARQUES):
        mq = json.load(open(MARQUES, encoding='utf-8'))
        attendues = {m['nom'] for m in mq.get('marques', [])}

    erreurs, alertes = [], []
    par_marque = collections.OrderedDict()
    cles_vues = {}
    total = 0

    for fp in fichiers:
        base = os.path.basename(fp)
        try:
            data = json.load(open(fp, encoding='utf-8'))
        except Exception as e:
            erreurs.append('%s : JSON illisible (%s)' % (base, e))
            continue
        marque = str(data.get('marque') or '').strip()
        if not marque:
            erreurs.append('%s : champ « marque » absent' % base)
            continue
        if attendues and marque not in attendues:
            alertes.append('%s : marque « %s » absente de tracteurs_marques.json' % (base, marque))

        modeles = data.get('modeles') or []
        par_marque.setdefault(marque, {'fichiers': [], 'n': 0, 'rempli': collections.Counter(),
                                       'conf': collections.Counter()})
        par_marque[marque]['fichiers'].append(base)
        par_marque[marque]['n'] += len(modeles)

        for m in modeles:
            total += 1
            nom = str(m.get('modele') or '').strip()
            ou = '%s / %s %s' % (base, marque, nom or '(sans nom)')
            if not nom:
                erreurs.append('%s : modele sans nom' % base)
                continue

            cle = (marque, norm(nom))
            if cle in cles_vues:
                erreurs.append('%s : doublon de « %s » (deja dans %s)' % (ou, nom, cles_vues[cle]))
            else:
                cles_vues[cle] = base

            for champ, rx in (('puissance', RX_HP), ('poids', RX_LB), ('levage', RX_LB)):
                v = str(m.get(champ) or '')
                if v and not rx.match(v):
                    erreurs.append('%s : %s = %r (format invalide)' % (ou, champ, v))
                if v:
                    par_marque[marque]['rempli'][champ] += 1

            an = str(m.get('annees') or '')
            if not RX_AN.match(an):
                erreurs.append('%s : annees = %r (format invalide)' % (ou, an))
            else:
                ans = [int(x) for x in re.findall(r'\d{4}', an)]
                if ans[0] > ans[-1]:
                    erreurs.append('%s : annees inversees (%s)' % (ou, an))
                if ans[-1] < AN_MIN or ans[0] > AN_MAX:
                    erreurs.append('%s : annees hors 2015-2026 (%s)' % (ou, an))

            conf = m.get('confiance')
            if conf not in CONFIANCES:
                erreurs.append('%s : confiance = %r' % (ou, conf))
            else:
                par_marque[marque]['conf'][conf] += 1
            if m.get('source_type') not in SOURCE_TYPES:
                erreurs.append('%s : source_type = %r' % (ou, m.get('source_type')))

            # --- signatures de donnee fabriquee ---
            url = str(m.get('source_url') or '')
            if conf == 'haute' and not url:
                alertes.append('%s : confiance haute SANS source_url' % ou)
            if url and not url.startswith('http'):
                alertes.append('%s : source_url douteuse (%s)' % (ou, url[:60]))

            p, po, lv = nombre(m.get('puissance')), nombre(m.get('poids')), nombre(m.get('levage'))
            # Bornes larges : le 9RX 830 fait 830 hp et 76 000 lb, le Steiger 785
            # existe. On ne signale que l aberration franche.
            if po is not None and not (400 <= po <= 95000):
                alertes.append('%s : poids hors plage plausible (%s)' % (ou, m.get('poids')))
            if p is not None and not (10 <= p <= 900):
                alertes.append('%s : puissance hors plage plausible (%s)' % (ou, m.get('puissance')))
            # Un relevage 3 points MODERNE depasse couramment le poids a vide :
            # il est cote a la capacite hydraulique, pas a la stabilite. On ne
            # signale donc qu au-dela du double, ou la lecture est douteuse.
            if lv is not None and po is not None and lv > 2 * po:
                alertes.append('%s : levage (%s) > 2x le poids (%s) — lecture a verifier'
                               % (ou, m.get('levage'), m.get('poids')))
            if lv == 0 or po == 0 or p == 0:
                alertes.append('%s : valeur a zero (interdite : laisser vide)' % ou)
            # fuite de configuration dans le nom du modele
            if re.search(r'\b(cab|cabine|rops|canopy|2wd|4wd|mfwd|mfd)\b', nom, re.I):
                alertes.append('%s : le nom contient une configuration, pas un modele de base' % ou)

    # valeurs identiques repetees : soit spec commune publiee, soit copier-coller
    trios = collections.Counter()
    for fp in fichiers:
        try:
            data = json.load(open(fp, encoding='utf-8'))
        except Exception:
            continue
        for m in data.get('modeles') or []:
            t = (data.get('marque'), m.get('puissance'), m.get('poids'), m.get('levage'))
            if any(t[1:]):
                trios[t] += 1
    repetes = [(t, n) for t, n in trios.items() if n >= 4]

    print('=' * 72)
    print('CONTROLE DES FICHIERS DE RECHERCHE TRACTEUR')
    print('=' * 72)
    print('fichiers : %d   marques : %d   modeles : %d' % (len(fichiers), len(par_marque), total))
    if attendues:
        manquantes = sorted(attendues - set(par_marque))
        print('marques attendues sans fichier : %d %s' % (len(manquantes), manquantes if manquantes else ''))

    print('\n--- par marque ---')
    print('%-24s %6s  %-28s %s' % ('marque', 'modeles', 'remplissage p/po/lv', 'confiance'))
    for marque, d in sorted(par_marque.items(), key=lambda kv: -kv[1]['n']):
        n = d['n'] or 1
        r = d['rempli']
        pct = '%3d%% / %3d%% / %3d%%' % (100 * r['puissance'] // n, 100 * r['poids'] // n, 100 * r['levage'] // n)
        conf = ' '.join('%s:%d' % (k, v) for k, v in d['conf'].most_common())
        print('%-24s %6d  %-28s %s' % (marque, d['n'], pct, conf))

    print('\n--- ERREURS BLOQUANTES : %d ---' % len(erreurs))
    for e in erreurs[:60]:
        print('   %s' % e)
    if len(erreurs) > 60:
        print('   ... et %d autres' % (len(erreurs) - 60))

    print('\n--- ALERTES A ARBITRER : %d ---' % len(alertes))
    for a in alertes[:60]:
        print('   %s' % a)
    if len(alertes) > 60:
        print('   ... et %d autres' % (len(alertes) - 60))

    print('\n--- TRIOS DE VALEURS IDENTIQUES (>= 4 modeles) : %d ---' % len(repetes))
    print('    (normal quand le fabricant publie une valeur commune ; suspect sinon)')
    for (marque, p, po, lv), n in sorted(repetes, key=lambda x: -x[1])[:25]:
        print('   %-22s x%-3d  %s / %s / %s' % (marque, n, p or '-', po or '-', lv or '-'))

    print('\n%s' % ('VERDICT : erreurs bloquantes a corriger avant import.' if erreurs
                    else 'VERDICT : aucun blocage de format. Les alertes restent a arbitrer.'))


if __name__ == '__main__':
    main()
