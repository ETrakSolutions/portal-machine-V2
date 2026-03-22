// ============================================
// e-Trak Portal — Soumission Page Logic
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';
let salesEmails = [];
let machinesData = {};
let currentUser = null;

const selectType = document.getElementById('select-type');
const selectFabricant = document.getElementById('select-fabricant');
const selectAnnee = document.getElementById('select-annee');
const selectModele = document.getElementById('select-modele');
const btnReset = document.getElementById('btn-reset');
const optionsSection = document.getElementById('options-section');
const emptyState = document.getElementById('empty-state');

// Restore user session
var saved = localStorage.getItem('portal_user');
if (saved) {
    try { currentUser = JSON.parse(saved); } catch(e) {}
}

// Load emails
fetch(API_URL + '?action=get&key=sales_emails')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.value) {
            try { salesEmails = JSON.parse(data.value); } catch(e) {}
        }
    })
    .catch(function() {});

// Load machines data
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

// Cascading selects
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

selectModele.addEventListener('change', () => {
    const modele = selectModele.value;
    if (!modele) {
        hideOptions();
        return;
    }
    showOptions();
});

function resetFrom(level) {
    const levels = ['fabricant', 'annee', 'modele'];
    const startIdx = levels.indexOf(level);
    const selects = [selectFabricant, selectAnnee, selectModele];
    const defaults = ['-- Selectionnez --', '-- Selectionnez --', '-- Selectionnez --'];
    for (let i = startIdx; i < levels.length; i++) {
        const sel = selects[i];
        sel.innerHTML = '<option value="">' + defaults[i] + '</option>';
        sel.disabled = true;
    }
    hideOptions();
}

btnReset.addEventListener('click', () => {
    selectType.value = '';
    resetFrom('fabricant');
    btnReset.style.display = 'none';
});

function showOptions() {
    const type = selectType.value;
    const fab = selectFabricant.value;
    const annee = selectAnnee.value;
    const modele = selectModele.value;

    optionsSection.style.display = 'block';
    emptyState.style.display = 'none';

    var infoEl = document.getElementById('soumission-machine-info');
    if (infoEl) {
        infoEl.textContent = 'Machine : ' + fab + ' ' + modele + ' (' + annee + ') — ' + type;
    }

    // Reset all toggle boxes
    document.querySelectorAll('.toggle-box').forEach(function(box) {
        box.classList.remove('active');
        box.querySelector('.toggle-status').textContent = 'OFF';
    });
    var textarea = document.getElementById('soumission-comment');
    if (textarea) textarea.value = '';

    // Load notes for this model
    loadNotesForModel(fab, modele, annee);
}

// Load notes for model
var currentNotes = '';
function loadNotesForModel(fab, modele, annee) {
    currentNotes = '';
    var key = 'notes_' + fab + '_' + modele + '_' + annee;
    fetch(API_URL + '?action=get&key=' + encodeURIComponent(key))
        .then(function(r) { return r.json(); })
        .then(function(data) { currentNotes = data.value || ''; })
        .catch(function() { currentNotes = localStorage.getItem(key) || ''; });
}

// Determine kit machine options based on specs (same logic as app.js)
function getKitSummary(type, fab, modele, specs) {
    if (type !== 'Excavatrice') return [];

    var kit = [];
    var poidsStr = specs['Poids operationnel (kg / lbs)'] || '';
    var poidsMatch = poidsStr.match(/^(\d+)/);
    var poidsKg = poidsMatch ? parseInt(poidsMatch[1]) : 99999;
    var modelUpper = modele.toUpperCase();
    var swingValue = specs['Swing boom'] || 'Non';
    var typeBras = specs['Type de boom'] || '';

    // 1500-0000 Avec cabine
    kit.push({ code: '1500-0000', name: 'Machine avec cabine (kit de base)', status: 'Obligatoire' });

    // 1500-0003 Sans cabine
    if (poidsKg < 5000 && poidsKg > 0) {
        kit.push({ code: '1500-0003', name: 'Machine sans cabine', status: 'Optionnel' });
    }

    // 1500-0001 Hauteur
    kit.push({ code: '1500-0001', name: 'Option Hauteur', status: 'Optionnel' });

    // 1500-0002 Rotation
    kit.push({ code: '1500-0002', name: 'Option Rotation', status: 'Optionnel' });

    // 1500-0304 Cremaillere (TB216 only)
    if (modelUpper === 'TB216') {
        kit.push({ code: '1500-0304', name: 'Option rotation cremaillere', status: 'Obligatoire' });
    }

    // 1500-0004 Mini excavatrice
    if (poidsKg < 5000 && poidsKg > 0) {
        kit.push({ code: '1500-0004', name: 'Option mini excavatrice', status: 'Obligatoire' });
    }

    // 1000-0070 Boite GC (Caterpillar only)
    if (fab === 'Caterpillar') {
        kit.push({ code: '1000-0070', name: 'Boite (GC)', status: 'Optionnel' });
    }

    // 1500-0008 Swing boom
    if (swingValue === 'Oui') {
        kit.push({ code: '1500-0008', name: 'Gestion swing boom', status: 'Optionnel' });
    }

    // 1500-0009 Drain hydraulique
    var drainModels = ['CX80C','CX80','CX220E','CX170E','145 D SR','CX210D','CX245D SR','CX350D','CX490D','CX300E','CX145C','315FL','440','450','320LU','308','DX190W-5','DX235','145X4 LC','145 X4','145X4','145X4D7','170X4S','170X4','170x4s','190','245X4','245X4LC','350X4','ZX210LC-8','EX200LC-5','ZX130-6','ZX190LC-7H','ZX350LC-6','ZX490LC-6','ZX50U-5N','135C','350','410','490D','330X','200CLC','130P-TIER','PC78US','R920 K LC','TB210','TW65C2HS','EC160BLC','235','EC160CL','EZ36'];
    if (drainModels.some(function(m) { return m.toUpperCase() === modelUpper; })) {
        kit.push({ code: '1500-0009', name: 'Drain hydraulique', status: 'Obligatoire' });
    }

    // 1500-0005 Multi Axes
    if (typeBras.includes('2 parties')) {
        kit.push({ code: '1500-0005', name: 'Multi Axes complet', status: 'Optionnel' });
    }

    return kit;
}

