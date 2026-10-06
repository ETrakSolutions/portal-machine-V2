# -*- coding: utf-8 -*-
"""Ecrit dans la BD les traductions anglaises des textes libres (_notes, _warning,
desc des lignes _custom). Decision de Jacquot, 2026-10-06 : appliquer les 244
traductions de septembre (lots 1-4) plus les textes apparus depuis (lot 5).

REGLES
  - On ne remplit QUE les champs anglais vides. Une traduction deja saisie dans
    l'interface (17 le 2026-10-06) n'est jamais ecrasee.
  - Anglais identique au francais (designation de piece) : rien n'est ecrit, le
    repli FR<->EN de texteBD() affiche deja le texte.
  - Le champ anglais va dans le MEME objet que le francais : un override qui porte
    _notes remplace la note de base, et app.js efface le _notes_en de base dans ce
    cas (« else delete e._notes_en »).
  - JSON compact, ensure_ascii=False : les fichiers se relisent a l'octet pres.
  - Idempotent : le rejouer ne change rien. A rejouer apres un rejet de push.

EFFACER : notes internes non redigees qui partaient chez le concessionnaire dans le
courriel de soumission (signalements #240, #241, #243 de l'Excel de septembre).

Usage :  py -3.13 scripts/appliquer_traductions.py [--ecrire]
         sans --ecrire : rapport seulement, aucun fichier touche.
"""
import glob
import importlib.util
import json
import os
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SC = os.path.join(REPO, "scripts", "traductions")

EFFACER = [
    ("overrides/excavatrice.json", ("Excavatrice", "Case", "2024", "CX145D SR"), "_notes", "Drain ok une personne"),
    ("overrides/excavatrice.json", ("Excavatrice", "Case", "2026", "CX145D SR"), "_notes", "coupure 1 gars OK"),
    ("overrides/excavatrice.json", ("Excavatrice", "Caterpillar", "2026", "301.8"), "_notes", "elle ne se crée pas"),
]


def charger(nom):
    spec = importlib.util.spec_from_file_location(nom[:-3], os.path.join(SC, nom))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def table():
    textes = {o["id"]: o["fr"] for o in json.load(open(os.path.join(SC, "textes_fr.json"), encoding="utf-8"))}
    fr2en = {}
    for i in (1, 2, 3, 4):
        for tid, en in charger("trad_lot%d.py" % i).TRAD.items():
            fr2en[textes[tid].strip()] = en
    lot5 = charger("trad_lot5.py")
    fr2en.update({k.strip(): v for k, v in lot5.TRAD_FR.items()})
    return fr2en, lot5.PREFIXES


def traduire(fr, fr2en, prefixes):
    t = fr.strip()
    if t in fr2en:
        return fr2en[t]
    for p, en in prefixes.items():
        if t.startswith(p):
            return en + t[len(p):]
    return None


def entrees(d):
    for typ, fabs in d.items():
        if not isinstance(fabs, dict):
            continue
        for fab, ans in fabs.items():
            if fab.startswith("_") or not isinstance(ans, dict):
                continue
            for an, mods in ans.items():
                if not isinstance(mods, dict):
                    continue
                for mod, e in mods.items():
                    if isinstance(e, dict):
                        yield (typ, fab, an, mod), e


def main():
    ecrire = "--ecrire" in sys.argv
    fr2en, prefixes = table()
    fichiers = [os.path.join(REPO, "data", "machines.json")] + sorted(
        glob.glob(os.path.join(REPO, "data", "overrides", "*.json")))
    stats, sans, efface = Counter(), Counter(), []
    for f in fichiers:
        rel = os.path.relpath(f, os.path.join(REPO, "data")).replace("\\", "/")
        brut = open(f, "rb").read()
        d = json.loads(brut.decode("utf-8"))
        for (fic, cle, champ, attendu) in EFFACER:
            if fic != rel:
                continue
            e = d.get(cle[0], {}).get(cle[1], {}).get(cle[2], {}).get(cle[3])
            if isinstance(e, dict) and isinstance(e.get(champ), str) and e[champ].strip() == attendu:
                del e[champ]
                e.pop(champ + "_en", None)
                efface.append(" / ".join(cle))
        for p, e in entrees(d):
            for ch in ("_notes", "_warning"):
                v = e.get(ch)
                if not (isinstance(v, str) and v.strip()):
                    continue
                if e.get(ch + "_en"):
                    stats["deja traduit"] += 1
                    continue
                en = traduire(v, fr2en, prefixes)
                if en is None:
                    sans[v.strip()[:90]] += 1
                elif en.strip() == v.strip():
                    stats["identique, rien a ecrire"] += 1
                else:
                    e[ch + "_en"] = en
                    stats[rel + " " + ch] += 1
            bom = e.get("_bom") if isinstance(e.get("_bom"), dict) else {}
            for c in bom.get("_custom") or []:
                if not (isinstance(c, dict) and isinstance(c.get("desc"), str) and c["desc"].strip()):
                    continue
                if c.get("desc_en"):
                    stats["deja traduit"] += 1
                    continue
                en = traduire(c["desc"], fr2en, prefixes)
                if en is None:
                    sans[c["desc"].strip()[:90]] += 1
                elif en.strip() == c["desc"].strip():
                    stats["identique, rien a ecrire"] += 1
                else:
                    c["desc_en"] = en
                    stats[rel + " desc"] += 1
        neuf = json.dumps(d, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if neuf != brut:
            stats["fichiers modifies"] += 1
            if ecrire:
                open(f, "wb").write(neuf)
    for k, v in sorted(stats.items()):
        print("  %-45s %d" % (k, v))
    print("  notes internes effacees : %d %s" % (len(efface), efface))
    if sans:
        print("  ⚠ SANS TRADUCTION (%d textes) :" % len(sans))
        for t, n in sans.most_common():
            print("     %3d x %s" % (n, t))
    print("ECRIT" if ecrire else "RAPPORT SEULEMENT (ajouter --ecrire)")
    return 1 if sans else 0


if __name__ == "__main__":
    sys.exit(main())
