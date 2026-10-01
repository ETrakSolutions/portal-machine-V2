// Banc des comptes proteges (Super Admin, proprietaire) : apps-script/Code.gs execute
// en Node, services Google simules. 37 cas. Voir .claude/skills/portal-backend.
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
// Blob / gzip / base64 d'Apps Script, simules avec zlib (octets = Buffer).
const blob = buf => ({ buf, getBytes: () => buf, getDataAsString: () => buf.toString('utf8') });
// Le VRAI backend du depot, charge tel quel (Apps Script = JavaScript).
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {};
let pannes = Infinity;   // nb d'ecritures permises avant une panne simulee (quota, delai)
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => {
      v = String(v);
      if (pannes-- <= 0) throw new Error('Simulated failure');
      if (v.length > 9216) throw new Error('Argument too large: value');   // limite Google : 9 Ko
      store[k] = v;
    },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '-aaaa-bbbb', sleep: () => {},
    newBlob: (d) => blob(Buffer.isBuffer(d) ? d : Buffer.from(String(d), 'utf8')),
    gzip: b => blob(zlib.gzipSync(b.buf)), ungzip: b => blob(zlib.gunzipSync(b.buf)),
    base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => Buffer.from(s, 'base64') },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, MailApp: {}, UrlFetchApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const U = () => ctx._users();   // lecture par le vrai serveur (ancienne cle ou tranches)
const find = e => U().filter(u => (u.email || '').toLowerCase() === e);
function reset() {
  store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify([
    { username: 'jcaron@gryb.com', email: 'jcaron@gryb.com', password: 'J', role: 'super_admin', name: 'Jacquot', active: true },
    { username: 'smartineau@gryb.ca', email: 'smartineau@gryb.ca', password: 'S', role: 'super_admin', name: 'Steve', active: true },
    { username: 'robin@gryb.ca', email: 'robin@gryb.ca', password: 'R', role: 'administrateur', name: 'Robin', active: true },
    { username: 'dealer@x.ca', email: 'dealer@x.ca', password: 'D', role: 'dealer', name: 'Dealer', active: true },
  ]) };
}
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
const save = (t, list) => post({ action: 'save', key: 'authorized_users_v2', value: typeof list === 'string' ? list : JSON.stringify(list), token: t });
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
let r, s, j, d, res;

// --- Robin (administrateur)
reset(); r = tok('robin@gryb.ca', 'R');
save(r, U().filter(u => u.role !== 'super_admin'));
check('admin qui retire les 2 Super Admin : restaures', find('jcaron@gryb.com').length === 1 && find('smartineau@gryb.ca').length === 1);
reset(); r = tok('robin@gryb.ca', 'R');
save(r, U().map(u => u.name === 'Jacquot' ? { ...u, password: 'pirate', role: 'dealer' } : u));
check('admin qui change mot de passe/role de Jacquot : annule', find('jcaron@gryb.com')[0].password === 'J' && find('jcaron@gryb.com')[0].role === 'super_admin');
reset(); r = tok('robin@gryb.ca', 'R');
save(r, U().map(u => u.name === 'Steve' ? { ...u, role: 'dealer' } : u));
check('admin qui retrograde Steve : annule', find('smartineau@gryb.ca')[0].role === 'super_admin');
reset(); r = tok('robin@gryb.ca', 'R');
res = save(r, U().map(u => u.name === 'Robin' ? { ...u, role: 'super_admin' } : u));
check('admin qui se promeut Super Admin : refuse', res.error === 'super_admin required' && find('robin@gryb.ca')[0].role === 'administrateur');
reset(); r = tok('robin@gryb.ca', 'R');
save(r, [{ username: 'jcaron@gryb.com', email: 'jcaron@gryb.com', password: 'pirate', role: 'dealer', name: 'X' }, ...U()]);
check('doublon pirate glisse devant Jacquot : elimine', find('jcaron@gryb.com').length === 1 && !post({ action: 'login', username: 'jcaron@gryb.com', password: 'pirate' }).ok);
reset(); r = tok('robin@gryb.ca', 'R');
res = save(r, U().map(u => u.name === 'Dealer' ? { ...u, name: 'Dealer renomme' } : u));
check('admin : modif ordinaire d un dealer passe', res.ok === true && find('dealer@x.ca')[0].name === 'Dealer renomme');
reset(); r = tok('robin@gryb.ca', 'R');
res = post({ action: 'delete', key: 'authorized_users_v2', token: r });
check('effacer toute la liste : refuse', !!res.error && U().length === 4);
reset(); r = tok('robin@gryb.ca', 'R');
post({ action: 'save', key: 'roles_permissions', value: JSON.stringify({ super_admin: { modifAccounts: false } }), token: r });
j = tok('jcaron@gryb.com', 'J');
check('roles_permissions ne retire pas les droits admin du Super Admin', save(j, U()).ok === true);

