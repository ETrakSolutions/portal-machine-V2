# -*- coding: utf-8 -*-
"""Import du niveau A de la tournee des modeles manquants du 2026-10-23.

Source : scripts/data/tournee_2026-10/lot_A.json (onglet « A - Pret » de
CLAUDE_CODE/Tournee_Modeles_Manquants_2026-10-23.xlsx) + specs relevees a la
source fabricant (scripts/data/tournee_2026-10/specs/out_s_*.json).
Decision de Jacquot (2026-10-23) : « go pour l'import des 457 ».

Regles appliquees :
  - « absent »   : nouvelle entree, cles du type copiees d'une entree reelle du
                   meme type ; valeur introuvable = « A completer », jamais devinee.
  - « millesime »: l'entree existante la plus recente du meme modele est recopiee
                   telle quelle sur les annees manquantes.
  - Annees       : intersection avec les annees deja presentes pour le fabricant
                   dans ce type (on ne cree pas d'annee neuve pour une marque).
  - Excavatrice  : Classe recalculee par les voisins de poids (+/-7 %), harnais du
                   fabricant (miroir de js/kit-rules.js), 0004 « mini » pose par
                   override seulement si le FABRICANT classe le modele en mini
                   au-dela de 5 t (voir OVERRIDE_0004).
  - RETENUS      : cas que la passe de specs a mis en doute (voir RETENUS) ; ils
                   restent dans le classeur pour decision, rien n'est ecrit.
  - Collision    : un nom deja present (correspondance sans casse/espaces/tirets)
                   n'est jamais ecrase.

Usage :
  python scripts/import_tournee_2026_10.py            # simulation + rapport
  python scripts/import_tournee_2026_10.py --write    # ecrit machines.json + override
  python scripts/import_tournee_2026_10.py --lot lot_2.json [--write]   # lot 2
"""
import copy, glob, json, os, re, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import import_excavatrices_manquantes as ex_imp   # harnais_pour, classe_voisins, db_weight_points

MJ = os.path.join(ROOT, 'data', 'machines.json')
OV_DIR = os.path.join(ROOT, 'data', 'overrides')
SLUGS = {'Excavatrice': 'excavatrice', 'Pompe a Beton': 'pompe-a-beton', 'Grue Mobile': 'grue-mobile',
         'Camion Girafe (Boom Truck)': 'camion-girafe', 'Telehandler': 'telehandler', 'Foreuse': 'foreuse',
         'Camion Vacuum': 'camion-vacuum', 'Retrocaveuse': 'retrocaveuse', 'Loader': 'loader',
         'Nacelle': 'nacelle', 'Tracteur': 'tracteur'}   # miroir de js/overrides-loader.js TYPE_SLUGS
DATA = os.path.join(ROOT, 'scripts', 'data', 'tournee_2026-10')
WRITE = '--write' in sys.argv
# --lot lot_2.json : deuxieme lot (decisions 2, 3 et 4 de Jacquot, 2026-10-23)
LOT = sys.argv[sys.argv.index('--lot') + 1] if '--lot' in sys.argv else 'lot_A.json'
AC = 'A completer'

