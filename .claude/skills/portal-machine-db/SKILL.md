---
name: portal-machine-db
description: "Gestion complete de la base de donnees Portal Machine e-Trak: ajouter/completer des modeles de machines, gerer les regles BOM (drain, multi axes, swing boom, harnais), mettre a jour les DRAIN_PREFIXES, et deployer sur GitHub Pages. Utilise ce skill des que l'utilisateur mentionne: ajouter modele, machine manquante, completer specs, drain hydraulique, BOM, harnais, jeton rouge/jaune, DRAIN_PREFIXES, machines.json, database.html, ou toute modification a la base de donnees machines du portail e-Trak. Aussi pour: 'il manque [fabricant]', 'ajoute [modele]', 'specs incompletes', 'drain obligatoire pour [machine]', 'verifier les BOM', 'pousser sur github'. Ce skill couvre TOUS les types de machines: Excavatrice, Grue Mobile, Pompe a Beton, Camion Girafe, Telehandler, Camion Vacuum, Retrocaveuse, Foreuse."
---

# Portal Machine DB — Skill de gestion

## Projet

Chemin: `C:\Users\ryb086\OneDrive - Groupe R.Y. Beaudoin\Bureau\CLAUDE_CODE\portal-machine`

Le portail est un **viewer** (lecture seule). La **base de donnees** (database.html) est maitre pour les modifications.

## Fichiers cles

| Fichier | Role |
|---------|------|
| `data/machines.json` | BD principale (~5 MB, 130K lignes) |
| `database.html` | Interface admin BD + logique BOM |
| `js/app.js` | Logique portail machine (viewer) |
| `machine.html` | Page portail vue machine |
| `soumission.html` | Page demande de soumission |
| `js/soumission.js` | Logique courriel soumission |

## Structure de machines.json

```
{
  "Excavatrice": {
    "Caterpillar": {
      "2024": {
        "320": {
          "Image": "",
          "Puissance moteur (kW / HP)": "119 kW / 160 HP",
          "Type de traction": "Chenille",
          "Type de boom": "Boom 1 partie",
          "Longueur de fleche (m / pi)": "5.2 m / 17'01\"",
          "Longueur de stick (m / pi)": "2.6 m / 8'06\"",
          "Swing boom": "Non",
          "Voltage machine (V/type)": "24V DC",
          "Capacite max de levage (kg / lbs)": "9000 kg / 19841 lbs",
          "Poids operationnel (kg / lbs)": "21773 kg / 48000 lbs",
          "Classe machine": "200"
        }
      }
    }
  }
}
```

Niveaux: `Type > Fabricant > Annee > Modele > Specs`

## Types de machines (8)

Excavatrice, Pompe a Beton, Camion Girafe (Boom Truck), Telehandler, Camion Vacuum, Retrocaveuse, Foreuse, Grue Mobile

---

## TACHE 1 — Ajouter des modeles

### Workflow

1. **Identifier les modeles manquants** — lister ce qui existe vs ce qui est demande
2. **Rechercher les specs** sur le web (ritchiespecs.com, lectura-specs.com, sites fabricants)
3. **Ecrire un script Python** pour ajouter les entrees (OneDrive bloque parfois Edit/Write direct sur le JSON)
4. **Executer le script** et verifier le nombre d'entrees ajoutees
5. **Nettoyer** le script (rm) apres execution

### Format specs obligatoire (Excavatrice)

```json
{
  "Image": "",
  "Puissance moteur (kW / HP)": "xxx kW / xxx HP",
  "Type de traction": "Chenille",
  "Type de boom": "Boom 1 partie",
  "Longueur de fleche (m / pi)": "x.x m / xx'xx\"",
  "Longueur de stick (m / pi)": "x.x m / x'xx\"",
  "Swing boom": "Oui",
  "Voltage machine (V/type)": "24V DC",
  "Capacite max de levage (kg / lbs)": "xxxx kg / xxxx lbs",
  "Poids operationnel (kg / lbs)": "xxxxx kg / xxxxx lbs",
  "Classe machine": "270"
}
```

