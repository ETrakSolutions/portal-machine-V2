/**
 * Verification de version — affiche une banniere si une nouvelle version
 * du portail est deployee, pour eviter aux utilisateurs de rester bloques
 * sur du code obsolete (cache navigateur).
 *
 * Mecanisme:
 * - Au chargement, fetch /version.json et memorise la version courante
 * - Toutes les 5 minutes, refetch. Si version differente, affiche une banniere
 *   avec un bouton "Recharger" qui force location.reload(true)
 */
(function() {
  var VERSION_URL = 'version.json';
  var CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min
  var INITIAL_VERSION = null;

  function fetchVersion() {
    // Cache-bust avec timestamp pour TOUJOURS avoir la derniere
    return fetch(VERSION_URL + '?t=' + Date.now())
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { return data && data.v ? data.v : null; })
      .catch(function() { return null; });
  }

  function showUpdateBanner() {
    if (document.getElementById('__update_banner__')) return; // deja affichee
    var bar = document.createElement('div');
    bar.id = '__update_banner__';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9998;' +
      'background:linear-gradient(90deg,#FFB74D,#FF9800);color:#000;' +
      'padding:0.7rem 1rem;text-align:center;font-family:Inter,Segoe UI,sans-serif;' +
      'font-size:0.92rem;font-weight:600;box-shadow:0 -2px 10px rgba(0,0,0,0.4);' +
      'display:flex;justify-content:center;align-items:center;gap:1rem;flex-wrap:wrap;';
    bar.innerHTML =
      '<span>&#128260; Nouvelle version du portail disponible</span>' +
      '<button id="__update_reload__" style="background:#000;color:#FFB74D;border:none;' +
      'padding:0.4rem 0.9rem;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.85rem">' +
      'Recharger maintenant</button>' +
      '<button id="__update_dismiss__" style="background:transparent;color:#000;border:1px solid rgba(0,0,0,0.3);' +
      'padding:0.4rem 0.7rem;border-radius:6px;cursor:pointer;font-size:0.85rem">Plus tard</button>';
    document.body.appendChild(bar);
    document.getElementById('__update_reload__').onclick = function() {
      location.reload();
    };
    document.getElementById('__update_dismiss__').onclick = function() {
      bar.remove();
    };
  }

  function checkVersion() {
    fetchVersion().then(function(currentVersion) {
      if (!currentVersion) return;
      if (INITIAL_VERSION === null) {
        INITIAL_VERSION = currentVersion;
        return;
      }
      if (currentVersion !== INITIAL_VERSION) {
        showUpdateBanner();
      }
    });
  }

  // Demarre les checks
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      checkVersion();
      setInterval(checkVersion, CHECK_INTERVAL_MS);
    });
  } else {
    checkVersion();
    setInterval(checkVersion, CHECK_INTERVAL_MS);
  }
})();
