// Banc des corrections de contacts Routes vendeurs -> Salesforce (synccorrections /
// getcorrections / setcorrections) : apps-script/Code.gs execute en Node, services Google
// simules. Donnees FABRIQUEES ici.
// Decision Jacquot du 2026-11-12 : file d'attente ; le serveur ne parle jamais a Salesforce,
// le script du poste lit la file avec le NIP et renvoie le resultat.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {}, feuilles = {}, creees = 0, uuid = 0;
function feuille() {
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
    setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  SpreadsheetApp: {
    create: () => { const id = 'SHEET' + (++creees); feuilles[id] = feuille(); return { getId: () => id, getSheets: () => [feuilles[id]] }; },
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
  { username: 'a@e', email: 'a@e', password: 'A', role: 'administrateur', name: 'Directeur' },
  { username: 's@e', email: 's@e', password: 'S', role: 'vente_interne', name: 'Simon Vendeur' },
  { username: 'r@e', email: 'r@e', password: 'R', role: 'vente_externe', name: 'Robert Vendeur' },
  { username: 'd@x', email: 'd@x', password: 'D', role: 'dealer', name: 'Dealer' },
];
store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify(comptes) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
const corr = (id, ts, extra) => Object.assign({ id, t: 'CA', ts, k: 's001OK00000epOu5YAE', fnom: 'Concord Concrete Pumps',
  sfa: '001OK00000epOu5YAE', sfc: '', prenom: 'Lino', nom: 'Flores', titre: 'Vice-President', tel: '604-468-7867',
  cell: '604-970-3599', courriel: 'LFlores@concordpumps.com', note: '' }, extra || {});
const S = tok('s@e', 'S'), R = tok('r@e', 'R'), A = tok('a@e', 'A');

// --- Acces ---
check('sans session : refuse', post({ action: 'synccorrections', corrections: [] }).error === 'authentication required');
check('PIN seul : refuse (il faut une identite)', post({ action: 'synccorrections', pin: 'PINSECRET', corrections: [] }).error === 'authentication required');
check('dealer : refuse', post({ action: 'synccorrections', token: tok('d@x', 'D'), corrections: [] }).error === 'forbidden');
let r = post({ action: 'synccorrections', token: R, corrections: [] });
check('vendeur sans correction : liste vide, aucune feuille creee', r.ok && r.corrections.length === 0 && creees === 0);

// --- Depot ---
r = post({ action: 'synccorrections', token: R, corrections: [corr('c1', 1000)] });
check('1re correction : deposee en attente, feuille creee', r.ok && r.corrections.length === 1 && r.corrections[0].etat === 'attente' && creees === 1);
const sh = feuilles.SHEET1;
check('feuille : en-tete + 1 ligne, compte et fiche lisibles', sh.rows.length === 2 && sh.rows[1][4] === '001OK00000epOu5YAE' && sh.rows[1][6] === 'Concord Concrete Pumps');
check('courriel mis en minuscules', JSON.parse(sh.rows[1][8]).courriel === 'lflores@concordpumps.com');
check('CORR_SHEET_ID illisible en GET public', !get({ action: 'get', key: 'CORR_SHEET_ID' }).value);
r = post({ action: 'synccorrections', token: R, corrections: [corr('c1', 2000, { titre: 'VP Operations' })] });
check('version plus recente en attente : remplace la ligne', r.corrections[0].titre === 'VP Operations' && sh.rows.length === 2);
r = post({ action: 'synccorrections', token: R, corrections: [corr('c1', 1500, { titre: 'Vieux' })] });
check('version plus ancienne : ignoree', r.corrections[0].titre === 'VP Operations');

// --- Refus ---
r = post({ action: 'synccorrections', token: R, corrections: [
  corr('bad id!', 1000), corr('c2', 1000, { t: 'FR' }), corr('c3', 1000, { sfa: '003XXXXXXXXXXXX' }),
  corr('c4', 1000, { sfc: 'pasunid' }), corr('c5', 1000, { nom: '' }), corr('c6', 1000, { courriel: 'pas-un-courriel' }),
  corr('c7', 1000, { prenom: '', titre: '', tel: '', cell: '', courriel: '' }), corr('c8', 0)] });
check('id, territoire, compte, contact, nom vide, courriel, rien a ecrire, ts nul : refuses', r.refusees === 8 && sh.rows.length === 2);
check('plus de 50 en un envoi : refuse', post({ action: 'synccorrections', token: R, corrections: Array(51).fill(corr('x', 1)) }).error === 'too many corrections');
r = post({ action: 'synccorrections', token: R, corrections: [corr('c9', 1000, { nom: '=HYPERLINK("x")', fnom: '+cmd', champ_inconnu: 'x', v: 12345 })] });
const lig = sh.rows[2];
check('formule neutralisee dans la feuille, champ inconnu jamais stocke', String(lig[6]).startsWith("'+") && !/champ_inconnu|12345/.test(lig[8]));

// --- v62 : fiche sans compte Salesforce ---
const n0 = sh.rows.length;
r = post({ action: 'synccorrections', token: R, corrections: [
  corr('c10', 1000, { sfa: '', sfc: '', fnom: 'Pumpcrete Inc.', a: { rue: '161 Caldari Rd', ville: 'Concord', prov: 'ON', cp: 'L4K 3Z9', tel: '416-678-5728', pays: 'Canada', epicor: '6692017', st: 'actif', v: 99999 } }),
  corr('c11', 1000, { sfa: '', sfc: '', fnom: 'X', a: { ville: 'Concord' } }),
  corr('c12', 1000, { sfa: '', sfc: '', fnom: 'Sans adresse', a: {} })] });
const c10 = r.corrections.find(x => x.id === 'c10');
check('sans compte SF : acceptee avec nom, adresse et telephone de la fiche', c10 && c10.sfa === '' && c10.a.ville === 'Concord' && c10.a.epicor === '6692017');
check("sans compte SF : champ inconnu de l'adresse jamais stocke", !/99999/.test(sh.rows[sh.rows.length - 1][8]));
check('sans compte SF : nom trop court ou ni ville ni telephone -> refuse', r.refusees === 2 && sh.rows.length === n0 + 1);
check('avec compte SF : pas de bloc adresse stocke', !('a' in JSON.parse(sh.rows[1][8])));

// --- Chacun les siennes ---
r = post({ action: 'synccorrections', token: S, corrections: [] });
check('Simon ne voit pas celles de Robert', r.ok && r.corrections.length === 0);

// --- Lecture par le script du poste ---
check('getcorrections sans NIP : refuse', post({ action: 'getcorrections' }).error === 'authentication required');
check('getcorrections avec session admin : refuse (NIP seulement)', post({ action: 'getcorrections', token: A, pin: A }).error === 'authentication required');
let g = post({ action: 'getcorrections', pin: 'PINSECRET' });
check('getcorrections NIP : 3 en attente, auteur nomme', g.ok && g.corrections.length === 3 && g.corrections[0].auteur === 'r@e' && g.corrections[0].auteur_nom === 'Robert Vendeur');

// --- Resultat ---
check('setcorrections sans NIP : refuse', post({ action: 'setcorrections', resultats: [] }).error === 'authentication required');
let s = post({ action: 'setcorrections', pin: 'PINSECRET', resultats: [
  { id: 'c1', auteur: 'r@e', etat: 'faite', resultat: 'Contact mis a jour (003OK...)' },
  { id: 'c9', auteur: 'r@e', etat: 'refusee', resultat: 'compte GRYB' },
  { id: 'c1', auteur: 's@e', etat: 'faite', resultat: 'mauvais auteur' },
  { id: 'zz', auteur: 'r@e', etat: 'faite' }, { id: 'c9', auteur: 'r@e', etat: 'bidon' }] });
check('setcorrections : 2 lignes mises a jour, mauvais auteur / id inconnu / etat inconnu ignores', s.ok && s.maj === 2);
r = post({ action: 'synccorrections', token: R, corrections: [] });
const c1 = r.corrections.find(x => x.id === 'c1'), c9 = r.corrections.find(x => x.id === 'c9');
check('le vendeur voit le resultat', c1.etat === 'faite' && /mis a jour/.test(c1.resultat) && c9.etat === 'refusee');
r = post({ action: 'synccorrections', token: R, corrections: [corr('c1', 9000, { titre: 'Apres coup' })] });
check('correction deja faite : plus modifiable', r.corrections.find(x => x.id === 'c1').titre === 'VP Operations');
check('getcorrections : reste seulement la correction sans compte SF', (g = post({ action: 'getcorrections', pin: 'PINSECRET' }).corrections).length === 1 && g[0].id === 'c10');

// --- Compte desactive ---
comptes[2].active = false; store.authorized_users_v2 = JSON.stringify(comptes);
check('compte desactive : refuse tout de suite', post({ action: 'synccorrections', token: R, corrections: [] }).error === 'authentication required');

console.log(`${ok} OK, ${ko} echec(s)`);
process.exit(ko ? 1 : 0);
