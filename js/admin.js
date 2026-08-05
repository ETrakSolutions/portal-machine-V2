// ============================================
// e-Trak Portal — HUB + Admin Logic v2
// ============================================

const API_URL = window.PORTAL_API_URL;  // #32 : centralise dans js/config.js (charge avant)

const ROLES = {
    super_admin:    { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Super Admin' },
    administrateur: { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Administrateur' },
    vente_interne:  { createAccount: true, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Vente interne' },
    technicien:     { createAccount: false, modifBom: false, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Technicien' },
    distributeur:   { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Distributeur' },
    dealer:         { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Dealer' },
    ingenierie:     { createAccount: false, modifBom: true, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Ingenierie' }
};

// Les comptes vivent UNIQUEMENT cote serveur (Apps Script, cle authorized_users_v2).
// Le login se fait par l'action 'login' de l'API ; plus aucun identifiant dans le code public.
const DEFAULT_USERS = [];

let USERS = [...DEFAULT_USERS];

// Token de session (renvoye par l'API au login, stocke dans portal_user).
// Envoye dans le champ 'pin' des ecritures — le backend accepte token ou PIN script.
function portalToken() {
    try { return (JSON.parse(localStorage.getItem('portal_user')) || {}).token || ''; } catch(e) { return ''; }
}
// Echappe le HTML (XSS) avant insertion dans un innerHTML — noms/emails saisis par les admins.
function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// #5 : mot de passe temporaire ALEATOIRE (remplace l'ancien '0000' fixe et devinable).
// Jeu de caracteres sans ambiguite (pas de O/0/I/l/1). L'utilisateur DOIT le changer au 1er login
// (mustChangePassword). Affiche dans le popup d'identifiants comme avant.
function _genTempPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    var out = '';
    var rnd = (window.crypto && window.crypto.getRandomValues) ? window.crypto.getRandomValues(new Uint32Array(10)) : null;
    for (var i = 0; i < 10; i++) {
        var r = rnd ? rnd[i] : Math.floor(Math.random() * 1e9);
        out += chars.charAt(r % chars.length);
    }
    return out;
}
const DEFAULT_EMAILS = ['robin@gryb.ca', 'k.berube@e-trak.ca'];
let targetEmails = [...DEFAULT_EMAILS];
const DEFAULT_SALES_EMAILS = [];
let salesEmails = [...DEFAULT_SALES_EMAILS];
let currentUser = null;

function getUserPermissions(role) {
    return ROLES[role] || { modifBom: false, createAccount: false, modifAccounts: false };
}

// ---- UI STATE ----
function updateHubUI() {
    var loginBtn = document.getElementById('hub-login-btn');
    var userBar = document.getElementById('hub-user-bar');
    var userName = document.getElementById('hub-user-name');
    var userRole = document.getElementById('hub-user-role');
    var hubNav = document.getElementById('hub-nav');
    var hubEmpty = document.getElementById('hub-empty');
    var tileAdmin = document.getElementById('hub-tile-admin');

    var hamburgerWrap = document.querySelector('.hamburger-wrap');

    if (currentUser) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (userBar) userBar.style.display = 'flex';
        if (userName) {
            if (currentUser.isGuest) {
                var guestExpiry = localStorage.getItem('portal_guest_expiry');
                var mins = guestExpiry ? Math.max(0, Math.round((parseInt(guestExpiry) - Date.now()) / 60000)) : 0;
                userName.textContent = (typeof i18n !== 'undefined') ? i18n.t('hub.guest_timer', {mins: mins}) : '\u23f0 Invite (' + mins + ' min restantes)';
                userName.style.color = '#FF8C00';
            } else {
                userName.textContent = '\u2713 ' + currentUser.name;
                userName.style.color = '';
            }
        }
        if (userRole) {
            var roleKey = currentUser.role;
            userRole.textContent = (typeof i18n !== 'undefined') ? i18n.t('role.' + roleKey) : (ROLES[roleKey] ? ROLES[roleKey].label : roleKey);
        }
        // Don't show hub-nav if admin section is open
        var adminOpen = document.getElementById('admin-content');
        if (hubNav && !(adminOpen && adminOpen.style.display === 'block')) {
            hubNav.style.display = 'grid';
        }
        if (hubEmpty) hubEmpty.style.display = 'none';
        // Show tiles based on permissions
        var tileMachine = document.getElementById('hub-tile-machine');
        var tileSoumission = document.getElementById('hub-tile-soumission');
        if (tileMachine) {
            tileMachine.style.display = currentUser.permissions.machineAccess ? 'block' : 'none';
        }
        if (tileSoumission) {
            tileSoumission.style.display = currentUser.permissions.soumissionAccess ? 'block' : 'none';
        }
        var tileVente = document.getElementById('hub-tile-vente');
        if (tileVente) {
            tileVente.style.display = currentUser.permissions.createAccount ? 'block' : 'none';
        }
        var tileDatabase = document.getElementById('hub-tile-database');
        if (tileDatabase) {
            tileDatabase.style.display = currentUser.permissions.databaseAccess ? 'block' : 'none';
            if (currentUser.permissions.databaseAccess) updateMachineRequestsBadge();
        }
        if (tileAdmin) {
            tileAdmin.style.display = currentUser.permissions.modifAccounts ? 'block' : 'none';
        }
        // Tuile Export : Super Admin + Administrateur
        var tileExport = document.getElementById('hub-tile-export');
        if (tileExport) {
            var exportRoles = { super_admin: true, administrateur: true };
            tileExport.style.display = exportRoles[currentUser.role] ? 'block' : 'none';
        }
        // Tuile Price List : Super Admin + Administrateur (document interne)
        var tilePricelist = document.getElementById('hub-tile-pricelist');
        if (tilePricelist) {
            var pricelistRoles = { super_admin: true, administrateur: true };
            tilePricelist.style.display = pricelistRoles[currentUser.role] ? 'block' : 'none';
        }
        // Show hamburger (QR + share) for all logged in users
        if (hamburgerWrap) {
            hamburgerWrap.style.display = '';
        }
    } else {
        if (loginBtn) loginBtn.style.display = '';
        if (userBar) userBar.style.display = 'none';
        if (hubNav) hubNav.style.display = 'none';
        if (hubEmpty) hubEmpty.style.display = 'block';
        if (hamburgerWrap) hamburgerWrap.style.display = 'none';
    }
}

// Badge "Nouvelles machines" sur la tuile BD : visible pour les roles a databaseAccess
// (acces a la page de gestion + ajout manuel), en SURBRILLANCE (+ compteur) quand il y a
// des demandes actives. Source : KV 'machine_requests' (endpoint get existant).
var __reqBadgeWired = false;
function updateMachineRequestsBadge() {
    var badge = document.getElementById('hub-db-reqbadge');
    if (!badge) return;
    if (!__reqBadgeWired) {
        __reqBadgeWired = true;
        var go = function(e) { e.preventDefault(); e.stopPropagation(); window.location.href = 'machine-requests.html'; };
        badge.addEventListener('click', go);
        badge.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    }
    fetch(API_URL + '?action=get&key=machine_requests')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var list = [];
            if (data && data.value) { try { list = JSON.parse(data.value) || []; } catch(e) { list = []; } }
            var n = Array.isArray(list) ? list.filter(function(r) { return r && r.status === 'active'; }).length : 0;
            // Temoin : visible UNIQUEMENT s'il y a au moins une demande active.
            badge.style.display = n > 0 ? 'inline-flex' : 'none';
            var countEl = document.getElementById('hub-db-reqcount');
            if (countEl) countEl.textContent = n > 0 ? (' (' + n + ')') : '';
        })
        .catch(function() { badge.style.display = 'none'; });
}

// Re-valide le role de l'utilisateur connecte aupres du serveur a l'ouverture du hub,
// pour propager un changement de role fait par un admin SANS exiger un re-login.
// Backend: action 'whoami' (token -> utilisateur frais, role lu depuis authorized_users_v2).
// GRACIEUX : si le backend ne supporte pas encore 'whoami' (ancien deploiement) ou est
// hors-ligne, on garde la session en cache (aucun changement, aucune erreur).
function refreshSessionRole() {
    if (!currentUser || currentUser.isGuest || !currentUser.token) return;
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'whoami', token: currentUser.token })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        // Jeton MORT : le backend dit explicitement que la session est invalide.
        // On force une reconnexion propre, sinon le portail reste "connecte" avec un
        // jeton inutile et toutes les actions authentifiees (heartbeat, liste users,
        // sauvegardes) echouent EN SILENCE (cas Jacquot/Luna). On ne reagit qu'aux
        // erreurs explicites du backend — PAS aux pannes reseau (catch) ni a un vieux
        // backend sans whoami ({error:'unknown action'}, sans ok:false).
        if (data && data.ok === false && (data.error === 'invalid session' || data.error === 'user not found')) {
            forceRelogin();
            return;
        }
        // backend sans 'whoami' -> {error:'unknown action'} ; session invalide -> {ok:false}
        if (!data || !data.ok || !data.user || !data.user.role) return;
        var fresh = data.user;
        // Synchro du consentement depuis le serveur (source de verite) : evite de
        // redemander la signature si l'utilisateur a deja signe sur un autre appareil.
        if (fresh.consentVersion !== undefined && Number(fresh.consentVersion) !== Number(currentUser.consentVersion || 0)) {
            currentUser.consentVersion = Number(fresh.consentVersion);
            try { localStorage.setItem('portal_user', JSON.stringify(currentUser)); } catch (e) {}
        }
        var changed = (fresh.role !== currentUser.role) ||
                      (fresh.name && fresh.name !== currentUser.name) ||
                      (fresh.email && fresh.email !== currentUser.email) ||
                      ((fresh.vendeurEmail || '') !== (currentUser.vendeurEmail || ''));
        if (!changed) return;
        currentUser.role = fresh.role;
        if (fresh.name) currentUser.name = fresh.name;
        if (fresh.email) currentUser.email = fresh.email;
        currentUser.vendeurEmail = fresh.vendeurEmail || '';
        currentUser.permissions = getUserPermissions(currentUser.role);
        localStorage.setItem('portal_user', JSON.stringify(currentUser));
        updateHubUI();   // re-affiche les tuiles selon le nouveau role
    })
    .catch(function() {});   // hors-ligne -> on garde le cache
}

