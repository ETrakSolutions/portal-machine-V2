/*
 * config.js — Configuration centralisee du Portail Machine V2 (audit #32).
 * DOIT etre charge en PREMIER sur chaque page (avant heartbeat/app/admin/soumission
 * et avant tout <script> inline qui utilise l'API).
 *
 * URL du Web App Apps Script (backend). AVANT : cette URL etait dupliquee en dur
 * dans ~8 fichiers -> un changement de deploiement obligeait a editer chacun.
 * Maintenant : un seul endroit a changer si le deploiement Apps Script change.
 */
window.PORTAL_API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';

/*
 * Lecture des cles du serveur (correctif « lecture publique », 2026-10-06).
 * Certaines cles ne se lisent plus par le GET public : elles passent par l'action
 * authentifiee 'getprivate' avec le jeton de session deja stocke dans le navigateur.
 * MIROIR de PRIVATE_READ_KEYS / ADMIN_READ_PREFIXES (apps-script/Code.gs) : les deux
 * listes doivent rester identiques.
 * portalFetchKey(cle) rend une promesse de Response, comme fetch() : les appelants
 * gardent leur .then(function(r){ return r.json(); }) et lisent data.value. Sans
 * session, le serveur repond { error } : data.value est absent, comme une cle vide.
 */
window.PORTAL_PRIVATE_KEYS = ['machine_requests', 'machine_request_emails', 'notes_emails',
                              'target_emails', 'kit_emails', 'db_changelog'];
window.PORTAL_PRIVATE_PREFIXES = ['user_active_', 'inactivity_notice_'];
window.portalIsPrivateKey = function (key) {
  key = String(key || '');
  if (window.PORTAL_PRIVATE_KEYS.indexOf(key) >= 0) return true;
  for (var i = 0; i < window.PORTAL_PRIVATE_PREFIXES.length; i++) {
    if (key.indexOf(window.PORTAL_PRIVATE_PREFIXES[i]) === 0) return true;
  }
  return false;
};
window.portalFetchKey = function (key) {
  if (!window.portalIsPrivateKey(key)) {
    return fetch(window.PORTAL_API_URL + '?action=get&key=' + encodeURIComponent(key));
  }
  var jeton = '';
  try { jeton = (JSON.parse(localStorage.getItem('portal_user')) || {}).token || ''; } catch (e) {}
  return fetch(window.PORTAL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'getprivate', key: key, token: jeton })
  });
};
