// ============================================
// e-Trak Portal — HUB + Admin Logic v2
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';

const ROLES = {
    super_admin:    { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Super Admin' },
    administrateur: { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Administrateur' },
    vente_interne:  { createAccount: true, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Vente interne' },
    technicien:     { createAccount: false, modifBom: false, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Technicien' },
    distributeur:   { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Distributeur' },
    dealer:         { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Dealer' },
    ingenierie:     { createAccount: false, modifBom: true, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Ingenierie' }
};

const DEFAULT_USERS = [
    { username: 'administrateur', email: 'robin@gryb.ca', password: '1400', role: 'super_admin', name: 'Robin Gagnon', active: true },
    { username: 'jacquot', email: 'jacquot@gryb.ca', password: '1234', role: 'administrateur', name: 'Jacquot', active: true }
];

let USERS = [...DEFAULT_USERS];
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
        }
        if (tileAdmin) {
            tileAdmin.style.display = currentUser.permissions.modifAccounts ? 'block' : 'none';
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
    loadUsers();
    loadVendeurs();
    loadSalesEmails();
    loadKitEmails();
    loadNotesEmails();
    renderPermTable();
    loadAllowedTypes();
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
        var role = ROLES[roleKey];
        var tr = document.createElement('tr');
        var tdName = document.createElement('td');
        tdName.innerHTML = '<strong>' + role.label + '</strong>';
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
                    showToast('Permission modifiee');
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
        body: JSON.stringify({ action: 'save', key: 'roles_permissions', value: JSON.stringify(ROLES), pin: '1400' })
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
}

// ---- WELCOME OVERLAY ----
function showWelcome(name, role) {
    var roleLabel = '';
    if (currentUser && ROLES[currentUser.role]) roleLabel = ROLES[currentUser.role].label;

    var overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML =
        '<div class="welcome-line"></div>' +
        '<div class="welcome-text">Bienvenue</div>' +
        '<div class="welcome-name">' + name + '</div>' +
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
function showChangePasswordModal(user) {
    var existing = document.getElementById('change-pwd-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'change-pwd-modal';
    modal.className = 'login-modal';
    modal.style.display = 'flex';
    modal.innerHTML =
        '<div class="login-modal-content" style="max-width:380px;">' +
        '<h3>Changement de mot de passe requis</h3>' +
        '<p style="color:#999;font-size:0.8rem;margin-bottom:1rem;">Bienvenue <strong style="color:#00CC66;">' + user.name + '</strong> ! Veuillez choisir un nouveau mot de passe.</p>' +
        '<input type="password" id="change-pwd-new" class="login-input" placeholder="Nouveau mot de passe" autocomplete="new-password">' +
        '<input type="password" id="change-pwd-confirm" class="login-input" placeholder="Confirmer le mot de passe" autocomplete="new-password">' +
        '<button type="button" id="change-pwd-submit" class="login-submit">Enregistrer</button>' +
        '<p id="change-pwd-error" class="login-error" style="display:none;"></p>' +
        '</div>';

    document.body.appendChild(modal);

    document.getElementById('change-pwd-submit').addEventListener('click', function() {
        var newPwd = document.getElementById('change-pwd-new').value.trim();
        var confirmPwd = document.getElementById('change-pwd-confirm').value.trim();
        var errorEl = document.getElementById('change-pwd-error');

        if (!newPwd || newPwd.length < 4) {
            errorEl.textContent = 'Le mot de passe doit contenir au moins 4 caracteres.';
            errorEl.style.display = 'block';
            return;
        }
        if (newPwd === '0000') {
            errorEl.textContent = 'Veuillez choisir un mot de passe different de 0000.';
            errorEl.style.display = 'block';
            return;
        }
        if (newPwd !== confirmPwd) {
            errorEl.textContent = 'Les mots de passe ne correspondent pas.';
            errorEl.style.display = 'block';
            return;
        }

        // Update password in USERS array and remove mustChangePassword flag
        var idx = USERS.findIndex(function(u) { return u.username === user.username; });
        if (idx !== -1) {
            USERS[idx].password = newPwd;
            delete USERS[idx].mustChangePassword;
            saveUsers();
        }

        modal.remove();

        // Complete login
        currentUser = { username: user.username, name: user.name, role: user.role, permissions: getUserPermissions(user.role) };
        localStorage.setItem('portal_user', JSON.stringify(currentUser));
        showWelcome(user.name, getUserPermissions(user.role).label || user.role);
    });

    document.getElementById('change-pwd-confirm').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('change-pwd-submit').click(); }
    });

    document.getElementById('change-pwd-new').focus();
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
        'Adresse du portail : https://etraksolutions.github.io/portal-machine/\n' +
        'Courriel : ' + email + '\n' +
        'Mot de passe temporaire : ' + password + '\n\n' +
        'IMPORTANT : Vous devrez changer votre mot de passe lors de votre premi\u00e8re connexion.\n\n' +
        'Votre r\u00f4le : ' + roleLabel + '\n\n' +
        'Portail e-Trak \u2014 e-Trak Technology Solutions';

    var subjectEn = 'e-Trak Portal \u2014 Your account has been created';
    var bodyEn = 'Hello ' + name + ',\n\n' +
        'An account has been created for you on the e-Trak Portal.\n\n' +
        'Here are your login credentials:\n\n' +
        'Portal address: https://etraksolutions.github.io/portal-machine/\n' +
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
                '<div><span style="color:#888;">' + (isFr ? 'Nom' : 'Name') + '&nbsp;&nbsp;</span><strong>' + name + '</strong></div>' +
                '<div><span style="color:#888;">' + (isFr ? 'Courriel' : 'Email') + '&nbsp;&nbsp;</span><strong>' + email + '</strong></div>' +
                '<div><span style="color:#888;">' + (isFr ? 'Mot de passe' : 'Password') + '&nbsp;&nbsp;</span><strong style="color:#f90;">' + password + '</strong> <span style="color:#555;font-size:0.75rem;">(' + (isFr ? 'temporaire' : 'temporary') + ')</span></div>' +
                '<div><span style="color:#888;">' + (isFr ? 'R\u00f4le' : 'Role') + '&nbsp;&nbsp;</span><strong>' + roleLabel + '</strong></div>' +
                '<div><span style="color:#888;">Portal&nbsp;&nbsp;</span><a href="https://etraksolutions.github.io/portal-machine/" target="_blank" style="color:#4ea8de;">etraksolutions.github.io/portal-machine</a></div>' +
            '</div>' +
            '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">' +
                '<a id="cred-mailto-btn" href="' + (isFr ? mailtoUrlFr : mailtoUrlEn) + '" style="flex:1;min-width:140px;background:#0d6efd;color:#fff;text-align:center;padding:10px 14px;border-radius:8px;text-decoration:none;font-size:0.88rem;font-weight:600;">\uD83D\uDCE7 ' + (isFr ? 'Ouvrir dans mon courriel' : 'Open in my email') + '</a>' +
                '<button id="cred-copy-btn" style="flex:1;min-width:120px;background:#333;color:#fff;border:none;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:0.88rem;font-weight:600;">\uD83D\uDCCB ' + (isFr ? 'Copier' : 'Copy') + '</button>' +
                '<button id="cred-close-btn" style="flex:1;min-width:80px;background:#222;color:#aaa;border:1px solid #444;padding:10px 14px;border-radius:8px;cursor:pointer;font-size:0.88rem;">' + (isFr ? 'Fermer' : 'Close') + '</button>' +
            '</div>';

        var copyText = isFr
            ? 'Portail e-Trak \u2014 Vos informations de connexion\n\nPortail : https://etraksolutions.github.io/portal-machine/\nCourriel : ' + email + '\nMot de passe temporaire : ' + password + '\nR\u00f4le : ' + roleLabel + '\n\nVous devrez changer votre mot de passe \u00e0 la premi\u00e8re connexion.'
            : 'e-Trak Portal \u2014 Your login credentials\n\nPortal: https://etraksolutions.github.io/portal-machine/\nEmail: ' + email + '\nTemporary password: ' + password + '\nRole: ' + roleLabel + '\n\nYou will need to change your password on first login.';

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
        body: JSON.stringify({ action: 'save', key: 'target_emails', value: JSON.stringify(targetEmails), pin: '1400' })
    }).catch(function() {});
}

function renderEmails() {
    var list = document.getElementById('admin-email-list');
    if (!list) return;
    list.innerHTML = '';
    targetEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + email + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            targetEmails.splice(idx, 1);
            saveEmails();
            renderEmails();
            showToast('Courriel supprime');
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
        body: JSON.stringify({ action: 'save', key: 'sales_emails', value: JSON.stringify(salesEmails), pin: '1400' })
    }).catch(function() {});
}

function renderSalesEmails() {
    var list = document.getElementById('admin-sales-email-list');
    if (!list) return;
    list.innerHTML = '';
    salesEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + email + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            salesEmails.splice(idx, 1);
            saveSalesEmails();
            renderSalesEmails();
            showToast('Courriel vente supprime');
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
        body: JSON.stringify({ action: 'save', key: 'kit_emails', value: JSON.stringify(kitEmails), pin: '1400' })
    }).catch(function() {});
}

