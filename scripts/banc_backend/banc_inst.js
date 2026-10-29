// Banc de la banque d'installation (getinst / saveinst / validateinst / deleteinst /
// uploadinstphoto / getinstphoto) : apps-script/Code.gs execute en Node, services Google
// simules (Sheet, Drive, courriel). Donnees FABRIQUEES ici. Decisions Steve 2026-10-28/29 :
// memes acces que la base de diagnostic (savAccess, diagValidate), validateurs publies
// d'office, avis par courriel a chaque nouvelle note et nouvelle proposition.
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
let store = {}, feuilles = {}, creees = 0, uuid = 0, fichiers = {}, dossiers = {}, nf = 0, courriels = [], panneCourriel = false;
function feuille(id) {
  const rows = [];
  return {
    rows, setName() {}, setFrozenRows() {},
    appendRow: r => { rows.push(r.slice()); },
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (l, c, n, m) => ({ setValues: v => { for (let j = 0; j < m; j++) rows[l - 1][c - 1 + j] = v[0][j]; } }),
    deleteRow: l => { rows.splice(l - 1, 1); },
    getLastRow: () => rows.length,
    getParent: () => ({ getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id }),
  };
}
// Drive simule : fichiers { id -> { octets, parent, trashed } }
const dossier = id => ({
  getId: () => id, getName: () => 'dossier ' + id, getFiles: () => ({ hasNext: () => false }),
  createFile: blob => { const fid = 'FICHIER_' + String(++nf).padStart(12, '0'); fichiers[fid] = { octets: blob.octets, parent: id, trashed: false };
                        return { getId: () => fid, setDescription() {} }; },
});
const fichierVue = fid => ({
  getParents: () => { let fait = false; return { hasNext: () => !fait, next: () => { fait = true; return { getId: () => fichiers[fid].parent }; } }; },
  isTrashed: () => fichiers[fid].trashed, getBlob: () => ({ getBytes: () => fichiers[fid].octets }),
});
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k, v) => { v = String(v); if (v.length > 9216) throw new Error('Argument too large: value'); store[k] = v; },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  SpreadsheetApp: {
    create: () => { const id = 'SHEET' + (++creees); feuilles[id] = feuille(id); return { getId: () => id, getSheets: () => [feuilles[id]] }; },
    openById: id => { if (!feuilles[id]) throw new Error('introuvable'); return { getSheets: () => [feuilles[id]] }; },
  },
  DriveApp: {
    createFolder: () => { const id = 'DOSSIER' + (Object.keys(dossiers).length + 1); dossiers[id] = 1; return dossier(id); },
    getFolderById: id => { if (!dossiers[id]) throw new Error('introuvable'); return dossier(id); },
    getFileById: id => { if (!fichiers[id]) throw new Error('introuvable'); return fichierVue(id); },
  },
  Utilities: { getUuid: () => 'uuid-' + (++uuid), sleep: () => {},
    base64Decode: s => { if (!/^[A-Za-z0-9+/=]*$/.test(s)) throw new Error('bad'); return Array.from(Buffer.from(s, 'base64')).map(b => (b > 127 ? b - 256 : b)); },
    base64Encode: o => Buffer.from(o.map(b => b & 255)).toString('base64'),
    newBlob: (octets, type, nom) => ({ octets, type, nom }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: () => {} }, Session: {}, UrlFetchApp: {}, console,
  // Sans proprietes GRAPH_*, _envoyerCourriel passe par MailApp : on capture l'envoi.
  MailApp: { sendEmail: (a, sujet, texte, o) => { if (panneCourriel) throw new Error('quota'); courriels.push({ a, sujet, texte, html: o.htmlBody }); } },
  LanguageApp: { translate: (t, de, vers) => vers.toUpperCase() + ':' + t },
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
const get = q => JSON.parse(ctx.doGet({ parameter: q }).s);
store = { PIN: 'PINSECRET', authorized_users_v2: JSON.stringify([
  { username: 'j@e', email: 'j@e', password: 'J', role: 'super_admin', name: 'Admin' },
  { username: 'm@e', email: 'm@e', password: 'M', role: 'ingenierie', name: 'Mathieu' },
  { username: 't@e', email: 't@e', password: 'T', role: 'technicien', name: 'Tech Route' },
  { username: 't2@e', email: 't2@e', password: 'T2', role: 'technicien', name: 'Autre Tech' },
  { username: 'd@x', email: 'd@x', password: 'D', role: 'dealer', name: 'Dealer' },
  { username: 's@x', email: 's@x', password: 'S', role: 'distributeur', name: 'Distri' },
]) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;
let ok = 0, ko = 0;
const check = (nom, cond) => { cond ? ok++ : ko++; console.log((cond ? 'OK    ' : 'ECHEC ') + nom); };
const J = tok('j@e', 'J'), M = tok('m@e', 'M'), T = tok('t@e', 'T'), T2 = tok('t2@e', 'T2'), D = tok('d@x', 'D');
const note = extra => Object.assign({ type: 'Excavatrice', fabricant: 'Case', modele: 'CX19', produit: 'limiteur', option: 'hauteur_rotation',
  temps: '6 h', texte: 'Installer le capteur sur la fleche', photos: [], pieces: [{ txt: 'Z03B-0041 — Harnais', qte: '1' }], pieges: 'Attention au cable' }, extra || {});
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]).toString('base64');

