// Banc « envoi de la demande SAV par noreply@e-trak.ca » (action sendsav, Steve 2026-11-20) :
// apps-script/Code.gs execute en Node, Graph / cache simules. Donnees FABRIQUEES.
// Voir .claude/skills/portal-backend.
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
const blob = buf => ({ buf, getBytes: () => buf, getDataAsString: () => buf.toString('utf8') });
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {}, cache = {}, appels = [], rep = [];
const reponse = (code, corps) => ({ getResponseCode: () => code, getContentText: () => (typeof corps === 'string' ? corps : JSON.stringify(corps)) });
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  CacheService: { getScriptCache: () => ({
    get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
  MailApp: { sendEmail: () => { throw new Error('MailApp ne doit pas servir'); } },
  UrlFetchApp: { fetch: (url, opt) => {
    appels.push({ url, opt });
    if (/oauth2/.test(url)) return reponse(200, { access_token: 'JETON', expires_in: 3599 });
    return rep.shift() || reponse(202, '');
  } },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {},
    newBlob: (d) => blob(Buffer.isBuffer(d) ? d : Buffer.from(String(d), 'utf8')),
    gzip: b => blob(zlib.gzipSync(b.buf)), ungzip: b => blob(zlib.gunzipSync(b.buf)),
    base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => Buffer.from(s, 'base64') },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const get = q => JSON.parse(ctx.doGet({ parameter: q }).s);
store = { PIN: 'PINSECRET',
  GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', GRAPH_SENDER: 'noreply@e-trak.ca',
  authorized_users_v2: JSON.stringify([
    { username: 'j@e.ca', email: 'j@e.ca', password: 'J', role: 'super_admin', name: 'Admin' },
    { username: 'k.berube@e-trak.ca', email: 'k.berube@e-trak.ca', password: 'K', role: 'vente_interne', name: 'Kevin' },
    { username: 'vi@e.ca', email: 'vi@e.ca', password: 'VI', role: 'vente_interne', name: 'Vente int' },
    { username: 'd@x.ca', email: 'd@x.ca', password: 'D', role: 'dealer', name: 'Dealer' },
    { username: 'i@x.ca', email: 'i@x.ca', password: 'I', role: 'installateur', name: 'Installateur' },
  ]) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
const dernier = () => { const a = appels.filter(x => /sendMail$/.test(x.url)); return a.length ? JSON.parse(a[a.length - 1].opt.payload).message : null; };
const adr = l => (l || []).map(x => x.emailAddress.address).join();

post({ action: 'setsav', pin: 'PINSECRET', sav: { clients: [['Client fictif', 'Ville', 'QC', 'direct']], pieces: [],
  routage: [{ cle: 'steve', nom: 'Steve', courriel: 'steve@e.ca' }, { cle: 'luna', nom: 'Luna', courriel: 'dluna@e-trak.ca' },
            { cle: 'kevin', nom: 'Kevin', courriel: 'k.berube@e-trak.ca' }], cc: ['k.berube@e-trak.ca'] } });

const K = tok('k.berube@e-trak.ca', 'K'), VI = tok('vi@e.ca', 'VI');
const FICHE = 'FICHE SAV\n' + 'Description tres longue. '.repeat(400);   // ~10 000 car. : au-dela de l'ancien mailto
const envoi = (t, extra) => post(Object.assign({ action: 'sendsav', token: t, sujet: 'SAV — URGENT — Client fictif — LPE', texte: FICHE }, extra || {}));

// Liste jamais enregistree : comportement d'avant (kevin + luna du routage)
let r = envoi(K);
let m = dernier();
check('liste jamais enregistree : envoi a Kevin et Luna (routage)', r.ok === true && adr(m.toRecipients) === 'k.berube@e-trak.ca,dluna@e-trak.ca');
check('fiche COMPLETE dans le courriel (aucune coupure)', m.body.contentType === 'Text' && m.body.content.indexOf(FICHE) >= 0);
check('sujet intact', m.subject === 'SAV — URGENT — Client fictif — LPE');
check('Kevin auteur ET destinataire : pas de copie en double, Repondre a = Kevin', !m.ccRecipients && adr(m.replyTo) === 'k.berube@e-trak.ca');
check('envoye par la boite noreply', /users\/noreply%40e-trak\.ca\/sendMail$/.test(appels[appels.length - 1].url));
check('getsav donne les destinataires a la page', JSON.stringify(post({ action: 'getsav', token: VI }).dest) === '["k.berube@e-trak.ca","dluna@e-trak.ca"]');

r = envoi(VI); m = dernier();
check('autre auteur : copie a l\'auteur et Repondre a = l\'auteur', r.ok && adr(m.ccRecipients) === 'vi@e.ca' && adr(m.replyTo) === 'vi@e.ca' && r.cc === 'vi@e.ca');

// Liste reglee dans l'Administration
const J = tok('j@e.ca', 'J');
check('admin enregistre sav_emails', post({ action: 'save', key: 'sav_emails', value: JSON.stringify(['Service@E-Trak.ca', 'service@e-trak.ca', 'pas-un-courriel', 'autre@e-trak.ca']), token: J }).ok === true);
r = envoi(VI); m = dernier();
check('liste de l\'Administration utilisee (minuscules, doublon et invalide retires)', r.ok && adr(m.toRecipients) === 'service@e-trak.ca,autre@e-trak.ca');
check('vente interne ne peut pas ecrire sav_emails', !!post({ action: 'save', key: 'sav_emails', value: '["pirate@x.ca"]', token: VI }).error
  && store.sav_emails.indexOf('pirate') < 0);
check('sav_emails illisible en GET public', !get({ action: 'get', key: 'sav_emails' }).value);
check('sav_emails lisible par l\'admin (getprivate)', /service@e-trak\.ca/i.test(post({ action: 'getprivate', key: 'sav_emails', token: J }).value || ''));
post({ action: 'save', key: 'sav_emails', value: '[]', token: J });
const avant = appels.length;
check('liste enregistree VIDE : no_recipients, rien d\'envoye (la page repasse par Outlook)', envoi(VI).error === 'no_recipients' && appels.length === avant);
delete store.sav_emails;

// Qui peut envoyer
check('sans session : refuse', post({ action: 'sendsav', sujet: 's', texte: 't' }).error === 'authentication required');
check('PIN seul : refuse', post({ action: 'sendsav', pin: 'PINSECRET', sujet: 's', texte: 't' }).error === 'authentication required');
check('dealer : refuse', envoi(tok('d@x.ca', 'D')).error === 'forbidden');
check('installateur (externe) : refuse', envoi(tok('i@x.ca', 'I')).error === 'forbidden');
store.roles_permissions = JSON.stringify({ vente_interne: { savAccess: false } });
check('case SAV decochee : refuse', envoi(VI).error === 'forbidden');
delete store.roles_permissions;

// Contenu et abus
check('sujet vide : refuse', envoi(VI, { sujet: '' }).error === 'invalid request');
check('fiche vide : refusee', envoi(VI, { texte: '   ' }).error === 'invalid request');
check('fiche demesuree : refusee', envoi(VI, { texte: 'x'.repeat(30001) }).error === 'too long');
envoi(VI, { sujet: 'SAV\r\nBcc: pirate@x.ca' }); m = dernier();
check('saut de ligne dans le sujet neutralise', m.subject === 'SAV Bcc: pirate@x.ca' && !m.bccRecipients);
check('les destinataires ne viennent JAMAIS de la page', (envoi(VI, { to: 'pirate@x.ca', a: 'pirate@x.ca' }), adr(dernier().toRecipients)) === 'k.berube@e-trak.ca,dluna@e-trak.ca');
rep = [reponse(500, 'boom')];
check('echec Graph : send_failed (la page repasse par Outlook)', envoi(VI).error === 'send_failed');
cache = {};
for (let i = 0; i < 20; i++) envoi(VI);
check('plus de 20 envois a l\'heure par compte : refuse', envoi(VI).error === 'too many requests');
check('le plafond est par compte : Kevin envoie encore', envoi(K).ok === true);

console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
