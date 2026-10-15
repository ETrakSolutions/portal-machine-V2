// Banc de la preparation des jobs : le VRAI code de Code.gs, services Google simules.
//  node banc_prepjobs.js reel   -> interroge le vrai ProgressionLive (cle dans PL_KEY, lue
//                                  dans le coffre Windows : voir .claude/skills/portal-backend)
//  node banc_prepjobs.js        -> donnees fabriquees, controles des regles et des acces
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
const REEL = process.argv[2] === 'reel';
let store = {}, cache = {}, appels = [];
let FAUX = [];

function fmt(d, tz, pattern) {         // Utilities.formatDate, motifs utilises seulement
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  const jour = p.year + '-' + p.month + '-' + p.day;
  return pattern === 'yyyy-MM-dd' ? jour : jour + ' ' + p.hour + ':' + p.minute;
}
const ctx = {
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { store[k] = String(v); },
    deleteProperty: k => { delete store[k]; }, getProperties: () => ({ ...store }) }) },
  Utilities: { getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2), sleep: () => {},
               formatDate: fmt },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  UrlFetchApp: { fetch: (url, o) => {
    appels.push({ url, method: o.method });
    if (REEL) {
      const out = cp.execFileSync('curl', ['-s', '-w', '\n%{http_code}', '-H', 'Authorization: ' + o.headers.Authorization, '-H', 'Accept: application/json', url], { maxBuffer: 1 << 26 }).toString();
      const i = out.lastIndexOf('\n');
      return { getResponseCode: () => +out.slice(i + 1), getContentText: () => out.slice(0, i) };
    }
    const u = new URL(url), start = +(u.searchParams.get('startResult') || 0);
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(FAUX.slice(start, start + 500)) };
  } },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: m => console.log('   [log]', m) }, Session: {}, MailApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
store = { PIN: 'P', PROGRESSIONLIVE_API_KEY: REEL ? process.env.PL_KEY : 'FAUSSE', authorized_users_v2: JSON.stringify([
  { username: 'dluna@e-trak.ca', email: 'dluna@e-trak.ca', password: 'L', role: 'vente_interne', name: 'Luna' },
  { username: 'k.berube@e-trak.ca', email: 'k.berube@e-trak.ca', password: 'K', role: 'ingenierie', name: 'Kevin' },
  { username: 'autre@e-trak.ca', email: 'autre@e-trak.ca', password: 'A', role: 'vente_interne', name: 'Autre' },
  { username: 'boss@x', email: 'boss@x', password: 'B', role: 'super_admin', name: 'Autre super admin' },
  { username: 'Dluna@E-Trak.ca2', email: 'x@dealer', password: 'D', role: 'dealer', name: 'Dealer' }]) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;

if (REEL) {
  const r = post({ action: 'getprepjobs', token: tok('dluna@e-trak.ca', 'L') });
  if (!r.ok) { console.log('ERREUR', r); process.exit(1); }
  const p = r.prep, j = p.jobs;
  const sortie = path.join(require('os').tmpdir(), 'prepjobs_reel.json');   // jeu d'essai pour selenium_prepjobs_test.py --fixture
  fs.writeFileSync(sortie, JSON.stringify(p));
  console.log('Jeu d essai ecrit : ' + sortie);
  console.log('Periode', p.du, '->', p.au, '|', j.length, 'jobs (Installation + SAV non terminees)');
  console.log('Appels :', appels.map(a => a.method.toUpperCase() + ' ' + a.url.replace(/\?.*/, '')).join(' , '));
  const rep = JSON.stringify(r);
  console.log('Taille', rep.length, 'octets ; telephone / courriel / GPS dans la reponse ?',
    /@|\(\d{3}\)|\d{3}[-. ]\d{3}[-. ]\d{4}|latitude|longitude|position/i.test(rep) ? 'OUI' : 'non');
  const n = f => j.filter(f).length;
  console.log('Sans PDF :', n(x => !x.commande), '| contact sur place vide :', n(x => !x.contactNom),
    '| telephone pas 10 chiffres :', n(x => !x.telOk), '| sans emplacement :', n(x => !x.emplacement),
    '| completes :', n(x => x.commande && x.contactNom && x.telOk && x.emplacement));
  j.forEach(x => console.log('  ' + (x.rv || 'sans date').slice(0, 10) + ' ' + x.code.padEnd(11) + x.type.slice(0, 4).padEnd(5) +
    (x.commande ? 'C' : '-') + (x.contactNom ? 'N' : '-') + (x.telOk ? 'T' : '-') + (x.emplacement ? 'E' : '-') +
    ' tel=' + String(x.telChiffres).padEnd(3) + ' ' + x.etat));
  process.exit(0);
}

// ---------------- controles des regles (donnees fabriquees) ----------------
let ok = 0, ko = 0;
const check = (n, c) => { c ? ok++ : ko++; console.log((c ? 'OK    ' : 'ECHEC ') + n); };
const J = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) + 'T07:30:00-04'; };
const base = (code, extra) => Object.assign({
  code, rv: J(2), type: { label: 'Installation' }, currentState: { label: 'Assigné', logicId: 100 },
  client: { id: 1, label: 'Client ' + code }, location: { id: 9, label: 'Chantier ' + code },
  locationAddress: { address: '123 rue Secrete', city: 'Saguenay', phone: '819-555-0000', email: 'client@x.com', position: { latitude: 48.4, longitude: -71 } },
  humanResource: { id: 43, label: 'Tech A' },
  attachments: [{ name: 'commande.pdf', contentType: 'application/pdf', url: 'https://x/secret' }],
  properties: { 'informations_generales.contact_sur_place': 'Paul Tremblay (819) 555-1234', 'informations_generales.numero_contact': '43854 - 12539',
                'informations_generales.bon_commande': 'PO-77' }
}, extra || {});
FAUX = [
  base('INS1'),                                                                          // complet
  base('SAV2', { type: { label: 'SAV' }, rv: J(1), attachments: [{ name: 'photo.jpg', contentType: 'image/jpeg' }] }),  // pas de PDF
  base('INS3', { properties: { 'informations_generales.contact_sur_place': '12345', 'informations_generales.numero_contact': '4385412539' } }),
  base('SAV12', { type: { label: 'SAV' }, properties: { 'informations_generales.contact_sur_place': 'Marc Gagnon', 'informations_generales.numero_contact': '43854 - 12539' } }),
  base('INS4', { location: null }),                                                      // pas d'emplacement
  base('INS5', { properties: { informations_generales: { contact_sur_place: 'Imbrique 1-819-555-1234 poste 22' } } }),
  base('INS6', { currentState: { label: 'Travaux terminés', logicId: 600 } }),           // terminee -> exclue
  base('INS7', { currentState: { label: 'Prêt à facturer', logicId: 650 } }),            // exclue
  base('INS8', { currentState: { label: 'Annulé', logicId: 0 } }),                       // annulee -> exclue
  base('FT9', { type: { label: 'Feuille de temps' } }),                                  // pas une job -> exclue
  base('CG10', { type: { label: 'Congé' } }),                                            // exclue
  base('INS11', { rv: J(5), attachments: [{ name: 'Commande officielle.PDF', contentType: '' }] }),
];
let r = post({ action: 'getprepjobs', token: tok('dluna@e-trak.ca', 'L') });
const jobs = (r.prep && r.prep.jobs) || [], J_ = c => jobs.find(x => x.code === c) || {};
check('reponse ok (Luna)', r.ok === true);
check('seulement Installation et SAV non terminees, non annulees', JSON.stringify(jobs.map(x => x.code).sort()) === JSON.stringify(['INS1', 'INS11', 'INS3', 'INS4', 'INS5', 'SAV12', 'SAV2']));
check('triees par date (SAV2 demain en premier)', jobs[0] && jobs[0].code === 'SAV2');
check('INS1 complete', J_('INS1').commande && J_('INS1').contactNom && J_('INS1').telOk && J_('INS1').emplacement);
check('SAV2 : photo seulement -> commande manquante', J_('SAV2').commande === false);
check('INS11 : .PDF sans type MIME -> commande presente', J_('INS11').commande === true);
check('SAV12 : nom sans telephone (Numero contact ignore) -> telephone manquant', J_('SAV12').contactNom === true && J_('SAV12').telOk === false);
check('INS3 : nom vide, 5 chiffres (Numero contact de 10 chiffres ignore) -> contact incomplet', J_('INS3').contactNom === false && J_('INS3').telOk === false && J_('INS3').telChiffres === 5);
check('INS4 : emplacement vide', J_('INS4').emplacement === false);
check('INS5 : champs imbriques lus, indicatif 1 + poste accepte', J_('INS5').contactNom === true && J_('INS5').telOk === true);
check('telephone 10 chiffres ecrits avec parentheses accepte', J_('INS1').telOk === true);
const rep = JSON.stringify(r);
check('aucun telephone, courriel, adresse, GPS, nom de contact ni lien de piece jointe dans la reponse',
  !/555|@|rue Secrete|latitude|position|Paul Tremblay|secret|PO-77/i.test(rep));
