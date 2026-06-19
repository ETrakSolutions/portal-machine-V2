/*
 * overrides-loader.js — chargement des overrides BOM/notes decoupes par type.
 *
 * Chaque type de machine a son propre fichier data/overrides/<slug>.json
 * (structure miroir : { "<Type>": { fab: { annee: { modele: { _bom, _notes } } } } }).
 * Avantages : reste loin du plafond 1 Mo par fichier, ecritures isolees par type
 * (editer une grue ne touche pas le fichier des excavatrices), saves plus rapides.
 *
 * window.loadMergedOverrides() fusionne les 8 fichiers + l'ancien data/overrides.json
 * (repli) en UN seul objet { type: { fab: { annee: { modele: {...} } } } } — identique
 * a ce que le frontend recevait avant. Le repli garantit un rollout sans casse meme si
 * le backend n'a pas encore bascule en ecriture par type.
 */
(function () {
  'use strict';

  // Table CANONIQUE type -> slug (doit etre identique cote Apps Script et script de migration).
  var TYPE_SLUGS = {
    'Excavatrice': 'excavatrice',
    'Pompe a Beton': 'pompe-a-beton',
    'Grue Mobile': 'grue-mobile',
    'Camion Girafe (Boom Truck)': 'camion-girafe',
    'Telehandler': 'telehandler',
    'Foreuse': 'foreuse',
    'Camion Vacuum': 'camion-vacuum',
    'Retrocaveuse': 'retrocaveuse',
    'Loader': 'loader',
    'Nacelle': 'nacelle'
  };
  window.ETRAK_TYPE_SLUGS = TYPE_SLUGS;

  function typeFiles() {
    var arr = [];
    for (var t in TYPE_SLUGS) { arr.push('data/overrides/' + TYPE_SLUGS[t] + '.json'); }
    return arr;
  }

  // cache:'no-cache' -> revalidation conditionnelle (ETag) : toujours frais apres un save,
  // 304 leger si inchange (remplace l'ancien ?t=Date.now() qui re-telechargeait a chaque fois).
  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  }

  // Fusionne au niveau du type (chaque fichier ne contient qu'un type).
  // Les fichiers par type ont priorite sur le repli legacy.
  function mergeInto(dest, part) {
    if (!part) return;
    for (var t in part) {
      if (!dest[t]) { dest[t] = part[t]; continue; }
      for (var f in part[t]) {
        if (!dest[t][f]) { dest[t][f] = part[t][f]; continue; }
        for (var y in part[t][f]) {
          if (!dest[t][f][y]) { dest[t][f][y] = part[t][f][y]; continue; }
          for (var m in part[t][f][y]) { dest[t][f][y][m] = part[t][f][y][m]; }
        }
      }
    }
  }

  window.loadMergedOverrides = function () {
    // 1) repli legacy d'abord (priorite la plus basse), 2) fichiers par type ensuite.
    // Revalidation via fetchJson (cache:'no-cache') -> plus besoin de buster dans l'URL.
    var sources = ['data/overrides.json'].concat(typeFiles());
    return Promise.all(sources.map(fetchJson)).then(function (parts) {
      var merged = {};
      parts.forEach(function (p) { mergeInto(merged, p); });
      return merged;
    });
  };
})();
