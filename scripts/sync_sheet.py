"""
Synchronise Google Sheet Portal_DB_V2 -> data/machines.json.

Configuration via env vars (pour CI) ou defaults (pour local) :
  SERVICE_ACCOUNT_KEY_PATH : chemin vers la cle JSON
  SHEET_ID                  : ID de la Sheet Portal_DB_V2

Usage local (depuis racine du repo):
    python scripts/sync_sheet.py

Usage CI (GitHub Actions) : voir .github/workflows/sync-sheet.yml
"""
import io
import json
import os
import sys
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

# UTF-8 output for Windows compat
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", line_buffering=True)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_KEY = ROOT.parent / "Portail V2" / "secrets" / "portail-v2-bf474aeecdd4.json"
DEFAULT_SHEET_ID = "1yWs8tGu-dtiBdVSjfFdEh5Kxzd7HNarGebk50A5_zT0"

KEY_PATH = os.environ.get("SERVICE_ACCOUNT_KEY_PATH", str(DEFAULT_KEY))
SHEET_ID = os.environ.get("SHEET_ID", DEFAULT_SHEET_ID)
OUTPUT = ROOT / "data" / "machines.json"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

TAB_TO_TYPE = {
    "Excavatrice": "Excavatrice",
    "PompeBeton": "Pompe a Beton",
    "GrueMobile": "Grue Mobile",
    "BoomTruck": "Camion Girafe (Boom Truck)",
    "Telehandler": "Telehandler",
    "Foreuse": "Foreuse",
    "CamionVacuum": "Camion Vacuum",
    "Retrocaveuse": "Retrocaveuse",
}

ADMIN_COLS = {
    "Source BOM": "_source_bom",
    "Note Technicien": "_note_tech_texte",
    "Note Tech Auteur": "_note_tech_auteur",
    "Note Tech Date": "_note_tech_date",
    "Actif": "_actif",
    "Harnais": "_harnais",
}

import re

BOM_PATTERN = re.compile(r"^\d{4}\s")
RES_PATTERN = re.compile(r"^RES-\d+\s")


def is_bom_col(h):
    return bool(BOM_PATTERN.match(h) or RES_PATTERN.match(h))


def is_key_col(h):
    return h in ("Fabricant", "Annee", "Modele")


def sync():
    creds = Credentials.from_service_account_file(KEY_PATH, scopes=SCOPES)
    gc = gspread.authorize(creds)
    ss = gc.open_by_key(SHEET_ID)

    out = {}
    stats = {}

    for tab_name, type_name in TAB_TO_TYPE.items():
        try:
            ws = ss.worksheet(tab_name)
        except gspread.WorksheetNotFound:
            print(f"[skip] onglet '{tab_name}' introuvable", file=sys.stderr)
            continue
        rows = ws.get_all_values()
        if len(rows) < 2:
            continue
        headers = rows[0]
        data_rows = [r for r in rows[1:] if any(r)]

        type_data = {}
        for row in data_rows:
            row_dict = dict(zip(headers, row + [""] * (len(headers) - len(row))))
            fab = row_dict.get("Fabricant", "").strip()
            annee = row_dict.get("Annee", "").strip()
            modele = row_dict.get("Modele", "").strip()
            if not (fab and annee and modele):
                continue
            actif = row_dict.get("Actif", "Oui").strip()
            if actif.lower() == "non":
                continue

            specs = {}
            kit = {}
            for h in headers:
                if not h or is_key_col(h):
                    continue
                val = row_dict.get(h, "")
                if h in ADMIN_COLS:
                    specs[ADMIN_COLS[h]] = val
                elif is_bom_col(h):
                    kit[h] = val
                else:
                    specs[h] = val
            if kit:
                specs["_kit"] = kit

            type_data.setdefault(fab, {}).setdefault(annee, {})[modele] = specs

        out[type_name] = type_data
        n_models = sum(
            len(modeles)
            for fabs in type_data.values()
            for modeles in fabs.values()
        )
        stats[type_name] = n_models

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nSync OK -> {OUTPUT}")
    size_mb = OUTPUT.stat().st_size / 1024 / 1024
    print(f"   Taille : {size_mb:.2f} MB")
    print(f"\n   Modeles par type :")
    for t, n in stats.items():
        print(f"     {t:35s} : {n:5d}")
    print(f"   Total : {sum(stats.values())} modeles")


if __name__ == "__main__":
    sync()
