// ============================================
// e-Trak Portal Machine — App Logic
// ============================================

let machinesData = {};

// ---- LOGIN SYSTEM ----
const AUTHORIZED_USERS = [
    { email: 'robin@gryb.ca', pin: '1400', name: 'Robin' },
    { email: 'k.berube@e-trak.ca', pin: '1400', name: 'Kevin' },
    { email: 'jacquot@gryb.ca', pin: '1234', name: 'Jacquot' }
];
let currentUser = null; // { email, name }

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
    optAutre.textContent = '⊕ Autre modele (pas dans la liste)';
    optAutre.style.fontStyle = 'italic';
    selectModele.appendChild(optAutre);
    selectModele.disabled = false;
});

// Delete model via gear menu
function updateGearDeleteButton() {
    const btn = document.getElementById('gear-delete-model-btn');
    if (!btn) return;
    const modele = selectModele.value;
    const hasModel = modele && modele !== '' && modele !== '__OTHER__';
    if (hasModel) {
        const fab = selectFabricant.value;
        const annee = selectAnnee.value;
        btn.disabled = false;
        btn.textContent = '🗑 Supprimer ' + fab + ' ' + modele + ' (' + annee + ')';
    } else {
        btn.disabled = true;
        btn.textContent = '🗑 Aucun modele selectionne';
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

        if (!confirm('⚠ Confirmer la suppression :\n\n' + fab + ' ' + mod + '\nAnnee : ' + annee + ' seulement\n\nCette action est irreversible.')) return;

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

        // Close gear menu
        const gearMenu = document.getElementById('gear-menu');
        if (gearMenu) gearMenu.classList.remove('open');
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
    // Remove existing modal if any
    const existing = document.getElementById('custom-model-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'custom-model-modal';
    modal.className = 'custom-modal-overlay';
    modal.innerHTML = `
        <div class="custom-modal">
            <h3>Nouveau modele</h3>
            <p class="modal-desc">${fab} — ${annee}</p>
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
    // Create empty specs for custom model
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

    // Add to local machinesData
    if (!machinesData[type]) machinesData[type] = {};
    if (!machinesData[type][fab]) machinesData[type][fab] = {};
    if (!machinesData[type][fab][annee]) machinesData[type][fab][annee] = {};
    machinesData[type][fab][annee][customName] = specs;

    // Save to API
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

    // Add to local dropdown
    const opt = document.createElement('option');
    opt.value = customName;
    opt.textContent = customName + ' ★';
    selectModele.insertBefore(opt, selectModele.querySelector('option[value="__OTHER__"]'));
    selectModele.value = customName;

    // Show results with empty specs + request button
    showResults(customName, type, fab, annee, specs, true);
}


function showResults(modele, type, fab, annee, specs, isCustom) {
    resultsTitle.textContent = `${fab} ${modele} (${annee})`;
    resultsBadge.textContent = type;

    // Auto-determine machine class from weight
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
    // Show class as first row if determined
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

    // (Alert moved to kit Multi Axes row flash)

    // Add "Demande kit machine" button for custom models
    if (isCustom) {
        const mailTo = getMailTo();
        const mailSubject = encodeURIComponent('Demande Kit Machine — ' + fab + ' ' + modele + ' (' + annee + ')');
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
            '<p class="kit-request-text">⚠ Ce modele n\'est pas dans la base de donnees. Les specifications sont a completer.</p>' +
            '<a href="mailto:' + mailTo + '?subject=' + mailSubject + '&body=' + mailBody + '" class="kit-request-btn">📧 Demande kit machine</a>' +
            '</div>';
    }

    resultsTableContainer.innerHTML = html;

    resultsSection.style.display = 'block';
    emptyState.style.display = 'none';

    // Show kit machine section only for excavators
    const kitSection = document.getElementById('kit-machine-section');
    if (type === 'Excavatrice') {
        kitSection.style.display = 'block';
        // Set machine description
        const kitDesc = document.getElementById('kit-machine-desc');
        if (kitDesc) kitDesc.textContent = fab + ' ' + modele + ' (' + annee + ')';
        // Load notes for this model
        loadNotes(fab, modele, annee);
        // Re-lock kit on model change
        if (typeof lockKit === 'function') lockKit();
        // Auto-check options for all models
        const cabineOui = document.querySelector('input[name="kit-cabine"][value="avec"]');
        if (cabineOui) cabineOui.checked = true;
        const hauteurOption = document.querySelector('input[name="kit-hauteur"][value="non"]');
        if (hauteurOption) hauteurOption.checked = true;
        const rotationOption = document.querySelector('input[name="kit-rotation"][value="non"]');
        if (rotationOption) rotationOption.checked = true;

        // Reset swing boom row radios (in case previous model was N/A)
        const swingRowReset = document.querySelector('tr[data-kit="swing"]');
        if (swingRowReset) {
            const statusCell = swingRowReset.querySelector('.kit-status-cell');
            if (statusCell) {
                statusCell.innerHTML = '<input type="radio" name="kit-swing" value="oui" class="radio-red"><input type="radio" name="kit-swing" value="non" class="radio-yellow">';
            }
        }

        // Swing boom kit: Option if machine has swing boom, N/A otherwise
        const swingRow = document.querySelector('tr[data-kit="swing"]');
        if (swingRow) {
            const swingValue = specs['Swing boom'] || 'Non';
            const swingOblig = swingRow.querySelector('input[value="oui"]');
            const swingOption = swingRow.querySelector('input[value="non"]');
            if (swingValue === 'Oui') {
                // Machine has swing boom -> check Option
                if (swingOption) swingOption.checked = true;
                if (swingOblig) swingOblig.disabled = false;
                if (swingOption) swingOption.disabled = false;
            } else {
                // No swing boom -> N/A
                const statusCell = swingRow.querySelector('.kit-status-cell');
                if (statusCell) {
                    statusCell.innerHTML = '<span class="kit-na">N/A</span>';
                }
            }
        }
        // Mini excavatrice: Obligatoire if < 5000 kg, N/A if >= 5000 kg
        const poidsStr = specs['Poids operationnel (kg / lbs)'] || '';
        const poidsMatch = poidsStr.match(/^(\d+)/);
        const poidsKg = poidsMatch ? parseInt(poidsMatch[1]) : 99999;
        const miniRow = document.querySelector('input[name="kit-mini"]');
        const miniTr = miniRow ? miniRow.closest('tr') : null;
        if (miniTr) {
            const miniStatusCell = miniTr.querySelector('.kit-status-cell');
            if (poidsKg < 5000 && poidsKg > 0) {
                // Restore radios if they were replaced by N/A
                if (miniStatusCell && !miniStatusCell.querySelector('input')) {
                    miniStatusCell.innerHTML = '<input type="radio" name="kit-mini" value="oui" class="radio-red"><input type="radio" name="kit-mini" value="non" class="radio-yellow">';
                }
                var miniOblig = miniTr.querySelector('input[value="oui"]');
                if (miniOblig) miniOblig.checked = true;
            } else {
                // >= 5000 kg or no weight -> N/A
                if (miniStatusCell) {
                    miniStatusCell.innerHTML = '<span class="kit-na">N/A</span>';
                }
            }
        }

        // Machine sans cabine (1500-0003): N/A if >= 5000 kg
        var sansCabineRadio = document.querySelector('input[name="kit-sans-cabine"]');
        var sansCabineTr = sansCabineRadio ? sansCabineRadio.closest('tr') : null;
        if (sansCabineTr) {
            var sansCabineStatus = sansCabineTr.querySelector('.kit-status-cell');
            if (poidsKg >= 5000 || poidsKg === 0) {
                if (sansCabineStatus) {
                    sansCabineStatus.innerHTML = '<span class="kit-na">N/A</span>';
                }
            } else {
                // < 5000 kg -> restore radios
                if (sansCabineStatus && !sansCabineStatus.querySelector('input')) {
                    sansCabineStatus.innerHTML = '<input type="radio" name="kit-sans-cabine" value="oui" class="radio-red"><input type="radio" name="kit-sans-cabine" value="non" class="radio-yellow">';
                }
            }
        }

        // Drain hydraulique (1500-0009): Obligatoire for specific models
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
        if (isDrainOblig) {
            if (drainOblig) drainOblig.checked = true;
        } else {
            if (drainOblig) drainOblig.checked = false;
            if (drainOption) drainOption.checked = false;
        }

        // Rotation cremaillere (1500-0304): show + Obligatoire for TB216 only
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

        // Multi Axes row: pulse yellow button if boom 2 parties
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
        // Auto-check checkboxes based on radio status
        updateKitCheckboxes();
    } else {
        kitSection.style.display = 'none';
    }

    // Update gear menu delete button state
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

// ---- NOTES SYSTEM (Google Apps Script backend) ----
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

    // Load from API
    fetch(API_URL + '?action=get&key=' + encodeURIComponent(currentNoteKey))
        .then(r => r.json())
        .then(data => {
            notesTextarea.value = data.value || '';
            notesStatus.textContent = '';
        })
        .catch(() => {
            // Fallback to localStorage
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

    // Save to localStorage as backup
    localStorage.setItem(currentNoteKey, notesTextarea.value);

    // Save to API
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

    // Notes stay editable after save
}

// Attach save button + radio uncheck logic
// ---- EMAIL MANAGEMENT ----
const DEFAULT_EMAILS = ['robin@gryb.ca', 'k.berube@e-trak.ca'];
let targetEmails = [...DEFAULT_EMAILS];
let gearUnlocked = false;

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
    targetEmails.forEach((email, i) => {
        const item = document.createElement('div');
        item.className = 'email-item';
        item.innerHTML = '<span>' + email + '</span><button class="email-delete-btn ' + (gearUnlocked ? 'visible' : '') + '" data-idx="' + i + '" title="Supprimer">✕</button>';
        list.appendChild(item);
    });
    // Attach delete handlers
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
    fetch(API_URL + '?action=get&key=authorized_users')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try {
                    var saved = JSON.parse(data.value);
                    if (Array.isArray(saved) && saved.length > 0) {
                        // Replace AUTHORIZED_USERS contents (keep reference)
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
        body: JSON.stringify({ action: 'save', key: 'authorized_users', value: JSON.stringify(AUTHORIZED_USERS), pin: '1400' })
    }).catch(function() {});
}

function renderUserList() {
    var list = document.getElementById('user-list');
    if (!list) return;
    list.innerHTML = '';
    AUTHORIZED_USERS.forEach(function(user, i) {
        var item = document.createElement('div');
        item.className = 'email-item';
        item.innerHTML = '<span>' + user.name + ' &lt;' + user.email + '&gt; — NIP: ' + user.pin + '</span>' +
            '<button class="email-delete-btn user-delete-btn ' + (gearUnlocked ? 'visible' : '') + '" data-idx="' + i + '" title="Supprimer">✕</button>';
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

document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('notes-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveNotes);

    // Gear menu
    const gearBtn = document.getElementById('gear-btn');
    const gearMenu = document.getElementById('gear-menu');
    const gearPinInput = document.getElementById('gear-pin-input');
    const addEmailBtn = document.getElementById('add-email-btn');
    const addEmailInput = document.getElementById('add-email-input');
    const gearEditSection = document.getElementById('gear-edit-section');

    if (gearBtn) {
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            gearMenu.classList.toggle('open');
            if (gearMenu.classList.contains('open')) loadEmails();
        });
    }

    if (gearPinInput) {
        gearPinInput.addEventListener('input', function() {
            if (this.value === '1400') {
                gearUnlocked = true;
                gearEditSection.style.display = 'block';
                renderEmailList();
                renderUserList();
                this.style.borderColor = '#00CC00';
            }
        });
    }

    // Add user button
    var addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function() {
            var email = document.getElementById('add-user-email').value.trim();
            var name = document.getElementById('add-user-name').value.trim();
            var pin = document.getElementById('add-user-pin').value.trim();
            if (email && email.includes('@') && name && pin) {
                AUTHORIZED_USERS.push({ email: email, name: name, pin: pin });
                saveUsers();
                renderUserList();
                document.getElementById('add-user-email').value = '';
                document.getElementById('add-user-name').value = '';
                document.getElementById('add-user-pin').value = '';
            }
        });
    }

    if (addEmailBtn) {
        addEmailBtn.addEventListener('click', () => {
            const email = addEmailInput.value.trim();
            if (email && email.includes('@')) {
                targetEmails.push(email);
                saveEmails();
                renderEmailList();
                addEmailInput.value = '';
            }
        });
    }

    // Close gear menu on outside click
    document.addEventListener('click', (e) => {
        if (gearMenu && !gearMenu.contains(e.target) && !gearBtn.contains(e.target)) {
            gearMenu.classList.remove('open');
            gearUnlocked = false;
            if (gearEditSection) gearEditSection.style.display = 'none';
            if (gearPinInput) { gearPinInput.value = ''; gearPinInput.style.borderColor = ''; }
            renderEmailList();
            renderUserList();
        }
    });

    // Load emails and users on startup
    loadEmails();
    loadUsers();

    // Allow unchecking radio buttons by clicking again
    document.querySelectorAll('.kit-table input[type="radio"]').forEach(radio => {
        radio.addEventListener('click', function(e) {
            // If this radio was already checked before this click, uncheck it
            if (this.dataset.wasChecked === 'true') {
                this.checked = false;
                this.dataset.wasChecked = 'false';
            } else {
                // Unmark all radios in same group
                document.querySelectorAll('input[name="' + this.name + '"]').forEach(r => {
                    r.dataset.wasChecked = 'false';
                });
                this.dataset.wasChecked = 'true';
            }
        });
        // Track initial state on mousedown/touchstart
        radio.addEventListener('mousedown', function() {
            this.dataset.wasChecked = this.checked ? 'true' : 'false';
        });
        radio.addEventListener('touchstart', function() {
            this.dataset.wasChecked = this.checked ? 'true' : 'false';
        });
    });

    // ---- LOGIN SYSTEM ----
    const loginBtn = document.getElementById('login-btn');
    const loginModal = document.getElementById('login-modal');
    const loginClose = document.getElementById('login-close');
    const loginSubmit = document.getElementById('login-submit');
    const loginEmail = document.getElementById('login-email');
    const loginPin = document.getElementById('login-pin');
    const loginError = document.getElementById('login-error');
    const loginUser = document.getElementById('login-user');
    const logoutBtn = document.getElementById('logout-btn');

    function updateLoginUI() {
        var kitTable = document.querySelector('.kit-table');
        if (currentUser) {
            loginBtn.style.display = 'none';
            loginUser.style.display = '';
            loginUser.textContent = '✓ ' + currentUser.name;
            logoutBtn.style.display = '';
            if (kitTable) kitTable.classList.remove('hide-sel');
        } else {
            loginBtn.style.display = '';
            loginUser.style.display = 'none';
            logoutBtn.style.display = 'none';
            if (kitTable) kitTable.classList.add('hide-sel');
        }
        updateKitCheckboxes();
        updateQuoteButton();
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            loginModal.style.display = 'flex';
            loginEmail.value = '';
            loginPin.value = '';
            loginError.style.display = 'none';
            loginEmail.focus();
        });
    }

    if (loginClose) {
        loginClose.addEventListener('click', function() {
            loginModal.style.display = 'none';
        });
    }

    if (loginModal) {
        loginModal.addEventListener('click', function(e) {
            if (e.target === loginModal) loginModal.style.display = 'none';
        });
    }

    if (loginSubmit) {
        loginSubmit.addEventListener('click', function() {
            var email = loginEmail.value.trim().toLowerCase();
            var pin = loginPin.value.trim();
            var user = AUTHORIZED_USERS.find(function(u) {
                return u.email.toLowerCase() === email && u.pin === pin;
            });
            if (user) {
                currentUser = { email: user.email, name: user.name };
                localStorage.setItem('portal_user', JSON.stringify(currentUser));
                loginModal.style.display = 'none';
                updateLoginUI();
            } else {
                loginError.textContent = 'Courriel ou NIP invalide';
                loginError.style.display = 'block';
            }
        });
    }

    if (loginPin) {
        loginPin.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') loginSubmit.click();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            currentUser = null;
            localStorage.removeItem('portal_user');
            updateLoginUI();
        });
    }

    // Restore session from localStorage
    var saved = localStorage.getItem('portal_user');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            // Verify user still exists in authorized list
            var valid = AUTHORIZED_USERS.find(function(u) {
                return u.email.toLowerCase() === parsed.email.toLowerCase();
            });
            if (valid) currentUser = parsed;
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

            // Collect checked options
            var options = [];
            document.querySelectorAll('.kit-table tbody tr').forEach(function(row) {
                var cb = row.querySelector('.kit-checkbox');
                if (cb && cb.checked) {
                    var optName = row.querySelector('td').textContent.trim();
                    var code = row.querySelector('.kit-code');
                    var codeText = code ? code.textContent.trim() : '';
                    options.push(codeText + ' — ' + optName);
                }
            });

            var mailTo = getMailTo();
            var subject = encodeURIComponent('Demande de soumission — ' + fab + ' ' + modele + ' (' + annee + ')');
            var body = encodeURIComponent(
                'Bonjour,\n\n' +
                'Demande de soumission pour:\n' +
                '- Fabricant: ' + fab + '\n' +
                '- Modele: ' + modele + '\n' +
                '- Annee: ' + annee + '\n\n' +
                'Options selectionnees:\n' +
                options.map(function(o) { return '- ' + o; }).join('\n') + '\n\n' +
                'Demande par: ' + currentUser.email + '\n\n' +
                'Portail Machine e-Trak\n' +
                'https://etraksolutions.github.io/portal-machine/'
            );
            window.open('mailto:' + mailTo + '?subject=' + subject + '&body=' + body, '_blank');
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

// Kit PIN lock/unlock
const kitLockBtn = document.getElementById('kit-lock-btn');
const kitPinInput = document.getElementById('kit-pin-input');
const KIT_PIN = '1400';
let kitUnlocked = false;

// Update checkboxes: auto-check if radio-red is checked, uncheck if no radio checked
function updateKitCheckboxes() {
    var loggedIn = !!currentUser;
    document.querySelectorAll('.kit-table tbody tr').forEach(function(row) {
        var cb = row.querySelector('.kit-checkbox');
        if (!cb) return;
        var redRadio = row.querySelector('input.radio-red');
        var yellowRadio = row.querySelector('input.radio-yellow');
        // Reset
        cb.classList.remove('auto-checked');
        cb.disabled = false;
        if (redRadio && redRadio.checked) {
            // Obligatory — auto-check and lock
            cb.checked = true;
            cb.classList.add('auto-checked');
        } else if (yellowRadio && yellowRadio.checked) {
            // Optional — leave unchecked, user can select if logged in
            if (!loggedIn) {
                cb.checked = false;
                cb.disabled = true;
            }
        } else {
            // No status — uncheck, disable if not logged in
            cb.checked = false;
            if (!loggedIn) cb.disabled = true;
        }
        // If row has N/A (swing boom), hide checkbox
        var naSpan = row.querySelector('.kit-na');
        if (naSpan) {
            cb.style.display = 'none';
        } else {
            cb.style.display = '';
        }
    });
    updateQuoteButton();
}

// Default: locked
function lockKit() {
    kitUnlocked = false;
    const kitTable = document.querySelector('.kit-table');
    if (kitTable) kitTable.classList.add('kit-locked');
    if (kitLockBtn) kitLockBtn.innerHTML = '&#128274;';
    if (kitLockBtn) kitLockBtn.classList.remove('unlocked');
    if (kitPinInput) { kitPinInput.style.display = 'none'; kitPinInput.value = ''; }
    lockNotes();
}

function unlockKit() {
    kitUnlocked = true;
    const kitTable = document.querySelector('.kit-table');
    if (kitTable) kitTable.classList.remove('kit-locked');
    if (kitLockBtn) kitLockBtn.innerHTML = '&#128275;';
    if (kitLockBtn) kitLockBtn.classList.add('unlocked');
    if (kitPinInput) kitPinInput.style.display = 'none';
    unlockNotes();
}

if (kitLockBtn) {
    kitLockBtn.addEventListener('click', () => {
        if (kitUnlocked) {
            lockKit();
        } else {
            kitPinInput.style.display = 'inline-block';
            kitPinInput.focus();
        }
    });
}

if (kitPinInput) {
    kitPinInput.addEventListener('input', () => {
        if (kitPinInput.value === KIT_PIN) {
            unlockKit();
        }
    });
    kitPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            kitPinInput.style.display = 'none';
            kitPinInput.value = '';
        }
    });
}

// Apply lock by default on page load
lockKit();
