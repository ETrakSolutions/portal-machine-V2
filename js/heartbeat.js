/**
 * Heartbeat utilisateur — chaque page du portail envoie un "ping" toutes les 10 min
 * a l'API. Le ping contient deux timestamps:
 *  - lastPing      : moment du ping (toujours = maintenant)
 *  - lastActivity  : derniere interaction (souris/clavier/scroll/focus)
 *
 * Permet a l'admin de distinguer:
 *  - Actif      : page + interaction recente (< 3 min)
 *  - Inactif    : page ouverte mais aucune interaction depuis > 3 min
 *  - Deconnecte : pas de ping depuis > 12 min
 *
 * Cle API: user_active_<email_sanitized>
 * Valeur: JSON {"lastPing":"...ISO...","lastActivity":"...ISO..."}
 */
(function() {
  var API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';

  function getUser() {
    try { return JSON.parse(localStorage.getItem('portal_user')); } catch(e) { return null; }
  }
  // Token de session du login (le backend accepte token ou PIN script dans le champ 'pin')
  function getToken() {
    var u = getUser();
    return (u && u.token) || '';
  }

  // Suivi de l'activite reelle
  var lastActivityTs = Date.now();
  function markActivity() { lastActivityTs = Date.now(); }
  // Evenements consideres comme "interaction"
  ['mousedown','mousemove','keydown','scroll','touchstart','click','focus'].forEach(function(ev) {
    window.addEventListener(ev, markActivity, { passive: true, capture: true });
  });
  // Tab focus/blur — bonus: au focus, c'est aussi une activite
  window.addEventListener('focus', markActivity);

  window.startUserHeartbeat = function() {
    var user = getUser();
    if (!user || !user.email) return;
    var key = 'user_active_' + user.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    function ping() {
      var payload = {
        lastPing: new Date().toISOString(),
        lastActivity: new Date(lastActivityTs).toISOString()
      };
      fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({
          action: 'save',
          key: key,
          value: JSON.stringify(payload),
          pin: getToken()
        })
      }).catch(function(){});
    }
    ping(); // immediate
    setInterval(ping, 10 * 60 * 1000); // every 10 minutes
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.startUserHeartbeat);
  } else {
    window.startUserHeartbeat();
  }
})();
