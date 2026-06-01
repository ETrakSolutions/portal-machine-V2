"""
Option B — Extrait les overrides (_bom / _notes) de machines.json vers un fichier
separe data/overrides.json (petit, ecrit rapidement par Apps Script), et retire
ces cles de machines.json (qui redevient : specs de base seulement).

Structure de overrides.json (miroir de machines.json) :
  { type: { fab: { annee: { modele: { "_bom": {...}, "_notes": "..." } } } } }

Idempotent : relancable.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
MACHINES = ROOT / "data" / "machines.json"
OVERRIDES = ROOT / "data" / "overrides.json"

with MACHINES.open(encoding="utf-8") as f:
    data = json.load(f)

overrides = {}
n_bom = n_notes = 0

for type_, by_fab in data.items():
    if not isinstance(by_fab, dict):
        continue
    for fab, by_year in by_fab.items():
        if not isinstance(by_year, dict):
            continue
        for year, by_model in by_year.items():
            if not isinstance(by_model, dict):
                continue
            for model, entry in by_model.items():
                if not isinstance(entry, dict):
                    continue
                ov = {}
                if "_bom" in entry:
                    ov["_bom"] = entry.pop("_bom")
                    n_bom += 1
                if "_notes" in entry:
                    ov["_notes"] = entry.pop("_notes")
                    n_notes += 1
                if ov:
                    overrides.setdefault(type_, {}).setdefault(fab, {}).setdefault(year, {})[model] = ov

with OVERRIDES.open("w", encoding="utf-8") as f:
    json.dump(overrides, f, ensure_ascii=False, indent=2)

with MACHINES.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"overrides.json ecrit : {n_bom} _bom, {n_notes} _notes")
print(f"machines.json : {MACHINES.stat().st_size:,} octets")
print(f"overrides.json: {OVERRIDES.stat().st_size:,} octets")
