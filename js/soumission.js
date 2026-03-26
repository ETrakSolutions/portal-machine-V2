// ============================================
// e-Trak Portal — Soumission Page Logic
// ============================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxDuq4Qt2mrsLGiOGLrxSFvouttOfjDYzky27tjcKL72QSc__cR4qvu1X2qyDFCuB8V/exec';
let salesEmails = [];
let machinesData = {};
let currentUser = null;
let vendeursList = [];

// Codes produits par option/combinaison
var OPTION_CODES = {
    // Limiteur seul
    'Limiteur Hauteur': '1500-0000 / 1500-0001',
    'Limiteur Rotation': '1500-0000 / 1500-0002',
    'Limiteur Hauteur + Rotation': '1500-0000 / 1500-0001 / 1500-0002',
    'Limiteur Multi-axe': '1500-0005',
    // IDC seul
    'IDC': '1000-0400',
    // Limiteur + IDC
    'Limiteur Hauteur / IDC': '1500-0000 / 1500-0001 / 1000-0004',
    'Limiteur Rotation / IDC': '1500-0000 / 1500-0002 / 1000-0004',
    'Limiteur Hauteur + Rotation / IDC': '1500-0000 / 1500-0001 / 1500-0002 / 1000-0004',
    'Limiteur Multi-axe / IDC': '1500-0005 / 1000-0004',
    // Creusage
    'Systeme de creusage 2D': '1100-0007',
    // Camera
    'Camera Recul': '1300-0001',
    'Camera Recul + capteur': '1300-0012',
    'Camera Quad': '1300-0003',
    'Camera 360': '1300-0004'
};

// Load option codes from API (override defaults)
(function() {
    fetch(API_URL + '?action=get&key=soumission_option_codes')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.value) {
                var arr = JSON.parse(data.value);
                if (Array.isArray(arr)) {
                    arr.forEach(function(item) {
                        if (item.name && item.codes) OPTION_CODES[item.name] = item.codes;
                    });
                }
            }
        })
        .catch(function() {}); // Keep defaults on error
})();

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
// Load full user profile from API (to get vendeurEmail)
fetch(API_URL + '?action=get&key=authorized_users_v2')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.value && currentUser) {
            try {
                var users = JSON.parse(data.value);
                var fullUser = users.find(function(u) { return u.email && currentUser.username && u.email.toLowerCase() === currentUser.username.toLowerCase(); });
                if (fullUser && fullUser.vendeurEmail) {
                    currentUser.vendeurEmail = fullUser.vendeurEmail;
                }
            } catch(e) {}
        }
    })
    .catch(function() {});

// Load emails
fetch(API_URL + '?action=get&key=sales_emails')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.value) {
            try { salesEmails = JSON.parse(data.value); } catch(e) {}
        }
    })
    .catch(function() {});

// Load vendeurs list
fetch(API_URL + '?action=get&key=vendeurs_list')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.value) {
            try { vendeursList = JSON.parse(data.value); } catch(e) {}
        }
        var sel = document.getElementById('soumission-vendeur');
        if (sel) {
            vendeursList.forEach(function(v) {
                var opt = document.createElement('option');
                opt.value = v.email;
                opt.textContent = v.name;
                sel.appendChild(opt);
            });
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

    // Show specs section
    var specsSection = document.getElementById('specs-section');
    if (specsSection) specsSection.style.display = 'block';
    renderSpecsTable(type, fab, annee, modele);

    optionsSection.style.display = 'block';
    emptyState.style.display = 'none';

    // Update options title and description with machine info
    var titleEl = document.getElementById('options-title');
    if (titleEl) {
        titleEl.textContent = 'Options pour ' + fab + ' ' + modele + ' (' + annee + ')';
    }
    var descEl = document.getElementById('options-machine-desc');
    if (descEl) {
        descEl.textContent = 'Selectionnez les produits souhaites pour cette machine.';
    }

    var infoEl = document.getElementById('soumission-machine-info');
    if (infoEl) {
        infoEl.textContent = 'Machine : ' + fab + ' ' + modele + ' (' + annee + ') — ' + type;
    }

    // Reset all toggle boxes
    document.querySelectorAll('.toggle-box').forEach(function(box) {
        box.classList.remove('active', 'open');
        box.querySelector('.toggle-status').textContent = 'OFF';
    });
    // Reset limiteur checkboxes
    ['lim-hauteur', 'lim-rotation', 'lim-multi'].forEach(function(id) {
        var cb = document.getElementById(id);
        if (cb) { cb.checked = false; cb.disabled = false; }
    });
    // Reset camera radios
    document.querySelectorAll('input[name="camera-type"]').forEach(function(r) { r.checked = false; });
    var refInput = document.getElementById('soumission-ref-client');
    if (refInput) refInput.value = '';
    var textarea = document.getElementById('soumission-comment');
    if (textarea) textarea.value = '';

    // Load notes for this model
    loadNotesForModel(fab, modele, annee);

    // Show kit obligatory items immediately
    updateSelectedSummary();
}

