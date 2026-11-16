// Banc des notes et activites des fiches Routes vendeurs (syncnotes / getnotes / setnotes) :
// apps-script/Code.gs execute en Node, services Google simules. Donnees FABRIQUEES ici.
// Decisions Jacquot du 2026-11-16 : toute l'equipe voit les notes, chacun ne modifie que
// les siennes, chaque note part aussi dans Salesforce (Task) par le script du poste (NIP).
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
const note = (id, ts, extra) => Object.assign({ id, t: 'CA', ts, k: 'e6692017', fnom: 'Remcan Projects Ltd.',
  sfa: '001OK00000epOu5YAE', date: '2026-11-16', genre: 'note',
  texte: 'En baisse : Val-Trak a pris la releve.\nA rappeler au printemps.' }, extra || {});
const S = tok('s@e', 'S'), R = tok('r@e', 'R'), A = tok('a@e', 'A');
const sync = (t, notes) => post({ action: 'syncnotes', token: t, notes: notes || [] });

// --- Acces ---
check('sans session : refuse', post({ action: 'syncnotes', notes: [] }).error === 'authentication required');
check('NIP seul : refuse (il faut une identite)', post({ action: 'syncnotes', pin: 'PINSECRET', notes: [] }).error === 'authentication required');
check('dealer : refuse', sync(tok('d@x', 'D')).error === 'forbidden');
let r = sync(R);
check('aucune note : liste vide, aucune feuille creee', r.ok && r.notes.length === 0 && creees === 0);

// --- Depot ---
r = sync(R, [note('n1', 1000)]);
check('1re note : deposee, feuille creee, en attente pour Salesforce', r.ok && r.notes.length === 1 && r.notes[0].sf_etat === 'attente' && creees === 1);
const sh = feuilles.SHEET1;
check('feuille : en-tete + 1 ligne, fiche et client lisibles', sh.rows.length === 2 && sh.rows[1][4] === 'e6692017' && sh.rows[1][5] === 'Remcan Projects Ltd.');
check('saut de ligne garde dans le texte', /\nA rappeler/.test(r.notes[0].texte));
check('auteur nomme, note marquee mienne', r.notes[0].auteur_nom === 'Robert Vendeur' && r.notes[0].mienne === true);
check('NOTES_SHEET_ID illisible en GET public', !get({ action: 'get', key: 'NOTES_SHEET_ID' }).value);

// --- Toute l'equipe voit ---
r = sync(S);
const vueS = r.notes.find(x => x.id === 'n1');
check("Simon voit la note de Robert (autre territoire), sans l'etat Salesforce", vueS && vueS.mienne === false && !('sf_etat' in vueS) && vueS.auteur_nom === 'Robert Vendeur');
check("le courriel de l'auteur n'est jamais renvoye", !JSON.stringify(r).includes('r@e'));
r = sync(S, [note('n1', 5000, { texte: 'Pirate' })]);
check("Simon ne peut pas modifier la note de Robert (meme id = SA note a lui)", sync(R).notes.find(x => x.id === 'n1' && x.mienne).texte.startsWith('En baisse'));
const nS = sh.rows.filter(x => x[1] === 'n1').length;
check('meme id chez un autre auteur = une autre note', nS === 2);

// --- Modification ---
r = sync(R, [note('n1', 2000, { texte: 'Val-Trak a pris la releve (confirme par le client).' })]);
check('version plus recente : remplace la ligne', r.notes.find(x => x.id === 'n1' && x.mienne).texte.includes('confirme') && sh.rows.length === 3);
r = sync(R, [note('n1', 1500, { texte: 'Vieux' })]);
check('version plus ancienne : ignoree', r.notes.find(x => x.id === 'n1' && x.mienne).texte.includes('confirme'));

// --- Refus ---
r = sync(R, [note('bad id!', 1), note('x2', 1, { t: 'FR' }), note('x3', 1, { sfa: '003XXXXXXXXXXXX' }),
  note('x4', 1, { date: '16/11/2026' }), note('x5', 1, { genre: 'pirate' }), note('x6', 1, { texte: '  ' }),
  note('x7', 0), note('x8', 1, { k: '' }), note('x9', 1, { fnom: 'X' })]);
check('id, territoire, compte, date, genre, texte vide, ts nul, fiche, client : refuses', r.refusees === 9 && sh.rows.length === 3);
check('plus de 100 en un envoi : refuse', sync(R, Array(101).fill(note('y', 1))).error === 'too many notes');
r = sync(R, [note('n2', 1000, { texte: '=HYPERLINK("x")', fnom: '+cmd', champ_inconnu: 'x', v: 12345, genre: 'visite' })]);
const lig = sh.rows[sh.rows.length - 1];
check('formule neutralisee dans la feuille, champ inconnu jamais stocke', String(lig[5]).startsWith("'+") && !/champ_inconnu|12345/.test(lig[8]));
r = sync(R, [note('n3', 1000, { texte: 'x'.repeat(5000) })]);
check('texte borne a 1000 caracteres', r.notes.find(x => x.id === 'n3').texte.length === 1000);

