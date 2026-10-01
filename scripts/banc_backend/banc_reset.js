// Banc « Premiere connexion / mot de passe oublie » (actions resetrequest / resetconfirm) :
// apps-script/Code.gs execute en Node, courriel et cache simules. Voir .claude/skills/portal-backend.
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
const blob = buf => ({ buf, getBytes: () => buf, getDataAsString: () => buf.toString('utf8') });
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {}, cache = {}, envois = [], panneCourriel = false;
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  CacheService: { getScriptCache: () => ({
    get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
  MailApp: { sendEmail: (to, sujet, texte, opt) => { if (panneCourriel) throw new Error('quota'); envois.push({ to, sujet, texte, opt }); } },
  Utilities: { getUuid: () => require('crypto').randomUUID(), sleep: () => {},
    newBlob: (d) => blob(Buffer.isBuffer(d) ? d : Buffer.from(String(d), 'utf8')),
    gzip: b => blob(zlib.gzipSync(b.buf)), ungzip: b => blob(zlib.gunzipSync(b.buf)),
    base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => Buffer.from(s, 'base64') },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, UrlFetchApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const U = () => ctx._users();
function reset() {
  store = { PIN: 'P', authorized_users_v2: JSON.stringify([
    { username: 'jcaron@gryb.com', email: 'jcaron@gryb.com', password: 'J', role: 'super_admin', name: 'Jacquot', active: true },
    { username: 'client@napa.ca', email: 'client@napa.ca', password: 'TEMP123', role: 'dealer', name: 'Client Napa', active: true, mustChangePassword: true },
    { username: 'parti@x.ca', email: 'parti@x.ca', password: 'X', role: 'dealer', name: 'Parti', active: false },
  ]) };
  cache = {}; envois = []; panneCourriel = false;
}
const code = () => { const m = /:\s*(\d{6})\b/.exec(envois[envois.length - 1].texte); return m && m[1]; };
const login = (u, p) => post({ action: 'login', username: u, password: p });
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
let r, c;

reset();
r = post({ action: 'resetrequest', email: ' Client@Napa.ca ' });
check('demande pour un compte actif : ok + 1 courriel a CE courriel', r.ok === true && envois.length === 1 && envois[0].to === 'client@napa.ca');
c = code();
check('le courriel porte un code a 6 chiffres et le lien du portail', /^\d{6}$/.test(c || '') && /etraksolutions\.github\.io/.test(envois[0].texte));
check('le courriel ne contient aucun mot de passe', envois[0].texte.indexOf('TEMP123') < 0);
check('ancien mot de passe toujours valide apres la demande', login('client@napa.ca', 'TEMP123').ok === true);
r = post({ action: 'resetconfirm', email: 'client@napa.ca', code: c, newPassword: 'abc' });
check('mot de passe trop court : refuse, code garde', r.error === 'password too short' && !!cache[ctx._resetCle('client@napa.ca')]);
r = post({ action: 'resetconfirm', email: 'client@napa.ca', code: c === '000000' ? '111111' : '000000', newPassword: 'nouveau1' });
check('mauvais code : refuse', r.error === 'invalid code' && login('client@napa.ca', 'TEMP123').ok === true);
r = post({ action: 'resetconfirm', email: 'CLIENT@napa.ca', code: c, newPassword: 'nouveau1' });
check('bon code : connecte (jeton) et mot de passe change', r.ok === true && !!r.token && login('client@napa.ca', 'nouveau1').ok === true);
check('ancien mot de passe refuse ensuite', !!login('client@napa.ca', 'TEMP123').error);
check('drapeau « changer le mot de passe » retire', U().find(u => u.email === 'client@napa.ca').mustChangePassword === undefined);
check('jeton retourne sans mot de passe', r.user && r.user.password === undefined);
r = post({ action: 'resetconfirm', email: 'client@napa.ca', code: c, newPassword: 'autre123' });
check('code a usage unique', r.error === 'invalid code' && login('client@napa.ca', 'nouveau1').ok === true);
check('les autres comptes ne bougent pas', U().length === 3 && login('jcaron@gryb.com', 'J').ok === true);

reset();
post({ action: 'resetrequest', email: 'client@napa.ca' }); c = code();
for (let i = 0; i < 5; i++) post({ action: 'resetconfirm', email: 'client@napa.ca', code: 'xxxxxx', newPassword: 'nouveau1' });
r = post({ action: 'resetconfirm', email: 'client@napa.ca', code: c, newPassword: 'nouveau1' });
check('5 mauvais essais : le code est detruit', r.error === 'invalid code' && login('client@napa.ca', 'TEMP123').ok === true);

reset();
r = post({ action: 'resetrequest', email: 'inconnu@x.ca' });
check('compte inconnu : meme reponse, aucun courriel', r.ok === true && envois.length === 0);
r = post({ action: 'resetrequest', email: 'parti@x.ca' });
check('compte desactive : meme reponse, aucun courriel', r.ok === true && envois.length === 0);
r = post({ action: 'resetconfirm', email: 'parti@x.ca', code: '123456', newPassword: 'nouveau1' });
check('compte desactive : confirmation refusee', r.error === 'invalid code');
r = post({ action: 'resetrequest', email: 'pas-un-courriel' });
check('courriel invalide : refuse', r.error === 'valid email required' && envois.length === 0);

reset();
post({ action: 'resetrequest', email: 'client@napa.ca' });
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('2e demande dans les 15 min : meme reponse, pas de 2e courriel', r.ok === true && envois.length === 1);

reset(); panneCourriel = true;
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('envoi impossible : erreur claire, aucun code en attente', r.error === 'send_failed' && !cache[ctx._resetCle('client@napa.ca')]);
panneCourriel = false;
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('apres une panne : une nouvelle demande part tout de suite', r.ok === true && envois.length === 1);

reset();
post({ action: 'resetrequest', email: 'client@napa.ca', lang: 'en' });
check('demande en anglais : courriel en anglais', /access code/.test(envois[0].sujet) && /Hello Client Napa/.test(envois[0].texte));
check('sans code demande : confirmation refusee', post({ action: 'resetconfirm', email: 'jcaron@gryb.com', code: '123456', newPassword: 'pirate1' }).error === 'invalid code' && login('jcaron@gryb.com', 'J').ok === true);

console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
