# -*- coding: utf-8 -*-
"""Controle de sante du Portail Machine V2 : donnees ET code.

Ne modifie rien. Verifie :
  1. JSON      — tous les fichiers data/ parsent ; structure attendue.
  2. Structure — type > fabricant > annee > modele > dict ; pas d'entree bancale.
  3. Champs    — jeu de champs homogene par type ; champs orphelins.
  4. Doublons  — modeles identiques a la casse/aux espaces pres.
  5. Encodage  — mojibake (Ã©, Â, ï»¿) et caracteres de controle.
  6. Overrides — les BOM pointent-ils vers des machines existantes ?
  7. Catalogue — codes BOM utilises vs _bom_labels declares.
  8. Code      — fichiers reference par les HTML mais absents ; cache-busting.
  9. Regles    — kit-rules.js est-il bien la source unique (pas de regle dupliquee) ?
"""
import json, os, re, sys, glob, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pb = []          # problemes bloquants
av = []          # avertissements


def bloquant(m):
    pb.append(m)
    print('  [!!] ' + m)


def alerte(m):
    av.append(m)
    print('  [ ~] ' + m)


def ok(m):
    print('  [ok] ' + m)


print('=== 1. FICHIERS JSON ===')
data = {}
for p in sorted(glob.glob(os.path.join(ROOT, 'data', '**', '*.json'), recursive=True)):
    rel = os.path.relpath(p, ROOT).replace('\\', '/')
    try:
        with open(p, encoding='utf-8') as f:
            data[rel] = json.load(f)
        taille = os.path.getsize(p)
        print('  [ok] %-46s %9d o' % (rel, taille))
    except Exception as e:
        bloquant('%s illisible : %s' % (rel, e))

MJ = data.get('data/machines.json')
if not MJ:
    sys.exit('\nARRET : data/machines.json illisible.')

print('\n=== 2. STRUCTURE DE machines.json ===')
types = [t for t in MJ]
n_tot = 0
for t in types:
    if not isinstance(MJ[t], dict):
        bloquant('type « %s » n est pas un objet' % t)
        continue
    for fab, annees in MJ[t].items():
        if fab.startswith('_'):
            continue
        if not isinstance(annees, dict):
            bloquant('%s > %s n est pas un objet' % (t, fab))
            continue
        for y, mods in annees.items():
            if not re.fullmatch(r'\d{4}', str(y)):
                bloquant('%s > %s : cle d annee invalide %r' % (t, fab, y))
            if not isinstance(mods, dict):
                bloquant('%s > %s > %s n est pas un objet' % (t, fab, y))
                continue
            for m, e in mods.items():
                n_tot += 1
                if not isinstance(e, dict):
                    bloquant('%s > %s > %s > %s : %r au lieu d un objet' % (t, fab, y, m, type(e)))
ok('%d types, %d entrees annee-modele, structure conforme' % (len(types), n_tot))

print('\n=== 3. HOMOGENEITE DES CHAMPS PAR TYPE ===')
for t in types:
    champs = collections.Counter()
    n = 0
    for fab, annees in MJ[t].items():
        if fab.startswith('_'):
            continue
        for y, mods in annees.items():
            for m, e in mods.items():
                if not isinstance(e, dict):
                    continue
                n += 1
                for k in e:
                    champs[k] += 1
    if not n:
        continue
    rares = {k: v for k, v in champs.items() if v < n * 0.02 and not k.startswith('_')}
    print('  %-28s %5d entrees, %2d champs' % (t, n, len(champs)))
    if rares:
        alerte('%s : champ(s) present(s) sur <2 %% des entrees : %s' % (t, rares))

print('\n=== 4. DOUBLONS DE MODELES ===')
n_dbl = 0
for t in types:
    for fab, annees in MJ[t].items():
        if fab.startswith('_'):
            continue
        vus = collections.defaultdict(set)
        for y, mods in annees.items():
            for m in mods:
                vus[re.sub(r'[^a-z0-9]', '', m.lower())].add(m)
        for cle, noms in vus.items():
            if len(noms) > 1:
                n_dbl += 1
                alerte('%s > %s : variantes du meme nom %s' % (t, fab, sorted(noms)))
if not n_dbl:
    ok('aucun doublon de nommage')

print('\n=== 5. ENCODAGE ===')
MOJI = re.compile(r'Ã[©¨ªè-ü]|Â[°«»]|ï»¿|â€™|â€œ')
CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')
n_moji = n_ctrl = 0
ex_moji = []
for rel, d in data.items():
    s = json.dumps(d, ensure_ascii=False)
    for mt in MOJI.finditer(s):
        n_moji += 1
        if len(ex_moji) < 5:
            ex_moji.append('%s : ...%s...' % (rel, s[max(0, mt.start() - 40):mt.start() + 25]))
    n_ctrl += len(CTRL.findall(s))