// Jeton invalide detecte (whoami) -> nettoie la session locale et revient au login.
// Garde-fou anti-boucle : sans portal_user, refreshSessionRole() ne rappelle pas ceci.
function forceRelogin() {
    try { localStorage.removeItem('portal_user'); } catch (e) {}
    currentUser = null;
    try { alert(i18n.t('admin.session_dead_relogin')); } catch (e) {}
    location.reload();
}

function showVenteSection() {
    document.getElementById('hub-nav').style.display = 'none';
    var venteContent = document.getElementById('vente-content');
    if (venteContent) venteContent.style.display = 'block';
    document.querySelector('.admin-hero').style.display = 'none';
    loadUsers();
}

function hideVenteSection() {
    var venteContent = document.getElementById('vente-content');
    if (venteContent) venteContent.style.display = 'none';
    document.getElementById('hub-nav').style.display = 'grid';
    document.querySelector('.admin-hero').style.display = 'block';
}

function showAdminSection() {
    document.getElementById('hub-nav').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    document.querySelector('.admin-hero').style.display = 'none';
    // Affiche le bouton "Retour au hub" dans le header pour ressembler aux autres tuiles
    var hb = document.getElementById('admin-header-back');
    if (hb) {
        hb.style.display = '';
        hb.onclick = function(e) { e.preventDefault(); showHubSection(); };
    }
    loadUsers();
    loadVendeurs();
    loadSalesEmails();
    loadKitEmails();
    loadNotesEmails();
    renderPermTable();
    loadAllowedTypes();
}

function showHubSection() {
    document.getElementById('hub-nav').style.display = '';
    document.getElementById('admin-content').style.display = 'none';
    document.querySelector('.admin-hero').style.display = '';
    var hb = document.getElementById('admin-header-back');
    if (hb) hb.style.display = 'none';
}

// ---- PERMISSIONS TABLE (editable) ----
var PERM_KEYS = ['createAccount', 'modifBom', 'kitMachineAccess', 'soumissionAccess', 'shareAccess', 'writeNotes', 'flagBom'];
var PERM_LABELS = {'createAccount':'Acces Admin','modifBom':'Acces BD','kitMachineAccess':'Kit machine','soumissionAccess':'Soumission','shareAccess':'Partage QR','writeNotes':'Notes','flagBom':'Red Flag'};

function renderPermTable() {
    var tbody = document.getElementById('admin-perm-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var roleKeys = Object.keys(ROLES);
    roleKeys.forEach(function(roleKey) {
        // Masquer le role Super Admin sauf si le viewer est lui-meme super_admin
        if (roleKey === 'super_admin' && (!currentUser || currentUser.role !== 'super_admin')) return;
        var role = ROLES[roleKey];
        var tr = document.createElement('tr');
        var tdName = document.createElement('td');
        tdName.innerHTML = '<strong>' + i18n.t('role.' + roleKey) + '</strong>';
        tr.appendChild(tdName);

        PERM_KEYS.forEach(function(perm) {
            var td = document.createElement('td');
            td.style.textAlign = 'center';
            var isOn = role[perm];
            var isSuperAdmin = roleKey === 'super_admin';

            if (isSuperAdmin) {
                // Super Admin permissions are always on and not editable
                td.className = 'perm-yes';
                td.textContent = '\u2713';
                td.style.opacity = '0.6';
            } else {
                td.className = isOn ? 'perm-yes' : 'perm-no';
                td.textContent = isOn ? '\u2713' : '\u2717';
                td.style.cursor = 'pointer';
                td.dataset.role = roleKey;
                td.dataset.perm = perm;
                td.addEventListener('click', function() {
                    var r = this.dataset.role;
                    var p = this.dataset.perm;
                    ROLES[r][p] = !ROLES[r][p];
                    saveRoles();
                    renderPermTable();
                    showToast(i18n.t('admin.perm_modified'));
                });
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

function saveRoles() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'roles_permissions', value: JSON.stringify(ROLES), pin: portalToken() })
    }).catch(function() {});
}

function loadRoles(callback) {
    fetch(API_URL + '?action=get&key=roles_permissions')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try {
                    var saved = JSON.parse(data.value);
                    // Merge saved permissions into ROLES (keep structure, update values)
                    for (var roleKey in saved) {
                        if (ROLES[roleKey]) {
                            for (var perm in saved[roleKey]) {
                                if (perm !== 'label') ROLES[roleKey][perm] = saved[roleKey][perm];
                            }
                        }
                    }
                } catch(e) {}
            }
            if (callback) callback();
        })
        .catch(function() { if (callback) callback(); });
}

function hideAdminSection() {
    document.getElementById('hub-nav').style.display = 'grid';
    document.getElementById('admin-content').style.display = 'none';
    document.querySelector('.admin-hero').style.display = 'block';
    var hb = document.getElementById('admin-header-back');
    if (hb) hb.style.display = 'none';
}

// ---- WELCOME OVERLAY ----
function showWelcome(name, role) {
    var roleLabel = '';
    if (currentUser && currentUser.role) roleLabel = i18n.t('role.' + currentUser.role);

    var overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML =
        '<div class="welcome-line"></div>' +
        '<div class="welcome-text">' + i18n.t('admin.welcome') + '</div>' +
        '<div class="welcome-name">' + escHtml(name) + '</div>' +
        '<div class="welcome-role">' + roleLabel + '</div>' +
        '<div class="welcome-line"></div>';
    var mainEl = document.querySelector('main.admin-main');
    if (mainEl) { mainEl.style.position = 'relative'; mainEl.appendChild(overlay); }
    else document.body.appendChild(overlay);

    requestAnimationFrame(function() {
        overlay.classList.add('welcome-visible');
    });

    // Fade out after 3s, then remove and show hub
    setTimeout(function() {
        overlay.classList.add('welcome-fadeout');
        setTimeout(function() {
            overlay.remove();
            updateHubUI();
        }, 1000);
    }, 3000);
}

// ---- CHANGE PASSWORD MODAL ----
// oldPassword = mot de passe (temporaire) que l'utilisateur vient d'entrer au login ;
// requis par l'action serveur 'changepassword'.
function showChangePasswordModal(user, oldPassword) {
    var existing = document.getElementById('change-pwd-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'change-pwd-modal';
    modal.className = 'login-modal';
    modal.style.display = 'flex';
    modal.innerHTML =
        '<div class="login-modal-content" style="max-width:380px;">' +
        '<h3>' + i18n.t('admin.pwd_change_title') + '</h3>' +
        '<p style="color:#999;font-size:0.8rem;margin-bottom:1rem;">' + i18n.t('admin.pwd_welcome', {name: user.name}) + '</p>' +
        '<input type="password" id="change-pwd-new" class="login-input" placeholder="' + i18n.t('admin.pwd_new_ph') + '" autocomplete="new-password">' +
        '<input type="password" id="change-pwd-confirm" class="login-input" placeholder="' + i18n.t('admin.pwd_confirm_ph') + '" autocomplete="new-password">' +
        '<button type="button" id="change-pwd-submit" class="login-submit">' + i18n.t('admin.enregistrer') + '</button>' +
        '<p id="change-pwd-error" class="login-error" style="display:none;"></p>' +
        '</div>';

    document.body.appendChild(modal);

    document.getElementById('change-pwd-submit').addEventListener('click', function() {
        var newPwd = document.getElementById('change-pwd-new').value.trim();
        var confirmPwd = document.getElementById('change-pwd-confirm').value.trim();
        var errorEl = document.getElementById('change-pwd-error');

        if (!newPwd || newPwd.length < 4) {
            errorEl.textContent = i18n.t('admin.pwd_err_min');
            errorEl.style.display = 'block';
            return;
        }
        if (newPwd === '0000') {
            errorEl.textContent = i18n.t('admin.pwd_err_0000');
            errorEl.style.display = 'block';
            return;
        }
        if (newPwd !== confirmPwd) {
            errorEl.textContent = i18n.t('admin.pwd_err_mismatch');
            errorEl.style.display = 'block';
            return;
        }

        // Changement cote serveur (valide l'ancien mot de passe, retire le drapeau,
        // retourne une session) — le mot de passe ne transite jamais vers d'autres clients.
        var submitBtn = document.getElementById('change-pwd-submit');
        submitBtn.disabled = true;
        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain'},
            body: JSON.stringify({ action: 'changepassword', username: user.username || user.email, oldPassword: oldPassword, newPassword: newPwd })
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                submitBtn.disabled = false;
                if (data.ok && data.user) {
                    modal.remove();
                    var sess = { username: data.user.username, email: data.user.email || data.user.username, name: data.user.name, role: data.user.role, token: data.token, permissions: getUserPermissions(data.user.role), vendeurEmail: data.user.vendeurEmail || '', consentVersion: data.user.consentVersion || 0 };
                    proceedAfterAuth(sess, data.user);
                } else {
                    errorEl.textContent = i18n.t('admin.err_pwd_change');
                    errorEl.style.display = 'block';
                }
            })
            .catch(function() {
                submitBtn.disabled = false;
                errorEl.textContent = i18n.t('admin.err_server');
                errorEl.style.display = 'block';
            });
    });

    document.getElementById('change-pwd-confirm').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('change-pwd-submit').click(); }
    });

    document.getElementById('change-pwd-new').focus();
}