function renderKitEmails() {
    var list = document.getElementById('admin-kit-email-list');
    if (!list) return;
    list.innerHTML = '';
    kitEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + email + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            kitEmails.splice(idx, 1);
            saveKitEmails();
            renderKitEmails();
            showToast('Courriel kit supprime');
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
        body: JSON.stringify({ action: 'save', key: 'vendeurs_list', value: JSON.stringify(vendeurs), pin: '1400' })
    }).catch(function() {});
}

function renderVendeurs() {
    var list = document.getElementById('admin-vendeurs-list');
    if (!list) return;
    list.innerHTML = '';
    vendeurs.forEach(function(v, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span><strong>' + v.name + '</strong> &mdash; ' + v.email + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            vendeurs.splice(idx, 1);
            saveVendeurs();
            renderVendeurs();
            showToast('Vendeur supprime');
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
        body: JSON.stringify({ action: 'save', key: 'notes_emails', value: JSON.stringify(notesEmails), pin: '1400' })
    }).catch(function() {});
}

function renderNotesEmails() {
    var list = document.getElementById('admin-notes-email-list');
    if (!list) return;
    list.innerHTML = '';
    notesEmails.forEach(function(email, i) {
        var item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = '<span>' + email + '</span><button class="admin-delete-btn" data-idx="' + i + '">\u2715 Supprimer</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            notesEmails.splice(idx, 1);
            saveNotesEmails();
            renderNotesEmails();
            showToast('Courriel notes supprime');
        });
    });
}

