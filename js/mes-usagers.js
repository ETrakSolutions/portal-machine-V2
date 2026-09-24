// =====================================================================
// MES UTILISATEURS — ajout delegue de comptes Dealer / Distributeur
// Pour les roles non admin qui ont la permission « Ajout usagers » (addUsers),
// ex. Vente externe. Le serveur applique toutes les regles (actions adduser,
// listmyusers, updatemyuser) : roles Dealer / Distributeur seulement, gestion
// limitee a ses clients (crees par lui OU dont il est le vendeur associe),
// vendeur pris dans la liste. La liste montre TOUS les Dealers / Distributeurs
// (consultation) ; seuls ses clients (u.mine) s'ouvrent en modification.
// Decision Steve, 2026-09-24.
// Depend de admin.js : API_URL, portalToken, escHtml, showCredentialsPopup,
// showToast, i18n.
// =====================================================================
var MU_ROLES = ['dealer', 'distributeur'];
var muUsers = [];
var muVendeurs = [];

function muPost(payload) {
    payload.token = portalToken();
    return fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
}

// Message lisible pour les refus du serveur
function muErreur(code) {
    var map = {
        'permission denied': 'mu.err_permission',
        'role not allowed': 'mu.err_role',
        'user exists': 'mu.err_exists',
        'unknown vendeur': 'mu.err_vendeur',
        'name and valid email required': 'mu.err_name_email',
        'name required': 'mu.err_name_email',
        'not your user': 'mu.err_not_yours'
    };
    return i18n.t(map[code] || 'mu.err_generic');
}

function muOptionsRoles(sel) {
    return MU_ROLES.map(function(r) {
        return '<option value="' + r + '"' + (r === sel ? ' selected' : '') + '>' + escHtml(i18n.t('role.' + r)) + '</option>';
    }).join('');
}

function muOptionsVendeurs(sel) {
    var s = (sel || '').toLowerCase();
    return '<option value="">' + escHtml(i18n.t('admin.vendeur_none')) + '</option>' + muVendeurs.map(function(v) {
        var e = String(v.email || '').toLowerCase();
        return '<option value="' + escHtml(e) + '"' + (e === s ? ' selected' : '') + '>' + escHtml(v.name) + ' (' + escHtml(e) + ')</option>';
    }).join('');
}

function muNomVendeur(email) {
    var e = String(email || '').toLowerCase();
    for (var i = 0; i < muVendeurs.length; i++) {
        if (String(muVendeurs[i].email || '').toLowerCase() === e) return muVendeurs[i].name;
    }
    return e;
}

function showMesUsagersSection() {
    document.getElementById('hub-nav').style.display = 'none';
    document.getElementById('admin-content').style.display = 'none';
    document.getElementById('mes-usagers-content').style.display = 'block';
    document.querySelector('.admin-hero').style.display = 'none';
    var hb = document.getElementById('admin-header-back');
    if (hb) {
        hb.style.display = '';
        hb.onclick = function(e) { e.preventDefault(); showHubSection(); };
    }
    var err = document.getElementById('mu-add-error'); if (err) err.style.display = 'none';
    var filtre = document.getElementById('mu-filter'); if (filtre) filtre.value = '';
    fetch(API_URL + '?action=get&key=vendeurs_list')
        .then(function(r) { return r.json(); })
        .then(function(d) { try { muVendeurs = JSON.parse(d.value || '[]'); } catch (e) { muVendeurs = []; } })
        .catch(function() { muVendeurs = []; })
        .then(function() {
            document.getElementById('mu-new-role').innerHTML = muOptionsRoles('dealer');
            document.getElementById('mu-new-vendeur').innerHTML = muOptionsVendeurs('');
            muCharger();
        });
}