// ---- CONSENTEMENT (Conditions d'utilisation + confidentialite) ----
// Version courante du texte. INCREMENTER cette valeur = forcer tout le monde a
// re-signer a la prochaine ouverture (ex. apres une revision juridique du texte).
window.CONSENT_VERSION = 1;

// Doit-on demander le consentement ? Oui si l'utilisateur n'a jamais signe (aucune
// version enregistree) ou a signe une version anterieure. Les acces invite (QR,
// 1h, sans compte persistant) sont exclus : rien a enregistrer contre un compte.
function consentNeeded(user) {
    if (!user || user.isGuest) return false;
    var v = Number(user.consentVersion || 0);
    return v < window.CONSENT_VERSION;
}

// Enregistrement cote serveur (preuve : qui, quand, quelle version). Best-effort :
// tant que l'action Apps Script 'acceptconsent' n'est pas deployee, on enregistre
// localement pour ne pas bloquer l'utilisateur ; le serveur devient la source de
// verite des qu'il est en place (whoami/login renverront consentVersion).
function recordConsentServer(token, version, cb) {
    if (!token) { cb(false); return; }
    fetch(API_URL, {
        method: 'POST', headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'acceptconsent', token: token, version: version })
    }).then(function(r) { return r.json(); })
      .then(function(d) { cb(!!(d && d.ok)); })
      .catch(function() { cb(false); });
}

// Texte du consentement (FR/EN). Miroir de CONSENTEMENT_BROUILLON.md — a garder
// synchronise si le texte est revise. Les crochets [...] restent a confirmer.
function consentTextHtml(lang) {
    if (lang === 'en') {
        return '<h4>e-Trak Portal — Terms of Use</h4>' +
            '<p>By logging into the e-Trak Portal (the "Portal"), operated by GRYB International ("e-Trak", "we"), you agree to the following terms:</p>' +
            '<ol>' +
            '<li><strong>Restricted access.</strong> Access is strictly reserved for authorized users within the scope of their business relationship with e-Trak. Your account is personal and <strong>must not be shared</strong>. You are responsible for keeping your credentials confidential and for all activity under your account.</li>' +
            '<li><strong>Permitted use.</strong> The Portal and its content (specifications, configurations, bills of materials, <strong>pricing</strong> and documents) are provided solely to let you prepare and submit good-faith requests related to e-Trak products. Any other use is prohibited.</li>' +
            '<li><strong>Accuracy.</strong> Specifications and prices shown are indicative and may change without notice. They are not a firm offer and must be confirmed by e-Trak in the official quotation.</li>' +
            '<li><strong>Suspension.</strong> e-Trak may suspend or revoke your access at any time, including for breach of these terms.</li>' +
            '</ol>' +
            '<h4>Confidentiality Clause</h4>' +
            '<ol>' +
            '<li><strong>Confidential information.</strong> All information accessible through the Portal — in particular <strong>prices, price lists, configurations, bills of materials (BOM), technical specifications and commercial data</strong> — is confidential and remains the exclusive property of GRYB / e-Trak.</li>' +
            '<li><strong>Non-disclosure.</strong> You agree not to disclose, reproduce, publish, transmit or make available this information to any third party, in any form, <strong>including by screenshot</strong>, photograph, printout, export or copy, without e-Trak\'s prior written authorization.</li>' +
            '<li><strong>Limited use.</strong> You will use this information only within the authorized scope above and <strong>never for competitive purposes</strong> or for the benefit of a third party.</li>' +
            '<li><strong>Traceability.</strong> You acknowledge that displayed prices carry a watermark identifying the logged-in user, and that Portal access may be logged for security and traceability purposes.</li>' +
            '<li><strong>Term.</strong> These obligations remain in effect for the duration of your access and [X years / permanently] thereafter.</li>' +
            '<li><strong>Breach.</strong> Any breach may result in immediate revocation of access and [any remedy available at law / under applicable agreements].</li>' +
            '</ol>';
    }
    return '<h4>Conditions d\'utilisation du Portail e-Trak</h4>' +
        '<p>En vous connectant au Portail e-Trak (le « Portail »), exploité par GRYB International (« e-Trak », « nous »), vous acceptez les conditions suivantes :</p>' +
        '<ol>' +
        '<li><strong>Accès réservé.</strong> L\'accès au Portail est strictement réservé aux utilisateurs autorisés dans le cadre de leur relation d\'affaires avec e-Trak. Votre compte est personnel et <strong>ne doit pas être partagé</strong>. Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée sous votre compte.</li>' +
        '<li><strong>Usage autorisé.</strong> Le Portail et son contenu (spécifications, configurations, listes de matériel, <strong>prix</strong> et documents) sont fournis uniquement pour vous permettre de préparer et de soumettre des demandes de bonne foi liées aux produits e-Trak. Toute autre utilisation est interdite.</li>' +
        '<li><strong>Exactitude.</strong> Les spécifications et les prix affichés sont fournis à titre indicatif et peuvent changer sans préavis. Ils ne constituent pas une offre ferme et doivent être confirmés par e-Trak lors de la soumission officielle.</li>' +
        '<li><strong>Suspension.</strong> e-Trak peut suspendre ou révoquer votre accès en tout temps, notamment en cas de non-respect des présentes conditions.</li>' +
        '</ol>' +
        '<h4>Clause de confidentialité</h4>' +
        '<ol>' +
        '<li><strong>Informations confidentielles.</strong> Toutes les informations accessibles via le Portail — en particulier les <strong>prix, listes de prix, configurations, listes de matériel (BOM), spécifications techniques et données commerciales</strong> — sont confidentielles et demeurent la propriété exclusive de GRYB / e-Trak.</li>' +
        '<li><strong>Engagement de non-divulgation.</strong> Vous vous engagez à ne pas divulguer, reproduire, publier, transmettre ou rendre accessible ces informations à un tiers, sous quelque forme que ce soit, <strong>y compris par capture d\'écran</strong>, photographie, impression, export ou copie, sans l\'autorisation écrite préalable d\'e-Trak.</li>' +
        '<li><strong>Usage limité.</strong> Vous n\'utiliserez ces informations que dans le cadre autorisé ci-dessus et <strong>jamais à des fins concurrentielles</strong> ni au bénéfice d\'un tiers.</li>' +
        '<li><strong>Traçabilité.</strong> Vous reconnaissez que les prix affichés portent un filigrane identifiant l\'utilisateur connecté, et que les accès au Portail peuvent être journalisés à des fins de sécurité et de traçabilité.</li>' +
        '<li><strong>Durée.</strong> Ces engagements demeurent en vigueur pendant toute la durée de votre accès au Portail et [X années / de façon permanente] après la fin de celui-ci.</li>' +
        '<li><strong>Manquement.</strong> Tout manquement peut entraîner la révocation immédiate de l\'accès et [tout recours prévu par la loi / les ententes applicables].</li>' +
        '</ol>';
}