// ---- USERS ----
function loadUsers() {
    fetch(API_URL + '?action=get&key=authorized_users_v2')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try {
                    var saved = JSON.parse(data.value);
                    if (Array.isArray(saved) && saved.length > 0) {
                        USERS = saved;
                    }
                } catch(e) {}
            }
            renderUsers();
        })
        .catch(function() { renderUsers(); });
}

function saveUsers() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'authorized_users_v2', value: JSON.stringify(USERS), pin: '1400' })
    }).catch(function() {});
}

function renderUsers() {
    var tbody = document.getElementById('admin-user-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    var SUPER_ADMIN = 'robin@gryb.ca';
    USERS.forEach(function(user, i) {
        var roleLabel = ROLES[user.role] ? ROLES[user.role].label : user.role;
        var isSuperAdmin = user.email && user.email.toLowerCase() === SUPER_ADMIN;
        var tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.dataset.idx = i;
        tr.innerHTML =
            '<td><strong>' + user.name + '</strong>' + (isSuperAdmin ? ' <span style="color:#FFD700;font-size:0.65rem;">&#9733; SUPER</span>' : '') + '</td>' +
            '<td>' + (user.email || '<span style="color:#555;">\u2014</span>') + '</td>' +
            '<td><span class="role-badge role-' + user.role + '">' + roleLabel + '</span></td>' +
            '<td>' + (!isSuperAdmin && currentUser && currentUser.permissions && currentUser.permissions.modifAccounts ? '<button class="admin-delete-btn" data-idx="' + i + '">\u2715</button>' : '') + '</td>';
        tbody.appendChild(tr);
    });
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
                alert('Impossible de supprimer le super administrateur.');
                return;
            }
            var userName = user.name;
            if (!confirm('Supprimer l\'utilisateur "' + userName + '" ?')) return;
            USERS.splice(idx, 1);
            saveUsers();
            renderUsers();
            showToast('Utilisateur "' + userName + '" supprime');
        });
    });
}

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
        roleOptions += '<option value="' + key + '"' + (user.role === key ? ' selected' : '') + '>' + ROLES[key].label + '</option>';
    });

    var modal = document.createElement('div');
    modal.id = 'edit-user-modal';
    modal.className = 'login-modal';
    modal.style.display = 'flex';
    modal.innerHTML =
        '<div class="login-modal-content" style="max-width:420px;">' +
        '<button class="login-close" id="edit-user-close">&times;</button>' +
        '<h3>Modifier l\'utilisateur</h3>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">Nom complet</label>' +
        '<input type="text" id="edit-user-name" class="login-input" value="' + (user.name || '') + '"></div>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">Adresse courriel (identifiant de connexion)</label>' +
        '<input type="email" id="edit-user-email" class="login-input" value="' + (user.email || '') + '"' + (isSuperAdmin ? ' readonly style="opacity:0.5;"' : '') + '></div>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">Mot de passe</label>' +
        '<input type="text" id="edit-user-password" class="login-input" value="' + (user.password || '') + '"></div>' +
        '<div class="admin-form-group" style="margin-bottom:0.75rem;"><label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">Role</label>' +
        '<select id="edit-user-role" class="login-input"' + (isSuperAdmin ? ' disabled style="opacity:0.5;"' : '') + '>' + roleOptions + '</select></div>' +
        '<button type="button" id="edit-user-save" class="login-submit">Enregistrer</button>' +
        '<button type="button" id="edit-user-resend" style="width:100%;margin-top:8px;background:transparent;border:1px solid #444;color:#aaa;padding:10px;border-radius:8px;cursor:pointer;font-size:0.88rem;">📧 Renvoyer les informations de connexion</button>' +
        '</div>';

    document.body.appendChild(modal);

    // Close
    document.getElementById('edit-user-close').addEventListener('click', function() { modal.remove(); });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

    // Save
    document.getElementById('edit-user-save').addEventListener('click', function() {
        var newName = document.getElementById('edit-user-name').value.trim();
        var newEmail = document.getElementById('edit-user-email').value.trim();
        var newPassword = document.getElementById('edit-user-password').value.trim();
        var newRole = document.getElementById('edit-user-role').value;

        if (!newName || !newEmail || !newPassword) {
            alert('Nom, courriel et mot de passe sont obligatoires.');
            return;
        }

        USERS[idx].name = newName;
        if (!isSuperAdmin) {
            USERS[idx].email = newEmail.toLowerCase();
            USERS[idx].username = newEmail.toLowerCase();
            USERS[idx].role = newRole;
        }
        USERS[idx].password = newPassword;

        saveUsers();
        renderUsers();
        modal.remove();
        showToast('Utilisateur "' + newName + '" modifie');
    });

    // Resend credentials
    document.getElementById('edit-user-resend').addEventListener('click', function() {
        var currentName = document.getElementById('edit-user-name').value.trim() || user.name;
        var currentEmail = document.getElementById('edit-user-email').value.trim() || user.email;
        var currentPassword = document.getElementById('edit-user-password').value.trim() || user.password;
        var currentRole = document.getElementById('edit-user-role').value;
        var roleLabel = ROLES[currentRole] ? ROLES[currentRole].label : currentRole;
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

    // Load users for login validation
    fetch(API_URL + '?action=get&key=authorized_users_v2')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try {
                    var s = JSON.parse(data.value);
                    if (Array.isArray(s) && s.length > 0) USERS = s;
                } catch(e) {}
            }
        })
        .catch(function() {});

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
            var user = USERS.find(function(u) {
                var matchUser = u.username.toLowerCase() === username;
                var matchEmail = u.email && u.email.toLowerCase() === username;
                return (matchUser || matchEmail) && u.password === password && u.active !== false;
            });
            if (user) {
                if (user.mustChangePassword) {
                    // Show change password modal
                    loginModal.style.display = 'none';
                    showChangePasswordModal(user);
                } else {
                    currentUser = { username: user.username, name: user.name, role: user.role, permissions: getUserPermissions(user.role) };
                    localStorage.setItem('portal_user', JSON.stringify(currentUser));
                    loginModal.style.display = 'none';
                    showWelcome(user.name, getUserPermissions(user.role).label || user.role);
                }
            } else {
                loginError.textContent = (typeof i18n !== 'undefined') ? i18n.t('hub.login_error') : 'Utilisateur ou mot de passe invalide';
                loginError.style.display = 'block';
            }
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
                '<div class="welcome-text">Au revoir</div>' +
                '<div class="welcome-name">' + userName + '</div>' +
                '<div class="welcome-line"></div>';
            var mainEl = document.querySelector('main.admin-main');
            if (mainEl) { mainEl.style.position = 'relative'; mainEl.appendChild(overlay); }
            else document.body.appendChild(overlay);
            requestAnimationFrame(function() { overlay.classList.add('welcome-visible'); });

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
                showToast('Vendeur "' + name + '" ajoute');
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
                showToast('Courriel ajoute');
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
                showToast('Courriel vente ajoute');
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
                showToast('Courriel kit ajoute');
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
                showToast('Courriel notes ajoute');
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
                vendeurSel.innerHTML = '<option value="">-- Aucun --</option>';
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
                if (errorEl) { errorEl.textContent = 'Veuillez remplir le nom et une adresse courriel valide.'; errorEl.style.display = 'block'; }
                return;
            }
            var exists = USERS.find(function(u) { return (u.email && u.email.toLowerCase() === email.toLowerCase()) || u.username.toLowerCase() === email.toLowerCase(); });
            if (exists) {
                if (errorEl) { errorEl.textContent = 'Cette adresse courriel existe deja.'; errorEl.style.display = 'block'; }
                return;
            }
            var newUser = { username: email.toLowerCase(), email: email.toLowerCase(), password: '0000', role: role, name: name, active: true, mustChangePassword: true };
            if (vendeurEmail) newUser.vendeurEmail = vendeurEmail;
            USERS.push(newUser);
            saveUsers();
            renderUsers();

            // Show credentials popup + mailto button
            var roleLabel = ROLES[role] ? ROLES[role].label : role;
            showCredentialsPopup(name, email, '0000', roleLabel);

            document.getElementById('admin-new-name').value = '';
            document.getElementById('admin-new-email').value = '';
            showToast('Utilisateur "' + name + '" ajoute avec succes');
        };
    }

    // HAMBURGER MENU
    var hamburgerBtn = document.getElementById('hamburger-btn');
    var hamburgerMenu = document.getElementById('hamburger-menu');
    if (hamburgerBtn && hamburgerMenu) {
        hamburgerBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            hamburgerBtn.classList.toggle('active');
            hamburgerMenu.classList.toggle('open');
        });
        document.addEventListener('click', function(e) {
            if (!hamburgerMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
                hamburgerBtn.classList.remove('active');
                hamburgerMenu.classList.remove('open');
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
                alert('Veuillez entrer une adresse courriel valide.');
                return;
            }
            var subject = 'Portail e-Trak — Acces au portail';
            var body = 'Bonjour,\n\nVous avez ete invite a acceder au Portail e-Trak.\nCliquez sur le lien ci-dessous :\n\nhttps://etraksolutions.github.io/portal-machine/?guest=1\n\nCe lien vous donne un acces temporaire (1 heure) en tant qu\'invite.\nPour un acces permanent, demandez la creation d\'un compte.\n\nPortail e-Trak — e-Trak Technology Solutions';
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
    'Grue Mobile', 'Pompe a Beton', 'Retrocaveuse', 'Telehandler'
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
        label.appendChild(document.createTextNode(type));
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
            body: JSON.stringify({ action: 'save', key: 'soumission_allowed_types', value: JSON.stringify(checked), pin: '1400' })
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