function muCharger() {
    var tbody = document.getElementById('mu-tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#8aa;text-align:center">…</td></tr>';
    muPost({ action: 'listmyusers' })
        .then(function(d) {
            if (!Array.isArray(d.users)) { tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#E07B00;text-align:center">' + escHtml(muErreur(d.error)) + '</td></tr>'; return; }
            muUsers = d.users.sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }); });
            muRendre();
        })
        .catch(function() { tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#E07B00;text-align:center">' + escHtml(i18n.t('mu.err_generic')) + '</td></tr>'; });
}

// Filtre texte (nom, courriel, role, vendeur, statut) — jamais memorise, vide a chaque ouverture
function muNormaliser(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function muRendre() {
    var tbody = document.getElementById('mu-tbody');
    var compte = document.getElementById('mu-count');
    var fEl = document.getElementById('mu-filter');
    var q = muNormaliser(fEl ? fEl.value : '');
    if (!muUsers.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#8aa;text-align:center">' + escHtml(i18n.t('mu.none')) + '</td></tr>';
        if (compte) compte.textContent = '';
        return;
    }
    tbody.innerHTML = '';
    var montres = 0;
    muUsers.forEach(function(u, i) {
        var actif = u.active !== false;
        if (q) {
            var hay = muNormaliser([u.name, u.email, i18n.t('role.' + u.role), u.role,
                u.vendeurEmail, u.vendeurEmail ? muNomVendeur(u.vendeurEmail) : '',
                actif ? i18n.t('mu.active') : i18n.t('mu.inactive')].join(' '));
            if (hay.indexOf(q) === -1) return;
        }
        montres++;
        var tr = document.createElement('tr');
        tr.dataset.idx = i;
        // Seuls ses clients (crees par lui ou vendeur associe) sont modifiables ; le serveur le verifie aussi
        if (u.mine) tr.style.cursor = 'pointer';
        else { tr.title = i18n.t('mu.readonly_title'); tr.style.opacity = '0.85'; }
        tr.innerHTML =
            '<td><strong>' + escHtml(u.name) + '</strong>' +
                (u.mine ? ' <span style="font-size:0.62rem;font-weight:700;color:#8fb4e0;background:rgba(20,80,144,0.25);padding:1px 6px;border-radius:4px;margin-left:4px;vertical-align:middle">' + escHtml(i18n.t('mu.mine_tag')) + '</span>' : '') +
            '</td>' +
            '<td>' + escHtml(u.email || '') + '</td>' +
            '<td><span class="role-badge role-' + escHtml(u.role) + '">' + escHtml(i18n.t('role.' + u.role)) + '</span></td>' +
            '<td>' + (u.vendeurEmail ? escHtml(muNomVendeur(u.vendeurEmail)) : '<span style="color:#555">—</span>') + '</td>' +
            '<td>' + (actif ? '<span class="admin-active-yes">' + escHtml(i18n.t('mu.active')) + '</span>' : '<span class="admin-active-no">' + escHtml(i18n.t('mu.inactive')) + '</span>') + '</td>';
        if (u.mine) tr.addEventListener('click', function() { muOuvrirEdition(parseInt(this.dataset.idx, 10)); });
        tbody.appendChild(tr);
    });
    if (q && montres === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#E07B00;text-align:center">' + escHtml(i18n.t('mu.filter_empty')) + '</td></tr>';
    }
    if (compte) compte.textContent = i18n.t('mu.count', { n: montres, total: muUsers.length });
}

function muAjouter() {
    var name = document.getElementById('mu-new-name').value.trim();
    var email = document.getElementById('mu-new-email').value.trim();
    var role = document.getElementById('mu-new-role').value;
    var vendeur = document.getElementById('mu-new-vendeur').value;
    var err = document.getElementById('mu-add-error');
    err.style.display = 'none';
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = i18n.t('mu.err_name_email'); err.style.display = 'block'; return; }
    var btn = document.getElementById('mu-add-btn'); btn.disabled = true;
    muPost({ action: 'adduser', name: name, email: email, role: role, vendeurEmail: vendeur })
        .then(function(d) {
            btn.disabled = false;
            if (!d.ok) { err.textContent = muErreur(d.error); err.style.display = 'block'; return; }
            showCredentialsPopup(d.user.name, d.user.email, d.tempPassword, i18n.t('role.' + d.user.role));
            document.getElementById('mu-new-name').value = '';
            document.getElementById('mu-new-email').value = '';
            showToast(i18n.t('admin.user_added', { name: d.user.name }));
            muCharger();
        })
        .catch(function() { btn.disabled = false; err.textContent = i18n.t('mu.err_generic'); err.style.display = 'block'; });
}

function muOuvrirEdition(idx) {
    var u = muUsers[idx]; if (!u) return;
    var old = document.getElementById('mu-edit-modal'); if (old) old.remove();
    var actif = u.active !== false;
    var lab = function(k) { return '<label style="color:#999;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:0.3rem;">' + escHtml(i18n.t(k)) + '</label>'; };
    var m = document.createElement('div');
    m.id = 'mu-edit-modal';
    m.className = 'login-modal';
    m.style.display = 'flex';
    m.innerHTML =
        '<div class="login-modal-content" style="max-width:420px">' +
        '<button class="login-close" id="mu-edit-close">&times;</button>' +
        '<h3>' + escHtml(i18n.t('mu.edit_title')) + '</h3>' +
        '<p style="margin:0 0 12px;color:#8aa;font-size:0.8rem">' + escHtml(u.email || '') + '</p>' +
        '<div style="margin-bottom:0.75rem">' + lab('admin.full_name') + '<input type="text" id="mu-edit-name" class="login-input" value="' + escHtml(u.name) + '"></div>' +
        '<div style="margin-bottom:0.75rem">' + lab('admin.role_label') + '<select id="mu-edit-role" class="login-input">' + muOptionsRoles(u.role) + '</select></div>' +
        '<div style="margin-bottom:0.75rem">' + lab('admin.vendeur_label') + '<select id="mu-edit-vendeur" class="login-input">' + muOptionsVendeurs(u.vendeurEmail) + '</select></div>' +
        '<label style="display:flex;align-items:center;gap:8px;margin:0 0 1rem;color:#ddd;font-size:0.85rem"><input type="checkbox" id="mu-edit-active"' + (actif ? ' checked' : '') + '> ' + escHtml(i18n.t('mu.account_active')) + '</label>' +
        '<p id="mu-edit-error" style="display:none;color:#FF6B6B;font-size:0.8rem;margin:0 0 0.75rem"></p>' +
        '<button type="button" id="mu-edit-save" class="login-submit">' + escHtml(i18n.t('admin.enregistrer')) + '</button>' +
        '<button type="button" id="mu-edit-reset" class="login-submit" style="margin-top:8px;background:transparent;border:1px solid #555;color:#ddd">' + escHtml(i18n.t('mu.reset_password')) + '</button>' +
        '</div>';
    document.body.appendChild(m);
    var fermer = function() { m.remove(); };
    document.getElementById('mu-edit-close').onclick = fermer;
    m.addEventListener('click', function(e) { if (e.target === m) fermer(); });
    var montrerErreur = function(code) { var p = document.getElementById('mu-edit-error'); p.textContent = muErreur(code); p.style.display = 'block'; };
    document.getElementById('mu-edit-save').onclick = function() {
        var n = document.getElementById('mu-edit-name').value.trim();
        if (!n) { montrerErreur('name required'); return; }
        muPost({ action: 'updatemyuser', email: u.email, name: n,
                 role: document.getElementById('mu-edit-role').value,
                 vendeurEmail: document.getElementById('mu-edit-vendeur').value,
                 active: document.getElementById('mu-edit-active').checked })
            .then(function(d) {
                if (!d.ok) { montrerErreur(d.error); return; }
                fermer(); showToast(i18n.t('mu.saved', { name: d.user.name })); muCharger();
            })
            .catch(function() { montrerErreur(''); });
    };
    document.getElementById('mu-edit-reset').onclick = function() {
        if (!confirm(i18n.t('mu.confirm_reset', { name: u.name }))) return;
        muPost({ action: 'updatemyuser', email: u.email, resetPassword: true })
            .then(function(d) {
                if (!d.ok) { montrerErreur(d.error); return; }
                fermer();
                showCredentialsPopup(d.user.name, d.user.email, d.tempPassword, i18n.t('role.' + d.user.role));
                muCharger();
            })
            .catch(function() { montrerErreur(''); });
    };
}

document.addEventListener('DOMContentLoaded', function() {
    var b = document.getElementById('mu-add-btn');
    if (b) b.addEventListener('click', muAjouter);
    var f = document.getElementById('mu-filter');
    if (f) f.addEventListener('input', muRendre);
});

// Contenu genere en JS : retraduit au changement de langue
window.addEventListener('langchange', function() {
    var sec = document.getElementById('mes-usagers-content');
    if (!sec || sec.style.display !== 'block') return;
    var r = document.getElementById('mu-new-role'), v = document.getElementById('mu-new-vendeur');
    if (r) r.innerHTML = muOptionsRoles(r.value);
    if (v) v.innerHTML = muOptionsVendeurs(v.value);
    muRendre();
});
