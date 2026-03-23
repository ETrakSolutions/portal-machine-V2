// ============================================
// e-Trak Portal Machine — App Logic v2.0
// Unified login + role-based permissions
// ============================================

let machinesData = {};

// ---- ROLE PERMISSIONS ----
const ROLES = {
    administrateur: { modifBom: true, createAccount: true, modifAccounts: true, shareAccess: true, machineAccess: true, soumissionAccess: true, label: 'Administrateur' },
    vendeur_etrak:  { modifBom: false, createAccount: false, modifAccounts: false, shareAccess: true, machineAccess: true, soumissionAccess: true, label: 'Vendeur e-Trak' },
    distributeur:   { modifBom: false, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: false, soumissionAccess: true, label: 'Distributeur' },
    dealer:         { modifBom: false, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: false, soumissionAccess: true, label: 'Dealer' },
    technicien:     { modifBom: true, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: true, soumissionAccess: false, label: 'Technicien' },
    vente_interne:  { modifBom: false, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: true, soumissionAccess: true, label: 'Vente interne' },
    ingenierie:     { modifBom: true, createAccount: true, modifAccounts: false, shareAccess: false, machineAccess: true, soumissionAccess: false, label: 'Ingenierie' }
};

// ---- LOGIN SYSTEM ----
const AUTHORIZED_USERS = [
    { username: 'administrateur', email: 'robin@gryb.ca', password: '1400', role: 'administrateur', name: 'Robin Gagnon', active: true },
    { username: 'jacquot', email: 'jacquot@gryb.ca', password: '1234', role: 'administrateur', name: 'Jacquot', active: true }
];
let currentUser = null; // { username, name, role, permissions }

function getUserPermissions(role) {
    return ROLES[role] || { modifBom: false, createAccount: false, modifAccounts: false };
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
fetch('data/machines.json')
    .then(res => res.json())
    .then(data => {
        machinesData = data;
        populateTypes();
    })
    .catch(err => console.error('Erreur chargement donnees:', err));

function populateTypes() {
    const types = Object.keys(machinesData).sort();
    types.forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        selectType.appendChild(opt);
    });
}

// Type changed
selectType.addEventListener('change', () => {
    resetFrom('fabricant');
    const type = selectType.value;
    if (!type) return;

    const fabricants = Object.keys(machinesData[type]).sort();
    fabricants.forEach(fab => {
        const opt = document.createElement('option');
        opt.value = fab;
        opt.textContent = fab;
        selectFabricant.appendChild(opt);
    });
    selectFabricant.disabled = false;
    btnReset.style.display = 'inline-block';
});

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
});