// --- Acces ---
check('sans session : refuse', post({ action: 'getinst' }).error === 'authentication required');
check('PIN seul : refuse', post({ action: 'getinst', pin: 'PINSECRET' }).error === 'authentication required');
// Soutien technique (Steve, 2026-10-29) : le dealer lit, cree et propose ; jamais le distributeur.
let rD = post({ action: 'getinst', token: D });
check('dealer : lit la banque, jamais validateur', rD.ok === true && rD.peutValider === false);
check('distributeur : refuse', post({ action: 'getinst', token: tok('s@x', 'S') }).error === 'forbidden');
check('dealer : ne valide pas', post({ action: 'validateinst', token: D, id: 'x' }).error === 'forbidden');
check('dealer : jamais la liste SAV (clients)', post({ action: 'getsav', token: D }).error === 'forbidden');
let r = post({ action: 'getinst', token: T });
check('base vide, aucune feuille creee par une lecture', r.ok && r.notes.length === 0 && creees === 0);
check('technicien : pas validateur ; Mathieu (ingenierie) : validateur', r.peutValider === false && post({ action: 'getinst', token: M }).peutValider === true);

// --- Avis : liste d'adresses de la tuile Administrateur (admin seulement) ---
check('install_emails : un technicien ne peut pas l\'ecrire', !!post({ action: 'save', key: 'install_emails', value: '["pirate@x.com"]', token: T }).error);
check('install_emails : un admin l\'ecrit', post({ action: 'save', key: 'install_emails', value: '["avis@e-trak.ca","x@y.com"]', token: J }).ok === true);
check('install_emails : illisible en GET public', !get({ action: 'get', key: 'install_emails' }).value);

// --- Creation par un technicien = brouillon + courriel « Nouvelle fiche » ---
r = post({ action: 'saveinst', token: T, note: note() });
check('technicien cree : brouillon', r.ok && r.note.statut === 'brouillon' && r.note.auteurNom === 'Tech Route');
check('feuille creee, id en propriete sensible', creees === 1 && store.INST_SHEET_ID === 'SHEET1' && !get({ action: 'get', key: 'INST_SHEET_ID' }).value);
check('traduction automatique vers l\'anglais', r.note.en.texte === 'EN:Installer le capteur sur la fleche' && r.note.bilingue === true);
check('courriel « Nouvelle fiche » aux 2 adresses', courriels.length === 1 && courriels[0].a === 'avis@e-trak.ca,x@y.com' &&
      /Nouvelle fiche : Limiteur de portée — Case CX19/.test(courriels[0].sujet));
check('courriel : lien vers la fiche, etat brouillon, aucun courriel d\'auteur', /installation\.html\?type=Excavatrice&fab=Case&modele=CX19&produit=limiteur/.test(courriels[0].texte) &&
      /Brouillon en attente/.test(courriels[0].texte) && courriels[0].texte.indexOf('t@e') < 0);