function hideOptions() {
    optionsSection.style.display = 'none';
    emptyState.style.display = 'block';
}

// Submit
var submitBtn = document.getElementById('soumission-submit');
if (submitBtn) {
    submitBtn.addEventListener('click', function() {
        var type = selectType.value;
        var fab = selectFabricant.value;
        var annee = selectAnnee.value;
        var modele = selectModele.value;
        if (!fab || !modele || !annee) return;

        // Collect toggle box states
        var optionsOn = [];
        var optionsOff = [];
        document.querySelectorAll('.toggle-box').forEach(function(box) {
            var name = box.dataset.option;
            if (box.classList.contains('active')) {
                optionsOn.push(name);
            } else {
                optionsOff.push(name);
            }
        });

        var comment = (document.getElementById('soumission-comment').value || '').trim();
        var userName = currentUser ? currentUser.name : 'Utilisateur non connecte';

        if (salesEmails.length === 0) {
            alert('Aucun courriel vente interne configure. Contactez l\'administrateur.');
            return;
        }
        var mailTo = salesEmails.join(',');
        var subject = 'Demande de soumission \u2014 ' + fab + ' ' + modele + ' (' + annee + ')';
        // Get kit machine summary
        var specs = {};
        if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee] && machinesData[type][fab][annee][modele]) {
            specs = machinesData[type][fab][annee][modele];
        }
        var kitItems = getKitSummary(type, fab, modele, specs);

        var body =
            'Demande de soumission e-Trak\n' +
            '================================\n\n' +
            'Machine:\n' +
            '  Type : ' + type + '\n' +
            '  Fabricant : ' + fab + '\n' +
            '  Modele : ' + modele + '\n' +
            '  Annee : ' + annee + '\n\n' +
            'Produits e-Trak demandes:\n' +
            optionsOn.map(function(o) { return '  [ON]  ' + o; }).join('\n') +
            (optionsOn.length && optionsOff.length ? '\n' : '') +
            optionsOff.map(function(o) { return '  [OFF] ' + o; }).join('\n') + '\n';

        // Kit Machine
        if (kitItems.length > 0) {
            body += '\nKit Machine e-Trak:\n';
            kitItems.forEach(function(item) {
                body += '  ' + item.code + ' — ' + item.name + ' (' + item.status + ')\n';
            });
        }

        // Notes
        if (currentNotes && currentNotes.trim()) {
            body += '\nNotes:\n  ' + currentNotes.trim() + '\n';
        }

        if (comment) {
            body += '\nCommentaire:\n  ' + comment + '\n';
        }

        body += '\n--------------------------------\n' +
            'Demande par : ' + userName + '\n' +
            'Portail e-Trak\n' +
            'https://etraksolutions.github.io/portal-machine/';

        window.location.href = 'mailto:' + mailTo + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    });
}

// Toggle boxes click handler
document.querySelectorAll('.toggle-box').forEach(function(box) {
    box.addEventListener('click', function() {
        this.classList.toggle('active');
        var status = this.querySelector('.toggle-status');
        if (this.classList.contains('active')) {
            status.textContent = 'ON';
        } else {
            status.textContent = 'OFF';
        }
    });
});