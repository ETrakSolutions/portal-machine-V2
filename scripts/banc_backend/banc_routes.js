// Banc des routes vendeurs (syncroutes / getroutesequipe) : apps-script/Code.gs execute en
// Node, services Google simules, Google Sheet comprise. Donnees FABRIQUEES ici.
// Decisions Jacquot du 2026-11-09 : comptes internes seulement, chacun ses routes, les
// administrateurs lisent celles de l'equipe ; noms et classes des clients, jamais un montant ;
// stockage dans une Google Sheet, jamais dans les proprietes.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {}, feuilles = {}, creees = 0, uuid = 0;
function feuille(id) {
  const rows = [];
  return {
    rows, setName() {}, setFrozenRows() {},
    appendRow: r => { rows.push(r.slice()); },
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (l, c, n, m) => ({ setValues: v => { for (let j = 0; j < m; j++) rows[l - 1][c - 1 + j] = v[0][j]; } }),
    getLastRow: () => rows.length,
  };
}
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { v = String(v); if (v.length > 9216) throw new Error('Argument too large: value'); store[k] = v; },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  SpreadsheetApp: {
    create: () => { const id = 'SHEET' + (++creees); feuilles[id] = feuille(id); return { getId: () => id, getSheets: () => [feuilles[id]] }; },
    openById: id => { if (!feuilles[id]) throw new Error('introuvable'); return { getSheets: () => [feuilles[id]] }; },
  },
  Utilities: { getUuid: () => 'uuid-' + (++uuid), sleep: () => {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, MailApp: {}, UrlFetchApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const get = q => JSON.parse(ctx.doGet({ parameter: q }).s);
const comptes = [
  { username: 'j@e', email: 'j@e', password: 'J', role: 'super_admin', name: 'Admin' },
  { username: 'a@e', email: 'a@e', password: 'A', role: 'administrateur', name: 'Directeur' },
  { username: 's@e', email: 's@e', password: 'S', role: 'vente_interne', name: 'Simon Vendeur' },
  { username: 'r@e', email: 'r@e', password: 'R', role: 'vente_externe', name: 'Robert Vendeur' },
  { username: 'd@x', email: 'd@x', password: 'D', role: 'dealer', name: 'Dealer' },
  { username: 'di@x', email: 'di@x', password: 'DI', role: 'distributeur', name: 'Distri' },
  { username: 'i@x', email: 'i@x', password: 'I', role: 'installateur', name: 'Installateur' },
];
store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify(comptes) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
const route = (id, ts, extra) => Object.assign({ id, t: 'QC', ts, nom: 'Beauce - mardi', cree: '2026-11-09', modif: '2026-11-09',
  k: ['e590', 'e1759', 's0018c00002Rw5bhAAB'], depart: 'Victoriaville', arrivee: '', minv: 45,
  photo: [{ k: 'e590', nom: 'Client A', ville: 'Magog', st: 'actif', cl: 'A', sens: '' }], ign: ['e12'] }, extra || {});

const S = tok('s@e', 'S'), R = tok('r@e', 'R'), J = tok('j@e', 'J'), A = tok('a@e', 'A');

// --- Acces ---
check('sans session : refuse', post({ action: 'syncroutes', routes: [] }).error === 'authentication required');
check('PIN seul : refuse (il faut une identite)', post({ action: 'syncroutes', pin: 'PINSECRET', routes: [] }).error === 'authentication required');
check('dealer : refuse', post({ action: 'syncroutes', token: tok('d@x', 'D'), routes: [] }).error === 'forbidden');
check('distributeur : refuse', post({ action: 'syncroutes', token: tok('di@x', 'DI'), routes: [] }).error === 'forbidden');
check('installateur : refuse', post({ action: 'syncroutes', token: tok('i@x', 'I'), routes: [] }).error === 'forbidden');
let r = post({ action: 'syncroutes', token: S, routes: [] });
check('vendeur sans route : liste vide, aucune feuille creee', r.ok && r.routes.length === 0 && creees === 0 && r.admin === false && r.nom === 'Simon Vendeur');

// --- Ecriture ---
r = post({ action: 'syncroutes', token: S, routes: [route('r1', 1000)] });
check('1re route : ecrite, feuille creee une fois', r.ok && r.ecrites === 1 && creees === 1 && r.routes.length === 1);
const sh = feuilles.SHEET1;
check('feuille : en-tete + 1 ligne', sh.rows.length === 2 && sh.rows[1][0] === 's@e' && sh.rows[1][2] === 'QC');
check('ROUTES_SHEET_ID illisible en GET public', !get({ action: 'get', key: 'ROUTES_SHEET_ID' }).value);
check('ROUTES_SHEET_ID pas dans les proprietes de routes (une seule cle)', Object.keys(store).filter(k => /route/i.test(k)).length === 1);
r = post({ action: 'syncroutes', token: S, routes: [route('r1', 1000)] });
check('meme route renvoyee : rien de reecrit', r.ok && r.ecrites === 0 && sh.rows.length === 2);
r = post({ action: 'syncroutes', token: S, routes: [route('r1', 900, { nom: 'Vieille version' })] });
check('version plus ancienne (autre appareil) : ignoree', r.routes[0].nom === 'Beauce - mardi' && r.ecrites === 0);
r = post({ action: 'syncroutes', token: S, routes: [route('r1', 2000, { nom: 'Beauce - jeudi', k: ['e590'] })] });
check('version plus recente : remplace la ligne', r.routes[0].nom === 'Beauce - jeudi' && r.routes[0].k.length === 1 && sh.rows.length === 2);

// --- Liste blanche : jamais un montant ---
r = post({ action: 'syncroutes', token: S, routes: [route('r2', 1000, { montant: 12345, v: { 2026: 999 },
  photo: [{ k: 'e590', nom: 'Client A', ville: 'Magog', st: 'actif', cl: 'A', sens: '', vRef: 104067, sqv: 5000 }] })] });
const json = sh.rows[2][7];
check('montants envoyes par erreur : jamais stockes', !/12345|104067|5000|999|montant|vRef|sqv/.test(json));
check('nom et classe du client : stockes (decision Jacquot)', /Client A/.test(json) && /"cl":"A"/.test(json));
r = post({ action: 'syncroutes', token: S, routes: [route('r3', 1000, { nom: '=HYPERLINK("http://x")' })] });
check('nom commencant par = : neutralise dans la feuille', String(sh.rows[3][3]).startsWith("'="));

// --- Refus ---
r = post({ action: 'syncroutes', token: S, routes: [route('mauvais id!', 1000), route('r4', 1000, { t: 'FR' }), route('r5', 0),
  route('r6', 1000, { k: Array(150).fill('x'.repeat(60)), photo: Array(200).fill({ k: 'x'.repeat(60), nom: 'n'.repeat(120), ville: 'v'.repeat(80) }) })] });
check('id invalide, territoire inconnu, ts nul, route trop grosse : refuses', r.refusees === 4 && sh.rows.length === 4);
check('plus de 200 routes en un envoi : refuse', post({ action: 'syncroutes', token: S, routes: Array(201).fill(route('x', 1)) }).error === 'too many routes');

// --- Chacun ses routes ---
r = post({ action: 'syncroutes', token: R, routes: [] });
check("Robert ne voit pas les routes de Simon", r.ok && r.routes.length === 0);
r = post({ action: 'syncroutes', token: R, routes: [route('r1', 5000, { nom: 'Ontario nord', t: 'CA' })] });
const s2 = post({ action: 'syncroutes', token: S, routes: [] });
check("meme id chez Robert : n'ecrase pas la route de Simon", r.routes[0].nom === 'Ontario nord' && s2.routes.find(x => x.id === 'r1').nom === 'Beauce - jeudi');

// --- Suppression = ligne « supprimee » ---
r = post({ action: 'syncroutes', token: S, routes: [{ id: 'r3', t: 'QC', ts: 3000, supprimee: true, nom: 'x' }] });
check('suppression : gardee comme supprimee (l\'autre appareil ne la recree pas)', r.routes.find(x => x.id === 'r3').supprimee === true);
r = post({ action: 'syncroutes', token: S, routes: [route('r3', 2500)] });
check('ancienne copie d\'une route supprimee : ne la ressuscite pas', r.routes.find(x => x.id === 'r3').supprimee === true);

// --- Routes de l'equipe ---
check('equipe : vendeur refuse', post({ action: 'getroutesequipe', token: S }).error === 'forbidden');
check('equipe : sans session refuse', post({ action: 'getroutesequipe' }).error === 'authentication required');
check('equipe : PIN seul refuse', post({ action: 'getroutesequipe', pin: 'PINSECRET' }).error === 'authentication required');
let e = post({ action: 'getroutesequipe', token: A });
check('equipe : administrateur lit toutes les routes non supprimees', e.ok && e.routes.length === 3 && !e.routes.some(x => x.supprimee));
check('equipe : vendeur designe par son nom', e.routes.some(x => x.vendeur === 'Simon Vendeur') && e.routes.some(x => x.vendeur === 'Robert Vendeur'));
check('equipe : ni courriel ni liste « ignores »', !JSON.stringify(e).includes('s@e') && !JSON.stringify(e).includes('"ign"'));
check('equipe : super admin admis', post({ action: 'getroutesequipe', token: J }).ok === true);

// --- Compte desactive ---
comptes[2].active = false; store.authorized_users_v2 = JSON.stringify(comptes);
check('compte desactive : session refusee tout de suite', post({ action: 'syncroutes', token: S, routes: [] }).error === 'authentication required');

console.log(`${ok} OK, ${ko} echec(s)`);
process.exit(ko ? 1 : 0);
