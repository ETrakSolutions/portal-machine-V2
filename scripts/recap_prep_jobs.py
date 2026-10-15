"""Recapitulatif de la Preparation des jobs, par courriel a Luna (decision Jacquot, 2026-10-15).

Deux envois par jour de semaine :
  8 h   les jobs du lendemain dont la case « Confirmer client » n'est pas cochee (le
        vendredi : samedi, dimanche et lundi), puis les jobs a completer ;
  13 h  rappel des jobs encore a confirmer pour le lendemain, s'il en reste.
Les ressources d'attente (_A Planifier, _HOLD, _Pas pret) ne sont jamais a confirmer ni
urgentes : leur date n'est pas reelle.

Jobs a completer : installations et SAV des 30 prochains jours auxquels il manque la
commande PDF, le contact sur place avec un telephone de 10 chiffres, ou l'emplacement.
Memes regles que la page prep-jobs.html : le calcul est celui du serveur (Code.gs, via
scripts/prep_jobs_local.js), et un SAV n'exige pas de commande (on ne sait pas encore ce
qui sera change).

Envoi par Outlook classique (COM) depuis la boite de Jacquot (le portable doit etre
allume, session ouverte) : le Gmail du serveur ne livre pas. Le courriel ne porte aucun
telephone, adresse ni nom de contact, comme la page.

    py -3.13 scripts/recap_prep_jobs.py              envoi du creneau en cours (une fois par
                                                     creneau : 8 h-midi, 13 h-17 h, en semaine)
    py -3.13 scripts/recap_prep_jobs.py --apercu     ecrit le courriel en HTML, n'envoie rien
    py -3.13 scripts/recap_prep_jobs.py --a x@y.ca   envoie a x@y.ca seulement (essai)
    --creneau matin|midi                             choisit le creneau (essai, apercu)
    --forcer                                         ignore le jour, l'heure et l'envoi deja fait

Cle ProgressionLive : coffre Windows (keyring progressionlive-portail / jcaron).
Journal : %USERPROFILE%/CLAUDE_CODE/recap_prep_jobs.log (via lancer_recap_prep_jobs.cmd).
Code de sortie : 0 envoye ou rien a envoyer, 1 erreur.
"""
import argparse
import datetime
import html
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unicodedata

DESTINATAIRES = ['dluna@e-trak.ca']
PAGE = 'https://etraksolutions.github.io/portal-machine-V2/prep-jobs.html'
URGENT_JOURS = 3
HEURE_DEBUT = 8            # une ouverture de session avant 8 h n'envoie rien : la tache de 8 h le fera
HEURE_LIMITE = 12          # un rattrapage a l'ouverture de session n'envoie plus le matin apres midi
HEURE_MIDI, HEURE_MIDI_FIN = 13, 17   # rappel « Confirmer client » de 13 h (rattrapage jusqu'a 17 h)
REPO = pathlib.Path(__file__).resolve().parent.parent
ETAT = pathlib.Path.home() / 'CLAUDE_CODE' / 'recap_prep_jobs.etat'
JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']


def lire_jobs():
    import keyring
    cle = keyring.get_password('progressionlive-portail', 'jcaron')
    if not cle:
        raise RuntimeError('cle ProgressionLive absente du coffre (progressionlive-portail / jcaron)')
    r = subprocess.run(['node', str(REPO / 'scripts' / 'prep_jobs_local.js')], capture_output=True,
                       env=dict(os.environ, PL_KEY=cle), timeout=300)
    if r.returncode != 0:
        raise RuntimeError('lecture ProgressionLive : ' + r.stderr.decode('utf-8', 'replace')[-400:])
    return json.loads(r.stdout.decode('utf-8'))


def _norm(s):
    return unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().strip().lower()


# --- memes regles que js/prep-jobs.js ---
def est_sav(j):
    return _norm(j.get('type')) == 'sav'


def en_attente(j):
    """Ressource d'attente (« _A Planifier », « _HOLD », « _Pas prêt ») : date pas reelle."""
    return str(j.get('tech') or '').strip().startswith('_')


def manques(j):
    m = []
    if not (est_sav(j) or j.get('commande')):
        m.append('commande PDF')
    if not (j.get('contactNom') and j.get('telOk')):
        if not j.get('contactNom') and not j.get('telChiffres'):
            m.append('contact sur place')
        else:
            if not j.get('contactNom'):
                m.append('nom du contact')
            if not j.get('telOk'):
                m.append('téléphone (%d chiffres)' % j['telChiffres'] if j.get('telChiffres') else 'téléphone')
    if not j.get('emplacement'):
        m.append('emplacement')
    return m


def date_locale(iso):
    if not iso:
        return None
    return datetime.datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone()


