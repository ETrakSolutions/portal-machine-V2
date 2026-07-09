/**
 * e-Trak Portal Machine V2 — API backend (Apps Script)
 *
 * RESPONSABILITES :
 * - Endpoints HTTP appeles par le portail (database.html, edit-machine.html, machine.html)
 * - Lecture/ecriture du fichier data/machines.json sur GitHub (source master)
 * - Gestion des cles auxiliaires (notes, drapeaux, codes produit, changelog) — stockees en Script Properties
 *
 * DEPLOIEMENT :
 * - Project Settings -> Script Properties doit contenir :
 *     PIN, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, GITHUB_FILE_PATH
 * - Deploy as Web App : "Execute as: Me", "Who has access: Anyone"
 *
 * ENDPOINTS LECTURE (GET) :
 *   ?action=get&key=<key>           -> { value: <stored value> }   (cles sensibles bloquees)
 *   ?action=list&prefix=<prefix>    -> { keys: [...] }             (cles sensibles/sessions exclues)
 *   ?action=getMachineJson          -> { content, sha, size }  (lit machines.json depuis GitHub)
 *
 * AUTHENTIFICATION :
 *   { action:'login', username, password }        -> { ok, token, user }  (user SANS password)
 *   { action:'logout', token }                    -> { ok }
 *   { action:'changepassword', username, oldPassword, newPassword } -> { ok, token, user }
 *   { action:'listusers', token }                 -> { users: [...] }  (passwords inclus SEULEMENT si role modifAccounts)
 *   Le mot de passe de chaque utilisateur ne quitte JAMAIS le serveur vers un client non-admin.
 *   Sessions : Script Properties 'session_<token>' = { u, role, exp } — 90 jours glissants.
 *
 * ENDPOINTS ECRITURE (POST, requiert token de session OU pin) :
 *   { action:'save',   key, value, token|pin }    (cle authorized_users_v2 : reserve aux admins)
 *   { action:'delete', key, token|pin }
 *   { action:'updateMachineBom',   type, fab, modele, annee, bomOverride, harnais?, token|pin }
 *   { action:'updateMachineSpecs', type, fab, modele, annee, specs, token|pin }
 *   { action:'updateMachineNotes', type, fab, modele, annee, notes, token|pin }
 *   { action:'deleteMachine',      type, fab, modele, annee, token|pin }
 *   Le PIN (Script Property PIN) reste accepte pour les scripts d'automatisation (valeur secrete,
 *   jamais dans le code frontend).
 */

var PROPS = PropertiesService.getScriptProperties();

function _prop(name, fallback) {
  var v = PROPS.getProperty(name);
  return (v === null || v === undefined || v === '') ? fallback : v;
}

/* ============================ ROUTING ============================ */