# Retenus hors import (passe de specs du 2026-10-23) : (type, fabricant, modele) ou (type, fabricant, None)
RETENUS = {
    ('Nacelle', 'Niftylift', None): 'categorie articulee deduite, non publiee ; SP nord-americains = HR europeens deja en BD',
    ('Nacelle', 'Haulotte', '45 XA'): 'categorie (articulee ou telescopique) non publiee',
    ('Nacelle', 'Haulotte', '55 XA'): 'categorie (articulee ou telescopique) non publiee',
    ('Nacelle', 'JLG', '450AJ HC3'): 'doublon probable : 450AJ en BD porte deja la note HC3',
    ('Nacelle', 'Genie', 'Z-62/40 TraX'): 'meme fiche que Z-62/40 deja en BD',
    ('Nacelle', 'MEC (Dingli)', 'DualReach 85-J Hybrid'): 'doublon probable de DualReach 85-J (diesel / hybride)',
    ('Nacelle', 'Manitou', 'ATJ 60 RC'): 'la page parle de l ATJ 60, deja en BD',
    ('Excavatrice', 'Komatsu', 'PC158USLCi-12'): 'aucune spec publiee (lancement annonce plus tard en 2026)',
    ('Pompe a Beton', 'Liebherr', '32 XXT'): 'probablement le 31 XXT deja en BD (a renommer)',
    ('Camion Vacuum', 'Super Products', 'Camel Super Boom'): 'option du Camel Max, pas un camion',
    ('Camion Vacuum', 'Super Products', 'Camel Max Series Wastewater Recycler'): 'option du Camel Max, pas un camion',
    ('Retrocaveuse', 'Caterpillar', '432'): 'modele international (moteur Stage V)',
    ('Retrocaveuse', 'Caterpillar', '434'): 'modele international (moteur Stage V)',
    ('Retrocaveuse', 'Case', 'Utility Plus'): 'la fiche s intitule 575N EP : nom a trancher',
    ('Loader', 'New Holland', 'W80C'): 'seule source = communique 2017, absente du site NA actuel',
    ('Grue Mobile', 'Maeda', 'MK3053C'): 'mini-grue a fleche articulee : type a trancher',
    ('Grue Mobile', 'Liebherr', 'LTC 1050-3.1E'): 'variante possible de la LTC 1050-3.1',
    ('Foreuse', 'TEI Rock Drills', 'Skid Steer Drill Attachment'): 'accessoire de chargeuse compacte, sans numero de modele',
    ('Tracteur', 'Kubota', 'B2401N'): 'classee configuration de la B2401 a l import tracteur',
    ('Tracteur', 'Kubota', 'LX3520N'): 'classee configuration de la LX3520 a l import tracteur',
}
# Lot 2 : nacelles remorquables dont la categorie n'est pas ECRITE par le fabricant (lue
# sur un dessin ou une photo) -> retenues comme Niftylift ; « articulee » ajoute ~1 190 $.
for _f, _m in [('Genie', 'TZ-34/20'), ('Haulotte', '3522 A'), ('Haulotte', '3632 T'), ('Haulotte', '4527 A'),
               ('Haulotte', '5533 A'), ('Haulotte', '6543 A'), ('JLG', 'ET350'), ('JLG', 'ET500J'),
               ('JLG', 'T350'), ('JLG', 'T500J')]:
    RETENUS[('Nacelle', _f, _m)] = 'remorquable : categorie lue sur dessin/photo, non ecrite par le fabricant'
RETENUS[('Loader', 'Komatsu', 'WA1200-6')] = 'discontinuee, annees de vente NA non publiees'
RETENUS[('Pompe a Beton', 'Alliance', '43-5 Meter')] = 'probablement la 42-5 Meter deja en BD (renommee)'

MERLO_HORS_NA = {'MF44.7', 'P30.10', 'P30.7', 'P40.14', 'ROTO50.16', 'ROTO60.22', 'ROTO60.27'}
for _m in MERLO_HORS_NA:
    RETENUS[('Telehandler', 'Merlo', _m)] = 'source = site Merlo Norvege, absent du site Merlo USA'

# 0004 « mini » : classification STRICTE du fabricant (memoire project-portal-option-0004-mini).
# Sous 5 t, js/kit-rules.js le pose deja ; au-dela, seulement si le fabricant dit mini.
OVERRIDE_0004 = {('Develon (Doosan)', 'DX63-7')}   # gamme mini Develon jusqu'a la DX89R-7

# Marques presque vides dans ce type (1-2 modeles) mais qui vendent bien la gamme : on cree
# les annees manquantes (meme exception que Yanmar a l'import du 2026-08-05).
ANNEES_CREEES = {('Loader', 'JCB'), ('Loader', 'New Holland'),
                 ('Telehandler', 'LGMG'), ('Telehandler', 'Liebherr')}   # lot 3 : LGMG entre dans le type ; Liebherr n'y avait qu'un modele

