// Banc de la base de diagnostic SAV (getdiag / savediag / validediag / deletediag) :
// apps-script/Code.gs execute en Node, services Google simules, Google Sheet comprise.
// Donnees FABRIQUEES ici. Decision Steve du 2026-10-13 : interne seulement, les
// techniciens soumettent, un validateur (diagValidate, defaut administrateur et
// ingenierie) approuve ; stockage dans une Google Sheet, jamais dans les proprietes.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {}, feuilles = {}, creees = 0, uuid = 0, traductions = 0, panneTraduction = false;
// Google Sheet simulee : une grille de valeurs ; une valeur qui commence par « = » devient
// une formule (comme Sheets), ce que le banc doit voir neutralise.
function feuille(id) {
  const rows = [];
  const sh = {
    rows, setName() {}, setFrozenRows() {},
    appendRow: r => { rows.push(r.slice()); },
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (l, c, n, m) => ({ setValues: v => { for (let j = 0; j < m; j++) rows[l - 1][c - 1 + j] = v[0][j]; } }),
    deleteRow: l => { rows.splice(l - 1, 1); },
    getLastRow: () => rows.length,
    getParent: () => ({ getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id }),
  };
  return sh;
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
  // Traducteur simule (LanguageApp) : prefixe « EN: » ; panneTraduction = Google en panne.
  LanguageApp: { translate: (t, de, vers) => { traductions++; if (panneTraduction) throw new Error('quota'); return vers.toUpperCase() + ':' + t; } },
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const get = q => JSON.parse(ctx.doGet({ parameter: q }).s);
store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify([
  { username: 'j@e', email: 'j@e', password: 'J', role: 'super_admin', name: 'Admin' },
  { username: 'k@e', email: 'k@e', password: 'K', role: 'ingenierie', name: 'Kevin Service' },
  { username: 't@e', email: 't@e', password: 'T', role: 'technicien', name: 'Tech Route' },
  { username: 't2@e', email: 't2@e', password: 'T2', role: 'technicien', name: 'Autre Tech' },
  { username: 'vi@e', email: 'vi@e', password: 'VI', role: 'vente_interne', name: 'Vente int' },
  { username: 'd@x', email: 'd@x', password: 'D', role: 'dealer', name: 'Dealer' },
  { username: 's@x', email: 's@x', password: 'S', role: 'distributeur', name: 'Distri' },
  { username: 'off@e', email: 'off@e', password: 'O', role: 'technicien', name: 'Off', active: false },
]) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };

const K = tok('k@e', 'K'), T = tok('t@e', 'T'), T2 = tok('t2@e', 'T2'), VI = tok('vi@e', 'VI');
const fiche = (sympt, extra) => Object.assign({ produit: "Limiteur d'excavatrice (LPE)", symptome: sympt, code: 'E-12',
  motsCles: 'alarme rotation', causes: [{ cause: 'Inclino mal calibre', solution: 'Refaire la calibration\n1. ...', pieces: 'C01A-0005' },
                                        { cause: 'Cable CAN abime', solution: 'Remplacer le cable', pieces: 'E03A-0013' }] }, extra || {});

// --- Acces ---
check('sans session : refuse', post({ action: 'getdiag' }).error === 'authentication required');
check('PIN seul : refuse (il faut une identite)', post({ action: 'getdiag', pin: 'PINSECRET' }).error === 'authentication required');
check('dealer : refuse', post({ action: 'getdiag', token: tok('d@x', 'D') }).error === 'forbidden');
check('distributeur : refuse', post({ action: 'getdiag', token: tok('s@x', 'S') }).error === 'forbidden');
check('dealer ne peut pas ecrire', post({ action: 'savediag', token: tok('d@x', 'D'), fiche: fiche('x') }).error === 'forbidden');
check('compte desactive : ne se connecte pas', !post({ action: 'login', username: 'off@e', password: 'O' }).ok);
let r = post({ action: 'getdiag', token: T });
check('base vide : liste vide, aucune feuille creee par une lecture', r.ok && r.fiches.length === 0 && creees === 0);
check('technicien : pas validateur', r.peutValider === false);
check('ingenierie (Kevin) : validateur par defaut', post({ action: 'getdiag', token: K }).peutValider === true);
check('vente interne : lit mais ne valide pas', (r = post({ action: 'getdiag', token: VI })).ok && r.peutValider === false);

