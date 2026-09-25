// Banc des actions de prix (getprices / setprices / getpriceslog) : apps-script/Code.gs
// execute en Node, services Google simules. 23 cas. Voir .claude/skills/portal-backend.
const fs = require('fs'), vm = require('vm'), path = require('path');
// Le VRAI backend du depot, charge tel quel (Apps Script = JavaScript).
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
// Liste maitresse : PRIX_MAITRE, sinon SharePoint _Portail e-Trak/prix-portail.json
const os = require('os');
function maitresse() {
  if (process.env.PRIX_MAITRE) return process.env.PRIX_MAITRE;
  const base = path.join(os.homedir(), 'e-Trak');
  const lib = fs.existsSync(base) && fs.readdirSync(base).find(n => /^E-Trak.*Production - Documents$/.test(n));
  if (!lib) { console.log('Liste maitresse introuvable : definir PRIX_MAITRE'); process.exit(2); }
  return path.join(base, lib, 'General', '_Portail e-Trak', 'prix-portail.json');
}
const vraiesPrix = JSON.parse(fs.readFileSync(maitresse(), 'utf8'));
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
    { username: 'robin@gryb.ca', email: 'robin@gryb.ca', password: 'R', role: 'administrateur', name: 'Robin' },
    { username: 'dealer@x.ca', email: 'dealer@x.ca', password: 'D', role: 'dealer', name: 'Dealer' },
    { username: 'tech@x.ca', email: 'tech@x.ca', password: 'T', role: 'technicien', name: 'Tech' },
    { username: 'off@x.ca', email: 'off@x.ca', password: 'O', role: 'dealer', name: 'Off', active: false },
  ]) };
}
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
let res;

reset();
res = post({ action: 'setprices', prices: vraiesPrix, pin: 'PINSECRET' });
check('PIN publie les 71 vrais prix', res.ok === true && res.codes === Object.keys(vraiesPrix).length);
check('prix decoupes sous la limite de 9 Ko par propriete', Object.keys(store).filter(k => /^price_list_\d+$/.test(k)).every(k => store[k].length <= 9216));

const d = tok('dealer@x.ca', 'D');
res = post({ action: 'getprices', token: d });
check('dealer connecte recoit exactement les memes prix', res.ok && JSON.stringify(res.prices) === JSON.stringify(vraiesPrix));
check('sans session : refuse', post({ action: 'getprices' }).error === 'authentication required');
check('faux jeton : refuse', post({ action: 'getprices', token: 'bidon' }).error === 'authentication required');
check('PIN seul ne donne pas les prix', post({ action: 'getprices', pin: 'PINSECRET' }).error === 'authentication required');
check('technicien (pas de Soumission) : refuse', post({ action: 'getprices', token: tok('tech@x.ca', 'T') }).error === 'forbidden');
check('compte desactive : ne se connecte meme pas', !post({ action: 'login', username: 'off@x.ca', password: 'O' }).ok);

// Permission retiree dans l'UI admin -> effet immediat
const r = tok('robin@gryb.ca', 'R');
post({ action: 'save', key: 'roles_permissions', value: JSON.stringify({ dealer: { soumissionAccess: false } }), token: r });
check('permission Soumission retiree au role dealer : refuse tout de suite', post({ action: 'getprices', token: d }).error === 'forbidden');
post({ action: 'save', key: 'roles_permissions', value: '{}', token: r });

// Fuites par les autres portes
check('GET public price_list_0 : vide', get({ action: 'get', key: 'price_list_0' }).value === '');
check('GET public du journal : vide', get({ action: 'get', key: 'price_list_log' }).value === '');
check('listing public : aucune cle de prix', get({ action: 'list', prefix: '' }).keys.every(k => k.indexOf('price_list_') !== 0));
check('save generique sur price_list_0 (admin) : refuse', !!post({ action: 'save', key: 'price_list_0', value: 'x', token: r }).error);
check('delete generique du journal (admin) : refuse', !!post({ action: 'delete', key: 'price_list_log', token: r }).error);

// Qui peut publier
check('dealer ne peut pas publier de prix', post({ action: 'setprices', prices: { A: { item: 1 } }, token: d }).error === 'admin role required');
check('publication invalide (prix texte) : refusee', !!post({ action: 'setprices', prices: { A: { item: '1 $' } }, pin: 'PINSECRET' }).error);
check('publication vide : refusee', !!post({ action: 'setprices', prices: {}, pin: 'PINSECRET' }).error);
check('apres refus, les vrais prix sont intacts', JSON.stringify(post({ action: 'getprices', token: d }).prices) === JSON.stringify(vraiesPrix));

// Grosse liste : decoupage + nettoyage des tranches en trop
const gros = {}; for (let i = 0; i < 400; i++) gros['9999-' + String(i).padStart(4, '0')] = { item: i * 10.5, install: 100, installCode: '1500-0888' };
res = post({ action: 'setprices', prices: gros, pin: 'PINSECRET' });
check('liste de 400 codes publiee en plusieurs tranches', res.ok && res.chunks > 1);
check('relue intacte', JSON.stringify(post({ action: 'getprices', token: d }).prices) === JSON.stringify(gros));
post({ action: 'setprices', prices: vraiesPrix, pin: 'PINSECRET' });
check('retour a 71 codes : tranches en trop effacees', !('price_list_' + res.chunks - 1 in store) && store.price_list_n === '1' && !store.price_list_1);

// Journal
const log = post({ action: 'getpriceslog', token: tok('jcaron@gryb.com', 'J') });
check('journal : le dealer apparait avec son nombre de remises', log.ok && log.log['dealer@x.ca'] && log.log['dealer@x.ca'].n >= 3 && !!log.log['dealer@x.ca'].last);
check('journal illisible pour un dealer', post({ action: 'getpriceslog', token: d }).error === 'admin role required');
console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