function doGet(e) {
  try {
    var action = (e.parameter.action || 'get').toLowerCase();
    if (action === 'get')             return jsonOut({ value: kvGet(e.parameter.key) });
    if (action === 'list')            return jsonOut({ keys: kvList(e.parameter.prefix || '') });
    if (action === 'getmachinejson')  return jsonOut(ghReadFile());
    return jsonOut({ error: 'unknown action: ' + action });
  } catch (err) {
    Logger.log('API error: ' + err + (err && err.stack ? ' | ' + err.stack : ''));
    return jsonOut({ error: 'server error' });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var action = (body.action || '').toLowerCase();

    // ---- Authentification (pas de pin requis : c'est le login lui-meme) ----
    if (action === 'login')          return jsonOut(authLogin(body));
    if (action === 'logout')         return jsonOut(authLogout(body));
    if (action === 'whoami')         return jsonOut(authWhoami(body));
    if (action === 'changepassword') return jsonOut(authChangePassword(body));
    if (action === 'listusers')      return jsonOut(authListUsers(body));
    if (action === 'acceptconsent')  return jsonOut(authAcceptConsent(body));

    // Token de session valide OU PIN (scripts d'automatisation) pour toute ecriture
    var writeActions = ['save','delete','updatemachinebom','updatemachinebombulk','updatemachinespecs','updatemachinenotes','deletemachine','updatebomlabels','sendsoumission'];
    if (writeActions.indexOf(action) >= 0) {
      var auth = _authCheck(body);
      if (!auth.ok) return jsonOut({ error: 'invalid PIN' });   // meme message qu'avant (compat frontend)
      // La liste des utilisateurs ne peut etre reecrite que par un admin (ou le PIN)
      if ((action === 'save' || action === 'delete') && SENSITIVE_KEYS.indexOf(body.key) >= 0 && !auth.admin) {
        return jsonOut({ error: 'admin role required' });
      }
      // #3 : autorisation par role pour les ecritures machine (le PIN = admin, bypasse ce controle)
      if (!auth.admin && !_canDo(auth.perms, action)) {
        return jsonOut({ error: 'permission denied for role' });
      }
    }

    if (action === 'save')               return jsonOut({ ok: kvSave(body.key, body.value) });
    if (action === 'delete')             return jsonOut({ ok: kvDelete(body.key) });
    if (action === 'list')               return jsonOut({ keys: kvList(body.prefix || '') });
    if (action === 'getmachinejson')     return jsonOut(ghReadFile());
    if (action === 'updatemachinebom')   return jsonOut(updateMachineBom(body));
    if (action === 'updatemachinebombulk') return jsonOut(updateMachineBomBulk(body));
    if (action === 'updatemachinespecs') return jsonOut(updateMachineSpecs(body));
    if (action === 'updatemachinenotes') return jsonOut(updateMachineNotes(body));
    if (action === 'deletemachine')      return jsonOut(deleteMachine(body));
    if (action === 'updatebomlabels')    return jsonOut(updateBomLabels(body));
    if (action === 'sendsoumission')     return jsonOut(sendSoumission(body));
    return jsonOut({ error: 'unknown action: ' + action });
  } catch (err) {
    Logger.log('API error: ' + err + (err && err.stack ? ' | ' + err.stack : ''));
    return jsonOut({ error: 'server error' });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================ AUTHENTIFICATION ============================ */
// Les mots de passe vivent UNIQUEMENT cote serveur (Script Property authorized_users_v2).
// Le frontend recoit un token de session apres login ; les ecritures exigent ce token
// (ou le PIN secret, reserve aux scripts). Duree de session : 90 jours glissants.

// Cles jamais exposees par le GET public ni par kvList :
//  - secrets backend (PIN d'ecriture, jeton GitHub, config du depot)
//  - liste des comptes (mots de passe) — lisible seulement via 'listusers' admin
// L'ecriture (save/delete) de ces cles exige un token admin (voir doPost).
var SENSITIVE_KEYS = ['authorized_users_v2', 'PIN', 'GITHUB_TOKEN',
                      'GITHUB_REPO', 'GITHUB_BRANCH', 'GITHUB_FILE_PATH'];
var SESSION_PREFIX = 'session_';
var SESSION_TTL_MS  = 90 * 24 * 3600 * 1000;       // 90 jours
var SESSION_RENEW_MS = 45 * 24 * 3600 * 1000;      // renouvele si < 45 jours restants

function _users() {
  try { return JSON.parse(PROPS.getProperty('authorized_users_v2') || '[]'); }
  catch (e) { return []; }
}

function _findUser(username) {
  var uname = String(username || '').trim().toLowerCase();
  if (!uname) return null;
  var users = _users();
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if ((u.username && String(u.username).toLowerCase() === uname) ||
        (u.email && String(u.email).toLowerCase() === uname)) return u;
  }
  return null;
}

// Roles avec gestion de comptes : lit roles_permissions (modifiable via l'UI admin),
// repli sur les deux roles admin connus.
function _isAdminRole(role) {
  try {
    var roles = JSON.parse(PROPS.getProperty('roles_permissions') || '{}');
    if (roles[role] && roles[role].modifAccounts !== undefined) return !!roles[role].modifAccounts;
  } catch (e) {}
  return role === 'super_admin' || role === 'administrateur';
}

function _publicUser(u) {
  // Copie SANS mot de passe (ce qui part vers un client non-admin)
  var out = {};
  for (var k in u) if (k !== 'password') out[k] = u[k];
  return out;
}

function _newSession(user) {
  var token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  PROPS.setProperty(SESSION_PREFIX + token,
    JSON.stringify({ u: user.username, role: user.role, exp: Date.now() + SESSION_TTL_MS }));
  return token;
}

function _getSession(token) {
  if (!token) return null;
  var raw = PROPS.getProperty(SESSION_PREFIX + token);
  if (!raw) return null;
  var sess;
  try { sess = JSON.parse(raw); } catch (e) { return null; }
  if (!sess.exp || sess.exp < Date.now()) {
    PROPS.deleteProperty(SESSION_PREFIX + token);
    return null;
  }
  // Renouvellement glissant
  if (sess.exp - Date.now() < SESSION_RENEW_MS) {
    sess.exp = Date.now() + SESSION_TTL_MS;
    PROPS.setProperty(SESSION_PREFIX + token, JSON.stringify(sess));
  }
  return sess;
}

// Nettoyage paresseux des sessions expirees (appele au login)
function _pruneSessions() {
  var all = PROPS.getProperties();
  var now = Date.now();
  for (var k in all) {
    if (k.indexOf(SESSION_PREFIX) !== 0) continue;
    try { if (JSON.parse(all[k]).exp < now) PROPS.deleteProperty(k); }
    catch (e) { PROPS.deleteProperty(k); }
  }
}

// Verifie l'autorisation d'ecriture : token de session valide OU PIN exact.
// Retourne { ok, admin } — admin = role avec modifAccounts (le PIN compte comme admin).
// NOTE transition : repli '1400' tant que la Script Property PIN n'est pas changee.
// ETAPE FINALE du correctif : mettre PIN = <nouvelle valeur secrete> dans Script Properties.
function _authCheck(body) {
  // #4 : plus de repli '1400'. Le PIN DOIT etre defini en Script Property ; sinon le chemin PIN est desactive.
  var pin = _prop('PIN', '');
  if (body.pin && pin && body.pin === pin) return { ok: true, admin: true, perms: null };
  // Le token de session peut arriver dans body.token OU body.pin (le frontend remplace
  // simplement l'ancienne valeur du PIN par le token -> diff minimal, zero cle oubliee).
  var sess = _getSession(body.token) || _getSession(body.pin);
  if (sess) return { ok: true, admin: _isAdminRole(sess.role), role: sess.role, perms: _permsForRole(sess.role) };
  return { ok: false, admin: false };
}

// #3 : permissions effectives d'un role. Lit roles_permissions (modifiable via l'UI admin),
// repli sur des valeurs par defaut = miroir du frontend admin.js ROLES.
function _permsForRole(role) {
  try {
    var roles = JSON.parse(PROPS.getProperty('roles_permissions') || '{}');
    if (roles[role]) return roles[role];
  } catch (e) {}
  var DEFAULT = {
    super_admin:    { modifBom:true,  flagBom:true,  writeNotes:true,  modifAccounts:true },
    administrateur: { modifBom:true,  flagBom:true,  writeNotes:true,  modifAccounts:true },
    vente_interne:  { modifBom:false, flagBom:false, writeNotes:false, modifAccounts:false },
    technicien:     { modifBom:false, flagBom:false, writeNotes:true,  modifAccounts:false },
    distributeur:   { modifBom:false, flagBom:false, writeNotes:false, modifAccounts:false },
    dealer:         { modifBom:false, flagBom:false, writeNotes:false, modifAccounts:false },
    ingenierie:     { modifBom:true,  flagBom:true,  writeNotes:true,  modifAccounts:false }
  };
  return DEFAULT[role] || {};
}

// #3 : le role a-t-il le droit d'effectuer cette action d'ecriture machine ?
// (le PIN d'automatisation a auth.admin === true et bypasse ce controle.)
function _canDo(perms, action) {
  if (!perms) return false;
  switch (action) {
    case 'updatemachinebom':
    case 'updatemachinebombulk':
    case 'updatemachinespecs':
    case 'updatebomlabels':
    case 'deletemachine':
      return !!perms.modifBom;
    case 'updatemachinenotes':
      return !!(perms.writeNotes || perms.modifBom);
    default:
      return true;  // save/delete KV + sendsoumission : token suffit (controle SENSITIVE_KEYS deja fait au-dessus)
  }
}

function authLogin(body) {
  var user = _findUser(body.username);
  if (!user || user.active === false || String(user.password) !== String(body.password || '')) {
    Utilities.sleep(500);   // freine le brute-force
    return { error: 'invalid credentials' };
  }
  _pruneSessions();
  return { ok: true, token: _newSession(user), user: _publicUser(user) };
}

function authLogout(body) {
  if (body.token) PROPS.deleteProperty(SESSION_PREFIX + body.token);
  return { ok: true };
}

// Changement de mot de passe par l'utilisateur lui-meme (flux mustChangePassword inclus).
// Valide l'ancien mot de passe, ecrit le nouveau, retire le drapeau, retourne une session.
function authChangePassword(body) {
  var uname = String(body.username || '').trim().toLowerCase();
  var users = _users();
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var match = (u.username && String(u.username).toLowerCase() === uname) ||
                (u.email && String(u.email).toLowerCase() === uname);
    if (!match) continue;
    if (u.active === false || String(u.password) !== String(body.oldPassword || '')) {
      Utilities.sleep(500);
      return { error: 'invalid credentials' };
    }
    if (!body.newPassword || String(body.newPassword).length < 4) return { error: 'password too short' };
    u.password = String(body.newPassword);
    delete u.mustChangePassword;
    PROPS.setProperty('authorized_users_v2', JSON.stringify(users));
    return { ok: true, token: _newSession(u), user: _publicUser(u) };
  }
  Utilities.sleep(500);
  return { error: 'invalid credentials' };
}