### Regles specs

- **Traction**: "Chenille" pour chenilles, "Roue" pour pneus (A-series Liebherr, WX Case, DX...W Doosan, EW Wacker Neuson)
- **Boom**: "Boom 2 parties (articule)" pour les excavatrices a roues
- **Voltage**: "12V DC" si poids < 5 tonnes, "24V DC" si >= 5 tonnes
- **Classe machine**: Mini, Compact, 120, 200, 270, 300, 400, 500, 700-800, 1000+

### Script Python type

```python
import json, os

path = os.path.join(os.path.dirname(__file__), 'data', 'machines.json')
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

fab = data['Excavatrice']['NouveauFabricant'] = data['Excavatrice'].get('NouveauFabricant', {})

new_models = {
    "ModeleA": {
        "years": ["2022","2023","2024","2025","2026"],
        "specs": { ... }
    }
}

added = 0
for model_name, info in new_models.items():
    for year in info["years"]:
        if year not in fab:
            fab[year] = {}
        if model_name not in fab[year]:
            fab[year][model_name] = info["specs"].copy()
            added += 1

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"Total ajoute: {added}")
```

---

## TACHE 2 — Completer les specs manquantes

### Identifier les incomplets

```python
import json
with open('data/machines.json','r',encoding='utf-8') as f:
    data = json.load(f)
exc = data['Excavatrice']
for fab in sorted(exc.keys()):
    incomplete = 0
    total = 0
    for y in exc[fab]:
        for m, specs in exc[fab][y].items():
            total += 1
            poids = specs.get('Poids operationnel (kg / lbs)','')
            if 'A completer' in poids or poids == '0 kg / 0 lbs' or poids == '':
                incomplete += 1
    if incomplete > 0:
        print(f'{fab}: {total} total, {incomplete} incomplets')
```

### Workflow

1. Lister les modeles incomplets par fabricant
2. Lancer des agents de recherche en parallele (1 par fabricant, max 4)
3. Ecrire un script Python `update_specs.py` avec une fonction `update_weight(brand, model, kw, hp, kg, lbs)`
4. Executer et verifier "0 incomplets" pour chaque fabricant
5. Supprimer le script apres execution

---

## TACHE 3 — Gerer les DRAIN_PREFIXES

Le drain hydraulique (code BOM `0009`) est **obligatoire** (rouge) pour certaines machines. La liste est dans `DRAIN_PREFIXES` — un tableau de prefixes de modeles. Si le nom du modele commence par un prefixe, drain = rouge.

### Les DRAIN_PREFIXES existent dans DEUX fichiers

1. `database.html` (lignes ~679-706)
2. `js/app.js` (lignes ~445-459)

**Les deux fichiers DOIVENT rester synchronises.**

### Pour ajouter un drain obligatoire

1. Verifier si le modele est deja couvert par un prefixe existant
2. Trouver le prefixe minimum qui couvre le modele sans toucher d'autres modeles
3. Ajouter dans les DEUX fichiers, dans la section du bon fabricant
4. Attention aux espaces dans les noms Link-Belt: `'145 X4'` ET `'145X4'` (les deux variantes)

### Regles drain

- Drain = `'r'` (rouge/obligatoire) OU `'na'` (pas affiche)
- **JAMAIS jaune** — le code bloque: `if (bomDefaults['0009'] === 'j') bomDefaults['0009'] = 'r';`

---

## TACHE 4 — Regles BOM

### Codes BOM Excavatrice

