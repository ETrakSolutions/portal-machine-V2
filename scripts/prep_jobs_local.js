// Preparation des jobs, calculee sur ce poste avec le VRAI code du serveur (Code.gs) :
// memes regles que la page prep-jobs.html, sans session du portail. Sert au recapitulatif
// du matin (scripts/recap_prep_jobs.py). Lecture seule de ProgressionLive (GET task/list).
//   PL_KEY=<cle> node scripts/prep_jobs_local.js   -> JSON { genere, du, au, jobs[] } sur stdout
// La cle passe a curl par l'entree standard (-H @-), jamais sur la ligne de commande.
const fs = require('fs'), vm = require('vm'), path = require('path'), cp = require('child_process');
const KEY = process.env.PL_KEY;
if (!KEY) { console.error('PL_KEY absente'); process.exit(2); }
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const props = { PROGRESSIONLIVE_API_KEY: KEY };
const ctx = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null),
    setProperty() {}, deleteProperty() {}, getProperties: () => ({}) }) },
  Utilities: { formatDate: (d, tz, pattern) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
    const jour = p.year + '-' + p.month + '-' + p.day;
    return pattern === 'yyyy-MM-dd' ? jour : jour + ' ' + p.hour + ':' + p.minute;
  }, sleep() {}, getUuid: () => '' },
  UrlFetchApp: { fetch: (url, o) => {
    if (o.method !== 'get' || !url.startsWith('https://ecotrakindustrie.progressionlive.com/')) throw new Error('appel refuse : ' + url);
    const out = cp.execFileSync('curl', ['-s', '-w', '\n%{http_code}', '-H', '@-', url],
      { input: 'Authorization: ' + o.headers.Authorization + '\nAccept: application/json\n', maxBuffer: 1 << 26 }).toString();
    const i = out.lastIndexOf('\n');
    return { getResponseCode: () => +out.slice(i + 1), getContentText: () => out.slice(0, i) };
  } },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: {}, Logger: { log() {} }, Session: {}, MailApp: {}, console,
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
process.stdout.write(JSON.stringify(ctx._calculPrepJobs(new Date())));