// --- Saisie d'un technicien = brouillon ---
r = post({ action: 'savediag', token: T, fiche: fiche('Alarme en rotation sans charge') });
check('technicien soumet : brouillon', r.ok && r.fiche.statut === 'brouillon' && r.fiche.auteurNom === 'Tech Route');
check('feuille creee une seule fois, id en propriete sensible', creees === 1 && store.DIAG_SHEET_ID === 'SHEET1');
const idT = r.fiche.id;
check('aucun courriel dans la reponse', !JSON.stringify(r).includes('t@e'));
check('le brouillon est visible de son auteur', post({ action: 'getdiag', token: T }).fiches.some(f => f.id === idT && f.mien));
check('invisible des autres non-validateurs', !post({ action: 'getdiag', token: T2 }).fiches.some(f => f.id === idT)
  && !post({ action: 'getdiag', token: VI }).fiches.some(f => f.id === idT));
check('visible du validateur', post({ action: 'getdiag', token: K }).fiches.some(f => f.id === idT && f.statut === 'brouillon'));
check('un autre technicien ne modifie pas ce brouillon', post({ action: 'savediag', token: T2, fiche: fiche('pirate', { id: idT }) }).error === 'forbidden');
check('un autre technicien ne le supprime pas', post({ action: 'deletediag', token: T2, id: idT }).error === 'forbidden');
check('technicien ne valide pas', post({ action: 'validediag', token: T, id: idT }).error === 'forbidden');
r = post({ action: 'savediag', token: T, fiche: fiche('Alarme en rotation, machine a vide', { id: idT }) });
check('l\'auteur corrige son brouillon en place', r.ok && r.fiche.id === idT && r.fiche.symptome === 'Alarme en rotation, machine a vide'
  && feuilles.SHEET1.rows.length === 2);

// --- Validation ---
r = post({ action: 'validediag', token: K, id: idT });
check('Kevin valide', r.ok && r.fiche.statut === 'valide' && r.fiche.valideParNom === 'Kevin Service');
check('validee : visible de tous les internes', post({ action: 'getdiag', token: VI }).fiches.some(f => f.id === idT)
  && post({ action: 'getdiag', token: T2 }).fiches.some(f => f.id === idT));
check('deja validee : refus de revalider', post({ action: 'validediag', token: K, id: idT }).error === 'deja validee');
check('l\'auteur ne supprime plus une fiche validee', post({ action: 'deletediag', token: T, id: idT }).error === 'forbidden');

// --- Proposition de modification ---
r = post({ action: 'savediag', token: T2, fiche: fiche('Alarme en rotation, machine a vide (corrige)', { id: idT,
  causes: [{ cause: 'Inclino mal calibre', solution: 'Nouvelle procedure', pieces: '' }] }) });
check('technicien modifie une fiche validee : proposition', r.ok && r.proposition === true && r.fiche.remplace === idT && r.fiche.statut === 'brouillon');
const idP = r.fiche.id;
check('l\'original reste intact pendant la proposition', post({ action: 'getdiag', token: VI }).fiches.find(f => f.id === idT).causes.length === 2);
r = post({ action: 'savediag', token: T2, fiche: fiche('Alarme (corrige 2)', { id: idT }) });
check('deuxieme modification : meme proposition, pas un doublon', r.fiche.id === idP && feuilles.SHEET1.rows.length === 3);
r = post({ action: 'validediag', token: K, id: idP });
let liste = post({ action: 'getdiag', token: K }).fiches;
check('proposition validee : remplace l\'original et disparait', r.ok && r.remplacee === idT && liste.length === 1
  && liste[0].id === idT && liste[0].symptome === 'Alarme (corrige 2)' && liste[0].modifieParNom === 'Autre Tech');

