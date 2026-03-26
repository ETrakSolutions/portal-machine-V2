// ============================================
// e-Trak Portal — HUB + Admin Logic v2
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';

const ROLES = {
    super_admin:    { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, label: 'Super Admin' },
    administrateur: { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, label: 'Administrateur' },
    vente_interne:  { createAccount: true, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, label: 'Vente interne' },
    technicien:     { createAccount: false, modifBom: false, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: false, label: 'Technicien' },
    distributeur:   { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, label: 'Distributeur' },
    dealer:         { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, label: 'Dealer' },
    ingenierie:     { createAccount: false, modifBom: true, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: true, label: 'Ingenierie' }
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
                userName.textContent = '\u23f0 Invite (' + mins + ' min restantes)';
                userName.style.color = '#FF8C00';
            } else {
                userName.textContent = '\u2713 ' + currentUser.name;
                userName.style.color = '';
            }
        }
        if (userRole) userRole.textContent = ROLES[currentUser.role] ? ROLES[currentUser.role].label : currentUser.role;
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
var PERM_KEYS = ['createAccount', 'modifBom', 'kitMachineAccess', 'soumissionAccess', 'shareAccess', 'writeNotes'];
var PERM_LABELS = {'createAccount':'Acces Admin','modifBom':'Acces BD','kitMachineAccess':'Kit machine','soumissionAccess':'Soumission','shareAccess':'Partage QR','writeNotes':'Notes'};

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
                loginError.textContent = 'Utilisateur ou mot de passe invalide';
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

            // Send welcome email with credentials
            var roleLabel = ROLES[role] ? ROLES[role].label : role;
            var subject = 'Portail e-Trak — Votre compte a ete cree';
            var body = 'Bonjour ' + name + ',\n\n' +
                'Un compte a ete cree pour vous sur le Portail e-Trak.\n\n' +
                'Voici vos informations de connexion :\n\n' +
                'Adresse du portail : https://etraksolutions.github.io/portal-machine/\n' +
                'Courriel : ' + email + '\n' +
                'Mot de passe temporaire : 0000\n\n' +
                'IMPORTANT : Vous devrez changer votre mot de passe lors de votre premiere connexion.\n\n' +
                'Votre role : ' + roleLabel + '\n\n' +
                'Portail e-Trak — e-Trak Technology Solutions';
            window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);

            document.getElementById('admin-new-name').value = '';
            document.getElementById('admin-new-email').value = '';
            showToast('Utilisateur "' + name + '" ajoute — courriel de bienvenue ouvert');
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

    fetch(API_URL + '?action=get&key=soumission_allowed_types')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var allowed = [];
            if (data.value) { try { allowed = JSON.parse(data.value); } catch(e) {} }
            renderTypeCheckboxes(container, allowed);
        })
        .catch(function() { renderTypeCheckboxes(container, []); });
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
        saveTypesBtn.textContent = 'Sauvegarde...';
        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: 'pin=' + PIN + '&key=soumission_allowed_types&value=' + encodeURIComponent(JSON.stringify(checked))
        }).then(function() {
            saveTypesBtn.textContent = '✓ Sauvegarde!';
            setTimeout(function() { saveTypesBtn.textContent = 'Sauvegarder'; }, 2000);
        }).catch(function() {
            saveTypesBtn.textContent = 'Erreur!';
            setTimeout(function() { saveTypesBtn.textContent = 'Sauvegarder'; }, 2000);
        });
    });
}