// Liste des utilisateurs pour un client authentifie.
// Roles admin (modifAccounts) : liste complete AVEC mots de passe (UI de gestion des comptes).
// Autres roles : liste SANS mots de passe (affichage noms/roles, vendeurEmail en soumission).
function authListUsers(body) {
  var auth = _authCheck(body);
  if (!auth.ok) return { error: 'authentication required' };
  var users = _users();
  return { users: auth.admin ? users : users.map(_publicUser) };
}

/* A EXECUTER UNE FOIS dans l'editeur (menu Executer) pour autoriser l'envoi
   de courriels (scope script.send_mail). Envoie un courriel de test a Robin. */
function _authMail() {
  MailApp.sendEmail('robin@gryb.ca', 'Autorisation e-Trak', 'Autorisation MailApp OK — l\'envoi de soumissions est maintenant actif.');
}

/* ============================ ENVOI SOUMISSION ============================ */
// Envoie la demande de soumission par courriel (vrai tableau HTML construit
// cote portail). Destinataires fournis par le portail puis valides ; le PIN
// est deja verifie en amont (writeActions). Courriel envoye depuis le compte
// proprietaire du script ; replyTo = la personne qui fait la demande.
function sendSoumission(body) {
  var RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  var to = String(body.to || '')
    .split(/[,;]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return RE.test(s); });
  if (!to.length) return { error: 'no_recipients' };

  var cc = (body.cc && RE.test(String(body.cc).trim())) ? String(body.cc).trim() : '';
  var replyTo = (body.replyTo && RE.test(String(body.replyTo).trim())) ? String(body.replyTo).trim() : '';
  var subject = String(body.subject || 'Demande de soumission e-Trak').slice(0, 200);
  var html = String(body.html || '');
  var text = String(body.text || 'Voir la version HTML de ce courriel.');

  var options = { htmlBody: html, name: 'Portail e-Trak' };
  if (cc) options.cc = cc;
  if (replyTo) options.replyTo = replyTo;

  try {
    MailApp.sendEmail(to.join(','), subject, text, options);
  } catch (err) {
    Logger.log('sendSoumission error: ' + err);
    return { error: 'send_failed' };
  }
  return { ok: true, to: to.join(','), cc: cc };
}