// --- Validateur ---
r = post({ action: 'savediag', token: K, fiche: fiche('Afficheur noir au demarrage', { produit: 'Caméras' }) });
check('fiche ecrite par un validateur : validee d\'office', r.ok && r.fiche.statut === 'valide');
const idK = r.fiche.id;
check('validateur modifie une fiche validee en place', post({ action: 'savediag', token: K, fiche: fiche('Afficheur noir', { id: idK }) }).fiche.id === idK);
check('validateur supprime', post({ action: 'deletediag', token: K, id: idK }).ok && !post({ action: 'getdiag', token: K }).fiches.some(f => f.id === idK));

// --- Validation des champs ---
check('produit requis', post({ action: 'savediag', token: T, fiche: fiche('x', { produit: '' }) }).error === 'produit requis');
check('symptome requis', post({ action: 'savediag', token: T, fiche: fiche('  ') }).error === 'symptome requis');
check('au moins une cause', post({ action: 'savediag', token: T, fiche: fiche('x', { causes: [] }) }).error === 'au moins une cause');
check('cause sans solution : refus', /cause et solution requises/.test(post({ action: 'savediag', token: T, fiche: fiche('x', { causes: [{ cause: 'a' }] }) }).error));
check('id inconnu : refus', post({ action: 'savediag', token: T, fiche: fiche('x', { id: 'nope' }) }).error === 'not found');
r = post({ action: 'savediag', token: T, fiche: Object.assign(fiche('=HYPERLINK("http://x")'), { intrus: 1, statut: 'valide', auteur: 'j@e',
  causes: Array.from({ length: 20 }, (_, i) => ({ cause: 'c' + i, solution: 's', pieces: '', role: 'admin' })) }) });
check('champs non prevus jetes, statut et auteur imposes par le serveur', r.ok && r.fiche.statut === 'brouillon' && r.fiche.mien
  && !('intrus' in r.fiche) && r.fiche.causes.length === 12 && !('role' in r.fiche.causes[0]));
const ligne = feuilles.SHEET1.rows.find(x => x[0] === r.fiche.id);
check('feuille : une formule tapee est neutralisee dans les colonnes lisibles', ligne[3].startsWith("'="));
check('feuille : la colonne donnees garde le texte exact', JSON.parse(ligne[6]).symptome === '=HYPERLINK("http://x")');
check('fiche trop longue : refus', post({ action: 'savediag', token: T, fiche: fiche('x', {
  causes: Array.from({ length: 12 }, () => ({ cause: 'c'.repeat(300), solution: 's'.repeat(4000) })) }) }).error === 'fiche trop longue');
check('accents conserves', post({ action: 'getdiag', token: K }).fiches.some(f => f.produit === "Limiteur d'excavatrice (LPE)"));

// --- Rien dans les proprietes, rien de lisible de l'exterieur ---
check('aucune fiche dans les proprietes du script', !Object.keys(store).some(k => /diag/i.test(k) && k !== 'DIAG_SHEET_ID'));
check('DIAG_SHEET_ID illisible par le GET public', !get({ action: 'get', key: 'DIAG_SHEET_ID' }).value);
check('DIAG_SHEET_ID illisible par getprivate', !post({ action: 'getprivate', key: 'DIAG_SHEET_ID', token: T }).value);
check('DIAG_SHEET_ID non modifiable par un non-admin', post({ action: 'save', key: 'DIAG_SHEET_ID', value: 'x', token: T }).error === 'admin role required');

// --- Permission reglable dans le tableau ---
store.roles_permissions = JSON.stringify({ ingenierie: { diagValidate: false }, technicien: { diagValidate: true, savAccess: true } });
check('case Valider diag decochee pour ingenierie : Kevin ne valide plus', post({ action: 'getdiag', token: K }).peutValider === false);
check('case cochee pour technicien : il valide', post({ action: 'getdiag', token: T }).peutValider === true);
store.roles_permissions = JSON.stringify({ dealer: { savAccess: true, diagValidate: true } });
check('dealer coche quand meme : toujours refuse (verrou dur)', post({ action: 'getdiag', token: tok('d@x', 'D') }).error === 'forbidden');
store.roles_permissions = JSON.stringify({ technicien: { savAccess: false } });
check('case SAV retiree au technicien : il ne lit plus la base', post({ action: 'getdiag', token: T }).error === 'forbidden');
delete store.roles_permissions;

