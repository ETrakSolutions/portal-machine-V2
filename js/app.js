// ============================================
// e-Trak Portal Machine — App Logic v2.0
// Unified login + role-based permissions
// ============================================

let machinesData = {};
let installedMachines = [];

// Load installed machines list
// cache:'no-cache' -> revalidation conditionnelle (ETag) : toujours a jour apres un save,
// 304 leger si inchange. Voir aussi machines.json plus bas (meme strategie partout).
fetch('data/installed_machines.json', { cache: 'no-cache' })
    .then(function(r) { return r.json(); })
    .then(function(data) { installedMachines = data; })
    .catch(function() {});

// ---- ROLE PERMISSIONS ----
const ROLES = {
    super_admin:    { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Super Admin' },
    administrateur: { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Administrateur' },
    vente_interne:  { createAccount: true, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Vente interne' },
    technicien:     { createAccount: false, modifBom: false, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Technicien' },
    distributeur:   { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Distributeur' },
    dealer:         { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, databaseAccess: false, flagBom: false, label: 'Dealer' },
    ingenierie:     { createAccount: false, modifBom: true, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, databaseAccess: true, flagBom: true, label: 'Ingenierie' }
};

// ---- LOGIN SYSTEM ----
// Les comptes vivent UNIQUEMENT cote serveur (Apps Script). Le login se fait sur le hub
// (index.html / admin.js) ; cette page restaure la session depuis localStorage.
const AUTHORIZED_USERS = [];
let currentUser = null; // { username, name, role, permissions }

// Token de session (renvoye par l'API au login, stocke dans portal_user).
// Envoye dans le champ 'pin' des ecritures — le backend accepte token ou PIN script.
function portalToken() {
    try { return (JSON.parse(localStorage.getItem('portal_user')) || {}).token || ''; } catch(e) { return ''; }
}

function getUserPermissions(role) {
    return ROLES[role] || { modifBom: false, createAccount: false, modifAccounts: false };
}

// Enregistre une demande d'ajout de machine dans le KV store (cle 'machine_requests').
// Reutilise les endpoints existants get/save (aucun changement backend). La page
// machine-requests.html (cote admin) liste ces demandes et permet de generer la machine.
function submitMachineRequest(info, btnEl) {
    var t = function(k, fb) { return (typeof i18n !== 'undefined') ? i18n.t(k) : fb; };
    var prev = btnEl ? btnEl.textContent : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = t('js.req_sending', 'Envoi...'); }
    fetch(API_URL + '?action=get&key=machine_requests')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var list = [];
            if (data && data.value) { try { list = JSON.parse(data.value) || []; } catch(e) { list = []; } }
            if (!Array.isArray(list)) list = [];
            var dup = list.some(function(r) {
                return r && r.status === 'active' && r.type === info.type &&
                    (r.fab || '') === (info.fab || '') && (r.modele || '') === (info.modele || '') &&
                    String(r.annee || '') === String(info.annee || '');
            });
            if (dup) {
                if (btnEl) { btnEl.textContent = t('js.req_exists', '✓ Demande déjà enregistrée'); }
                return null;
            }
            var u = currentUser || {};
            list.push({
                id: 'req_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                type: info.type, fab: info.fab, modele: info.modele, annee: info.annee,
                requester: u.name || u.username || '', requesterEmail: u.username || '',
                date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                note: '', status: 'active'
            });
            return fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'save', key: 'machine_requests', value: JSON.stringify(list), pin: portalToken() })
            }).then(function(r) { return r.json(); }).then(function() {
                if (btnEl) { btnEl.textContent = t('js.req_done', '✓ Demande enregistrée'); }
                notifyMachineRequest(info, u.name || u.username || '');
            });
        })
        .catch(function() {
            if (btnEl) { btnEl.disabled = false; btnEl.textContent = prev; }
            alert(t('js.req_error', 'Erreur lors de l\'envoi de la demande. Réessayez.'));
        });
}

// Notifie par courriel (envoi backend sendsoumission) les adresses de la liste
// 'machine_request_emails' quand une nouvelle demande de machine est enregistree.
// Liste geree dans l'admin ; si vide, aucun courriel n'est envoye. Echec silencieux
// (la demande est deja enregistree cote KV, la notif est un bonus).
function notifyMachineRequest(info, requesterName) {
    var tt = function(k, p) { return (typeof i18n !== 'undefined') ? i18n.t(k, p) : k; };
    fetch(API_URL + '?action=get&key=machine_request_emails')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var emails = [];
            if (data && data.value) { try { emails = JSON.parse(data.value) || []; } catch(e) { emails = []; } }
            if (!Array.isArray(emails) || !emails.length) return;
            var typeLabel = (typeof i18n !== 'undefined') ? i18n.t('type.' + info.type) : info.type;
            var lines = [
                tt('email.machinereq_body_header'),
                '',
                tt('email.note_details'),
                tt('email.note_type', { type: typeLabel }),
                tt('email.note_fab', { fab: info.fab }),
                tt('email.note_modele', { modele: info.modele }),
                tt('email.note_annee', { annee: info.annee }),
                tt('email.machinereq_requester', { name: requesterName || '—' }),
                '',
                '---',
                tt('email.note_footer')
            ];
            var text = lines.join('\n');
            var html = '<div style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-line">' + lines.join('\n') + '</div>';
            var subject = tt('email.machinereq_subject', { fab: info.fab, modele: info.modele, annee: info.annee });
            fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'sendsoumission', to: emails.join(','), subject: subject, html: html, text: text, pin: portalToken() })
            }).catch(function() {});
        })
        .catch(function() {});
}

const selectType = document.getElementById('select-type');
const selectFabricant = document.getElementById('select-fabricant');
const selectAnnee = document.getElementById('select-annee');
const selectModele = document.getElementById('select-modele');
const btnReset = document.getElementById('btn-reset');
const resultsSection = document.getElementById('results-section');
const resultsTitle = document.getElementById('results-title');
const resultsBadge = document.getElementById('results-badge');
const resultsTableContainer = document.getElementById('results-table-container');
const emptyState = document.getElementById('empty-state');

// Load data
// Option B : machines.json (specs de base) + overrides.json (_bom/_notes), fusionnes en memoire.
function applyOverrides(machines, ov) {
    if (!ov) return machines;
    for (var t in ov) { for (var f in ov[t]) { for (var y in ov[t][f]) { for (var m in ov[t][f][y]) {
        var o = ov[t][f][y][m];
        var e = machines[t] && machines[t][f] && machines[t][f][y] && machines[t][f][y][m];
        if (e && o) { if (o._bom !== undefined) e._bom = o._bom; if (o._notes !== undefined) e._notes = o._notes; if (o._warning !== undefined) e._warning = o._warning; }
    }}}}
    return machines;
}
Promise.all([
    fetch('data/machines.json', { cache: 'no-cache' }).then(res => res.json()),
    window.loadMergedOverrides()   // 8 fichiers par type + repli data/overrides.json
])
    .then(res => {
        machinesData = applyOverrides(res[0], res[1]);
        populateTypes();
    })
    .catch(err => console.error('Erreur chargement donnees:', err));

// Rafraichissement transparent : data-refresh.js appelle ceci quand overrides.json change
window.__onOverridesChanged = function(ov) {
    applyOverrides(machinesData, ov);
    if (typeof kitEditMode !== 'undefined' && kitEditMode) return; // ne pas perturber une edition kit en cours
    var t = selectType && selectType.value, f = selectFabricant && selectFabricant.value,
        a = selectAnnee && selectAnnee.value, m = selectModele && selectModele.value;
    if (t && f && a && m && m !== '__OTHER__') {
        try {
            var e = machinesData[t] && machinesData[t][f] && machinesData[t][f][a] && machinesData[t][f][a][m];
            var o = (ov[t] && ov[t][f] && ov[t][f][a] && ov[t][f][a][m]) || {};
            if (e) { if (o._bom !== undefined) e._bom = o._bom; else delete e._bom;
                     if (o._notes !== undefined) e._notes = o._notes; else delete e._notes;
                     if (o._warning !== undefined) e._warning = o._warning; else delete e._warning; }
        } catch (err) {}
        try { selectModele.dispatchEvent(new Event('change')); } catch (e) {}  // re-affiche la fiche/kit a jour
    }
};

function populateTypes() {
    // Meme ordre que la tuile Base de donnees : Excavatrice + Pompe a Beton en tete, reste alphabetique.
    const TYPE_ORDER_PRIORITY = ['Excavatrice', 'Pompe a Beton'];
    const _all = Object.keys(machinesData);
    const types = TYPE_ORDER_PRIORITY.filter(t => _all.indexOf(t) >= 0)
        .concat(_all.filter(t => TYPE_ORDER_PRIORITY.indexOf(t) < 0).sort());
    types.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = (typeof i18n !== 'undefined') ? i18n.t('type.' + type) : type;
        selectType.appendChild(opt);
    });
}

// Type changed
selectType.addEventListener('change', () => {
    resetFrom('fabricant');
    const type = selectType.value;
    if (!type) return;

    const fabricants = Object.keys(machinesData[type]).filter(f => f.charAt(0) !== '_').sort();
    fabricants.forEach(fab => {
        const opt = document.createElement('option');
        opt.value = fab;
        opt.textContent = fab;
        selectFabricant.appendChild(opt);
    });
    selectFabricant.disabled = false;
    btnReset.style.display = 'inline-block';
});

