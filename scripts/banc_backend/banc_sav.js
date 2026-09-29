// Banc des actions SAV (getsav / setsav) : apps-script/Code.gs execute en Node,
// services Google simules. Donnees FABRIQUEES ici (aucun vrai client). Voir
// .claude/skills/portal-backend. Decision Jacquot du 2026-09-29 : roles internes,
// nom + ville + dealer/direct seulement.
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
// Blob / gzip / base64 d'Apps Script, simules avec zlib (octets = Buffer).
const blob = buf => ({ buf, getBytes: () => buf, getDataAsString: () => buf.toString('utf8') });
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {};
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { v = String(v); if (v.length > 9216) throw new Error('Argument too large: value'); store[k] = v; },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '-aaaa', sleep: () => {},
    newBlob: (d) => blob(Buffer.isBuffer(d) ? d : Buffer.from(String(d), 'utf8')),
    gzip: b => blob(zlib.gzipSync(b.buf)), ungzip: b => blob(zlib.gunzipSync(b.buf)),
    base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => Buffer.from(s, 'base64') },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, MailApp: {}, UrlFetchApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const get = q => JSON.parse(ctx.doGet({ parameter: q }).s);
store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify([
  { username: 'j@e', email: 'j@e', password: 'J', role: 'super_admin', name: 'Admin' },
  { username: 'vi@e', email: 'vi@e', password: 'VI', role: 'vente_interne', name: 'Vente int' },
  { username: 't@e', email: 't@e', password: 'T', role: 'technicien', name: 'Tech' },
  { username: 'd@x', email: 'd@x', password: 'D', role: 'dealer', name: 'Dealer' },
  { username: 's@x', email: 's@x', password: 'S', role: 'distributeur', name: 'Distri' },
  { username: 'off@e', email: 'off@e', password: 'O', role: 'technicien', name: 'Off', active: false },
]) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };

// Jeu fabrique : assez gros pour exiger plusieurs tranches
const clients = [], pieces = [];
for (let i = 0; i < 700; i++) clients.push(['Client fictif ' + i, 'Ville ' + (i % 40), 'QC', i % 3 ? 'direct' : 'dealer']);
for (let i = 0; i < 900; i++) pieces.push(['E03A-' + String(i).padStart(4, '0'), 'Piece fictive numero ' + i]);
const sav = { clients, pieces, produits: ['LIMIT-ELG', 'Autre'],
  routage: [{ cle: 'steve', nom: 'Steve', courriel: 's@e', regle: 'Piece' }], cc: ['k@e'],
  intrus: 'ne doit pas passer' };

let res = post({ action: 'setsav', sav, pin: 'PINSECRET' });
check('PIN publie la liste SAV', res.ok === true && res.clients === 700 && res.pieces === 900);
check('liste stockee COMPRESSEE (quota de 500 Ko partage)', store.sav_ref_fmt === 'gz' && res.octets < JSON.stringify(sav).length / 2);
check('tranches sous 9 Ko chacune', Object.keys(store).filter(k => /^sav_ref_\d+$/.test(k)).every(k => store[k].length <= 9216));

const vi = tok('vi@e', 'VI');
res = post({ action: 'getsav', token: vi });
check('vente interne recoit la liste intacte', res.ok && res.sav.clients.length === 700 && res.sav.pieces.length === 900
  && JSON.stringify(res.sav.clients[5]) === JSON.stringify(clients[5]));
check('routage, produits et cc transmis', res.sav.routage[0].courriel === 's@e' && res.sav.produits.length === 2 && res.sav.cc[0] === 'k@e');
check('champ non prevu jete par la liste blanche', !('intrus' in res.sav));
check('technicien (role interne) : recoit', post({ action: 'getsav', token: tok('t@e', 'T') }).ok === true);
check('dealer : refuse', post({ action: 'getsav', token: tok('d@x', 'D') }).error === 'forbidden');
check('distributeur : refuse', post({ action: 'getsav', token: tok('s@x', 'S') }).error === 'forbidden');
check('sans session : refuse', post({ action: 'getsav' }).error === 'authentication required');
check('PIN seul ne donne pas la liste', post({ action: 'getsav', pin: 'PINSECRET' }).error === 'authentication required');
check('compte desactive : ne se connecte pas', !post({ action: 'login', username: 'off@e', password: 'O' }).ok);

// Publication compressee (savGz), comme publier_sav.py
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(sav), 'utf8')).toString('base64');
res = post({ action: 'setsav', savGz: gz, pin: 'PINSECRET' });
check('publication savGz acceptee', res.ok && res.clients === 700 && res.pieces === 900);
check('relue intacte apres savGz', JSON.stringify(post({ action: 'getsav', token: vi }).sav.pieces[899]) === JSON.stringify(pieces[899]));
check('savGz corrompu : refuse, liste intacte', post({ action: 'setsav', savGz: 'pas-du-gzip', pin: 'PINSECRET' }).error === 'invalid savGz'
  && post({ action: 'getsav', token: vi }).sav.clients.length === 700);
check('accents conserves', (() => { post({ action: 'setsav', sav: { clients: [['Équipements Gérard Côté', 'Lévis', 'QC', 'direct']], pieces: [] }, pin: 'PINSECRET' });
  const c = post({ action: 'getsav', token: vi }).sav.clients[0][0]; post({ action: 'setsav', savGz: gz, pin: 'PINSECRET' }); return c === 'Équipements Gérard Côté'; })());

// Fuites par les portes generiques
check('GET public sav_ref_0 : vide', get({ action: 'get', key: 'sav_ref_0' }).value === '');
check('GET public sav_ref_n : vide', get({ action: 'get', key: 'sav_ref_n' }).value === '');
check('listing public : aucune cle sav_ref_', get({ action: 'list', prefix: '' }).keys.every(k => k.indexOf('sav_ref_') !== 0));
const adm = tok('j@e', 'J');
check('save generique sur sav_ref_0 (admin) : refuse', !!post({ action: 'save', key: 'sav_ref_0', value: 'x', token: adm }).error);
check('delete generique sur sav_ref_n (admin) : refuse', !!post({ action: 'delete', key: 'sav_ref_n', token: adm }).error);
check('les prix restent proteges (garde commune)', get({ action: 'get', key: 'price_list_0' }).value === '');

// Qui peut publier
check('vente interne ne peut pas publier', post({ action: 'setsav', sav, token: vi }).error === 'admin role required');
check('publication invalide (clients absent) : refusee', !!post({ action: 'setsav', sav: { pieces: [] }, pin: 'PINSECRET' }).error);
check('publication invalide (client sans nom) : refusee', !!post({ action: 'setsav', sav: { clients: [['', 'X']], pieces: [] }, pin: 'PINSECRET' }).error);
check('apres refus, la liste est intacte', post({ action: 'getsav', token: vi }).sav.clients.length === 700);

// Republication plus petite : tranches en trop effacees
res = post({ action: 'setsav', sav: { clients: [['Seul client', 'Victoriaville', 'QC', 'direct']], pieces: [['A-1', 'Piece']] }, pin: 'PINSECRET' });
check('republication plus petite : une seule tranche, les autres effacees',
  res.ok && store.sav_ref_n === '1' && !store.sav_ref_1 && post({ action: 'getsav', token: vi }).sav.clients.length === 1);
check('type inconnu ramene a vide', (() => { post({ action: 'setsav', sav: { clients: [['C', 'V', 'QC', 'pirate']], pieces: [] }, pin: 'PINSECRET' });
  return post({ action: 'getsav', token: vi }).sav.clients[0][3] === ''; })());
console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