// --- _authDiag (editeur) ---
check('_authDiag ne recree pas une feuille existante', ctx._authDiag().endsWith('SHEET1') && creees === 1);

// --- Anglais (Steve, 2026-10-21) : traduction automatique, revisable, obligatoire pour valider ---
let e1 = post({ action: 'savediag', token: T, fiche: fiche('Afficheur noir au demarrage') });
check('anglais : traduit a l\'enregistrement (symptome, causes, solutions, mots-cles)', e1.ok
  && e1.fiche.en.symptome === 'EN:Afficheur noir au demarrage' && e1.fiche.en.motsCles === 'EN:alarme rotation'
  && e1.fiche.en.causes.length === 2 && e1.fiche.en.causes[1].cause === 'EN:Cable CAN abime'
  && e1.fiche.en.causes[0].solution.startsWith('EN:Refaire') && e1.fiche.bilingue === true);
const idE = e1.fiche.id;
traductions = 0;
let e2 = post({ action: 'savediag', token: T, fiche: fiche('Afficheur noir au demarrage', { id: idE,
  en: Object.assign(JSON.parse(JSON.stringify(e1.fiche.en)), { symptome: 'Black display at startup',
    causes: [Object.assign({}, e1.fiche.en.causes[0], { cause: 'Tilt sensor out of calibration' }), e1.fiche.en.causes[1]] }) }) });
check('anglais corrige a la main : garde ; francais inchange : pas retraduit', e2.ok && e2.fiche.en.symptome === 'Black display at startup'
  && e2.fiche.en.causes[0].cause === 'Tilt sensor out of calibration' && e2.fiche.en.causes[1].cause === 'EN:Cable CAN abime' && traductions === 0);
let f3 = fiche('Afficheur noir au demarrage', { id: idE, en: e2.fiche.en });
f3.causes = [{ cause: 'Inclino mal calibre', solution: 'Refaire la calibration\n1. ...', pieces: 'C01A-0005' },
             { cause: 'Connecteur CAN corrode', solution: 'Remplacer le cable', pieces: 'E03A-0013' }];
let e3 = post({ action: 'savediag', token: T, fiche: f3 });
check('francais modifie : ce champ seulement est retraduit, la correction manuelle reste', e3.ok
  && e3.fiche.en.causes[1].cause === 'EN:Connecteur CAN corrode' && e3.fiche.en.causes[0].cause === 'Tilt sensor out of calibration'
  && e3.fiche.en.symptome === 'Black display at startup' && traductions === 1);
panneTraduction = true;
let e4 = post({ action: 'savediag', token: T, fiche: fiche('Bip continu', {}) });
check('traduction en panne : le brouillon est enregistre, anglais incomplet', e4.ok && e4.fiche.statut === 'brouillon' && e4.fiche.bilingue === false);
check('validation refusee tant que l\'anglais manque', post({ action: 'validediag', token: K, id: e4.fiche.id }).error === 'traduction incomplete');
let e5 = post({ action: 'savediag', token: K, fiche: fiche('Bip au levage', {}) });
check('validateur + traduction en panne : sa fiche reste en brouillon (pas publiee sans anglais)', e5.ok && e5.fiche.statut === 'brouillon');
panneTraduction = false;
let e6 = post({ action: 'savediag', token: T, fiche: fiche('Bip continu', { id: e4.fiche.id }) });
check('reenregistre apres la panne : anglais complete', e6.ok && e6.fiche.bilingue === true);
check('puis la validation passe', post({ action: 'validediag', token: K, id: e4.fiche.id }).ok === true);
let e7 = post({ action: 'savediag', token: K, fiche: fiche('Afficheur noir au demarrage', { id: idE,
  en: { symptome: 'Black screen at power-up', causes: e3.fiche.en.causes } }) });
