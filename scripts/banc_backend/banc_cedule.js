// Banc de la cedule : le VRAI code de Code.gs, services Google simules.
//  node banc_cedule.js reel   -> interroge le vrai ProgressionLive (cle dans PL_KEY, lue
//                                dans le coffre Windows : voir .claude/skills/portal-backend)
//  node banc_cedule.js        -> donnees fabriquees, controles des regles
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
// Le VRAI backend du depot, charge tel quel (Apps Script = JavaScript).
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'Code.gs'), 'utf8');
const REEL = process.argv[2] === 'reel';
let store = {}, cache = {}, appels = [];
let FAUX = { hr: [], tasks: [] };

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
    const src2 = u.pathname.endsWith('/hr/list') ? FAUX.hr : FAUX.tasks;
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(src2.slice(start, start + 500)) };
  } },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  Logger: { log: m => console.log('   [log]', m) }, Session: {}, MailApp: {}, console,
};
vm.createContext(ctx); vm.runInContext(src, ctx);
const post = b => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).s);
store = { PIN: 'P', PROGRESSIONLIVE_API_KEY: REEL ? process.env.PL_KEY : 'FAUSSE', authorized_users_v2: JSON.stringify([
  { username: 'v@e', email: 'v@e', password: 'V', role: 'vente_externe', name: 'Vendeur' },
  { username: 't@e', email: 't@e', password: 'T', role: 'technicien', name: 'Tech' },
  { username: 'd@x', email: 'd@x', password: 'D', role: 'dealer', name: 'Dealer' },
  { username: 's@x', email: 's@x', password: 'S', role: 'distributeur', name: 'Distri' }]) };
const tok = (u, p) => post({ action: 'login', username: u, password: p }).token;

if (REEL) {
  const r = post({ action: 'getcedule', token: tok('v@e', 'V') });
  if (!r.ok) { console.log('ERREUR', r); process.exit(1); }
  const sortie = path.join(require('os').tmpdir(), 'cedule_reelle.json');   // jeu d'essai pour selenium_cedule_test.py --fixture
  fs.writeFileSync(sortie, JSON.stringify(r.cedule));
  console.log('Jeu d essai ecrit : ' + sortie + ' (noms, jours, cases seulement)');
  const c = r.cedule, J = 'dim lun mar mer jeu ven sam'.split(' ');
  console.log('Genere :', c.genere, '| jours ouvrables :', c.jours.length, '| techniciens :', c.techs.map(t => t.nom).join(' ; '));
  console.log('Appels a ProgressionLive :', appels.map(a => a.method.toUpperCase() + ' ' + a.url.replace(/\?.*/, '')).join(' , '));
  const rep = JSON.stringify(r);
  console.log('Taille de la reponse :', rep.length, 'octets ; contient autre chose que noms/dates/booleens ?',
    /client|adresse|address|cost|phone|position|@/i.test(rep) ? 'OUI' : 'non');
  for (let s = 0; s < c.jours.length; s += 5) {
    const sem = c.jours.slice(s, s + 5);
    console.log('\nSemaine du ' + sem[0] + '        ' + sem.map(j => (J[new Date(j + 'T12:00:00Z').getUTCDay()] + ' ' + j.slice(5)).padEnd(9)).join(' '));
    c.techs.forEach(t => console.log('  ' + t.nom.slice(0, 26).padEnd(27) + sem.map(j => t.cases[j].map(x => x ? '■' : '·').join('') .padEnd(9)).join(' ')));
  }
  console.log('\n■ = ferme  · = ouvert   (AM puis PM)');
  process.exit(0);
}

