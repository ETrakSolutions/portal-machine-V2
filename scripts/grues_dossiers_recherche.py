# -*- coding: utf-8 -*-
"""Prepare un dossier de recherche par marque : liste des modeles, champs
manquants, annees couvertes et valeurs DEJA connues (capacite, et les autres
specs quand elles existent) qui serviront de garde-fou de vraisemblance.
"""
import json, os, sys, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
gm = json.load(open(os.path.join(ROOT, 'data', 'machines.json'), encoding='utf-8'))['Grue Mobile']
fam = {tuple(k.split('|', 1)): v for k, v in
       json.load(open(os.path.join(ROOT, 'scripts', 'data', 'grues_familles.json'),
                      encoding='utf-8')).items()}
travail = json.load(open(os.path.join(ROOT, 'scripts', 'data', 'grues_a_chercher.json'),
                         encoding='utf-8'))

OUT = os.path.join(ROOT, 'scripts', 'data', 'dossiers_grues')
os.makedirs(OUT, exist_ok=True)

total = 0
for marque, mods in sorted(travail.items()):
    lignes = []
    for mod, info in sorted(mods.items()):
        annees = sorted(y for y in gm[marque] if mod in gm[marque][y])
        ref = gm[marque][annees[0]][mod]
        connu = {k: v for k, v in ref.items()
                 if not k.startswith('_') and k not in ('Flag', 'Image')
                 and str(v or '').strip() and str(v).strip().lower() != 'a completer'}
        lignes.append({
            'modele': mod,
            'famille': fam[(marque, mod)],
            'annees': '%s-%s' % (annees[0], annees[-1]),
            'champs_manquants': info['champs'],
            'deja_connu': connu,
        })
        total += len(info['champs'])
    payload = {'marque': marque, 'nb_modeles': len(lignes),
               'nb_valeurs_a_trouver': sum(len(l['champs_manquants']) for l in lignes),
               'modeles': lignes}
    p = os.path.join(OUT, '%s.json' % marque.replace(' ', '_').replace('(', '').replace(')', ''))
    json.dump(payload, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('%-22s %3d modeles, %3d valeurs -> %s'
          % (marque, len(lignes), payload['nb_valeurs_a_trouver'], os.path.basename(p)))
print('\nTOTAL : %d valeurs a chercher' % total)