// Fenetre bloquante de consentement. onAccepted() est appele une fois le
// consentement enregistre (localement + best-effort serveur).
function showConsentModal(sessionUser, onAccepted) {
    var existing = document.getElementById('consent-modal');
    if (existing) existing.remove();
    var lang = (typeof i18n !== 'undefined' && i18n.getLang) ? i18n.getLang() : 'fr';
    var isFr = lang !== 'en';

    var modal = document.createElement('div');
    modal.id = 'consent-modal';
    modal.className = 'login-modal';
    modal.style.display = 'flex';
    modal.innerHTML =
        '<div class="login-modal-content" style="max-width:640px;width:92%;text-align:left;">' +
        '<h3 style="margin-top:0;">' + (isFr ? 'Consentement requis' : 'Consent required') + '</h3>' +
        '<p style="color:#999;font-size:0.82rem;margin:0 0 0.8rem;">' +
        (isFr ? 'Veuillez lire jusqu\'en bas, puis accepter pour accéder au portail.'
              : 'Please read to the end, then accept to access the portal.') + '</p>' +
        '<div id="consent-scroll" style="max-height:46vh;overflow-y:auto;border:1px solid #333;border-radius:8px;padding:14px 16px;background:#161622;font-size:0.82rem;line-height:1.5;color:#d8d8e0;">' +
        consentTextHtml(lang) + '</div>' +
        '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:0.82rem;cursor:pointer;opacity:0.5;" id="consent-lbl-1">' +
        '<input type="checkbox" id="consent-cb-1" disabled style="margin-top:3px;"> <span>' +
        (isFr ? 'J\'ai lu et j\'accepte les Conditions d\'utilisation.' : 'I have read and accept the Terms of Use.') + '</span></label>' +
        '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:6px;font-size:0.82rem;cursor:pointer;opacity:0.5;" id="consent-lbl-2">' +
        '<input type="checkbox" id="consent-cb-2" disabled style="margin-top:3px;"> <span>' +
        (isFr ? 'J\'ai lu et j\'accepte la clause de confidentialité.' : 'I have read and accept the Confidentiality Clause.') + '</span></label>' +
        '<p id="consent-hint" style="color:#FF8C00;font-size:0.72rem;margin:8px 0 0;">' +
        (isFr ? 'Faites défiler le texte jusqu\'en bas pour activer les cases.' : 'Scroll to the bottom to enable the checkboxes.') + '</p>' +
        '<div style="display:flex;gap:10px;margin-top:14px;">' +
        '<button type="button" id="consent-accept" class="login-submit" style="flex:1;opacity:0.5;" disabled>' +
        (isFr ? 'Accepter' : 'Accept') + '</button>' +
        '<button type="button" id="consent-decline" class="login-submit" style="flex:0 0 auto;background:#3a3a44;">' +
        (isFr ? 'Refuser et se déconnecter' : 'Decline and log out') + '</button>' +
        '</div>' +
        '<p id="consent-error" class="login-error" style="display:none;"></p>' +
        '</div>';
    document.body.appendChild(modal);

    var scroll = document.getElementById('consent-scroll');
    var cb1 = document.getElementById('consent-cb-1');
    var cb2 = document.getElementById('consent-cb-2');
    var lbl1 = document.getElementById('consent-lbl-1');
    var lbl2 = document.getElementById('consent-lbl-2');
    var hint = document.getElementById('consent-hint');
    var acceptBtn = document.getElementById('consent-accept');
    var errorEl = document.getElementById('consent-error');
    var scrolled = false;

    function enableChecks() {
        if (scrolled) return;
        scrolled = true;
        cb1.disabled = false; cb2.disabled = false;
        lbl1.style.opacity = '1'; lbl2.style.opacity = '1';
        if (hint) hint.style.display = 'none';
    }
    function checkScroll() {
        if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 8) enableChecks();
    }
    // Si le texte est plus court que la zone (pas de defilement possible), activer d'emblee.
    if (scroll.scrollHeight <= scroll.clientHeight + 8) enableChecks();
    scroll.addEventListener('scroll', checkScroll);

    function refreshAccept() {
        var ok = cb1.checked && cb2.checked;
        acceptBtn.disabled = !ok;
        acceptBtn.style.opacity = ok ? '1' : '0.5';
    }
    cb1.addEventListener('change', refreshAccept);
    cb2.addEventListener('change', refreshAccept);

    acceptBtn.addEventListener('click', function() {
        if (!(cb1.checked && cb2.checked)) return;
        acceptBtn.disabled = true;
        errorEl.style.display = 'none';
        var version = window.CONSENT_VERSION;
        // Enregistrement local immediat (source de verite locale + gate).
        currentUser = currentUser || sessionUser;
        currentUser.consentVersion = version;
        currentUser.consentDate = new Date().toISOString();
        try { localStorage.setItem('portal_user', JSON.stringify(currentUser)); } catch (e) {}
        // Best-effort serveur (ne bloque pas l'acces si non deploye).
        recordConsentServer(currentUser.token, version, function(/* okServer */) {});
        modal.remove();
        if (typeof onAccepted === 'function') onAccepted();
    });

    document.getElementById('consent-decline').addEventListener('click', function() {
        // Refus = pas d'acces. On nettoie la session et on revient a l'etat deconnecte.
        var tok = (currentUser && currentUser.token) || '';
        if (tok) {
            fetch(API_URL, { method: 'POST', headers: {'Content-Type': 'text/plain'},
                body: JSON.stringify({ action: 'logout', token: tok }) }).catch(function() {});
        }
        currentUser = null;
        try { localStorage.removeItem('portal_user'); } catch (e) {}
        modal.remove();
        try { hideAdminSection(); } catch (e) {}
        updateHubUI();
    });
}

// Funnel commun apres authentification reussie (login normal OU apres changement
// de mot de passe). Etablit la session puis impose le consentement si requis.
function proceedAfterAuth(sessionUser, rawUser) {
    currentUser = sessionUser;
    try { localStorage.setItem('portal_user', JSON.stringify(currentUser)); } catch (e) {}
    var loginModalEl = document.getElementById('hub-login-modal');
    function done() {
        if (loginModalEl) loginModalEl.style.display = 'none';
        showWelcome(sessionUser.name, (getUserPermissions(sessionUser.role).label) || sessionUser.role);
    }
    if (consentNeeded(rawUser || sessionUser)) {
        if (loginModalEl) loginModalEl.style.display = 'none';
        showConsentModal(sessionUser, done);
    } else {
        done();
    }
}

// ---- CREDENTIALS POPUP ----
function showCredentialsPopup(name, email, password, roleLabel) {
    var existing = document.getElementById('cred-popup-overlay');
    if (existing) existing.remove();

    // Build FR and EN email content
    var subjectFr = 'Portail e-Trak \u2014 Votre compte a \u00e9t\u00e9 cr\u00e9\u00e9';
    var bodyFr = 'Bonjour ' + name + ',\n\n' +
        'Un compte a \u00e9t\u00e9 cr\u00e9\u00e9 pour vous sur le Portail e-Trak.\n\n' +
        'Voici vos informations de connexion :\n\n' +
        'Adresse du portail : https://etraksolutions.github.io/portal-machine-V2/\n' +
        'Courriel : ' + email + '\n' +
        'Mot de passe temporaire : ' + password + '\n\n' +
        'IMPORTANT : Vous devrez changer votre mot de passe lors de votre premi\u00e8re connexion.\n\n' +
        'Votre r\u00f4le : ' + roleLabel + '\n\n' +
        'Portail e-Trak \u2014 e-Trak Technology Solutions';

    var subjectEn = 'e-Trak Portal \u2014 Your account has been created';
    var bodyEn = 'Hello ' + name + ',\n\n' +
        'An account has been created for you on the e-Trak Portal.\n\n' +
        'Here are your login credentials:\n\n' +
        'Portal address: https://etraksolutions.github.io/portal-machine-V2/\n' +
        'Email: ' + email + '\n' +
        'Temporary password: ' + password + '\n\n' +
        'IMPORTANT: You will need to change your password on your first login.\n\n' +
        'Your role: ' + roleLabel + '\n\n' +
        'e-Trak Portal \u2014 e-Trak Technology Solutions';

    var mailtoUrlFr = 'mailto:' + email + '?subject=' + encodeURIComponent(subjectFr) + '&body=' + encodeURIComponent(bodyFr);
    var mailtoUrlEn = 'mailto:' + email + '?subject=' + encodeURIComponent(subjectEn) + '&body=' + encodeURIComponent(bodyEn);

    var lang = 'fr'; // current language state

    var overlay = document.createElement('div');
    overlay.id = 'cred-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border:1px solid #333;border-radius:12px;padding:28px 24px;max-width:430px;width:90%;color:#e0e0e0;font-family:inherit;';

    function render() {
        var isFr = lang === 'fr';
        box.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<h3 style="margin:0;color:#fff;font-size:1.1rem;">\u2705 ' + (isFr ? 'Compte cr\u00e9\u00e9' : 'Account created') + '</h3>' +
                '<div style="display:flex;gap:6px;">' +
                    '<button id="cred-lang-fr" style="padding:3px 10px;border-radius:6px;border:1px solid ' + (isFr ? '#0d6efd' : '#444') + ';background:' + (isFr ? '#0d6efd' : 'transparent') + ';color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600;">FR</button>' +
                    '<button id="cred-lang-en" style="padding:3px 10px;border-radius:6px;border:1px solid ' + (!isFr ? '#0d6efd' : '#444') + ';background:' + (!isFr ? '#0d6efd' : 'transparent') + ';color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600;">EN</button>' +
                '</div>' +
            '</div>' +
            '<p style="margin:0 0 16px;color:#aaa;font-size:0.85rem;">' + (isFr ? 'Transmettez ces informations \u00e0 l\'utilisateur.' : 'Share these credentials with the user.') + '</p>' +
            '<div style="background:#111;border-radius:8px;padding:14px 16px;font-size:0.88rem;line-height:1.9;">' +
                '<div><span style="color:#888;">' + (isFr ? 'Nom' : 'Name') + '&nbsp;&nbsp;</span><strong>' + escHtml(name) + '</strong></div>' +
                '<div><span style="color:#888;">' + (isFr ? 'Courriel' : 'Email') + '&nbsp;&nbsp;</span><strong>' + escHtml(email) + '</strong></div>' +
                '<div><span style="color:#888;">' + (isFr ? 'Mot de passe' : 'Password') + '&nbsp;&nbsp;</span><strong style="color:#f90;">' + password + '</strong> <span style="color:#555;font-size:0.75rem;">(' + (isFr ? 'temporaire' : 'temporary') + ')</span></div>' +
                '<div><span style="color:#888;">' + (isFr ? 'R\u00f4le' : 'Role') + '&nbsp;&nbsp;</span><strong>' + roleLabel + '</strong></div>' +
                '<div><span style="color:#888;">Portal&nbsp;&nbsp;</span><a href="https://etraksolutions.github.io/portal-machine-V2/" target="_blank" style="color:#4ea8de;">etraksolutions.github.io/portal-machine-V2</a></div>' +
            '</div>' +
            '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">' +
                '<a id="cred-mailto-btn" href="' + (isFr ? mailtoUrlFr : mailtoUrlEn) + '" style="flex:1;min-width:140px;background:#0d6efd;color:#fff;text-align:center;padding:10px 14px;border-radius:8px;text-decoration:none;font-size:0.88rem;font-weight:600;">\uD83D\uDCE7 ' + (isFr ? 'Ouvrir dans mon courriel' : 'Open in my email') + '</a>' +
                '<button id="cred-copy-btn" style="flex:1;min-width:120px;background:#333;color:#fff;border:none;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:0.88rem;font-weight:600;">\uD83D\uDCCB ' + (isFr ? 'Copier' : 'Copy') + '</button>' +
                '<button id="cred-close-btn" style="flex:1;min-width:80px;background:#222;color:#aaa;border:1px solid #444;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:0.88rem;">' + (isFr ? 'Fermer' : 'Close') + '</button>' +
            '</div>';

        var copyText = isFr
            ? 'Portail e-Trak \u2014 Vos informations de connexion\n\nPortail : https://etraksolutions.github.io/portal-machine-V2/\nCourriel : ' + email + '\nMot de passe temporaire : ' + password + '\nR\u00f4le : ' + roleLabel + '\n\nVous devrez changer votre mot de passe \u00e0 la premi\u00e8re connexion.'
            : 'e-Trak Portal \u2014 Your login credentials\n\nPortal: https://etraksolutions.github.io/portal-machine-V2/\nEmail: ' + email + '\nTemporary password: ' + password + '\nRole: ' + roleLabel + '\n\nYou will need to change your password on first login.';

        document.getElementById('cred-lang-fr').addEventListener('click', function() { lang = 'fr'; render(); });
        document.getElementById('cred-lang-en').addEventListener('click', function() { lang = 'en'; render(); });
        document.getElementById('cred-copy-btn').addEventListener('click', function() {
            navigator.clipboard.writeText(copyText).then(function() {
                document.getElementById('cred-copy-btn').textContent = '\u2713 ' + (lang === 'fr' ? 'Copi\u00e9!' : 'Copied!');
            });
        });
        document.getElementById('cred-close-btn').addEventListener('click', function() { overlay.remove(); });
    }

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    render();

    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// ---- TOAST ----
function showToast(msg) {
    var existing = document.querySelector('.admin-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 2500);
}

// ---- EMAILS ----
function loadEmails() {
    fetch(API_URL + '?action=get&key=target_emails')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try { targetEmails = JSON.parse(data.value); } catch(e) {}
            }
            renderEmails();
        })
        .catch(function() { renderEmails(); });
}

