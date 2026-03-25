// ============================================
// e-Trak Portal Machine — App Logic v2.0
// Unified login + role-based permissions
// ============================================

let machinesData = {};
let installedMachines = [];

// Load installed machines list
fetch('data/installed_machines.json')
    .then(function(r) { return r.json(); })
    .then(function(data) { installedMachines = data; })
    .catch(function() {});

// ---- ROLE PERMISSIONS ----
const ROLES = {
    administrateur: { createAccount: true, modifBom: true, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: true, modifAccounts: true, machineAccess: true, label: 'Administrateur' },
    vente_interne:  { createAccount: true, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: true, writeNotes: false, modifAccounts: false, machineAccess: true, label: 'Vente interne' },
    technicien:     { createAccount: false, modifBom: false, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, label: 'Technicien' },
    distributeur:   { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, label: 'Distributeur' },
    dealer:         { createAccount: false, modifBom: false, kitMachineAccess: true, soumissionAccess: true, shareAccess: false, writeNotes: false, modifAccounts: false, machineAccess: true, label: 'Dealer' },
    ingenierie:     { createAccount: false, modifBom: true, kitMachineAccess: false, soumissionAccess: false, shareAccess: false, writeNotes: true, modifAccounts: false, machineAccess: true, label: 'Ingenierie' }
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

// Helper: populate modeles dropdown from fab data, optionally filtered by year
function populateModeles(type, fab, anneeFilter) {
    selectModele.innerHTML = '<option value="">-- Selectionnez --</option>';
    var fabData = machinesData[type][fab];
    var classeOrder = {'Mini':0,'Compact':1,'Standard':2,'100':3,'120':4,'200':5,'270':6,'300':7,'400':8};
    // Collect unique models across all years (or filtered year)
    var modelSet = {};
    var annees = anneeFilter ? [anneeFilter] : Object.keys(fabData);
    annees.forEach(function(y) {
        if (!fabData[y]) return;
        Object.keys(fabData[y]).forEach(function(m) {
            if (!modelSet[m]) modelSet[m] = fabData[y][m];
        });
    });
    var modeles = Object.keys(modelSet).sort(function(a, b) {
        var ca = modelSet[a]['Classe machine'] || 'Standard';
        var cb = modelSet[b]['Classe machine'] || 'Standard';
        var oa = classeOrder[ca] !== undefined ? classeOrder[ca] : 5;
        var ob = classeOrder[cb] !== undefined ? classeOrder[cb] : 5;
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b);
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
    optAutre.textContent = '\u2295 Autre modele (pas dans la liste)';
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

// Annee changed — filter modeles by year
selectAnnee.addEventListener('change', () => {
    const type = selectType.value;
    const fab = selectFabricant.value;
    const annee = selectAnnee.value;
    if (!fab) return;
    selectModele.value = '';
    hideResults();
    populateModeles(type, fab, annee || null);
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
    let annee = selectAnnee.value;
    const modele = selectModele.value;
    if (!modele) {
        hideResults();
        return;
    }

    // If no year selected, find the most recent year that has this model
    if (!annee) {
        var allYears = Object.keys(machinesData[type][fab]).sort().reverse();
        for (var i = 0; i < allYears.length; i++) {
            if (machinesData[type][fab][allYears[i]][modele]) {
                annee = allYears[i];
                selectAnnee.value = annee;
                break;
            }
        }
    }

    if (modele === '__OTHER__') {
        if (!annee) { alert('Selectionnez une annee pour creer un modele.'); return; }
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
        } else if (key === 'Section telescopique' && value === 'Oui') {
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
                pcDiv.innerHTML = '<h4 class="pc-title">Codes produit</h4>' +
                    '<table class="specs-table pc-table"><thead><tr><th>Code</th><th>Description</th><th>Qte</th></tr></thead><tbody>' +
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
        if (!isInstalled && installedMachines.length > 0) {
            var banner = document.createElement('div');
            banner.id = 'kit-not-installed';
            banner.className = 'kit-not-installed';
            banner.textContent = 'Machine jamais installee';
            var kitHeader = kitSection.querySelector('.kit-header');
            if (kitHeader) kitHeader.after(banner);
        }

        loadNotes(fab, modele, annee);
        // Auto-unlock kit if user has permission
        if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
            if (typeof unlockKit === 'function') unlockKit();
        } else {
            if (typeof lockKit === 'function') lockKit();
        }

        // ---- BD = MAITRE: compute defaults then load overrides ----
        // Same computeDefaultBom as database.html
        var DRAIN_PREFIXES = [
            'CX80','CX145','CX170','CX210','CX220','CX245','CX300','CX350','CX380','CX490','145 D',
            '308','315','316','320','336','440','450','M318',
            'DX190','DX235','BX190',
            'ZX210LC','EX200','ZX130-6','ZX190','ZX350','ZX490','ZX50U','ZX75US','ZX245',
            '245X',
            '135','200CLC','210G','210P','210 P','245 P','245P','330X','350','410','470G','490D','130P',
            'SK210',
            'PC78','PC138','PC200','PC290',
            'R 920 K','R920','R 936','R936',
            '145 X4','145X4','160 X4','160X4','170X4','190','245X4','300 X4','300X4','350 X4','350X4','355 X4','355X4','490 X4','490X4',
            'TB210','TW65',
            'EC160','EC330','EC360','EC550','235',
            'EZ36'
        ];

        var poidsStr = specs['Poids operationnel (kg / lbs)'] || '';
        var poidsMatch = poidsStr.match(/(\d[\d\s]*)/);
        var poidsKg = poidsMatch ? parseInt(poidsMatch[1].replace(/\s/g, '')) : 0;
        var hasSwing = (specs['Swing boom'] || '').toLowerCase() === 'oui';
        var isMini = poidsKg > 0 && poidsKg < 5000;
        var fabUp = fab.toUpperCase();
        var isCat = fabUp.indexOf('CATERPILLAR') >= 0 || fabUp === 'CAT';
        var modelUpper = modele.toUpperCase();
        var isDrain = DRAIN_PREFIXES.some(function(p) { return modelUpper.indexOf(p.toUpperCase()) === 0; });

        var bomDefaults = {
            '0000': 'r',
            '0001': 'j',
            '0002': 'j',
            '0004': isMini ? 'r' : 'na',
            '0005': 'j',
            '0008': hasSwing ? 'j' : 'na',
            '0009': isDrain ? 'r' : 'na',
            '0070': 'na',
            '0304': modelUpper === 'TB216' ? 'r' : 'na'
        };

        // Harnais
        var hCode = 'Z03B-0043'; var hName = 'Generique';
        if (fabUp === 'HITACHI') {
            var is7 = modele.indexOf('-7') >= 0;
            var is5or6 = modele.indexOf('-5') >= 0 || modele.indexOf('-6') >= 0;
            if (is7 && !is5or6) { hCode = 'Z03B-0121'; hName = 'Hitachi -7'; }
            else { hCode = 'Z03B-0031'; hName = 'Hitachi -5/-6'; }
        } else if (fabUp === 'JOHN DEERE') { hCode = 'Z03B-0031'; hName = 'Hitachi/JD'; }
        else if (fabUp === 'KOMATSU') { hCode = 'Z03B-0032'; hName = 'Komatsu'; }
        else if (fabUp.indexOf('DOOSAN') >= 0 || fabUp.indexOf('DEVELON') >= 0) { hCode = 'Z03B-0033'; hName = 'Doosan'; }
        else if (fabUp.indexOf('VOLVO') >= 0) { hCode = 'Z03B-0034'; hName = 'Volvo'; }
        else if (fabUp.indexOf('LINK') >= 0 || fabUp === 'CASE') { hCode = 'Z03B-0041'; hName = 'Link-Belt/Case'; }
        else if (isCat) { hCode = 'Z03B-0080'; hName = 'Caterpillar'; }

        var harnaisLabel = document.getElementById('kit-harnais-label');
        var harnaisCodeEl = document.getElementById('kit-harnais-code');
        if (harnaisLabel) harnaisLabel.textContent = hName;
        if (harnaisCodeEl) harnaisCodeEl.textContent = hCode;

        // Apply BOM defaults to kit table rows
        var KIT_MAP = {
            'cabine': '0000', 'sans-cabine': '0004', 'hauteur': '0001', 'rotation': '0002',
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
            });
            // Harnais row always visible
            var harnaisTr = document.querySelector('tr[data-kit="harnais"]');
            if (harnaisTr) harnaisTr.style.display = '';
        }

        // Apply defaults first
        applyBomToKit(bomDefaults);

        // Then load overrides from API (BD is master)
        loadKitOverride(fab, modele, annee, function(overrides) {
            if (overrides) {
                // Merge overrides on top of defaults
                for (var code in overrides) {
                    if (overrides[code]) bomDefaults[code] = overrides[code];
                }
                // Drain hyd (0009) ne peut JAMAIS etre jaune — rouge ou na seulement
                if (bomDefaults['0009'] === 'j') bomDefaults['0009'] = 'r';
                applyBomToKit(bomDefaults);
                // Update harnais if override exists
                if (overrides.harnais) {
                    var HARNAIS_LABELS = {'H0031':'Hit5/6-JD','H0032':'Komatsu','H0033':'Doosan','H0034':'Volvo','H0041':'LB-Case','H0080':'Cat','H0100':'Cat(ECU)','H0121':'Hit-7','H0043':'Generic'};
                    if (harnaisCodeEl) harnaisCodeEl.textContent = 'Z03B-' + overrides.harnais.replace('H','');
                    if (harnaisLabel) harnaisLabel.textContent = HARNAIS_LABELS[overrides.harnais] || overrides.harnais;
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

            // Compute defaults same as database.html computeDefaultBomPompe
            var nbSections = specs['Nombre de sections'] || '';
            var sec = parseInt(nbSections) || 0;
            var pompeBomDefaults = {
                '0200': 'na',
                '0203': 'na',
                '0201': 'j', // Hauteur
                '0202': 'j', // Rotation
                '0204': (sec >= 4) ? 'r' : 'na',
                '0205': (sec >= 5) ? 'r' : 'na',
                '0206': (sec >= 6) ? 'r' : 'na',
                '0207': 'na',
                '0208': 'na',
                '0209': 'na'
            };

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

            // Apply defaults first
            applyBomToPompeKit(pompeBomDefaults);

            // Then load overrides from API (BD is master)
            loadKitOverride(fab, modele, annee, function(overrides) {
                if (overrides) {
                    for (var code in overrides) {
                        if (overrides[code]) pompeBomDefaults[code] = overrides[code];
                    }
                    applyBomToPompeKit(pompeBomDefaults);
                }
            });

            loadNotes(fab, modele, annee);
        } else {
            kitPompeSection.style.display = 'none';
        }
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

    var noteContent = notesTextarea.value;
    localStorage.setItem(currentNoteKey, noteContent);

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

    notesStatus.textContent = 'Enregistrement...';
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({
            key: currentNoteKey,
            value: noteContent,
            pin: '1400'
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            notesStatus.textContent = 'Enregistre avec succes!';
            // Send email notification to notes emails
            if (noteContent.trim()) {
                fetch(API_URL + '?action=get&key=notes_emails')
                    .then(function(r) { return r.json(); })
                    .then(function(emailData) {
                        var emails = [];
                        if (emailData.value) { try { emails = JSON.parse(emailData.value); } catch(e) {} }
                        if (emails.length > 0) {
                            var subject = 'Note Portail e-Trak — ' + fab + ' ' + modele + ' (' + annee + ')';
                            var body = 'Nouvelle note enregistree sur le Portail e-Trak\n\n' +
                                '=== DETAILS ===\n' +
                                'Type: ' + typeM + '\n' +
                                'Fabricant: ' + fab + '\n' +
                                'Modele: ' + modele + '\n' +
                                'Annee: ' + annee + '\n' +
                                'Ecrite par: ' + userName + '\n' +
                                'Date/Heure: ' + dateStr + '\n\n' +
                                '=== CONTENU DE LA NOTE ===\n' +
                                noteContent + '\n\n' +
                                '---\n' +
                                'Portail e-Trak — e-Trak Technology Solutions';
                            window.location.href = 'mailto:' + emails.join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
                        }
                    })
                    .catch(function() {});
            }
        } else {
            notesStatus.textContent = 'Erreur: ' + (data.error || 'inconnue');
        }
    })
    .catch(() => {
        notesStatus.textContent = 'Sauvegarde locale seulement (hors-ligne)';
    });
}

// ---- KIT OVERRIDE SYSTEM ----
var currentKitOverrideKey = '';
var currentKitOverrides = null;
var kitEditMode = false;

function getKitOverrideKey(fab, modele, annee) {
    return 'kit_override_' + fab + '_' + modele + '_' + annee;
}

function loadKitOverride(fab, modele, annee, callback) {
    currentKitOverrideKey = getKitOverrideKey(fab, modele, annee);
    currentKitOverrides = null;
    fetch(API_URL + '?action=get&key=' + encodeURIComponent(currentKitOverrideKey))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try {
                    currentKitOverrides = JSON.parse(data.value);
                    if (callback) callback(currentKitOverrides);
                    else applyKitOverrides(currentKitOverrides);
                } catch(e) { if (callback) callback(null); }
            } else {
                if (callback) callback(null);
            }
        })
        .catch(function() {
            var local = localStorage.getItem(currentKitOverrideKey);
            if (local) {
                try {
                    currentKitOverrides = JSON.parse(local);
                    if (callback) callback(currentKitOverrides);
                    else applyKitOverrides(currentKitOverrides);
                } catch(e) { if (callback) callback(null); }
            } else {
                if (callback) callback(null);
            }
        });
}

function applyKitOverrides(overrides) {
    if (!overrides) return;
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
    if (!currentKitOverrideKey) return;
    var json = JSON.stringify(overrideData);
    localStorage.setItem(currentKitOverrideKey, json);
    fetch(API_URL, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({ action: 'save', key: currentKitOverrideKey, value: json, pin: '1400' })
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
            '<option value="red"' + (currentStatus === 'red' ? ' selected' : '') + '>Obligatoire</option>' +
            '<option value="yellow"' + (currentStatus === 'yellow' ? ' selected' : '') + '>Optionnel</option>' +
            '<option value="na"' + (currentStatus === 'na' ? ' selected' : '') + '>N/A</option>';
        statusCell.innerHTML = '';
        statusCell.appendChild(select);

        // Add delete button for custom rows
        var isCustom = tr.getAttribute('data-custom') === 'true';
        if (isCustom) {
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'kit-delete-row-btn';
            deleteBtn.textContent = '\u2715';
            deleteBtn.title = 'Supprimer cette option';
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
        '<button id="kit-add-row-btn" class="kit-add-row-btn">+ Ajouter une option</button>' +
        '<div class="kit-edit-btns">' +
        '<button id="kit-save-btn" class="kit-save-btn">Sauvegarder</button>' +
        '<button id="kit-cancel-btn" class="kit-cancel-btn">Annuler</button>' +
        '</div>';
    kitSection.appendChild(actions);

    // Add row form (hidden by default)
    var addForm = document.createElement('div');
    addForm.id = 'kit-add-form';
    addForm.className = 'kit-add-row-form';
    addForm.style.display = 'none';
    addForm.innerHTML =
        '<input type="text" id="kit-new-label" class="kit-new-input" placeholder="Nom de l\'option">' +
        '<input type="text" id="kit-new-code" class="kit-new-input" placeholder="Code produit (ex: 1500-XXXX)">' +
        '<select id="kit-new-status" class="kit-status-select">' +
        '<option value="red">Obligatoire</option>' +
        '<option value="yellow" selected>Optionnel</option>' +
        '</select>' +
        '<button id="kit-new-add" class="kit-new-add-btn">Ajouter</button>';
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
            '<option value="red"' + (status === 'red' ? ' selected' : '') + '>Obligatoire</option>' +
            '<option value="yellow"' + (status === 'yellow' ? ' selected' : '') + '>Optionnel</option>' +
            '<option value="na">N/A</option></select>';
        tr.innerHTML =
            '<td>' + label + '<button class="kit-delete-row-btn" title="Supprimer">\u2715</button></td>' +
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
    showKitToast('Configuration kit sauvegardee');
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

function toggleKitEdit() {
    if (kitEditMode) {
        exitKitEditMode(false);
    } else {
        enterKitEditMode();
    }
}

function toggleKitLock() {
    if (kitEditMode) {
        // In edit mode: confirm, save and lock
        if (confirm('Sauvegarder les modifications?')) {
            saveKitEditMode();
        } else {
            exitKitEditMode(false);
        }
    } else {
        // Locked: unlock directly into edit mode (admin only)
        if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
            unlockKit();
            enterKitEditMode();
            var btn = document.getElementById('kit-lock-btn');
            if (btn) { btn.innerHTML = '&#128275;'; btn.classList.add('editing'); btn.title = 'Sauvegarder et verrouiller'; }
        } else {
            alert('Permission insuffisante. Connectez-vous avec un compte ayant la permission de modification BOM.');
        }
    }
}

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
    var kitTable = document.querySelector('.kit-table');
    var btn = document.getElementById('kit-lock-btn');
    if (kitTable) kitTable.classList.add('kit-locked');
    if (btn) { btn.innerHTML = '&#128274;'; btn.classList.remove('unlocked', 'editing'); btn.title = 'Deverrouiller'; }
    lockNotes();
}

function unlockKit() {
    kitUnlocked = true;
    var kitTable = document.querySelector('.kit-table');
    var btn = document.getElementById('kit-lock-btn');
    if (kitTable) kitTable.classList.remove('kit-locked');
    if (btn) { btn.innerHTML = '&#128275;'; btn.classList.add('unlocked'); btn.classList.remove('editing'); btn.title = 'Cliquer pour modifier les jetons'; }
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
                alert('Permission insuffisante. Connectez-vous avec un compte ayant la permission de modification BOM.');
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

// Auto-unlock if user has permission, otherwise lock
if (currentUser && currentUser.permissions && currentUser.permissions.modifBom) {
    unlockKit();
} else {
    lockKit();
}