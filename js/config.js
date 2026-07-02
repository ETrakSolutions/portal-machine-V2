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
