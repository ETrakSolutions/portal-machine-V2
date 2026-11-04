# -*- coding: utf-8 -*-
"""Chiffrement des sauvegardes sensibles du Portail e-Trak (plan de releve, 2026-11-04).

Pourquoi : la liste des comptes du portail contient les mots de passe EN CLAIR (constat du
2026-11-04), et les donnees des projets locaux portent clients et prix. Elles vont sur
SharePoint chaque semaine, donc chiffrees.

Principe (deux cles) :
  - cle PUBLIQUE  : scripts/cle_publique_sauvegarde.pem, dans le depot. Elle ne sert qu'a
                    CHIFFRER. La sauvegarde automatique s'en sert sans rien demander.
                    La publier ne donne acces a rien.
  - cle PRIVEE    : SharePoint _Portail e-Trak/Sauvegardes/_cle/cle_privee_sauvegarde.pem,
                    elle-meme chiffree par une PHRASE SECRETE que seul Jacquot connait
                    (copie papier au coffre). Sans la phrase, la cle est inutilisable.
  Un portable vole ou un SharePoint lu ne suffit donc pas a lire les sauvegardes.

Format d'un fichier .chiffre : b'ETRAKSV1' + longueur (2 octets) + cle AES chiffree en
RSA-OAEP-SHA256 (4096 bits) + nonce (12 octets) + donnees AES-256-GCM (authentifiees).

Usage (dans une vraie fenetre de commande : la phrase secrete se tape au clavier, jamais
dans une conversation) :
    py -3.13 scripts/chiffrement_sauvegarde.py --creer-cle
    py -3.13 scripts/chiffrement_sauvegarde.py --tester
    py -3.13 scripts/chiffrement_sauvegarde.py --dechiffrer FICHIER.chiffre --vers DOSSIER
"""
import argparse
import getpass
import os
import struct
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b'ETRAKSV1'
CLE_PUBLIQUE = Path(__file__).resolve().parent / 'cle_publique_sauvegarde.pem'
NOM_CLE_PRIVEE = 'cle_privee_sauvegarde.pem'
PHRASE_MIN = 20
_OAEP = padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)


def chiffrer(donnees, cle_publique=CLE_PUBLIQUE):
    if not Path(cle_publique).exists():
        raise RuntimeError('cle publique absente (%s) : lancer --creer-cle' % cle_publique)
    pub = serialization.load_pem_public_key(Path(cle_publique).read_bytes())
    cle = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    enveloppe = pub.encrypt(cle, _OAEP)
    return MAGIC + struct.pack('>H', len(enveloppe)) + enveloppe + nonce + AESGCM(cle).encrypt(nonce, donnees, MAGIC)


def dechiffrer(blob, cle_privee_pem, phrase):
    if blob[:8] != MAGIC:
        raise RuntimeError('fichier non reconnu (pas une sauvegarde chiffree e-Trak)')
    n = struct.unpack('>H', blob[8:10])[0]
    enveloppe, nonce, corps = blob[10:10 + n], blob[10 + n:22 + n], blob[22 + n:]
    priv = serialization.load_pem_private_key(cle_privee_pem, password=phrase.encode('utf-8'))
    return AESGCM(priv.decrypt(enveloppe, _OAEP)).decrypt(nonce, corps, MAGIC)


def dossier_cle():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from publier_prix import dossier_portail
    p = dossier_portail()
    if not p:
        sys.exit('Dossier SharePoint « _Portail e-Trak » introuvable sur ce poste')
    return p / 'Sauvegardes' / '_cle'


def phrase_par_fenetre():
    """Fenetre avec deux cases masquees (points). Renvoie la phrase, ou None si on ferme."""
    import tkinter as tk
    res = {'p': None}
    w = tk.Tk()
    w.title('Cle de sauvegarde e-Trak')
    w.attributes('-topmost', True)
    f = tk.Frame(w, padx=18, pady=14)
    f.pack()
    tk.Label(f, justify='left', font=('Segoe UI', 10), text=(
        "Choisis une PHRASE SECRETE d'au moins %d caracteres\n"
        "(ex. 4 ou 5 mots sans lien entre eux).\n\n"
        "Note-la sur papier et range-la au coffre :\n"
        "sans elle, aucune sauvegarde chiffree ne se relit." % PHRASE_MIN)).pack(anchor='w')
    tk.Label(f, text='Phrase secrete :', font=('Segoe UI', 10, 'bold')).pack(anchor='w', pady=(12, 0))
    e1 = tk.Entry(f, show='●', width=44, font=('Segoe UI', 11))
    e1.pack()
    tk.Label(f, text='Retape-la :', font=('Segoe UI', 10, 'bold')).pack(anchor='w', pady=(8, 0))
    e2 = tk.Entry(f, show='●', width=44, font=('Segoe UI', 11))
    e2.pack()
    voir = tk.BooleanVar()

    def basculer():
        c = '' if voir.get() else '●'
        e1.config(show=c)
        e2.config(show=c)
    tk.Checkbutton(f, text='Afficher la phrase', variable=voir, command=basculer).pack(anchor='w', pady=(4, 0))
    msg = tk.Label(f, text='', fg='#b00020', font=('Segoe UI', 10))
    msg.pack(anchor='w', pady=(6, 0))

    def valider(_=None):
        a, b = e1.get(), e2.get()
        if len(a) < PHRASE_MIN:
            msg.config(text='Trop courte : %d caracteres, minimum %d.' % (len(a), PHRASE_MIN))
            return
        if a != b:
            msg.config(text='Les deux cases ne concordent pas.')
            return
        res['p'] = a
        w.destroy()
    tk.Button(f, text='Creer la cle', command=valider, font=('Segoe UI', 10, 'bold'), padx=12).pack(pady=(10, 0))
    w.bind('<Return>', valider)
    w.after(200, lambda: (w.focus_force(), e1.focus_set()))
    w.mainloop()
    return res['p']


