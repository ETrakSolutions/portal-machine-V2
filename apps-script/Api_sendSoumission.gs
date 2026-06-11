/* =====================================================================
   ACTION  sendSoumission  — DEJA INTEGREE dans le Api.gs maitre local :
   C:\Users\ryb086\OneDrive - Groupe R.Y. Beaudoin\Bureau\CLAUDE_CODE\apps-script\Api.gs

   => Le plus simple : recopier TOUT le contenu de ce Api.gs maitre dans
      l'editeur Apps Script (remplacer tout), Enregistrer, puis redeployer.

   Si tu preferes appliquer les 3 changements a la main, les voici (style
   exact du codebase : action en minuscules, PIN gere par writeActions,
   handler retournant un objet simple enveloppe par jsonOut) :
   ===================================================================== */

// (1) Dans doPost(e), ajoute 'sendsoumission' a la liste writeActions :
//     var writeActions = [ ... ,'updatebomlabels','sendsoumission'];

// (2) Dans doPost(e), ajoute la ligne de dispatch (apres updatebomlabels) :
//     if (action === 'sendsoumission')     return jsonOut(sendSoumission(body));

// (3) Ajoute cette fonction (ex. juste apres jsonOut) :

function sendSoumission(body) {
  var RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  var to = String(body.to || '')
    .split(/[,;]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return RE.test(s); });
  if (!to.length) return { error: 'no_recipients' };

  var cc = (body.cc && RE.test(String(body.cc).trim())) ? String(body.cc).trim() : '';
  var replyTo = (body.replyTo && RE.test(String(body.replyTo).trim())) ? String(body.replyTo).trim() : '';
  var subject = String(body.subject || 'Demande de soumission e-Trak').slice(0, 200);
  var html = String(body.html || '');
  var text = String(body.text || 'Voir la version HTML de ce courriel.');

  var options = { htmlBody: html, name: 'Portail e-Trak' };
  if (cc) options.cc = cc;
  if (replyTo) options.replyTo = replyTo;

  try {
    MailApp.sendEmail(to.join(','), subject, text, options);
  } catch (err) {
    return { error: 'send_failed', detail: String(err) };
  }
  return { ok: true, to: to.join(','), cc: cc };
}

/* Apres : Deployer > Gerer les deploiements > crayon > Nouvelle version > Deployer.
   Au 1er envoi, autoriser MailApp (envoi de courriels). */
