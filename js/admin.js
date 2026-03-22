// ============================================
// e-Trak Portal — HUB + Admin Logic v2
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';

const ROLES = {
    administrateur: { modifBom: true, createAccount: true, modifAccounts: true, shareAccess: true, machineAccess: true, soumissionAccess: true, label: 'Administrateur' },
    vendeur_etrak:  { modifBom: false, createAccount: false, modifAccounts: false, shareAccess: true, machineAccess: true, soumissionAccess: true, label: 'Vendeur e-Trak' },
    distributeur:   { modifBom: false, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: false, soumissionAccess: true, label: 'Distributeur' },
    dealer:         { modifBom: false, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: false, soumissionAccess: true, label: 'Dealer' },
    technicien:     { modifBom: true, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: true, soumissionAccess: false, label: 'Technicien' },
    vente_interne:  { modifBom: false, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: true, soumissionAccess: true, label: 'Vente interne' },
    ingenierie:     { modifBom: true, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: true, soumissionAccess: false, label: 'Ingenierie' }
};

const DEFAULT_USERS = [
    { username: 'administrateur', email: 'robin@gryb.ca', password: '1400', role: 'administrateur', name: 'Robin Gagnon', active: true },
    { username: 'distributeur', email: '', password: 'Dist2024!', role: 'distributeur', name: 'Distributeur', active: true },
    { username: 'dealer', email: '', password: 'Deal2024!', role: 'dealer', name: 'Dealer', active: true },
    { username: 'technicien', email: 'k.berube@e-trak.ca', password: 'Tech2024!', role: 'technicien', name: 'Kevin Berube', active: true },
    { username: 'vente.interne', email: '', password: 'Vente2024!', role: 'vente_interne', name: 'Vente interne', active: true },
    { username: 'ingenierie', email: '', password: 'Ing2024!', role: 'ingenierie', name: 'Ingenierie', active: true }
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
        if (userName) userName.textContent = '\u2713 ' + currentUser.name;
        if (userRole) userRole.textContent = ROLES[currentUser.role] ? ROLES[currentUser.role].label : currentUser.role;
        if (hubNav) hubNav.style.display = 'grid';
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
        if (tileAdmin) {
            tileAdmin.style.display = currentUser.permissions.modifAccounts ? 'block' : 'none';
        }
        // Show hamburger (QR + share) only for super admin, admin, vendeur e-Trak
        if (hamburgerWrap) {
            hamburgerWrap.style.display = currentUser.permissions.shareAccess ? '' : 'none';
        }
    } else {
        if (loginBtn) loginBtn.style.display = '';
        if (userBar) userBar.style.display = 'none';
        if (hubNav) hubNav.style.display = 'none';
        if (hubEmpty) hubEmpty.style.display = 'block';
        if (hamburgerWrap) hamburgerWrap.style.display = 'none';
    }
}

function showAdminSection() {
    document.getElementById('hub-nav').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    document.querySelector('.admin-hero').style.display = 'none';
    loadEmails();
    loadSalesEmails();
    loadUsers();
    // renderAccountsByRole is called after loadUsers completes
}

function hideAdminSection() {
    document.getElementById('hub-nav').style.display = 'grid';
    document.getElementById('admin-content').style.display = 'none';
    document.querySelector('.admin-hero').style.display = 'block';
}

// ---- WELCOME SCREEN ----
function showWelcome(name, role) {
    var roleLabel = '';
    if (currentUser && ROLES[currentUser.role]) roleLabel = ROLES[currentUser.role].label;

    var overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML =
        '<div class="welcome-content">' +
        '<div class="welcome-logo"><img src="assets/logo-white.png" alt="e-Trak"></div>' +
        '<h1 class="welcome-name">Bienvenue, ' + name + '</h1>' +
        '<span class="welcome-role">' + roleLabel + '</span>' +
        '</div>';
    document.body.appendChild(overlay);

    // Trigger fade in
    requestAnimationFrame(function() {
        overlay.classList.add('welcome-visible');
    });

    // Fade out after 1s, then remove and show hub
    setTimeout(function() {
        overlay.classList.remove('welcome-visible');
        overlay.classList.add('welcome-fadeout');
        setTimeout(function() {
            overlay.remove();
            updateHubUI();
        }, 1000);
    }, 1000);
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
        tr.innerHTML =
            '<td><strong>' + user.name + '</strong>' + (isSuperAdmin ? ' <span style="color:#FFD700;font-size:0.65rem;">&#9733; SUPER ADMIN</span>' : '') + '</td>' +
            '<td>' + user.username + '</td>' +
            '<td><span class="role-badge role-' + user.role + '">' + roleLabel + '</span></td>' +
            '<td class="' + (user.active !== false ? 'admin-active-yes' : 'admin-active-no') + '">' + (user.active !== false ? '\u2713 Oui' : '\u2717 Non') + '</td>' +
            '<td>' + (isSuperAdmin ? '' : '<button class="admin-delete-btn" data-idx="' + i + '">\u2715</button>') + '</td>';
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.admin-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
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
    renderAccountsByRole();
}

