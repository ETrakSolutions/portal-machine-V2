# -*- coding: utf-8 -*-
"""Resout un conflit sur data/machines.json au niveau JSON, pas au niveau texte.

Le fichier est sur une seule ligne : git le declare en conflit total des que
deux sessions y touchent, meme sur des types de machine differents. Ce script
reconstruit le fichier en prenant la version AMONT comme base et en y injectant
uniquement les types que le commit rejoue a modifies.

A lancer pendant un rebase, quand data/machines.json est en « UU » :
    python scripts/resoudre_conflit_machines_json.py "Grue Mobile"
    git add data/machines.json && git rebase --continue

Refuse de travailler si le commit rejoue a modifie un type non declare.
"""
import json, os, subprocess, sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
TYPES = sys.argv[1:]
if not TYPES:
    sys.exit('usage : resoudre_conflit_machines_json.py "<Type>" ["<Type>" ...]')


def etage(n):
    """Contenu d'un etage de l'index : 1=ancetre, 2=amont (ours), 3=rejoue (theirs)."""
    r = subprocess.run(['git', 'show', ':%d:data/machines.json' % n],
                       capture_output=True, cwd=ROOT)
    if r.returncode != 0:
        sys.exit('impossible de lire l etage %d : %s' % (n, r.stderr.decode()[:200]))
    return json.loads(r.stdout.decode('utf-8'))


ancetre, amont, rejoue = etage(1), etage(2), etage(3)

# Controle : le commit rejoue ne doit avoir touche QUE les types declares
touches = [t for t in set(list(rejoue) + list(ancetre))
           if json.dumps(rejoue.get(t), sort_keys=True) != json.dumps(ancetre.get(t), sort_keys=True)]
print('types modifies par le commit rejoue :', touches)
imprevus = [t for t in touches if t not in TYPES]
if imprevus:
    sys.exit('ARRET : le commit touche aussi %s, non declare. Resolution manuelle.' % imprevus)

# Controle : l amont ne doit pas avoir touche les memes types
conflit_reel = [t for t in TYPES
                if json.dumps(amont.get(t), sort_keys=True) != json.dumps(ancetre.get(t), sort_keys=True)]
if conflit_reel:
    sys.exit('ARRET : l amont a aussi modifie %s — vrai conflit, resolution manuelle.' % conflit_reel)

fusion = amont
for t in TYPES:
    fusion[t] = rejoue[t]
with open(MJ, 'w', encoding='utf-8') as f:
    json.dump(fusion, f, ensure_ascii=False, separators=(',', ':'))

print('fusion ecrite : base = amont, %s = version du commit rejoue' % ', '.join(TYPES))
for t in sorted(fusion):
    n = sum(1 for fab in fusion[t] if not fab.startswith('_')
            for y in fusion[t][fab] for _m in fusion[t][fab][y])
    print('   %-30s %6d entrees' % (t, n))
