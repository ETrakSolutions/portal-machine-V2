// Banc des comptes proteges (Super Admin, proprietaire) : apps-script/Code.gs execute
// en Node, services Google simules. 21 cas. Voir .claude/skills/portal-backend.
const fs = require('fs'), vm = require('vm'), path = require('path');
// Le VRAI backend du depot, charge tel quel (Apps Script = JavaScript).
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {};
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '-aaaa-bbbb', sleep: () => {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, MailApp: {}, UrlFetchApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const U = () => JSON.parse(store.authorized_users_v2);
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