// --- PIN (scripts)
reset();
post({ action: 'save', key: 'authorized_users_v2', value: JSON.stringify(U().filter(u => u.role !== 'super_admin')), pin: 'PINSECRET' });
check('PIN qui retire les Super Admin : restaures', find('jcaron@gryb.com').length === 1 && find('smartineau@gryb.ca').length === 1);

// --- Steve (Super Admin)
reset(); s = tok('smartineau@gryb.ca', 'S');
save(s, U().filter(u => u.name !== 'Jacquot'));
check('Steve qui retire Jacquot : restaure', find('jcaron@gryb.com').length === 1);
reset(); s = tok('smartineau@gryb.ca', 'S');
save(s, U().map(u => u.name === 'Jacquot' ? { ...u, password: 'pirate' } : u));
check('Steve qui change le mot de passe de Jacquot : annule', find('jcaron@gryb.com')[0].password === 'J');
reset(); s = tok('smartineau@gryb.ca', 'S');
save(s, U().map(u => u.name === 'Robin' ? { ...u, role: 'super_admin' } : u));
check('Steve peut promouvoir Super Admin', find('robin@gryb.ca')[0].role === 'super_admin');

// --- Jacquot
reset(); j = tok('jcaron@gryb.com', 'J');
save(j, U().map(u => u.name === 'Jacquot' ? { ...u, password: 'nouveau', name: 'Jacquot C.', role: 'dealer', active: false } : u));
const me = find('jcaron@gryb.com')[0];
check('Jacquot change son nom/mot de passe, pas son role ni actif', me.password === 'nouveau' && me.name === 'Jacquot C.' && me.role === 'super_admin' && me.active === true);
reset(); j = tok('jcaron@gryb.com', 'J');
save(j, U().map(u => u.name === 'Steve' ? { ...u, role: 'administrateur' } : u));
check('Jacquot peut retrograder Steve', find('smartineau@gryb.ca')[0].role === 'administrateur');
reset(); j = tok('jcaron@gryb.com', 'J');
save(j, U().filter(u => u.name !== 'Steve'));
check('Jacquot peut supprimer Steve', find('smartineau@gryb.ca').length === 0);
reset(); j = tok('jcaron@gryb.com', 'J');
save(j, U().filter(u => u.name !== 'Jacquot'));
check('Jacquot ne peut pas se supprimer lui-meme', find('jcaron@gryb.com').length === 1);

// --- Liste tronquee (incident du 2026-10-01 : page Admin a liste vide + un ajout)
reset(); s = tok('smartineau@gryb.ca', 'S');
res = save(s, [{ username: 'joe@x.ca', email: 'joe@x.ca', password: 'P', role: 'dealer', name: 'Joe' }]);
check('liste d un seul nouveau compte : refusee, rien d efface', /would remove/.test(res.error || '') && U().length === 4 && find('dealer@x.ca').length === 1);
reset(); r = tok('robin@gryb.ca', 'R');
res = save(r, U().filter(u => u.name !== 'Dealer' && u.name !== 'Robin'));
check('admin qui retire 2 comptes ordinaires d un coup : refuse', /would remove 2/.test(res.error || '') && U().length === 4);
reset(); r = tok('robin@gryb.ca', 'R');
res = save(r, U().filter(u => u.name !== 'Dealer'));
check('suppression d un seul compte : passe', res.ok === true && find('dealer@x.ca').length === 0 && U().length === 3);
reset(); r = tok('robin@gryb.ca', 'R');
res = save(r, U().map(u => u.name === 'Dealer' ? { ...u, email: 'nouveau@x.ca', username: 'nouveau@x.ca' } : u));
check('changement de courriel d un compte : passe', res.ok === true && find('nouveau@x.ca').length === 1);
reset(); r = tok('robin@gryb.ca', 'R');
res = save(r, [...U(), { username: 'neuf@x.ca', email: 'neuf@x.ca', password: 'N', role: 'dealer', name: 'Neuf' }]);
check('ajout normal : passe', res.ok === true && U().length === 5);

// --- Stockage en tranches compressees (2026-10-01)
const gzKeys = () => Object.keys(store).filter(k => k.indexOf('users_gz_') === 0).sort();
const grosseListe = n => Array.from({ length: n }, (_, i) => ({ username: 'client' + i + '@exemple-dealer.ca',
  email: 'client' + i + '@exemple-dealer.ca', password: Math.random().toString(36).slice(2, 12), role: 'dealer',
  name: 'Client Numero ' + i, active: true, mustChangePassword: true, vendeurEmail: 'startre@e-trak.ca',
  createdBy: 'startre@e-trak.ca', createdAt: new Date().toISOString() }));
