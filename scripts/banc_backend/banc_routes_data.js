// Banc des donnees de la tuile « Routes vendeurs » (setroutesdata / getroutesdata) :
// apps-script/Code.gs execute en Node, Drive et gzip simules. Donnees FABRIQUEES ici.
// Decisions Jacquot du 2026-11-09 : la page vit dans le portail (telephone) ; AUCUN montant
// de vente (tendance en fleches) ; contacts inclus ; soumission ouverte sans montant ;
// chaque vendeur ne recoit que son territoire, les administrateurs tous.
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
const blob = buf => ({ buf, getBytes: () => buf, getDataAsString: () => buf.toString('utf8') });
let store = {}, fichiers = {}, dossiers = 0;
function dossier(id) {
  return {
    getId: () => id,
    getFilesByName: nom => { const L = Object.keys(fichiers).filter(k => k === id + '/' + nom); let i = 0;
      return { hasNext: () => i < L.length, next: () => fichier(L[i++]) }; },
    createFile: (nom, contenu) => { fichiers[id + '/' + nom] = String(contenu); return fichier(id + '/' + nom); },
  };
}
function fichier(cle) {
  return { setContent: c => { fichiers[cle] = String(c); }, getBlob: () => blob(Buffer.from(fichiers[cle], 'utf8')) };
}
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { v = String(v); if (v.length > 9216) throw new Error('Argument too large: value'); store[k] = v; },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  DriveApp: { createFolder: () => { dossiers++; return dossier('DOSSIER' + dossiers); },
    getFolderById: id => { if (!/^DOSSIER\d+$/.test(id)) throw new Error('introuvable'); return dossier(id); } },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2), sleep: () => {},
    newBlob: d => blob(Buffer.isBuffer(d) ? d : Buffer.from(String(d), 'utf8')),
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
const comptes = [
  { username: 'a@e', email: 'a@e', password: 'A', role: 'administrateur', name: 'Directeur' },
  { username: 's@e', email: 's@e', password: 'S', role: 'vente_interne', name: 'Simon Tartre' },
  { username: 'r@e', email: 'r@e', password: 'R', role: 'vente_externe', name: 'robert  DESROSIERS' },
  { username: 'k@e', email: 'k@e', password: 'K', role: 'vente_interne', name: 'Kevin Autre' },
  { username: 'd@x', email: 'd@x', password: 'D', role: 'dealer', name: 'Simon Tartre' },
];
store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify(comptes) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
const gz = o => zlib.gzipSync(Buffer.from(JSON.stringify(o), 'utf8')).toString('base64');
const ungz = s => JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString('utf8'));
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };

const COMMUN = { genere: '2026-11-09 07:30', fy: 2027, ref: 2026, ans: [2025, 2026, 2027], stable: 0.1,
  terr: { QC: { nom: 'Québec', rep: 'Simon Tartre' }, CA: { nom: 'Canada hors Québec', rep: 'Robert Desrosiers' },
          US: { nom: 'États-Unis', rep: 'Robert Desrosiers' } } };
const fiche = (t, x) => Object.assign({ k: 'e1', src: 'epicor', st: 'actif', nom: 'Client', i: 0, t, ville: 'Magog', cl: 'A',
  tA: '+', tY: '=', rk: 10, ct: [['Jean Untel', 'Acheteur', '819-555-0000', '', 'j@client.ca', 'Epicor']],
  sq: [[44220, '2026-05-19', '2026-06-02', null, 'Pour votre Komatsu', 'Envoyee']], sqn: 1 }, x || {});
const charge = t => ({ recs: [fiche(t)], lieux: 'Magog;45.27;-72.15;0', lieux_reg: ['Estrie'], rythme: { n4: 3, n13: 9 } });
const A = tok('a@e', 'A'), S = tok('s@e', 'S'), R = tok('r@e', 'R'), K = tok('k@e', 'K'), D = tok('d@x', 'D');

// --- Avant toute publication
check('rien publie : routes unavailable', post({ action: 'getroutesdata', token: S }).error === 'routes unavailable');