def fmt_date(d):
    if not d:
        return 'Sans date'
    return '%s %d %s · %s' % (JOURS[d.weekday()][:3] + '.', d.day, MOIS[d.month - 1], d.strftime('%H:%M'))


def jours_cibles(d):
    """Jours couverts par le rappel « Confirmer client » : le lendemain ; le vendredi,
    samedi + dimanche + lundi (decision Jacquot, 2026-10-15). Rien la fin de semaine."""
    if d.weekday() >= 5:
        return []
    return [d + datetime.timedelta(days=n) for n in ((1, 2, 3) if d.weekday() == 4 else (1,))]


def fmt_jours(jours):
    noms = ['%s %d %s' % (JOURS[x.weekday()], x.day, MOIS[x.month - 1]) for x in jours]
    if not noms:
        return ''
    return noms[0] if len(noms) == 1 else ', '.join(noms[:-1]) + ' et ' + noms[-1]


def construire(prep, maintenant, creneau):
    """creneau 'matin' : a confirmer + jobs a completer ; 'midi' : a confirmer seulement."""
    jobs = prep.get('jobs') or []
    a_faire = [j for j in jobs if manques(j)]
    cibles = jours_cibles(maintenant.date())
    # Case « Confirmer client » pas cochee la veille (decision Jacquot, 2026-10-15)
    a_confirmer = [j for j in jobs if not j.get('confirme') and not en_attente(j)
                   and date_locale(j.get('rv')) and date_locale(j.get('rv')).date() in cibles]
    limite = maintenant + datetime.timedelta(days=URGENT_JOURS)
    # Ressource d'attente : jamais urgente, section a part ; meme regle que la page.
    urgentes, plus_tard, attente = [], [], []
    for j in a_faire:
        d = date_locale(j.get('rv'))
        if en_attente(j):
            attente.append(j)
        else:
            (urgentes if d and d <= limite else plus_tard).append(j)
    n = lambda f: sum(1 for j in jobs if f(j))
    n_cmd = n(lambda j: not (est_sav(j) or j.get('commande')))
    n_contact = n(lambda j: not (j.get('contactNom') and j.get('telOk')))
    n_lieu = n(lambda j: not j.get('emplacement'))

    e = html.escape
    td = 'style="padding:6px 8px;border-bottom:1px solid #e3e3e3;vertical-align:top;font-size:13px"'
    th = 'style="padding:6px 8px;border-bottom:2px solid #999;text-align:left;font-size:12px;color:#555"'

    def tableau(liste):
        lignes = []
        for j in liste:
            lieu = e(j.get('lieu') or '') + (' — ' + e(j['ville']) if j.get('lieu') and j.get('ville') else '')
            lignes.append(
                '<tr><td %s nowrap>%s</td><td %s nowrap><b>%s</b><br><span style="color:#777">%s</span></td>'
                '<td %s nowrap>%s</td><td %s>%s%s</td><td %s>%s</td><td %s>%s</td></tr>' % (
                    td, e(fmt_date(date_locale(j.get('rv')))), td, e(j.get('code', '')), e(j.get('type', '')),
                    td, e(j.get('noCommande') or '—'),
                    td, e(j.get('client', '')), ('<br><span style="color:#777">%s</span>' % lieu) if lieu else '',
                    td, e(j.get('tech', '')),
                    td.replace('style="', 'style="color:#c0392b;font-weight:bold;'), e(', '.join(manques(j)) or '—')))
        return ('<table cellspacing="0" style="border-collapse:collapse;width:100%%;font-family:Segoe UI,Arial">'
                '<tr><th %s>Date</th><th %s>Job</th><th %s># Commande</th><th %s>Client / emplacement</th>'
                '<th %s>Technicien</th><th %s>Il manque</th></tr>%s</table>') % (th, th, th, th, th, th, ''.join(lignes))

    corps = ['<div style="font-family:Segoe UI,Arial;font-size:14px;color:#222">', '<p>Bonjour Luna,</p>']
    if a_confirmer:
        corps.append('<h3 style="color:#c0392b;margin:18px 0 6px">À confirmer avec le client : %s (%d)</h3>'
                     '<p style="margin:0 0 6px;color:#555">La case « Confirmer client » n\'est pas cochée dans '
                     'ProgressionLive. Appeler le client, puis cocher la case.</p>' % (e(fmt_jours(cibles)), len(a_confirmer)))
        corps.append(tableau(a_confirmer))
    if creneau == 'matin':
        corps.append('<p style="margin-top:18px"><b>%d job(s) sur %d à compléter dans ProgressionLive</b> '
                     '(installations et SAV du %s au %s).<br>'
                     '<span style="color:#555">%d sans commande PDF · %d sans contact complet · %d sans emplacement. '
                     'Un SAV n\'exige pas de commande.</span></p>' % (
                         len(a_faire), len(jobs), e(prep.get('du', '')), e(prep.get('au', '')), n_cmd, n_contact, n_lieu))
        if urgentes:
            corps.append('<h3 style="color:#c0392b;margin:18px 0 6px">Dans %d jours ou moins (%d)</h3>' % (URGENT_JOURS, len(urgentes)))
            corps.append(tableau(urgentes))
        if plus_tard:
            corps.append('<h3 style="margin:18px 0 6px">Plus tard (%d)</h3>' % len(plus_tard))
            corps.append(tableau(plus_tard))
        if attente:
            corps.append('<h3 style="margin:18px 0 6px;color:#555">En attente : à planifier, HOLD, pas prêt (%d)</h3>' % len(attente))
            corps.append(tableau(attente))
    corps.append('<p style="margin-top:18px">La liste à jour : <a href="%s">Préparation des jobs</a> '
                 '(portail e-Trak).</p>' % PAGE)
    corps.append('<p style="color:#888;font-size:12px">Envoyé automatiquement en semaine : à 8 h (jobs à confirmer '
                 'et à compléter), et à 13 h s\'il reste des jobs à confirmer avec le client.</p></div>')
    d = maintenant
    quand = '%s %d %s' % (JOURS[d.weekday()], d.day, MOIS[d.month - 1])
    if creneau == 'midi':
        sujet = 'Rappel : %d job(s) à confirmer avec le client (%s)' % (len(a_confirmer), fmt_jours(cibles))
        a_envoyer = bool(a_confirmer)
    else:
        sujet = 'Préparation des jobs — %s%d à compléter (%s)' % (
            ('%d à confirmer, ' % len(a_confirmer)) if a_confirmer else '', len(a_faire), quand)
        a_envoyer = bool(a_confirmer or a_faire)
    return a_envoyer, len(a_faire), len(a_confirmer), sujet, ''.join(corps)