function saveEmails() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'target_emails', value: JSON.stringify(targetEmails), pin: portalToken() })
    }).catch(function() {});
}

function renderEmails() {
    var list = document.getElementById('admin-email-list');
    if (!list) return;
    list.innerHTML = '';
    targetEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + escHtml(email) + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            targetEmails.splice(idx, 1);
            saveEmails();
            renderEmails();
            showToast(i18n.t('admin.email_deleted'));
        });
    });
}

// ---- SALES EMAILS (vente interne) ----
function loadSalesEmails() {
    fetch(API_URL + '?action=get&key=sales_emails')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try { salesEmails = JSON.parse(data.value); } catch(e) {}
            }
            renderSalesEmails();
        })
        .catch(function() { renderSalesEmails(); });
}

function saveSalesEmails() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'sales_emails', value: JSON.stringify(salesEmails), pin: portalToken() })
    }).catch(function() {});
}

function renderSalesEmails() {
    var list = document.getElementById('admin-sales-email-list');
    if (!list) return;
    list.innerHTML = '';
    salesEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + escHtml(email) + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            salesEmails.splice(idx, 1);
            saveSalesEmails();
            renderSalesEmails();
            showToast(i18n.t('admin.sales_email_deleted'));
        });
    });
}

// ---- KIT EMAILS ----
let kitEmails = [];

function loadKitEmails() {
    fetch(API_URL + '?action=get&key=kit_emails')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try { kitEmails = JSON.parse(data.value); } catch(e) {}
            }
            renderKitEmails();
        })
        .catch(function() { renderKitEmails(); });
}

function saveKitEmails() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'kit_emails', value: JSON.stringify(kitEmails), pin: portalToken() })
    }).catch(function() {});
}

function renderKitEmails() {
    var list = document.getElementById('admin-kit-email-list');
    if (!list) return;
    list.innerHTML = '';
    kitEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + escHtml(email) + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            kitEmails.splice(idx, 1);
            saveKitEmails();
            renderKitEmails();
            showToast(i18n.t('admin.kit_email_deleted'));
        });
    });
}

// ---- VENDEURS ----
let vendeurs = [];

function loadVendeurs(callback) {
    fetch(API_URL + '?action=get&key=vendeurs_list')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) { try { vendeurs = JSON.parse(data.value); } catch(e) {} }
            renderVendeurs();
            if (callback) callback();
        })
        .catch(function() { renderVendeurs(); if (callback) callback(); });
}

function saveVendeurs() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'vendeurs_list', value: JSON.stringify(vendeurs), pin: portalToken() })
    }).catch(function() {});
}

function renderVendeurs() {
    var list = document.getElementById('admin-vendeurs-list');
    if (!list) return;
    list.innerHTML = '';
    vendeurs.forEach(function(v, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span><strong>' + escHtml(v.name) + '</strong> &mdash; ' + escHtml(v.email) + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            vendeurs.splice(idx, 1);
            saveVendeurs();
            renderVendeurs();
            showToast(i18n.t('admin.vendeur_deleted'));
        });
    });
}

// ---- NOTES EMAILS ----
let notesEmails = [];

function loadNotesEmails() {
    fetch(API_URL + '?action=get&key=notes_emails')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) { try { notesEmails = JSON.parse(data.value); } catch(e) {} }
            renderNotesEmails();
        })
        .catch(function() { renderNotesEmails(); });
}

function saveNotesEmails() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'notes_emails', value: JSON.stringify(notesEmails), pin: portalToken() })
    }).catch(function() {});
}

function renderNotesEmails() {
    var list = document.getElementById('admin-notes-email-list');
    if (!list) return;
    list.innerHTML = '';
    notesEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + escHtml(email) + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            notesEmails.splice(idx, 1);
            saveNotesEmails();
            renderNotesEmails();
            showToast(i18n.t('admin.notes_email_deleted'));
        });
    });
}

// ---- USERS ----
// Liste chargee par l'action authentifiee 'listusers' : les mots de passe ne sont
// retournes que pour un token admin (UI de gestion des comptes).
function loadUsers() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'listusers', token: portalToken() })
    })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            // Pas de tableau 'users' => le backend a refuse l'authentification
            // (jeton de session expire/invalide). On l'affiche clairement au lieu
            // de laisser une table vide muette (sinon "je ne vois aucun user").
            if (!Array.isArray(data.users)) {
                renderUsersMessage(i18n.t('admin.users_session_expired'));
                return;
            }
            if (data.users.length > 0) USERS = data.users;
            renderUsers();
        })
        .catch(function() { renderUsers(); });
}

// Affiche un message sur toute la largeur de la table des utilisateurs.
function renderUsersMessage(msg) {
    var tbody = document.getElementById('admin-user-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="padding:1.2rem;color:#E07B00;text-align:center;line-height:1.5">' + msg + '</td></tr>';
}

function saveUsers() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'authorized_users_v2', value: JSON.stringify(USERS), pin: portalToken() })
    }).catch(function() {});
}