reset(); r = tok('robin@gryb.ca', 'R');
res = save(r, [...U(), { username: 'neuf@x.ca', email: 'neuf@x.ca', password: 'N', role: 'dealer', name: 'Neuf' }]);
check('1re ecriture : ancienne cle migree puis effacee', res.ok === true && store.authorized_users_v2 === undefined && /^A:\d+$/.test(store.users_gz_cur) && U().length === 5);
check('apres migration : login et liste intacts', post({ action: 'login', username: 'jcaron@gryb.com', password: 'J' }).ok === true && post({ action: 'listusers', token: r }).users.length === 5);
res = save(r, U().filter(u => u.name !== 'Neuf'));
check('2e ecriture : bascule A -> B, emplacement A nettoye', res.ok === true && /^B:/.test(store.users_gz_cur) && !gzKeys().some(k => /_A_/.test(k)) && U().length === 4);
reset(); store.authorized_users_v2 = JSON.stringify([...JSON.parse(store.authorized_users_v2), ...grosseListe(200)]);
r = tok('robin@gryb.ca', 'R');
res = save(r, [...U(), { username: 'neuf@x.ca', email: 'neuf@x.ca', password: 'N', role: 'dealer', name: 'Neuf' }]);
const nTr = parseInt((store.users_gz_cur || ':0').split(':')[1], 10);
check('205 comptes (bien au-dela de 9 Ko) : ecrits en tranches et relus', res.ok === true && nTr >= 1 && U().length === 205 && find('client199@exemple-dealer.ca').length === 1);
check('aucune tranche ne depasse 9 Ko', gzKeys().every(k => store[k].length <= 9216));
reset(); r = tok('robin@gryb.ca', 'R'); save(r, U());      // migre vers l'emplacement A
const av2 = JSON.stringify(U()), cur2 = store.users_gz_cur;
pannes = 1;                                                 // 1re tranche ecrite, puis panne
try { ctx._writeUsers([...U(), { username: 'z@x.ca', email: 'z@x.ca', password: 'Z', role: 'dealer', name: 'Z' }]); } catch (e) {}
pannes = Infinity;
check('ecriture interrompue : ancienne liste intacte et lisible', store.users_gz_cur === cur2 && JSON.stringify(U()) === av2);
res = save(r, [...U(), { username: 'z@x.ca', email: 'z@x.ca', password: 'Z', role: 'dealer', name: 'Z' }]);
check('ecriture suivante : reussit et nettoie les restes', res.ok === true && find('z@x.ca').length === 1 && gzKeys().filter(k => k !== 'users_gz_cur').every(k => k.indexOf('users_gz_' + store.users_gz_cur[0] + '_') === 0));
reset(); r = tok('robin@gryb.ca', 'R'); save(r, U());
store[gzKeys().find(k => k !== 'users_gz_cur')] = 'corrompu!!';
res = post({ action: 'login', username: 'jcaron@gryb.com', password: 'J' });
check('tranche corrompue : erreur serveur, jamais une liste vide', res.error === 'server error');
res = save(r, [{ username: 'joe@x.ca', email: 'joe@x.ca', password: 'P', role: 'dealer', name: 'Joe' }]);
check('tranche corrompue : aucune sauvegarde n ecrase la liste', !!res.error && store[gzKeys().find(k => k !== 'users_gz_cur')] === 'corrompu!!');
reset(); r = tok('robin@gryb.ca', 'R'); save(r, U());
const k0 = gzKeys().find(k => k !== 'users_gz_cur');
check('tranches illisibles par le GET public', JSON.parse(ctx.doGet({ parameter: { action: 'get', key: k0 } }).s).value === '');
check('tranches non modifiables par save/delete generiques', !!post({ action: 'save', key: 'users_gz_cur', value: 'A:0', token: r }).error && !!post({ action: 'delete', key: k0, token: r }).error && U().length === 4);

// --- non-regression
reset(); d = tok('dealer@x.ca', 'D');
res = save(d, []);
check('dealer : ecriture de la liste refusee', res.error === 'admin role required' && U().length === 4);
reset(); r = tok('robin@gryb.ca', 'R');
check('listusers admin intact', post({ action: 'listusers', token: r }).users.length === 4);
check('save d une autre cle intact', post({ action: 'save', key: 'notes_test', value: 'x', token: r }).ok === true);
res = save(r, 'pas du json');
check('liste invalide refusee', res.error === 'invalid users list' && U().length === 4);
check('login Jacquot intact', post({ action: 'login', username: 'jcaron@gryb.com', password: 'J' }).ok === true);
console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