// ---------------- controles des regles (donnees fabriquees) ----------------
let ok = 0, ko = 0;
const check = (n, c) => { c ? ok++ : ko++; console.log((c ? 'OK    ' : 'ECHEC ') + n); };
FAUX.hr = [{ id: 1, label: 'Pierre' }, { id: 2, label: 'Michel' }, { id: 3, label: '_HOLD' }, { id: 4, label: 'Autre tech' }];
const lundi = (() => { const d = new Date(); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
const mardi = new Date(lundi + 'T12:00:00Z'); mardi.setUTCDate(mardi.getUTCDate() + 1); const MA = mardi.toISOString().slice(0, 10);
const ven = new Date(lundi + 'T12:00:00Z'); ven.setUTCDate(ven.getUTCDate() + 4); const VE = ven.toISOString().slice(0, 10);
const lun2 = new Date(lundi + 'T12:00:00Z'); lun2.setUTCDate(lun2.getUTCDate() + 7); const L2 = lun2.toISOString().slice(0, 10);
const off = d => { const m = new Intl.DateTimeFormat('en', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' }).format(new Date(d + 'T12:00:00Z')).match(/GMT([+-]\d+)/); return (m[1].startsWith('-') ? '-' : '+') + String(Math.abs(+m[1])).padStart(2, '0'); };
const T = (hr, jour, h, dur, type = 'Installation', etat = 'Réparti', helpers = []) =>
  ({ rv: jour + 'T' + h + ':00' + off(jour), duration: dur, humanResource: hr ? { id: hr, label: 'x' } : null, helpers, type: { label: type }, currentState: { label: etat } });
FAUX.tasks = [
  T(1, lundi, '07:30', 'PT4H30M'),                          // Pierre lundi AM
  T(1, lundi, '12:00', 'PT4H30M', 'SAV'),                   // Pierre lundi PM
  T(2, lundi, '10:30', 'PT3H'),                             // Michel lundi AM + PM (10h30-13h30)
  T(2, MA, '07:30', 'PT4H30M', 'Installation', 'Annulé'),   // annulee -> rien
  T(2, MA, '03:00', 'PT1H', 'Feuille de temps'),            // feuille de temps -> rien
  T(1, VE, '07:00', 'PT16H30M', 'Congé'),                   // conge vendredi -> AM + PM, pas le lundi suivant
  T(3, MA, '07:30', 'PT4H30M'),                             // _HOLD -> personne
  T(4, MA, '07:30', 'PT4H30M'),                             // Autre tech -> exclu
  T(null, MA, '12:00', 'PT2H', 'SAV', 'Réparti', [{ id: 2, label: 'Michel' }]),  // Michel aide mardi PM
  T(2, L2, '16:30', 'PT30M'),                               // commence a la fin du PM -> rien
];
let r = post({ action: 'getcedule', token: tok('v@e', 'V') });
const c = r.cedule, P = c && c.techs.find(t => t.nom === 'Pierre'), M = c && c.techs.find(t => t.nom === 'Michel');
check('reponse ok', r.ok === true);
check('seulement Michel et Pierre (ni _HOLD ni Autre tech), tries', JSON.stringify(c.techs.map(t => t.nom)) === '["Michel","Pierre"]');
check('20 jours ouvrables (4 semaines, sans fin de semaine)', c.jours.length === 20 && c.jours.every(j => { const d = new Date(j + 'T12:00:00Z').getUTCDay(); return d >= 1 && d <= 5; }));
check('Pierre lundi : AM et PM fermes', JSON.stringify(P.cases[lundi]) === '[true,true]');
check('Michel lundi 10 h 30 - 13 h 30 : AM et PM fermes', JSON.stringify(M.cases[lundi]) === '[true,true]');
check('Michel mardi : annulee et feuille de temps ignorees, aide l apres-midi -> [ouvert, ferme]', JSON.stringify(M.cases[MA]) === '[false,true]');
check('Pierre vendredi (conge 16 h 30) : ferme toute la journee', JSON.stringify(P.cases[VE]) === '[true,true]');
check('Pierre lundi suivant : le conge ne deborde pas', JSON.stringify(P.cases[L2]) === '[false,false]');
check('Michel : tache qui commence a 16 h 30 -> ne ferme rien', JSON.stringify(M.cases[L2]) === '[false,false]');
const rep = JSON.stringify(r);
check('reponse sans libelle de tache, client, type ni etat', !/Installation|SAV|Congé|Réparti|client|x"/.test(rep));
check('cache : 2e appel sans nouvel appel a ProgressionLive', (() => { const n = appels.length; post({ action: 'getcedule', token: tok('t@e', 'T') }); return appels.length === n; })());
check('dealer : refuse', post({ action: 'getcedule', token: tok('d@x', 'D') }).error === 'forbidden');
check('distributeur : refuse', post({ action: 'getcedule', token: tok('s@x', 'S') }).error === 'forbidden');
check('sans session : refuse', post({ action: 'getcedule' }).error === 'authentication required');
check('PIN seul : refuse', post({ action: 'getcedule', pin: 'P' }).error === 'authentication required');
check('seules des lectures GET vers ProgressionLive', appels.every(a => a.method === 'get') && appels.every(a => /\/(hr|task)\/list\?/.test(a.url)));
check('la cle n est pas lisible par le GET public', JSON.parse(ctx.doGet({ parameter: { action: 'get', key: 'PROGRESSIONLIVE_API_KEY' } }).s).value === '');
cache = {}; delete store.PROGRESSIONLIVE_API_KEY;
check('cle absente : erreur propre, pas de plantage', post({ action: 'getcedule', token: tok('v@e', 'V') }).error === 'cedule unavailable');
console.log('\n' + ok + ' OK, ' + ko + ' ECHEC');
process.exit(ko ? 1 : 0);