function renderUsers() {
    var tbody = document.getElementById('admin-user-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var SUPER_ADMIN = 'robin@gryb.ca';
    USERS.forEach(function(user, i) {
        // Masquer les comptes Super Admin sauf pour un viewer super_admin
        if (user.role === 'super_admin' && (!currentUser || currentUser.role !== 'super_admin')) return;
        var roleLabel = i18n.t('role.' + user.role);
        var isSuperAdmin = user.email && user.email.toLowerCase() === SUPER_ADMIN;
        var tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.dataset.idx = i;
        // Voyant d'activite (sera mis a jour par loadActiveStatus apres render)
        var dotHtml = '<span class="user-active-dot" data-email="' + escHtml((user.email || '').toLowerCase()) + '" title="' + i18n.t('admin.status_unknown') + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#444;margin-right:8px;vertical-align:middle"></span>';
        tr.innerHTML =
            '<td>' + dotHtml + '<strong>' + escHtml(user.name) + '</strong>' + (isSuperAdmin ? ' <span style="color:#FFD700;font-size:0.65rem;">&#9733; SUPER</span>' : '') + '<div class="user-lastseen" data-email="' + escHtml((user.email || '').toLowerCase()) + '" style="font-size:0.66rem;color:#8aa;margin-top:2px;margin-left:18px">…</div>' + '</td>' +
            '<td>' + (user.email ? escHtml(user.email) : '<span style="color:#555;">\u2014</span>') + '</td>' +
            '<td><span class="role-badge role-' + user.role + '">' + roleLabel + '</span></td>' +
            '<td>' + (!isSuperAdmin && currentUser && currentUser.permissions && currentUser.permissions.modifAccounts ? '<button class="admin-delete-btn" data-idx="' + i + '">\u2715</button>' : '') + '</td>';
        tbody.appendChild(tr);
    });
    // Charger les statuts d'activite (heartbeat) pour chaque user
    loadUserActiveStatus();
    // Click row to edit user
    tbody.querySelectorAll('tr').forEach(function(tr) {
        tr.addEventListener('click', function(e) {
            if (e.target.classList.contains('admin-delete-btn')) return;
            var idx = parseInt(this.dataset.idx);
            openEditUserModal(idx);
        });
    });
    tbody.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var idx = parseInt(this.dataset.idx);
            var user = USERS[idx];
            if (user.email && user.email.toLowerCase() === SUPER_ADMIN) {
                alert(i18n.t('admin.cannot_delete_super'));
                return;
            }
            var userName = user.name;
            if (!confirm(i18n.t('admin.confirm_delete_user', {name: userName}))) return;
            USERS.splice(idx, 1);
            saveUsers();
            renderUsers();
            showToast(i18n.t('admin.user_deleted', {name: userName}));
        });
    });
}

// === Voyant d'activite : heartbeat + load ===
// Charge le dernier timestamp d'activite pour chaque user et met a jour le voyant
function loadUserActiveStatus() {
    var PING_THRESHOLD_MS = 12 * 60 * 1000;     // 12 min (= 10 min interval + 2 min marge)
    var ACTIVITY_THRESHOLD_MS = 3 * 60 * 1000;   // 3 min sans interaction = inactif
    var now = Date.now();
    function fmtAgo(ms) {
        var s = Math.round(ms/1000);
        if (s < 60) return s + 's';
        var m = Math.round(s/60);
        if (m < 60) return m + ' min';
        var h = Math.round(m/60);
        if (h < 24) return h + 'h';
        return Math.round(h/24) + i18n.t('admin.unit_day');
    }
    function fmtDate(ts){ var d=new Date(ts); if(isNaN(d.getTime())) return ''; var p=function(n){return (n<10?'0':'')+n;}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
    function setLastSeen(email, txt){ var e=document.querySelector('.user-lastseen[data-email="'+email+'"]'); if(e) e.textContent=txt; }
    var LBL = (typeof i18n!=='undefined') ? i18n.t('admin.lastseen') : 'Derniere activite';
    var NEVER = (typeof i18n!=='undefined') ? i18n.t('admin.never_connected') : 'Jamais connecte';
    document.querySelectorAll('.user-active-dot').forEach(function(dot) {
        var email = dot.dataset.email;
        if (!email) return;
        var key = 'user_active_' + email.replace(/[^a-zA-Z0-9]/g, '_');
        fetch(API_URL + '?action=get&key=' + encodeURIComponent(key))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.value) {
                    dot.style.background = '#444';
                    dot.style.boxShadow = 'none';
                    dot.title = i18n.t('admin.never_connected');
                    setLastSeen(email, NEVER);
                    return;
                }
                // Nouveau format: JSON {lastPing, lastActivity}
                // Ancien format: ISO timestamp (compatibilite)
                var info;
                try { info = JSON.parse(data.value); }
                catch(e) { info = { lastPing: data.value, lastActivity: data.value }; }
                if (!info || typeof info !== 'object') {
                    info = { lastPing: data.value, lastActivity: data.value };
                }
                var pingTs = new Date(info.lastPing).getTime();
                var activityTs = new Date(info.lastActivity || info.lastPing).getTime();
                if (isNaN(pingTs)) { dot.style.background = '#444'; dot.title = i18n.t('admin.status_invalid'); return; }

                var pingDiff = now - pingTs;
                var activityDiff = now - activityTs;
                setLastSeen(email, LBL + ' : ' + fmtDate(activityTs));

                if (pingDiff > PING_THRESHOLD_MS) {
                    // Pas de ping recent — deconnecte
                    dot.style.background = '#444';
                    dot.style.boxShadow = 'none';
                    dot.title = i18n.t('admin.status_disconnected', {ago: fmtAgo(pingDiff)});
                } else if (activityDiff > ACTIVITY_THRESHOLD_MS) {
                    // Ping recent mais pas d'activite — page ouverte mais inactif
                    dot.style.background = '#FFB74D';
                    dot.style.boxShadow = '0 0 6px rgba(255,183,77,0.6)';
                    dot.title = i18n.t('admin.status_inactive', {ago: fmtAgo(activityDiff)});
                } else {
                    // Actif maintenant
                    dot.style.background = '#00CC66';
                    dot.style.boxShadow = '0 0 6px rgba(0,204,102,0.7)';
                    dot.title = i18n.t('admin.status_active', {ago: fmtAgo(activityDiff)});
                }
            })
            .catch(function() {});
    });
}

// Demarre le heartbeat au chargement (defini dans le snippet global window.startUserHeartbeat)
if (typeof window !== 'undefined' && typeof window.startUserHeartbeat === 'function') {
    document.addEventListener('DOMContentLoaded', window.startUserHeartbeat);
}

// Refresh des voyants toutes les 30s quand on est dans la section admin
setInterval(function() {
    if (document.querySelectorAll('.user-active-dot').length > 0) loadUserActiveStatus();
}, 30000);