// --- Publication
check('publier sans NIP : refuse', post({ action: 'setroutesdata', charge: 'commun', gz: gz(COMMUN) }).error === 'admin role required');
check('publier avec un jeton de vendeur : refuse', post({ action: 'setroutesdata', token: S, charge: 'commun', gz: gz(COMMUN) }).error === 'admin role required');
check('charge inconnue : refusee', post({ action: 'setroutesdata', pin: 'PINSECRET', charge: 'FR', gz: gz(COMMUN) }).error === 'invalid charge');
check('gzip corrompu : refuse', post({ action: 'setroutesdata', pin: 'PINSECRET', charge: 'QC', gz: 'pas-du-gzip' }).error === 'invalid gz');
let r = post({ action: 'setroutesdata', pin: 'PINSECRET', charge: 'commun', gz: gz(COMMUN) });
check('commun publie par NIP', r.ok === true && dossiers === 1);
for (const t of ['QC', 'CA', 'US']) post({ action: 'setroutesdata', pin: 'PINSECRET', charge: t, gz: gz(charge(t)) });
check('3 territoires publies, 4 fichiers dans 1 dossier', Object.keys(fichiers).length === 4 && dossiers === 1);
r = post({ action: 'setroutesdata', pin: 'PINSECRET', charge: 'QC', gz: gz(charge('QC')) });
check('republier : remplace, pas de doublon', r.ok && Object.keys(fichiers).length === 4);
check('ROUTES_DATA_FOLDER_ID illisible en GET public', !get({ action: 'get', key: 'ROUTES_DATA_FOLDER_ID' }).value);

// --- Jamais un montant (liste blanche)
const refus = (nom, t, d) => { const e = post({ action: 'setroutesdata', pin: 'PINSECRET', charge: t, gz: gz(d) }).error;
  check(nom + ' : refuse (' + e + ')', !!e && /not allowed|amount|outside/.test(e)); };
refus('fiche avec ventes « v »', 'QC', { recs: [fiche('QC', { v: { 2026: 52877.65 } })] });
refus('fiche avec « ly »', 'QC', { recs: [fiche('QC', { ly: 174024.23 })] });
refus('fiche avec « sqv »', 'QC', { recs: [fiche('QC', { sqv: 351711.04 })] });
refus('soumission avec montant', 'QC', { recs: [fiche('QC', { sq: [[1, '2026-05-19', '', 3737.2, 'x', 'y']] })] });
refus('commun avec seuilA', 'commun', Object.assign({ seuilA: 10254.2 }, COMMUN));
refus('commun avec total_terr', 'commun', Object.assign({ total_terr: { QC: 1 } }, COMMUN));
refus('rythme avec valeur v13', 'QC', { recs: [], rythme: { n13: 1, v13: 1840957.5 } });
refus('fiche CA glissee dans la charge QC', 'QC', { recs: [fiche('CA')] });
check('apres les refus : fichier QC intact', ungz(fichiers['DOSSIER1/QC.gz.b64']).recs[0].t === 'QC');

// --- Lecture
const lit = tk => post({ action: 'getroutesdata', token: tk });
check('sans session : refuse', post({ action: 'getroutesdata' }).error === 'authentication required');
check('NIP seul : refuse (il faut une identite)', post({ action: 'getroutesdata', pin: 'PINSECRET' }).error === 'authentication required');
check('dealer au nom de Simon : refuse', lit(D).error === 'forbidden');
check('vendeur interne sans territoire : refuse', lit(K).error === 'forbidden');
r = lit(S);
check('Simon : Quebec seulement', r.ok && r.acces.join() === 'QC' && Object.keys(r.terr).join() === 'QC');
check('Simon : fiche decompressee avec contacts et tendance', ungz(r.terr.QC).recs[0].ct[0][0] === 'Jean Untel' && ungz(r.terr.QC).recs[0].tA === '+');
check('Simon : commun recu', ungz(r.commun).terr.QC.rep === 'Simon Tartre');
r = lit(R);
check('Robert (casse et espaces differents) : Canada + Etats-Unis', r.ok && r.acces.join() === 'CA,US' && !r.terr.QC);
r = lit(A);
check('administrateur : les 3 territoires', r.ok && r.acces.join() === 'QC,CA,US' && Object.keys(r.terr).length === 3);
r = post({ action: 'getroutesdata', token: S, verif: true });
check('verif (tuile) : acces sans les donnees', r.ok && r.acces.join() === 'QC' && !r.terr && !r.commun);
store.ROUTES_ACCES = JSON.stringify({ 'k@e': ['US', 'XX'] });
r = lit(K);
check('ROUTES_ACCES ajoute un territoire (code inconnu ignore)', r.ok && r.acces.join() === 'US');
comptes[1].active = false; store.authorized_users_v2 = JSON.stringify(comptes);
check('compte desactive : refuse tout de suite', lit(S).error === 'authentication required');

console.log(`${ok} OK, ${ko} echec(s)`);
process.exit(ko ? 1 : 0);