/* ============================ KEY-VALUE STORE ============================ */
// Backwards-compatible avec les Script Properties existantes
// (kit_override_*, notes_*, db_flags, db_changelog, authorized_users_v2, etc.)

function kvGet(key) {
  if (!key) return '';
  // Cles sensibles (mots de passe) et sessions : jamais lisibles par le GET public.
  // Les clients authentifies passent par action=listusers.
  if (SENSITIVE_KEYS.indexOf(key) >= 0 || key.indexOf(SESSION_PREFIX) === 0) return '';
  return PROPS.getProperty(key) || '';
}
function kvSave(key, value) {
  if (!key) throw new Error('key required');
  if (key.indexOf(SESSION_PREFIX) === 0) throw new Error('reserved key');
  var v = (typeof value === 'string') ? value : JSON.stringify(value);
  PROPS.setProperty(key, v);
  return true;
}
function kvDelete(key) {
  if (!key) throw new Error('key required');
  if (key.indexOf(SESSION_PREFIX) === 0) throw new Error('reserved key');
  PROPS.deleteProperty(key);
  return true;
}
function kvList(prefix) {
  var all = PROPS.getProperties();
  var keys = [];
  for (var k in all) {
    if (k.indexOf(prefix) !== 0) continue;
    // Les tokens de session sont DANS le nom de cle -> exclus de tout listing
    if (k.indexOf(SESSION_PREFIX) === 0 || SENSITIVE_KEYS.indexOf(k) >= 0) continue;
    keys.push(k);
  }
  return keys.sort();
}

/* ============================ GITHUB API ============================ */