// --- Fiche sans compte Salesforce ---
r = sync(S, [note('n4', 1000, { t: 'QC', k: 'e777', fnom: 'Excavation Test', sfa: '', genre: 'appel',
  a: { rue: '1 rue A', ville: 'Victoriaville', prov: 'QC', cp: 'G6P 1A1', tel: '819-555-1212', pays: 'Canada', epicor: '777', st: 'actif', v: 99999 } })]);
const l4 = sh.rows.find(x => x[1] === 'n4');
check('sans compte SF : adresse de la fiche gardee pour le script, champ inconnu non', JSON.parse(l4[8]).a.ville === 'Victoriaville' && !/99999/.test(l4[8]));
check('avec compte SF : pas de bloc adresse', !('a' in JSON.parse(sh.rows[1][8])));

// --- Lecture par le script du poste ---
check('getnotes sans NIP : refuse', post({ action: 'getnotes' }).error === 'authentication required');
check('getnotes avec session admin : refuse (NIP seulement)', post({ action: 'getnotes', token: A, pin: A }).error === 'authentication required');
let g = post({ action: 'getnotes', pin: 'PINSECRET' });
check('getnotes NIP : 5 en attente, auteur et courriel pour Salesforce', g.ok && g.notes.length === 5 && g.notes.find(x => x.id === 'n1' && x.auteur === 'r@e').auteur_nom === 'Robert Vendeur');

// --- Resultat ---
check('setnotes sans NIP : refuse', post({ action: 'setnotes', resultats: [] }).error === 'authentication required');
let s = post({ action: 'setnotes', pin: 'PINSECRET', resultats: [
  { id: 'n1', auteur: 'r@e', ts: 2000, etat: 'faite', resultat: 'activite inscrite', tache: '00TOK00000AbCdE' },
  { id: 'n2', auteur: 'r@e', ts: 1000, etat: 'refusee', resultat: 'compte GRYB' },
  { id: 'n3', auteur: 'r@e', ts: 999, etat: 'faite', tache: '00TOK00000AbCdF' },            // version perimee
  { id: 'n4', auteur: 's@e', ts: 1000, etat: 'faite', tache: 'pas-une-tache' },               // id de tache invalide
  { id: 'n1', auteur: 's@e', ts: 5000, etat: 'bidon' }, { id: 'zz', auteur: 'r@e', ts: 1, etat: 'faite' }] });
check('setnotes : 2 mises a jour ; version perimee, tache invalide, etat ou id inconnu ignores', s.ok && s.maj === 2);
r = sync(R);
const n1 = r.notes.find(x => x.id === 'n1' && x.mienne), n2 = r.notes.find(x => x.id === 'n2');
check("l'auteur voit le resultat Salesforce", n1.sf_etat === 'faite' && n2.sf_etat === 'refusee' && n2.sf_resultat === 'compte GRYB');
check('id de la tache garde dans la feuille', sh.rows.find(x => x[1] === 'n1' && x[0] === 'r@e')[11] === '00TOK00000AbCdE');

// --- Modification apres Salesforce : repart en attente avec la meme tache ---
r = sync(R, [note('n1', 3000, { texte: 'Val-Trak : contrat de 2 ans.' })]);
g = post({ action: 'getnotes', pin: 'PINSECRET' }).notes.find(x => x.id === 'n1' && x.auteur === 'r@e');
check('note modifiee : de nouveau en attente, tache a mettre a jour', g && g.tache === '00TOK00000AbCdE' && g.texte.includes('contrat'));

// --- Suppression ---
r = sync(R, [{ id: 'n1', t: 'CA', ts: 4000, k: 'e6692017', fnom: 'Remcan Projects Ltd.', supprimee: true },
             { id: 'n3', t: 'CA', ts: 4000, k: 'e6692017', fnom: 'Remcan Projects Ltd.', supprimee: true }]);
check('supprimee : renvoyee comme id seulement', r.notes.filter(x => x.supprimee).length === 2 && !r.notes.some(x => x.supprimee && x.texte));
g = post({ action: 'getnotes', pin: 'PINSECRET' }).notes;
check('supprimee avec tache : le script doit retirer la tache', g.some(x => x.id === 'n1' && x.supprimee && x.tache === '00TOK00000AbCdE'));
check('supprimee sans tache : rien a faire dans Salesforce', !g.some(x => x.id === 'n3'));
r = sync(R, [note('n1', 9000, { texte: 'Ressuscitee' })]);
check('note supprimee : ne revient pas', r.notes.find(x => x.id === 'n1' && x.supprimee) && !r.notes.some(x => x.texte === 'Ressuscitee'));
r = sync(S);
check("Simon ne voit plus la note supprimee de Robert", !r.notes.some(x => x.id === 'n1' && x.texte && x.auteur_nom === 'Robert Vendeur'));

// --- Compte desactive ---
comptes[2].active = false; store.authorized_users_v2 = JSON.stringify(comptes);
check('compte desactive : refuse tout de suite', sync(R).error === 'authentication required');

console.log(`${ok} OK, ${ko} echec(s)`);
process.exit(ko ? 1 : 0);