// ---- EDIT USER MODAL ----
function openEditUserModal(idx) {
    var user = USERS[idx];
    if (!user) return;
    var SUPER_ADMIN = 'robin@gryb.ca';
    var isSuperAdmin = user.email && user.email.toLowerCase() === SUPER_ADMIN;

    // Remove existing modal
    var existing = document.getElementById('edit-user-modal');
    if (existing) existing.remove();

    var roleOptions = '';
    Object.keys(ROLES).forEach(function(key) {
        roleOptions += '<option value="' + key + '"' + (user.role === key ? ' selected' : '') + '>' + i18n.t('role.' + key) + '</option>';
    });
    // Vendeur associe (dealer/distributeur) : liste des vendeurs (Admin > Vendeurs)
    var vendeurOptions = '<option value="">' + i18n.t('admin.vendeur_none') + '</option>';
    (vendeurs || []).forEach(function(vv) {
        vendeurOptions += '<option value="' + vv.email + '"' + (user.vendeurEmail === vv.email ? ' selected' : '') + '>' + vv.name + ' (' + vv.email + ')</option>';
    });
    var showVendeur = (user.role === 'dealer' || user.role === 'distributeur');

    var modal = document.createElement('div');
    modal.id = 'edit-user-modal';
    modal.className = 'login-modal';
    modal.style.display = 'flex';
    modal.innerHTML =
        '<div class="login-modal-content" style="max-width:420px;">' +
        '<button class="login-close" id="edit-user-close">&times;</button>' +
        '<h3>' + i18n.t('admin.edit_user_title') + '</h3>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">' + i18n.t('admin.full_name') + '</label>' +
        '<input type="text" id="edit-user-name" class="login-input" value="' + (user.name || '') + '"></div>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">' + i18n.t('admin.email_login_label') + '</label>' +
        '<input type="email" id="edit-user-email" class="login-input" value="' + (user.email || '') + '"' + (isSuperAdmin ? ' readonly style="opacity:0.5;"' : '') + '></div>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">' + i18n.t('admin.password_label') + '</label>' +
        '<input type="text" id="edit-user-password" class="login-input" value="' + (user.password || '') + '"></div>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">' + i18n.t('admin.role_label') + '</label>' +
        '<select id="edit-user-role" class="login-input"' + (isSuperAdmin ? ' disabled style="opacity:0.5;"' : '') + '>' + roleOptions + '</select></div>' +
        '<div class="admin-form-group" id="edit-user-vendeur-group" style="margin-bottom:0.75rem;display:' + (showVendeur ? 'block' : 'none') + ';"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">' + i18n.t('admin.vendeur_label') + '</label>' +
        '<select id="edit-user-vendeur" class="login-input">' + vendeurOptions + '</select></div>' +
        '<button type="button" id="edit-user-save" class="login-submit">' + i18n.t('admin.enregistrer') + '</button>' +
        '<button type="button" id="edit-user-resend" style="width:100%;margin-top:8px;background:transparent;border:1px solid #444;color:#aaa;padding:10px;border-radius:8px;cursor:pointer;font-size:0.88rem;">' + i18n.t('admin.resend_credentials') + '</button>' +
        '</div>';

    document.body.appendChild(modal);

    // Close
    document.getElementById('edit-user-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // Affiche le champ Vendeur seulement pour dealer/distributeur
    document.getElementById('edit-user-role').addEventListener('change', function() {
        var grp = document.getElementById('edit-user-vendeur-group');
        if (grp) grp.style.display = (this.value === 'dealer' || this.value === 'distributeur') ? 'block' : 'none';
    });

    // Save
    document.getElementById('edit-user-save').addEventListener('click', function() {
        var newName = document.getElementById('edit-user-name').value.trim();
        var newEmail = document.getElementById('edit-user-email').value.trim();
        var newPassword = document.getElementById('edit-user-password').value.trim();
        var newRole = document.getElementById('edit-user-role').value;

        if (!newName || !newEmail || !newPassword) {
            alert(i18n.t('admin.required_fields'));
            return;
        }

        USERS[idx].name = newName;
        if (!isSuperAdmin) {
            USERS[idx].email = newEmail.toLowerCase();
            USERS[idx].username = newEmail.toLowerCase();
            USERS[idx].role = newRole;
            // Vendeur associe : seulement pour dealer/distributeur, sinon on retire
            if (newRole === 'dealer' || newRole === 'distributeur') {
                var vsel = document.getElementById('edit-user-vendeur');
                USERS[idx].vendeurEmail = vsel ? vsel.value : '';
            } else {
                delete USERS[idx].vendeurEmail;
            }
        }
        USERS[idx].password = newPassword;

        saveUsers();
        renderUsers();
        modal.remove();
        showToast(i18n.t('admin.user_modified', {name: newName}));
    });

    // Resend credentials
    document.getElementById('edit-user-resend').addEventListener('click', function() {
        var currentName = document.getElementById('edit-user-name').value.trim() || user.name;
        var currentEmail = document.getElementById('edit-user-email').value.trim() || user.email;
        var currentPassword = document.getElementById('edit-user-password').value.trim() || user.password;
        var currentRole = document.getElementById('edit-user-role').value;
        var roleLabel = i18n.t('role.' + currentRole);
        modal.remove();
        showCredentialsPopup(currentName, currentEmail, currentPassword, roleLabel);
    });
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', function() {
    // Load saved permissions from API
    loadRoles(function() {
        // Restore session after roles are loaded
        updateHubUI();
    });

    // Check for guest access via URL param ?guest=1
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('guest') === '1') {
        var guestExpiry = localStorage.getItem('portal_guest_expiry');
        var now = Date.now();
        if (!guestExpiry || now > parseInt(guestExpiry)) {
            // Set new 1-hour guest session
            localStorage.setItem('portal_guest_expiry', String(now + 3600000)); // 1 hour
        }
        // Create guest dealer session
        var guestUser = { username: 'guest', name: 'Invite', role: 'dealer', permissions: getUserPermissions('dealer'), isGuest: true };
        localStorage.setItem('portal_user', JSON.stringify(guestUser));
        // Remove ?guest=1 from URL
        window.history.replaceState({}, '', window.location.pathname);
    }

    // Restore session
    var saved = localStorage.getItem('portal_user');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            if (parsed && parsed.username) {
                // Check guest expiry
                if (parsed.isGuest) {
                    var guestExpiry = localStorage.getItem('portal_guest_expiry');
                    if (guestExpiry && Date.now() > parseInt(guestExpiry)) {
                        // Guest session expired
                        localStorage.removeItem('portal_user');
                        localStorage.removeItem('portal_guest_expiry');
                        parsed = null;
                    }
                }
                if (parsed) {
                    currentUser = parsed;
                    currentUser.permissions = getUserPermissions(currentUser.role);
                }
            }
        } catch(e) {}
    }
    updateHubUI();
    // Consentement : force la signature a l'ouverture pour tout utilisateur (deja
    // connecte) qui n'a jamais signe la version courante. Exclut les acces invite.
    if (currentUser && consentNeeded(currentUser)) {
        showConsentModal(currentUser, function() { updateHubUI(); });
    }
    // Propage un eventuel changement de role fait par un admin (sans re-login).
    refreshSessionRole();

    // (la validation du login se fait desormais cote serveur — plus de prechargement
    //  de la liste des utilisateurs ici)

    // LOGIN
    var loginBtn = document.getElementById('hub-login-btn');
    var loginModal = document.getElementById('hub-login-modal');
    var loginClose = document.getElementById('hub-login-close');
    var loginSubmit = document.getElementById('hub-login-submit');
    var loginUsername = document.getElementById('hub-login-username');
    var loginPassword = document.getElementById('hub-login-password');
    var loginError = document.getElementById('hub-login-error');

    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            loginModal.style.display = 'flex';
            loginUsername.value = '';
            loginPassword.value = '';
            loginError.style.display = 'none';
            loginUsername.focus();
        });
    }

    if (loginClose) {
        loginClose.addEventListener('click', function() { loginModal.style.display = 'none'; });
    }

    if (loginModal) {
        loginModal.addEventListener('click', function(e) {
            if (e.target === loginModal) loginModal.style.display = 'none';
        });
    }

    if (loginSubmit) {
        loginSubmit.addEventListener('click', function() {
            var username = loginUsername.value.trim().toLowerCase();
            var password = loginPassword.value.trim();
            loginError.style.display = 'none';
            loginSubmit.disabled = true;
            // Validation cote serveur : le mot de passe ne vit plus dans le code public
            fetch(API_URL, {
                method: 'POST',
                headers: {'Content-Type': 'text/plain'},
                body: JSON.stringify({ action: 'login', username: username, password: password })
            })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    loginSubmit.disabled = false;
                    if (data.ok && data.user) {
                        var user = data.user;
                        if (user.mustChangePassword) {
                            loginModal.style.display = 'none';
                            showChangePasswordModal(user, password);
                        } else {
                            var sess = { username: user.username, email: user.email || user.username, name: user.name, role: user.role, token: data.token, permissions: getUserPermissions(user.role), vendeurEmail: user.vendeurEmail || '', consentVersion: user.consentVersion || 0 };
                            proceedAfterAuth(sess, user);
                        }
                    } else {
                        loginError.textContent = (typeof i18n !== 'undefined') ? i18n.t('hub.login_error') : 'Utilisateur ou mot de passe invalide';
                        loginError.style.display = 'block';
                    }
                })
                .catch(function() {
                    loginSubmit.disabled = false;
                    loginError.textContent = i18n.t('admin.err_server');
                    loginError.style.display = 'block';
                });
        });
    }

    if (loginPassword) {
        loginPassword.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); loginSubmit.click(); }
        });
    }

    if (loginUsername) {
        loginUsername.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); loginPassword.focus(); }
        });
    }

    // LOGOUT
    var logoutBtn = document.getElementById('hub-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            var userName = currentUser ? currentUser.name : '';
            // Show goodbye overlay
            var overlay = document.createElement('div');
            overlay.className = 'welcome-overlay goodbye-overlay';
            overlay.innerHTML =
                '<div class="welcome-line"></div>' +
                '<div class="welcome-text">' + i18n.t('admin.goodbye') + '</div>' +
                '<div class="welcome-name">' + userName + '</div>' +
                '<div class="welcome-line"></div>';
            var mainEl = document.querySelector('main.admin-main');
            if (mainEl) { mainEl.style.position = 'relative'; mainEl.appendChild(overlay); }
            else document.body.appendChild(overlay);
            requestAnimationFrame(function() { overlay.classList.add('welcome-visible'); });

            // Invalide la session cote serveur (fire-and-forget)
            var tok = portalToken();
            if (tok) {
                fetch(API_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'text/plain'},
                    body: JSON.stringify({ action: 'logout', token: tok })
                }).catch(function() {});
            }

            // Fade out after 3s then disconnect
            setTimeout(function() {
                overlay.classList.add('welcome-fadeout');
                setTimeout(function() {
                    overlay.remove();
                    currentUser = null;
                    localStorage.removeItem('portal_user');
                    hideAdminSection();
                    updateHubUI();
                }, 1000);
            }, 3000);
        });
    }

    // VENTE TILE — show vente section inline
    var tileVente = document.getElementById('hub-tile-vente');
    if (tileVente) {
        tileVente.addEventListener('click', function(e) {
            e.preventDefault();
            showVenteSection();
        });
    }

    // BACK TO HUB from vente
    var venteBackBtn = document.getElementById('vente-back-to-hub');
    if (venteBackBtn) {
        venteBackBtn.addEventListener('click', function() {
            hideVenteSection();
        });
    }

    // ADMIN TILE — show admin section inline
    var tileAdmin = document.getElementById('hub-tile-admin');
    if (tileAdmin) {
        tileAdmin.addEventListener('click', function(e) {
            e.preventDefault();
            showAdminSection();
        });
    }

    // BACK TO HUB from admin
    var backBtn = document.getElementById('admin-back-to-hub');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            hideAdminSection();
        });
    }

    // ADD VENDEUR
    var addVendeurBtn = document.getElementById('admin-add-vendeur-btn');
    if (addVendeurBtn) {
        addVendeurBtn.onclick = function() {
            var nameInput = document.getElementById('admin-add-vendeur-name');
            var emailInput = document.getElementById('admin-add-vendeur-email');
            var name = nameInput.value.trim();
            var email = emailInput.value.trim();
            if (name && email && email.includes('@')) {
                vendeurs.push({ name: name, email: email });
                saveVendeurs();
                renderVendeurs();
                nameInput.value = '';
                emailInput.value = '';
                showToast(i18n.t('admin.vendeur_added', {name: name}));
            }
        };
    }

    // ADD EMAIL
    var addEmailBtn = document.getElementById('admin-add-email-btn');
    if (addEmailBtn) {
        addEmailBtn.onclick = function() {
            var input = document.getElementById('admin-add-email');
            var email = input.value.trim();
            if (email && email.includes('@')) {
                targetEmails.push(email);
                saveEmails();
                renderEmails();
                input.value = '';
                showToast(i18n.t('admin.email_added'));
            }
        };
    }

    // ADD SALES EMAIL
    var addSalesEmailBtn = document.getElementById('admin-add-sales-email-btn');
    if (addSalesEmailBtn) {
        addSalesEmailBtn.onclick = function() {
            var input = document.getElementById('admin-add-sales-email');
            var email = input.value.trim();
            if (email && email.includes('@')) {
                salesEmails.push(email);
                saveSalesEmails();
                renderSalesEmails();
                input.value = '';
                showToast(i18n.t('admin.sales_email_added'));
            }
        };
    }

    // ADD KIT EMAIL
    var addKitEmailBtn = document.getElementById('admin-add-kit-email-btn');
    if (addKitEmailBtn) {
        addKitEmailBtn.onclick = function() {
            var input = document.getElementById('admin-add-kit-email');
            var email = input.value.trim();
            if (email && email.includes('@')) {
                kitEmails.push(email);
                saveKitEmails();
                renderKitEmails();
                input.value = '';
                showToast(i18n.t('admin.kit_email_added'));
            }
        };
    }

    // ADD NOTES EMAIL
    var addNotesEmailBtn = document.getElementById('admin-add-notes-email-btn');
    if (addNotesEmailBtn) {
        addNotesEmailBtn.onclick = function() {
            var input = document.getElementById('admin-add-notes-email');
            var email = input.value.trim();
            if (email && email.includes('@')) {
                notesEmails.push(email);
                saveNotesEmails();
                renderNotesEmails();
                input.value = '';
                showToast(i18n.t('admin.notes_email_added'));
            }
        };
    }

    // Show/hide vendeur dropdown based on role
    var roleSelect = document.getElementById('admin-new-role');
    var vendeurGroup = document.getElementById('admin-vendeur-group');
    function updateVendeurVisibility() {
        var role = roleSelect ? roleSelect.value : '';
        var needsVendeur = (role === 'dealer' || role === 'distributeur');
        if (vendeurGroup) vendeurGroup.style.display = needsVendeur ? '' : 'none';
        // Populate vendeur dropdown
        if (needsVendeur) {
            var vendeurSel = document.getElementById('admin-new-vendeur');
            if (vendeurSel) {
                var current = vendeurSel.value;
                vendeurSel.innerHTML = '<option value="">' + i18n.t('admin.vendeur_none') + '</option>';
                vendeurs.forEach(function(v) {
                    var opt = document.createElement('option');
                    opt.value = v.email;
                    opt.textContent = v.name + ' (' + v.email + ')';
                    vendeurSel.appendChild(opt);
                });
                vendeurSel.value = current;
            }
        }
    }
    if (roleSelect) roleSelect.addEventListener('change', updateVendeurVisibility);
    updateVendeurVisibility();

    // ADD USER
    var addUserBtn = document.getElementById('admin-add-user-btn');
    if (addUserBtn) {
        addUserBtn.onclick = function() {
            var name = document.getElementById('admin-new-name').value.trim();
            var email = document.getElementById('admin-new-email').value.trim();
            var role = document.getElementById('admin-new-role').value;
            var vendeurEmail = '';
            if (role === 'dealer' || role === 'distributeur') {
                var vendeurSel = document.getElementById('admin-new-vendeur');
                vendeurEmail = vendeurSel ? vendeurSel.value : '';
            }
            var errorEl = document.getElementById('admin-add-user-error');

            if (errorEl) errorEl.style.display = 'none';

            if (!name || !email || !email.includes('@')) {
                if (errorEl) { errorEl.textContent = i18n.t('admin.add_user_err_name_email'); errorEl.style.display = 'block'; }
                return;
            }
            var exists = USERS.find(function(u) { return (u.email && u.email.toLowerCase() === email.toLowerCase()) || u.username.toLowerCase() === email.toLowerCase(); });
            if (exists) {
                if (errorEl) { errorEl.textContent = i18n.t('admin.add_user_err_exists'); errorEl.style.display = 'block'; }
                return;
            }
            var tempPwd = _genTempPassword();
            var newUser = { username: email.toLowerCase(), email: email.toLowerCase(), password: tempPwd, role: role, name: name, active: true, mustChangePassword: true };
            if (vendeurEmail) newUser.vendeurEmail = vendeurEmail;
            USERS.push(newUser);
            saveUsers();
            renderUsers();

            // Show credentials popup + mailto button
            var roleLabel = i18n.t('role.' + role);
            showCredentialsPopup(name, email, tempPwd, roleLabel);

            document.getElementById('admin-new-name').value = '';
            document.getElementById('admin-new-email').value = '';
            showToast(i18n.t('admin.user_added', {name: name}));
        };
    }

    // HAMBURGER MENU
    var hamburgerBtn = document.getElementById('hamburger-btn');
    var hamburgerMenu = document.getElementById('hamburger-menu');
    if (hamburgerBtn && hamburgerMenu) {
        hamburgerBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            hamburgerBtn.classList.toggle('active');
            var open = hamburgerMenu.classList.toggle('open');
            hamburgerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.addEventListener('click', function(e) {
            if (!hamburgerMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                hamburgerBtn.classList.remove('active');
                hamburgerMenu.classList.remove('open');
                hamburgerBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // SHARE BY EMAIL
    var shareSendBtn = document.getElementById('share-send-btn');
    if (shareSendBtn) {
        shareSendBtn.addEventListener('click', function() {
            var emailInput = document.getElementById('share-email');
            var email = emailInput.value.trim();
            if (!email || !email.includes('@')) {
                alert(i18n.t('admin.invalid_email'));
                return;
            }
            var subject = i18n.t('admin.share_subject');
            var body = i18n.t('admin.share_body');
            window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
            emailInput.value = '';
        });
    }
});

// ============================================
// Types de machines autorisés pour Soumission
// ============================================
var ALL_MACHINE_TYPES = [
    'Camion Girafe (Boom Truck)', 'Camion Vacuum', 'Excavatrice', 'Foreuse',
    'Grue Mobile', 'Loader', 'Nacelle', 'Pompe a Beton', 'Retrocaveuse', 'Telehandler',
    'Tracteur'
];

function loadAllowedTypes() {
    var container = document.getElementById('admin-allowed-types');
    if (!container) return;

    // Render immediately with all checked (default), then update from API
    renderTypeCheckboxes(container, []);

    fetch(API_URL + '?action=get&key=soumission_allowed_types')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                var allowed = [];
                try { allowed = JSON.parse(data.value); } catch(e) {}
                if (allowed.length > 0) renderTypeCheckboxes(container, allowed);
            }
        })
        .catch(function() {}); // Keep default (all checked)
}