// Helper: populate modeles dropdown from fab data, optionally filtered by year
function populateModeles(type, fab, anneeFilter) {
    selectModele.innerHTML = '<option value="">' + ((typeof i18n !== 'undefined') ? i18n.t('common.selectionnez') : '-- Selectionnez --') + '</option>';
    var fabData = machinesData[type][fab];
    // Collect unique models across all years (or filtered year)
    var modelSet = {};
    var annees = anneeFilter ? [anneeFilter] : Object.keys(fabData);
    annees.forEach(function(y) {
        if (!fabData[y]) return;
        Object.keys(fabData[y]).forEach(function(m) {
            if (!modelSet[m]) modelSet[m] = fabData[y][m];
        });
    });
    // Tri alphabetique naturel (numerique) : CX17C avant CX130C, tous les CX groupes
    // puis les WX, etc. Aide a retrouver un modele. La classe reste affichee en libelle
    // (ex. " [Mini]") mais ne sert plus a l'ordre.
    var modeles = Object.keys(modelSet).sort(function(a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    modeles.forEach(function(modele) {
        var opt = document.createElement('option');
        opt.value = modele;
        var classe = modelSet[modele]['Classe machine'] || '';
        opt.textContent = modele + (classe ? ' [' + classe + ']' : '');
        selectModele.appendChild(opt);
    });
    var optAutre = document.createElement('option');
    optAutre.value = '__OTHER__';
    optAutre.textContent = (typeof i18n !== 'undefined') ? i18n.t('js.other_model') : '\u2295 Autre modele (pas dans la liste)';
    optAutre.style.fontStyle = 'italic';
    selectModele.appendChild(optAutre);
    selectModele.disabled = false;
}

// Fabricant changed
selectFabricant.addEventListener('change', () => {
    resetFrom('annee');
    const type = selectType.value;
    const fab = selectFabricant.value;
    if (!fab) return;

    const annees = Object.keys(machinesData[type][fab]).sort().reverse();
    annees.forEach(annee => {
        const opt = document.createElement('option');
        opt.value = annee;
        opt.textContent = annee;
        selectAnnee.appendChild(opt);
    });
    selectAnnee.disabled = false;

    // Also populate modeles immediately (all years)
    populateModeles(type, fab, null);
});

// Annee changed — filter modeles by year, mais GARDER le modele courant s'il existe pour cette annee
selectAnnee.addEventListener('change', () => {
    const type = selectType.value;
    const fab = selectFabricant.value;
    const annee = selectAnnee.value;
    if (!fab) return;
    const prevModele = selectModele.value;
    populateModeles(type, fab, annee || null);
    // Si le modele precedent est toujours disponible pour cette annee, on le conserve et on reaffiche la fiche
    if (prevModele && prevModele !== '__OTHER__' &&
        selectModele.querySelector('option[value="' + CSS.escape(prevModele) + '"]')) {
        selectModele.value = prevModele;
        selectModele.dispatchEvent(new Event('change'));
    } else {
        selectModele.value = '';
        hideResults();
    }
});

// Delete model
function updateGearDeleteButton() {
    const btn = document.getElementById('gear-delete-model-btn');
    if (!btn) return;
    const modele = selectModele.value;
    const hasModel = modele && modele !== '' && modele !== '__OTHER__';
    if (hasModel) {
        const fab = selectFabricant.value;
        const annee = selectAnnee.value;
        btn.disabled = false;
        btn.textContent = i18n.t('js.delete_btn', { fab: fab, modele: modele, annee: annee });
    } else {
        btn.disabled = true;
        btn.textContent = i18n.t('js.no_model_selected');
    }
}

(function initGearDelete() {
    const btn = document.getElementById('gear-delete-model-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const type = selectType.value;
        const fab = selectFabricant.value;
        const annee = selectAnnee.value;
        const mod = selectModele.value;
        if (!mod || mod === '__OTHER__') return;

        if (!confirm((typeof i18n !== 'undefined') ? i18n.t('js.confirm_delete', {fab: fab, modele: mod, annee: annee}) : ('\u26A0 Confirmer la suppression :\n\n' + fab + ' ' + mod + '\nAnnee : ' + annee + ' seulement\n\nCette action est irreversible.'))) return;

        // Delete from local data
        if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee]) {
            delete machinesData[type][fab][annee][mod];
        }

        // Save deletion to API
        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain'},
            body: JSON.stringify({ action: 'save', key: 'deleted_' + type + '_' + fab + '_' + annee + '_' + mod, value: 'deleted', pin: portalToken() })
        }).catch(() => {});

        // Remove from dropdown
        const opt = selectModele.querySelector('option[value="' + CSS.escape(mod) + '"]');
        if (opt) opt.remove();
        selectModele.value = '';
        hideResults();
        updateGearDeleteButton();

        // Close dropdown
        closeUserDropdown();
    });
})();

// Modele changed -> show specs
selectModele.addEventListener('change', () => {
    const type = selectType.value;
    const fab = selectFabricant.value;
    const modele = selectModele.value;
    if (!modele) {
        hideResults();
        return;
    }

    if (modele === '__OTHER__') {
        let annee = selectAnnee.value;
        if (!annee) { alert((typeof i18n !== 'undefined') ? i18n.t('js.select_year') : 'Selectionnez une annee pour creer un modele.'); return; }
        showCustomModelModal(type, fab, annee);
        return;
    }

    // N'afficher dans le menu Annee QUE les annees ou ce modele existe
    var modelYears = Object.keys(machinesData[type][fab]).filter(function(y){
        return machinesData[type][fab][y] && machinesData[type][fab][y][modele];
    }).sort().reverse();
    var annee = selectAnnee.value;
    if (modelYears.indexOf(annee) < 0) annee = modelYears[0];  // annee courante invalide -> plus recente dispo
    selectAnnee.innerHTML = '';
    modelYears.forEach(function(y){ var o = document.createElement('option'); o.value = y; o.textContent = y; selectAnnee.appendChild(o); });
    selectAnnee.value = annee;
    selectAnnee.disabled = false;

    const specs = machinesData[type][fab][annee][modele];
    showResults(modele, type, fab, annee, specs);
});