// Annee changed
selectAnnee.addEventListener('change', () => {
    resetFrom('modele');
    const type = selectType.value;
    const fab = selectFabricant.value;
    const annee = selectAnnee.value;
    if (!annee) return;

    const modeles = Object.keys(machinesData[type][fab][annee]).sort();
    modeles.forEach(modele => {
        const opt = document.createElement('option');
        opt.value = modele;
        opt.textContent = modele;
        selectModele.appendChild(opt);
    });
    // Add "Autre modele" option
    const optAutre = document.createElement('option');
    optAutre.value = '__OTHER__';
    optAutre.textContent = '\u2295 Autre modele (pas dans la liste)';
    optAutre.style.fontStyle = 'italic';
    selectModele.appendChild(optAutre);
    selectModele.disabled = false;
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
        btn.textContent = '\uD83D\uDDD1 Supprimer ' + fab + ' ' + modele + ' (' + annee + ')';
    } else {
        btn.disabled = true;
        btn.textContent = '\uD83D\uDDD1 Aucun modele selectionne';
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

        if (!confirm('\u26A0 Confirmer la suppression :\n\n' + fab + ' ' + mod + '\nAnnee : ' + annee + ' seulement\n\nCette action est irreversible.')) return;

        // Delete from local data
        if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee]) {
            delete machinesData[type][fab][annee][mod];
        }

        // Save deletion to API
        fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'text/plain'},
            body: JSON.stringify({ action: 'save', key: 'deleted_' + type + '_' + fab + '_' + annee + '_' + mod, value: 'deleted', pin: '1400' })
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
    const annee = selectAnnee.value;
    const modele = selectModele.value;
    if (!modele) {
        hideResults();
        return;
    }

    if (modele === '__OTHER__') {
        showCustomModelModal(type, fab, annee);
        return;
    }

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
            pin: '1400'
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
    resultsTitle.textContent = `${fab} ${modele} (${annee})`;
    resultsBadge.textContent = type;

    const poidsVal = specs['Poids operationnel (kg / lbs)'] || '';
    const poidsNum = parseInt((poidsVal.match(/^(\d+)/) || [])[1]) || 0;
    let classMachine = '';
    if (poidsNum > 0) {
        if (poidsNum < 2000) classMachine = 'Ultra-micro';
        else if (poidsNum < 6000) classMachine = 'Mini';
        else if (poidsNum < 10000) classMachine = 'Compact';
        else if (poidsNum < 20000) classMachine = 'Standard';
        else if (poidsNum < 35000) classMachine = 'Moyen';
        else if (poidsNum < 50000) classMachine = 'Grand';
        else if (poidsNum < 80000) classMachine = 'Tres grand';
        else classMachine = 'Mining';
    }
    const tractionVal = specs['Type de traction'] || '';
    if (tractionVal === 'Roue') classMachine += ' (sur roues)';

    let html = '<table class="specs-table">';
    if (classMachine) {
        html += `<tr><td>Classe machine</td><td><strong>${classMachine}</strong></td></tr>`;
    }
    for (const [key, value] of Object.entries(specs)) {
        if (key === 'Image') {
            if (value && value.trim() !== '') {
                html += `<tr><td>${key}</td><td><img src="${value}" alt="${fab} ${modele}" style="max-width:300px;max-height:200px;border-radius:6px;"></td></tr>`;
            } else {
                html += `<tr><td>${key}</td><td class="text-muted">Image non disponible</td></tr>`;
            }
        } else if (key === 'Type de traction' && value === 'Roue') {
            html += `<tr><td>${key}</td><td><span class="flash-yellow">${value}</span></td></tr>`;
        } else if (key === 'Type de boom' && value.includes('2 parties')) {
            html += `<tr><td>${key}</td><td><span class="flash-yellow">${value}</span></td></tr>`;
        } else if (key === 'Swing boom' && value === 'Oui') {
            html += `<tr><td>${key}</td><td><span class="flash-yellow">${value}</span></td></tr>`;
        } else if (key === 'Voltage machine (V/type)' && value.includes('12V')) {
            html += `<tr><td>${key}</td><td><span class="flash-yellow">${value}</span></td></tr>`;
        } else {
            html += `<tr><td>${key}</td><td>${value}</td></tr>`;
        }
    }
    html += '</table>';

    if (isCustom) {
        const mailTo = getMailTo();
        const mailSubject = encodeURIComponent('Demande Kit Machine \u2014 ' + fab + ' ' + modele + ' (' + annee + ')');
        const mailBody = encodeURIComponent(
            'Bonjour,\n\n' +
            'Veuillez configurer le kit machine pour :\n\n' +
            '- Type : ' + type + '\n' +
            '- Fabricant : ' + fab + '\n' +
            '- Modele : ' + modele + '\n' +
            '- Annee : ' + annee + '\n\n' +
            'Merci de selectionner les options necessaires (Obligatoire / Option) pour cette machine.\n\n' +
            'Portail Machine e-Trak\n' +
            'https://etraksolutions.github.io/portal-machine/'
        );
        html += '<div class="kit-request-box">' +
            '<p class="kit-request-text">\u26A0 Ce modele n\'est pas dans la base de donnees. Les specifications sont a completer.</p>' +
            '<a href="mailto:' + mailTo + '?subject=' + mailSubject + '&body=' + mailBody + '" class="kit-request-btn">\uD83D\uDCE7 Demande kit machine</a>' +
            '</div>';
    }

    resultsTableContainer.innerHTML = html;

    resultsSection.style.display = 'block';
    emptyState.style.display = 'none';

    // Show kit machine section only for excavators
    const kitSection = document.getElementById('kit-machine-section');
    if (type === 'Excavatrice') {
        kitSection.style.display = 'block';
        const kitDesc = document.getElementById('kit-machine-desc');
        if (kitDesc) kitDesc.textContent = fab + ' ' + modele + ' (' + annee + ')';
        loadNotes(fab, modele, annee);
        if (typeof lockKit === 'function') lockKit();
        const cabineOui = document.querySelector('input[name="kit-cabine"][value="avec"]');
        if (cabineOui) cabineOui.checked = true;
        const hauteurOption = document.querySelector('input[name="kit-hauteur"][value="non"]');
        if (hauteurOption) hauteurOption.checked = true;
        const rotationOption = document.querySelector('input[name="kit-rotation"][value="non"]');
        if (rotationOption) rotationOption.checked = true;

        // Reset swing boom row radios
        const swingRowReset = document.querySelector('tr[data-kit="swing"]');
        if (swingRowReset) {
            const statusCell = swingRowReset.querySelector('.kit-status-cell');
            if (statusCell) {
                statusCell.innerHTML = '<input type="radio" name="kit-swing" value="oui" class="radio-red"><input type="radio" name="kit-swing" value="non" class="radio-yellow">';
            }
        }

        // Swing boom kit logic
        const swingRow = document.querySelector('tr[data-kit="swing"]');
        if (swingRow) {
            const swingValue = specs['Swing boom'] || 'Non';
            const swingOblig = swingRow.querySelector('input[value="oui"]');
            const swingOption = swingRow.querySelector('input[value="non"]');
            if (swingValue === 'Oui') {
                if (swingOption) swingOption.checked = true;
                if (swingOblig) swingOblig.disabled = false;
                if (swingOption) swingOption.disabled = false;
            } else {
                const statusCell = swingRow.querySelector('.kit-status-cell');
                if (statusCell) {
                    statusCell.innerHTML = '<span class="kit-na">N/A</span>';
                }
            }
        }

        // Mini excavatrice logic
        const poidsStr = specs['Poids operationnel (kg / lbs)'] || '';
        const poidsMatch = poidsStr.match(/^(\d+)/);
        const poidsKg = poidsMatch ? parseInt(poidsMatch[1]) : 99999;
        const miniRow = document.querySelector('input[name="kit-mini"]');
        const miniTr = miniRow ? miniRow.closest('tr') : null;
        if (miniTr) {
            const miniStatusCell = miniTr.querySelector('.kit-status-cell');
            if (poidsKg < 5000 && poidsKg > 0) {
                if (miniStatusCell && !miniStatusCell.querySelector('input')) {
                    miniStatusCell.innerHTML = '<input type="radio" name="kit-mini" value="oui" class="radio-red"><input type="radio" name="kit-mini" value="non" class="radio-yellow">';
                }
                var miniOblig = miniTr.querySelector('input[value="oui"]');
                if (miniOblig) miniOblig.checked = true;
            } else {
                if (miniStatusCell) {
                    miniStatusCell.innerHTML = '<span class="kit-na">N/A</span>';
                }
            }
        }

        // Machine sans cabine logic
        var sansCabineRadio = document.querySelector('input[name="kit-sans-cabine"]');
        var sansCabineTr = sansCabineRadio ? sansCabineRadio.closest('tr') : null;
        if (sansCabineTr) {
            var sansCabineStatus = sansCabineTr.querySelector('.kit-status-cell');
            if (poidsKg >= 5000 || poidsKg === 0) {
                if (sansCabineStatus) {
                    sansCabineStatus.innerHTML = '<span class="kit-na">N/A</span>';
                }
            } else {
                if (sansCabineStatus && !sansCabineStatus.querySelector('input')) {
                    sansCabineStatus.innerHTML = '<input type="radio" name="kit-sans-cabine" value="oui" class="radio-red"><input type="radio" name="kit-sans-cabine" value="non" class="radio-yellow">';
                }
            }
        }

        // Drain hydraulique logic
        const drainOblig = document.querySelector('input[name="kit-drain"][value="oui"]');
        const drainOption = document.querySelector('input[name="kit-drain"][value="non"]');
        const drainModels = [
            'CX80C','CX80','CX220E','CX170E','145 D SR','CX210D','CX245D SR','CX350D','CX490D','CX300E','CX145C',
            '315FL','440','450','320LU','308',
            'DX190W-5','DX235',
            '145X4 LC','145 X4','145X4','145X4D7','170X4S','170X4','170x4s','190','245X4','245X4LC','350X4',
            'ZX210LC-8','EX200LC-5','ZX130-6','ZX190LC-7H','ZX350LC-6','ZX490LC-6','ZX50U-5N',
            '135C','350','410','490D','330X','200CLC','130P-TIER',
            'PC78US',
            'R920 K LC',
            'TB210','TW65C2HS',
            'EC160BLC','235','EC160CL',
            'EZ36'
        ];
        const modelUpper = modele.toUpperCase();
        const isDrainOblig = drainModels.some(m => m.toUpperCase() === modelUpper);
        var drainTr = drainOblig ? drainOblig.closest('tr') : null;
        if (isDrainOblig) {
            if (drainTr) {
                var drainStatus = drainTr.querySelector('.kit-status-cell');
                if (drainStatus && !drainStatus.querySelector('input')) {
                    drainStatus.innerHTML = '<input type="radio" name="kit-drain" value="oui" class="radio-red"><input type="radio" name="kit-drain" value="non" class="radio-yellow">';
                }
                var drOblig = drainTr.querySelector('input[value="oui"]');
                if (drOblig) drOblig.checked = true;
            }
        } else {
            if (!drainTr) {
                drainTr = document.querySelector('input[name="kit-drain"]');
                if (drainTr) drainTr = drainTr.closest('tr');
            }
            if (drainTr) {
                var drainStatusCell = drainTr.querySelector('.kit-status-cell');
                if (drainStatusCell) {
                    drainStatusCell.innerHTML = '<span class="kit-na">N/A</span>';
                }
            }
        }

        // Boite GC logic
        var gcRadio = document.querySelector('input[name="kit-gc"]');
        var gcTr = gcRadio ? gcRadio.closest('tr') : null;
        if (gcTr) {
            var gcStatus = gcTr.querySelector('.kit-status-cell');
            if (fab === 'Caterpillar') {
                if (gcStatus && !gcStatus.querySelector('input')) {
                    gcStatus.innerHTML = '<input type="radio" name="kit-gc" value="oui" class="radio-red"><input type="radio" name="kit-gc" value="non" class="radio-yellow">';
                }
            } else {
                if (gcStatus) {
                    gcStatus.innerHTML = '<span class="kit-na">N/A</span>';
                }
            }
        }

        // Rotation cremaillere logic
        const cremRow = document.querySelector('tr[data-kit="cremaillere"]');
        if (cremRow) {
            if (modelUpper === 'TB216') {
                cremRow.style.display = '';
                const cremOblig = cremRow.querySelector('input[value="oui"]');
                if (cremOblig) cremOblig.checked = true;
            } else {
                cremRow.style.display = 'none';
                const cremOblig = cremRow.querySelector('input[value="oui"]');
                const cremOption = cremRow.querySelector('input[value="non"]');
                if (cremOblig) cremOblig.checked = false;
                if (cremOption) cremOption.checked = false;
            }
        }

        // Multi Axes row
        const multiRow = document.querySelector('tr[data-kit="multi"]');
        if (multiRow) {
            const typeBras = specs['Type de boom'] || '';
            const multiYellow = multiRow.querySelector('input.radio-yellow');
            if (typeBras.includes('2 parties')) {
                if (multiYellow) multiYellow.classList.add('radio-yellow-pulse');
            } else {
                if (multiYellow) multiYellow.classList.remove('radio-yellow-pulse');
                const multiOblig = multiRow.querySelector('input[value="oui"]');
                const multiOption = multiRow.querySelector('input[value="non"]');
                if (multiOblig) multiOblig.checked = false;
                if (multiOption) multiOption.checked = false;
            }
        }
        updateKitCheckboxes();
    } else {
        kitSection.style.display = 'none';
    }

    updateGearDeleteButton();
}