// Load notes for model
var currentNotes = '';
// Render specs table for selected machine
function renderSpecsTable(type, fab, annee, modele) {
    var table = document.getElementById('soumission-specs-table');
    var title = document.getElementById('specs-title');
    if (!table) return;

    var specs = {};
    if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee] && machinesData[type][fab][annee][modele]) {
        specs = machinesData[type][fab][annee][modele];
    }

    if (title) title.textContent = fab + ' ' + modele + ' (' + annee + ')';

    var html = '';
    // Compute class
    var poidsStr = specs['Poids operationnel (kg / lbs)'] || '';
    var poidsMatch = poidsStr.match(/^(\d+)/);
    var poidsKg = poidsMatch ? parseInt(poidsMatch[1]) : 0;
    var classe = '';
    if (poidsKg > 0) {
        if (poidsKg < 2000) classe = 'Ultra-micro';
        else if (poidsKg < 6000) classe = 'Mini';
        else if (poidsKg < 10000) classe = 'Compact';
        else if (poidsKg < 20000) classe = 'Standard';
        else if (poidsKg < 35000) classe = 'Moyen';
        else if (poidsKg < 50000) classe = 'Grand';
        else if (poidsKg < 80000) classe = 'Tres grand';
        else classe = 'Mega';
    }
    if (classe) html += '<tr><td>Classe machine</td><td><strong>' + classe + '</strong></td></tr>';

    for (var key in specs) {
        var val = specs[key];
        if (key === 'Image') continue; // skip image
        if (!val || val === 'A completer') continue;

        var highlight = false;
        if (key === 'Type de traction' && val === 'Roue') highlight = true;
        if (key === 'Type de boom' && val.includes('2 parties')) highlight = true;
        if (key === 'Swing boom' && val === 'Oui') highlight = true;
        if (key === 'Voltage machine (V/type)' && val.includes('12V')) highlight = true;

        if (highlight) {
            html += '<tr><td>' + key + '</td><td><span class="flash-yellow">' + val + '</span></td></tr>';
        } else {
            html += '<tr><td>' + key + '</td><td>' + val + '</td></tr>';
        }
    }

    table.innerHTML = html || '<tr><td colspan="2" style="color:#666;">Aucune specification disponible</td></tr>';
}

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

    // 1500-0009 Drain hydraulique — same DRAIN_PREFIXES as app.js
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
    var isDrain = DRAIN_PREFIXES.some(function(p) { return modelUpper.indexOf(p.toUpperCase()) === 0; });
    if (isDrain) {
        kit.push({ code: '1500-0009', name: 'Drain hydraulique', status: 'Obligatoire' });
    }

    // 1500-0005 Multi Axes
    if (typeBras.includes('2 parties')) {
        kit.push({ code: '1500-0005', name: 'Multi Axes complet', status: 'Optionnel' });
    }

    // Harnais de coupure — obligatoire, code depend du fabricant
    var fabUp = fab.toUpperCase();
    var hCode = 'Z03B-0043'; var hName = 'Harnais Generique';
    if (fabUp === 'HITACHI') {
        var is7 = modele.indexOf('-7') >= 0;
        var is5or6 = modele.indexOf('-5') >= 0 || modele.indexOf('-6') >= 0;
        if (is7 && !is5or6) { hCode = 'Z03B-0121'; hName = 'Harnais Hitachi -7'; }
        else { hCode = 'Z03B-0031'; hName = 'Harnais Hitachi -5/-6'; }
    } else if (fabUp === 'JOHN DEERE') { hCode = 'Z03B-0031'; hName = 'Harnais Hitachi/JD'; }
    else if (fabUp === 'KOMATSU') { hCode = 'Z03B-0032'; hName = 'Harnais Komatsu'; }
    else if (fabUp.indexOf('DOOSAN') >= 0 || fabUp.indexOf('DEVELON') >= 0) { hCode = 'Z03B-0033'; hName = 'Harnais Doosan'; }
    else if (fabUp.indexOf('VOLVO') >= 0) { hCode = 'Z03B-0034'; hName = 'Harnais Volvo'; }
    else if (fabUp.indexOf('LINK') >= 0 || fabUp === 'CASE') { hCode = 'Z03B-0041'; hName = 'Harnais Link-Belt/Case'; }
    else if (fabUp.indexOf('CATERPILLAR') >= 0 || fabUp === 'CAT') { hCode = 'Z03B-0080'; hName = 'Harnais Caterpillar'; }
    kit.push({ code: hCode, name: hName, status: 'Obligatoire' });

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

        // No limiteur check — options obligatoires only shown when limiteur selected

        // Collect toggle box states with codes (same logic as summary)
        var optionsOn = [];
        var optionsOff = [];

        // Limiteur + IDC combined
        var _haut = document.getElementById('lim-hauteur');
        var _rot = document.getElementById('lim-rotation');
        var _multi = document.getElementById('lim-multi');
        var _hasH = _haut && _haut.checked;
        var _hasR = _rot && _rot.checked;
        var _hasM = _multi && _multi.checked;
        var _anyLim = _hasH || _hasR || _hasM;

        var _idcBox = document.querySelector('[data-option="Indicateur de charge"]');
        var _hasIDC = _idcBox && _idcBox.classList.contains('active');

        var _limPart = '';
        if (_hasM) _limPart = 'Limiteur Multi-axe';
        else if (_hasH && _hasR) _limPart = 'Limiteur Hauteur + Rotation';
        else if (_hasH) _limPart = 'Limiteur Hauteur';
        else if (_hasR) _limPart = 'Limiteur Rotation';

        if (_limPart && _hasIDC) {
            var _comboKey = _limPart + ' / IDC';
            optionsOn.push(_comboKey + ' (' + getCode(_comboKey) + ')');
        } else if (_limPart) {
            optionsOn.push(_limPart + ' (' + getCode(_limPart) + ')');
        } else if (_hasIDC) {
            optionsOn.push('IDC (' + getCode('IDC') + ')');
        }
        if (!_anyLim) optionsOff.push('Limiteur de portee');
        if (!_hasIDC) optionsOff.push('Indicateur de charge');

        // Creusage (checkboxes — can select both)
        var _creus2d = document.getElementById('creus-2d');
        var _creusLaser = document.getElementById('creus-laser');
        if (_creus2d && _creus2d.checked) optionsOn.push('Systeme de creusage 2D (1100-0007)');
        if (_creusLaser && _creusLaser.checked) optionsOn.push('Reference laser (1000-0009)');
        if (!(_creus2d && _creus2d.checked) && !(_creusLaser && _creusLaser.checked)) optionsOff.push('Guide de creusage');

        // Camera
        var _camBox = document.getElementById('toggle-camera');
        if (_camBox && _camBox.classList.contains('active')) {
            var _camRadio = _camBox.querySelector('input[name="camera-type"]:checked');
            if (_camRadio) {
                var _camName = 'Camera ' + _camRadio.value;
                optionsOn.push(_camName + ' (' + getCode(_camName) + ')');
            } else {
                optionsOn.push('Camera');
            }
        } else {
            optionsOff.push('Camera');
        }

        // Other toggles (skip handled ones)
        document.querySelectorAll('.toggle-box').forEach(function(box) {
            if (box.id === 'toggle-limiteur') return;
            if (box.id === 'toggle-camera') return;
            if (box.dataset.option === 'Indicateur de charge') return;
            if (box.dataset.option === 'Guide de creusage') return;
            var name = box.dataset.option;
            if (box.classList.contains('active')) {
                optionsOn.push(name);
            } else {
                optionsOff.push(name);
            }
        });

        var refClient = (document.getElementById('soumission-ref-client').value || '').trim();
        var comment = (document.getElementById('soumission-comment').value || '').trim();
        var userName = currentUser ? currentUser.name : 'Utilisateur non connecte';
        // Get vendeur from user profile (dealer/distributeur have vendeurEmail)
        var vendeurEmail = '';
        var vendeurName = '';
        if (currentUser && currentUser.vendeurEmail) {
            vendeurEmail = currentUser.vendeurEmail;
            // Find vendeur name from vendeurs list
            var v = vendeursList.find(function(vv) { return vv.email === vendeurEmail; });
            vendeurName = v ? v.name : vendeurEmail;
        }

        if (salesEmails.length === 0) {
            alert('Les courriels de vente ne sont pas encore charges. Veuillez patienter quelques secondes et reessayer.');
            // Retry loading
            fetch(API_URL + '?action=get&key=sales_emails')
                .then(function(r) { return r.json(); })
                .then(function(data) { if (data.value) { try { salesEmails = JSON.parse(data.value); } catch(e) {} } });
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

        // Load product codes then build email
        var pcApiKey = 'product_codes_' + fab.replace(/[^a-zA-Z0-9]/g,'_') + '_' + modele.replace(/[^a-zA-Z0-9]/g,'_') + '_' + annee;
        fetch(API_URL + '?action=get&key=' + encodeURIComponent(pcApiKey))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var productCodes = [];
                if (data.value) { try { productCodes = JSON.parse(data.value); } catch(e) {} }
                sendEmail(productCodes);
            })
            .catch(function() { sendEmail([]); });

        function sendEmail(productCodes) {
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

        // Product codes
        if (productCodes.length > 0) {
            body += '\nCodes produit:\n';
            productCodes.forEach(function(pc) {
                body += '  ' + pc.code + ' \u2014 ' + (pc.desc || '') + ' (x' + (pc.qty || 1) + ')\n';
            });
        }

        // Notes
        if (currentNotes && currentNotes.trim()) {
            body += '\nNotes:\n  ' + currentNotes.trim() + '\n';
        }

        if (refClient) {
            body += '\nReference client: ' + refClient + '\n';
        }

        if (comment) {
            body += '\nCommentaire:\n  ' + comment + '\n';
        }

        if (vendeurName) {
            body += '\nVendeur associe : ' + vendeurName + ' (' + vendeurEmail + ')\n';
        }

        body += '\n--------------------------------\n' +
            'Demande par : ' + userName + '\n' +
            'Portail e-Trak\n' +
            'https://etraksolutions.github.io/portal-machine/';

        var mailUrl = 'mailto:' + mailTo + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        if (vendeurEmail) {
            mailUrl += '&cc=' + encodeURIComponent(vendeurEmail);
        }
        window.location.href = mailUrl;
        } // end sendEmail
    });
}

