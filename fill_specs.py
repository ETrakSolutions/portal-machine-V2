import json

filepath = "C:/Users/ryb086/OneDrive - Groupe R.Y. Beaudoin/Bureau/CLAUDE_CODE/portal-machine/data/machines.json"

with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

excavatrice = data["Excavatrice"]

# --- KOMATSU specs ---
komatsu_specs = {
    "PC18MR": {"kw": 10.5, "hp": 14, "classe": "Mini", "poids_kg": 1820, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Oui"},
    "PC26MR": {"kw": 15.4, "hp": 21, "classe": "Mini", "poids_kg": 2680, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Oui"},
    "PC30MR": {"kw": 17.4, "hp": 23, "classe": "Mini", "poids_kg": 3070, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Non"},
    "PC35MR": {"kw": 20.4, "hp": 27, "classe": "Mini", "poids_kg": 3650, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Non"},
    "PC45MR": {"kw": 25.3, "hp": 34, "classe": "Mini", "poids_kg": 4540, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Non"},
    "PC55MR": {"kw": 28.6, "hp": 38, "classe": "Standard", "poids_kg": 5350, "voltage": "12V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC78US": {"kw": 38, "hp": 51, "classe": "Standard", "poids_kg": 7800, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC88MR": {"kw": 42, "hp": 56, "classe": "Standard", "poids_kg": 8400, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC130": {"kw": 69, "hp": 93, "classe": "Standard", "poids_kg": 13200, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC138USLC": {"kw": 69, "hp": 93, "classe": "Standard", "poids_kg": 14100, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC170LC": {"kw": 83, "hp": 111, "classe": "Standard", "poids_kg": 17800, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC210LC": {"kw": 114, "hp": 153, "classe": "270", "poids_kg": 22300, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC240LC": {"kw": 132, "hp": 177, "classe": "270", "poids_kg": 25700, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC290LC": {"kw": 159, "hp": 213, "classe": "270", "poids_kg": 29600, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC360LC": {"kw": 198, "hp": 266, "classe": "300", "poids_kg": 36200, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC390LC": {"kw": 209, "hp": 280, "classe": "300", "poids_kg": 39800, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "PC490LC": {"kw": 270, "hp": 362, "classe": "400", "poids_kg": 49500, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
}

# --- JOHN DEERE specs ---
jd_specs = {
    "17": {"kw": 10.2, "hp": 14, "classe": "Mini", "poids_kg": 1680, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Oui"},
    "26": {"kw": 13.2, "hp": 18, "classe": "Mini", "poids_kg": 2580, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Oui"},
    "30": {"kw": 14.2, "hp": 19, "classe": "Mini", "poids_kg": 2920, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Non"},
    "35": {"kw": 18.5, "hp": 25, "classe": "Mini", "poids_kg": 3560, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Non"},
    "50": {"kw": 28.6, "hp": 38, "classe": "Mini", "poids_kg": 4990, "voltage": "12V DC", "boom": "Boom 1 partie", "swing": "Non"},
    "60": {"kw": 33.6, "hp": 45, "classe": "Standard", "poids_kg": 6070, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "75": {"kw": 38.2, "hp": 51, "classe": "Standard", "poids_kg": 7600, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "85": {"kw": 41.1, "hp": 55, "classe": "Standard", "poids_kg": 8400, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "130": {"kw": 69, "hp": 93, "classe": "Standard", "poids_kg": 13000, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "160": {"kw": 83, "hp": 111, "classe": "Standard", "poids_kg": 17300, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "200": {"kw": 114, "hp": 153, "classe": "270", "poids_kg": 22000, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "210": {"kw": 114, "hp": 153, "classe": "270", "poids_kg": 22000, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "245": {"kw": 131, "hp": 176, "classe": "270", "poids_kg": 25200, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "300": {"kw": 159, "hp": 213, "classe": "300", "poids_kg": 30000, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "345": {"kw": 198, "hp": 266, "classe": "300", "poids_kg": 35000, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "380": {"kw": 209, "hp": 280, "classe": "300", "poids_kg": 38000, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
    "470": {"kw": 270, "hp": 362, "classe": "400", "poids_kg": 47600, "voltage": "24V DC", "boom": "Boom 2 parties", "swing": "Non"},
}

skip_models = ["Mini / Compactes", "Petites / Moyennes", "Hybrides / ICT"]


def kg_to_lbs(kg):
    return round(kg * 2.20462)


def needs_update(model_data):
    """Check if model has incomplete specs"""
    pw = model_data.get("Puissance moteur (kW / HP)", "")
    if pw.startswith("0 kW") or pw == "A completer":
        return True
    for v in model_data.values():
        if v == "A completer":
            return True
    return False


def match_komatsu(model_name, specs):
    """Try to match a Komatsu model name to specs"""
    for pattern, spec in specs.items():
        # Direct prefix match: "PC170LC-10 / -11" starts with "PC170LC"
        if model_name.startswith(pattern):
            return spec
        # Handle slash variants like "PC210LC-10 / -11"
        base_model = model_name.split(" /")[0].strip()
        if base_model.startswith(pattern):
            return spec
    return None


def match_jd(model_name, specs):
    """Try to match a John Deere model name to specs"""
    if model_name in skip_models:
        return None

    # Extract numeric prefix: "17D / 17G / 17P" -> "17", "130G / 130P" -> "130"
    # "200G" -> "200", "210G LC" -> "210", "245G LC" -> "245"
    first_part = model_name.split("/")[0].strip().split(" ")[0]
    num = ""
    for ch in first_part:
        if ch.isdigit():
            num += ch
        else:
            break

    if num in specs:
        return specs[num]
    return None


def apply_specs(model_data, spec):
    """Apply specs to a model, preserving existing good values"""
    poids_lbs = kg_to_lbs(spec["poids_kg"])

    updates = {
        "Puissance moteur (kW / HP)": f"{spec['kw']} kW / {spec['hp']} HP",
        "Type de traction": "Chenille",
        "Type de boom": spec["boom"],
        "Swing boom": spec["swing"],
        "Voltage machine (V/type)": spec["voltage"],
        "Poids operationnel (kg / lbs)": f"{spec['poids_kg']} kg / {poids_lbs} lbs",
        "Classe machine": spec["classe"],
    }

    for key, val in updates.items():
        current = model_data.get(key, "")
        if current in ("A completer", "0 kW / 0 HP", "0 kg / 0 lbs") or current.startswith("0 kW"):
            model_data[key] = val
        # Also update Classe if it was "Standard" and we have a better value
        if key == "Classe machine" and current == "Standard" and val != "Standard":
            model_data[key] = val

    # Set remaining A completer fields to N/D
    for key in ["Longueur de fleche (m / pi)", "Longueur de stick (m / pi)",
                 "Capacite max de levage (kg / lbs)"]:
        if model_data.get(key) == "A completer":
            model_data[key] = "N/D"


updated_komatsu = 0
updated_jd = 0

# Process Komatsu
if "Komatsu" in excavatrice:
    for year in sorted(excavatrice["Komatsu"].keys()):
        models = excavatrice["Komatsu"][year]
        for model_name in sorted(models.keys()):
            model_data = models[model_name]
            if model_name in skip_models:
                continue
            if not needs_update(model_data):
                continue
            spec = match_komatsu(model_name, komatsu_specs)
            if spec:
                apply_specs(model_data, spec)
                updated_komatsu += 1
                print(f"  Komatsu {year} / {model_name} -> updated")
            else:
                print(f"  Komatsu {year} / {model_name} -> NO MATCH (skipped)")

# Process John Deere (Excavatrice only, ID 212 check not needed, just key name)
if "John Deere" in excavatrice:
    for year in sorted(excavatrice["John Deere"].keys()):
        models = excavatrice["John Deere"][year]
        for model_name in sorted(models.keys()):
            model_data = models[model_name]
            if model_name in skip_models:
                continue
            if not needs_update(model_data):
                continue
            spec = match_jd(model_name, jd_specs)
            if spec:
                apply_specs(model_data, spec)
                updated_jd += 1
                print(f"  JD {year} / {model_name} -> updated")
            else:
                print(f"  JD {year} / {model_name} -> NO MATCH (skipped)")

print(f"\nTotal Komatsu models updated: {updated_komatsu}")
print(f"Total John Deere models updated: {updated_jd}")
print(f"Grand total: {updated_komatsu + updated_jd}")

with open(filepath, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("File saved successfully.")