function hideResults() {
    resultsSection.style.display = 'none';
    emptyState.style.display = 'block';
    const kitSection = document.getElementById('kit-machine-section');
    if (kitSection) kitSection.style.display = 'none';
    const notesSection = document.getElementById('notes-section');
    if (notesSection) notesSection.style.display = 'none';
}

// ---- NOTES SYSTEM ----
const API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';
let currentNoteKey = '';

function getNotesKey(fab, modele, annee) {
    return 'notes_' + fab + '_' + modele + '_' + annee;
}

function loadNotes(fab, modele, annee) {
    const notesSection = document.getElementById('notes-section');
    const notesTextarea = document.getElementById('notes-textarea');
    const notesSaveBtn = document.getElementById('notes-save-btn');
    const notesStatus = document.getElementById('notes-status');
    if (!notesSection) return;

    currentNoteKey = getNotesKey(fab, modele, annee);
    notesTextarea.value = '';
    notesTextarea.readOnly = false;
    notesSaveBtn.style.display = 'inline-block';
    notesStatus.textContent = 'Chargement...';
    notesSection.style.display = 'block';

    fetch(API_URL + '?action=get&key=' + encodeURIComponent(currentNoteKey))
        .then(r => r.json())
        .then(data => {
            notesTextarea.value = data.value || '';
            notesStatus.textContent = '';
        })
        .catch(() => {
            notesTextarea.value = localStorage.getItem(currentNoteKey) || '';
            notesStatus.textContent = '';
        });
}

