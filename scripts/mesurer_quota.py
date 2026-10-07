"""Mesure le quota des proprietes du serveur du portail (500 Ko pour TOUT le portail).

Action serveur 'quota' (version 40, 2026-10-07), avec le NIP : total, libre, et le poids
de chaque famille de cles — jamais une valeur, jamais un nom de cle (une cle peut porter
un courriel ou un jeton de session). Lecture seule.

    py -3.13 scripts/mesurer_quota.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from publier_prix import read_pin, post, REPO  # noqa: E402


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    r = post({'action': 'quota', 'pin': read_pin(REPO / 'PIN Portail.txt')})
    if not r.get('ok'):
        sys.exit('Refus du serveur : %s' % r.get('error', r))
    ko = lambda o: '%7.1f Ko' % (o / 1024)
    print('Utilise : %s sur %s (%d cles) — libre : %s (%.0f %%)'
          % (ko(r['total']).strip(), ko(r['plafond']).strip(), r['cles'], ko(r['libre']).strip(),
             100 * r['libre'] / r['plafond']))
    print()
    for f in r['familles']:
        print('%s  %5.1f %%  %4d cle(s)  %s' % (ko(f['octets']), 100 * f['octets'] / r['plafond'], f['cles'], f['famille']))


if __name__ == '__main__':
    main()
