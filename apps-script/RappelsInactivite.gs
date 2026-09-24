/**
 * e-Trak Portal Machine V2 — Rappels d'inactivite des clients (Apps Script)
 *
 * Chaque matin, repere les clients (Dealer / Distributeur, comptes actifs) qui ne se
 * sont pas connectes au portail depuis plus de INACTIVITE_JOURS jours, et envoie UN
 * courriel amical par vendeur associe (vendeurEmail) listant ses clients concernes.
 * Demande de Steve et Jacquot, 2026-09-24.
 *
 * Donnees utilisees (aucune nouvelle collecte) :
 *  - user_active_<courriel> : { lastPing, lastActivity } ecrit par js/heartbeat.js
 *    toutes les 10 min quand le client a une page du portail ouverte ;
 *  - createdAt du compte : un compte cree il y a plus de 30 jours et jamais connecte
 *    compte comme inactif. Un compte sans aucune trace (ni activite ni date de
 *    creation, anciens comptes) n'est PAS signale : on ne peut pas dater son absence.
 *
 * Anti-repetition : inactivity_notice_<courriel> = date du dernier rappel pour ce
 * client. Au plus un rappel tous les INACTIVITE_JOURS jours, tant qu'il reste inactif.
 *
 * Fichier autonome : s'ajoute au projet a cote de API.gs (memes fonctions _users,
 * PROPS). A executer depuis l'editeur :
 *  - apercuRappelsInactivite()   : simulation, n'envoie RIEN (journal d'execution)
 *  - installerRappelsInactivite() : active l'envoi quotidien (8 h)
 *  - retirerRappelsInactivite()   : desactive l'envoi quotidien
 */

var INACTIVITE_JOURS = 30;
var INACTIVITE_ROLES = ['dealer', 'distributeur'];
var INACTIVITE_HEURE = 8;   // heure de l'envoi quotidien (fuseau du projet Apps Script)

function _cleCourriel(email) {
  return String(email || '').toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
}

function _dateMax(a, b) {
  if (!a) return b; if (!b) return a;
  return a > b ? a : b;
}

// Derniere trace d'un client : activite du portail, sinon date de creation du compte
function _derniereTrace(u) {
  var email = String(u.email || u.username || '').toLowerCase();
  var act = null;
  try {
    var hb = JSON.parse(PROPS.getProperty('user_active_' + _cleCourriel(email)) || 'null');
    if (hb) act = _dateMax(hb.lastActivity ? new Date(hb.lastActivity) : null, hb.lastPing ? new Date(hb.lastPing) : null);
  } catch (e) {}
  if (act && !isNaN(act)) return { date: act, jamaisConnecte: false };
  if (u.createdAt) {
    var c = new Date(u.createdAt);
    if (!isNaN(c)) return { date: c, jamaisConnecte: true };
  }
  return null;   // aucune trace datable
}