function unlockNotes() {}
function lockNotes() {}

function saveNotes() {
    const notesTextarea = document.getElementById('notes-textarea');
    const notesStatus = document.getElementById('notes-status');
    if (!notesTextarea || !currentNoteKey) return;

    localStorage.setItem(currentNoteKey, notesTextarea.value);

    notesStatus.textContent = 'Enregistrement...';
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({
            key: currentNoteKey,
            value: notesTextarea.value,
            pin: '1400'
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            notesStatus.textContent = 'Enregistre avec succes!';
        } else {
            notesStatus.textContent = 'Erreur: ' + (data.error || 'inconnue');
        }
    })
    .catch(() => {
        notesStatus.textContent = 'Sauvegarde locale seulement (hors-ligne)';
    });
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
        body: JSON.stringify({ action: 'save', key: 'target_emails', value: JSON.stringify(targetEmails), pin: '1400' })
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
        item.innerHTML = '<span>' + email + '</span><button class="email-delete-btn ' + (canEdit ? 'visible' : '') + '" data-idx="' + i + '" title="Supprimer">\u2715</button>';
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
function loadUsers() {
    fetch(API_URL + '?action=get&key=authorized_users_v2')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try {
                    var saved = JSON.parse(data.value);
                    if (Array.isArray(saved) && saved.length > 0) {
                        AUTHORIZED_USERS.length = 0;
                        saved.forEach(function(u) { AUTHORIZED_USERS.push(u); });
                    }
                } catch(e) {}
            }
            renderUserList();
        })
        .catch(function() { renderUserList(); });
}

