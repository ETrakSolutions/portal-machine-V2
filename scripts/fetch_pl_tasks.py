#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Pagine toutes les taches ProgressionLive (startResult/maxResults) et ecrit en UTF-8."""
import json, os, urllib.request, urllib.parse, sys
sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = open(os.path.join(ROOT, 'Cle Progression Live.txt'), encoding='utf-8').read().strip().split()[0]
BASE = 'https://ecotrakindustrie.progressionlive.com/server/rest/task/list'
OUT = os.path.join(ROOT, '_pl_installs_desc.jsonl')

seen = set()
total = 0
empty_streak = 0
with open(OUT, 'w', encoding='utf-8') as out:
    st = 0
    while True:
        url = BASE + '?' + urllib.parse.urlencode(
            {'apiKey': KEY, 'maxResults': 500, 'startResult': st, 'type': 6,
             'order': 'created DESC', 'onlyFieldsToInclude': 'properties,created'})
        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print(f"startResult {st} -> ERREUR {e} (on continue)")
            data = []
        if not isinstance(data, list):
            print("reponse non-liste:", str(data)[:160])
            break
        new = 0
        for t in data:
            tid = t.get('id')
            if tid in seen:
                continue
            seen.add(tid)
            out.write(json.dumps(t, ensure_ascii=False) + '\n')
            new += 1
            total += 1
        print(f"startResult {st} -> recu {len(data)}, nouveaux {new}, total {total}")
        # arret seulement quand une page renvoie 0 element (vrai bout de liste)
        if len(data) == 0:
            empty_streak += 1
            if empty_streak >= 2:
                break
        else:
            empty_streak = 0
        st += 500
        if st > 120000:
            print("safety stop")
            break
print(f"TERMINE: {total} taches Installation uniques -> {OUT}")
