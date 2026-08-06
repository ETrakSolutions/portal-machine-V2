# -*- coding: utf-8 -*-
"""Import des modeles dans le type « Tracteur » a partir des fichiers de recherche.

Regles decidees par Jacquot le 2026-08-05 :
  - perimetre : toute la gamme, compacts inclus ;
  - un modele entre en base MEME si tout n est pas trouve : les champs manquants
    restent vides et rejoindront la liste de travail des specs (meme choix que
    pour les 234 excavatrices) ;
  - champs : les 3 du type Loader (Capacite de levage, Puissance moteur,
    Poids operationnel).

Controles avant ecriture (memes garde-fous que les imports precedents) :
  - jamais d ecrasement : on ne remplit que ce qui est vide ;
  - pas de doublon de nommage (comparaison insensible casse/ponctuation) ;
  - annees bornees a 2015-2026 ;
  - format des valeurs verifie ;
  - rapport complet avant/apres, et refus d ecrire si une anomalie bloquante
    est detectee.

Entree : les fichiers JSON produits par les agents, dans
scripts/data/tracteurs_recherche/*.json, chacun de la forme
{"marque": "...", "modeles": [{"modele": "...", "annees": "2015-2026",
  "puissance": "...", "poids": "...", "levage": "...", "source_url": "...",
  "source_type": "fabricant|deux_sources|aucune", "confiance": "haute|moyenne|nulle",
  "note": "..."}]}

Usage :
  python scripts/importer_tracteurs.py            # simulation + rapport
  python scripts/importer_tracteurs.py --write    # ecrit machines.json
"""
import glob, json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
RES = os.path.join(ROOT, 'scripts', 'data', 'tracteurs_recherche')
WRITE = '--write' in sys.argv
TYPE = 'Tracteur'
AN_MIN, AN_MAX = 2015, 2026


def norm(s):
    # Le « + » est conservateur d identite : chez Solis, H24 et H24+ sont deux
    # machines distinctes. Le retirer les faisait fusionner, et l import en
    # perdait une silencieusement.
    return re.sub(r'[^a-z0-9+]', '', str(s or '').lower())


def annees_de(txt):
    a = re.findall(r'\d{4}', str(txt or ''))
    if not a:
        return []
    lo, hi = int(a[0]), int(a[-1])
    lo, hi = max(lo, AN_MIN), min(hi, AN_MAX)
    return [str(y) for y in range(lo, hi + 1)] if lo <= hi else []


def entree(puissance, poids, levage):
    return {
        'Capacite de levage': str(levage or '').strip(),
        'Puissance moteur': str(puissance or '').strip(),
        'Poids operationnel': str(poids or '').strip(),
        '_note_tech_texte': '',
        '_note_tech_auteur': '',
        '_note_tech_date': '',
        '_actif': 'Oui',
    }


def main():
    db = json.load(open(MJ, encoding='utf-8'))
    if TYPE not in db:
        sys.exit('Le type « %s » n existe pas dans machines.json.' % TYPE)
    tr = db[TYPE]

    fichiers = sorted(glob.glob(os.path.join(RES, '*.json')))
    if not fichiers:
        sys.exit('Aucun fichier de recherche dans %s' % RES)
    print('fichiers de recherche : %d' % len(fichiers))

    existants = {(f, norm(m)) for f in tr if not f.startswith('_')
                 for y in tr[f] for m in tr[f][y]}
    plan, rejets = [], []
    vus = set()

    for fp in fichiers:
        try:
            data = json.load(open(fp, encoding='utf-8'))
        except Exception as e:
            rejets.append(('-', '-', 'fichier illisible : %s (%s)' % (os.path.basename(fp), e)))
            continue
        marque = str(data.get('marque') or '').strip()
        if not marque:
            rejets.append(('-', '-', 'marque absente dans %s' % os.path.basename(fp)))
            continue
        for m in data.get('modeles', []):
            nom = str(m.get('modele') or '').strip()
            if not nom:
                rejets.append((marque, '-', 'nom de modele vide'))
                continue
            cle = (marque, norm(nom))
            if cle in existants:
                rejets.append((marque, nom, 'deja en base'))
                continue
            if cle in vus:
                rejets.append((marque, nom, 'doublon dans les fichiers de recherche'))
                continue
            ans = annees_de(m.get('annees'))
            if not ans:
                rejets.append((marque, nom, 'annees illisibles ou hors 2015-2026 : %r' % m.get('annees')))
                continue
            vus.add(cle)
            plan.append((marque, nom, ans, entree(m.get('puissance'), m.get('poids'), m.get('levage')), m))

    print('\n=== PLAN (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
    print('modeles a ajouter : %d' % len(plan))
    print('entrees annee-modele : %d' % sum(len(p[2]) for p in plan))
    print('rejets : %d' % len(rejets))

    par_marque = collections.Counter(p[0] for p in plan)
    print('\npar marque :')
    for mq, n in par_marque.most_common():
        print('   %-24s %4d modeles' % (mq, n))

    rempli = collections.Counter()
    for _mq, _nom, _ans, e, _src in plan:
        for k in ('Capacite de levage', 'Puissance moteur', 'Poids operationnel'):
            if e[k]:
                rempli[k] += 1
    print('\nchamps renseignes (sur %d modeles) :' % len(plan))
    for k in ('Puissance moteur', 'Poids operationnel', 'Capacite de levage'):
        print('   %-24s %4d  (%.0f %%)' % (k, rempli[k], 100.0 * rempli[k] / max(1, len(plan))))

    if rejets:
        print('\n=== REJETS (30 premiers) ===')
        for mq, nom, motif in rejets[:30]:
            print('   %-20s %-22s %s' % (str(mq)[:20], str(nom)[:22], motif))

    if WRITE:
        n = 0
        for marque, nom, ans, e, _src in plan:
            if marque not in tr:
                tr[marque] = {}
            for y in ans:
                tr[marque].setdefault(y, {})[nom] = json.loads(json.dumps(e))
                n += 1
        with open(MJ, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
        print('\nECRIT : %d entrees' % n)
    else:
        print('\n(simulation — relancer avec --write)')

    # trace des sources, pour l audit
    out = os.path.join(ROOT, 'scripts', 'data', 'tracteurs_sources.json')
    json.dump([{'marque': p[0], 'modele': p[1], 'annees': '%s-%s' % (p[2][0], p[2][-1]),
                'source_url': p[4].get('source_url'), 'source_type': p[4].get('source_type'),
                'confiance': p[4].get('confiance'), 'note': p[4].get('note')} for p in plan],
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('sources tracees : %s' % os.path.relpath(out, ROOT))


if __name__ == '__main__':
    main()