const idT = r.note.id;
check('vue : jamais le courriel de l\'auteur', JSON.stringify(r).indexOf('t@e') < 0);
r = post({ action: 'saveinst', token: T, note: note({ id: idT, texte: 'Texte corrige' }) });
check('auteur modifie son brouillon : pas de nouveau courriel, retraduit', r.ok && courriels.length === 1 && r.note.en.texte === 'EN:Texte corrige');
check('autre technicien ne voit pas le brouillon', post({ action: 'getinst', token: T2 }).notes.length === 0);
check('autre technicien ne peut pas le modifier', post({ action: 'saveinst', token: T2, note: note({ id: idT }) }).error === 'forbidden');
check('autre technicien ne peut pas le supprimer', post({ action: 'deleteinst', token: T2, id: idT }).error === 'forbidden');
check('technicien ne peut pas valider', post({ action: 'validateinst', token: T, id: idT }).error === 'forbidden');

// --- Validation ---
r = post({ action: 'validateinst', token: M, id: idT });
check('Mathieu valide', r.ok && r.note.statut === 'valide' && r.note.valideParNom === 'Mathieu');
check('autre technicien voit la note validee', post({ action: 'getinst', token: T2 }).notes.length === 1);

// --- Proposition de modification = courriel « Modification proposee » ---
r = post({ action: 'saveinst', token: T2, note: note({ id: idT, texte: 'Meilleure methode' }) });
check('technicien modifie une note validee : proposition', r.ok && r.proposition === true && r.note.statut === 'brouillon' && r.note.remplace === idT);
check('courriel « Modification proposee »', courriels.length === 2 && /Modification proposée : Limiteur de portée — Case CX19/.test(courriels[1].sujet) &&
      /la fiche publiée reste inchangée/.test(courriels[1].texte));
const idP = r.note.id;
r = post({ action: 'saveinst', token: T2, note: note({ id: idT, texte: 'Meilleure methode v2' }) });
check('la meme proposition est reprise, pas de 2e courriel', r.ok && r.note.id === idP && courriels.length === 2);
let notesM = post({ action: 'getinst', token: M }).notes;
check('original inchange tant que non validee', notesM.filter(n => n.id === idT)[0].texte === 'Texte corrige');
r = post({ action: 'validateinst', token: M, id: idP });
check('validation : la proposition remplace l\'original et disparait', r.ok && r.remplacee === idT &&
      (notesM = post({ action: 'getinst', token: M }).notes).length === 1 && notesM[0].texte === 'Meilleure methode v2');

// --- Validateur : publie d'office, courriel quand meme ---
r = post({ action: 'saveinst', token: M, note: note({ modele: 'CX26', produit: 'camera', option: '' }) });
check('validateur cree : publiee d\'office + courriel « Publiee »', r.ok && r.note.statut === 'valide' && courriels.length === 3 &&
      /Publiée \(écrite par un validateur\)/.test(courriels[2].texte));
const idM = r.note.id;
r = post({ action: 'saveinst', token: M, note: note({ id: idM, modele: 'CX26', produit: 'camera', texte: 'Mise a jour' }) });
check('validateur modifie : en place, pas de courriel', r.ok && r.note.id === idM && r.note.statut === 'valide' && courriels.length === 3);

// --- Courriel en panne ou liste vide : l'enregistrement passe quand meme ---
panneCourriel = true;
r = post({ action: 'saveinst', token: T, note: note({ modele: 'CX30' }) });
check('courriel en panne : note enregistree quand meme', r.ok && r.note.statut === 'brouillon');
panneCourriel = false;
post({ action: 'save', key: 'install_emails', value: '[]', token: J });
r = post({ action: 'saveinst', token: T, note: note({ modele: 'CX31' }) });
check('aucune adresse : note enregistree, aucun envoi', r.ok && courriels.length === 3);