function _fmtDate(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function _html(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Coeur du traitement. envoyer=false : simulation (rien n'est envoye ni note).
 * Retourne un resume : { vendeurs:[{vendeur, courriel, clients:[...]}], sansVendeur:[...], sansTrace:n, envoyes:n }
 */
function rappelsInactivite(envoyer, maintenant) {
  var now = maintenant || new Date();
  var seuil = now.getTime() - INACTIVITE_JOURS * 24 * 3600 * 1000;
  var vendeurs = {};
  try { JSON.parse(PROPS.getProperty('vendeurs_list') || '[]').forEach(function (v) { vendeurs[String(v.email || '').toLowerCase()] = v.name; }); } catch (e) {}

  var parVendeur = {}, sansVendeur = [], sansTrace = 0;
  _users().forEach(function (u) {
    if (INACTIVITE_ROLES.indexOf(u.role) < 0 || u.active === false) return;
    var t = _derniereTrace(u);
    if (!t) { sansTrace++; return; }
    if (t.date.getTime() > seuil) return;                       // actif recemment
    var email = String(u.email || u.username || '').toLowerCase();
    var dernier = PROPS.getProperty('inactivity_notice_' + _cleCourriel(email));
    if (dernier && new Date(dernier).getTime() > seuil) return; // deja rappele ce mois-ci
    var jours = Math.floor((now.getTime() - t.date.getTime()) / (24 * 3600 * 1000));
    var client = { nom: u.name, courriel: email, role: u.role, depuis: _fmtDate(t.date), jours: jours, jamaisConnecte: t.jamaisConnecte };
    var vend = String(u.vendeurEmail || '').toLowerCase();
    if (!vend) { sansVendeur.push(client); return; }
    (parVendeur[vend] = parVendeur[vend] || []).push(client);
  });

  var resume = { vendeurs: [], sansVendeur: sansVendeur, sansTrace: sansTrace, envoyes: 0 };
  Object.keys(parVendeur).sort().forEach(function (vend) {
    var clients = parVendeur[vend].sort(function (a, b) { return b.jours - a.jours; });
    var nomVendeur = vendeurs[vend] || vend;
    resume.vendeurs.push({ vendeur: nomVendeur, courriel: vend, clients: clients });
    if (!envoyer) return;
    var m = _courrielRappel(nomVendeur, clients);
    try {
      MailApp.sendEmail(vend, m.sujet, m.texte, { htmlBody: m.html, name: 'Portail e-Trak' });
      resume.envoyes++;
      var iso = now.toISOString();
      clients.forEach(function (c) { PROPS.setProperty('inactivity_notice_' + _cleCourriel(c.courriel), iso); });
    } catch (err) {
      Logger.log('Rappel inactivite : echec vers ' + vend + ' : ' + err);
    }
  });
  return resume;
}

function _courrielRappel(nomVendeur, clients) {
  var prenom = String(nomVendeur || '').split(' ')[0] || 'Bonjour';
  var n = clients.length;
  var sujet = 'Portail e-Trak — ' + (n > 1 ? n + ' de vos clients ne se sont pas connectés' : 'un de vos clients ne s\'est pas connecté') + ' depuis 1 mois';
  var lignes = clients.map(function (c) {
    var quand = c.jamaisConnecte ? 'Jamais connecté (compte créé le ' + c.depuis + ')' : c.depuis + ' (' + c.jours + ' jours)';
    return '<tr><td style="padding:5px 8px;border:1px solid #d9d9d9"><b>' + _html(c.nom) + '</b></td>' +
           '<td style="padding:5px 8px;border:1px solid #d9d9d9">' + (c.role === 'dealer' ? 'Dealer' : 'Distributeur') + '</td>' +
           '<td style="padding:5px 8px;border:1px solid #d9d9d9">' + _html(c.courriel) + '</td>' +
           '<td style="padding:5px 8px;border:1px solid #d9d9d9">' + _html(quand) + '</td></tr>';
  }).join('');
  var th = '<th style="background:#145090;color:#fff;padding:5px 8px;text-align:left;border:1px solid #145090">';
  var html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1A1A1A">' +
    '<p>Bonjour ' + _html(prenom) + ',</p>' +
    '<p>Petit rappel amical : ' + (n > 1 ? 'ces clients, dont vous êtes le vendeur associé, ne se sont pas connectés'
                                        : 'ce client, dont vous êtes le vendeur associé, ne s\'est pas connecté') +
    ' au Portail e-Trak depuis plus d\'un mois. C\'est peut-être une bonne occasion de prendre de leurs nouvelles.</p>' +
    '<table style="border-collapse:collapse;font-size:10pt"><tr>' + th + 'Client</th>' + th + 'Rôle</th>' + th + 'Courriel</th>' + th + 'Dernière activité</th></tr>' +
    lignes + '</table>' +
    '<p style="color:#464646;font-size:9pt">Vous recevez au plus un rappel par mois pour chaque client, tant qu\'il reste inactif. ' +
    'Portail e-Trak : https://etraksolutions.github.io/portal-machine-V2/</p></div>';
  var texte = 'Bonjour ' + prenom + ',\n\nPetit rappel amical : ' + n + ' client(s) dont vous êtes le vendeur associé ne se sont pas connectés au Portail e-Trak depuis plus d\'un mois :\n\n' +
    clients.map(function (c) { return '- ' + c.nom + ' (' + c.courriel + ') : ' + (c.jamaisConnecte ? 'jamais connecté, compte créé le ' + c.depuis : 'dernière activité le ' + c.depuis); }).join('\n') +
    '\n\nPortail e-Trak : https://etraksolutions.github.io/portal-machine-V2/';
  return { sujet: sujet, html: html, texte: texte };
}

/* ---------- A lancer depuis l'editeur Apps Script ---------- */

// Simulation : qui recevrait quoi aujourd'hui. N'envoie rien, ne note rien.
function apercuRappelsInactivite() {
  var r = rappelsInactivite(false);
  Logger.log('Vendeurs a prevenir : ' + r.vendeurs.length + ' | clients sans vendeur associe : ' + r.sansVendeur.length +
             ' | comptes sans aucune trace datable (ignores) : ' + r.sansTrace);
  r.vendeurs.forEach(function (v) {
    Logger.log('> ' + v.vendeur + ' <' + v.courriel + '> : ' + v.clients.length + ' client(s)');
    v.clients.forEach(function (c) { Logger.log('    - ' + c.nom + ' (' + c.courriel + ') ' + (c.jamaisConnecte ? 'jamais connecte, cree le ' : 'derniere activite ') + c.depuis + ' — ' + c.jours + ' j'); });
  });
  r.sansVendeur.forEach(function (c) { Logger.log('  [sans vendeur] ' + c.nom + ' (' + c.courriel + ') ' + c.depuis + ' — ' + c.jours + ' j'); });
  return r;
}

// Declenche par le minuteur quotidien
function rappelsInactiviteQuotidien() {
  var r = rappelsInactivite(true);
  Logger.log('Rappels inactivite : ' + r.envoyes + ' courriel(s) envoye(s).');
}

// Active l'envoi quotidien (une seule fois ; remplace un minuteur existant)
function installerRappelsInactivite() {
  retirerRappelsInactivite();
  ScriptApp.newTrigger('rappelsInactiviteQuotidien').timeBased().everyDays(1).atHour(INACTIVITE_HEURE).create();
  Logger.log('Rappels d\'inactivite actives : chaque jour vers ' + INACTIVITE_HEURE + ' h.');
}

function retirerRappelsInactivite() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rappelsInactiviteQuotidien') ScriptApp.deleteTrigger(t);
  });
}
