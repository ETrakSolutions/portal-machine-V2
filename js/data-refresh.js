/**
 * Rafraichissement transparent des donnees editables (data/overrides.json).
 *
 * Toutes les ~20 s, recharge overrides.json avec une URL unique (?t=) pour contourner
 * le cache CDN de GitHub Pages (la revalidation 'no-cache' n'y est pas fiable).
 * Si le contenu a change depuis le dernier chargement, appelle
 * window.__onOverridesChanged(ov) — chaque page decide comment se mettre a jour
 * sans perturber une saisie/edition en cours.
 *
 * But : l'utilisateur n'a JAMAIS besoin de rafraichir manuellement pour voir
 * les modifications faites dans edit-machine.
 */
(function () {
  var START_DELAY_MS = 8000;   // 1er passage (baseline) peu apres le boot
  var INTERVAL_MS = 20000;     // puis revalidation toutes les 20 s
  var lastJson = null;

  function tick() {
    // Recharge les overrides decoupes par type (+ repli legacy) via le loader partage.
    // window.loadMergedOverrides() utilise deja une URL unique (?t=) pour contourner le CDN
    // GitHub Pages, ou 'cache:no-cache' (revalidation) n'est PAS fiable.
    var load = (typeof window.loadMergedOverrides === 'function')
      ? window.loadMergedOverrides()
      : fetch('data/overrides.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; });
    load
      .then(function (ov) {
        if (!ov) return;
        var s = JSON.stringify(ov);
        if (lastJson === null) { lastJson = s; return; }   // 1er passage = baseline
        if (s === lastJson) return;                          // rien de neuf
        lastJson = s;
        if (typeof window.__onOverridesChanged === 'function') {
          try { window.__onOverridesChanged(ov); } catch (e) { /* silencieux */ }
        }
      })
      .catch(function () { /* hors-ligne : on reessaie au prochain tick */ });
  }

  function start() { setTimeout(function () { tick(); setInterval(tick, INTERVAL_MS); }, START_DELAY_MS); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