// ---- ACCOUNTS BY ROLE ----
function renderAccountsByRole() {
    var container = document.getElementById('admin-accounts-by-role');
    if (!container) return;
    container.innerHTML = '';

    // Group users by role
    var roleOrder = ['administrateur', 'technicien', 'ingenierie', 'distributeur', 'dealer', 'vente_interne'];
    var grouped = {};
    roleOrder.forEach(function(r) { grouped[r] = []; });
    USERS.forEach(function(user) {
        var role = user.role || 'autre';
        if (!grouped[role]) grouped[role] = [];
        grouped[role].push(user);
    });

    var SUPER_ADMIN = 'robin@gryb.ca';

    roleOrder.forEach(function(role) {
        var users = grouped[role];
        if (users.length === 0) return;
        var roleLabel = ROLES[role] ? ROLES[role].label : role;

        var section = document.createElement('div');
        section.className = 'accounts-role-group';
        var html = '<h4 class="accounts-role-title"><span class="role-badge role-' + role + '">' + roleLabel + '</span> <span class="accounts-count">' + users.length + ' compte' + (users.length > 1 ? 's' : '') + '</span></h4>';
        html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Nom</th><th>Courriel</th><th>Utilisateur</th><th>Mot de passe</th></tr></thead><tbody>';
        users.forEach(function(u) {
            var isSuperAdmin = u.email && u.email.toLowerCase() === SUPER_ADMIN;
            html += '<tr>' +
                '<td><strong>' + u.name + '</strong>' + (isSuperAdmin ? ' <span style="color:#FFD700;font-size:0.65rem;">\u2733 SUPER</span>' : '') + '</td>' +
                '<td>' + (u.email || '<span style="color:#555;">—</span>') + '</td>' +
                '<td>' + u.username + '</td>' +
                '<td><code class="pwd-hidden" onclick="this.classList.toggle(\'pwd-visible\')" title="Cliquer pour afficher">\u2022\u2022\u2022\u2022<span class="pwd-text">' + u.password + '</span></code></td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';
        section.innerHTML = html;
        container.appendChild(section);
    });
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', function() {
    // Restore session
    var saved = localStorage.getItem('portal_user');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            if (parsed && parsed.username) {
                currentUser = parsed;
                currentUser.permissions = getUserPermissions(currentUser.role);
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
                currentUser = { username: user.username, name: user.name, role: user.role, permissions: getUserPermissions(user.role) };
                localStorage.setItem('portal_user', JSON.stringify(currentUser));
                loginModal.style.display = 'none';
                showWelcome(user.name, getUserPermissions(user.role).label || user.role);
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
            currentUser = null;
            localStorage.removeItem('portal_user');
            hideAdminSection();
            updateHubUI();
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

    // ADD EMAIL
    var addEmailBtn = document.getElementById('admin-add-email-btn');
    if (addEmailBtn) {
        addEmailBtn.addEventListener('click', function() {
            var input = document.getElementById('admin-add-email');
            var email = input.value.trim();
            if (email && email.includes('@')) {
                targetEmails.push(email);
                saveEmails();
                renderEmails();
                input.value = '';
                showToast('Courriel ajoute');
            }
        });
    }

    // ADD SALES EMAIL
    var addSalesEmailBtn = document.getElementById('admin-add-sales-email-btn');
    if (addSalesEmailBtn) {
        addSalesEmailBtn.addEventListener('click', function() {
            var input = document.getElementById('admin-add-sales-email');
            var email = input.value.trim();
            if (email && email.includes('@')) {
                salesEmails.push(email);
                saveSalesEmails();
                renderSalesEmails();
                input.value = '';
                showToast('Courriel vente ajoute');
            }
        });
    }

    // ADD USER
    var addUserBtn = document.getElementById('admin-add-user-btn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function() {
            var name = document.getElementById('admin-new-name').value.trim();
            var username = document.getElementById('admin-new-username').value.trim();
            var password = document.getElementById('admin-new-password').value.trim();
            var role = document.getElementById('admin-new-role').value;
            if (!name || !username || !password) {
                alert('Veuillez remplir tous les champs.');
                return;
            }
            var exists = USERS.find(function(u) { return u.username.toLowerCase() === username.toLowerCase(); });
            if (exists) {
                alert('Ce nom d\'utilisateur existe deja.');
                return;
            }
            USERS.push({ username: username.toLowerCase(), password: password, role: role, name: name, active: true });
            saveUsers();
            renderUsers();
            document.getElementById('admin-new-name').value = '';
            document.getElementById('admin-new-username').value = '';
            document.getElementById('admin-new-password').value = '';
            showToast('Utilisateur "' + name + '" ajoute');
        });
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
            var body = 'Bonjour,\n\nVoici le lien pour acceder au Portail e-Trak :\n\nhttps://etraksolutions.github.io/portal-machine/\n\nPortail e-Trak — e-Trak Technology Solutions';
            window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
            emailInput.value = '';
        });
    }
});