if n_moji:
    alerte('%d sequence(s) de mojibake' % n_moji)
    for e in ex_moji:
        print('       ' + e)
else:
    ok('aucun mojibake')
if n_ctrl:
    alerte('%d caractere(s) de controle' % n_ctrl)
else:
    ok('aucun caractere de controle')

print('\n=== 6. OVERRIDES ORPHELINS ===')
for rel, d in data.items():
    if '/overrides/' not in rel:
        continue
    orph = n = 0
    exemples = []
    for t, fabs in d.items():
        for fab, annees in (fabs or {}).items():
            for y, mods in (annees or {}).items():
                for m in mods:
                    n += 1
                    if not MJ.get(t, {}).get(fab, {}).get(y, {}).get(m):
                        orph += 1
                        if len(exemples) < 3:
                            exemples.append('%s>%s>%s>%s' % (t, fab, y, m))
    if orph:
        alerte('%s : %d/%d override(s) sans machine correspondante (ex. %s)'
               % (rel, orph, n, ', '.join(exemples)))
    else:
        ok('%-46s %5d overrides, tous rattaches' % (rel, n))

print('\n=== 7. CODES BOM vs CATALOGUE _bom_labels ===')
for t in types:
    labels = MJ[t].get('_bom_labels')
    if not isinstance(labels, dict):
        continue
    codes_cat = {k.split(' ')[0] for k in labels}
    utilises = collections.Counter()
    for rel, d in data.items():
        if '/overrides/' not in rel:
            continue
        for tt, fabs in d.items():
            if tt != t:
                continue
            for fab, annees in (fabs or {}).items():
                for y, mods in (annees or {}).items():
                    for m, e in mods.items():
                        for c in (e.get('_bom') or {}):
                            if re.fullmatch(r'\d{4}', str(c)):
                                utilises[c] += 1
    inconnus = {c: n for c, n in utilises.items() if c not in codes_cat}
    if inconnus:
        alerte('%s : code(s) BOM hors catalogue %s' % (t, inconnus))
    else:
        ok('%-28s %2d codes au catalogue, %d utilises, tous connus'
           % (t, len(codes_cat), len(utilises)))

print('\n=== 8. FICHIERS REFERENCES PAR LES PAGES ===')
manquants = 0
versions = collections.defaultdict(set)
for p in glob.glob(os.path.join(ROOT, '*.html')):
    html = open(p, encoding='utf-8').read()
    for m in re.finditer(r'(?:src|href)="((?:js|css)/[^"?]+)(\?v=(\d+))?"', html):
        f = os.path.join(ROOT, m.group(1))
        if not os.path.exists(f):
            bloquant('%s reference %s qui n existe pas' % (os.path.basename(p), m.group(1)))
            manquants += 1
        if m.group(3):
            versions[m.group(1)].add(m.group(3))
if not manquants:
    ok('tous les fichiers js/css references existent')
discord = {f: v for f, v in versions.items() if len(v) > 1}
if discord:
    for f, v in discord.items():
        alerte('cache-busting incoherent : %s vu en v=%s' % (f, sorted(v)))
else:
    ok('cache-busting coherent entre les pages')

print('\n=== 9. SOURCE UNIQUE DES REGLES BOM ===')
kr = open(os.path.join(ROOT, 'js', 'kit-rules.js'), encoding='utf-8').read()
prefixes = re.search(r'DRAIN_PREFIXES\s*=\s*\[(.*?)\]', kr, re.S)
n_pref = len(re.findall(r"'", prefixes.group(1))) // 2 if prefixes else 0
ok('kit-rules.js : %d prefixes DRAIN, %d libelles de harnais'
   % (n_pref, len(re.findall(r'H\d{4}:', kr))))
consommateurs = []
for p in glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, 'js', '*.js')):
    s = open(p, encoding='utf-8').read()
    if 'KitRules' in s:
        consommateurs.append(os.path.basename(p))
ok('KitRules utilise par : %s' % ', '.join(sorted(consommateurs)))
# une regle dupliquee ailleurs qu'en source unique ?
for p in glob.glob(os.path.join(ROOT, 'js', '*.js')) + glob.glob(os.path.join(ROOT, '*.html')):
    if os.path.basename(p) == 'kit-rules.js':
        continue
    s = open(p, encoding='utf-8').read()
    if 'DRAIN_PREFIXES' in s and 'KitRules.DRAIN_PREFIXES' not in s:
        alerte('%s semble redefinir DRAIN_PREFIXES hors de kit-rules.js' % os.path.basename(p))

print('\n' + '=' * 60)
print('BILAN : %d probleme(s) bloquant(s), %d avertissement(s)' % (len(pb), len(av)))
for m in pb:
    print('  [!!] ' + m)
for m in av:
    print('  [ ~] ' + m)
sys.exit(1 if pb else 0)
