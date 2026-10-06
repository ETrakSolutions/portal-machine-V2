# -*- coding: utf-8 -*-
"""Sauvegarde hebdomadaire du Portail e-Trak sur SharePoint (decision Jacquot, 2026-10-02).

Plan B contre une perte de donnees, une perte de GitHub ou une erreur commise. Chaque
vendredi (ou au premier passage suivant si le poste etait eteint), dans
SharePoint E-Trak Production > General > _Portail e-Trak > Sauvegardes > AAAA-MM-JJ :

  1. portal-machine-V2_complet.bundle : miroir COMPLET du depot GitHub (toutes les
     branches, etiquettes et l'historique : pages, base de machines, kits, serveur).
  2. serveur_proprietes_lisibles.json : toutes les cles du serveur lisibles sans
     mot de passe (les comptes, sessions, NIP, jeton, prix, SAV et inventaire sont
     proteges par le serveur et n'y sont PAS, par conception).
  3. etat.json : le resultat des verifications.

Rien n'est declare reussi sans preuve : le bundle est verifie, RESTAURE dans un dossier
jetable et compare a GitHub (meme sommet de main, meme machines.json octet pour octet) ;
l'export doit contenir toutes les cles listees, sans erreur ; chaque fichier copie sur
SharePoint est relu et compare. Un echec donne un code de sortie non nul, une ligne
ECHEC dans le journal et une fenetre d'alerte a l'ecran.

Aucune sauvegarde n'est jamais supprimee (environ 9 Mo par semaine).

Usage :
    py -3.13 scripts/sauvegarde_hebdo_portail.py            # garde : seulement si due
    py -3.13 scripts/sauvegarde_hebdo_portail.py --forcer   # tout de suite
    py -3.13 scripts/sauvegarde_hebdo_portail.py --etat     # derniere sauvegarde reussie
"""
import argparse
import datetime
import filecmp
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from publier_prix import REPO, dossier_portail, read_pin  # noqa: E402

DEPOT = 'https://github.com/ETrakSolutions/portal-machine-V2.git'
API = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec'
JOUR_DE_SAUVEGARDE = 4          # vendredi (lundi = 0)
EN_RETARD_APRES = 7             # jours sans sauvegarde reussie = due, quel que soit le jour


def journal(dest, msg):
    ligne = '%s  %s' % (time.strftime('%Y-%m-%d %H:%M'), msg)
    print(ligne, flush=True)
    if dest:
        with open(dest / 'journal.txt', 'a', encoding='utf-8', newline='\n') as f:
            f.write(ligne + '\n')


def git(*args, cwd=None):
    r = subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True, encoding='utf-8')
    if r.returncode:
        raise RuntimeError('git %s : %s' % (' '.join(args[:2]), (r.stderr or r.stdout).strip()[:300]))
    return r.stdout.strip()


def get(url, essais=5):
    for i in range(essais):
        try:
            return json.loads(urllib.request.urlopen(url, timeout=90).read().decode('utf-8'))
        except Exception:
            if i == essais - 1:
                raise
            time.sleep(2 + 3 * i)


def post(corps, essais=5):
    donnees = json.dumps(corps).encode('utf-8')
    for i in range(essais):
        try:
            req = urllib.request.Request(API, data=donnees, headers={'Content-Type': 'text/plain'})
            return json.loads(urllib.request.urlopen(req, timeout=90).read().decode('utf-8'))
        except Exception:
            if i == essais - 1:
                raise
            time.sleep(2 + 3 * i)


def derniere_reussie(racine):
    meilleures = []
    for d in racine.glob('20??-??-??*'):
        try:
            e = json.loads((d / 'etat.json').read_text(encoding='utf-8'))
            if e.get('resultat') == 'OK':
                meilleures.append(datetime.date.fromisoformat(d.name[:10]))
        except Exception:
            pass
    return max(meilleures) if meilleures else None


def bundle(tmp, etat):
    miroir = tmp / 'v2.git'
    git('clone', '-q', '--mirror', DEPOT, str(miroir))
    fichier = tmp / 'portal-machine-V2_complet.bundle'
    git('bundle', 'create', str(fichier), '--all', cwd=miroir)
    git('bundle', 'verify', str(fichier), cwd=miroir)
    tetes = git('bundle', 'list-heads', str(fichier), cwd=miroir).splitlines()
    branches = [l.split()[1] for l in tetes if ' refs/heads/' in l]
    distant = git('ls-remote', DEPOT, 'refs/heads/main').split()[0]
    # Restauration reelle dans un dossier jetable : la seule preuve qui compte.
    resto = tmp / 'restauration'
    git('clone', '-q', str(fichier), str(resto))
    sommet = git('rev-parse', 'HEAD', cwd=resto)
    if sommet != distant:
        raise RuntimeError('main restaure %s != GitHub %s' % (sommet[:7], distant[:7]))
    ref = tmp / 'machines_github.json'
    with open(ref, 'wb') as f:
        f.write(subprocess.run(['git', 'show', 'HEAD:data/machines.json'], cwd=miroir,
                               capture_output=True, check=True).stdout)
    if not filecmp.cmp(resto / 'data' / 'machines.json', ref, shallow=False):
        raise RuntimeError('machines.json restaure differe de GitHub')
    nb_commits = int(git('rev-list', '--count', 'HEAD', cwd=resto))
    etat['depot'] = {'main': sommet, 'commits_main': nb_commits, 'branches': len(branches),
                     'octets': fichier.stat().st_size, 'restauration': 'OK'}
    return fichier