// Build combined text for Limiteur/IDC/Creusage based on truth table
function buildLimIdcCreusageText() {
    // Read limiteur sub-options
    var haut = document.getElementById('lim-hauteur');
    var rot = document.getElementById('lim-rotation');
    var multi = document.getElementById('lim-multi');
    var hasH = haut && haut.checked;
    var hasR = rot && rot.checked;
    var hasM = multi && multi.checked;

    var idcBox = document.querySelector('[data-option="Indicateur de charge"]');
    var hasIDC = idcBox && idcBox.classList.contains('active');

    var creusBox = document.getElementById('toggle-creusage');
    var hasCR = creusBox && creusBox.classList.contains('active');

    // Build limiteur part
    var limPart = '';
    if (hasM) {
        limPart = 'Limiteur Multi-axe';
    } else if (hasH && hasR) {
        limPart = 'Limiteur Hauteur + Rotation';
    } else if (hasH) {
        limPart = 'Limiteur Hauteur';
    } else if (hasR) {
        limPart = 'Limiteur Rotation';
    }

    // Assemble parts with " / " separator
    var parts = [];
    if (limPart) parts.push(limPart);
    if (hasIDC && !limPart) parts.push('IDC');
    if (hasIDC && limPart) parts.push('IDC');
    if (hasCR) parts.push('Systeme de creusage 2D');

    return parts.join(' / ');
}