def creer_cle(fenetre=False):
    d = dossier_cle()
    prive = d / NOM_CLE_PRIVEE
    if CLE_PUBLIQUE.exists() or prive.exists():
        sys.exit('Une cle existe deja. Refus de la remplacer : les sauvegardes deja chiffrees '
                 'deviendraient illisibles. (%s / %s)' % (CLE_PUBLIQUE, prive))
    if fenetre:
        p1 = phrase_par_fenetre()
        if not p1:
            sys.exit('Fenetre fermee : aucune cle creee.')
        print('Phrase recue. Generation de la cle (10 a 30 s)...', flush=True)
    else:
        print('Choisis une PHRASE SECRETE d\'au moins %d caracteres (ex. 4-5 mots sans lien).' % PHRASE_MIN)
        print('Note-la sur papier et range-la au coffre : sans elle, AUCUNE sauvegarde chiffree ne se relit.')
    while not fenetre:
        p1 = getpass.getpass('Phrase secrete : ')
        if len(p1) < PHRASE_MIN:
            print('Trop courte (%d caracteres, minimum %d).' % (len(p1), PHRASE_MIN))
            continue
        if getpass.getpass('Retape-la : ') != p1:
            print('Les deux ne concordent pas, on recommence.')
            continue
        break
    priv = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    pem_prive = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                   serialization.BestAvailableEncryption(p1.encode('utf-8')))
    pem_pub = priv.public_key().public_bytes(serialization.Encoding.PEM,
                                             serialization.PublicFormat.SubjectPublicKeyInfo)
    # Preuve avant d'ecrire quoi que ce soit : aller-retour complet avec la phrase tapee.
    essai = os.urandom(64)
    d.mkdir(parents=True, exist_ok=True)
    CLE_PUBLIQUE.write_bytes(pem_pub)
    if dechiffrer(chiffrer(essai), pem_prive, p1) != essai:
        CLE_PUBLIQUE.unlink()
        sys.exit('Echec de l\'aller-retour : rien n\'est garde.')
    prive.write_bytes(pem_prive)
    if prive.read_bytes() != pem_prive:
        sys.exit('Copie SharePoint de la cle privee differente : verifier %s' % prive)
    print('\nOK. Cle publique : %s' % CLE_PUBLIQUE)
    print('    Cle privee (protegee par la phrase) : %s' % prive)
    print('    Aller-retour chiffrer/dechiffrer verifie.')


def demander_phrase(titre='Cle de sauvegarde e-Trak'):
    """Une case masquee dans une fenetre (la console n'a pas fonctionne chez Jacquot le
    2026-11-04) ; repli sur la console si aucune fenetre n'est possible."""
    try:
        import tkinter as tk
    except Exception:
        return getpass.getpass('Phrase secrete : ')
    res = {'p': ''}
    w = tk.Tk()
    w.title(titre)
    w.attributes('-topmost', True)
    f = tk.Frame(w, padx=18, pady=14)
    f.pack()
    tk.Label(f, text='Phrase secrete des sauvegardes :', font=('Segoe UI', 10, 'bold')).pack(anchor='w')
    e = tk.Entry(f, show='●', width=44, font=('Segoe UI', 11))
    e.pack(pady=(4, 8))

    def ok(_=None):
        res['p'] = e.get()
        w.destroy()
    tk.Button(f, text='OK', command=ok, padx=16).pack()
    w.bind('<Return>', ok)
    w.after(200, lambda: (w.focus_force(), e.focus_set()))
    w.mainloop()
    return res['p']


def tester():
    prive = dossier_cle() / NOM_CLE_PRIVEE
    phrase = demander_phrase()
    essai = os.urandom(64)
    try:
        ok = dechiffrer(chiffrer(essai), prive.read_bytes(), phrase) == essai
    except Exception as e:
        ok = False
        print('Erreur : %s' % (e.__class__.__name__))
    print('OK : la phrase ouvre bien la cle privee.' if ok else 'ECHEC : mauvaise phrase ou cle abimee.')
    return 0 if ok else 1


def dechiffrer_fichier(fichier, vers):
    prive = dossier_cle() / NOM_CLE_PRIVEE
    phrase = demander_phrase()
    clair = dechiffrer(Path(fichier).read_bytes(), prive.read_bytes(), phrase)
    vers = Path(vers)
    vers.mkdir(parents=True, exist_ok=True)
    sortie = vers / Path(fichier).name.replace('.chiffre', '')
    if sortie.exists():
        sys.exit('Refus d\'ecraser %s' % sortie)
    sortie.write_bytes(clair)
    print('Dechiffre : %s (%d octets). A SUPPRIMER apres usage : il contient des mots de passe.'
          % (sortie, len(clair)))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--creer-cle', action='store_true')
    g.add_argument('--creer-cle-fenetre', action='store_true')
    g.add_argument('--tester', action='store_true')
    g.add_argument('--dechiffrer', metavar='FICHIER')
    ap.add_argument('--vers', default='.')
    a = ap.parse_args()
    if a.creer_cle or a.creer_cle_fenetre:
        creer_cle(fenetre=a.creer_cle_fenetre)
    elif a.tester:
        sys.exit(tester())
    else:
        dechiffrer_fichier(a.dechiffrer, a.vers)
