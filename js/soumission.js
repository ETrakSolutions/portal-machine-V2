// ============================================
// e-Trak Portal — Soumission Page Logic
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';
const DEFAULT_EMAILS = ['robin@gryb.ca', 'k.berube@e-trak.ca'];
let targetEmails = [...DEFAULT_EMAILS];
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
fetch(API_URL + '?action=get&key=target_emails')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.value) {
            try { targetEmails = JSON.parse(data.value); } catch(e) {}
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

        var mailTo = targetEmails.join(',');
        var subject = 'Demande de soumission \u2014 ' + fab + ' ' + modele + ' (' + annee + ')';
        var body =
            'Demande de soumission e-Trak\n' +
            '================================\n\n' +
            'Machine:\n' +
            '  Type : ' + type + '\n' +
            '  Fabricant : ' + fab + '\n' +
            '  Modele : ' + modele + '\n' +
            '  Annee : ' + annee + '\n\n' +
            'Options e-Trak:\n' +
            optionsOn.map(function(o) { return '  [ON]  ' + o; }).join('\n') +
            (optionsOn.length && optionsOff.length ? '\n' : '') +
            optionsOff.map(function(o) { return '  [OFF] ' + o; }).join('\n') + '\n';

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