def envoyer(a, sujet, corps):
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    ol = win32com.client.Dispatch('Outlook.Application')
    m = ol.CreateItem(0)
    m.To = '; '.join(a)
    m.Subject = sujet
    m.HTMLBody = corps
    m.Send()


def creneau_de(maintenant):
    if HEURE_DEBUT <= maintenant.hour < HEURE_LIMITE:
        return 'matin'
    if HEURE_MIDI <= maintenant.hour < HEURE_MIDI_FIN:
        return 'midi'
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apercu', action='store_true')
    ap.add_argument('--a', action='append')
    ap.add_argument('--forcer', action='store_true')
    ap.add_argument('--creneau', choices=['matin', 'midi'])
    o = ap.parse_args()
    maintenant = datetime.datetime.now().astimezone()
    jour = maintenant.date().isoformat()
    print('==== %s' % maintenant.strftime('%Y-%m-%d %H:%M'))
    reel = not o.apercu and not o.a
    creneau = o.creneau or creneau_de(maintenant)
    faits = set(ETAT.read_text(encoding='utf-8').split('\n')) if ETAT.exists() else set()
    if reel and not o.forcer:
        if maintenant.weekday() >= 5:
            print('fin de semaine : rien')
            return 0
        if not creneau:
            print('hors des creneaux (%d h-%d h, %d h-%d h) : rien' % (HEURE_DEBUT, HEURE_LIMITE, HEURE_MIDI, HEURE_MIDI_FIN))
            return 0
        if '%s %s' % (jour, creneau) in faits:
            print('%s deja fait aujourd\'hui : rien' % creneau)
            return 0
    creneau = creneau or 'matin'
    prep = lire_jobs()
    a_envoyer, n_faire, n_conf, sujet, corps = construire(prep, maintenant, creneau)
    print('%s : %d jobs, %d a completer, %d a confirmer' % (creneau, len(prep.get('jobs') or []), n_faire, n_conf))
    if o.apercu:
        f = pathlib.Path(tempfile.gettempdir()) / ('recap_prep_jobs_apercu_%s.html' % creneau)
        f.write_text('<meta charset="utf-8"><p><b>Sujet :</b> %s</p><hr>%s' % (html.escape(sujet), corps), encoding='utf-8')
        print('apercu : %s' % f)
        return 0
    if not a_envoyer:
        print('rien a envoyer')
    else:
        dest = o.a or DESTINATAIRES
        envoyer(dest, sujet, corps)
        print('envoye a %s : %s' % (', '.join(dest), sujet))
    if reel:
        ETAT.parent.mkdir(parents=True, exist_ok=True)
        depuis = (maintenant.date() - datetime.timedelta(days=7)).isoformat()
        garde = sorted(x for x in faits if x[:10] >= depuis)
        ETAT.write_text('\n'.join(garde + ['%s %s' % (jour, creneau)]), encoding='utf-8')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as ex:
        print('ERREUR : %s' % ex)
        sys.exit(1)
