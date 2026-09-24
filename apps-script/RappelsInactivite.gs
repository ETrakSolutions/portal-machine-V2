/**
 * e-Trak Portal Machine V2 — Rappels d'inactivite des clients (Apps Script)
 *
 * Chaque matin, repere les clients (Dealer / Distributeur, comptes actifs) inactifs
 * sur le portail et envoie UN courriel amical par vendeur associe (vendeurEmail)
 * listant ses clients rendus a un palier, avec le nombre de jours d'inactivite.
 * Demande de Steve et Jacquot, 2026-09-24.
 *
 * Paliers (INACTIVITE_PALIERS) : 1er rappel a 30 jours, 2e a 45 jours, dernier a
 * 60 jours. Apres le dernier, plus rien tant que le client ne revient pas. Un client
 * qui atteint un palier sans avoir recu le precedent (ex. deja a 70 jours au premier
 * envoi) recoit seulement le rappel du palier atteint.
 *
 * Donnees utilisees (aucune nouvelle collecte) :
 *  - user_active_<courriel> : { lastPing, lastActivity } ecrit par js/heartbeat.js
 *    toutes les 10 min quand le client a une page du portail ouverte ;
 *  - createdAt du compte : un compte cree il y a plus de 30 jours et jamais connecte
 *    compte comme inactif. Un compte sans aucune trace (ni activite ni date de
 *    creation, anciens comptes) n'est PAS signale : on ne peut pas dater son absence.
 *
 * Suivi : inactivity_notice_<courriel> = { palier, date, depuis } — dernier palier
 * rappele pour l'absence qui a commence a « depuis ». Si le client revient, sa derniere
 * trace change : c'est une nouvelle absence, les paliers repartent de zero.
 *
 * Fichier autonome : s'ajoute au projet a cote de API.gs (memes _users, PROPS).
 * A executer depuis l'editeur :
 *  - apercuRappelsInactivite()   : simulation, n'envoie RIEN (journal d'execution)
 *  - installerRappelsInactivite() : active l'envoi quotidien (8 h)
 *  - retirerRappelsInactivite()   : desactive l'envoi quotidien
 */

var INACTIVITE_PALIERS = [30, 45, 60];   // jours ; le dernier est le rappel final
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

// Palier le plus eleve atteint pour un nombre de jours (0 = aucun)
function _palierAtteint(jours) {
  var p = 0;
  INACTIVITE_PALIERS.forEach(function (s) { if (jours >= s) p = s; });
  return p;
}

// Libelle du rappel : 1er, 2e, ... dernier
function _libelleRappel(palier) {
  var i = INACTIVITE_PALIERS.indexOf(palier);
  if (i === INACTIVITE_PALIERS.length - 1) return 'Dernier rappel';
  return (i === 0 ? '1er' : (i + 1) + 'e') + ' rappel';
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
  var vendeurs = {};
  try { JSON.parse(PROPS.getProperty('vendeurs_list') || '[]').forEach(function (v) { vendeurs[String(v.email || '').toLowerCase()] = v.name; }); } catch (e) {}

  var parVendeur = {}, sansVendeur = [], sansTrace = 0;
  _users().forEach(function (u) {
    if (INACTIVITE_ROLES.indexOf(u.role) < 0 || u.active === false) return;
    var t = _derniereTrace(u);
    if (!t) { sansTrace++; return; }
    var jours = Math.floor((now.getTime() - t.date.getTime()) / (24 * 3600 * 1000));
    var palier = _palierAtteint(jours);
    if (!palier) return;                                          // actif recemment
    var email = String(u.email || u.username || '').toLowerCase();
    var depuis = t.date.toISOString();
    var deja = 0;
    try {
      var n = JSON.parse(PROPS.getProperty('inactivity_notice_' + _cleCourriel(email)) || 'null');
      if (n && n.depuis === depuis) deja = n.palier || 0;         // meme absence
    } catch (e) {}
    if (palier <= deja) return;                                   // palier deja rappele
    var client = { nom: u.name, courriel: email, role: u.role, derniere: _fmtDate(t.date), jours: jours,
                   jamaisConnecte: t.jamaisConnecte, palier: palier, rappel: _libelleRappel(palier), depuis: depuis };
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
      clients.forEach(function (c) {
        PROPS.setProperty('inactivity_notice_' + _cleCourriel(c.courriel), JSON.stringify({ palier: c.palier, date: iso, depuis: c.depuis }));
      });
    } catch (err) {
      Logger.log('Rappel inactivite : echec vers ' + vend + ' : ' + err);
    }
  });
  return resume;
}

