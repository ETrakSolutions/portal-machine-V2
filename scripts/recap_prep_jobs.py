"""Recapitulatif du matin de la Preparation des jobs (decision Jacquot, 2026-10-15).

Chaque matin de semaine, Luna recoit par courriel les jobs ProgressionLive a completer
(installations et SAV des 30 prochains jours) : il manque la commande PDF, le contact sur
place avec un telephone de 10 chiffres, ou l'emplacement. Memes regles que la page
prep-jobs.html : le calcul est celui du serveur (Code.gs, via scripts/prep_jobs_local.js),
et un SAV n'exige pas de commande (on ne sait pas encore ce qui sera change).

Envoi par Outlook classique (COM) depuis la boite de Jacquot : le Gmail du serveur ne
livre pas. Le courriel ne porte aucun telephone, adresse ni nom de contact, comme la page.

    py -3.13 scripts/recap_prep_jobs.py              envoi du jour (une seule fois par jour,
                                                     en semaine, avant midi)
    py -3.13 scripts/recap_prep_jobs.py --apercu     ecrit le courriel en HTML, n'envoie rien
    py -3.13 scripts/recap_prep_jobs.py --a x@y.ca   envoie a x@y.ca seulement (essai)
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
HEURE_LIMITE = 12          # un rattrapage a l'ouverture de session n'envoie plus apres midi
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


def construire(prep, maintenant):
    jobs = prep.get('jobs') or []
    a_faire = [j for j in jobs if manques(j)]
    limite = maintenant + datetime.timedelta(days=URGENT_JOURS)
    urgentes, plus_tard = [], []
    for j in a_faire:
        d = date_locale(j.get('rv'))
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
                '<td %s nowrap>%s</td><td %s>%s%s</td><td %s>%s</td><td %s style="color:#c0392b">%s</td></tr>' % (
                    td, e(fmt_date(date_locale(j.get('rv')))), td, e(j.get('code', '')), e(j.get('type', '')),
                    td, e(j.get('noCommande') or '—'),
                    td, e(j.get('client', '')), ('<br><span style="color:#777">%s</span>' % lieu) if lieu else '',
                    td, e(j.get('tech', '')),
                    td.replace('style="', 'style="color:#c0392b;font-weight:bold;'), e(', '.join(manques(j)))))
        return ('<table cellspacing="0" style="border-collapse:collapse;width:100%%;font-family:Segoe UI,Arial">'
                '<tr><th %s>Date</th><th %s>Job</th><th %s># Commande</th><th %s>Client / emplacement</th>'
                '<th %s>Technicien</th><th %s>Il manque</th></tr>%s</table>') % (th, th, th, th, th, th, ''.join(lignes))

    corps = ['<div style="font-family:Segoe UI,Arial;font-size:14px;color:#222">',
             '<p>Bonjour Luna,</p>',
             '<p><b>%d job(s) sur %d à compléter dans ProgressionLive</b> (installations et SAV du %s au %s).<br>'
             '<span style="color:#555">%d sans commande PDF · %d sans contact complet · %d sans emplacement. '
             'Un SAV n\'exige pas de commande.</span></p>' % (
                 len(a_faire), len(jobs), e(prep.get('du', '')), e(prep.get('au', '')), n_cmd, n_contact, n_lieu)]
    if urgentes:
        corps.append('<h3 style="color:#c0392b;margin:18px 0 6px">Dans %d jours ou moins (%d)</h3>' % (URGENT_JOURS, len(urgentes)))
        corps.append(tableau(urgentes))
    if plus_tard:
        corps.append('<h3 style="margin:18px 0 6px">Plus tard (%d)</h3>' % len(plus_tard))
        corps.append(tableau(plus_tard))
    corps.append('<p style="margin-top:18px">La liste à jour : <a href="%s">Préparation des jobs</a> '
                 '(portail e-Trak).</p>' % PAGE)
    corps.append('<p style="color:#888;font-size:12px">Envoyé automatiquement chaque matin de semaine. '
                 'Rien n\'est envoyé quand toutes les jobs sont complètes.</p></div>')
    d = maintenant
    sujet = 'Préparation des jobs — %d à compléter (%s %d %s)' % (len(a_faire), JOURS[d.weekday()], d.day, MOIS[d.month - 1])
    return a_faire, sujet, ''.join(corps)


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apercu', action='store_true')
    ap.add_argument('--a', action='append')
    ap.add_argument('--forcer', action='store_true')
    o = ap.parse_args()
    maintenant = datetime.datetime.now().astimezone()
    jour = maintenant.date().isoformat()
    print('==== %s' % maintenant.strftime('%Y-%m-%d %H:%M'))
    reel = not o.apercu and not o.a
    if reel and not o.forcer:
        if maintenant.weekday() >= 5:
            print('fin de semaine : rien')
            return 0
        if ETAT.exists() and ETAT.read_text(encoding='utf-8').strip() == jour:
            print('deja fait aujourd\'hui : rien')
            return 0
        if maintenant.hour >= HEURE_LIMITE:
            print('apres %dh : le recapitulatif du jour n\'est plus envoye' % HEURE_LIMITE)
            return 0
    prep = lire_jobs()
    a_faire, sujet, corps = construire(prep, maintenant)
    print('%d jobs, %d a completer' % (len(prep.get('jobs') or []), len(a_faire)))
    if o.apercu:
        f = pathlib.Path(tempfile.gettempdir()) / 'recap_prep_jobs_apercu.html'
        f.write_text('<meta charset="utf-8"><p><b>Sujet :</b> %s</p><hr>%s' % (html.escape(sujet), corps), encoding='utf-8')
        print('apercu : %s' % f)
        return 0
    if not a_faire:
        print('toutes les jobs sont completes : rien a envoyer')
    else:
        dest = o.a or DESTINATAIRES
        envoyer(dest, sujet, corps)
        print('envoye a %s : %s' % (', '.join(dest), sujet))
    if reel:
        ETAT.parent.mkdir(parents=True, exist_ok=True)
        ETAT.write_text(jour, encoding='utf-8')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as ex:
        print('ERREUR : %s' % ex)
        sys.exit(1)
