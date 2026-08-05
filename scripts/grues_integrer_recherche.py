# -*- coding: utf-8 -*-
"""Passe 2 : integration des resultats de la campagne de recherche par marque.

Lit les fichiers produits par les agents (un par marque / groupe de marques),
CONTROLE chaque valeur, puis n'ecrit dans machines.json que ce qui passe tous
les controles. Le reste part dans un fichier de revision humaine — jamais
ecrit d'office (lecon de l'episode RitchieSpecs : une source qui se trompe
d'un facteur 2 existe et ne s'annonce pas).

Controles appliques a chaque valeur :
  1. champ attendu     : le champ etait bien dans la liste des manquants ;
  2. preuve            : source_type = fabricant, ou deux_sources ;
  3. confiance         : « haute » exigee pour ecriture directe ;
  4. format            : la valeur correspond au gabarit du champ ;
  5. vraisemblance     : contrepoids < capacite ; hauteur dans une plage
                         plausible ; puissance dans une plage plausible ;
  6. non-ecrasement    : on ne remplit que du vide, jamais une valeur existante.

Usage :
  python scripts/grues_integrer_recherche.py            # simulation + rapport
  python scripts/grues_integrer_recherche.py --write    # ecrit machines.json
"""
import json, os, re, sys, glob, collections

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'data', 'machines.json')
RES = os.environ.get('GRUES_RES_DIR') or os.path.join(
    os.path.expanduser('~'), 'AppData', 'Local', 'Temp', 'claude', 'C--Users-jcaron',
    '47e45715-d2c5-4e2a-9869-7921f4a79b27', 'scratchpad', 'grues_recherche')
WRITE = '--write' in sys.argv

VIDE = ('', 'a completer', 'à compléter', 'a compléter', 'n/d', 'nd', '-', 'none', 'null')
CHAMPS = ['Contrepoids max', 'Essieux', 'Fleche telescopique', 'Hauteur max',
          'Puissance moteur', 'Voltage machine (V/type)']

GABARIT = {
    'Contrepoids max': re.compile(r'^(Aucun|\d+(\.\d+)?\s?t)$'),
    'Hauteur max': re.compile(r'^\d+(\.\d+)?\s?m$'),
    'Puissance moteur': re.compile(r'^(Selon châssis|\d+(\.\d+)?\s?(hp|kW)(\s?\(.+\))?)$'),
    'Essieux': re.compile(r'^(Chenilles|Selon châssis|\d)$'),
    'Fleche telescopique': re.compile(r'^\d+(\.\d+)?(-\d+(\.\d+)?)?\s?m(\streillis)?$'),
    'Voltage machine (V/type)': re.compile(
        r'^(24V DC|12V DC|12V ou 24V \(selon châssis\)|Électrique \(380V triphasé\))$'),
}


def vide(v):
    return str(v or '').strip().lower() in VIDE


def nombre(s):
    m = re.search(r'(\d+(?:\.\d+)?)', str(s or ''))
    return float(m.group(1)) if m else None


# Familles ou l'absence de contrepoids est la norme (travail sur stabilisateurs).
SANS_CONTREPOIDS = ('Boom truck (camion client)', 'Carry-deck / industrielle')


def aucun_recevable(champ, val, info, famille):
    """Exception documentee : « Contrepoids max = Aucun ».

    Une brochure ne declare jamais explicitement l'absence de contrepoids, elle
    l'omet — la confiance ne peut donc pas etre « haute ». On accepte donc la
    confiance « moyenne » a trois conditions : le champ est le contrepoids, la
    valeur est « Aucun », la source est le fabricant, et la famille est une ou
    l'absence de contrepoids est la norme. Ces valeurs sont comptees a part
    dans le rapport pour rester verifiables.
    """
    return (champ == 'Contrepoids max' and val == 'Aucun'
            and info.get('source_type') == 'fabricant'
            and info.get('confiance') == 'moyenne'
            and famille in SANS_CONTREPOIDS)