// Helper: get code for a named option
function getCode(name) {
    return OPTION_CODES[name] || '';
}

// Format item: code before description
function fmtItem(code, desc) {
    return code ? code + ' — ' + desc : desc;
}

// Individual code mappings (one code per item)
var INDIVIDUAL_CODES = {
    'Limiteur Hauteur': [{code: '1500-0001', desc: 'Limiteur Hauteur'}],
    'Limiteur Rotation': [{code: '1500-0002', desc: 'Limiteur Rotation'}],
    'Limiteur Multi-axe': [{code: '1500-0005', desc: 'Limiteur Multi-axe'}],
    'IDC': [{code: '1000-0400', desc: 'IDC Complet'}],
    'IDC ajout': [{code: '1000-0004', desc: 'IDC en ajout au limiteur'}],
    'Base limiteur': [{code: '1500-0000', desc: 'Base limiteur'}],
    'Systeme de creusage 2D': [{code: '1100-0007', desc: 'Systeme de creusage 2D'}],
    'Camera Recul': [{code: '1300-0001', desc: 'Camera de recul'}],
    'Camera Recul + capteur': [{code: '1300-0012', desc: 'Camera recul + capteur proximite'}],
    'Camera Quad': [{code: '1300-0003', desc: 'Camera Quad'}],
    'Camera 360': [{code: '1300-0004', desc: 'Camera 360 (4 cameras)'}]
};

