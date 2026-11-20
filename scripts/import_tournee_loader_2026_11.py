# -*- coding: utf-8 -*-
"""Import de la tournee Loader du 2026-11-20 (chargeuses sur roues des marques jamais auditees).

Source : scripts/data/tournee_loader_2026-11/a_importer.json (sorties d'agents g1-g4, contre-verifiees
par contre_verif.py, specs converties par convertir.py). Classeur de decision :
C:\\Users\\jcaron\\CLAUDE_CODE\\Tournee_Loader_2026-11-20.xlsx (hors depot).

Decisions de Jacquot (2026-11-20) :
  - compactes incluses (Schaffer, Avant, Giant, HEVI, Vermeer, Weidemann Hoftrac) ;
  - annees : 2025-2026 seulement ; annee de lancement publiee par le fabricant -> depuis cette annee ;
  - Mecalac, Hidromek, Wolf America inclus avec une note sur la distribution NA.
Non importes : niveau C (non prouves) et anciennes generations sans annees prouvees
(Bobcat L85, Takeuchi TW80 Series 2, TW65 Series 2, TW40).

Ecrit data/machines.json (specs) et data/overrides/loader.json (notes seulement), en COMPACT.
Ne modifie aucune entree existante, sauf Weidemann 4060T 2024 dont les champs « A completer »
recoivent les specs du site Weidemann US. Le kit reste celui par defaut du type (0603 en option,
raccord de balance « a confirmer a la commande » ajoute par la soumission).

Usage : python scripts/import_tournee_loader_2026_11.py [--ecrire]   (sans --ecrire = a blanc)
"""
import json, sys, io, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
ECRIRE = '--ecrire' in sys.argv
SRC = 'scripts/data/tournee_loader_2026-11/a_importer.json'
DB, OV = 'data/machines.json', 'data/overrides/loader.json'
T = 'Loader'
NOMS_FAB = {'Avant Tecno': 'Avant'}
PAS_IMPORTES = {('Bobcat', 'L85'), ('Takeuchi', 'TW80 Series 2'), ('Takeuchi', 'TW65 Series 2'), ('Takeuchi', 'TW40')}
NOTE_DISTRIB = {
    'Mecalac': "Distribution nord-américaine à confirmer (site US = catalogue mondial).",
    'Hidromek': "Distribution nord-américaine à confirmer (Hidromek USA « Launching Soon » en nov. 2026).",
    'Wolf America': "Importateur américain (West Bend, WI) ; direction articulée et distribution à confirmer.",
}
ORDRE = ['Image', 'Capacite de levage', 'Gage port', 'Puissance moteur', 'Poids operationnel']


def nom_modele(fab, m):
    m = m.strip()
    if fab == 'Avant' and m.upper().startswith('AVANT '):
        m = m[6:].strip()
    return m


def annees(r):
    if r['statut'] == 'millesime':
        return [2025, 2026]
    lanc = r.get('annee_lancement')
    if lanc and 2015 <= int(lanc) <= 2026:
        return list(range(int(lanc), 2027))
    return [2025, 2026]


rows = json.load(open(SRC, encoding='utf-8'))
db = json.load(open(DB, encoding='utf-8'))
ov = json.load(open(OV, encoding='utf-8'))
L, OL = db[T], ov.setdefault(T, {})
ajouts, notes, completes, collisions, sautes = [], 0, [], [], []
for r in rows:
    if r['niv'] == 'C Non prouvé' or (r['fab'], r['modele']) in PAS_IMPORTES:
        sautes.append((r['fab'], r['modele'])); continue
    fab = NOMS_FAB.get(r['fab'], r['fab'])
    mod = nom_modele(fab, r['modele'])
    sp = dict(r['specs_portail'])
    for a in annees(r):
        y = str(a)
        ex = L.get(fab, {}).get(y, {}).get(mod)
        if ex is not None:
            collisions.append((fab, y, mod)); continue
        e = {'Image': ''}; e.update({k: sp[k] for k in ORDRE[1:]})
        L.setdefault(fab, {}).setdefault(y, {})[mod] = e
        ajouts.append((fab, y, mod))
        if fab in NOTE_DISTRIB:
            OL.setdefault(fab, {}).setdefault(y, {}).setdefault(mod, {})['_notes'] = NOTE_DISTRIB[fab]
            notes += 1
    # Weidemann 4060T 2024 existait avec tous ses champs « A completer »
    if fab == 'Weidemann' and mod == '4060T':
        e = L['Weidemann'].get('2024', {}).get('4060T')
        if e:
            for k in ORDRE[1:]:
                if e.get(k) in ('', 'A completer') and sp.get(k) not in (None, 'A completer'):
                    e[k] = sp[k]; completes.append(('Weidemann', '2024', '4060T', k, sp[k]))

c = collections.Counter(f for f, _, _ in ajouts)
print('A BLANC' if not ECRIRE else 'ECRITURE')
print('entrees ajoutees : %d  (modeles : %d)' % (len(ajouts), len({(f, m) for f, _, m in ajouts})))
for f, n in sorted(c.items()): print('   %-24s %d' % (f, n))
print('notes distribution :', notes)
print('champs completes sur entree existante :', completes)
print('collisions (deja en BD, non touchees) :', collisions)
print('non importes :', len(sautes))
if ECRIRE:
    with open(DB, 'w', encoding='utf-8', newline='') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
    with open(OV, 'w', encoding='utf-8', newline='') as f:
        json.dump(ov, f, ensure_ascii=False, separators=(',', ':'))
    print('ecrit :', DB, OV)