function renderTypeCheckboxes(container, allowed) {
    container.innerHTML = '';
    ALL_MACHINE_TYPES.forEach(function(type) {
        var label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;background:#1E1E1E;border:1px solid #333;border-radius:6px;color:#fff;font-size:0.85rem;cursor:pointer;';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = type;
        cb.checked = allowed.length === 0 || allowed.indexOf(type) >= 0; // all checked if no config
        cb.style.accentColor = '#4DA8FF';
        label.appendChild(cb);
        label.appendChild(document.createTextNode(i18n.t('type.' + type)));
        container.appendChild(label);
    });
}

var saveTypesBtn = document.getElementById('admin-save-types');
if (saveTypesBtn) {
    saveTypesBtn.addEventListener('click', function() {
        var container = document.getElementById('admin-allowed-types');
        var checked = [];
        container.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) {
            checked.push(cb.value);
        });
        saveTypesBtn.textContent = (typeof i18n !== 'undefined') ? i18n.t('admin.save_saving') : 'Sauvegarde...';
        fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'save', key: 'soumission_allowed_types', value: JSON.stringify(checked), pin: portalToken() })
        }).then(function() {
            saveTypesBtn.textContent = '\u2713 ' + ((typeof i18n !== 'undefined') ? i18n.t('admin.save_done') : 'Sauvegarde!');
            setTimeout(function() { saveTypesBtn.textContent = (typeof i18n !== 'undefined') ? i18n.t('common.sauvegarder') : 'Sauvegarder'; }, 2000);
        }).catch(function() {
            saveTypesBtn.textContent = (typeof i18n !== 'undefined') ? i18n.t('admin.save_error') : 'Erreur!';
            setTimeout(function() { saveTypesBtn.textContent = (typeof i18n !== 'undefined') ? i18n.t('common.sauvegarder') : 'Sauvegarder'; }, 2000);
        });
    });
}

// ---- i18n: Re-translate on language change ----
window.addEventListener('langchange', function() {
    if (typeof i18n !== 'undefined') {
        i18n.translatePage();
        if (currentUser) updateHubUI();
    }
});