// Update selected options summary list — each code on its own line
function updateSelectedSummary() {
    var wrap = document.getElementById('selected-options-summary');
    var list = document.getElementById('selected-options-list');
    if (!wrap || !list) return;

    var items = [];

    // Limiteur + IDC logic
    var haut = document.getElementById('lim-hauteur');
    var rot = document.getElementById('lim-rotation');
    var multi = document.getElementById('lim-multi');
    var hasH = haut && haut.checked;
    var hasR = rot && rot.checked;
    var hasM = multi && multi.checked;
    var anyLim = hasH || hasR || hasM;

    var idcBox = document.querySelector('[data-option="Indicateur de charge"]');
    var hasIDC = idcBox && idcBox.classList.contains('active');

    // Base limiteur (needed for Hauteur/Rotation, not Multi-axe)
    if ((hasH || hasR) && !hasM) {
        items.push(fmtItem('1500-0000', 'Base limiteur'));
    }
    if (hasH && !hasM) items.push(fmtItem('1500-0001', 'Limiteur Hauteur'));
    if (hasR && !hasM) items.push(fmtItem('1500-0002', 'Limiteur Rotation'));
    if (hasM) items.push(fmtItem('1500-0005', 'Limiteur Multi-axe'));

    // IDC
    if (hasIDC && anyLim) {
        items.push(fmtItem('1000-0004', 'IDC en ajout au limiteur'));
    } else if (hasIDC) {
        items.push(fmtItem('1000-0400', 'IDC Complet'));
    }

    // Guide de creusage (checkboxes — can select both)
    var creus2d = document.getElementById('creus-2d');
    var creusLaser = document.getElementById('creus-laser');
    if (creus2d && creus2d.checked) items.push(fmtItem('1100-0007', 'Systeme de creusage 2D'));
    if (creusLaser && creusLaser.checked) items.push(fmtItem('1000-0009', 'Reference laser'));

    // Camera with sub-option
    var camBox = document.getElementById('toggle-camera');
    if (camBox && camBox.classList.contains('active')) {
        var camRadio = camBox.querySelector('input[name="camera-type"]:checked');
        if (camRadio) {
            var camKey = 'Camera ' + camRadio.value;
            var camData = INDIVIDUAL_CODES[camKey];
            if (camData) {
                items.push(fmtItem(camData[0].code, camData[0].desc));
            } else {
                items.push(camRadio.value);
            }
        }
    }

    // Other toggles (skip handled ones)
    document.querySelectorAll('.toggle-box').forEach(function(box) {
        if (box.id === 'toggle-limiteur') return;
        if (box.id === 'toggle-camera') return;
        if (box.id === 'toggle-creusage') return;
        if (box.dataset.option === 'Indicateur de charge') return;
        if (box.classList.contains('active')) {
            items.push(box.dataset.option);
        }
    });

    // Add kit machine obligatory items (red tokens) — only when limiteur is selected
    var obligItems = [];
    if (anyLim) {
        var kitOblig = getKitObligatoryItems();
        kitOblig.forEach(function(item) {
            var alreadyListed = items.some(function(i) { return i.indexOf(item.code) !== -1; });
            if (!alreadyListed) {
                obligItems.push(fmtItem(item.code, item.name));
            }
        });
    }

    if (items.length > 0 || obligItems.length > 0) {
        var html = items.map(function(i) { return '<li>' + i + '</li>'; }).join('');
        html += obligItems.map(function(i) { return '<li class="oblig">' + i + '</li>'; }).join('');
        list.innerHTML = html;
        wrap.style.display = 'block';
    } else {
        list.innerHTML = '';
        wrap.style.display = 'none';
    }
}

// Get kit machine obligatory items for current selection
function getKitObligatoryItems() {
    var type = selectType.value;
    var fab = selectFabricant.value;
    var annee = selectAnnee.value;
    var modele = selectModele.value;
    if (!type || !fab || !modele) return [];

    var specs = {};
    if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee] && machinesData[type][fab][annee][modele]) {
        specs = machinesData[type][fab][annee][modele];
    }
    var kit = getKitSummary(type, fab, modele, specs);
    return kit.filter(function(item) { return item.status === 'Obligatoire'; });
}