def main():
    db = json.load(open(MJ, encoding='utf-8'))
    gm = db['Grue Mobile']
    fam = {tuple(k.split('|', 1)): v for k, v in
           json.load(open(os.path.join(ROOT, 'scripts', 'data', 'grues_familles.json'),
                          encoding='utf-8')).items()}
    travail = json.load(open(os.path.join(ROOT, 'scripts', 'data',
                                          'grues_a_chercher.json'), encoding='utf-8'))

    fichiers = sorted(glob.glob(os.path.join(RES, '*.json')))
    print('fichiers de resultats : %d' % len(fichiers))
    for f in fichiers:
        print('   -', os.path.basename(f))
    if not fichiers:
        print('\nAucun resultat trouve dans %s' % RES)
        return

    accepte, rejete = [], []
    for f in fichiers:
        try:
            data = json.load(open(f, encoding='utf-8'))
        except Exception as e:
            print('  !! %s illisible : %s' % (os.path.basename(f), e))
            continue
        defaut_marque = data.get('marque', '')
        for r in data.get('resultats', []):
            marque = r.get('marque') or defaut_marque
            modele = r.get('modele')
            if marque not in gm:
                rejete.append((marque, modele, '-', '-', 'marque inconnue en BD'))
                continue
            attendus = set(travail.get(marque, {}).get(modele, {}).get('champs', []))
            if not attendus:
                rejete.append((marque, modele, '-', '-', 'modele hors liste de travail'))
                continue
            # capacite connue, pour le controle de vraisemblance
            annees = [y for y in gm[marque] if modele in gm[marque][y]]
            if not annees:
                rejete.append((marque, modele, '-', '-', 'modele absent de la BD'))
                continue
            ref = gm[marque][annees[0]][modele]
            cap = nombre(ref.get('Capacite max'))

            for champ, info in (r.get('champs') or {}).items():
                val = (info or {}).get('valeur')
                if val is None or vide(val):
                    continue
                val = str(val).strip()
                motif = None
                if champ not in CHAMPS:
                    motif = 'champ hors perimetre'
                elif champ not in attendus:
                    motif = 'champ deja renseigne / non demande'
                elif (info.get('source_type') not in ('fabricant', 'deux_sources')):
                    motif = 'preuve insuffisante (%s)' % info.get('source_type')
                elif info.get('confiance') != 'haute' and not aucun_recevable(
                        champ, val, info, fam.get((marque, modele), '')):
                    motif = 'confiance %s' % info.get('confiance')
                elif not GABARIT[champ].match(val):
                    motif = 'format non conforme'
                elif champ == 'Contrepoids max' and val != 'Aucun' and cap and nombre(val) and nombre(val) >= cap:
                    motif = 'contrepoids %s >= capacite %s t' % (val, cap)
                elif champ == 'Hauteur max' and nombre(val) and not (2 <= nombre(val) <= 250):
                    motif = 'hauteur hors plage plausible'
                elif champ == 'Puissance moteur' and nombre(val) and not (5 <= nombre(val) <= 1500):
                    motif = 'puissance hors plage plausible'
                if motif:
                    rejete.append((marque, modele, champ, val, motif))
                else:
                    exception = aucun_recevable(champ, val, info, fam.get((marque, modele), ''))
                    accepte.append((marque, modele, champ, val, annees,
                                    info.get('source_url', ''), info.get('source_type'),
                                    exception))

    print('\n=== BILAN DU CONTROLE ===')
    n_exc = sum(1 for a in accepte if a[7])
    print('valeurs acceptees : %d  (dont %d « Contrepoids = Aucun » admises par exception '
          'documentee, confiance moyenne + source fabricant)' % (len(accepte), n_exc))
    print('valeurs rejetees  : %d' % len(rejete))
    par_motif = collections.Counter(m for *_x, m in rejete)
    for m, n in par_motif.most_common():
        print('   %-46s %3d' % (m[:46], n))

    print('\n=== ACCEPTEES par marque et champ ===')
    tab = collections.Counter((a[0], a[2]) for a in accepte)
    for (mq, ch), n in sorted(tab.items()):
        print('   %-18s %-28s %3d' % (mq[:18], ch, n))

    if rejete:
        print('\n=== REJETS (detail, 40 premiers) ===')
        for mq, mo, ch, val, motif in rejete[:40]:
            print('   %-16s %-22s %-24s %-18s %s' % (mq[:16], str(mo)[:22], ch[:24], str(val)[:18], motif))

    if WRITE:
        n = 0
        for marque, modele, champ, val, annees, src, st, _exc in accepte:
            for y in annees:
                e = gm[marque][y].get(modele)
                if isinstance(e, dict) and vide(e.get(champ)):
                    e[champ] = val
                    n += 1
        with open(MJ, 'w', encoding='utf-8') as fh:
            json.dump(db, fh, ensure_ascii=False, separators=(',', ':'))
        print('\nECRIT : %d entrees dans data/machines.json' % n)

    # fichier de revision humaine : rejets + valeurs jamais trouvees
    rev = os.path.join(ROOT, 'scripts', 'data', 'grues_a_revoir.json')
    trouves = {(a[0], a[1], a[2]) for a in accepte}
    manque = []
    for marque, mods in travail.items():
        for modele, info in mods.items():
            for champ in info['champs']:
                if (marque, modele, champ) not in trouves:
                    manque.append({'marque': marque, 'modele': modele, 'champ': champ})
    json.dump({'rejets': [{'marque': a, 'modele': b, 'champ': c, 'valeur': d, 'motif': e}
                          for a, b, c, d, e in rejete],
               'toujours_manquant': manque},
              open(rev, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\ntoujours manquant apres la campagne : %d valeurs' % len(manque))
    print('fichier de revision : %s' % rev)
    if not WRITE:
        print('\n(simulation — relancer avec --write)')


if __name__ == '__main__':
    main()