// Custom model modal
function showCustomModelModal(type, fab, annee) {
    const existing = document.getElementById('custom-model-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'custom-model-modal';
    modal.className = 'custom-modal-overlay';
    modal.innerHTML = `
        <div class="custom-modal">
            <h3>Nouveau modele</h3>
            <p class="modal-desc">${fab} \u2014 ${annee}</p>
            <input type="text" id="custom-model-name" class="modal-input" placeholder="Nom du modele (ex: CX250D)" autocomplete="off">
            <div class="modal-buttons">
                <button id="modal-cancel" class="modal-btn modal-btn-cancel">Annuler</button>
                <button id="modal-create" class="modal-btn modal-btn-create">Creer la fiche</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const inputField = document.getElementById('custom-model-name');
    inputField.focus();

    document.getElementById('modal-cancel').addEventListener('click', () => {
        modal.remove();
        selectModele.value = '';
        hideResults();
    });

    document.getElementById('modal-create').addEventListener('click', () => {
        const customName = inputField.value.trim();
        if (!customName) { inputField.style.borderColor = 'red'; return; }
        modal.remove();
        createCustomModel(type, fab, annee, customName);
    });

    inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('modal-create').click();
        if (e.key === 'Escape') document.getElementById('modal-cancel').click();
    });
}

function createCustomModel(type, fab, annee, customName) {
    const specs = {
        'Image': '',
        'Puissance moteur (kW / HP)': 'A completer',
        'Type de traction': 'A completer',
        'Type de boom': 'A completer',
        'Longueur de fleche (m / pi)': 'A completer',
        'Longueur de stick (m / pi)': 'A completer',
        'Swing boom': 'A completer',
        'Voltage machine (V/type)': 'A completer',
        'Capacite max de levage (kg / lbs)': 'A completer',
        'Poids operationnel (kg / lbs)': 'A completer'
    };

    if (!machinesData[type]) machinesData[type] = {};
    if (!machinesData[type][fab]) machinesData[type][fab] = {};
    if (!machinesData[type][fab][annee]) machinesData[type][fab][annee] = {};
    machinesData[type][fab][annee][customName] = specs;

    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({
            action: 'saveModel',
            modelKey: type + '_' + fab + '_' + annee + '_' + customName,
            specs: specs,
            pin: portalToken()
        })
    }).catch(() => {});

    const opt = document.createElement('option');
    opt.value = customName;
    opt.textContent = customName + ' \u2605';
    selectModele.insertBefore(opt, selectModele.querySelector('option[value="__OTHER__"]'));
    selectModele.value = customName;

    showResults(customName, type, fab, annee, specs, true);
}


function showResults(modele, type, fab, annee, specs, isCustom) {
    // Memoriser pour redirection vers edit-machine.html depuis le bouton lock
    window.__currentMachine = { type: type, fab: fab, modele: modele, annee: annee };
    resultsTitle.textContent = `${fab} ${modele} (${annee})`;
    resultsBadge.textContent = i18n.t('type.' + type);

    const poidsVal = specs['Poids operationnel (kg / lbs)'] || '';
    const poidsNum = parseInt((poidsVal.match(/^(\d+)/) || [])[1]) || 0;
    let classMachine = '', classKey = '';
    if (poidsNum > 0) {
        if (poidsNum < 2000) { classMachine = 'Ultra-micro'; classKey = 'class.ultra_micro'; }
        else if (poidsNum < 6000) { classMachine = 'Mini'; classKey = 'class.mini'; }
        else if (poidsNum < 10000) { classMachine = 'Compact'; classKey = 'class.compact'; }
        else if (poidsNum < 20000) { classMachine = 'Standard'; classKey = 'class.standard'; }
        else if (poidsNum < 35000) { classMachine = 'Moyen'; classKey = 'class.moyen'; }
        else if (poidsNum < 50000) { classMachine = 'Grand'; classKey = 'class.grand'; }
        else if (poidsNum < 80000) { classMachine = 'Tres grand'; classKey = 'class.tres_grand'; }
        else { classMachine = 'Mining'; classKey = 'class.mining'; }
    }
    let classDisplay = classKey ? i18n.t(classKey) : '';
    const tractionVal = specs['Type de traction'] || '';
    if (tractionVal === 'Roue' && classDisplay) classDisplay += ' ' + i18n.t('class.on_wheels');

    let html = '<table class="specs-table">';
    if (classDisplay) {
        html += `<tr><td>${i18n.tSpec('Classe machine')}</td><td><strong>${classDisplay}</strong></td></tr>`;
    }
    for (const [key, value] of Object.entries(specs)) {
        if (key.charAt(0) === '_' || key === 'Flag') continue;  // cacher les cles meta (_note_tech_*, _actif, _bom, etc.)
        const dk = ` data-spec-key="${key.replace(/"/g,'&quot;')}"`;
        if (key === 'Image') {
            if (value && value.trim() !== '') {
                html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}><img src="${value}" alt="${fab} ${modele}" style="max-width:300px;max-height:200px;border-radius:6px;"></td></tr>`;
            } else {
                html += `<tr><td>${i18n.tSpec(key)}</td><td${dk} class="text-muted">${i18n.t('js.image_unavailable')}</td></tr>`;
            }
        } else if (key === 'Type de traction' && value === 'Roue') {
            html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}><span class="flash-yellow">${i18n.tVal(value)}</span></td></tr>`;
        } else if (key === 'Type de boom' && String(value).includes('2 parties')) {
            html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}><span class="flash-yellow">${i18n.tVal(value)}</span></td></tr>`;
        } else if (key === 'Swing boom' && value === 'Oui') {
            html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}><span class="flash-yellow">${i18n.tVal(value)}</span></td></tr>`;
        } else if (key === 'Voltage machine (V/type)' && String(value).includes('12V')) {
            html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}><span class="flash-yellow">${i18n.tVal(value)}</span></td></tr>`;
        } else if (key === 'Section telescopique' && value === 'Oui') {
            html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}><span class="flash-yellow">${i18n.tVal(value)}</span></td></tr>`;
        } else if (key === 'Test Robin' && value && value.trim() !== '') {
            html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}><span style="color:#FFD54F;font-weight:600;">${value}</span></td></tr>`;
        } else {
            html += `<tr><td>${i18n.tSpec(key)}</td><td${dk}>${i18n.tVal(value)}</td></tr>`;
        }
    }
    html += '</table>';

    if (isCustom) {
        const mailTo = getMailTo();
        const mailSubject = encodeURIComponent(i18n.t('email.kit_request_subject', { fab: fab, modele: modele, annee: annee }));
        const mailBody = encodeURIComponent(
            i18n.t('email.kit_request_body', { type: i18n.t('type.' + type), fab: fab, modele: modele, annee: annee })
        );
        var _reqText = i18n.t('js.kit_request_text');
        var _reqDbLabel = i18n.t('js.req_add_to_db');
        html += '<div class="kit-request-box">' +
            '<p class="kit-request-text">' + _reqText + '</p>' +
            '<a href="mailto:' + mailTo + '?subject=' + mailSubject + '&body=' + mailBody + '" id="kit-email-request-btn" class="kit-request-btn">' + i18n.t('js.kit_request_btn') + '</a>' +
            '<button type="button" id="db-request-btn" class="kit-request-btn kit-request-btn-db">' + _reqDbLabel + '</button>' +
            '</div>';
    }

    resultsTableContainer.innerHTML = html;

    // Bouton "Demander l'ajout a la BD" (modele absent) -> enregistre une demande suivie.
    var _dbReqBtn = document.getElementById('db-request-btn');
    if (_dbReqBtn) {
        _dbReqBtn.addEventListener('click', function() {
            submitMachineRequest({ type: type, fab: fab, modele: modele, annee: annee }, _dbReqBtn);
        });
    }
    // Le bouton courriel enregistre AUSSI la demande (allume le temoin), en plus d'ouvrir
    // le courriel. Pas de preventDefault : le mailto s'ouvre normalement, l'enregistrement
    // se fait en parallele. Le retour visuel s'affiche sur le bouton "Demander l'ajout".
    var _emailReqBtn = document.getElementById('kit-email-request-btn');
    if (_emailReqBtn) {
        _emailReqBtn.addEventListener('click', function() {
            submitMachineRequest({ type: type, fab: fab, modele: modele, annee: annee }, _dbReqBtn);
        });
    }

    // Load and display product codes for this machine
    var pcApiKey = 'product_codes_' + fab.replace(/[^a-zA-Z0-9]/g,'_') + '_' + modele.replace(/[^a-zA-Z0-9]/g,'_') + '_' + annee;
    fetch(API_URL + '?action=get&key=' + encodeURIComponent(pcApiKey))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var codes = [];
            if (data.value) { try { codes = JSON.parse(data.value); } catch(e) {} }
            if (codes.length > 0) {
                var pcDiv = document.createElement('div');
                pcDiv.className = 'product-codes-section';
                pcDiv.innerHTML = '<h4 class="pc-title">' + i18n.t('machine.codes_title') + '</h4>' +
                    '<table class="specs-table pc-table"><thead><tr><th>' + i18n.t('edit.ph_code') + '</th><th>' + i18n.t('edit.ph_description') + '</th><th>' + i18n.t('common.qty') + '</th></tr></thead><tbody>' +
                    codes.map(function(c) {
                        return '<tr><td><strong>' + c.code + '</strong></td><td>' + (c.desc || '') + '</td><td>' + (c.qty || 1) + '</td></tr>';
                    }).join('') +
                    '</tbody></table>';
                resultsTableContainer.appendChild(pcDiv);
            }
        })
        .catch(function() {});

    resultsSection.style.display = 'block';
    emptyState.style.display = 'none';

    // Show kit machine section only for excavators
    const kitSection = document.getElementById('kit-machine-section');
    if (type === 'Excavatrice') {
        kitSection.style.display = 'block';
        const kitDesc = document.getElementById('kit-machine-desc');
        if (kitDesc) kitDesc.textContent = fab + ' ' + modele + ' (' + annee + ')';

        // Check if machine has been installed before
        var installedBanner = document.getElementById('kit-not-installed');
        if (installedBanner) installedBanner.remove();
        var isInstalled = installedMachines.some(function(m) {
            return m.modele.toUpperCase() === modele.toUpperCase();
        });
        // Banner "Machine jamais installee" desactive

        loadNotes(type, fab, modele, annee);
        loadKitFlag(type, fab, modele, annee);
        // Auto-unlock kit if user has permission
        if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
            if (typeof unlockKit === 'function') unlockKit();
        } else {
            if (typeof lockKit === 'function') lockKit();
        }

        // ---- BD = MAITRE: compute defaults then load overrides ----
        // Defauts BOM : source unique = js/kit-rules.js (memes regles que database.html / edit / soumission / export)
        var fabUp = fab.toUpperCase();
        var bomDefaults = window.KitRules.excDefaults(specs, modele);

        // Harnais — defaut calcule par la source unique js/kit-rules.js
        var _h = window.KitRules.harnais(fabUp, modele);
        var hCode = _h.code; var hName = _h.name;

        var harnaisLabel = document.getElementById('kit-harnais-label');
        var harnaisCodeEl = document.getElementById('kit-harnais-code');
        if (harnaisLabel) harnaisLabel.textContent = hName;
        if (harnaisCodeEl) harnaisCodeEl.textContent = hCode;

        // Apply BOM defaults to kit table rows
        var KIT_MAP = {
            'cabine': '0000', 'sans-cabine': '0003', 'hauteur': '0001', 'rotation': '0002',
            'mini': '0004', 'gc': '0070', 'swing': '0008', 'drain': '0009',
            'multi': '0005', 'cremaillere': '0304'
        };

        function applyBomToKit(bom) {
            // For each kit row, check its BOM code and show/hide + set color
            document.querySelectorAll('.kit-table tbody tr[data-kit]').forEach(function(tr) {
                var kit = tr.dataset.kit;
                var code = KIT_MAP[kit];
                if (!code || code === 'na') { tr.style.display = 'none'; return; }
                var state = bom[code] || 'na';
                if (state === 'na') {
                    tr.style.display = 'none';
                } else {
                    tr.style.display = '';
                    var statusCell = tr.querySelector('.kit-status-cell');
                    if (statusCell) {
                        if (state === 'v') {
                            // A verifier : badge orange distinct (ni obligatoire ni optionnel)
                            statusCell.innerHTML = '<span class="kit-verif-badge" style="display:inline-block;padding:2px 8px;border-radius:10px;background:#FFF1DC;color:#B25E00;border:1px solid #E07B00;font-size:0.72rem;font-weight:600;white-space:nowrap">' + i18n.t('edit.status_v') + '</span>';
                        } else {
                            // Ensure radios exist
                            var radioName = statusCell.querySelector('input[type="radio"]');
                            if (!radioName) {
                                var name = 'kit-' + kit;
                                statusCell.innerHTML = '<input type="radio" name="' + name + '" value="oui" class="radio-red"><input type="radio" name="' + name + '" value="non" class="radio-yellow">';
                            }
                            var red = statusCell.querySelector('.radio-red');
                            var yellow = statusCell.querySelector('.radio-yellow');
                            if (state === 'r' && red) { red.checked = true; if (yellow) yellow.checked = false; }
                            else if (state === 'j' && yellow) { yellow.checked = true; if (red) red.checked = false; }
                        }
                    }
                }
            });
            // Harnais row always visible
            var harnaisTr = document.querySelector('tr[data-kit="harnais"]');
            if (harnaisTr) harnaisTr.style.display = '';
        }

        // Apply defaults first
        applyBomToKit(bomDefaults);

        // BD maitre : libelles + PN depuis _bom_labels (map corrige : sans-cabine -> 0003, pas 0004)
        applyBdKitLabels(document.querySelector('.kit-table'), {
            'cabine':'0000','sans-cabine':'0003','hauteur':'0001','rotation':'0002',
            'mini':'0004','gc':'0070','swing':'0008','drain':'0009','multi':'0005','cremaillere':'0304'
        }, type);

        // Then load overrides (BD is master : lus depuis machines.json)
        loadKitOverride(type, fab, modele, annee, function(overrides) {
            if (overrides) {
                // Merge overrides on top of defaults (skip meta keys)
                for (var code in overrides) {
                    if (code === '_specs' || code === '_custom' || code === '_removed' || code === 'harnais') continue;
                    if (overrides[code]) bomDefaults[code] = overrides[code];
                }
                // Apply _removed: force codes to 'na' so applyBomToKit hides them
                if (Array.isArray(overrides._removed)){
                    overrides._removed.forEach(function(c){ bomDefaults[c] = 'na'; });
                }
                // Drain hyd (0009) ne peut JAMAIS etre jaune — rouge ou na seulement
                if (bomDefaults['0009'] === 'j') bomDefaults['0009'] = 'r';
                applyBomToKit(bomDefaults);
                // Update harnais if override exists (libelles : source unique kit-rules.js)
                if (overrides.harnais) {
                    var _ho = window.KitRules.harnaisOverride(overrides.harnais);
                    if (harnaisCodeEl) harnaisCodeEl.textContent = _ho.code;
                    if (harnaisLabel) harnaisLabel.textContent = _ho.name;
                }
                // Apply custom rows (added in edit-machine.html via _custom)
                if (Array.isArray(overrides._custom) && overrides._custom.length){
                    applyKitOverrides({ customRows: (normalizeKitOverrides(overrides) || {}).customRows || [] });
                }
                // Apply specs overrides on the displayed specs
                if (overrides._specs){
                    Object.keys(overrides._specs).forEach(function(fullKey){
                        var val = overrides._specs[fullKey];
                        document.querySelectorAll('[data-spec-key="' + fullKey + '"]').forEach(function(el){
                            el.textContent = val;
                        });
                    });
                }
            }
        });
    } else {
        kitSection.style.display = 'none';
    }

    // Show kit pompe section for Pompe a Beton (BD = MAITRE)
    var kitPompeSection = document.getElementById('kit-pompe-section');
    if (kitPompeSection) {
        if (type === 'Pompe a Beton') {
            kitPompeSection.style.display = 'block';
            var kitPompeDesc = document.getElementById('kit-pompe-desc');
            if (kitPompeDesc) kitPompeDesc.textContent = fab + ' ' + modele + ' (' + annee + ')';

            // Defauts BOM Pompe : source unique = js/kit-rules.js
            var pompeBomDefaults = window.KitRules.pompeDefaults(specs);

            // Map pompe kit rows to BOM codes
            var POMPE_KIT_MAP = {
                'pompe-coffre': '0200', 'pompe-sans-coffre': '0203',
                'pompe-hauteur': '0201', 'pompe-rotation': '0202',
                'pompe-4sec': '0204', 'pompe-5sec': '0205', 'pompe-6sec': '0206',
                'pompe-rot-cylindre': '0207', 'pompe-inclinometre': '0208', 'pompe-reel': '0209'
            };

            function applyBomToPompeKit(bom) {
                kitPompeSection.querySelectorAll('tbody tr[data-kit]').forEach(function(tr) {
                    var kit = tr.dataset.kit;
                    var code = POMPE_KIT_MAP[kit];
                    if (!code) return;
                    var state = bom[code] || 'na';
                    if (state === 'na') {
                        tr.style.display = 'none';
                    } else {
                        tr.style.display = '';
                        var statusCell = tr.querySelector('.kit-status-cell');
                        if (statusCell) {
                            var red = statusCell.querySelector('.radio-red');
                            var yellow = statusCell.querySelector('.radio-yellow');
                            if (red) red.checked = false;
                            if (yellow) yellow.checked = false;
                            if (state === 'r' && red) red.checked = true;
                            else if (state === 'j' && yellow) yellow.checked = true;
                        }
                    }
                });
            }

            // Inclinometre magnetique (0208) : il s'en pose UN par section de fleche.
            // Quand la ligne 0208 est presente : si le nombre de sections est NON
            // ambigu (une seule des options 4/5/6 = 0204/0205/0206 est affichee), on
            // montre automatiquement "×N" a cote du code ; sinon (0 ou plusieurs
            // sections) on affiche une note d'ajustement. Idempotent -> jamais de
            // doublon. (Retour de Steve, 2026-08.)
            function updatePompeInclinoQty() {
                var incTr = kitPompeSection.querySelector('tr[data-kit="pompe-inclinometre"]');
                if (!incTr) return;
                var codeCell = incTr.querySelector('.kit-code');
                if (!codeCell) return;
                // Nettoie un ancien indicateur (idempotence, pas de doublon)
                var old = codeCell.querySelector('.incli-qty');
                if (old) old.remove();
                if (incTr.style.display === 'none') return;   // 0208 absent du kit -> rien
                // Nombre de sections = le PLUS GRAND code section present
                // (0203=3, 0204=4, 0205=5, 0206=6). Meme regle que la soumission.
                var secMap = { 'pompe-sans-coffre': 3, 'pompe-4sec': 4, 'pompe-5sec': 5, 'pompe-6sec': 6 };
                var maxN = null;
                Object.keys(secMap).forEach(function(k){
                    var tr = kitPompeSection.querySelector('tr[data-kit="' + k + '"]');
                    if (tr && tr.style.display !== 'none' && (maxN === null || secMap[k] > maxN)) maxN = secMap[k];
                });
                if (maxN === null) return;   // aucune section connue -> pas d'indicateur
                var fr = (typeof i18n === 'undefined') || i18n.getLang() !== 'en';
                var span = document.createElement('span');
                span.className = 'incli-qty';
                span.innerHTML = ' <strong style="color:#0062CC">×' + maxN + '</strong>' +
                    ' <span style="color:#888;font-size:0.82em">' +
                    (fr ? '(= nb de sections)' : '(= no. of sections)') + '</span>';
                codeCell.appendChild(span);
            }

            // Apply defaults first
            applyBomToPompeKit(pompeBomDefaults);

            // BD maitre : libelles + PN depuis _bom_labels (map pompe 1:1)
            applyBdKitLabels(kitPompeSection, POMPE_KIT_MAP, type);
            // APRES les libelles : applyBdKitLabels reecrit la cellule code (PN), il faut
            // donc (re)poser l'indicateur de quantite de l'inclinometre ensuite.
            updatePompeInclinoQty();

            // Then load overrides (BD is master : lus depuis machines.json)
            loadKitOverride(type, fab, modele, annee, function(overrides) {
                if (overrides) {
                    for (var code in overrides) {
                        if (code === '_specs' || code === '_custom' || code === '_removed' || code === 'harnais') continue;
                        if (overrides[code]) pompeBomDefaults[code] = overrides[code];
                    }
                    if (Array.isArray(overrides._removed)){
                        overrides._removed.forEach(function(c){ pompeBomDefaults[c] = 'na'; });
                    }
                    applyBomToPompeKit(pompeBomDefaults);
                    updatePompeInclinoQty();
                    if (Array.isArray(overrides._custom) && overrides._custom.length){
                        applyKitOverrides({ customRows: (normalizeKitOverrides(overrides) || {}).customRows || [] });
                    }
                    if (overrides._specs){
                        Object.keys(overrides._specs).forEach(function(fullKey){
                            var val = overrides._specs[fullKey];
                            document.querySelectorAll('[data-spec-key="' + fullKey + '"]').forEach(function(el){
                                el.textContent = val;
                            });
                        });
                    }
                }
            });

            loadNotes(type, fab, modele, annee);
        } else {
            kitPompeSection.style.display = 'none';
        }
    }

    // Kit GENERIQUE (BD = MAITRE) : tout autre type ayant _bom_labels.
    // Lignes generees depuis _bom_labels (code + pn + desc + def) + override _bom. Aucune logique par type.
    var kitGenericSection = document.getElementById('kit-generic-section');
    if (kitGenericSection) {
        var labelsG = machinesData[type] && machinesData[type]._bom_labels;
        var isExcOrPompe = (type === 'Excavatrice' || type === 'Pompe a Beton');
        if (!isExcOrPompe && labelsG) {
            kitGenericSection.style.display = 'block';
            var gDesc = document.getElementById('kit-generic-desc');
            if (gDesc) gDesc.textContent = fab + ' ' + modele + ' (' + annee + ')';
            var gBody = document.getElementById('kit-generic-tbody');
            // Nacelle : base selon la categorie (articulee -> 0903, sinon 0900)
            var nacDef = (type === 'Nacelle' && window.KitRules && window.KitRules.nacelleDefaults) ? window.KitRules.nacelleDefaults(specs) : null;
            var renderGeneric = function(ov) {
                ov = ov || {};
                var removed = Array.isArray(ov._removed) ? ov._removed : [];
                var rows = '';
                var dotFor = function(st) {
                    if (st === 'r') return '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#CC0000"></span>';
                    if (st === 'v') return '<span class="kit-verif-badge" style="display:inline-block;padding:2px 8px;border-radius:10px;background:#FFF1DC;color:#B25E00;border:1px solid #E07B00;font-size:0.72rem;font-weight:600;white-space:nowrap">' + i18n.t('edit.status_v') + '</span>';
                    return '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#E6B400"></span>';
                };
                Object.keys(labelsG).forEach(function(key) {
                    var code = key.split(' ')[0];
                    var v = labelsG[key] || {};
                    var ovv = ov[code];
                    var baseDef = (nacDef && nacDef[code] !== undefined) ? nacDef[code] : (v.def || 'na');
                    var st = (ovv !== undefined && ovv !== null && ovv !== '') ? ovv : baseDef;
                    if (removed.indexOf(code) >= 0) st = 'na';
                    if (st === 'na') return;
                    rows += '<tr><td>' + i18n.tBom(v.desc || key.replace(/^[0-9]+\s*/, '')) + '</td>' +
                            '<td class="kit-code">' + (v.pn || ('1500-' + code)) + '</td>' +
                            '<td class="kit-status-cell" style="text-align:center">' + dotFor(st) + '</td></tr>';
                });
                if (Array.isArray(ov._custom)) {
                    ov._custom.forEach(function(c) {
                        if (c.status === 'na') return;
                        rows += '<tr><td>' + i18n.tBom(c.desc || c.code) + '</td>' +
                                '<td class="kit-code">' + (c.pn || c.code) + '</td>' +
                                '<td class="kit-status-cell" style="text-align:center">' + dotFor(c.status === 'r' ? 'r' : (c.status === 'v' ? 'v' : 'j')) + '</td></tr>';
                    });
                }
                gBody.innerHTML = rows || '<tr><td colspan="3" style="color:#888;padding:0.6rem">' + i18n.t('machine.no_option') + '</td></tr>';
            };
            renderGeneric(null);  // defauts de la BD d'abord
            loadKitOverride(type, fab, modele, annee, function(overrides) { renderGeneric(overrides || {}); });
            loadNotes(type, fab, modele, annee);
        } else {
            kitGenericSection.style.display = 'none';
        }
    }

    updateGearDeleteButton();
}

// BD maitre : ecrit la description longue (.desc) et le code produit (.pn) de _bom_labels
// dans les lignes du kit affichees (machine.html). On retire data-i18n pour que la traduction
// ne reecrase pas le texte de la BD (BD mono-langue : le texte FR de la BD s'affiche partout).
function applyBdKitLabels(rootEl, displayMap, type) {
    var labels = (machinesData[type] && machinesData[type]._bom_labels) || null;
    if (!labels || !rootEl) return;
    var byCode = {};
    Object.keys(labels).forEach(function(k){ byCode[String(k).split(' ')[0]] = labels[k] || {}; });
    rootEl.querySelectorAll('tbody tr[data-kit]').forEach(function(tr) {
        var code = displayMap[tr.dataset.kit];
        if (!code) return;
        var lab = byCode[code];
        if (!lab) return;
        if (lab.desc) {
            var firstCell = tr.querySelector('td');
            var span = firstCell ? (firstCell.querySelector('span[data-i18n-html], span[data-i18n], span') || firstCell) : null;
            if (span) {
                span.removeAttribute('data-i18n-html');
                span.removeAttribute('data-i18n');
                span.textContent = i18n.tBom(lab.desc);
            }
        }
        if (lab.pn) {
            var codeCell = tr.querySelector('.kit-code');
            if (codeCell) codeCell.textContent = lab.pn;
        }
    });
}

function hideResults() {
    resultsSection.style.display = 'none';
    emptyState.style.display = 'block';
    const kitSection = document.getElementById('kit-machine-section');
    if (kitSection) kitSection.style.display = 'none';
    const notesSection = document.getElementById('notes-section');
    if (notesSection) notesSection.style.display = 'none';
}

// ---- KIT FLAG SYSTEM ----
var KIT_FLAGS_KEY = 'db_flags';

function kitFlagKey(type, fab, modele, annee) { return [type, fab, modele, annee].join('|'); }

function loadKitFlag(type, fab, modele, annee) {
    var canFlag = currentUser && (
        (currentUser.permissions && currentUser.permissions.flagBom) ||
        getUserPermissions(currentUser.role).flagBom
    );
    var existing = document.getElementById('kit-flag-btn-wrap');
    if (existing) existing.remove();
    if (!canFlag) return;
    // Render immediately with empty cache (no flag), update when API responds
    renderKitFlagBtn(type, fab, modele, annee, {});
    fetch(API_URL + '?action=get&key=' + encodeURIComponent(KIT_FLAGS_KEY))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var fc = {};
            if (data.value) { try { fc = JSON.parse(data.value); } catch(e) {} }
            renderKitFlagBtn(type, fab, modele, annee, fc);
        })
        .catch(function() {});
}

function renderKitFlagBtn(type, fab, modele, annee, fc) {
    var fk = kitFlagKey(type, fab, modele, annee);
    var fi = fc[fk];
    var isActive = fi && fi.active;
    var kitLockRow = document.querySelector('#kit-machine-section .kit-lock-row');
    if (!kitLockRow) return;
    var existing = document.getElementById('kit-flag-btn-wrap');
    if (existing) existing.remove();

    var wrap = document.createElement('span');
    wrap.id = 'kit-flag-btn-wrap';
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:5px;margin-left:10px;vertical-align:middle;transform:translateY(-3px);';

    var btn = document.createElement('button');
    btn.id = 'kit-flag-btn';
    btn.title = isActive ? i18n.t('machine.flag_btn_title_active') : i18n.t('machine.flag_btn_title');
    if (isActive) {
        btn.innerHTML = '\uD83D\uDEA9 <span style="font-size:0.78rem;">' + i18n.t('machine.flag_verif_required') + '</span>';
        btn.style.cssText = 'background:#7f1d1d;border:1px solid #ef4444;color:#fca5a5;cursor:pointer;font-size:0.82rem;font-weight:700;padding:5px 12px;border-radius:7px;line-height:1.3;transition:all 0.15s;white-space:nowrap;';
    } else {
        btn.innerHTML = '\uD83C\uDFF3\uFE0F <span style="font-size:0.82rem;">' + i18n.t('machine.flag_redflag') + '</span>';
        btn.style.cssText = 'background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.55);cursor:pointer;font-size:0.82rem;font-weight:600;padding:5px 12px;border-radius:7px;line-height:1.3;transition:all 0.15s;white-space:nowrap;';
        btn.addEventListener('mouseenter', function() { this.style.background='rgba(239,68,68,0.15)'; this.style.borderColor='rgba(239,68,68,0.5)'; this.style.color='#fca5a5'; });
        btn.addEventListener('mouseleave', function() { this.style.background='rgba(255,255,255,0.07)'; this.style.borderColor='rgba(255,255,255,0.18)'; this.style.color='rgba(255,255,255,0.55)'; });
    }
    btn.addEventListener('click', function() { openKitFlagPopup(type, fab, modele, annee, fc); });
    wrap.appendChild(btn);
    kitLockRow.appendChild(wrap);
}

function openKitFlagPopup(type, fab, modele, annee, fc) {
    var existing = document.getElementById('kit-flag-popup');
    if (existing) { existing.remove(); return; }
    var fk = kitFlagKey(type, fab, modele, annee);
    var fi = fc[fk];
    var isActive = fi && fi.active;

    var overlay = document.createElement('div');
    overlay.id = 'kit-flag-popup';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border:1px solid #333;border-radius:12px;padding:22px 20px;max-width:360px;width:90%;color:#e0e0e0;font-family:inherit;';
    box.innerHTML =
        '<h4 style="margin:0 0 6px;color:#fff;font-size:1rem;">\uD83D\uDEA9 ' + (isActive ? i18n.t('machine.flag_popup_active') : i18n.t('machine.flag_btn_title')) + '</h4>' +
        '<p style="color:#888;font-size:0.8rem;margin:0 0 14px;">' + fab + ' ' + modele + ' (' + annee + ')</p>' +
        (isActive ? '<div style="background:#111;border-radius:6px;padding:10px 12px;font-size:0.82rem;margin-bottom:14px;color:#aaa;">' +
            (fi.note ? '\u201C' + fi.note + '\u201D' : '<em style="color:#555;">' + i18n.t('machine.flag_no_note') + '</em>') +
            '<br><span style="font-size:0.74rem;color:#555;">' + i18n.t('machine.flag_by', { by: fi.flaggedBy, at: fi.flaggedAt }) + '</span></div>' : '') +
        (!isActive ? '<textarea id="kit-flag-note" placeholder="' + i18n.t('machine.flag_note_ph') + '" style="width:100%;box-sizing:border-box;background:#111;border:1px solid #333;color:#e0e0e0;border-radius:6px;padding:8px;font-size:0.82rem;resize:vertical;min-height:60px;margin-bottom:14px;font-family:inherit;"></textarea>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            (!isActive ? '<button id="kit-flag-set-btn" style="flex:1;background:#e53935;color:#fff;border:none;padding:9px 14px;border-radius:7px;cursor:pointer;font-weight:600;font-size:0.85rem;">' + i18n.t('machine.flag_set_btn') + '</button>' : '') +
            (isActive ? '<button id="kit-flag-resolve-btn" style="flex:1;background:#2e7d32;color:#fff;border:none;padding:9px 14px;border-radius:7px;cursor:pointer;font-weight:600;font-size:0.85rem;">' + i18n.t('machine.flag_resolve_btn') + '</button>' : '') +
            '<button id="kit-flag-cancel-btn" style="background:#222;color:#aaa;border:1px solid #444;padding:9px 14px;border-radius:7px;cursor:pointer;font-size:0.85rem;">' + i18n.t('common.annuler') + '</button>' +
        '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    if (!isActive) {
        document.getElementById('kit-flag-set-btn').addEventListener('click', function() {
            fc[fk] = { flaggedBy: currentUser.name || currentUser.username, flaggedAt: new Date().toLocaleString('fr-CA'), note: document.getElementById('kit-flag-note').value.trim(), active: true };
            saveKitFlagAndRefresh(type, fab, modele, annee, fc);
            overlay.remove();
        });
    } else {
        document.getElementById('kit-flag-resolve-btn').addEventListener('click', function() {
            if (fc[fk]) fc[fk].active = false;
            saveKitFlagAndRefresh(type, fab, modele, annee, fc);
            overlay.remove();
        });
    }
    document.getElementById('kit-flag-cancel-btn').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function saveKitFlagAndRefresh(type, fab, modele, annee, fc) {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: KIT_FLAGS_KEY, value: JSON.stringify(fc), pin: portalToken() })
    }).catch(function() {});
    renderKitFlagBtn(type, fab, modele, annee, fc);
}

// ---- NOTES SYSTEM ----
const API_URL = window.PORTAL_API_URL;  // #32 : centralise dans js/config.js (charge avant)
let currentNoteKey = '';

function getNotesKey(fab, modele, annee) {
    return 'notes_' + fab + '_' + modele + '_' + annee;
}

function loadNotes(type, fab, modele, annee) {
    const notesSection = document.getElementById('notes-section');
    const notesTextarea = document.getElementById('notes-textarea');
    const notesSaveBtn = document.getElementById('notes-save-btn');
    const notesStatus = document.getElementById('notes-status');
    if (!notesSection) return;

    currentNoteKey = getNotesKey(fab, modele, annee);
    notesTextarea.readOnly = false;
    notesSaveBtn.style.display = 'inline-block';
    notesStatus.textContent = '';
    notesSection.style.display = 'block';

    // BD = MAITRE : la note est lue directement dans machines.json (entry._notes)
    var entry = null;
    try { entry = machinesData[type][fab][annee][modele]; } catch(e) { entry = null; }
    notesTextarea.value = (entry && typeof entry._notes === 'string') ? entry._notes : '';
}

function unlockNotes() {}
function lockNotes() {}

function saveNotes() {
    const notesTextarea = document.getElementById('notes-textarea');
    const notesStatus = document.getElementById('notes-status');
    if (!notesTextarea || !currentNoteKey) return;

    var noteContent = notesTextarea.value;

    // Get current machine info
    var fab = selectFabricant ? selectFabricant.value : '';
    var modele = selectModele ? selectModele.value : '';
    var annee = selectAnnee ? selectAnnee.value : '';
    var typeM = selectType ? selectType.value : '';
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch(e) {}
    var userName = user ? user.name : 'Inconnu';
    var now = new Date();
    var dateStr = now.toLocaleDateString('fr-CA') + ' ' + now.toLocaleTimeString('fr-CA');

    notesStatus.textContent = i18n.t('js.saving');
    // Met a jour la copie en memoire (BD = maitre)
    try { machinesData[typeM][fab][annee][modele]._notes = noteContent; } catch(e) {}
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({
            action: 'updateMachineNotes',
            type: typeM, fab: fab, modele: modele, annee: annee,
            notes: noteContent,
            pin: portalToken()
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) {
            notesStatus.textContent = i18n.t('js.saved');
            // Send email notification to notes emails
            if (noteContent.trim()) {
                fetch(API_URL + '?action=get&key=notes_emails')
                    .then(function(r) { return r.json(); })
                    .then(function(emailData) {
                        var emails = [];
                        if (emailData.value) { try { emails = JSON.parse(emailData.value); } catch(e) {} }
                        if (emails.length > 0) {
                            var subject = i18n.t('email.note_subject', { fab: fab, modele: modele, annee: annee });
                            var body = i18n.t('email.note_body_header') + '\n\n' +
                                i18n.t('email.note_details') + '\n' +
                                i18n.t('email.note_type', { type: i18n.t('type.' + typeM) }) + '\n' +
                                i18n.t('email.note_fab', { fab: fab }) + '\n' +
                                i18n.t('email.note_modele', { modele: modele }) + '\n' +
                                i18n.t('email.note_annee', { annee: annee }) + '\n' +
                                i18n.t('email.note_written_by', { name: userName }) + '\n' +
                                i18n.t('email.note_datetime', { datetime: dateStr }) + '\n\n' +
                                i18n.t('email.note_content_header') + '\n' +
                                noteContent + '\n\n' +
                                '---\n' +
                                i18n.t('email.note_footer');
                            window.location.href = 'mailto:' + emails.join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
                        }
                    })
                    .catch(function() {});
            }
        } else {
            notesStatus.textContent = i18n.t('js.save_error', { error: (data.error || i18n.t('common.unknown')) });
        }
    })
    .catch(() => {
        notesStatus.textContent = i18n.t('js.offline_save');
    });
}

// ---- KIT OVERRIDE SYSTEM ----
var currentKitOverrideKey = '';
var currentKitOverrides = null;
var kitEditMode = false;

function getKitOverrideKey(fab, modele, annee) {
    return 'kit_override_' + fab.replace(/[^a-zA-Z0-9]/g,'_') + '_' + modele.replace(/[^a-zA-Z0-9]/g,'_') + '_' + annee;
}

// Coordonnees de la machine actuellement affichee (pour les saves vers machines.json)
var currentKitType = '', currentKitFab = '', currentKitModele = '', currentKitAnnee = '';

// BD = MAITRE : l'override BOM est lu directement dans machines.json (entry._bom),
// plus depuis les Script Properties. Normalise en format plat pour les callbacks.
function loadKitOverride(type, fab, modele, annee, callback) {
    currentKitType = type; currentKitFab = fab; currentKitModele = modele; currentKitAnnee = annee;
    currentKitOverrideKey = getKitOverrideKey(fab, modele, annee);
    currentKitOverrides = null;
    var entry = null;
    try { entry = machinesData[type][fab][annee][modele]; } catch(e) { entry = null; }
    var ov = (entry && entry._bom) ? toFlatOverride(entry._bom) : null;
    currentKitOverrides = ov;
    if (callback) callback(ov);
    else if (ov) applyKitOverrides(ov);
}

// Mapping code BOM (edit-machine.html / database.html) → kit id (machine.html)
var KIT_CODE_TO_ID = {
    // Excavatrice
    '0000':'cabine','0001':'hauteur','0002':'rotation','0304':'cremaillere',
    '0004':'mini','0070':'gc','0008':'swing','0009':'drain','0005':'multi',
    '0003':'sans-cabine',
    // Pompe a Beton
    '0200':'pompe-coffre','0203':'pompe-sans-coffre','0201':'pompe-hauteur','0202':'pompe-rotation',
    '0204':'pompe-4sec','0205':'pompe-5sec','0206':'pompe-6sec',
    '0207':'pompe-rot-cylindre','0208':'pompe-inclinometre','0209':'pompe-reel'
};
var STATUS_R_J_TO_LEGACY = { 'r':'red', 'j':'yellow', 'na':'na' };

// Convertit un override format edit-machine.html (codes plats + _custom, _removed, _specs)
// vers le format legacy (rows, customRows) attendu par machine.html
function normalizeKitOverrides(ov){
    if (!ov) return null;
    // Deja en format legacy ?
    if (ov.rows || ov.customRows) return ov;
    // Format edit-machine.html : convertir
    var rows = {};
    Object.keys(ov).forEach(function(k){
        if (k === '_specs' || k === '_custom' || k === '_removed' || k === 'harnais') return;
        var kitId = KIT_CODE_TO_ID[k];
        if (kitId) rows[kitId] = STATUS_R_J_TO_LEGACY[ov[k]] || 'na';
    });
    var customRows = [];
    if (Array.isArray(ov._custom)){
        ov._custom.forEach(function(c){
            customRows.push({
                id: c.code,
                label: c.desc || c.code,
                code: c.pn || c.code,
                status: STATUS_R_J_TO_LEGACY[c.status] || 'na'
            });
        });
    }
    return {
        rows: rows,
        customRows: customRows,
        harnais: ov.harnais || null,
        _removed: Array.isArray(ov._removed) ? ov._removed : [],
        _specs: ov._specs || null
    };
}

// Convertit n'importe quel format d'override (legacy {rows,customRows} OU plat)
// vers le format plat {code:'r'/'j'/'na', _custom, _removed, _specs, harnais},
// identique a normalizeOverride() de edit-machine.html.
function toFlatOverride(ov) {
    if (!ov || typeof ov !== 'object') return ov || null;
    if (!ov.rows && !ov.customRows) return ov; // deja en format plat
    var ID_TO_CODE = {};
    Object.keys(KIT_CODE_TO_ID).forEach(function(c) { ID_TO_CODE[KIT_CODE_TO_ID[c]] = c; });
    var LEG = { red: 'r', yellow: 'j', na: 'na' };
    var out = {};
    if (ov.rows) Object.keys(ov.rows).forEach(function(kid) {
        var c = ID_TO_CODE[kid];
        if (c) out[c] = LEG[ov.rows[kid]] || 'na';
    });
    if (Array.isArray(ov.customRows)) out._custom = ov.customRows.map(function(c) {
        return { code: c.id || c.code, pn: c.code || '', desc: c.label || '', status: LEG[c.status] || 'na' };
    });
    if (ov.harnais) out.harnais = ov.harnais;
    if (Array.isArray(ov._removed)) out._removed = ov._removed.slice();
    if (ov._specs) out._specs = ov._specs;
    return out;
}

function applyKitOverrides(overrides) {
    if (!overrides) return;
    overrides = normalizeKitOverrides(overrides);
    // Cache les lignes du catalogue retirees pour cette machine
    if (Array.isArray(overrides._removed)){
        overrides._removed.forEach(function(code){
            var kitId = KIT_CODE_TO_ID[code];
            if (!kitId) return;
            var row = document.querySelector('tr[data-kit="' + kitId + '"]');
            if (row) row.style.display = 'none';
        });
    }
    // Applique les overrides de specs (texte affiche dans le panneau specs)
    if (overrides._specs){
        Object.keys(overrides._specs).forEach(function(fullKey){
            // Recherche d'un element [data-spec-key="..."] (s'il existe dans machine.html)
            // ou par texte de label — best effort
            var val = overrides._specs[fullKey];
            document.querySelectorAll('[data-spec-key="' + fullKey + '"]').forEach(function(el){
                el.textContent = val;
            });
        });
    }
    // Apply status overrides to existing rows
    if (overrides.rows) {
        Object.keys(overrides.rows).forEach(function(kitId) {
            var status = overrides.rows[kitId]; // 'red', 'yellow', 'na'
            var row = document.querySelector('tr[data-kit="' + kitId + '"]');
            if (!row) {
                // Try finding by radio name
                var radio = document.querySelector('input[name="kit-' + kitId + '"]');
                if (radio) row = radio.closest('tr');
            }
            if (!row) return;
            var statusCell = row.querySelector('.kit-status-cell');
            if (!statusCell) return;
            var radioName = 'kit-' + kitId;
            // Find existing radio name from the row
            var existingRadio = row.querySelector('input[type="radio"]');
            if (existingRadio) radioName = existingRadio.name;

            if (status === 'red') {
                // Ensure radios exist
                if (!statusCell.querySelector('.radio-red')) {
                    statusCell.innerHTML = '<input type="radio" name="' + radioName + '" value="oui" class="radio-red"><input type="radio" name="' + radioName + '" value="non" class="radio-yellow">';
                }
                var redRadio = statusCell.querySelector('.radio-red');
                var yellowRadio = statusCell.querySelector('.radio-yellow');
                if (redRadio) redRadio.checked = true;
                if (yellowRadio) yellowRadio.checked = false;
                row.style.display = '';
            } else if (status === 'yellow') {
                // Ensure radios exist
                if (!statusCell.querySelector('.radio-yellow')) {
                    statusCell.innerHTML = '<input type="radio" name="' + radioName + '" value="oui" class="radio-red"><input type="radio" name="' + radioName + '" value="non" class="radio-yellow">';
                }
                var redR = statusCell.querySelector('.radio-red');
                var yellowR = statusCell.querySelector('.radio-yellow');
                if (yellowR) yellowR.checked = true;
                if (redR) redR.checked = false;
                row.style.display = '';
            } else if (status === 'na') {
                statusCell.innerHTML = '<span class="kit-na">N/A</span>';
            }
        });
    }
    // Add custom rows
    if (overrides.customRows && overrides.customRows.length > 0) {
        var tbody = document.querySelector('.kit-table tbody');
        if (!tbody) return;
        // Remove existing custom rows
        tbody.querySelectorAll('tr[data-custom="true"]').forEach(function(r) { r.remove(); });
        overrides.customRows.forEach(function(custom) {
            var tr = document.createElement('tr');
            tr.setAttribute('data-custom', 'true');
            tr.setAttribute('data-custom-id', custom.id);
            var statusHtml = '';
            if (custom.status === 'red') {
                statusHtml = '<input type="radio" name="kit-custom-' + custom.id + '" value="oui" class="radio-red" checked><input type="radio" name="kit-custom-' + custom.id + '" value="non" class="radio-yellow">';
            } else if (custom.status === 'yellow') {
                statusHtml = '<input type="radio" name="kit-custom-' + custom.id + '" value="oui" class="radio-red"><input type="radio" name="kit-custom-' + custom.id + '" value="non" class="radio-yellow" checked>';
            } else {
                statusHtml = '<span class="kit-na">N/A</span>';
            }
            tr.innerHTML =
                '<td>' + custom.label + '</td>' +
                '<td class="kit-code">' + custom.code + '</td>' +
                '<td class="kit-status-cell">' + statusHtml + '</td>' +
                '<td class="kit-check-cell"><input type="checkbox" class="kit-checkbox"></td>';
            tbody.appendChild(tr);
        });
    }
    updateKitCheckboxes();
}

function saveKitOverride(overrideData) {
    if (!currentKitType || !currentKitFab || !currentKitModele || !currentKitAnnee) return;

    // Entree courante + override existant (pose eventuellement par edit-machine.html)
    var entry = null;
    try { entry = machinesData[currentKitType][currentKitFab][currentKitAnnee][currentKitModele]; } catch(e) { entry = null; }
    var prev = (entry && entry._bom) ? entry._bom : {};

    // Convertit l'override de l'editeur inline (legacy) en format plat, puis preserve
    // les champs riches que cet editeur ne gere pas (specs, lignes retirees, harnais).
    var flat = toFlatOverride(overrideData) || {};
    if (prev._specs && !flat._specs) flat._specs = prev._specs;
    if (prev._removed && !flat._removed) flat._removed = prev._removed;
    if (prev.harnais && !flat.harnais) flat.harnais = prev.harnais;

    currentKitOverrides = flat;
    try { localStorage.setItem(getKitOverrideKey(currentKitFab, currentKitModele, currentKitAnnee), JSON.stringify(flat)); } catch(e) {}
    try { machinesData[currentKitType][currentKitFab][currentKitAnnee][currentKitModele]._bom = flat; } catch(e) {}

    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({
            action: 'updateMachineBom',
            type: currentKitType, fab: currentKitFab, modele: currentKitModele, annee: currentKitAnnee,
            bomOverride: flat, harnais: (flat.harnais || ''), pin: portalToken()
        })
    }).catch(function() {});
}

function collectCurrentKitState() {
    var rows = {};
    document.querySelectorAll('.kit-table tbody tr:not([data-custom="true"])').forEach(function(tr) {
        var radio = tr.querySelector('input[type="radio"]');
        var kitId = tr.getAttribute('data-kit');
        if (!kitId && radio) {
            kitId = radio.name.replace('kit-', '');
        }
        if (!kitId) return;
        var na = tr.querySelector('.kit-na');
        if (na) {
            rows[kitId] = 'na';
        } else {
            var red = tr.querySelector('.radio-red');
            var yellow = tr.querySelector('.radio-yellow');
            if (red && red.checked) rows[kitId] = 'red';
            else if (yellow && yellow.checked) rows[kitId] = 'yellow';
            else rows[kitId] = 'na';
        }
    });
    var customRows = [];
    document.querySelectorAll('.kit-table tbody tr[data-custom="true"]').forEach(function(tr) {
        var customId = tr.getAttribute('data-custom-id');
        var label = tr.cells[0] ? tr.cells[0].textContent : '';
        var code = tr.cells[1] ? tr.cells[1].textContent : '';
        var na = tr.querySelector('.kit-na');
        var status = 'na';
        if (!na) {
            var red = tr.querySelector('.radio-red');
            var yellow = tr.querySelector('.radio-yellow');
            if (red && red.checked) status = 'red';
            else if (yellow && yellow.checked) status = 'yellow';
        }
        customRows.push({ id: customId, label: label, code: code, status: status });
    });
    return { rows: rows, customRows: customRows };
}

function enterKitEditMode() {
    kitEditMode = true;
    var kitTable = document.querySelector('.kit-table');
    if (kitTable) kitTable.classList.add('kit-edit-mode');

    // Transform each status cell into a dropdown
    document.querySelectorAll('.kit-table tbody tr').forEach(function(tr) {
        var statusCell = tr.querySelector('.kit-status-cell');
        if (!statusCell) return;

        var currentStatus = 'na';
        var red = statusCell.querySelector('.radio-red');
        var yellow = statusCell.querySelector('.radio-yellow');
        var na = statusCell.querySelector('.kit-na');
        if (red && red.checked) currentStatus = 'red';
        else if (yellow && yellow.checked) currentStatus = 'yellow';
        else if (na) currentStatus = 'na';
        else if (red || yellow) currentStatus = 'yellow'; // radios exist but none checked

        var select = document.createElement('select');
        select.className = 'kit-status-select';
        select.innerHTML =
            '<option value="red"' + (currentStatus === 'red' ? ' selected' : '') + '>' + i18n.t('common.obligatoire') + '</option>' +
            '<option value="yellow"' + (currentStatus === 'yellow' ? ' selected' : '') + '>' + i18n.t('common.optionnel') + '</option>' +
            '<option value="na"' + (currentStatus === 'na' ? ' selected' : '') + '>' + i18n.t('db.legend_na') + '</option>';
        statusCell.innerHTML = '';
        statusCell.appendChild(select);

        // Add delete button for custom rows
        var isCustom = tr.getAttribute('data-custom') === 'true';
        if (isCustom) {
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'kit-delete-row-btn';
            deleteBtn.textContent = '\u2715';
            deleteBtn.title = i18n.t('js.option_delete_title');
            deleteBtn.addEventListener('click', function() { tr.remove(); });
            tr.cells[0].appendChild(deleteBtn);
        }
    });

    // Add action bar
    var kitSection = document.getElementById('kit-machine-section');
    if (!kitSection) return;

    // Remove existing action bars
    var existing = kitSection.querySelector('.kit-edit-actions');
    if (existing) existing.remove();

    var actions = document.createElement('div');
    actions.className = 'kit-edit-actions';
    actions.innerHTML =
        '<button id="kit-add-row-btn" class="kit-add-row-btn">' + i18n.t('js.add_option') + '</button>' +
        '<div class="kit-edit-btns">' +
        '<button id="kit-save-btn" class="kit-save-btn">' + i18n.t('common.sauvegarder') + '</button>' +
        '<button id="kit-cancel-btn" class="kit-cancel-btn">' + i18n.t('common.annuler') + '</button>' +
        '</div>';
    kitSection.appendChild(actions);

    // Add row form (hidden by default)
    var addForm = document.createElement('div');
    addForm.id = 'kit-add-form';
    addForm.className = 'kit-add-row-form';
    addForm.style.display = 'none';
    addForm.innerHTML =
        '<input type="text" id="kit-new-label" class="kit-new-input" placeholder="' + i18n.t('js.option_name_placeholder') + '">' +
        '<input type="text" id="kit-new-code" class="kit-new-input" placeholder="' + i18n.t('js.option_code_placeholder') + '">' +
        '<select id="kit-new-status" class="kit-status-select">' +
        '<option value="red">' + i18n.t('common.obligatoire') + '</option>' +
        '<option value="yellow" selected>' + i18n.t('common.optionnel') + '</option>' +
        '</select>' +
        '<button id="kit-new-add" class="kit-new-add-btn">' + i18n.t('common.ajouter') + '</button>';
    kitSection.insertBefore(addForm, actions);

    // Event listeners
    document.getElementById('kit-add-row-btn').addEventListener('click', function() {
        var form = document.getElementById('kit-add-form');
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('kit-new-add').addEventListener('click', function() {
        var label = document.getElementById('kit-new-label').value.trim();
        var code = document.getElementById('kit-new-code').value.trim();
        var status = document.getElementById('kit-new-status').value;
        if (!label) return;
        var customId = 'custom_' + Date.now();
        var tbody = document.querySelector('.kit-table tbody');
        var tr = document.createElement('tr');
        tr.setAttribute('data-custom', 'true');
        tr.setAttribute('data-custom-id', customId);
        var select = '<select class="kit-status-select">' +
            '<option value="red"' + (status === 'red' ? ' selected' : '') + '>' + i18n.t('common.obligatoire') + '</option>' +
            '<option value="yellow"' + (status === 'yellow' ? ' selected' : '') + '>' + i18n.t('common.optionnel') + '</option>' +
            '<option value="na">' + i18n.t('db.legend_na') + '</option></select>';
        tr.innerHTML =
            '<td>' + label + '<button class="kit-delete-row-btn" title="' + i18n.t('edit.t_delete') + '">\u2715</button></td>' +
            '<td class="kit-code">' + code + '</td>' +
            '<td class="kit-status-cell">' + select + '</td>' +
            '<td class="kit-check-cell"><input type="checkbox" class="kit-checkbox"></td>';
        tbody.appendChild(tr);
        tr.querySelector('.kit-delete-row-btn').addEventListener('click', function() { tr.remove(); });
        document.getElementById('kit-new-label').value = '';
        document.getElementById('kit-new-code').value = '';
    });

    document.getElementById('kit-save-btn').addEventListener('click', function() {
        saveKitEditMode();
    });

    document.getElementById('kit-cancel-btn').addEventListener('click', function() {
        exitKitEditMode(false);
    });

    // Show edit button as active
    var editBtn = document.getElementById('kit-edit-btn');
    if (editBtn) editBtn.classList.add('active');
}

function saveKitEditMode() {
    // Collect state from dropdowns
    var rows = {};
    document.querySelectorAll('.kit-table tbody tr:not([data-custom="true"])').forEach(function(tr) {
        var select = tr.querySelector('.kit-status-select');
        var kitId = tr.getAttribute('data-kit');
        if (!kitId) {
            var radio = tr.querySelector('input[type="radio"]');
            if (radio) kitId = radio.name.replace('kit-', '');
        }
        // If no kitId found from data-kit or radio, try to find from the original radios name
        if (!kitId) {
            // Use a simple index-based ID
            var idx = Array.from(tr.parentNode.children).indexOf(tr);
            kitId = 'row_' + idx;
        }
        if (select) {
            rows[kitId] = select.value;
        }
    });
    var customRows = [];
    document.querySelectorAll('.kit-table tbody tr[data-custom="true"]').forEach(function(tr) {
        var customId = tr.getAttribute('data-custom-id');
        var label = tr.cells[0] ? tr.cells[0].textContent.replace('\u2715', '').trim() : '';
        var code = tr.cells[1] ? tr.cells[1].textContent : '';
        var select = tr.querySelector('.kit-status-select');
        var status = select ? select.value : 'na';
        customRows.push({ id: customId, label: label, code: code, status: status });
    });

    var overrideData = { rows: rows, customRows: customRows };
    currentKitOverrides = overrideData;
    saveKitOverride(overrideData);

    exitKitEditMode(true);
    showKitToast(i18n.t('js.kit_saved'));
}

function exitKitEditMode(applyChanges) {
    kitEditMode = false;
    var kitTable = document.querySelector('.kit-table');
    if (kitTable) kitTable.classList.remove('kit-edit-mode');

    // Remove action bar and add form
    var kitSection = document.getElementById('kit-machine-section');
    if (kitSection) {
        var actions = kitSection.querySelector('.kit-edit-actions');
        if (actions) actions.remove();
        var addForm = document.getElementById('kit-add-form');
        if (addForm) addForm.remove();
    }

    // Re-trigger the model display to reset + re-apply overrides
    if (selectModele && selectModele.value) {
        var type = selectType.value;
        var fab = selectFabricant.value;
        var annee = selectAnnee.value;
        var modele = selectModele.value;
        if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee] && machinesData[type][fab][annee][modele]) {
            // Re-run the full display pipeline
            selectModele.dispatchEvent(new Event('change'));
        }
    }

    var editBtn = document.getElementById('kit-edit-btn');
    if (editBtn) editBtn.classList.remove('active');
}

function showKitToast(msg) {
    var existing = document.querySelector('.kit-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'kit-toast';
    toast.textContent = msg;
    var kitSection = document.getElementById('kit-machine-section');
    if (kitSection) kitSection.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 2500);
}

// ---- EMAIL MANAGEMENT ----
const DEFAULT_EMAILS = ['robin@gryb.ca', 'k.berube@e-trak.ca'];
let targetEmails = [...DEFAULT_EMAILS];

function loadEmails() {
    fetch(API_URL + '?action=get&key=target_emails')
        .then(r => r.json())
        .then(data => {
            if (data.value) {
                try { targetEmails = JSON.parse(data.value); } catch(e) {}
            }
            renderEmailList();
        })
        .catch(() => renderEmailList());
}

function saveEmails() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'target_emails', value: JSON.stringify(targetEmails), pin: portalToken() })
    }).catch(() => {});
}

function renderEmailList() {
    const list = document.getElementById('email-list');
    if (!list) return;
    list.innerHTML = '';
    var canEdit = currentUser && currentUser.permissions && currentUser.permissions.modifAccounts;
    targetEmails.forEach((email, i) => {
        const item = document.createElement('div');
        item.className = 'email-item';
        item.innerHTML = '<span>' + email + '</span><button class="email-delete-btn ' + (canEdit ? 'visible' : '') + '" data-idx="' + i + '" title="' + i18n.t('edit.t_delete') + '">\u2715</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.email-delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.dataset.idx);
            targetEmails.splice(idx, 1);
            saveEmails();
            renderEmailList();
        });
    });
}

function getMailTo() {
    return targetEmails.join(',');
}

// ---- USER MANAGEMENT ----
// Action authentifiee 'listusers' : sans mots de passe (sauf token admin).
function loadUsers() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'listusers', token: portalToken() })
    })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (Array.isArray(data.users) && data.users.length > 0) {
                AUTHORIZED_USERS.length = 0;
                data.users.forEach(function(u) { AUTHORIZED_USERS.push(u); });
            }
            renderUserList();
            // Re-validate session with fresh user list
            var sess = localStorage.getItem('portal_user');
            if (sess && !currentUser) {
                try {
                    var p = JSON.parse(sess);
                    var v = AUTHORIZED_USERS.find(function(u) { return u.username.toLowerCase() === (p.username || '').toLowerCase(); });
                    if (v) {
                        currentUser = { username: v.username, name: v.name, role: v.role, permissions: getUserPermissions(v.role) };
                        updateLoginUI();
                    }
                } catch(e) {}
            }
        })
        .catch(function() { renderUserList(); });
}

function saveUsers() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'authorized_users_v2', value: JSON.stringify(AUTHORIZED_USERS), pin: portalToken() })
    }).catch(function() {});
}

function renderUserList() {
    var list = document.getElementById('user-list');
    if (!list) return;
    list.innerHTML = '';
    var canEdit = currentUser && currentUser.permissions && currentUser.permissions.modifAccounts;
    AUTHORIZED_USERS.forEach(function(user, i) {
        var item = document.createElement('div');
        item.className = 'email-item';
        var roleLabel = i18n.t('role.' + user.role);
        item.innerHTML = '<span>' + user.name + ' \u2014 ' + roleLabel + '</span>' +
            '<button class="email-delete-btn user-delete-btn ' + (canEdit ? 'visible' : '') + '" data-idx="' + i + '" title="' + i18n.t('edit.t_delete') + '">\u2715</button>';
        list.appendChild(item);
    });
    list.querySelectorAll('.user-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.dataset.idx);
            AUTHORIZED_USERS.splice(idx, 1);
            saveUsers();
            renderUserList();
        });
    });
}

// ---- USER DROPDOWN ----
function closeUserDropdown() {
    var dd = document.getElementById('user-dropdown');
    var overlay = document.getElementById('ud-overlay');
    if (dd) dd.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

function openUserDropdown() {
    var dd = document.getElementById('user-dropdown');
    var overlay = document.getElementById('ud-overlay');
    if (dd) dd.classList.add('open');
    if (overlay) overlay.classList.add('active');
    renderEmailList();

    // Show admin link based on permissions
    var adminLink = document.getElementById('ud-admin-link');
    if (adminLink && currentUser) {
        adminLink.style.display = currentUser.permissions.modifAccounts ? 'block' : 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('notes-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveNotes);






    // Load emails and users on startup
    loadEmails();
    loadUsers();

    // Radio uncheck logic
    document.querySelectorAll('.kit-table input[type="radio"]').forEach(radio => {
        radio.addEventListener('click', function(e) {
            if (this.dataset.wasChecked === 'true') {
                this.checked = false;
                this.dataset.wasChecked = 'false';
            } else {
                document.querySelectorAll('input[name="' + this.name + '"]').forEach(r => {
                    r.dataset.wasChecked = 'false';
                });
                this.dataset.wasChecked = 'true';
            }
            updateKitCheckboxes();
        });
        radio.addEventListener('mousedown', function() {
            this.dataset.wasChecked = this.checked ? 'true' : 'false';
        });
        radio.addEventListener('touchstart', function() {
            this.dataset.wasChecked = this.checked ? 'true' : 'false';
        });
    });

    // ---- LOGIN UI (session from localStorage, login on index.html) ----
    function updateLoginUI() {
        var kitTable = document.querySelector('.kit-table');
        var loginBtnEl = document.getElementById('login-btn');
        var userMenuBtnEl = document.getElementById('user-menu-btn');
        var userMenuName = document.getElementById('user-menu-name');

        if (currentUser) {
            if (loginBtnEl) loginBtnEl.style.display = 'none';
            if (userMenuBtnEl) userMenuBtnEl.style.display = 'flex';
            if (userMenuName) userMenuName.textContent = currentUser.name;
            // SEL column visible only for admin/super admin
            var isAdmin = currentUser.permissions && currentUser.permissions.modifAccounts;
            if (kitTable) {
                if (isAdmin) {
                    kitTable.classList.remove('hide-sel');
                } else {
                    kitTable.classList.add('hide-sel');
                }
            }
        } else {
            if (loginBtnEl) loginBtnEl.style.display = '';
            if (userMenuBtnEl) userMenuBtnEl.style.display = 'none';
            if (kitTable) kitTable.classList.add('hide-sel');
        }
        updateKitCheckboxes();
        updateQuoteButton();
        updateKitLockButton();
    }

    // Restore session from localStorage
    var saved = localStorage.getItem('portal_user');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            if (parsed && parsed.username) {
                // Restore with permissions from role
                currentUser = {
                    username: parsed.username,
                    name: parsed.name || parsed.username,
                    role: parsed.role || 'dealer',
                    permissions: parsed.permissions || getUserPermissions(parsed.role || 'dealer')
                };
            }
        } catch(e) {}
    }
    updateLoginUI();
    updateKitLockButton();

    // ---- QUOTE REQUEST ----
    var quoteBtn = document.getElementById('kit-quote-btn');
    if (quoteBtn) {
        quoteBtn.addEventListener('click', function() {
            if (!currentUser) return;
            var fab = selectFabricant.value;
            var modele = selectModele.value;
            var annee = selectAnnee.value;
            if (!fab || !modele || !annee) return;

            var options = [];
            document.querySelectorAll('.kit-table tbody tr').forEach(function(row) {
                var cb = row.querySelector('.kit-checkbox');
                if (cb && cb.checked) {
                    var label = row.querySelector('td').textContent.trim();
                    var code = row.querySelector('.kit-code') ? row.querySelector('.kit-code').textContent.trim() : '';
                    options.push(code + ' — ' + label);
                }
            });

            if (options.length === 0) return;

            var mailTo = getMailTo();
            var subject = i18n.t('email.kit_quote_subject', { fab: fab, modele: modele, annee: annee });
            var body =
                i18n.t('email.kit_quote_header') + '\n\n' +
                i18n.t('email.machine_header') + ' ' + fab + ' ' + modele + ' (' + annee + ')\n' +
                i18n.t('email.requested_by', { name: currentUser.username }) + '\n\n' +
                i18n.t('soumission.selected_options') + ':\n' +
                options.map(function(o) { return '  - ' + o; }).join('\n') +
                '\n\nPortail Machine e-Trak\nhttps://etraksolutions.github.io/portal-machine-V2/';

            window.location.href = 'mailto:' + mailTo + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        });
    }
});

function updateQuoteButton() {
    var section = document.getElementById('kit-quote-section');
    if (!section) return;
    var kitVisible = document.getElementById('kit-machine-section');
    if (currentUser && kitVisible && kitVisible.style.display !== 'none') {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

function resetFrom(level) {
    const levels = ['fabricant', 'annee', 'modele'];
    const startIdx = levels.indexOf(level);

    const selects = [selectFabricant, selectAnnee, selectModele];
    const defaults = (typeof i18n !== 'undefined') ? [
        i18n.t('js.select_fab'),
        i18n.t('js.select_ann'),
        i18n.t('js.select_mod')
    ] : [
        '-- Selectionnez un fabricant --',
        '-- Selectionnez une annee --',
        '-- Selectionnez un modele --'
    ];

    for (let i = startIdx; i < levels.length; i++) {
        const sel = selects[i];
        sel.innerHTML = `<option value="">${defaults[i]}</option>`;
        sel.disabled = true;
    }

    hideResults();
}

// Reset button
btnReset.addEventListener('click', () => {
    selectType.value = '';
    resetFrom('fabricant');
    btnReset.style.display = 'none';
});

// Hamburger menu (only present on index.html — guard against null on other pages)
const hamburgerBtn = document.getElementById('hamburger-btn');
const hamburgerMenu = document.getElementById('hamburger-menu');

if (hamburgerBtn && hamburgerMenu) {
    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburgerBtn.classList.toggle('active');
        hamburgerMenu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!hamburgerMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            hamburgerBtn.classList.remove('active');
            hamburgerMenu.classList.remove('open');
        }
    });
}

// Kit lock/unlock — permission-based (no PIN needed)
var kitLockBtn = document.getElementById('kit-lock-btn');
var kitUnlocked = false;

function toggleKitEdit() {
    if (kitEditMode) {
        exitKitEditMode(false);
    } else {
        enterKitEditMode();
    }
}

function toggleKitLock() {
    // L'edition du BOM se fait maintenant uniquement via edit-machine.html
    // (lien depuis la base de donnees)
    if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
        var m = window.__currentMachine || {};
        if (!m.type || !m.fab) { alert((typeof i18n !== 'undefined') ? i18n.t('machine.select_machine_first') : 'Selectionnez d\'abord une machine.'); return; }
        var url = 'edit-machine.html'
            + '?type=' + encodeURIComponent(m.type)
            + '&fab=' + encodeURIComponent(m.fab)
            + '&year=' + encodeURIComponent(m.annee)
            + '&model=' + encodeURIComponent(m.modele);
        window.location.href = url;
    } else {
        alert((typeof i18n !== 'undefined') ? i18n.t('js.permission_denied') : 'Permission insuffisante. Connectez-vous avec un compte ayant la permission de modification BOM.');
    }
}

function updateKitLockButton() {
    if (!kitLockBtn) return;
    if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
        kitLockBtn.classList.add('perm-unlock');
        kitLockBtn.title = (typeof i18n !== 'undefined') ? i18n.t('machine.edit_open_title') : 'Ouvrir la page d\'edition (BOM, harnais, specs, notes)';
        kitLockBtn.innerHTML = '&#9881;&#65039;'; // gear icon
    } else {
        kitLockBtn.classList.remove('perm-unlock');
        kitLockBtn.title = (typeof i18n !== 'undefined') ? i18n.t('machine.edit_db_title') : 'Edition BOM disponible via la base de donnees (admin requis)';
    }
}

function updateKitCheckboxes() {
    var loggedIn = !!currentUser;
    document.querySelectorAll('.kit-table tbody tr').forEach(function(row) {
        var cb = row.querySelector('.kit-checkbox');
        if (!cb) return;
        var redRadio = row.querySelector('input.radio-red');
        var yellowRadio = row.querySelector('input.radio-yellow');
        cb.classList.remove('auto-checked');
        cb.disabled = false;
        if (redRadio && redRadio.checked) {
            cb.checked = true;
            cb.classList.add('auto-checked');
        } else if (yellowRadio && yellowRadio.checked) {
            if (!loggedIn) {
                cb.checked = false;
                cb.disabled = true;
            }
        } else {
            cb.checked = false;
            if (!loggedIn) cb.disabled = true;
        }
        var naSpan = row.querySelector('.kit-na');
        if (naSpan) {
            cb.style.display = 'none';
        } else {
            cb.style.display = '';
        }
    });
    updateQuoteButton();
}

function lockKit() {
    kitUnlocked = false;
    var kitTable = document.querySelector('.kit-table');
    var btn = document.getElementById('kit-lock-btn');
    if (kitTable) kitTable.classList.add('kit-locked');
    if (btn) { btn.innerHTML = '&#128274;'; btn.classList.remove('unlocked', 'editing'); btn.title = i18n.t('machine.kit_unlock_title'); }
    lockNotes();
}

function unlockKit() {
    kitUnlocked = true;
    var kitTable = document.querySelector('.kit-table');
    var btn = document.getElementById('kit-lock-btn');
    if (kitTable) kitTable.classList.remove('kit-locked');
    if (btn) { btn.innerHTML = '&#128275;'; btn.classList.add('unlocked'); btn.classList.remove('editing'); btn.title = i18n.t('machine.kit_edit_tokens_title'); }
    unlockNotes();
}

if (kitLockBtn) {
    kitLockBtn.onclick = function() {
        if (kitUnlocked) {
            lockKit();
        } else {
            if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
                unlockKit();
            } else {
                alert((typeof i18n !== 'undefined') ? i18n.t('js.permission_denied') : 'Permission insuffisante. Connectez-vous avec un compte ayant la permission de modification BOM.');
            }
        }
    };
}

// Kit edit button listener — use onclick (addEventListener fails on some reflows)
var kitEditBtn = document.getElementById('kit-edit-btn');
if (kitEditBtn) {
    kitEditBtn.onclick = function() {
        if (kitEditMode) {
            exitKitEditMode(false);
        } else {
            enterKitEditMode();
        }
    };
}

// Re-translate dynamic dropdown content on language change
window.addEventListener('langchange', function() {
    // Re-translate type options
    Array.from(selectType.options).forEach(function(opt) {
        if (opt.value) opt.textContent = (typeof i18n !== 'undefined') ? i18n.t('type.' + opt.value) : opt.value;
    });
    // Update placeholder text of disabled/empty selects
    [selectFabricant, selectAnnee].forEach(function(sel) {
        var first = sel.options[0];
        if (first && first.value === '') {
            var key = sel === selectFabricant ? 'js.select_fab' : 'js.select_ann';
            first.textContent = (typeof i18n !== 'undefined') ? i18n.t(key) : first.textContent;
        }
    });
    var firstMod = selectModele.options[0];
    if (firstMod && firstMod.value === '') {
        firstMod.textContent = (typeof i18n !== 'undefined') ? i18n.t('common.selectionnez') : firstMod.textContent;
    }
    // Re-translate "Other model" option
    var otherOpt = selectModele.querySelector('option[value="__OTHER__"]');
    if (otherOpt) otherOpt.textContent = (typeof i18n !== 'undefined') ? i18n.t('js.other_model') : otherOpt.textContent;
    // Si une machine est affichee, re-render la fiche (badge type, classe, specs) dans la nouvelle langue.
    try {
        var m = window.__currentMachine;
        if (m && resultsSection && resultsSection.style.display !== 'none') {
            var sp = machinesData[m.type][m.fab][m.annee][m.modele];
            if (sp) showResults(m.modele, m.type, m.fab, m.annee, sp, false);
        }
    } catch (e) {}
});

// Auto-unlock if user has permission, otherwise lock
if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
    unlockKit();
} else {
    lockKit();
}