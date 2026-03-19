// ============================================
// e-Trak Portal Machine — App Logic
// ============================================

let machinesData = {};

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

    // Save to API
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({
            action: 'saveModel',
            modelKey: fab + '_' + customName + '_' + annee,
            specs: specs
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

    let html = '<table class="specs-table">';
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
        const mailTo = 'robin@gryb.ca,k.berube@e-trak.ca';
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
            const cells = swingRowReset.querySelectorAll('td');
            if (cells.length >= 4) {
                cells[2].innerHTML = '<input type="radio" name="kit-swing" value="oui" class="radio-red">';
                cells[3].innerHTML = '<input type="radio" name="kit-swing" value="non" class="radio-yellow">';
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
                swingOblig.disabled = false;
                swingOption.disabled = false;
            } else {
                // No swing boom -> N/A
                swingOblig.checked = false;
                swingOption.checked = false;
                swingOblig.disabled = true;
                swingOption.disabled = true;
                // Replace radio cells with N/A text
                const cells = swingRow.querySelectorAll('td');
                if (cells.length >= 4) {
                    cells[2].innerHTML = '<span class="kit-na" style="text-align:center;display:block;">N/A</span>';
                    cells[3].innerHTML = '<span class="kit-na" style="text-align:center;display:block;">N/A</span>';
                }
            }
        }
        // Mini excavatrice: Obligatoire if < 5000 kg, reset otherwise
        const poidsStr = specs['Poids operationnel (kg / lbs)'] || '';
        const poidsMatch = poidsStr.match(/^(\d+)/);
        const poidsKg = poidsMatch ? parseInt(poidsMatch[1]) : 99999;
        const miniOblig = document.querySelector('input[name="kit-mini"][value="oui"]');
        const miniOption = document.querySelector('input[name="kit-mini"][value="non"]');
        if (poidsKg < 5000) {
            if (miniOblig) miniOblig.checked = true;
        } else {
            if (miniOblig) miniOblig.checked = false;
            if (miniOption) miniOption.checked = false;
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

        // Multi Axes row: flash if boom 2 parties
        const multiRow = document.querySelector('tr[data-kit="multi"]');
        if (multiRow) {
            const typeBras = specs['Type de boom'] || '';
            if (typeBras.includes('2 parties')) {
                multiRow.classList.add('flash-yellow-row');
                // Don't auto-check — just highlight for attention
            } else {
                multiRow.classList.remove('flash-yellow-row');
                const multiOblig = multiRow.querySelector('input[value="oui"]');
                const multiOption = multiRow.querySelector('input[value="non"]');
                if (multiOblig) multiOblig.checked = false;
                if (multiOption) multiOption.checked = false;
            }
        }
    } else {
        kitSection.style.display = 'none';
    }
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
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('notes-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveNotes);

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
});

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