def export_serveur(tmp, etat):
    # Depuis le correctif « lecture publique » (2026-10-06), la liste et une partie des
    # valeurs ne sortent plus par le GET public : on passe par listkeys / getprivate avec
    # le NIP. Sans NIP, on S'ARRETE : un export par la voie publique perdrait ces cles
    # en silence (vides) et la sauvegarde paraitrait complete.
    nip = read_pin(REPO / 'PIN Portail.txt')
    r = post({'action': 'listkeys', 'prefix': '', 'pin': nip})
    if not isinstance(r, dict) or 'keys' not in r:
        raise RuntimeError('listkeys refuse : %s' % (r.get('error') if isinstance(r, dict) else r))
    cles = r['keys']
    valeurs, erreurs = {}, []

    def un(k):
        try:
            r = post({'action': 'getprivate', 'key': k, 'pin': nip})
            if isinstance(r, dict) and r.get('error'):
                return k, None, r['error']
            return k, (r.get('value') if isinstance(r, dict) else r), None
        except Exception as e:
            return k, None, repr(e)

    with ThreadPoolExecutor(10) as ex:
        for k, v, err in ex.map(un, cles):
            if err:
                erreurs.append(k)
            else:
                valeurs[k] = v
    if erreurs or len(valeurs) != len(cles):
        raise RuntimeError('export serveur incomplet : %d/%d cles, %d erreurs'
                           % (len(valeurs), len(cles), len(erreurs)))
    fichier = tmp / 'serveur_proprietes_lisibles.json'
    doc = {'_meta': {'exporte_le': time.strftime('%Y-%m-%d %H:%M:%S'), 'serveur': API,
                     'cles': len(valeurs),
                     'note': 'Cles lisibles seulement. Absentes par conception : comptes, sessions, '
                             'PIN, GITHUB_TOKEN, prix, SAV, inventaire.'},
           'cles': valeurs}
    with open(fichier, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    relu = json.loads(fichier.read_text(encoding='utf-8'))
    if len(relu['cles']) != len(cles):
        raise RuntimeError('export relu incomplet')
    etat['serveur'] = {'cles': len(valeurs), 'octets': fichier.stat().st_size}
    return fichier


def alerte(msg):
    try:
        subprocess.run(['msg', '*', '/TIME:0', msg], capture_output=True, timeout=20)
    except Exception:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--forcer', action='store_true')
    ap.add_argument('--etat', action='store_true')
    a = ap.parse_args()

    portail = dossier_portail()
    if not portail:
        sys.exit('Dossier SharePoint « _Portail e-Trak » introuvable sur ce poste')
    racine = portail / 'Sauvegardes'
    racine.mkdir(exist_ok=True)
    der = derniere_reussie(racine)
    auj = datetime.date.today()
    if a.etat:
        print('Derniere sauvegarde reussie : %s' % (der or 'aucune'))
        return
    due = a.forcer or der is None or (auj - der).days >= EN_RETARD_APRES or \
        (auj.weekday() == JOUR_DE_SAUVEGARDE and der != auj)
    if not due:
        print('Pas due : derniere sauvegarde reussie le %s' % der)
        return

    # Jamais rien d'ecrase : un dossier deja present (sauvegarde manuelle, deuxieme passage
    # du jour) donne un nouveau dossier suffixe de l'heure. Le 2026-10-02, un essai avait
    # ecrase l'export d'avant la purge des kits V1 (restaure depuis une copie locale).
    dest, n = racine / auj.isoformat(), 1
    while dest.exists():
        dest = racine / ('%s_%s%s' % (auj.isoformat(), time.strftime('%H%M%S'), '' if n == 1 else '_%d' % n))
        n += 1
    dest.mkdir()
    etat = {'date': auj.isoformat(), 'debut': time.strftime('%H:%M:%S'), 'resultat': 'EN COURS'}
    journal(racine, 'debut de la sauvegarde -> %s' % dest.name)
    tmp = Path(tempfile.mkdtemp(prefix='sauv_portail_'))
    try:
        fichiers = [bundle(tmp, etat), export_serveur(tmp, etat)]
        for f in fichiers:
            if (dest / f.name).exists():
                raise RuntimeError('refus d ecraser %s' % (dest / f.name))
            shutil.copyfile(f, dest / f.name)
            if not filecmp.cmp(f, dest / f.name, shallow=False):
                raise RuntimeError('copie SharePoint differente : %s' % f.name)
        etat['resultat'] = 'OK'
        etat['fin'] = time.strftime('%H:%M:%S')
        (dest / 'etat.json').write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding='utf-8')
        journal(racine, 'OK  depot %s (%d commits, %d branches, restauration verifiee), serveur %d cles'
                % (etat['depot']['main'][:7], etat['depot']['commits_main'], etat['depot']['branches'],
                   etat['serveur']['cles']))
    except Exception as e:
        etat['resultat'] = 'ECHEC'
        etat['erreur'] = str(e)[:500]
        (dest / 'etat.json').write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding='utf-8')
        journal(racine, 'ECHEC  %s' % e)
        alerte('Sauvegarde hebdomadaire du Portail e-Trak : ECHEC. Voir SharePoint '
               '_Portail e-Trak > Sauvegardes > journal.txt (%s)' % str(e)[:150])
        sys.exit(1)
    finally:
        # Git marque ses fichiers d'objets en lecture seule : sous Windows, rmtree les
        # laisserait derriere sans le retrait de l'attribut.
        def _forcer(fn, chemin, _):
            import os, stat
            os.chmod(chemin, stat.S_IWRITE)
            fn(chemin)
        shutil.rmtree(tmp, onerror=_forcer)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