function saveUsers() {
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: 'authorized_users_v2', value: JSON.stringify(AUTHORIZED_USERS), pin: '1400' })
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
        var roleLabel = ROLES[user.role] ? ROLES[user.role].label : user.role;
        item.innerHTML = '<span>' + user.name + ' \u2014 ' + roleLabel + '</span>' +
            '<button class="email-delete-btn user-delete-btn ' + (canEdit ? 'visible' : '') + '" data-idx="' + i + '" title="Supprimer">\u2715</button>';
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
            var valid = AUTHORIZED_USERS.find(function(u) {
                return u.username.toLowerCase() === (parsed.username || '').toLowerCase();
            });
            if (valid) {
                currentUser = { username: valid.username, name: valid.name, role: valid.role, permissions: getUserPermissions(valid.role) };
            }
        } catch(e) {}
    }
    updateLoginUI();

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
            var subject = 'Soumission Kit Machine — ' + fab + ' ' + modele + ' (' + annee + ')';
            var body =
                'Demande de soumission Kit Machine e-Trak\n\n' +
                'Machine: ' + fab + ' ' + modele + ' (' + annee + ')\n' +
                'Demande par: ' + currentUser.username + '\n\n' +
                'Options selectionnees:\n' +
                options.map(function(o) { return '  - ' + o; }).join('\n') +
                '\n\nPortail Machine e-Trak\nhttps://etraksolutions.github.io/portal-machine/';

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
    const defaults = [
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

// Hamburger menu
const hamburgerBtn = document.getElementById('hamburger-btn');
const hamburgerMenu = document.getElementById('hamburger-menu');

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

// Kit lock/unlock — permission-based (no PIN needed)
var kitLockBtn = document.getElementById('kit-lock-btn');
var kitUnlocked = false;

function updateKitLockButton() {
    if (!kitLockBtn) return;
    if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
        kitLockBtn.classList.add('perm-unlock');
        kitLockBtn.title = 'Cliquer pour deverrouiller';
    } else {
        kitLockBtn.classList.remove('perm-unlock');
        kitLockBtn.title = 'Connexion requise (role avec permission BOM)';
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
    const kitTable = document.querySelector('.kit-table');
    if (kitTable) kitTable.classList.add('kit-locked');
    if (kitLockBtn) kitLockBtn.innerHTML = '&#128274;';
    if (kitLockBtn) kitLockBtn.classList.remove('unlocked');
    lockNotes();
}

function unlockKit() {
    kitUnlocked = true;
    const kitTable = document.querySelector('.kit-table');
    if (kitTable) kitTable.classList.remove('kit-locked');
    if (kitLockBtn) kitLockBtn.innerHTML = '&#128275;';
    if (kitLockBtn) kitLockBtn.classList.add('unlocked');
    unlockNotes();
}

if (kitLockBtn) {
    kitLockBtn.addEventListener('click', () => {
        if (kitUnlocked) {
            lockKit();
        } else {
            // Check permission instead of PIN
            if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
                unlockKit();
            } else {
                alert('Permission insuffisante. Connectez-vous avec un compte ayant la permission de modification BOM.');
            }
        }
    });
}

// Apply lock by default on page load
lockKit();