check('validateur corrige l\'anglais puis valide', e7.ok && post({ action: 'validediag', token: K, id: idE }).ok === true);
const vu = post({ action: 'getdiag', token: VI }).fiches.filter(f => f.id === idE)[0];
check('fiche validee : anglais revise visible de tous', vu && vu.en.symptome === 'Black screen at power-up' && vu.statut === 'valide');
let p1 = post({ action: 'savediag', token: T2, fiche: fiche('Afficheur noir au demarrage', { id: idE, en: vu.en, motsCles: 'ecran noir' }) });
check('proposition sur une fiche validee : anglais repris, seul le champ change est traduit', p1.ok && p1.proposition
  && p1.fiche.en.symptome === 'Black screen at power-up' && p1.fiche.en.motsCles === 'EN:ecran noir');
check('validation de la proposition : l\'anglais remplace celui de l\'originale', post({ action: 'validediag', token: K, id: p1.fiche.id }).ok
  && post({ action: 'getdiag', token: VI }).fiches.filter(f => f.id === idE)[0].en.motsCles === 'EN:ecran noir');

// --- Fiche ecrite en anglais (techniciens de Val-trak) ---
let a1 = post({ action: 'savediag', token: T, fiche: { produit: 'Caméras', symptome: '', code: '', motsCles: '',
  causes: [{ cause: '', solution: '', pieces: 'C9' }], en: { symptome: 'Screen flickers', motsCles: 'flicker',
  causes: [{ cause: 'Loose connector', solution: 'Reseat the connector' }] } } });
check('ecrite en anglais : acceptee, francais traduit (en -> fr)', a1.ok && a1.fiche.symptome === 'FR:Screen flickers'
  && a1.fiche.causes[0].cause === 'FR:Loose connector' && a1.fiche.causes[0].solution === 'FR:Reseat the connector'
  && a1.fiche.causes[0].pieces === 'C9' && a1.fiche.en.symptome === 'Screen flickers' && a1.fiche.bilingue === true);
traductions = 0;
let a2 = post({ action: 'savediag', token: T, fiche: { id: a1.fiche.id, produit: 'Caméras', symptome: 'L\'écran clignote', code: '', motsCles: a1.fiche.motsCles,
  causes: a1.fiche.causes, en: a1.fiche.en } });
check('original anglais : corriger le francais ne retraduit pas l\'anglais', a2.ok && a2.fiche.symptome === 'L\'écran clignote'
  && a2.fiche.en.symptome === 'Screen flickers' && traductions === 0);
let a3en = JSON.parse(JSON.stringify(a2.fiche.en)); a3en.symptome = 'Screen flickers at night';
let a3 = post({ action: 'savediag', token: T, fiche: { id: a1.fiche.id, produit: 'Caméras', symptome: a2.fiche.symptome, code: '', motsCles: a2.fiche.motsCles,
  causes: a2.fiche.causes, en: a3en } });
check('original anglais modifie : le francais est retraduit', a3.ok && a3.fiche.symptome === 'FR:Screen flickers at night' && traductions === 1);
check('cause en anglais seulement sans solution : refusee', post({ action: 'savediag', token: T, fiche: { produit: 'Caméras', symptome: 's',
  causes: [{ cause: '', solution: '' }], en: { causes: [{ cause: 'Only a cause', solution: '' }] } } }).error === 'cause et solution requises (cause 1)');
check('sans symptome dans aucune langue : refusee', post({ action: 'savediag', token: T, fiche: { produit: 'Caméras', symptome: '',
  causes: [{ cause: 'c', solution: 's' }], en: { symptome: '' } } }).error === 'symptome requis');
panneTraduction = true;
let a4 = post({ action: 'savediag', token: T, fiche: { produit: 'Caméras', symptome: '', causes: [{}],
  en: { symptome: 'No video', causes: [{ cause: 'Bad cable', solution: 'Replace the cable' }] } } });
panneTraduction = false;
check('anglais seulement + traduction en panne : brouillon, francais manquant, validation refusee', a4.ok && a4.fiche.bilingue === false
  && a4.fiche.symptome === '' && post({ action: 'validediag', token: K, id: a4.fiche.id }).error === 'traduction incomplete');

console.log(ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
