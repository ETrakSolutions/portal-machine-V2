#!/usr/bin/env python3
"""Verifie l'integrite des fichiers du Portail Machine avant qu'ils cassent le live.

Detecte notamment le bug du 2026-07-10 : des fichiers HTML mis a 0 octet (page
blanche), que GitHub Pages publie sans erreur.

Controles :
  1. Chaque fichier .html suivi par git doit etre non vide et contenir <body ... </html>.
  2. Chaque fichier .json sous data/ doit etre non vide et parser correctement.

Usage :
  python3 scripts/check_portal_integrity.py            # verifie l'arbre de travail
  python3 scripts/check_portal_integrity.py --staged   # verifie le contenu INDEXE (pre-commit)

Sortie : code 0 si tout est OK, 1 sinon (avec la liste des problemes).
"""
import json, subprocess, sys, os

STAGED = "--staged" in sys.argv
MIN_HTML_BYTES = 200  # un vrai gabarit de page fait des milliers d'octets

def repo_root():
    return subprocess.run(["git", "rev-parse", "--show-toplevel"],
                          capture_output=True, text=True).stdout.strip()

def tracked_files():
    if STAGED:
        # fichiers presents dans l'index (ajoutes/modifies), pas les suppressions
        out = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
                             capture_output=True, text=True).stdout
    else:
        out = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout
    return [l for l in out.splitlines() if l.strip()]

def read_bytes(path):
    """Contenu indexe (--staged) ou de l'arbre de travail."""
    if STAGED:
        r = subprocess.run(["git", "show", f":{path}"], capture_output=True)
        return r.stdout if r.returncode == 0 else None
    try:
        with open(path, "rb") as f:
            return f.read()
    except FileNotFoundError:
        return None

def main():
    root = repo_root()
    if root:
        os.chdir(root)
    problems = []
    files = tracked_files()

    html = [f for f in files if f.lower().endswith(".html")]
    jsons = [f for f in files if f.lower().endswith(".json") and f.startswith("data/")]

    for f in html:
        data = read_bytes(f)
        if data is None:
            continue
        if len(data) == 0:
            problems.append(f"[HTML VIDE] {f} fait 0 octet -> page blanche")
            continue
        if len(data) < MIN_HTML_BYTES:
            problems.append(f"[HTML SUSPECT] {f} ne fait que {len(data)} octets (< {MIN_HTML_BYTES})")
        low = data.lower()
        if b"<body" not in low or b"</html>" not in low:
            problems.append(f"[HTML INCOMPLET] {f} : balise <body> ou </html> manquante")

    for f in jsons:
        data = read_bytes(f)
        if data is None:
            continue
        if len(data) == 0:
            problems.append(f"[JSON VIDE] {f} fait 0 octet")
            continue
        try:
            json.loads(data.decode("utf-8"))
        except Exception as e:
            problems.append(f"[JSON INVALIDE] {f} : {e}")

    scope = "indexes (staged)" if STAGED else "de l'arbre de travail"
    print(f"Verification integrite portail ({scope}) : {len(html)} HTML, {len(jsons)} JSON data/")
    if problems:
        print(f"\n❌ {len(problems)} probleme(s) detecte(s) :")
        for p in problems:
            print("   - " + p)
        print("\nCorrige ces fichiers avant de committer / deployer (ne pas publier des HTML vides).")
        return 1
    print("✅ Tout est OK.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
