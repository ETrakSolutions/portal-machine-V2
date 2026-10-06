// Banc de la lecture authentifiee (getprivate / listkeys) et de la fermeture de la
// lecture publique (LECTURE_PUBLIQUE_FERMEE) : apps-script/Code.gs execute en Node,
// services Google simules. Les DEUX positions de l'interrupteur sont testees : etape 1
// (ouvert : rien ne casse pour les pages actuelles) et etape 3 (ferme).
// Voir .claude/skills/portal-backend et SharePoint « Correctif - lecture publique du serveur.md ».
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
// L'interrupteur peut etre a false (etape 1) ou a true (etape 3) dans le fichier :
// le banc impose lui-meme chaque position.
const INTER = /var LECTURE_PUBLIQUE_FERMEE = (true|false);/;

let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };

function charger(ferme) {
  if (!INTER.test(SRC)) { console.log('ECHEC interrupteur absent de Code.gs'); process.exit(1); }
  const src = SRC.replace(INTER, 'var LECTURE_PUBLIQUE_FERMEE = ' + (ferme ? 'true' : 'false') + ';');
  let store = {};
  const ctx = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); },
      deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
    Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '-aaaa', sleep: () => {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Logger: { log: () => {} }, Session: {}, MailApp: {}, UrlFetchApp: {}, console,
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  store = {
    PIN: 'PINSECRET',
    authorized_users_v2: JSON.stringify([
      { username: 'admin@gryb.com', email: 'admin@gryb.com', password: 'A', role: 'administrateur', name: 'Admin' },
      { username: 'dealer@x.ca', email: 'dealer@x.ca', password: 'D', role: 'dealer', name: 'Dealer' },
    ]),
    machine_requests: '[{"requesterEmail":"a@b.ca"}]',
    machine_request_emails: '["x@e-trak.ca"]', notes_emails: '["n@e-trak.ca"]',
    target_emails: '["t@e-trak.ca"]', kit_emails: '["k@e-trak.ca"]', db_changelog: '[]',
    user_active_dealer_x_ca: '{"lastPing":1}', inactivity_notice_client_y_ca: '{"palier":30}',
    sales_emails: '["ventes@e-trak.ca"]', vendeurs_list: '[{"email":"rep@e-trak.ca"}]',
    roles_permissions: '{}', product_codes_Case_CX_2024: '["0001"]', notes_Case_CX_2024: 'note',
  };
  const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
  const get = q => JSON.parse(ctx.doGet({ parameter: q }).s);
  const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
  return { post, get, store: () => store, admin: tok('admin@gryb.com', 'A'), dealer: tok('dealer@x.ca', 'D') };
}

const PRIVEES = ['machine_requests', 'machine_request_emails', 'notes_emails', 'target_emails', 'kit_emails', 'db_changelog'];
const PUBLIQUES = ['sales_emails', 'vendeurs_list', 'roles_permissions', 'product_codes_Case_CX_2024', 'notes_Case_CX_2024'];

