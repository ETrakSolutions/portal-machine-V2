/* =====================================================================
   ACTION  sendSoumission  — a AJOUTER dans ton projet Apps Script (Api.gs)
   =====================================================================

   1) Dans doPost(e), apres avoir fait :
          var data = JSON.parse(e.postData.contents);
      ajoute ce branchement (avant les autres if/return, peu importe l'ordre) :

          if (data.action === 'sendSoumission') {
              return sendSoumission_(data);
          }

   2) Colle la fonction sendSoumission_ ci-dessous quelque part dans le fichier.

   3) Deploie : Deployer > Gerer les deploiements > (crayon) > Nouvelle version > Deployer.
      (La premiere fois que MailApp s'execute, Google demandera d'autoriser
       l'envoi de courriels au nom de ton compte — accepte.)

   NOTE securite : on n'envoie qu'a des adresses fournies par le portail
   (memes destinataires que l'ancien mailto), apres validation du format,
   et le PIN est requis. Le courriel part de TON compte Google (celui qui
   possede le script), avec replyTo = la personne qui fait la demande.
   ===================================================================== */

function sendSoumission_(data) {
  function out(obj) {
    return ContentService
      .createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // PIN (meme que les autres actions d'ecriture).
  if (String(data.pin || '') !== '1400') {
    return out({ ok: false, error: 'pin' });
  }

  var RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // Destinataires : liste fournie par le portail, validee.
  var to = String(data.to || '')
    .split(/[,;]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return RE.test(s); });

  if (!to.length) {
    return out({ ok: false, error: 'no_recipients' });
  }

  var cc = (data.cc && RE.test(String(data.cc).trim())) ? String(data.cc).trim() : '';
  var replyTo = (data.replyTo && RE.test(String(data.replyTo).trim())) ? String(data.replyTo).trim() : '';
  var subject = String(data.subject || 'Demande de soumission e-Trak').slice(0, 200);
  var html = String(data.html || '');
  var text = String(data.text || 'Voir la version HTML de ce courriel.');

  var options = { htmlBody: html, name: 'Portail e-Trak' };
  if (cc) options.cc = cc;
  if (replyTo) options.replyTo = replyTo;

  try {
    MailApp.sendEmail(to.join(','), subject, text, options);
  } catch (err) {
    return out({ ok: false, error: 'send_failed', detail: String(err) });
  }

  return out({ ok: true, to: to.join(','), cc: cc });
}
