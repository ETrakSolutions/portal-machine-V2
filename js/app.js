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

    const specs = machinesData[type][fab][annee][modele];
    showResults(modele, type, fab, annee, specs);
});

function showResults(modele, type, fab, annee, specs) {
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
        } else if (key === 'Machine sur roue ou chenille' && value === 'Roue') {
            html += `<tr><td>${key}</td><td><span class="flash-yellow">${value}</span></td></tr>`;
        } else if (key === 'Type de bras' && value.includes('2 parties')) {
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

    resultsTableContainer.innerHTML = html;

    resultsSection.style.display = 'block';
    emptyState.style.display = 'none';

    // Show kit machine section only for excavators
    const kitSection = document.getElementById('kit-machine-section');
    if (type === 'Excavatrice') {
        kitSection.style.display = 'block';
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

        // Multi Axes row: flash if boom 2 parties
        const multiRow = document.querySelector('tr[data-kit="multi"]');
        if (multiRow) {
            const typeBras = specs['Type de bras'] || '';
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

// ---- NOTES SYSTEM ----
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
    const saved = localStorage.getItem(currentNoteKey) || '';
    notesTextarea.value = saved;
    notesTextarea.readOnly = true;
    notesSaveBtn.style.display = 'none';
    notesStatus.textContent = 'Verrouille — entrer le NIP pour modifier';
    notesSection.style.display = 'block';

    // If kit is unlocked, unlock notes too
    if (kitUnlocked) {
        unlockNotes();
    }
}

function unlockNotes() {
    const notesTextarea = document.getElementById('notes-textarea');
    const notesSaveBtn = document.getElementById('notes-save-btn');
    const notesStatus = document.getElementById('notes-status');
    if (!notesTextarea) return;
    notesTextarea.readOnly = false;
    notesSaveBtn.style.display = 'inline-block';
    notesStatus.textContent = 'Editable — cliquer Enregistrer pour sauvegarder';
}

function lockNotes() {
    const notesTextarea = document.getElementById('notes-textarea');
    const notesSaveBtn = document.getElementById('notes-save-btn');
    const notesStatus = document.getElementById('notes-status');
    if (!notesTextarea) return;
    notesTextarea.readOnly = true;
    notesSaveBtn.style.display = 'none';
    notesStatus.textContent = 'Verrouille — entrer le NIP pour modifier';
}

function saveNotes() {
    const notesTextarea = document.getElementById('notes-textarea');
    if (!notesTextarea || !currentNoteKey) return;
    localStorage.setItem(currentNoteKey, notesTextarea.value);
    // Lock after save
    lockNotes();
    lockKit();
}

// Attach save button
document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('notes-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveNotes);
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