function _courrielRappel(nomVendeur, clients) {
  var prenom = String(nomVendeur || '').split(' ')[0] || 'Bonjour';
  var n = clients.length;
  var min = clients.reduce(function (m, c) { return Math.min(m, c.jours); }, Infinity);
  var sujet = 'Portail e-Trak — ' + (n > 1 ? n + ' de vos clients sont inactifs' : 'un de vos clients est inactif') +
              ' depuis ' + (n > 1 ? min + ' jours ou plus' : min + ' jours');
  var dernier = clients.some(function (c) { return c.palier === INACTIVITE_PALIERS[INACTIVITE_PALIERS.length - 1]; });
  var td = '<td style="padding:5px 8px;border:1px solid #d9d9d9">';
  var lignes = clients.map(function (c) {
    var final = c.palier === INACTIVITE_PALIERS[INACTIVITE_PALIERS.length - 1];
    var derniere = c.jamaisConnecte ? 'Jamais connecté (compte créé le ' + c.derniere + ')' : c.derniere;
    return '<tr>' + td + '<b>' + _html(c.nom) + '</b></td>' +
           td + (c.role === 'dealer' ? 'Dealer' : 'Distributeur') + '</td>' +
           td + _html(c.courriel) + '</td>' +
           td + '<b>' + c.jours + ' jours</b></td>' +
           td + _html(derniere) + '</td>' +
           td + (final ? '<b style="color:#F41C22">' : '') + _html(c.rappel) + (final ? '</b>' : '') + '</td></tr>';
  }).join('');
  var th = '<th style="background:#145090;color:#fff;padding:5px 8px;text-align:left;border:1px solid #145090">';
  var paliers = INACTIVITE_PALIERS.join(', ').replace(/, (\d+)$/, ' et $1');
  var html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1A1A1A">' +
    '<p>Bonjour ' + _html(prenom) + ',</p>' +
    '<p>Petit rappel amical : ' + (n > 1 ? 'ces clients, dont vous êtes le vendeur associé, ne se sont pas connectés'
                                        : 'ce client, dont vous êtes le vendeur associé, ne s\'est pas connecté') +
    ' au Portail e-Trak depuis un bon moment. C\'est peut-être une bonne occasion de prendre de leurs nouvelles.</p>' +
    '<table style="border-collapse:collapse;font-size:10pt"><tr>' + th + 'Client</th>' + th + 'Rôle</th>' + th + 'Courriel</th>' +
    th + 'Inactif depuis</th>' + th + 'Dernière activité</th>' + th + 'Rappel</th></tr>' + lignes + '</table>' +
    (dernier ? '<p>Pour les clients marqués <b style="color:#F41C22">Dernier rappel</b>, c\'est le dernier courriel automatique à leur sujet.</p>' : '') +
    '<p style="color:#464646;font-size:9pt">Rappels envoyés à ' + paliers + ' jours d\'inactivité, puis plus rien tant que le client ne revient pas sur le portail. ' +
    'Portail e-Trak : https://etraksolutions.github.io/portal-machine-V2/</p></div>';
  var texte = 'Bonjour ' + prenom + ',\n\nPetit rappel amical : ' + n + ' client(s) dont vous êtes le vendeur associé ne se sont pas connectés au Portail e-Trak depuis un bon moment :\n\n' +
    clients.map(function (c) {
      return '- ' + c.nom + ' (' + c.courriel + ') : inactif depuis ' + c.jours + ' jours' +
             (c.jamaisConnecte ? ' (jamais connecté, compte créé le ' + c.derniere + ')' : ' (dernière activité le ' + c.derniere + ')') + ' — ' + c.rappel;
    }).join('\n') +
    '\n\nRappels envoyés à ' + paliers + ' jours d\'inactivité.\nPortail e-Trak : https://etraksolutions.github.io/portal-machine-V2/';
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
    v.clients.forEach(function (c) { Logger.log('    - ' + c.nom + ' (' + c.courriel + ') : ' + c.jours + ' j — ' + c.rappel + (c.jamaisConnecte ? ' (jamais connecte)' : '')); });
  });
  r.sansVendeur.forEach(function (c) { Logger.log('  [sans vendeur] ' + c.nom + ' (' + c.courriel + ') : ' + c.jours + ' j — ' + c.rappel); });
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