| Code | Nom | Regle par defaut |
|------|-----|-----------------|
| `0000` | Cabine | Toujours rouge (obligatoire) |
| `0001` | Hauteur | Toujours jaune (optionnel) |
| `0002` | Rotation | Toujours jaune (optionnel) |
| `0004` | Mini exc | Rouge si poids < 5000kg, sinon N/A |
| `0005` | Multi Axes | Toujours jaune (optionnel) |
| `0008` | Swing boom | Jaune si Swing boom = "Oui", sinon N/A |
| `0009` | Drain hyd | Rouge si DRAIN_PREFIX match, sinon N/A. **JAMAIS jaune.** |
| `0070` | Boite GC | N/A par defaut (admin met manuellement) |
| `0304` | Cremaillere | Rouge seulement si modele = "TB216", sinon N/A |

### Codes BOM Pompe a Beton

| Code | Nom | Regle |
|------|-----|-------|
| `0200` | Avec coffre | N/A par defaut |
| `0203` | Sans coffre | N/A par defaut |
| `0201` | Hauteur | Jaune (optionnel) |
| `0202` | Rotation | Jaune (optionnel) |
| `0204-0206` | Sections (4/5/6) | Rouge si nombre sections >= X |
| `0207-0209` | Divers | N/A par defaut |

### Harnais de coupure par fabricant

| Fabricant | Code harnais | Label |
|-----------|-------------|-------|
| Hitachi (-5/-6) + John Deere | H0031 / Z03B-0031 | Hit5/6-JD |
| Komatsu | H0032 / Z03B-0032 | Komatsu |
| Doosan / Develon | H0033 / Z03B-0033 | Doosan |
| Volvo | H0034 / Z03B-0034 | Volvo |
| Link-Belt / Case | H0041 / Z03B-0041 | LB-Case |
| Caterpillar | H0080 / Z03B-0080 | Cat |
| Caterpillar (ECU) | H0100 / Z03B-0100 | Cat(ECU) |
| Hitachi (-7) | H0121 / Z03B-0121 | Hit-7 |
| Autres (generique) | H0043 / Z03B-0043 | Generic |

---

## TACHE 5 — Cache busting

Apres toute modification de fichiers HTML/JS/CSS, incrementer le parametre `?v=` dans les balises `<link>` et `<script>` des fichiers modifies.

```bash
# Trouver la version actuelle
grep "?v=" database.html | head -1
# Remplacer (via Edit tool, replace_all=true)
# ?v=142 → ?v=143
```

Fichiers concernes:
- `database.html` — CSS + JS inline
- `machine.html` — CSS + app.js
- `index.html` — CSS + admin.js
- `soumission.html` — CSS + soumission.js

---

## TACHE 6 — Git commit et push

### Workflow standard

```bash
cd "C:\Users\ryb086\OneDrive - Groupe R.Y. Beaudoin\Bureau\CLAUDE_CODE\portal-machine"
git add <fichiers modifies>
git commit -m "$(cat <<'EOF'
Description du changement

Details...

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

### Si worktree actif

```bash
# Commit dans le worktree
cd ".claude/worktrees/flamboyant-moser"
git add <fichiers>
git commit -m "..."
# Merger dans main
cd "C:\Users\ryb086\OneDrive - Groupe R.Y. Beaudoin\Bureau\CLAUDE_CODE\portal-machine"
git checkout main
git merge claude/flamboyant-moser --no-edit
git push origin main
```

Le site se deploie automatiquement sur GitHub Pages apres push sur main.

---

## Verification post-deploiement

Apres un push, verifier sur le site live:
- URL: `https://etraksolutions.github.io/portal-machine/`
- Database: `https://etraksolutions.github.io/portal-machine/database.html`
- Machine: `https://etraksolutions.github.io/portal-machine/machine.html`

Utiliser le preview server ou Chrome MCP pour tester:
1. Selectionner Type > Fabricant > Modele
2. Verifier que les specs s'affichent
3. Verifier que les jetons BOM sont corrects (rouge/jaune/N/A)
4. Verifier le harnais de coupure
5. Verifier le drain hydraulique