// ---------------- ETAPE 1 : interrupteur OUVERT ----------------
let B = charger(false);
console.log('--- etape 1 (ouvert) ---');
check('jetons de test obtenus', !!B.admin && !!B.dealer);
check('GET public machine_requests : rend encore la valeur (pages actuelles intactes)', B.get({ action: 'get', key: 'machine_requests' }).value !== '');
check('GET public list : rend encore les cles', B.get({ action: 'list', prefix: '' }).keys.length > 5);
check('getprivate sans jeton : refuse', B.post({ action: 'getprivate', key: 'machine_requests' }).error === 'authentication required');
check('getprivate faux jeton : refuse', B.post({ action: 'getprivate', key: 'machine_requests', token: 'bidon' }).error === 'authentication required');
for (const k of PRIVEES) {
  check('getprivate dealer ' + k + ' : valeur', B.post({ action: 'getprivate', key: k, token: B.dealer }).value === B.store()[k]);
}
check('getprivate dealer user_active_ : refuse (admin seulement)', B.post({ action: 'getprivate', key: 'user_active_dealer_x_ca', token: B.dealer }).error === 'admin role required');
check('getprivate dealer inactivity_notice_ : refuse', B.post({ action: 'getprivate', key: 'inactivity_notice_client_y_ca', token: B.dealer }).error === 'admin role required');
check('getprivate admin user_active_ : valeur', B.post({ action: 'getprivate', key: 'user_active_dealer_x_ca', token: B.admin }).value === '{"lastPing":1}');
check('getprivate jeton dans « pin » (convention du frontend) : valeur', B.post({ action: 'getprivate', key: 'notes_emails', pin: B.dealer }).value === '["n@e-trak.ca"]');
check('getprivate PIN : valeur', B.post({ action: 'getprivate', key: 'machine_requests', pin: 'PINSECRET' }).value !== '');
check('getprivate admin authorized_users_v2 : vide (secret)', B.post({ action: 'getprivate', key: 'authorized_users_v2', token: B.admin }).value === '');
check('getprivate admin PIN : vide (secret)', B.post({ action: 'getprivate', key: 'PIN', token: B.admin }).value === '');
const sessKey = Object.keys(B.store()).find(k => k.indexOf('session_') === 0);
check('getprivate admin cle de session : vide', !!sessKey && B.post({ action: 'getprivate', key: sessKey, token: B.admin }).value === '');
check('getprivate sans cle : erreur', B.post({ action: 'getprivate', token: B.admin }).error === 'key required');
check('listkeys sans auth : refuse', B.post({ action: 'listkeys' }).error === 'authentication required');
check('listkeys dealer : refuse', B.post({ action: 'listkeys', token: B.dealer }).error === 'admin role required');
let lk = B.post({ action: 'listkeys', prefix: '', pin: 'PINSECRET' }).keys || [];
check('listkeys PIN : liste complete (sauvegarde hebdo)', lk.indexOf('user_active_dealer_x_ca') >= 0 && lk.indexOf('machine_requests') >= 0);
check('listkeys PIN : jamais de session ni de secret', lk.every(k => k.indexOf('session_') !== 0 && k !== 'PIN' && k !== 'authorized_users_v2'));

// ---------------- ETAPE 3 : interrupteur FERME ----------------
B = charger(true);
console.log('--- etape 3 (ferme) ---');
for (const k of PRIVEES) {
  check('GET public ' + k + ' : vide', B.get({ action: 'get', key: k }).value === '');
}
check('GET public user_active_ : vide', B.get({ action: 'get', key: 'user_active_dealer_x_ca' }).value === '');
check('GET public inactivity_notice_ : vide', B.get({ action: 'get', key: 'inactivity_notice_client_y_ca' }).value === '');
for (const k of PUBLIQUES) {
  check('GET public ' + k + ' : toujours lisible (invite, pages avant connexion)', B.get({ action: 'get', key: k }).value === B.store()[k]);
}
check('GET public list : vide', B.get({ action: 'list', prefix: '' }).keys.length === 0);
check('POST list sans auth : vide', B.post({ action: 'list', prefix: '' }).keys.length === 0);
check('getprivate dealer machine_requests : toujours la valeur', B.post({ action: 'getprivate', key: 'machine_requests', token: B.dealer }).value !== '');
check('getprivate admin user_active_ : toujours la valeur', B.post({ action: 'getprivate', key: 'user_active_dealer_x_ca', token: B.admin }).value !== '');
lk = B.post({ action: 'listkeys', prefix: '', pin: 'PINSECRET' }).keys || [];
check('listkeys PIN : toujours la liste complete', lk.indexOf('user_active_dealer_x_ca') >= 0);
// Les ecritures ne changent pas : battement d'activite (heartbeat.js) et demande de machine
check('save user_active_ par jeton (heartbeat) : accepte', B.post({ action: 'save', key: 'user_active_dealer_x_ca', value: '{"lastPing":2}', token: B.dealer }).ok === true);
check('save machine_requests par jeton dealer : accepte', B.post({ action: 'save', key: 'machine_requests', value: '[]', token: B.dealer }).ok === true);

console.log(ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