# Hitachi -7H (decision 4 : modele distinct du -7, on garde les deux) : le kit de la jumelle
# -7 a deja ete ajuste a la main (ZX210LC-7 : drain 0009 = na ; ZX490LC-7 : support Z01A-0279
# obligatoire). La -7H recoit l'override de sa jumelle, annee par annee.
def jumelle_7(fab, mod):
    return mod[:-1] if fab == 'Hitachi' and mod.endswith('-7H') else None


META = {   # cles techniques d'une nouvelle entree, par type (valeurs majoritaires en BD)
    'Excavatrice': {'_source_bom': 'Defaut', '_note_tech_texte': '', '_note_tech_auteur': '',
                    '_note_tech_date': '', '_actif': 'Oui', '_notes': ''},
    'Pompe a Beton': {'_source_bom': 'Defaut', '_note_tech_texte': '', '_note_tech_auteur': '',
                      '_note_tech_date': '', '_actif': 'Oui'},
}
META_DEFAUT = {'_note_tech_texte': '', '_note_tech_auteur': '', '_note_tech_date': '', '_actif': 'Oui'}


def norm(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def cles_du_type(db, t):
    c = collections.Counter()
    for fab, yy in db[t].items():
        if fab.startswith('_'):
            continue
        for y, mm in yy.items():
            if y.startswith('_'):
                continue
            for m, s in mm.items():
                c.update(k for k in s if not k.startswith('_') and k not in ('Image', 'Flag'))
    n = max(c.values())
    return [k for k, v in c.items() if v >= n * 0.5]


def specs_relevees():
    out = {}
    for f in glob.glob(os.path.join(DATA, 'specs', 'out_s*.json')):
        for r in json.load(open(f, encoding='utf-8'))['resultats']:
            out[(r['type'], r['fabricant'], r['modele'])] = r
    return out


def main():
    db = json.load(open(MJ, encoding='utf-8'))
    ovs = {t: json.load(open(os.path.join(OV_DIR, sl + '.json'), encoding='utf-8')) for t, sl in SLUGS.items()}
    lot = json.load(open(os.path.join(DATA, LOT), encoding='utf-8'))
    specs = specs_relevees()
    pts = ex_imp.db_weight_points(db['Excavatrice'])
    keys = {t: cles_du_type(db, t) for t in db if not t.startswith('_')}

    retenus, collisions, sans_specs, rognees, plan = [], [], [], [], []
    for x in lot:
        t, fab, mod, statut = x['Type'], x['Fabricant'], x['Modèle (nom officiel)'], x['Statut']
        why = None if x.get('Forcer') else (RETENUS.get((t, fab, mod)) or RETENUS.get((t, fab, None)))
        if why:
            retenus.append((t, fab, mod, why))
            continue
        yy = db[t].setdefault(fab, {}) if (t, fab) in ANNEES_CREEES else db[t][fab]
        voulues = [str(a) for a in json.loads(x['Années à ajouter'])]
        annees = [a for a in voulues if a in yy or (t, fab) in ANNEES_CREEES]
        if len(annees) != len(voulues):
            rognees.append((t, fab, mod, sorted(set(voulues) - set(annees))))
        noms = {}
        for y, mm in yy.items():
            if not y.startswith('_'):
                for m in mm:
                    noms.setdefault(norm(m), []).append(y)
        if statut == 'millesime':
            src = sorted(noms.get(norm(mod), []))
            if not src:
                collisions.append((t, fab, mod, 'millesime sans entree source'))
                continue
            nom_bd = next(m for m in yy[src[-1]] if norm(m) == norm(mod))
            base = yy[src[-1]][nom_bd]
            annees = [a for a in annees if nom_bd not in yy.get(a, {})]
            # les jetons du kit sont ranges par annee : on recopie aussi l'override de l'annee source
            ovsrc = ovs[t][t].get(fab, {}).get(src[-1], {}).get(nom_bd)
            plan.append((t, fab, nom_bd, annees, copy.deepcopy(base), ovsrc))
            continue
        if norm(mod) in noms:
            collisions.append((t, fab, mod, 'deja en BD : ' + ','.join(sorted(noms[norm(mod)]))))
            continue
        r = specs.get((t, fab, mod))
        sv = (r or {}).get('specs') or {}
        if not r:
            sans_specs.append((t, fab, mod))
        e = {}
        if t == 'Excavatrice':
            e['Flag'] = 'FALSE'
        for k in keys[t]:
            v = sv.get(k)
            e[k] = v if v not in (None, '') else AC
        if t == 'Excavatrice':
            kg = ex_imp.poids_kg_list(e['Poids operationnel (kg / lbs)'])
            e['Classe machine'] = ex_imp.classe_voisins(kg[0], pts)[0] if kg else ''
            e['Test Robin'] = ''
            e['_harnais'] = ex_imp.harnais_pour(fab, mod)
        e.update(META.get(t, META_DEFAUT))
        if x.get('Note tech'):
            e['_note_tech_texte'] = x['Note tech']
            e['_note_tech_auteur'] = 'Claude (tournee 2026-10)'
            e['_note_tech_date'] = '2026-10-23'
        ovn = {'_bom': {'0004': 'r'}} if (t == 'Excavatrice' and (fab, mod) in OVERRIDE_0004) else None
        if t == 'Excavatrice' and jumelle_7(fab, mod):
            for a in annees:   # un override par annee : on decoupe pour garder l'annee de la jumelle
                oj = ovs[t][t].get(fab, {}).get(a, {}).get(jumelle_7(fab, mod))
                plan.append((t, fab, mod, [a], e, copy.deepcopy(oj) if oj else None))
            continue
        plan.append((t, fab, mod, annees, e, ovn))

    plan = [p for p in plan if p[3]]
    n_ent = sum(len(p[3]) for p in plan)
    print('=== IMPORT TOURNEE 2026-10 — %s (%s) ===' % (LOT, 'ECRITURE' if WRITE else 'SIMULATION'))
    print('lot : %d | a importer : %d modeles, %d entrees annee-modele | retenus : %d | collisions : %d'
          % (len(lot), len({(q[0], q[1], q[2]) for q in plan}), n_ent, len(retenus), len(collisions)))
    c = collections.Counter(p[0] for p in {(q[0], q[1], q[2]): q for q in plan}.values())
    for t in sorted(c):
        print('  %-28s %3d modeles  %4d entrees' % (t, c[t], sum(len(p[3]) for p in plan if p[0] == t)))
    for lab, L in (('RETENUS', retenus), ('COLLISIONS', collisions), ('SANS SPECS RELEVEES', sans_specs),
                   ('ANNEES ROGNEES', rognees)):
        print('--- %s (%d)' % (lab, len(L)))
        for z in L:
            print('   ', ' | '.join(str(v) for v in z))

    n_ov = sum(len(p[3]) for p in plan if p[5])
    print('overrides de kit a poser : %d entrees' % n_ov)
    for t, fab, mod, annees, e, o in plan:
        if o:
            print('   ', t, '|', fab, '|', mod, '|', ','.join(annees), '|', json.dumps(o, ensure_ascii=False))
    if WRITE:
        touches = set()
        for t, fab, mod, annees, e, o in plan:
            for a in annees:
                db[t][fab].setdefault(a, {})[mod] = copy.deepcopy(e)
                if o:
                    ovs[t][t].setdefault(fab, {}).setdefault(a, {})[mod] = copy.deepcopy(o)
                    touches.add(t)
        json.dump(db, open(MJ, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        for t in sorted(touches):
            f = os.path.join(OV_DIR, SLUGS[t] + '.json')
            json.dump(ovs[t], open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('ecrit :', MJ, '+ overrides', sorted(touches))


if __name__ == '__main__':
    main()