check('ville et emplacement transmis', J_('INS1').ville === 'Saguenay' && J_('INS1').lieu === 'Chantier INS1');
check('cache : 2e appel sans nouvel appel a ProgressionLive', (() => { const n = appels.length; post({ action: 'getprepjobs', token: tok('k.berube@e-trak.ca', 'K') }); return appels.length === n; })());
check('Kevin (ingenierie, sur la liste) : admis', post({ action: 'getprepjobs', token: tok('k.berube@e-trak.ca', 'K') }).ok === true);
check('autre vente interne (hors liste) : refuse', post({ action: 'getprepjobs', token: tok('autre@e-trak.ca', 'A') }).error === 'forbidden');
check('autre super admin (hors liste) : refuse', post({ action: 'getprepjobs', token: tok('boss@x', 'B') }).error === 'forbidden');
check('dealer : refuse', post({ action: 'getprepjobs', token: tok('Dluna@E-Trak.ca2', 'D') }).error === 'forbidden');
check('sans session : refuse', post({ action: 'getprepjobs' }).error === 'authentication required');
check('PIN seul : refuse', post({ action: 'getprepjobs', pin: 'P' }).error === 'authentication required');
store.PREP_JOBS_USERS = 'autre@e-trak.ca';
check('PREP_JOBS_USERS remplace la liste : Autre admis, Luna refusee',
  post({ action: 'getprepjobs', token: tok('autre@e-trak.ca', 'A') }).ok === true &&
  post({ action: 'getprepjobs', token: tok('dluna@e-trak.ca', 'L') }).error === 'forbidden');
check('PREP_JOBS_USERS illisible par le GET public', JSON.parse(ctx.doGet({ parameter: { action: 'get', key: 'PREP_JOBS_USERS' } }).s).value === '');
delete store.PREP_JOBS_USERS;
check('seules des lectures GET de task/list vers ProgressionLive', appels.every(a => a.method === 'get' && /\/task\/list\?/.test(a.url)));
cache = {}; delete store.PROGRESSIONLIVE_API_KEY;
check('cle absente : erreur propre, pas de plantage', post({ action: 'getprepjobs', token: tok('dluna@e-trak.ca', 'L') }).error === 'prepjobs unavailable');
console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
