// Banc « envoi par noreply@e-trak.ca » (Microsoft Graph, Steve 2026-10-20) : apps-script/Code.gs
// execute en Node, UrlFetchApp / MailApp / cache simules. Voir .claude/skills/portal-backend.
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
const blob = buf => ({ buf, getBytes: () => buf, getDataAsString: () => buf.toString('utf8') });
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {}, cache = {}, mailapp = [], appels = [], rep = {};
const reponse = (code, corps) => ({ getResponseCode: () => code, getContentText: () => (typeof corps === 'string' ? corps : JSON.stringify(corps)) });
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  CacheService: { getScriptCache: () => ({
    get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
  MailApp: { sendEmail: (to, sujet, texte, opt) => { mailapp.push({ to, sujet }); } },
  UrlFetchApp: { fetch: (url, opt) => {
    appels.push({ url, opt });
    if (/oauth2/.test(url)) { const r = rep.token.shift(); return r || reponse(200, { access_token: 'JETON' + appels.length, expires_in: 3599 }); }
    const r = rep.send.shift(); return r || reponse(202, '');
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
const GRAPH = { GRAPH_TENANT_ID: 'tenant-1', GRAPH_CLIENT_ID: 'client-1', GRAPH_CLIENT_SECRET: 'SECRET-XYZ', GRAPH_SENDER: 'noreply@e-trak.ca' };
function reset(avecGraph) {
  store = { PIN: 'P', authorized_users_v2: JSON.stringify([
    { username: 'client@napa.ca', email: 'client@napa.ca', password: 'X', role: 'dealer', name: 'Client Napa', active: true }]) };
  if (avecGraph) Object.assign(store, GRAPH);
  cache = {}; mailapp = []; appels = []; rep = { token: [], send: [] };
}
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
let r;

reset(false);
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('sans les 4 proprietes : envoi par MailApp, comme avant', r.ok === true && mailapp.length === 1 && appels.length === 0);
store.GRAPH_TENANT_ID = 't'; store.GRAPH_CLIENT_ID = 'c'; store.GRAPH_SENDER = 's@x.ca'; cache = {}; mailapp = [];
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('3 proprietes sur 4 : toujours MailApp', r.ok === true && mailapp.length === 1 && appels.length === 0);

reset(true);
r = post({ action: 'resetrequest', email: 'client@napa.ca', lang: 'fr' });
const tok = appels[0], env = appels[1];
check('avec Graph : 1 jeton puis 1 envoi, aucun MailApp', r.ok === true && appels.length === 2 && mailapp.length === 0);
check('jeton : bon locataire, client_credentials, scope Graph', /login\.microsoftonline\.com\/tenant-1\/oauth2\/v2\.0\/token$/.test(tok.url)
  && tok.opt.payload.grant_type === 'client_credentials' && tok.opt.payload.client_id === 'client-1'
  && tok.opt.payload.client_secret === 'SECRET-XYZ' && tok.opt.payload.scope === 'https://graph.microsoft.com/.default');
const m = JSON.parse(env.opt.payload);
check('envoi : /users/noreply@e-trak.ca/sendMail avec le jeton', env.url === 'https://graph.microsoft.com/v1.0/users/noreply%40e-trak.ca/sendMail'
  && env.opt.headers.Authorization === 'Bearer JETON1');
check('message : destinataire, sujet, HTML avec le code, pas copie aux Envoyes', m.message.toRecipients[0].emailAddress.address === 'client@napa.ca'
  && /activation/.test(m.message.subject) && m.message.body.contentType === 'HTML' && /\d{6}/.test(m.message.body.content) && m.saveToSentItems === false);
cache = Object.fromEntries(Object.entries(cache).filter(([k]) => k.startsWith('graph_token')));
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('2e envoi : jeton repris du cache (pas de nouvel appel au jeton)', r.ok === true && appels.length === 3 && /sendMail$/.test(appels[2].url));

reset(true); cache['graph_token_client-1'] = 'VIEUX';
rep.send = [reponse(401, 'expired')];
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('jeton en cache refuse (401) : nouveau jeton puis renvoi reussi', r.ok === true && appels.length === 3
  && appels[0].opt.headers.Authorization === 'Bearer VIEUX' && /oauth2/.test(appels[1].url) && appels[2].opt.headers.Authorization !== 'Bearer VIEUX');

reset(true); rep.token = [reponse(401, { error: 'invalid_client' })];
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('secret refuse ou expire : send_failed, pas de repli sur le Gmail', r.error === 'send_failed' && mailapp.length === 0);
check('apres un echec : on peut redemander tout de suite (anti-repetition libere)', post({ action: 'resetrequest', email: 'client@napa.ca' }).ok === true);

reset(true); rep.send = [reponse(403, { error: { code: 'ErrorAccessDenied' } })];
r = post({ action: 'resetrequest', email: 'client@napa.ca' });
check('boite non autorisee (403) : send_failed', r.error === 'send_failed' && mailapp.length === 0);

reset(true);
for (const k of Object.keys(GRAPH)) {
  const g = get({ action: 'get', key: k });
  check('GET public ne rend pas ' + k, !JSON.stringify(g).includes(GRAPH[k]));
}
check('save sans jeton admin refuse sur GRAPH_SENDER', post({ action: 'save', key: 'GRAPH_SENDER', value: 'pirate@x.ca' }).error !== undefined && store.GRAPH_SENDER === 'noreply@e-trak.ca');

console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