// Toggle boxes click handler
document.querySelectorAll('.toggle-box').forEach(function(box) {
    // Limiteur and Camera have sub-options — special handler
    if (box.id === 'toggle-limiteur' || box.id === 'toggle-camera' || box.id === 'toggle-creusage') {
        box.addEventListener('click', function(e) {
            if (e.target.closest('.toggle-sub-panel')) return;
            this.classList.toggle('open');
        });
    } else {
        box.addEventListener('click', function() {
            this.classList.toggle('active');
            var status = this.querySelector('.toggle-status');
            if (this.classList.contains('active')) {
                status.textContent = 'ON';
            } else {
                status.textContent = 'OFF';
            }
            updateSelectedSummary();
        });
    }
});

// Limiteur de portee sub-options logic
(function() {
    var limBox = document.getElementById('toggle-limiteur');
    if (!limBox) return;
    var cbHauteur = document.getElementById('lim-hauteur');
    var cbRotation = document.getElementById('lim-rotation');
    var cbMulti = document.getElementById('lim-multi');
    var status = limBox.querySelector('.toggle-status');

    function updateLimiteur() {
        var parts = [];
        if (cbMulti.checked) {
            parts.push('Multi-axe');
        } else {
            if (cbHauteur.checked) parts.push('Hauteur');
            if (cbRotation.checked) parts.push('Rotation');
        }
        if (parts.length > 0) {
            limBox.classList.add('active');
            status.textContent = parts.join(' + ');
        } else {
            limBox.classList.remove('active');
            status.textContent = 'OFF';
        }
        updateSelectedSummary();
    }

    // Multi-axe is exclusive with Hauteur/Rotation
    cbMulti.addEventListener('change', function() {
        if (this.checked) {
            cbHauteur.checked = false;
            cbRotation.checked = false;
            cbHauteur.disabled = true;
            cbRotation.disabled = true;
        } else {
            cbHauteur.disabled = false;
            cbRotation.disabled = false;
        }
        updateLimiteur();
    });

    // Hauteur/Rotation disable Multi-axe
    cbHauteur.addEventListener('change', function() {
        if (this.checked || cbRotation.checked) {
            cbMulti.checked = false;
            cbMulti.disabled = true;
        } else {
            cbMulti.disabled = false;
        }
        updateLimiteur();
    });
    cbRotation.addEventListener('change', function() {
        if (this.checked || cbHauteur.checked) {
            cbMulti.checked = false;
            cbMulti.disabled = true;
        } else {
            cbMulti.disabled = false;
        }
        updateLimiteur();
    });
})();

// Camera sub-options logic (exclusive checkboxes — one at a time, but can uncheck)
(function() {
    var camBox = document.getElementById('toggle-camera');
    if (!camBox) return;
    var cbs = camBox.querySelectorAll('input[name="camera-type"]');
    var status = camBox.querySelector('.toggle-status');

    cbs.forEach(function(cb) {
        cb.addEventListener('change', function() {
            if (this.checked) {
                // Uncheck others (exclusive)
                cbs.forEach(function(other) {
                    if (other !== cb) other.checked = false;
                });
                camBox.classList.add('active');
                status.textContent = this.value;
            } else {
                // Unchecked — if nothing else checked, deactivate
                var anyChecked = false;
                cbs.forEach(function(c) { if (c.checked) anyChecked = true; });
                if (!anyChecked) {
                    camBox.classList.remove('active');
                    status.textContent = 'OFF';
                }
            }
            updateSelectedSummary();
        });
    });
})();

// Guide de creusage sub-options logic (checkboxes — can select both)
(function() {
    var creusBox = document.getElementById('toggle-creusage');
    if (!creusBox) return;
    var cb2d = document.getElementById('creus-2d');
    var cbLaser = document.getElementById('creus-laser');
    var status = creusBox.querySelector('.toggle-status');

    function updateCreusage() {
        var parts = [];
        if (cb2d && cb2d.checked) parts.push('2D');
        if (cbLaser && cbLaser.checked) parts.push('Laser');
        if (parts.length > 0) {
            creusBox.classList.add('active');
            status.textContent = parts.join(' + ');
        } else {
            creusBox.classList.remove('active');
            status.textContent = 'OFF';
        }
        updateSelectedSummary();
    }

    if (cb2d) cb2d.addEventListener('change', updateCreusage);
    if (cbLaser) cbLaser.addEventListener('change', updateCreusage);
})();