function ghHeaders() {
  var token = _prop('GITHUB_TOKEN', '');
  if (!token) throw new Error('GITHUB_TOKEN script property not set');
  return {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function ghReadFile() {
  var repo   = _prop('GITHUB_REPO', 'ETrakSolutions/portal-machine-V2');
  var branch = _prop('GITHUB_BRANCH', 'main');
  var path   = _prop('GITHUB_FILE_PATH', 'data/machines.json');
  var url = 'https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + branch;
  var resp = UrlFetchApp.fetch(url, { method: 'get', headers: ghHeaders(), muteHttpExceptions: true });
  var code = resp.getResponseCode();
  if (code !== 200) throw new Error('GitHub read failed (' + code + '): ' + resp.getContentText());
  var info = JSON.parse(resp.getContentText());

  // L'API Contents ne renvoie PAS le contenu pour les fichiers > 1 Mo
  // (content:"" / encoding:"none"). machines.json fait ~12 Mo, on bascule donc
  // sur l'API Git Blobs (base64, jusqu'a 100 Mo) pour le contenu, en gardant le
  // sha de l'API Contents pour des ecritures conflict-safe.
  var b64;
  if (info.content && info.encoding === 'base64') {
    b64 = info.content;
  } else {
    var blobUrl = 'https://api.github.com/repos/' + repo + '/git/blobs/' + info.sha;
    var blobResp = UrlFetchApp.fetch(blobUrl, { method: 'get', headers: ghHeaders(), muteHttpExceptions: true });
    var blobCode = blobResp.getResponseCode();
    if (blobCode !== 200) throw new Error('GitHub blob read failed (' + blobCode + '): ' + blobResp.getContentText());
    var blob = JSON.parse(blobResp.getContentText());
    if (blob.encoding !== 'base64') throw new Error('Unexpected blob encoding: ' + blob.encoding);
    b64 = blob.content;
  }
  var content = Utilities.newBlob(Utilities.base64Decode(b64.replace(/\n/g, ''))).getDataAsString();
  return { content: content, sha: info.sha, size: info.size };
}

// Helpers REST GitHub (JSON in/out)
function ghApiBase() {
  return 'https://api.github.com/repos/' + _prop('GITHUB_REPO', 'ETrakSolutions/portal-machine-V2');
}
function ghGet_(url) {
  var resp = UrlFetchApp.fetch(url, { method: 'get', headers: ghHeaders(), muteHttpExceptions: true });
  var code = resp.getResponseCode();
  if (code !== 200) throw new Error('GitHub GET failed (' + code + ') ' + url + ': ' + resp.getContentText());
  return JSON.parse(resp.getContentText());
}
function ghSend_(url, payload, method) {
  var resp = UrlFetchApp.fetch(url, {
    method: method || 'post', headers: ghHeaders(),
    contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('GitHub ' + (method || 'post').toUpperCase() + ' failed (' + code + ') ' + url + ': ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText());
}

/**
 * Ecriture via l'API Git Data (blob -> tree -> commit -> ref).
 * Necessaire car machines.json fait ~12 Mo : l'API Contents (PUT) n'est pas fiable
 * au-dela de 1 Mo. La mise a jour de la ref se fait SANS force, donc un commit
 * concurrent fait echouer le PATCH (422 non-fast-forward) -> on retry.
 */
function ghCommitFile(newContent, commitMessage) {
  var base   = ghApiBase();
  var branch = _prop('GITHUB_BRANCH', 'main');
  var path   = _prop('GITHUB_FILE_PATH', 'data/machines.json');

  var ref = ghGet_(base + '/git/ref/heads/' + branch);   // { object: { sha } }
  var headSha = ref.object.sha;
  var headCommit = ghGet_(base + '/git/commits/' + headSha);
  var baseTree = headCommit.tree.sha;

  var blob = ghSend_(base + '/git/blobs', {
    content: Utilities.base64Encode(newContent, Utilities.Charset.UTF_8),
    encoding: 'base64'
  });
  var tree = ghSend_(base + '/git/trees', {
    base_tree: baseTree,
    tree: [{ path: path, mode: '100644', type: 'blob', sha: blob.sha }]
  });
  var commit = ghSend_(base + '/git/commits', {
    message: commitMessage || 'Auto: portail UI update',
    tree: tree.sha,
    parents: [headSha]
  });
  ghSend_(base + '/git/refs/heads/' + branch, { sha: commit.sha, force: false }, 'patch');
  return { ok: true, commit: commit.sha };
}

/**
 * Lecture transactionnelle : lit le JSON, applique modifyFn, ecrit via Git Data API.
 * Retry jusqu'a 3x si la ref a bouge entre read et write (422 non-fast-forward).
 */
function ghUpdateJson(modifyFn, commitMessage) {
  for (var attempt = 0; attempt < 3; attempt++) {
    var file = ghReadFile();
    var data;
    try { data = JSON.parse(file.content); }
    catch (e) { throw new Error('JSON parse error: ' + e); }
    modifyFn(data);
    var newContent = JSON.stringify(data);  // compact (machines.json 12 Mo ecrit rarement, mais autant ne pas gonfler)
    try {
      return ghCommitFile(newContent, commitMessage);
    } catch (e) {
      // 422 = non-fast-forward (ref a bouge), 409 = conflit : on retry
      if ((String(e).indexOf('422') >= 0 || String(e).indexOf('409') >= 0) && attempt < 2) {
        Utilities.sleep(500 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw new Error('ghUpdateJson failed after 3 attempts');
}

/* ============================ OVERRIDES FILE (data/overrides.json) ============================ */
// Petit fichier (~1 Mo) qui contient UNIQUEMENT les _bom / _notes editables.
// Ecrit via l'API Contents (un seul PUT) -> rapide (~2-5 s), contrairement aux 12 Mo
// de machines.json. Structure miroir : { type:{ fab:{ annee:{ modele:{ _bom, _notes } } } } }.

// Table CANONIQUE type -> slug (identique cote frontend overrides-loader.js et migration).
var OV_TYPE_SLUGS = {
  'Excavatrice': 'excavatrice',
  'Pompe a Beton': 'pompe-a-beton',
  'Grue Mobile': 'grue-mobile',
  'Camion Girafe (Boom Truck)': 'camion-girafe',
  'Telehandler': 'telehandler',
  'Foreuse': 'foreuse',
  'Camion Vacuum': 'camion-vacuum',
  'Retrocaveuse': 'retrocaveuse',
  'Loader': 'loader',
  'Nacelle': 'nacelle'
};
// Chemin du fichier overrides pour un type. Decoupe par type -> chaque fichier reste petit,
// les ecritures sont isolees (editer une grue ne touche pas le fichier des excavatrices).
function _ovFilePath(type) {
  var slug = OV_TYPE_SLUGS[type];
  if (!slug) throw new Error('Type inconnu pour overrides: ' + type);
  return 'data/overrides/' + slug + '.json';
}

function ohReadFile(type) {
  var repo   = _prop('GITHUB_REPO', 'ETrakSolutions/portal-machine-V2');
  var branch = _prop('GITHUB_BRANCH', 'main');
  var path   = _ovFilePath(type);
  var url = 'https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + branch;
  var resp = UrlFetchApp.fetch(url, { method: 'get', headers: ghHeaders(), muteHttpExceptions: true });
  var code = resp.getResponseCode();
  if (code === 404) return { content: '{}', sha: null };   // fichier pas encore cree
  if (code !== 200) throw new Error('overrides read failed (' + code + '): ' + resp.getContentText());
  var info = JSON.parse(resp.getContentText());
  var b64;
  if (info.content && info.encoding === 'base64') {
    b64 = info.content;
  } else {
    // Filet de securite si overrides.json depasse 1 Mo un jour (Contents API ne renvoie plus le contenu)
    var blobResp = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/git/blobs/' + info.sha,
      { method: 'get', headers: ghHeaders(), muteHttpExceptions: true });
    if (blobResp.getResponseCode() !== 200) throw new Error('overrides blob read failed: ' + blobResp.getContentText());
    b64 = JSON.parse(blobResp.getContentText()).content;
  }
  var content = Utilities.newBlob(Utilities.base64Decode(b64.replace(/\n/g, ''))).getDataAsString();
  return { content: content, sha: info.sha };
}

function ohWriteFile(newContent, commitMessage, sha, type) {
  var repo   = _prop('GITHUB_REPO', 'ETrakSolutions/portal-machine-V2');
  var branch = _prop('GITHUB_BRANCH', 'main');
  var path   = _ovFilePath(type);
  var url = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  var payload = {
    message: commitMessage || 'UI: overrides update',
    content: Utilities.base64Encode(newContent, Utilities.Charset.UTF_8),
    branch: branch
  };
  if (sha) payload.sha = sha;   // omis => creation du fichier
  var resp = UrlFetchApp.fetch(url, {
    method: 'put', headers: ghHeaders(),
    contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  if (code !== 200 && code !== 201) throw new Error('overrides write failed (' + code + '): ' + resp.getContentText());
  var result = JSON.parse(resp.getContentText());
  return { ok: true, commit: result.commit && result.commit.sha };
}

function ohUpdateJson(type, modifyFn, commitMessage) {
  for (var attempt = 0; attempt < 4; attempt++) {
    var file = ohReadFile(type);
    var data;
    try { data = JSON.parse(file.content); }
    catch (e) { data = {}; }
    modifyFn(data);
    var newContent = JSON.stringify(data);  // compact : ~3x plus petit que pretty -> repousse le plafond 1 Mo
    try {
      return ohWriteFile(newContent, commitMessage, file.sha, type);
    } catch (e) {
      // 409 = sha perime (commit concurrent) : on relit et on reessaie
      if (String(e).indexOf('409') >= 0 && attempt < 3) { Utilities.sleep(400 * (attempt + 1)); continue; }
      throw e;
    }
  }
  throw new Error('ohUpdateJson failed after 4 attempts');
}

function _ovPath(data, type, fab, annee, modele) {
  if (!data[type])             data[type] = {};
  if (!data[type][fab])        data[type][fab] = {};
  if (!data[type][fab][annee]) data[type][fab][annee] = {};
  if (!data[type][fab][annee][modele]) data[type][fab][annee][modele] = {};
  return data[type][fab][annee][modele];
}

/* ============================ MACHINE OPERATIONS ============================ */

function _machinePath(data, type, fab, annee, modele) {
  if (!data[type])              data[type] = {};
  if (!data[type][fab])         data[type][fab] = {};
  if (!data[type][fab][annee])  data[type][fab][annee] = {};
  if (!data[type][fab][annee][modele]) data[type][fab][annee][modele] = { Image: '' };
  return data[type][fab][annee][modele];
}

function _validateMachineKeys(body) {
  if (!body.type)   throw new Error('type required');
  if (!body.fab)    throw new Error('fab required');
  if (!body.modele) throw new Error('modele required');
  if (!body.annee)  throw new Error('annee required');
}

function updateMachineBom(body) {
  _validateMachineKeys(body);
  var bomOverride = body.bomOverride || {};
  // Option B : ecrit dans data/overrides.json (rapide). Le harnais vit dans _bom.harnais.
  return ohUpdateJson(body.type, function (data) {
    var entry = _ovPath(data, body.type, body.fab, body.annee, body.modele);
    entry._bom = bomOverride;
  }, 'UI: BOM ' + body.fab + ' ' + body.modele + ' (' + body.annee + ')');
}

// Ecrit le _bom de PLUSIEURS annees d'un meme modele en UNE SEULE transaction
// (pour "Appliquer a toutes les annees") -> evite les conflits d'ecritures paralleles.
// body : { type, fab, modele, items: [ { annee, bomOverride }, ... ], pin }
function updateMachineBomBulk(body) {
  if (!body.type)   throw new Error('type required');
  if (!body.fab)    throw new Error('fab required');
  if (!body.modele) throw new Error('modele required');
  if (!Array.isArray(body.items) || !body.items.length) throw new Error('items required');
  return ohUpdateJson(body.type, function (data) {
    body.items.forEach(function (it) {
      if (!it || !it.annee) return;
      var entry = _ovPath(data, body.type, body.fab, it.annee, body.modele);
      entry._bom = it.bomOverride || {};
    });
  }, 'UI: BOM multi-annees ' + body.fab + ' ' + body.modele + ' (' + body.items.length + ' annees)');
}

function updateMachineSpecs(body) {
  _validateMachineKeys(body);
  var specs = body.specs || {};
  return ghUpdateJson(function (data) {
    var entry = _machinePath(data, body.type, body.fab, body.annee, body.modele);
    Object.keys(specs).forEach(function (k) { entry[k] = specs[k]; });
  }, 'UI: specs ' + body.fab + ' ' + body.modele + ' (' + body.annee + ')');
}

// Catalogue BOM global (PN + description longue) par type, dans machines.json[type]._bom_labels.
// Portee GLOBALE : affecte toutes les machines du type. La CLE ("<code> <nom court>") n'est PAS
// modifiee (on ne touche qu'a .pn et .desc) -> ordre preserve, pas de cascade sur les consommateurs.
// body : { type, code, pn?, desc?, pin }
function updateBomLabels(body) {
  if (!body.type) throw new Error('type required');
  if (!body.code) throw new Error('code required');
  var code = String(body.code);
  return ghUpdateJson(function (data) {
    var labels = data[body.type] && data[body.type]._bom_labels;
    if (!labels) throw new Error('pas de _bom_labels pour le type: ' + body.type);
    var key = null;
    for (var k in labels) { if (String(k).split(' ')[0] === code) { key = k; break; } }
    if (!key) throw new Error('code introuvable dans _bom_labels: ' + code);
    if (typeof labels[key] !== 'object' || labels[key] === null) labels[key] = {};
    if (body.pn   != null) labels[key].pn   = String(body.pn);
    if (body.desc != null) labels[key].desc = String(body.desc);
  }, 'UI: catalogue _bom_labels ' + body.type + ' ' + code);
}

function updateMachineNotes(body) {
  _validateMachineKeys(body);
  // Option B : ecrit dans data/overrides.json (rapide).
  return ohUpdateJson(body.type, function (data) {
    var entry = _ovPath(data, body.type, body.fab, body.annee, body.modele);
    if (!body.notes) delete entry._notes;
    else entry._notes = body.notes;
    if (body.warning !== undefined) {
        if (!body.warning) delete entry._warning;
        else entry._warning = body.warning;
      }
    // Nettoie l'entree si plus rien dedans
    if (Object.keys(entry).length === 0) delete data[body.type][body.fab][body.annee][body.modele];
  }, 'UI: notes ' + body.fab + ' ' + body.modele + ' (' + body.annee + ')');
}

function deleteMachine(body) {
  _validateMachineKeys(body);
  // Nettoie d'abord l'override (rapide), puis retire la machine de machines.json (lent, mais rare).
  try {
    ohUpdateJson(body.type, function (data) {
      var t = body.type, f = body.fab, y = body.annee, m = body.modele;
      if (data[t] && data[t][f] && data[t][f][y] && data[t][f][y][m]) {
        delete data[t][f][y][m];
        if (Object.keys(data[t][f][y]).length === 0) delete data[t][f][y];
        if (Object.keys(data[t][f]).length === 0)    delete data[t][f];
      }
    }, 'UI: delete override ' + body.fab + ' ' + body.modele + ' (' + body.annee + ')');
  } catch (e) { /* override absent : on continue */ }

  return ghUpdateJson(function (data) {
    var t = body.type, f = body.fab, y = body.annee, m = body.modele;
    if (data[t] && data[t][f] && data[t][f][y] && data[t][f][y][m]) {
      delete data[t][f][y][m];
      if (Object.keys(data[t][f][y]).length === 0) delete data[t][f][y];
      if (Object.keys(data[t][f]).length === 0)    delete data[t][f];
    }
  }, 'UI: delete ' + body.fab + ' ' + body.modele + ' (' + body.annee + ')');
}

/* ============================ MIGRATION (manuel, une fois) ============================ */
// Migre les overrides existants (Script Properties) vers machines.json (_bom / _notes).
// A lancer UNE FOIS depuis l'editeur (Run > migrateOverridesToJson), avant de basculer
// les lectures du frontend. Idempotent : relancable sans dommage (re-ecrit les memes valeurs).
// Logique de cle identique au frontend :
//   bomKey   = 'kit_override_' + fab.replace(/[^a-zA-Z0-9]/g,'_') + '_' + model.replace(...) + '_' + year
//   notesKey = 'notes_' + fab + '_' + model + '_' + year   (fab/model NON sanitises)

function migrateOverridesToJson() {
  var all = PROPS.getProperties();
  var stats = { bom: 0, notes: 0, machines: 0 };

  ghUpdateJson(function (data) {
    Object.keys(data).forEach(function (type) {
      var byFab = data[type];
      Object.keys(byFab).forEach(function (fab) {
        var byYear = byFab[fab];
        Object.keys(byYear).forEach(function (year) {
          var byModel = byYear[year];
          Object.keys(byModel).forEach(function (model) {
            var entry = byModel[model];
            if (!entry || typeof entry !== 'object') return;
            stats.machines++;

            var bomK = 'kit_override_' + fab.replace(/[^a-zA-Z0-9]/g, '_') + '_' +
                       model.replace(/[^a-zA-Z0-9]/g, '_') + '_' + year;
            if (all[bomK] != null && all[bomK] !== '') {
              try { entry._bom = JSON.parse(all[bomK]); }
              catch (e) { entry._bom = all[bomK]; }
              stats.bom++;
            }

            var notesK = 'notes_' + fab + '_' + model + '_' + year;
            if (all[notesK] != null && all[notesK] !== '') {
              entry._notes = all[notesK];
              stats.notes++;
            }
          });
        });
      });
    });
  }, 'Migration: overrides Script Properties -> machines.json (_bom/_notes)');

  Logger.log('Migration terminee. Machines parcourues: ' + stats.machines +
             ' | _bom ecrits: ' + stats.bom + ' | _notes ecrits: ' + stats.notes);
  return stats;
}

/* ============================ SELF-TEST (manuel) ============================ */

function testGithubConnection() {
  try {
    var file = ghReadFile();
    Logger.log('OK - machines.json lu. Taille: ' + file.size + ' bytes, sha: ' + file.sha);
  } catch (e) {
    Logger.log('ERREUR: ' + e);
  }
}

function authWhoami(body) {
  var sess = _getSession(body.token);
  if (!sess) return { ok: false, error: 'invalid session' };
  var user = _findUser(sess.u);
  if (!user || user.active === false) return { ok: false, error: 'user not found' };
  if (user.role !== sess.role) {
    sess.role = user.role;
    PROPS.setProperty(SESSION_PREFIX + body.token, JSON.stringify(sess));
  }
  return { ok: true, user: _publicUser(user) };
}

// L'utilisateur accepte les Conditions d'utilisation + la clause de confidentialite.
// Enregistre la version acceptee + l'horodatage sur son compte (preuve serveur).
// Authentifie par le token de session (pas de PIN). _publicUser renvoie ensuite
// consentVersion dans login/whoami -> le portail sait qui a signe quoi et quand.
function authAcceptConsent(body) {
  var sess = _getSession(body.token);
  if (!sess) return { ok: false, error: 'invalid session' };
  var uname = String(sess.u || '').toLowerCase();
  var users = _users();
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if ((u.username && String(u.username).toLowerCase() === uname) ||
        (u.email && String(u.email).toLowerCase() === uname)) {
      u.consentVersion = Number(body.version) || 1;
      u.consentDate = new Date().toISOString();
      PROPS.setProperty('authorized_users_v2', JSON.stringify(users));
      return { ok: true, user: _publicUser(u) };
    }
  }
  return { ok: false, error: 'user not found' };
}