// --- Validation du contenu ---
check('modele requis', post({ action: 'saveinst', token: T, note: note({ modele: '' }) }).error === 'modele et produit requis');
check('produit inconnu refuse', post({ action: 'saveinst', token: T, note: note({ produit: 'fusee' }) }).error === 'produit inconnu');
check('note trop longue refusee', post({ action: 'saveinst', token: T, note: note({ texte: 'x'.repeat(10000), pieges: 'y'.repeat(3000), pieces: Array(60).fill({ txt: 'z'.repeat(200), qte: '1' }) }) }).error === 'note trop longue');
r = post({ action: 'saveinst', token: T, note: note({ modele: '=HYPERLINK("x")', photos: ['../etc', 'FICHIER_000000000001'] }) });
check('formule neutralisee dans la feuille, id de photo invalide ecarte', r.ok && feuilles.SHEET1.rows.slice(-1)[0][4].charAt(0) === "'" &&
      r.note.photos.length === 1);

// --- Photos ---
r = post({ action: 'uploadinstphoto', token: T, type: 'image/jpeg', data: JPEG });
check('photo JPEG acceptee, dossier cree, id en propriete sensible', r.ok && /^FICHIER_/.test(r.id) && !!store.INST_FOLDER_ID && !get({ action: 'get', key: 'INST_FOLDER_ID' }).value);
const pid = r.id;
r = post({ action: 'getinstphoto', token: T2, id: pid });
check('photo relue a l\'identique', r.ok && r.data === JPEG);
check('pas un JPEG : refuse', post({ action: 'uploadinstphoto', token: T, data: Buffer.from('<svg/>').toString('base64') }).error === 'photo illisible');
check('photo trop grosse : refusee', post({ action: 'uploadinstphoto', token: T, data: 'A'.repeat(700001) }).error === 'photo trop grosse');
fichiers.AUTRE_FICHIER_DRIVE_123 = { octets: [1, 2, 3], parent: 'MON_DRIVE', trashed: false };
check('fichier du Drive hors du dossier : jamais rendu', post({ action: 'getinstphoto', token: T, id: 'AUTRE_FICHIER_DRIVE_123' }).error === 'not found');
check('id de photo bidon : not found', post({ action: 'getinstphoto', token: T, id: '../../x' }).error === 'not found');
check('dealer lit une photo', post({ action: 'getinstphoto', token: D, id: pid }).ok === true);
check('distributeur ne lit pas une photo', post({ action: 'getinstphoto', token: tok('s@x', 'S'), id: pid }).error === 'forbidden');

// --- Dealer : cree et propose, en brouillon, courriel qui le signale ---
post({ action: 'save', key: 'install_emails', value: '["avis@e-trak.ca"]', token: J });
let nbAvant = courriels.length;
r = post({ action: 'saveinst', token: D, note: note({ modele: 'CX57', texte: 'Methode du dealer' }) });
check('dealer cree : brouillon', r.ok && r.note.statut === 'brouillon' && r.note.mien === true);
check('courriel : auteur signale comme dealer', courriels.length === nbAvant + 1 && /Dealer \(dealer, compte externe\)/.test(courriels[nbAvant].texte));
const idD = r.note.id;
check('technicien ne voit pas le brouillon du dealer', post({ action: 'getinst', token: T }).notes.every(n => n.id !== idD));
check('dealer ne voit pas les brouillons des autres', post({ action: 'getinst', token: D }).notes.every(n => n.statut === 'valide' || n.id === idD));
const idV = post({ action: 'getinst', token: D }).notes.filter(n => n.statut === 'valide')[0].id;
r = post({ action: 'saveinst', token: D, note: note({ id: idV, texte: 'Proposition du dealer' }) });
check('dealer modifie une note validee : proposition', r.ok && r.proposition === true && r.note.remplace === idV);
check('dealer ne supprime pas une note validee', post({ action: 'deleteinst', token: D, id: idV }).error === 'forbidden');
store.roles_permissions = JSON.stringify({ dealer: { soutienAccess: false } });
check('case Soutien tech. retiree au dealer : refuse', post({ action: 'getinst', token: D }).error === 'forbidden');
store.roles_permissions = JSON.stringify({ distributeur: { soutienAccess: true } });
check('distributeur coche : toujours refuse (verrou dur)', post({ action: 'getinst', token: tok('s@x', 'S') }).error === 'forbidden');
delete store.roles_permissions;

// --- Suppression ---
check('validateur supprime une note', post({ action: 'deleteinst', token: M, id: idM }).ok === true);
check('note supprimee : introuvable', post({ action: 'deleteinst', token: M, id: idM }).error === 'not found');

console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
