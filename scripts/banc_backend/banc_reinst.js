// Banc de la tuile Reinstallation (getreinst / setreinst) : apps-script/Code.gs execute
// en Node, services Google simules. Decision Jacquot 2026-10-29 : quatre personnes
// nommees, jamais dealer ni distributeur, le PIN publie mais ne lit pas.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {};
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { v = String(v); if (v.length > 9216) throw new Error('Argument too large: value'); store[k] = v; },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '-aaaa', sleep: () => {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, MailApp: {}, UrlFetchApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const get = q => JSON.parse(ctx.doGet({ parameter: q }).s);
function reset() {
  store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify([
    { username: 'jcaron@gryb.com', email: 'jcaron@gryb.com', password: 'J', role: 'super_admin', name: 'Jacquot' },
    { username: 'k.berube@e-trak.ca', email: 'k.berube@e-trak.ca', password: 'K', role: 'vente_interne', name: 'Kevin' },
    { username: 'robin@gryb.ca', email: 'robin@gryb.ca', password: 'R', role: 'administrateur', name: 'Robin' },
    { username: 'dealer@x.ca', email: 'dealer@x.ca', password: 'D', role: 'dealer', name: 'Dealer' },
    { username: 'dluna@e-trak.ca', email: 'dluna@e-trak.ca', password: 'L', role: 'dealer', name: 'Luna devenue dealer' },
    { username: 'steve@gryb.ca', email: 'steve@gryb.ca', password: 'S', role: 'administrateur', name: 'Steve', active: false },
  ]) };
}
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
const DONNEES = { prix: { TAUX_H: 185, KM: 2.34, PIECES_LIM: 868.79, INST_LIM: 1500 }, vigueur: '2026-11-16' };
let res;

reset();
const j = tok('jcaron@gryb.com', 'J'), k = tok('k.berube@e-trak.ca', 'K'), r = tok('robin@gryb.ca', 'R');
check('avant publication : indisponible pour un admis', post({ action: 'getreinst', token: k }).error === 'reinst unavailable');

res = post({ action: 'setreinst', reinst: DONNEES, pin: 'PINSECRET' });
check('PIN publie les montants', res.ok === true && res.codes === 4);
res = post({ action: 'getreinst', token: k });
check('Kevin (vente interne, nomme) lit les montants exacts', res.ok && JSON.stringify(res.reinst.prix) === JSON.stringify(DONNEES.prix) && res.reinst.vigueur === '2026-11-16');
check('Jacquot (nomme) lit', post({ action: 'getreinst', token: j }).ok === true);
check('administrateur NON nomme (Robin) : refuse', post({ action: 'getreinst', token: r }).error === 'forbidden');
check('dealer : refuse', post({ action: 'getreinst', token: tok('dealer@x.ca', 'D') }).error === 'forbidden');
check('compte nomme mais passe dealer : refuse', post({ action: 'getreinst', token: tok('dluna@e-trak.ca', 'L') }).error === 'forbidden');
check('compte nomme desactive : ne se connecte pas', !post({ action: 'login', username: 'steve@gryb.ca', password: 'S' }).ok);
check('sans session : refuse', post({ action: 'getreinst' }).error === 'authentication required');
check('PIN seul ne lit pas les montants', post({ action: 'getreinst', pin: 'PINSECRET' }).error === 'authentication required');

// Liste remplacee sans redeploiement
store.REINST_USERS = 'robin@gryb.ca';
check('REINST_USERS : Robin admis', post({ action: 'getreinst', token: r }).ok === true);
check('REINST_USERS : Kevin retire tout de suite', post({ action: 'getreinst', token: k }).error === 'forbidden');
delete store.REINST_USERS;

// Fuites par les autres portes
check('GET public reinst_prix : vide', get({ action: 'get', key: 'reinst_prix' }).value === '');
check('listing public : pas de reinst_prix', (get({ action: 'list', prefix: '' }).keys || []).indexOf('reinst_prix') < 0);
check('getprices ne contient pas ces montants', JSON.stringify(post({ action: 'getprices', token: k }).prices || {}).indexOf('PIECES_LIM') < 0);

// Qui publie, et quoi
check('vente interne ne publie pas', post({ action: 'setreinst', reinst: DONNEES, token: k }).error === 'admin role required');
check('dealer ne publie pas', post({ action: 'setreinst', reinst: DONNEES, token: tok('dealer@x.ca', 'D') }).error === 'admin role required');
check('montant texte : refuse', !!post({ action: 'setreinst', reinst: { prix: { KM: '2,34 $' } }, pin: 'PINSECRET' }).error);
check('montant negatif : refuse', !!post({ action: 'setreinst', reinst: { prix: { KM: -1 } }, pin: 'PINSECRET' }).error);
check('code avec balise : refuse', !!post({ action: 'setreinst', reinst: { prix: { '<b>x</b>': 1 } }, pin: 'PINSECRET' }).error);
check('liste vide : refusee', !!post({ action: 'setreinst', reinst: { prix: {} }, pin: 'PINSECRET' }).error);
check('apres refus, montants intacts', JSON.stringify(post({ action: 'getreinst', token: k }).reinst.prix) === JSON.stringify(DONNEES.prix));
res = post({ action: 'setreinst', reinst: { prix: { KM: 2.34 }, vigueur: '<script>' }, pin: 'PINSECRET' });
check('vigueur invalide : videe, pas stockee telle quelle', res.ok && post({ action: 'getreinst', token: k }).reinst.vigueur === '');
console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
