"""Rend un apercu visuel des onglets cles en PNG."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from export_to_excel import (
    load_machines, collect_specs_rows,
    EXC_BOM_CODES, EXC_BOM_NAMES, EXC_OPT_CODES, RESERVE_COLS,
)
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent.parent


def get_font(size, bold=False, italic=False):
    win_fonts = "C:/Windows/Fonts"
    if italic and bold:
        fname = "calibriz.ttf"
    elif italic:
        fname = "calibrii.ttf"
    elif bold:
        fname = "calibrib.ttf"
    else:
        fname = "calibri.ttf"
    try:
        return ImageFont.truetype(f"{win_fonts}/{fname}", size)
    except Exception:
        return ImageFont.load_default()


def cell_color(val, col_name):
    head = col_name.split(" ", 1)[0]
    is_kit = head.isdigit() or head.startswith("RES-")
    if not is_kit:
        return None, None
    if val == "R":
        return (254, 202, 202), (153, 27, 27)
    if val == "J":
        return (254, 243, 199), (146, 64, 14)
    if val == "NA":
        return (243, 244, 246), (156, 163, 175)
    return (250, 250, 250), (153, 153, 153)


def col_width(c):
    head = c.split(" ", 1)[0]
    is_kit = head.isdigit() or head.startswith("RES-")
    if c == "Fabricant": return 95
    if c in ("Annee", "Modele"): return 70
    if is_kit: return 78
    if c == "Note Technicien": return 160
    if c == "Note Tech Auteur": return 110
    if c == "Note Tech Date": return 85
    if c == "Harnais": return 230
    if c == "Source BOM": return 75
    if c == "Image": return 45
    if c == "Actif": return 55
    return 110


def render_excavatrice():
    data = load_machines()
    cols, rows = collect_specs_rows(data, "Excavatrice")
    sample = []
    fabs_wanted = [("Caterpillar", 3), ("Hitachi", 3), ("Takeuchi", 2), ("Volvo CE", 2), ("Komatsu", 2)]
    for fab, n in fabs_wanted:
        added = 0
        for r in rows:
            if r["Fabricant"] == fab and added < n:
                sample.append(r); added += 1

    widths = [col_width(c) for c in cols]
    cell_h = 28
    header_h = 64
    pad_x = 5
    title_h = 60
    total_w = sum(widths) + 40
    total_h = title_h + header_h + cell_h * len(sample) + 40

    img = Image.new("RGB", (total_w, total_h), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    f_header = get_font(11, bold=True)
    f_cell = get_font(11)
    f_kit = get_font(13, bold=True)
    f_title = get_font(17, bold=True)
    f_sub = get_font(11)

    draw.text((20, 12), "Onglet Excavatrice (v11) — apercu", font=f_title, fill=(31, 42, 55))
    draw.text((20, 36), "Cles bleues | Specs | Kits BOM (R/J/NA) | RES-1..5 | Harnais (code+desc) | Notes Tech | Actif",
              font=f_sub, fill=(80, 80, 80))

    y = title_h
    x = 20
    header_bg = (31, 42, 55)
    for i, c in enumerate(cols):
        w = widths[i]
        draw.rectangle([x, y, x + w, y + header_h], fill=header_bg)
        draw.rectangle([x, y, x + w, y + header_h], outline=(209, 213, 219))
        if " " in c and len(c) > 13:
            parts = c.split(" ", 1)
            draw.text((x + pad_x, y + 10), parts[0], font=f_header, fill=(255, 255, 255))
            tail = parts[1][:int(w / 7)]
            draw.text((x + pad_x, y + 32), tail, font=f_header, fill=(220, 220, 220))
        else:
            draw.text((x + pad_x, y + 22), c, font=f_header, fill=(255, 255, 255))
        x += w
    y += header_h

    for ri, row in enumerate(sample):
        x = 20
        zebra = ri % 2 == 1
        for ci, c in enumerate(cols):
            w = widths[ci]
            v = row.get(c, "")
            bg = (255, 255, 255)
            fg = (40, 40, 40)
            kit_bg, kit_fg = cell_color(v, c)
            if ci < 3:
                bg = (219, 234, 254)
            elif kit_bg is not None:
                bg = kit_bg
                fg = kit_fg
            elif c == "Actif":
                if v == "Non":
                    bg = (254, 202, 202); fg = (153, 27, 27)
            elif zebra:
                bg = (243, 244, 246)
            draw.rectangle([x, y, x + w, y + cell_h], fill=bg)
            draw.rectangle([x, y, x + w, y + cell_h], outline=(209, 213, 219))
            if v == "R" or v == "J":
                draw.text((x + w // 2 - 4, y + 7), v, font=f_kit, fill=fg)
            elif v == "NA":
                draw.text((x + w // 2 - 9, y + 8), v, font=f_cell, fill=fg)
            elif c == "Actif":
                draw.text((x + w // 2 - 9, y + 8), v, font=get_font(11, bold=True), fill=fg)
            else:
                txt = str(v)[:int(w / 6.5)]
                draw.text((x + pad_x, y + 8), txt, font=f_cell, fill=fg)
            x += w
        y += cell_h

    out = ROOT / "data" / "_preview_v11_exc.png"
    img.save(out, "PNG", optimize=True)
    return out


def render_listes():
    """Rend l'onglet _Listes."""
    lists = {
        "Severite": [("info", "Bandeau bleu"), ("warning", "Bandeau jaune"), ("danger", "Bandeau rouge")],
        "Trigger_Type": [("always", "Toujours"), ("single", "Si CE kit"), ("all_of", "Si TOUS"), ("any_of", "Si AU MOINS UN"), ("none_of", "Si AUCUN")],
        "Roles": [("super_admin", "Tous droits"), ("administrateur", "Admin"), ("vente_interne", "Vente"), ("technicien", "Tech"), ("ingenierie", "Ing"), ("distributeur", "Dist"), ("dealer", "Dealer")],
        "Source_BOM": [("Defaut", "Calcule"), ("Manuel", "Modifie"), ("Override", "Admin")],
        "Statut_Demande": [("Nouveau", "Recu"), ("En cours", "En traitement"), ("Complete", "Specs OK"), ("Rejete", "Rejete")],
        "Oui_Non": [("Oui", ""), ("Non", "")],
        "Options_Soumission": [
            ("1300-0001 - Camera Recul", "Camera recul"),
            ("1300-0003 - Camera Quad", "Camera 4 vues"),
            ("1300-0004 - Camera 360", "Panoramique 360"),
            ("1000-0004 - IDC Lock Valve", "Indicateur charge"),
            ("1500-0006 - Limiteur Creusage", "Limiteur creusage"),
        ],
    }
    n_lists = len(lists)
    col_w = 220
    desc_w = 200
    total_w = (col_w + desc_w + 15) * n_lists + 40
    max_items = max(len(v) for v in lists.values())
    title_h = 60
    header_h = 36
    cell_h = 28
    total_h = title_h + header_h + (max_items + 5) * cell_h + 40

    img = Image.new("RGB", (total_w, total_h), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    f_header = get_font(12, bold=True)
    f_cell = get_font(11)
    f_title = get_font(17, bold=True)
    f_sub = get_font(11)

    draw.text((20, 12), "Onglet _Listes (v11) — gestion des menus deroulants",
              font=f_title, fill=(31, 42, 55))
    draw.text((20, 36), "Ajouter une valeur = ajouter une ligne. Les onglets references detectent automatiquement.",
              font=f_sub, fill=(80, 80, 80))

    x = 20
    y = title_h
    for list_name, items in lists.items():
        # Header
        draw.rectangle([x, y, x + col_w, y + header_h], fill=(31, 42, 55))
        draw.text((x + 8, y + 10), list_name, font=f_header, fill=(255, 255, 255))
        draw.rectangle([x + col_w, y, x + col_w + desc_w, y + header_h], fill=(31, 42, 55))
        draw.text((x + col_w + 8, y + 10), "Description", font=f_header, fill=(255, 255, 255))

        cy = y + header_h
        # Highlight Options_Soumission (nouveau)
        is_new = list_name == "Options_Soumission"
        for ri, (val, desc) in enumerate(items):
            zebra = ri % 2 == 1
            bg = (220, 252, 231) if is_new else ((243, 244, 246) if zebra else (255, 255, 255))
            draw.rectangle([x, cy, x + col_w, cy + cell_h], fill=bg, outline=(209, 213, 219))
            draw.text((x + 6, cy + 7), val, font=get_font(11, bold=True), fill=(40, 40, 40))
            draw.rectangle([x + col_w, cy, x + col_w + desc_w, cy + cell_h],
                           fill=(243, 244, 246), outline=(209, 213, 219))
            draw.text((x + col_w + 6, cy + 7), desc, font=f_cell, fill=(80, 80, 80))
            cy += cell_h
        # Lignes vides
        for _ in range(3):
            draw.rectangle([x, cy, x + col_w, cy + cell_h], fill=(255, 255, 255), outline=(209, 213, 219))
            draw.rectangle([x + col_w, cy, x + col_w + desc_w, cy + cell_h], fill=(255, 255, 255), outline=(209, 213, 219))
            cy += cell_h
        x += col_w + desc_w + 15

    out = ROOT / "data" / "_preview_v11_listes.png"
    img.save(out, "PNG", optimize=True)
    return out


if __name__ == "__main__":
    p1 = render_excavatrice()
    print(f"PNG: {p1}")
    p2 = render_listes()
    print(f"PNG: {p2}")
