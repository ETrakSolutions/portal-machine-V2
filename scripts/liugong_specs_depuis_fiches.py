# -*- coding: utf-8 -*-
"""Remplit les specs LiuGong a partir des fiches techniques officielles restees
a la racine du depot depuis l'audit du 2026-07-01.

Sur les 7 « PDF » presents, 4 sont en realite des pages Cloudflare « Just a
moment... » (telechargements bloques par liugongna.com) et ne contiennent aucune
donnee : 936e, 936f, 950e, 952f. Les 3 vrais PDF sont 920e, 925e et 933e — ce
dernier etant une brochure COMBINEE 933E/936E, il couvre aussi le 936E dont le
telechargement avait echoue.

Conventions retenues :
  * Puissance = puissance NETTE. Verifie sur un temoin : la BD porte
    « 122.0 kW / 164.0 HP » pour le Hitachi ZX210LC-6, soit exactement la
    puissance nette publiee par Hitachi.
  * Fleche et bras = configuration STANDARD (premiere option listee), pas les
    versions longue portee.
  * Capacite max de levage = « N/D » : LiuGong ne publie pas de valeur unique,
    seulement des tableaux de charge par rayon et hauteur. « N/D » est deja la
    valeur la plus frequente de ce champ en BD (1857 entrees).

Usage : python scripts/liugong_specs_depuis_fiches.py [--write]
"""
import json, os, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
WRITE = '--write' in sys.argv

# modele : (kW net, HP net, fleche mm, bras mm, poids annonce par la fiche, source)
FICHES = {
    '920E': (102, 137, 5710, 2915, '21500-22070 kg', '920e.pdf p1/p8/p9'),
    '925E': (132, 177, 6000, 2980, '25500-28200 kg', '925e.pdf p1/p8/p9'),
    '933E': (152, 207, 6200, 3050, '31800-32900 kg', '933e.pdf p4/p8/p9'),
    '936E': (174, 236, 6400, 3200, '37000 kg',       '933e.pdf p4/p8/p9 (brochure combinee 933E/936E)'),
}


def pieds(m):
    """2.915 -> 9'07\"  (convention de la BD : pieds'pouces sur 2 chiffres)."""
    total = m * 3.280839895
    ft = int(total)
    inch = round((total - ft) * 12)
    if inch == 12:
        ft, inch = ft + 1, 0
    return '%d\'%02d"' % (ft, inch)


db = json.load(open(MJ, encoding='utf-8'))
lg = db['Excavatrice']['LiuGong']

print('=== PLAN (%s) ===' % ('ECRITURE' if WRITE else 'SIMULATION'))
ecarts = []
n = 0
for mod, (kw, hp, boom, arm, poids_fiche, src) in FICHES.items():
    annees = sorted(y for y in lg if mod in lg[y])
    if not annees:
        print('  %-6s ABSENT de la BD' % mod)
        continue
    ref = lg[annees[0]][mod]
    valeurs = {
        'Puissance moteur (kW / HP)': '%d kW / %d HP' % (kw, hp),
        'Longueur de fleche (m / pi)': '%.2f m / %s' % (boom / 1000.0, pieds(boom / 1000.0)),
        'Longueur de stick (m / pi)': '%.2f m / %s' % (arm / 1000.0, pieds(arm / 1000.0)),
        'Capacite max de levage (kg / lbs)': 'N/D',
    }
    print('  %-6s %s-%s  (%s)' % (mod, annees[0], annees[-1], src))
    for k, v in valeurs.items():
        actuel = str(ref.get(k) or '').strip()
        etat = 'vide -> %s' % v if not actuel else ('inchange (%s)' % actuel if actuel == v
                                                    else 'DEJA RENSEIGNE %r, non touche' % actuel)
        print('       %-38s %s' % (k, etat))

    # controle croise du poids deja en base contre celui de la fiche
    poids_bd = str(ref.get('Poids operationnel (kg / lbs)') or '')
    kg_bd = int(''.join(c for c in poids_bd.split('kg')[0] if c.isdigit()) or 0)
    kg_fiche = int(''.join(c for c in poids_fiche.split('-')[0] if c.isdigit()) or 0)
    accord = abs(kg_bd - kg_fiche) <= max(200, kg_fiche * 0.03)
    print('       poids : BD %s | fiche %s -> %s'
          % (poids_bd, poids_fiche, 'concorde' if accord else '*** ECART ***'))
    if not accord:
        ecarts.append((mod, poids_bd, poids_fiche))

    if WRITE:
        for y in annees:
            e = lg[y].get(mod)
            if not isinstance(e, dict):
                continue
            for k, v in valeurs.items():
                if not str(e.get(k) or '').strip():
                    e[k] = v
                    n += 1

if ecarts:
    print('\n=== ECARTS DE POIDS (non corriges ici) ===')
    for mod, bd, fiche in ecarts:
        print('   %-6s BD %-22s fiche constructeur %s' % (mod, bd, fiche))

if WRITE:
    with open(MJ, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, separators=(',', ':'))
    print('\nECRIT : %d valeurs' % n)
else:
    print('\n(simulation — relancer avec --write)')
