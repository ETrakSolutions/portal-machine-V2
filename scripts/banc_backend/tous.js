// Lance les trois bancs du backend et echoue si UN SEUL echoue.
// Ne jamais piper un banc dans « | tail » dans une chaine && : le code de retour est
// perdu et le commit passe quand meme (incident du 2026-09-25).
//   node scripts/banc_backend/tous.js
const { spawnSync } = require('child_process'), path = require('path');
let ko = 0;
for (const f of ['banc_comptes.js', 'banc_prix.js', 'banc_cedule.js']) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const der = (r.stdout || '').trim().split(/\r?\n/).pop();
  console.log((r.status === 0 ? 'OK     ' : 'ECHEC  ') + f.padEnd(16) + der);
  if (r.status !== 0) { ko++; console.log(r.stdout, r.stderr); }
}
process.exit(ko ? 1 : 0);
