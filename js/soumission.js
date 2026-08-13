// ============================================
// e-Trak Portal — Soumission Page Logic
// ============================================

const API_URL = window.PORTAL_API_URL;  // #32 : centralise dans js/config.js (charge avant)
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
    'Camera 360': '1300-0004',
    'Camera 360 (6 cameras)': '1300-0005'
};

// Balance : produits derriere chaque sous-option. Deux groupes exclusifs — le
// modele de balance, puis l'imprimante. La Scale Lite (1200-0020) est reservee
// au tracteur (type de machine a creer) et n'a pas d'imprimante.
var BALANCE_PRODUITS = {
    'Balance loader':       { code: '1200-0010', desc: 'Balance loader (installation e-Trak)' },
    'Balance valise':       { code: '1200-0011', desc: 'Balance en valise (installation client)' },
    'Imprimante thermique': { code: '1200-0014', desc: 'Imprimante thermique' },
    'Imprimante carbone':   { code: '1200-0015', desc: 'Imprimante carbone' },
    'Balance Scale Lite':   { code: '1200-0020', desc: 'Balance Scale Lite (tracteur)' }
};

// Load option codes from API (override defaults)
(function() {
    fetch(API_URL + '?action=get&key=soumission_option_codes')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data && data.value) {
                var arr = null;
                try { arr = JSON.parse(data.value); } catch (e) { arr = null; }
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
// Action authentifiee 'listusers' (token de session) : retourne la liste sans mots de passe.
fetch(API_URL, {
    method: 'POST',
    headers: {'Content-Type': 'text/plain'},
    body: JSON.stringify({ action: 'listusers', token: (currentUser && currentUser.token) || '' })
})
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (Array.isArray(data.users) && currentUser) {
            var fullUser = data.users.find(function(u) { return u.email && currentUser.username && u.email.toLowerCase() === currentUser.username.toLowerCase(); });
            if (fullUser && fullUser.vendeurEmail) {
                currentUser.vendeurEmail = fullUser.vendeurEmail;
            }
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

// Load machines data immediately — don't wait for API
var allowedTypes = null; // null = all types allowed

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
    fetch('data/machines.json', { cache: 'no-cache' }).then(function(res) { return res.json(); }),
    window.loadMergedOverrides()   // 8 fichiers par type + repli data/overrides.json
])
    .then(function(res) {
        machinesData = applyOverrides(res[0], res[1]);
        populateTypes(); // Show all types right away
    })
    .catch(function(err) { console.error('Erreur chargement donnees:', err); });

// Prix (price list) : code produit -> { item, install }. data/prices.json
var priceData = {};
fetch('data/prices.json', { cache: 'no-cache' }).then(function(r) { return r.json(); })
    .then(function(d) { priceData = d || {}; try { updateSelectedSummary(); } catch (e) {} })
    .catch(function() {});
function priceFor(code) { return priceData[code] || { item: null, install: null }; }
function fmtPrice(v) { return (v === null || v === undefined) ? '—' : (Number(v).toLocaleString('fr-CA') + ' $'); }

// Filigrane anti-partage : le nom (+ courriel) du user connecte est repete en
// diagonale, en fond du tableau de prix. Dissuade la diffusion d'une capture
// d'ecran de nos prix : l'identite de la personne qui l'a prise reste visible.
function watermarkLabel() {
    // Source de verite = la session stockee a la connexion (robuste meme si la
    // variable currentUser n'a pas encore ete peuplee). Repli sur currentUser.
    var u = null;
    try { u = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    if (!u || (!u.name && !u.email && !u.username)) u = currentUser || {};
    var name = (u.name || '').trim();
    var mail = (u.email || u.username || '').trim();
    if (name && mail) return name + '  ·  ' + mail;
    return name || mail || i18n.t('common.confidential');
}
function watermarkBg() {
    var txt = watermarkLabel().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Tuile resserree : le nom se repete plus souvent et reste lisible meme quand
    // le tableau ne compte qu'une ou deux lignes.
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="52">' +
        '<text x="4" y="34" transform="rotate(-22 150 26)" ' +
        'font-family="Inter, Arial, sans-serif" font-size="12" font-weight="600" ' +
        'fill="#ffffff" fill-opacity="0.16">' + txt + '</text></svg>';
    return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
}

// Rafraichissement transparent : data-refresh.js appelle ceci quand overrides.json change.
// Met a jour les donnees + l'override de la machine selectionnee SANS toucher au formulaire (options en cours).
window.__onOverridesChanged = function(ov) {
    applyOverrides(machinesData, ov);
    var t = selectType && selectType.value, f = selectFabricant && selectFabricant.value,
        a = selectAnnee && selectAnnee.value, m = selectModele && selectModele.value;
    if (t && f && a && m) {
        try {
            var e = machinesData[t] && machinesData[t][f] && machinesData[t][f][a] && machinesData[t][f][a][m];
            var o = (ov[t] && ov[t][f] && ov[t][f][a] && ov[t][f][a][m]) || {};
            if (e) { if (o._bom !== undefined) e._bom = o._bom; else delete e._bom;
                     if (o._notes !== undefined) e._notes = o._notes; else delete e._notes;
                     if (o._warning !== undefined) e._warning = o._warning; else delete e._warning; }
        } catch (err) {}
        try { loadBomOverrides(f, m, a); loadNotesForModel(f, m, a); } catch (e) {}  // rafraichit kit/notes, pas le formulaire
    }
};

// Load allowed types in parallel — re-filter if API returns restrictions
fetch(API_URL + '?action=get&key=soumission_allowed_types')
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.value) {
            try {
                var parsed = JSON.parse(data.value);
                if (parsed && parsed.length > 0) {
                    allowedTypes = parsed;
                    // Re-populate with filter applied — PRESERVE la selection en cours
                    // (sinon, si l'utilisateur a deja choisi un type avant le retour de ce fetch,
                    //  la reconstruction du menu effaçait sa selection -> cascade cassee)
                    var _prevType = selectType.value;
                    while (selectType.options.length > 1) selectType.remove(1);
                    populateTypes();
                    if (_prevType) {
                        selectType.value = _prevType;
                        if (selectType.value !== _prevType) {
                            // le type choisi n'est pas dans la liste autorisee -> on repart a zero proprement
                            try { resetFrom('fabricant'); } catch (e) {}
                        }
                    }
                }
            } catch(e) {}
        }
    })
    .catch(function() {});

function populateTypes() {
    // Meme ordre que la tuile Base de donnees : Excavatrice + Pompe a Beton en tete, reste alphabetique.
    const TYPE_ORDER_PRIORITY = ['Excavatrice', 'Pompe a Beton'];
    const _all = Object.keys(machinesData);
    const types = TYPE_ORDER_PRIORITY.filter(t => _all.indexOf(t) >= 0)
        .concat(_all.filter(t => TYPE_ORDER_PRIORITY.indexOf(t) < 0).sort());
    types.forEach(type => {
        // Filter by allowed types (if configured)
        if (allowedTypes && allowedTypes.length > 0 && allowedTypes.indexOf(type) === -1) return;
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = (typeof i18n !== 'undefined') ? i18n.t('type.' + type) : type;
        selectType.appendChild(opt);
    });
}

// Check if user has manually selected any options (not just auto-displayed obligatory items)
function hasActiveOptions() {
    var anyLim = document.querySelector('#toggle-limiteur input[name="limiteur-type"]:checked');
    var anyIDC = document.querySelector('[data-option="Indicateur de charge"].active');
    var anyCreus = document.querySelector('#toggle-creusage input:checked');
    var anyCam = document.querySelector('#toggle-camera input:checked');
    return !!(anyLim || anyIDC || anyCreus || anyCam);
}

// Show HTML modal for reset confirmation, call onConfirm if accepted
function confirmReset(onConfirm) {
    var modal = document.getElementById('modal-reset');
    if (!modal) { onConfirm(); return; }
    modal.style.display = 'flex';
    document.getElementById('modal-reset-cancel').onclick = function() { modal.style.display = 'none'; };
    document.getElementById('modal-reset-confirm').onclick = function() { modal.style.display = 'none'; onConfirm(); };
}

// Cascading selects
function doTypeChange() {
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
}
selectType.addEventListener('change', () => {
    if (hasActiveOptions()) { confirmReset(doTypeChange); } else { doTypeChange(); }
});

function doFabChange() {
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
    // Peuple aussi les modeles (toutes annees confondues) — la cascade nouvelle
    // permet de choisir Modele independamment de Annee
    populateModeles(type, fab, null);
}
selectFabricant.addEventListener('change', () => {
    if (hasActiveOptions()) { confirmReset(doFabChange); } else { doFabChange(); }
});

// Helper: peuple les modeles (filtre optionnellement par annee)
function populateModeles(type, fab, anneeFilter) {
    var sel_txt = (typeof i18n !== 'undefined') ? i18n.t('common.selectionnez') : '-- Selectionnez --';
    selectModele.innerHTML = '<option value="">' + sel_txt + '</option>';
    var modelesSet = {};
    var years = Object.keys(machinesData[type][fab]);
    if (anneeFilter) years = years.filter(function(y){ return y === anneeFilter; });
    years.forEach(function(y) {
        Object.keys(machinesData[type][fab][y]).forEach(function(m) {
            if (!modelesSet[m]) modelesSet[m] = machinesData[type][fab][y][m];
        });
    });
    // Tri alphabetique naturel (numerique) -- identique a app.js : CX17C avant CX130C,
    // tous les CX groupes puis les WX, etc. Aide a retrouver un modele.
    Object.keys(modelesSet).sort(function(a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }).forEach(function(modele) {
        const opt = document.createElement('option');
        opt.value = modele;
        opt.textContent = modele;
        selectModele.appendChild(opt);
    });
    // "Autre modele (pas dans la liste)" -> permet de DEMANDER l'ajout d'une machine absente
    // (meme principe que le Portail Machine). value '__OTHER__'.
    var optAutre = document.createElement('option');
    optAutre.value = '__OTHER__';
    optAutre.textContent = (typeof i18n !== 'undefined') ? i18n.t('js.other_model') : '⊕ Autre modele (pas dans la liste)';
    optAutre.style.fontStyle = 'italic';
    selectModele.appendChild(optAutre);
    selectModele.disabled = false;
}

function doAnneeChange() {
    // L'annee est un filtre optionnel — re-filtre les modeles, mais GARDE le modele courant s'il existe pour cette annee
    const type = selectType.value;
    const fab = selectFabricant.value;
    const annee = selectAnnee.value;
    if (!fab) return;
    const prevModele = selectModele.value;
    populateModeles(type, fab, annee || null);
    if (prevModele && prevModele !== '__OTHER__' &&
        selectModele.querySelector('option[value="' + CSS.escape(prevModele) + '"]')) {
        selectModele.value = prevModele;
        doModeleChange();   // reaffiche les options pour la nouvelle annee
    } else {
        selectModele.value = '';
        hideOptions();
    }
}
selectAnnee.addEventListener('change', () => {
    if (hasActiveOptions()) { confirmReset(doAnneeChange); } else { doAnneeChange(); }
});

function doModeleChange() {
    const modele = selectModele.value;
    if (!modele) { hideOptions(); return; }
    const type = selectType.value;
    const fab = selectFabricant.value;
    if (modele === '__OTHER__') {
        // Machine absente de la BD -> proposer de demander son ajout
        showSoumissionCustomModelModal(type, fab);
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
    showOptions();
}
selectModele.addEventListener('change', () => {
    if (hasActiveOptions()) { confirmReset(doModeleChange); } else { doModeleChange(); }
});

function resetFrom(level) {
    const levels = ['fabricant', 'annee', 'modele'];
    const startIdx = levels.indexOf(level);
    const selects = [selectFabricant, selectAnnee, selectModele];
    const sel_txt = (typeof i18n !== 'undefined') ? i18n.t('common.selectionnez') : '-- Selectionnez --';
    const defaults = [sel_txt, sel_txt, sel_txt];
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
    removeRequestPanel();
    var _sb = document.getElementById('soumission-submit'); if (_sb) _sb.style.display = '';
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
        titleEl.textContent = i18n.t('soumission.options_for', { fab: fab, modele: modele, annee: annee });
    }
    var descEl = document.getElementById('options-machine-desc');
    if (descEl) {
        descEl.textContent = i18n.t('soumission.options_desc');
    }

    var infoEl = document.getElementById('soumission-machine-info');
    if (infoEl) {
        infoEl.textContent = 'Machine : ' + fab + ' ' + modele + ' (' + annee + ') — ' + i18n.t('type.' + type);
    }

    // Reset all toggle boxes
    document.querySelectorAll('.toggle-box').forEach(function(box) {
        box.classList.remove('active', 'open');
        box.querySelector('.toggle-status').textContent = 'OFF';
    });
    // Hide IDC lock valve warning on reset
    var idcWarn = document.getElementById('idc-lockvalve-warning');
    if (idcWarn) idcWarn.style.display = 'none';
    var avWarn = document.getElementById('bom-avalider-warning');
    if (avWarn) avWarn.style.display = 'none';
    var machineWarn = document.getElementById('machine-warning');
    if (machineWarn) machineWarn.style.display = 'none';
    // Reset limiteur checkboxes
    document.querySelectorAll('input[name="limiteur-type"]').forEach(function(r) { r.checked = false; });
    // Reset camera radios
    document.querySelectorAll('input[name="camera-type"]').forEach(function(r) { r.checked = false; });
    // Reset sous-options Balance (modele + imprimante)
    document.querySelectorAll('input[name="balance-type"], input[name="balance-imp"]')
            .forEach(function(r) { r.checked = false; });
    // Reset options secondaires nacelle
    document.querySelectorAll('input[name="nacelle-opt"]').forEach(function(r) { r.checked = false; });
    ['soumission-company','soumission-nb-systemes','soumission-lieu','soumission-date-install'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var textarea = document.getElementById('soumission-comment');
    if (textarea) textarea.value = '';

    // Load BOM overrides, notes, and product codes for this machine
    currentBomOverrides = null;
    currentProductCodes = [];
    loadBomOverrides(fab, modele, annee);
    loadNotesForModel(fab, modele, annee);
    loadProductCodes(fab, modele, annee);

    // Restreindre certaines options selon le type de machine
    applyTypeRestrictions(type);
    // Telehandler sans base rotative -> pas d'option Rotation
    applyRotationRestriction(type, fab, modele, annee);
    // Nacelle : options secondaires disponibles pour CETTE machine
    applyNacelleOptions();

    // Show kit obligatory items immediately
    updateSelectedSummary();
}

// Telehandler sans base rotative -> les sous-options "Rotation" et "Hauteur + Rotation"
// du limiteur ne sont pas disponibles (lues depuis la spec "Base rotative" du modele).
// Loader (chargeuse sur roues) : pas de rotation -> seule la limitation Hauteur est offerte.
function applyRotationRestriction(type, fab, modele, annee) {
    var rotCb = document.getElementById('lim-rotation');
    var hrCb = document.getElementById('lim-hr');
    var extCb = document.getElementById('lim-hauteur-ext');
    var isVac = (type === 'Camion Vacuum');
    var allowRot = true, allowHR = true;
    if (type === 'Telehandler') {
        var e = null;
        try { e = machinesData[type][fab][annee][modele]; } catch (ex) { e = null; }
        var base = e && (e['Base rotative'] || (e._specs && e._specs['Base rotative']));
        allowRot = (base === 'Oui'); allowHR = allowRot;
    } else if (type === 'Loader') {
        allowRot = false; allowHR = false;
    } else if (isVac) {
        // Camion Vacuum : choix = Hauteur / Hauteur + extension / Rotation (pas de Hauteur + Rotation)
        allowRot = true; allowHR = false;
    }
    function setVis(cb, show) {
        if (!cb) return;
        var label = cb.closest('.sub-option');
        if (label) label.style.display = show ? '' : 'none';
        if (!show) cb.checked = false;
    }
    setVis(rotCb, allowRot);
    setVis(hrCb, allowHR);
    // Hauteur + extension (1500-0505) : Camion Vacuum seulement
    setVis(extCb, isVac);
}

// Options secondaires de la nacelle (0903 a 0907) : elles s'ajoutent au kit de
// base 1500-0900 et se cumulent. Une option dont l'etat calcule vaut 'na' pour
// CETTE machine est masquee — « Nacelle articulee » n'a pas de sens sur une
// fleche telescopique. L'etat vient de kit-rules + override, donc un admin peut
// l'ouvrir ou la fermer machine par machine.
//
// Appelee DEUX fois : a la selection de la machine, puis a chaque
// updateSelectedSummary — car les overrides se chargent en asynchrone APRES la
// selection et changeraient sinon l'etat sans que l'affichage suive.
function applyNacelleOptions() {
    var box = document.getElementById('toggle-nacelle-opts');
    if (!box) return;
    var type = selectType ? selectType.value : '';
    if (type !== 'Nacelle') {
        box.style.display = 'none';
        box.classList.remove('active', 'open');
        var st0 = box.querySelector('.toggle-status');
        if (st0) st0.textContent = 'OFF';
        box.querySelectorAll('input[name="nacelle-opt"]').forEach(function (c) { c.checked = false; });
        return;
    }
    box.style.display = '';
    var specsN = null;
    try {
        specsN = machinesData[type][selectFabricant.value][selectAnnee.value][selectModele.value];
    } catch (ex) { specsN = null; }
    var KRn = window.KitRules || {};
    var defN = (KRn.nacelleDefaults && specsN) ? KRn.nacelleDefaults(specsN) : {};
    var stN = KRn.applyOverride ? KRn.applyOverride(defN, currentBomOverrides || {}, false) : defN;
    (KRn.NACELLE_OPT_CODES || ['0903', '0904', '0905', '0906', '0907']).forEach(function (code) {
        var lab = document.getElementById('sub-nac-' + code);
        var cb = document.getElementById('nac-' + code);
        var state = specsN ? (stN[code] || 'na') : 'j';
        var dispo = state !== 'na';
        if (lab) lab.style.display = dispo ? '' : 'none';
        if (!cb) return;
        if (!dispo) { cb.checked = false; cb.disabled = false; return; }
        // Option OBLIGATOIRE (r) — ex. « Articule » sur une nacelle articulee :
        // cochee d'office et verrouillee -> toujours incluse et facturee.
        if (state === 'r') { cb.checked = true; cb.disabled = true; }
        else { cb.disabled = false; }
    });
}

// Restrictions d'options par type de machine (tuile Soumission) :
//  - "Indicateur de charge" + "Guide de creusage" (2D + Reference laser) : Excavatrice seulement
//  - sous-option "Multi-axe" du Limiteur : Excavatrice ou Retrocaveuse seulement
// Les options non admissibles sont masquees ET reinitialisees (donc non comptees dans la soumission).
function applyTypeRestrictions(type) {
    var isExc = (type === 'Excavatrice');
    var isExcOrBackhoe = (type === 'Excavatrice' || type === 'Retrocaveuse');

    // Balance : deux modeles au choix exclusif — 1200-0010 (balance loader,
    // installee par les techniciens e-Trak) et 1200-0011 (balance en valise,
    // installee par le client) — plus UNE imprimante au choix : 1200-0014
    // thermique ou 1200-0015 carbone.
    // Perimetre fixe par Jacquot le 2026-08-05 : LOADER seulement. Auparavant le
    // bloc s'affichait aussi sur Telehandler et Retrocaveuse.
    // La balance Scale Lite (1200-0020) est reservee au tracteur, type
    // de machine qui reste a creer : elle n'est donc pas encore proposee ici,
    // et elle n'aura pas d'option imprimante.
    var isTracteur = (type === 'Tracteur');
    var isBalanceType = (type === 'Loader' || isTracteur);
    var balBox = document.getElementById('toggle-balance');
    if (balBox) {
        balBox.style.display = isBalanceType ? '' : 'none';
        if (!isBalanceType) {
            balBox.classList.remove('active', 'open');
            var balSt = balBox.querySelector('.toggle-status'); if (balSt) balSt.textContent = 'OFF';
            balBox.querySelectorAll('input[name="balance-type"], input[name="balance-imp"]')
                  .forEach(function(c) { c.checked = false; });
        } else {
            // Tracteur : Scale Lite (1200-0020) SEULEMENT, sans imprimante.
            // Loader : les deux balances 0010/0011 + le choix d'imprimante.
            [['sub-bal-scalelite', 'bal-scalelite', isTracteur]].concat(
                [['', 'bal-loader', !isTracteur], ['', 'bal-valise', !isTracteur],
                 ['', 'bal-imp-therm', !isTracteur], ['', 'bal-imp-carb', !isTracteur]]
            ).forEach(function(t) {
                var cb = document.getElementById(t[1]);
                if (!cb) return;
                var lab = t[0] ? document.getElementById(t[0]) : cb.closest('.sub-option');
                if (lab) lab.style.display = t[2] ? '' : 'none';
                if (!t[2]) cb.checked = false;
            });
        }
    }

    // Limiteur de portee : sans objet sur un tracteur (catalogue limite
    // a la balance Scale Lite). On masque la tuile pour eviter une selection qui
    // n'emettrait aucun produit.
    var limBoxT = document.getElementById('toggle-limiteur');
    if (limBoxT) {
        limBoxT.style.display = isTracteur ? 'none' : '';
        if (isTracteur) {
            limBoxT.classList.remove('active', 'open');
            var limStT = limBoxT.querySelector('.toggle-status'); if (limStT) limStT.textContent = 'OFF';
            limBoxT.querySelectorAll('input[name="limiteur-type"]').forEach(function(c) { c.checked = false; });
        }
    }

    // Point 1 — Indicateur de charge (excavatrice seulement)
    var idcBox = document.querySelector('[data-option="Indicateur de charge"]');
    if (idcBox) {
        idcBox.style.display = isExc ? '' : 'none';
        if (!isExc) {
            idcBox.classList.remove('active', 'open');
            var idcSt = idcBox.querySelector('.toggle-status'); if (idcSt) idcSt.textContent = 'OFF';
        }
    }
    var idcWarn = document.getElementById('idc-lockvalve-warning');
    if (idcWarn && !isExc) idcWarn.style.display = 'none';

    // Point 1 — Guide de creusage complet (2D + Reference laser), excavatrice seulement
    var creusBox = document.getElementById('toggle-creusage');
    if (creusBox) {
        creusBox.style.display = isExc ? '' : 'none';
        if (!isExc) {
            creusBox.classList.remove('active', 'open');
            var crSt = creusBox.querySelector('.toggle-status'); if (crSt) crSt.textContent = 'OFF';
            var c2d = document.getElementById('creus-2d'); if (c2d) c2d.checked = false;
            var cLaser = document.getElementById('creus-laser'); if (cLaser) cLaser.checked = false;
        }
    }

    // Point 2 — sous-option Multi-axe (excavatrice ou retrocaveuse seulement)
    var multiCb = document.getElementById('lim-multi');
    if (multiCb) {
        var multiLabel = multiCb.closest('.sub-option');
        if (multiLabel) multiLabel.style.display = isExcOrBackhoe ? '' : 'none';
        if (!isExcOrBackhoe) multiCb.checked = false;
    }
    var multiNote = document.querySelector('#limiteur-panel [data-i18n="soumission.multi_note"]');
    if (multiNote) multiNote.style.display = isExcOrBackhoe ? '' : 'none';
}

// BOM overrides, product codes, notes for current machine
var currentBomOverrides = null;
var currentProductCodes = [];
var currentNotes = '';
var currentWarning = '';

// Load BOM overrides — BD = MAITRE : lus directement dans machines.json (entry._bom)
function loadBomOverrides(fab, modele, annee) {
    var type = selectType ? selectType.value : '';
    currentBomOverrides = null;
    var entry = null;
    try { entry = machinesData[type][fab][annee][modele]; } catch(e) { entry = null; }
    if (entry && entry._bom) currentBomOverrides = entry._bom;
    updateSelectedSummary();
    // Re-render specs if _specs override is present
    if (currentBomOverrides && currentBomOverrides._specs) {
        var fab2 = selectFabricant ? selectFabricant.value : '';
        var annee2 = selectAnnee ? selectAnnee.value : '';
        var modele2 = selectModele ? selectModele.value : '';
        if (type && fab2 && annee2 && modele2) renderSpecsTable(type, fab2, annee2, modele2);
    }
}

// Load product codes from API (manually added in BD)
function loadProductCodes(fab, modele, annee) {
    var key = 'product_codes_' + fab.replace(/[^a-zA-Z0-9]/g,'_') + '_' + modele.replace(/[^a-zA-Z0-9]/g,'_') + '_' + annee;
    fetch(API_URL + '?action=get&key=' + encodeURIComponent(key))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.value) {
                try { currentProductCodes = JSON.parse(data.value); } catch(e) {}
            }
            updateSelectedSummary();
        })
        .catch(function() {});
}

// Render specs table for selected machine
function renderSpecsTable(type, fab, annee, modele) {
    var table = document.getElementById('soumission-specs-table');
    var title = document.getElementById('specs-title');
    if (!table) return;

    var specs = {};
    if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee] && machinesData[type][fab][annee][modele]) {
        // shallow copy so we don't mutate machinesData when applying overrides
        var base = machinesData[type][fab][annee][modele];
        for (var k in base) specs[k] = base[k];
    }
    // Apply _specs override (edit-machine.html is master)
    if (currentBomOverrides && currentBomOverrides._specs){
        Object.keys(currentBomOverrides._specs).forEach(function(k){
            specs[k] = currentBomOverrides._specs[k];
        });
    }

    if (title) title.textContent = fab + ' ' + modele + ' (' + annee + ')';

    var html = '';
    // Compute class
    var poidsStr = specs['Poids operationnel (kg / lbs)'] || '';
    var poidsMatch = poidsStr.match(/^(\d+)/);
    var poidsKg = poidsMatch ? parseInt(poidsMatch[1]) : 0;
    var classe = '', classeKey = '';
    if (poidsKg > 0) {
        if (poidsKg < 2000) { classe = 'Ultra-micro'; classeKey = 'class.ultra_micro'; }
        else if (poidsKg < 6000) { classe = 'Mini'; classeKey = 'class.mini'; }
        else if (poidsKg < 10000) { classe = 'Compact'; classeKey = 'class.compact'; }
        else if (poidsKg < 20000) { classe = 'Standard'; classeKey = 'class.standard'; }
        else if (poidsKg < 35000) { classe = 'Moyen'; classeKey = 'class.moyen'; }
        else if (poidsKg < 50000) { classe = 'Grand'; classeKey = 'class.grand'; }
        else if (poidsKg < 80000) { classe = 'Tres grand'; classeKey = 'class.tres_grand'; }
        else { classe = 'Mining'; classeKey = 'class.mining'; }
    }
    if (classe) html += '<tr><td>' + i18n.tSpec('Classe machine') + '</td><td><strong>' + i18n.t(classeKey) + '</strong></td></tr>';

    for (var key in specs) {
        var val = specs[key];
        if (key.charAt(0) === '_' || key === 'Flag') continue; // cacher les cles meta (_note_tech_*, _actif, _bom...)
        if (key === 'Image') continue;
        if (key === 'Classe machine') continue; // already computed above
        if (!val || val === 'A completer') continue;

        var highlight = false;
        if (key === 'Type de traction' && val === 'Roue') highlight = true;
        if (key === 'Type de boom' && String(val).includes('2 parties')) highlight = true;
        if (key === 'Swing boom' && val === 'Oui') highlight = true;
        if (key === 'Voltage machine (V/type)' && String(val).includes('12V')) highlight = true;

        var kLabel = i18n.tSpec(key);
        var vLabel = i18n.tVal(val);
        if (highlight) {
            html += '<tr><td>' + kLabel + '</td><td><span class="flash-yellow">' + vLabel + '</span></td></tr>';
        } else {
            html += '<tr><td>' + kLabel + '</td><td>' + vLabel + '</td></tr>';
        }
    }

    table.innerHTML = html || '<tr><td colspan="2" style="color:#666;">' + i18n.t('soumission.no_specs') + '</td></tr>';
}

function loadNotesForModel(fab, modele, annee) {
    // BD = MAITRE : la note (_notes) et l'avertissement (_warning) sont lus directement dans machines.json.
    currentNotes = '';
    currentWarning = '';
    var type = selectType ? selectType.value : '';
    var entry = null;
    try { entry = machinesData[type][fab][annee][modele]; } catch(e) { entry = null; }
    currentNotes = (entry && typeof entry._notes === 'string') ? entry._notes : '';
    currentWarning = (entry && typeof entry._warning === 'string') ? entry._warning : '';
    // Bandeau d'avertissement par machine (donnee _warning, editable dans edit-machine).
    var mw = document.getElementById('machine-warning');
    if (mw) {
        if (currentWarning) {
            var txt = mw.querySelector('.idc-warning-text');
            if (txt) txt.innerHTML = currentWarning.replace(/</g, '&lt;').replace(/\n/g, '<br>');
            mw.style.display = 'flex';
        } else {
            mw.style.display = 'none';
        }
    }
}

// Rattachement des lignes custom (_custom) a une OPTION. Chaque ligne peut porter
// un champ c.opt = 'limiteur' | 'lim_hauteur' | 'lim_rotation' | 'camera' | 'balance' | 'creusage' | 'idc' (ou vide).
// Elle ne s'affiche en soumission que si son option est selectionnee (ou toujours
// si opt vide). Ainsi une meme machine peut avoir un fitting pour le limiteur, un
// autre pour la balance, un autre pour la camera, chacun visible avec SON option.
var BALANCE_TYPES = { 'Telehandler': true, 'Loader': true, 'Retrocaveuse': true };
// Une bascule d'option est "selectionnee" si elle porte la classe 'active' OU
// contient un input coche (radio/checkbox de sous-option).
function _boxSelected(el) {
    if (!el) return false;
    if (el.classList && el.classList.contains('active')) return true;
    return !!el.querySelector('input:checked');
}
function optionIsSelected(optKey) {
    // Sous-portee du limiteur : la piece ne s'affiche que si la HAUTEUR (resp. la
    // ROTATION) fait partie de la selection du limiteur. Permet d'attacher une gear
    // a "Rotation seulement" (elle ne sort pas si le client prend juste la Hauteur).
    if (optKey === 'lim_hauteur' || optKey === 'lim_rotation') {
        var vals = [];
        document.querySelectorAll('#toggle-limiteur input[name="limiteur-type"]:checked').forEach(function(c){ vals.push(c.value); });
        var hasH = vals.some(function(v){ return v === 'Hauteur' || v === 'Hauteur + Rotation' || v === 'Hauteur + extension' || v === 'Multi-axe'; });
        var hasR = vals.some(function(v){ return v === 'Rotation' || v === 'Hauteur + Rotation' || v === 'Multi-axe'; });
        return optKey === 'lim_hauteur' ? hasH : hasR;
    }
    var el;
    if (optKey === 'idc') el = document.querySelector('[data-option="Indicateur de charge"]');
    else el = document.getElementById('toggle-' + optKey);  // limiteur/camera/balance/creusage
    return _boxSelected(el);
}
// Visibilite d'une ligne custom :
//  - opt explicite -> visible seulement si cette option est cochee ;
//  - pas de opt + machine a balance -> RETROCOMPAT : traite comme un fitting balance
//    (ne casse pas les fittings deja en place, non encore etiquetes) ;
//  - pas de opt + autre type -> toujours visible.
function customItemVisible(c, type) {
    var opt = c && c.opt;
    if (opt) return optionIsSelected(opt);
    if (BALANCE_TYPES[type]) return optionIsSelected('balance');
    return true;
}
// Nom d'un item custom avec sa quantite (ex. "Raccord hydraulique  ×2").
function customName(c) {
    var q = parseInt(c && c.qty);
    return ((c && (c.desc || c.code)) || '') + (q > 1 ? '  ×' + q : '');
}

// Determine kit machine options based on specs (same logic as app.js)
function getKitSummary(type, fab, modele, specs) {
    // Pompe a Beton : kit derive de la BD (pompeDefaults + override), PN/desc depuis _bom_labels.
    if (type === 'Pompe a Beton') {
        var kitP = [];
        var KRp = window.KitRules || {};
        var defP = (KRp.pompeDefaults ? KRp.pompeDefaults(specs) : {});
        var stP = (KRp.applyOverride ? KRp.applyOverride(defP, currentBomOverrides || {}, false) : defP);
        var POMPE_CODES = (KRp.POMPE_CODES) || ['0200','0203','0201','0202','0204','0205','0206','0207','0208','0209'];
        POMPE_CODES.forEach(function(code) {
            var st = stP[code] || 'na';
            if (st === 'na') return;
            var info = bomDescInfo(type, code);
            kitP.push({
                code: (info && info.pn) ? info.pn : ('1500-' + code),
                name: (info && info.desc) ? info.desc : code,
                status: st === 'v' ? 'À vérifier' : (st === 'r' ? 'Obligatoire' : 'Optionnel')
            });
        });
        // Lignes custom ajoutees via edit-machine (_custom) — visibles selon leur option (c.opt)
        if (currentBomOverrides && Array.isArray(currentBomOverrides._custom)) {
            currentBomOverrides._custom.forEach(function(c) {
                if (c.status === 'na') return;
                if (!customItemVisible(c, type)) return;
                kitP.push({
                    code: c.pn || c.code,
                    name: customName(c),
                    status: c.status === 'r' ? 'Obligatoire' : (c.status === 'v' ? 'À vérifier' : 'Optionnel'),
                    optExplicit: !!(c.opt && String(c.opt).trim())
                });
            });
        }
        return kitP;
    }
    // Generique (BD maitre) : tout autre type ayant _bom_labels -> kit depuis la BD.
    // Statut = override par machine, sinon le defaut 'def' stocke dans _bom_labels, sinon 'na'.
    if (type !== 'Excavatrice') {
        var labelsG = machinesData[type] && machinesData[type]._bom_labels;
        if (!labelsG) return [];
        var kitG = [];
        var ovG = currentBomOverrides || {};
        Object.keys(labelsG).forEach(function(key) {
            var code = key.split(' ')[0];
            var v = labelsG[key] || {};
            var ovv = ovG[code];
            var st = (ovv !== undefined && ovv !== null && ovv !== '') ? ovv : (v.def || 'na');
            if (st === 'na') return;
            kitG.push({
                code: v.pn || ('1500-' + code),
                name: v.desc || key.replace(/^[0-9]+\s*/, ''),
                status: st === 'v' ? 'À vérifier' : (st === 'r' ? 'Obligatoire' : 'Optionnel')
            });
        });
        if (Array.isArray(ovG._custom)) {
            ovG._custom.forEach(function(c) {
                if (c.status === 'na') return;
                if (!customItemVisible(c, type)) return;
                kitG.push({
                    code: c.pn || c.code,
                    name: customName(c),
                    status: c.status === 'r' ? 'Obligatoire' : (c.status === 'v' ? 'À vérifier' : 'Optionnel'),
                    optExplicit: !!(c.opt && String(c.opt).trim())
                });
            });
        }
        return kitG;
    }

    var fabUp = fab.toUpperCase();

    // Excavatrice : etat reel (defaut + override) via la source unique js/kit-rules.js,
    // identique a la page machine / BD / export. Le statut derive de l'etat AFFICHE :
    //   'r' -> Obligatoire, 'j' -> Optionnel, 'v' -> A verifier, 'na' -> masque.
    // #12 : un override 'r' sur 0001/0002/0005/0008 s'affiche desormais Obligatoire
    //       (avant : statut fige sur une liste ALWAYS_OBLIG -> override rouge ignore).
    // #13 : applyOverride(isExc=true) applique "drain 0009 jamais jaune" + _removed.
    var excState = window.KitRules.applyOverride(
        window.KitRules.excDefaults(specs, modele),
        currentBomOverrides || {}, true);

    // BOM item names (fallback si _bom_labels absent)
    var BOM_NAMES = {
        '0000': 'Machine avec cabine (kit de base)',
        '0001': 'Option Hauteur',
        '0002': 'Option Rotation',
        '0004': 'Option mini excavatrice',
        '0005': 'Multi Axes complet',
        '0008': 'Gestion swing boom',
        '0009': 'Drain hydraulique',
        '0070': 'Boite (GC)',
        '0304': 'Option rotation cremaillere'
    };
    var bomCodePrefix = {'0000':'1500-','0001':'1500-','0002':'1500-','0004':'1500-','0005':'1500-','0008':'1500-','0009':'1500-','0070':'1000-','0304':'1500-'};

    var kit = [];
    window.KitRules.EXC_CODES.forEach(function(bCode){
        var st = excState[bCode] || 'na';
        if (st === 'na') return;
        // BD maitre : PN + description longue depuis _bom_labels; fallback sur les constantes locales.
        var info = bomDescInfo(type, bCode);
        var fullCode = (info && info.pn) ? info.pn : ((bomCodePrefix[bCode] || '1500-') + bCode);
        var nm = (info && info.desc) ? info.desc : (BOM_NAMES[bCode] || bCode);
        kit.push({
            code: fullCode,
            name: nm,
            status: st === 'v' ? 'À vérifier' : (st === 'r' ? 'Obligatoire' : 'Optionnel')
        });
    });

    // Harnais de coupure — obligatoire, defaut calcule par la source unique js/kit-rules.js
    var _h = window.KitRules.harnais(fabUp, modele);
    var hCode = _h.code; var hName = 'Harnais ' + _h.name;

    // Override eventuel (libelles : meme source unique)
    if (currentBomOverrides && currentBomOverrides.harnais) {
        var _ho = window.KitRules.harnaisOverride(currentBomOverrides.harnais);
        hCode = _ho.code; hName = 'Harnais ' + _ho.name;
    }
    kit.push({ code: hCode, name: hName, status: 'Obligatoire' });

    // Custom rows from edit-machine.html (_custom) — visibles selon leur option (c.opt)
    if (currentBomOverrides && Array.isArray(currentBomOverrides._custom)){
        currentBomOverrides._custom.forEach(function(c){
            if (c.status === 'na') return;
            if (!customItemVisible(c, type)) return;
            kit.push({
                code: c.pn || c.code,
                name: customName(c),
                status: c.status === 'r' ? 'Obligatoire' : 'Optionnel',
                optExplicit: !!(c.opt && String(c.opt).trim())
            });
        });
    }

    return kit;
}

function hideOptions() {
    optionsSection.style.display = 'none';
    emptyState.style.display = 'block';
    removeRequestPanel();
    var _sb = document.getElementById('soumission-submit'); if (_sb) _sb.style.display = '';
}

// ---- Demande d'ajout d'une machine absente de la BD (meme mecanisme que le Portail Machine) ----
function portalToken() {
    try { return (JSON.parse(localStorage.getItem('portal_user')) || {}).token || ''; } catch(e) { return ''; }
}
function removeRequestPanel() {
    var p = document.getElementById('soumission-request-panel');
    if (p) p.remove();
}
function showSoumissionCustomModelModal(type, fab) {
    var t = function(k, fb){ return (typeof i18n !== 'undefined') ? i18n.t(k) : fb; };
    var existing = document.getElementById('custom-model-modal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'custom-model-modal';
    modal.className = 'custom-modal-overlay';
    modal.innerHTML =
        '<div class="custom-modal">' +
        '<h3>' + t('soum.req_title', 'Machine absente de la liste') + '</h3>' +
        '<p class="modal-desc">' + fab + ' — ' + t('type.' + type, type) + '</p>' +
        '<input type="text" id="custom-model-name" class="modal-input" placeholder="' + t('soum.req_model_ph', 'Nom du modele') + '" autocomplete="off">' +
        '<input type="text" id="custom-model-year" class="modal-input" inputmode="numeric" placeholder="' + t('soum.req_year_ph', 'Annee (ex: 2026)') + '" autocomplete="off" style="margin-top:0.5rem">' +
        '<div class="modal-buttons">' +
        '<button id="modal-cancel" class="modal-btn modal-btn-cancel">' + t('common.annuler', 'Annuler') + '</button>' +
        '<button id="modal-create" class="modal-btn modal-btn-create">' + t('soum.req_continue', 'Continuer') + '</button>' +
        '</div></div>';
    document.body.appendChild(modal);
    var nameF = document.getElementById('custom-model-name');
    var yearF = document.getElementById('custom-model-year');
    nameF.focus();
    document.getElementById('modal-cancel').addEventListener('click', function(){ modal.remove(); selectModele.value = ''; hideOptions(); });
    document.getElementById('modal-create').addEventListener('click', function(){
        var nm = nameF.value.trim(); var yr = yearF.value.trim();
        if (!nm) { nameF.style.borderColor = 'red'; return; }
        if (!/^\d{4}$/.test(yr)) { yearF.style.borderColor = 'red'; return; }
        modal.remove();
        showSoumissionRequestPanel(type, fab, nm, yr);
    });
    nameF.addEventListener('keydown', function(e){ if (e.key === 'Enter') yearF.focus(); if (e.key === 'Escape') document.getElementById('modal-cancel').click(); });
    yearF.addEventListener('keydown', function(e){ if (e.key === 'Enter') document.getElementById('modal-create').click(); if (e.key === 'Escape') document.getElementById('modal-cancel').click(); });
}
function showSoumissionRequestPanel(type, fab, modele, annee) {
    var t = function(k, fb){ return (typeof i18n !== 'undefined') ? i18n.t(k) : fb; };
    var specsSection = document.getElementById('specs-section');
    if (specsSection) specsSection.style.display = 'none';
    optionsSection.style.display = 'none';
    emptyState.style.display = 'none';
    var _sb = document.getElementById('soumission-submit'); if (_sb) _sb.style.display = 'none';
    removeRequestPanel();
    var panel = document.createElement('section');
    panel.id = 'soumission-request-panel';
    panel.className = 'options-section';
    panel.innerHTML =
        '<div class="kit-request-box">' +
        '<p class="kit-request-text">⚠ ' + fab + ' ' + modele + ' (' + annee + ') ' + t('soum.req_absent', "n'est pas dans la base de donnees.") + '</p>' +
        '<button type="button" id="soum-db-request-btn" class="kit-request-btn kit-request-btn-db">' + t('js.req_add_to_db', "📋 Demander l'ajout a la BD") + '</button>' +
        '</div>';
    document.querySelector('main').appendChild(panel);
    document.getElementById('soum-db-request-btn').addEventListener('click', function(){
        submitMachineRequest({ type: type, fab: fab, modele: modele, annee: annee }, this);
    });
}
function submitMachineRequest(info, btnEl) {
    var t = function(k, fb){ return (typeof i18n !== 'undefined') ? i18n.t(k) : fb; };
    var prev = btnEl ? btnEl.textContent : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = t('js.req_sending', 'Envoi...'); }
    fetch(API_URL + '?action=get&key=machine_requests')
        .then(function(r){ return r.json(); })
        .then(function(data){
            var list = [];
            if (data && data.value) { try { list = JSON.parse(data.value) || []; } catch(e){ list = []; } }
            if (!Array.isArray(list)) list = [];
            var dup = list.some(function(r){
                return r && r.status === 'active' && r.type === info.type &&
                    (r.fab || '') === (info.fab || '') && (r.modele || '') === (info.modele || '') &&
                    String(r.annee || '') === String(info.annee || '');
            });
            if (dup) { if (btnEl) btnEl.textContent = t('js.req_exists', '✓ Demande deja enregistree'); return null; }
            var u = currentUser || {};
            list.push({
                id: 'req_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                type: info.type, fab: info.fab, modele: info.modele, annee: info.annee,
                requester: u.name || u.username || '', requesterEmail: u.username || '',
                date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                note: '(via soumission)', status: 'active'
            });
            return fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'save', key: 'machine_requests', value: JSON.stringify(list), pin: portalToken() })
            }).then(function(r){ return r.json(); }).then(function(){
                if (btnEl) btnEl.textContent = t('js.req_done', '✓ Demande enregistree');
                notifyMachineRequest(info, u.name || u.username || '');
            });
        })
        .catch(function(){ if (btnEl) { btnEl.disabled = false; btnEl.textContent = prev; } alert(t('js.req_error', "Erreur lors de l'envoi de la demande. Reessayez.")); });
}

// Notifie par courriel (envoi backend sendsoumission) les adresses de la liste
// 'machine_request_emails' quand une nouvelle demande de machine est enregistree
// depuis la soumission. Liste geree dans l'admin ; si vide, aucun courriel. Echec
// silencieux (la demande est deja enregistree cote KV).
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

// Submit
var submitBtn = document.getElementById('soumission-submit');
if (submitBtn) {
    submitBtn.addEventListener('click', function() {
        var type = selectType.value;
        var fab = selectFabricant.value;
        var annee = selectAnnee.value;
        var modele = selectModele.value;
        if (!fab || !modele || !annee) return;

        // Champs obligatoires : le courriel ne part pas si un seul est vide.
        // Chaque case vide passe en encadre rouge; redevient normale des qu'on la remplit.
        var REQUIRED_FIELDS = [
            { id: 'soumission-company',      reqKey: 'soumission.company_required', phKey: 'soumission.company_placeholder' },
            { id: 'soumission-nb-systemes',  reqKey: 'soumission.nb_required',       phKey: 'soumission.nb_systemes_placeholder' },
            { id: 'soumission-lieu',         reqKey: 'soumission.lieu_required',     phKey: 'soumission.lieu_placeholder' }
        ];
        var _firstEmpty = null;
        REQUIRED_FIELDS.forEach(function(f) {
            var el = document.getElementById(f.id);
            if (!el) return;
            if (!(el.value || '').trim()) {
                el.style.border = '2px solid #ff4444';
                if (!_firstEmpty) _firstEmpty = el;
                if (f.phKey) {
                    var _msg = (typeof i18n !== 'undefined') ? i18n.t(f.reqKey) : '';
                    if (_msg) el.setAttribute('placeholder', _msg);
                }
                var _clear = function() {
                    el.style.border = '';
                    if (f.phKey) {
                        var _p = (typeof i18n !== 'undefined') ? i18n.t(f.phKey) : '';
                        if (_p) el.setAttribute('placeholder', _p);
                    }
                    el.removeEventListener('input', _clear);
                    el.removeEventListener('change', _clear);
                };
                el.addEventListener('input', _clear);
                el.addEventListener('change', _clear);
            }
        });
        if (_firstEmpty) { _firstEmpty.focus(); return; }

        // No limiteur check — options obligatoires only shown when limiteur selected

        // S'assurer que la liste canonique (window.__selectionLines) reflete la selection courante
        try { updateSelectedSummary(); } catch (e) {}

        // Collect toggle box states with codes (same logic as summary)
        var optionsOn = [];
        var optionsOff = [];
        var accessoires = [];   // creusage / camera : codes a lister a la suite du Kit Machine

        // Limiteur (exclusive) + IDC combined
        var _limChecked = document.querySelector('#toggle-limiteur input[name="limiteur-type"]:checked');
        var _limVal = _limChecked ? _limChecked.value : '';
        var _anyLim = !!_limVal;

        var _idcBox = document.querySelector('[data-option="Indicateur de charge"]');
        var _hasIDC = _idcBox && _idcBox.classList.contains('active');

        var _limPart = _limVal ? 'Limiteur ' + _limVal : '';

        if (_limPart && _hasIDC) {
            optionsOn.push(_limPart + ' / IDC');
        } else if (_limPart) {
            optionsOn.push(_limPart);
        } else if (_hasIDC) {
            optionsOn.push('IDC Complet');
        }
        if (!_anyLim) optionsOff.push('Limiteur de portee');
        if (!_hasIDC) optionsOff.push('Indicateur de charge');

        // Creusage (checkboxes — can select both)
        var _creus2d = document.getElementById('creus-2d');
        var _creusLaser = document.getElementById('creus-laser');
        if (_creus2d && _creus2d.checked) { var _c2d = creusage2dCode(); optionsOn.push('Systeme de creusage 2D'); accessoires.push({ code: _c2d, name: 'Systeme de creusage 2D' }); }
        if (_creusLaser && _creusLaser.checked) { optionsOn.push('Reference laser'); accessoires.push({ code: '1000-0009', name: 'Reference laser' }); }
        if (!(_creus2d && _creus2d.checked) && !(_creusLaser && _creusLaser.checked)) optionsOff.push('Guide de creusage');

        // Camera
        var _camBox = document.getElementById('toggle-camera');
        if (_camBox && _camBox.classList.contains('active')) {
            var _camRadio = _camBox.querySelector('input[name="camera-type"]:checked');
            if (_camRadio) {
                var _camName = 'Camera ' + _camRadio.value;
                var _camCode = getCode(_camName);
                optionsOn.push(_camName);
                accessoires.push({ code: _camCode, name: _camName });
            } else {
                optionsOn.push('Camera');
            }
        } else {
            optionsOff.push('Camera');
        }

        // Options secondaires nacelle (cumulables) — chacune part dans le courriel
        // avec son PN, sinon le vendeur recevrait une soumission incomplete.
        var _nacBoxE = document.getElementById('toggle-nacelle-opts');
        if (_nacBoxE && _nacBoxE.style.display !== 'none') {
            var _nacSel = _nacBoxE.querySelectorAll('input[name="nacelle-opt"]:checked');
            if (_nacSel.length) {
                _nacSel.forEach(function (cb) {
                    var info = bomDescInfo('Nacelle', cb.value);
                    var nom = (info && info.desc) ? info.desc : ('Option ' + cb.value);
                    optionsOn.push(nom);
                    accessoires.push({ code: (info && info.pn) ? info.pn : ('1500-' + cb.value), name: nom });
                });
            } else {
                optionsOff.push('Options nacelle');
            }
        }

        // Other toggles (skip handled ones)
        document.querySelectorAll('.toggle-box').forEach(function(box) {
            if (box.id === 'toggle-limiteur') return;
            if (box.id === 'toggle-camera') return;
            if (box.id === 'toggle-balance') return;
            // Nacelle : traite plus bas, sous-option par sous-option (cumulables).
            if (box.id === 'toggle-nacelle-opts') return;
            if (box.dataset.option === 'Indicateur de charge') return;
            if (box.dataset.option === 'Guide de creusage') return;
            var name = box.dataset.option;
            if (box.classList.contains('active')) {
                optionsOn.push(name);
                var od = INDIVIDUAL_CODES[name];
                if (od) accessoires.push({ code: od[0].code, name: name });
            } else {
                optionsOff.push(name);
            }
        });

        // Balance : modele choisi + imprimante eventuelle, dans le courriel aussi.
        var _balBoxE = document.getElementById('toggle-balance');
        if (_balBoxE && _balBoxE.classList.contains('active')) {
            var _balSelE = _balBoxE.querySelector('input[name="balance-type"]:checked');
            if (_balSelE && BALANCE_PRODUITS[_balSelE.value]) {
                var _bE = BALANCE_PRODUITS[_balSelE.value];
                optionsOn.push(_bE.desc);
                accessoires.push({ code: _bE.code, name: _bE.desc });
            }
            var _impSelE = _balBoxE.querySelector('input[name="balance-imp"]:checked');
            if (_impSelE && BALANCE_PRODUITS[_impSelE.value]) {
                var _iE = BALANCE_PRODUITS[_impSelE.value];
                optionsOn.push(_iE.desc);
                accessoires.push({ code: _iE.code, name: _iE.desc });
            }
        } else {
            optionsOff.push('Balance');
        }

        var comment = (document.getElementById('soumission-comment').value || '').trim();
        function _fieldVal(id){ var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
        var companyName = _fieldVal('soumission-company');
        var nbSystemes = _fieldVal('soumission-nb-systemes');
        var lieuInstall = _fieldVal('soumission-lieu');
        var dateInstall = _fieldVal('soumission-date-install');
        var userName = currentUser ? currentUser.name : i18n.t('common.user_not_connected');
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
            alert((typeof i18n !== 'undefined') ? i18n.t('soumission.emails_not_loaded') : 'Les courriels de vente ne sont pas encore charges. Veuillez patienter quelques secondes et reessayer.');
            // Retry loading
            fetch(API_URL + '?action=get&key=sales_emails')
                .then(function(r) { return r.json(); })
                .then(function(data) { if (data.value) { try { salesEmails = JSON.parse(data.value); } catch(e) {} } });
            return;
        }
        // Separateur point-virgule (Outlook ne separe PAS les adresses par virgule dans
        // un lien mailto -> il les met toutes dans un seul champ invalide et le courriel
        // ne part pas). Filtre aussi les entrees vides/espaces.
        var mailTo = salesEmails
            .map(function(e) { return (e || '').trim(); })
            .filter(function(e) { return e; })
            .join(';');
        var subject = i18n.t('email.soumission_subject', { fab: fab, modele: modele, annee: annee });
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
        // Build specs text — only key fields, highlight special values
        var EMAIL_SPEC_FIELDS = ['Type de traction', 'Type de boom', 'Swing boom', 'Voltage machine (V/type)'];
        var specsText = '';
        EMAIL_SPEC_FIELDS.forEach(function(sKey) {
            var sVal = specs[sKey];
            if (!sVal || sVal === 'A completer') return;
            var highlight = false;
            if (sKey === 'Type de traction' && sVal === 'Roue') highlight = true;
            if (sKey === 'Type de boom' && sVal.indexOf('2 parties') >= 0) highlight = true;
            if (sKey === 'Swing boom' && sVal === 'Oui') highlight = true;
            if (sKey === 'Voltage machine (V/type)' && String(sVal).indexOf('12V') >= 0) highlight = true;
            if (highlight) {
                specsText += '  ' + i18n.tSpec(sKey) + ' : *** ' + String(i18n.tVal(sVal)).toUpperCase() + ' ***\n';
            } else {
                specsText += '  ' + i18n.tSpec(sKey) + ' : ' + i18n.tVal(sVal) + '\n';
            }
        });

        var body =
            i18n.t('email.soumission_header') + '\n' +
            '================================\n\n';

        // Compagnie/dealer + installation + Notes (top of email)
        if (companyName) {
            body += i18n.t('email.company', { name: companyName }) + '\n';
        }
        if (nbSystemes) {
            body += i18n.t('email.nb_units', { n: nbSystemes }) + '\n';
        }
        if (lieuInstall) {
            body += i18n.t('email.location', { loc: lieuInstall }) + '\n';
        }
        if (dateInstall) {
            body += i18n.t('email.install_date', { date: dateInstall }) + '\n';
        }
        if (currentNotes && currentNotes.trim()) {
            body += i18n.t('email.notes_machine', { notes: currentNotes.trim() }) + '\n';
        }
        if (companyName || nbSystemes || lieuInstall || dateInstall || (currentNotes && currentNotes.trim())) {
            body += '\n';
        }

        body += i18n.t('email.machine_header') + '\n' +
            i18n.t('email.type', { type: i18n.t('type.' + type) }) + '\n' +
            i18n.t('email.fabricant', { fab: fab }) + '\n' +
            i18n.t('email.modele', { modele: modele }) + '\n' +
            i18n.t('email.annee', { annee: annee }) + '\n';

        // Warning : items du kit a valider
        var _avItems = aValiderItems();
        if (_avItems.length > 0) {
            body += (typeof i18n !== 'undefined') ? i18n.t('email.validate_items') : '\n*** ATTENTION - ITEMS A VALIDER (a confirmer avec e-Trak) ***\n';
            _avItems.forEach(function (i) { body += '  /!\\ ' + i.name + (i.code ? ' (' + i.code + ')' : '') + '\n'; });
        }

        // Multi-axe sur retrocaveuse : analyse ingenierie requise avant soumission.
        if (_limVal === 'Multi-axe' && type === 'Retrocaveuse') {
            body += (typeof i18n !== 'undefined') ? i18n.t('email.multiaxe_engineering') : '\n*** MULTI-AXE SUR RETROCAVEUSE : doit etre ANALYSE PAR L\'INGENIERIE avant la soumission. ***\n';
        }

        // Specs machine
        if (specsText) {
            body += '\n' + i18n.t('email.specs_header') + '\n' + specsText;
        }

        // Produits / kit demandes : EXACTEMENT la meme selection que l'ecran.
        // window.__selectionRows = [{code, name, oblig}] (genere par updateSelectedSummary)
        var _totItem = 0, _totInstall = 0;
        var selRows = window.__selectionRows || [];
        // Repli sur l'ancienne liste plate si la version structuree manque.
        if (selRows.length === 0 && window.__selectionLines) {
            selRows = window.__selectionLines.map(function (l) {
                var i = l.indexOf(' — ');
                return { code: i >= 0 ? l.slice(0, i).trim() : '', name: i >= 0 ? l.slice(i + 3) : l, oblig: false };
            });
        }

        if (selRows.length > 0) {
            var anyOblig = false;
            body += '\n' + i18n.t('email.products_header') + '\n';
            selRows.forEach(function (r) {
                var pr = priceFor(r.code);
                var q = lineQty(r.code, r.name);   // inclinometre pompe x nb sections, sinon 1
                if (typeof pr.item === 'number') _totItem += pr.item * q;
                if (typeof pr.install === 'number') _totInstall += pr.install * q;
                if (r.oblig) anyOblig = true;
                var mark = r.oblig ? '* ' : '';
                body += '  - ' + mark + (r.code ? r.code + '  ' : '') + r.name + '\n';
            });
            if (anyOblig) body += i18n.t('email.kit_included') + '\n';
        }

        // Une seule ligne de totaux en bas (prix indicatifs, hors taxes).
        if (_totItem > 0 || _totInstall > 0) {
            body += '\n' + i18n.t('email.total_parts') + ' : ' + fmtPrice(_totItem) +
                    '   |   ' + i18n.t('email.total_install') + ' : ' + fmtPrice(_totInstall) +
                    '   ' + i18n.t('email.total_indicative') + '\n';
        }

        // Bloc Epicor (point 1) : une ligne par item, colonnes separees par une
        // tabulation (Code / Qte / Description / Prix). Luna le copie depuis le
        // courriel et le colle directement dans la grille de commande Epicor.
        var _epiBlock = epicorBlockText();
        if (_epiBlock) {
            body += '\n' + i18n.t('email.epicor_header') + '\n' + _epiBlock + '\n';
        }

        if (comment) {
            body += '\n' + i18n.t('email.additional_info') + '\n  ' + comment + '\n';
        }

        if (vendeurName) {
            body += '\n' + i18n.t('email.vendeur', { name: vendeurName, email: vendeurEmail }) + '\n';
        }

        body += '\n--------------------------------\n' +
            i18n.t('email.requested_by', { name: userName }) + '\n' +
            'Portail e-Trak\n' +
            'https://etraksolutions.github.io/portal-machine-V2/';

        // Le vendeur attitre (dealer/distributeur) devient un DESTINATAIRE PRINCIPAL
        // (dans le "A", avec les ventes) plutot qu'une simple copie : ainsi il part
        // toujours avec la demande, y compris dans le texte du panneau "copier" si le
        // client courriel ne s'ouvre pas. Dedoublonne (au cas ou le vendeur serait deja
        // dans la liste de vente). Meme separateur ';' (Outlook).
        var toAll = mailTo;
        if (vendeurEmail) {
            var _already = mailTo.split(';').some(function(e) { return e.trim().toLowerCase() === vendeurEmail.toLowerCase(); });
            if (!_already) toAll = mailTo ? (mailTo + ';' + vendeurEmail) : vendeurEmail;
        }
        var mailUrl = 'mailto:' + toAll + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        // Memorise le contenu pour le bouton "Copier la demande" (panneau de secours) :
        // le vendeur est dans le "A", donc visible aussi dans la version copiee.
        window.__lastSoumissionEmail = { to: toAll, cc: '', subject: subject, body: body };
        window.__lastSoumissionEpicor = _epiBlock;
        // Cache un eventuel panneau de secours d'un envoi precedent.
        hideSoumissionFallback();
        // Point 2 : le panneau de copie (Copier la demande / Copier pour Epicor) est
        // TOUJOURS affiche apres une generation, pas seulement si le courriel echoue.
        renderSoumissionFallback(false);
        // Detecte si le client courriel s'ouvre; sinon, bascule le panneau en mode "alerte".
        armMailtoFallback();
        // Envoi via le client courriel de l'utilisateur (part de sa propre adresse).
        window.location.href = mailUrl;
        } // end sendEmail
    });
}

// ===========================================================================
// Panneau de secours "copier/coller" — si le client courriel ne s'ouvre pas.
// Le bouton "Envoyer" ouvre un lien mailto:. Sur un poste sans logiciel de
// courriel par defaut (webmail non configure, navigateur, mobile), rien ne se
// passe. On detecte ce cas et on offre : (1) copier la demande, (2) l'aide de
// configuration. Le bouton "?" permet aussi d'ouvrir ce panneau manuellement.
// ===========================================================================
function soumissionLang() {
    try { return localStorage.getItem('portal_lang') || 'fr'; } catch (e) { return 'fr'; }
}

function hideSoumissionFallback() {
    var box = document.getElementById('soumission-fallback');
    if (box) { box.style.display = 'none'; box.classList.remove('is-auto'); }
}

// Ouvre un brouillon PRE-REMPLI dans le webmail de l'utilisateur (Outlook 365
// web ou Gmail), a partir de la derniere demande generee. Le courriel part alors
// de SA PROPRE boite (donc livre) sans dependre d'un logiciel courriel installe
// -> depanne les postes sans client par defaut (cas de Gord). On evite l'envoi
// serveur (compte Gmail gratuit -> Google supprime les envois en silence, voir
// commit 027cc61). NB : l'URL a une limite de longueur; pour une tres longue
// demande, "Copier la demande" reste le repli sur.
function openWebmail(provider) {
    var m = window.__lastSoumissionEmail;
    var fr = soumissionLang() === 'fr';
    if (!m) {
        alert(fr ? 'Aucune demande a envoyer. Clique d\'abord sur "Envoyer la demande".'
                 : 'Nothing to send. Click "Send the request" first.');
        return;
    }
    var to = String(m.to || '').replace(/;/g, ',');   // webmail : separateur virgule
    var subj = encodeURIComponent(m.subject || '');
    var body = encodeURIComponent(m.body || '');
    var url = (provider === 'gmail')
        ? 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) + '&su=' + subj + '&body=' + body
        : 'https://outlook.office.com/mail/deeplink/compose?to=' + encodeURIComponent(to) + '&subject=' + subj + '&body=' + body;
    window.open(url, '_blank');
}

// Rend le panneau. auto=true => le courriel ne s'est pas ouvert (ton "alerte").
function renderSoumissionFallback(auto) {
    var box = document.getElementById('soumission-fallback');
    if (!box) return;
    var fr = soumissionLang() === 'fr';
    var title = auto
        ? (fr ? '📭 Le courriel ne s\'est pas ouvert ?' : '📭 Email didn\'t open?')
        : (fr ? '📋 Envoyer autrement' : '📋 Send another way');
    var text = auto
        ? (fr ? 'Aucun logiciel de courriel par defaut sur cet appareil. Ouvre ta demande directement dans ton webmail (Outlook ou Gmail) avec les boutons ci-dessous — elle partira de ta propre boite. Ou copie-la pour la coller dans un courriel.'
              : 'No default email app on this device. Open your request directly in your webmail (Outlook or Gmail) with the buttons below — it will be sent from your own mailbox. Or copy it to paste into an email.')
        : (fr ? 'Envoie ta demande directement dans ton webmail (Outlook ou Gmail), ou copie-la pour la coller dans un courriel.'
              : 'Send your request directly in your webmail (Outlook or Gmail), or copy it to paste into an email.');
    var copyLabel = fr ? '📋 Copier la demande' : '📋 Copy the request';
    var epicorLabel = fr ? '📋 Copier pour Epicor' : '📋 Copy for Epicor';
    var outlookLabel = fr ? '📧 Ouvrir dans Outlook (web)' : '📧 Open in Outlook (web)';
    var gmailLabel = fr ? '📧 Ouvrir dans Gmail' : '📧 Open in Gmail';
    var helpSummary = fr ? 'Configurer mon courriel par defaut' : 'Set up my default email';
    var helpItems = fr ? [
        '<b>Windows</b> : Parametres → Applications → Applications par defaut → choisir Outlook (ou Courrier) pour le courriel.',
        '<b>Chrome + Gmail</b> : cliquer l\'icone en losange a droite de la barre d\'adresse, puis autoriser Gmail a ouvrir les liens courriel.',
        '<b>iPhone / Android</b> : installer et se connecter a l\'app Mail ou Gmail.',
        'Sinon, utilise simplement le bouton <b>Copier la demande</b> ci-dessus.'
    ] : [
        '<b>Windows</b>: Settings → Apps → Default apps → choose Outlook (or Mail) for email.',
        '<b>Chrome + Gmail</b>: click the diamond icon at the right of the address bar, then allow Gmail to open email links.',
        '<b>iPhone / Android</b>: install and sign in to the Mail or Gmail app.',
        'Otherwise, just use the <b>Copy the request</b> button above.'
    ];
    var itemsHtml = helpItems.map(function (i) { return '<li>' + i + '</li>'; }).join('');
    box.className = 'soumission-fallback' + (auto ? ' is-auto' : '');
    box.innerHTML =
        '<p class="soumission-fallback-title">' + title + '</p>' +
        '<p class="soumission-fallback-text">' + text + '</p>' +
        '<button type="button" id="soumission-outlook-btn" class="soumission-copy-btn">' + outlookLabel + '</button>' +
        '<button type="button" id="soumission-gmail-btn" class="soumission-copy-btn" style="margin-top:8px;">' + gmailLabel + '</button>' +
        '<button type="button" id="soumission-copy-btn" class="soumission-copy-btn" style="margin-top:8px;">' + copyLabel + '</button>' +
        '<button type="button" id="soumission-copy-epicor-btn" class="soumission-copy-btn" style="margin-top:8px;">' + epicorLabel + '</button>' +
        '<details class="soumission-fallback-help"><summary>' + helpSummary + '</summary><ul>' + itemsHtml + '</ul></details>';
    box.style.display = 'block';
    var olBtn = document.getElementById('soumission-outlook-btn');
    if (olBtn) olBtn.addEventListener('click', function () { openWebmail('outlook'); });
    var gmBtn = document.getElementById('soumission-gmail-btn');
    if (gmBtn) gmBtn.addEventListener('click', function () { openWebmail('gmail'); });
    var copyBtn = document.getElementById('soumission-copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', copySoumissionRequest);
    var epiBtn = document.getElementById('soumission-copy-epicor-btn');
    if (epiBtn) epiBtn.addEventListener('click', copyEpicorBlock);
}

// Ce panneau est construit en JS au moment du clic : il n a donc aucun attribut
// data-i18n, et translatePage() ne le voit pas. Sans ce reabonnement, un
// panneau ouvert en francais y restait apres une bascule vers l anglais
// (signale par Jacquot le 2026-08-06). On le reconstruit dans la nouvelle
// langue, en conservant son etat « auto » (declenche par un courriel qui ne
// s est pas ouvert) plutot que son etat « ouvert a la main ».
window.addEventListener('langchange', function () {
    var box = document.getElementById('soumission-fallback');
    if (!box || box.style.display === 'none' || !box.innerHTML) return;
    renderSoumissionFallback(box.classList.contains('is-auto'));
});

// Construit le texte complet (destinataires + objet + corps) et le copie.
function copySoumissionRequest() {
    var m = window.__lastSoumissionEmail;
    var fr = soumissionLang() === 'fr';
    var btn = document.getElementById('soumission-copy-btn');
    if (!m) {
        alert(fr ? 'Aucune demande a copier. Clique d\'abord sur "Envoyer la demande".'
                 : 'Nothing to copy. Click "Send the request" first.');
        return;
    }
    var text =
        (fr ? 'A : ' : 'To: ') + (m.to || '').replace(/;/g, '; ') + '\n' +
        (m.cc ? (fr ? 'Cc : ' : 'Cc: ') + m.cc + '\n' : '') +
        (fr ? 'Objet : ' : 'Subject: ') + m.subject + '\n\n' +
        m.body;
    var done = function () {
        if (!btn) return;
        var prev = btn.textContent;
        btn.classList.add('is-copied');
        btn.textContent = fr ? '✓ Copie !' : '✓ Copied!';
        setTimeout(function () { btn.classList.remove('is-copied'); btn.textContent = prev; }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text, done); });
    } else {
        legacyCopy(text, done);
    }
}

function legacyCopy(text, cb) {
    try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (cb) cb();
    } catch (e) {
        alert((soumissionLang() === 'fr')
            ? 'Impossible de copier automatiquement. Selectionne le texte manuellement.'
            : 'Automatic copy failed. Please select the text manually.');
    }
}

// ===========================================================================
// Bloc "Epicor" (point 1) — Luna colle la soumission dans l'ERP Epicor.
// On produit une ligne par item, colonnes separees par une TABULATION :
//   CODE <tab> QTE <tab> DESCRIPTION <tab> PRIX
// (prix = prix piece unitaire, nombre brut sans mise en forme -> colle propre
//  dans une grille). La quantite est extraite du nom (ex. "... x2" / "... ×2").
// ===========================================================================
function _splitQty(name) {
    var m = String(name || '').match(/\s*[x×]\s*(\d+)\s*$/i);
    if (m) return { qty: parseInt(m[1], 10) || 1, desc: String(name).slice(0, m.index).trim() };
    return { qty: 1, desc: String(name || '').trim() };
}
// Suffixe 4 chiffres d'un code produit (ex. "1500-0208" -> "0208").
function _codeSuffix(c) { var m = String(c || '').match(/(\d{4})\s*$/); return m ? m[1] : ''; }
// Quantite d'une ligne : pour l'inclinometre pompe (…0208), la quantite = nombre
// de sections encode dans le nom via "×N" ; sinon 1. Sert au prix etendu (ecran +
// courriel) ET a la colonne Qte du bloc Epicor.
function lineQty(code, name) {
    return (_codeSuffix(code) === '0208') ? _splitQty(name).qty : 1;
}
function buildEpicorRows() {
    var rows = window.__selectionRows || [];
    return rows
        .filter(function (r) { return r && (r.code || r.name); })
        .map(function (r) {
            var sq = _splitQty(r.name);
            var pr = priceFor(r.code);
            return { code: r.code || '', qty: sq.qty, desc: sq.desc,
                     price: (typeof pr.item === 'number') ? pr.item : null };
        });
}
function epicorBlockText() {
    return buildEpicorRows().map(function (r) {
        return [r.code, r.qty, r.desc, (r.price === null ? '' : r.price)].join('\t');
    }).join('\n');
}
function copyEpicorBlock() {
    var fr = soumissionLang() === 'fr';
    var btn = document.getElementById('soumission-copy-epicor-btn');
    var text = (window.__lastSoumissionEpicor && window.__lastSoumissionEpicor.trim())
        ? window.__lastSoumissionEpicor : epicorBlockText();
    if (!text || !text.trim()) {
        alert(fr ? 'Aucun item a copier. Selectionne au moins une option.'
                 : 'Nothing to copy. Select at least one option.');
        return;
    }
    var prev = btn ? btn.textContent : '';
    var done = function () {
        if (!btn) return;
        btn.classList.add('is-copied');
        btn.textContent = fr ? '✓ Copie !' : '✓ Copied!';
        setTimeout(function () { btn.classList.remove('is-copied'); btn.textContent = prev; }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { legacyCopy(text, done); });
    } else {
        legacyCopy(text, done);
    }
}

// Detecte si le lien mailto a ouvert le client courriel. Si la fenetre ne perd
// pas le focus dans le delai, c'est qu'aucun logiciel n'a pris le relais.
function armMailtoFallback() {
    var opened = false;
    var onBlur = function () { opened = true; };
    var onHide = function () { if (document.hidden) opened = true; };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHide);
    setTimeout(function () {
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onHide);
        if (!opened) { renderSoumissionFallback(true); }
    }, 1500);
}

// Bouton "?" a cote de "Envoyer" : ouvre/ferme le panneau de secours.
(function () {
    var help = document.getElementById('soumission-help-toggle');
    if (!help) return;
    help.addEventListener('click', function () {
        var box = document.getElementById('soumission-fallback');
        if (box && box.style.display !== 'none') { hideSoumissionFallback(); }
        else { renderSoumissionFallback(false); }
    });
})();

// Build combined text for Limiteur/IDC/Creusage based on truth table
function buildLimIdcCreusageText() {
    var limChecked = document.querySelector('#toggle-limiteur input[name="limiteur-type"]:checked');
    var limVal = limChecked ? limChecked.value : '';

    var idcBox = document.querySelector('[data-option="Indicateur de charge"]');
    var hasIDC = idcBox && idcBox.classList.contains('active');

    var creusBox = document.getElementById('toggle-creusage');
    var hasCR = creusBox && creusBox.classList.contains('active');

    var parts = [];
    if (limVal) parts.push('Limiteur ' + limVal);
    if (hasIDC) parts.push('IDC');
    if (hasCR) parts.push('Systeme de creusage 2D');

    return parts.join(' / ');
}

// Helper: get code for a named option
function getCode(name) {
    return OPTION_CODES[name] || '';
}

// Format item: code before description
// Assemble « code — description ». La description est traduite via i18n.tBom :
// les libellés codes en dur (creusage, laser, IDC, camera, balance...) etaient
// sinon laisses en francais dans un courriel/ecran en anglais. tBom renvoie le
// texte tel quel en FR et pour toute chaine sans traduction -> sans effet de bord.
function fmtItem(code, desc) {
    var d = (typeof i18n !== 'undefined' && i18n.tBom) ? i18n.tBom(desc) : desc;
    return code ? code + ' — ' + d : d;
}

// Code du creusage 2D selon le limiteur de portee — REGLE FIXE excavatrice (non-overridable) :
//   Limiteur Hauteur / Hauteur+Rotation / Multi-axe -> 1000-0007 (creusage 2D integre au limiteur)
//   sinon (aucun limiteur, ou Rotation seule)        -> 1100-0007 (creusage 2D autonome)
function creusage2dCode() {
    var c = document.querySelector('#toggle-limiteur input[name="limiteur-type"]:checked');
    var v = c ? c.value : '';
    return (v === 'Hauteur' || v === 'Hauteur + Rotation' || v === 'Multi-axe') ? '1000-0007' : '1100-0007';
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
    'Camera 360': [{code: '1300-0004', desc: 'Camera 360 (4 cameras)'}],
    'Camera 360 (6 cameras)': [{code: '1300-0005', desc: 'Camera 360 (set de 6 cameras)'}],
    'Balance loader (installation e-Trak)': [{code: '1200-0010', desc: 'Balance loader (installation e-Trak)'}],
    'Balance en valise (installation client)': [{code: '1200-0011', desc: 'Balance en valise (installation client)'}],
    'Imprimante thermique': [{code: '1200-0014', desc: 'Imprimante thermique'}],
    'Imprimante carbone': [{code: '1200-0015', desc: 'Imprimante carbone'}]
};

// Update selected options summary list — each code on its own line
// Codes du limiteur (base/hauteur/rotation/multi) propres au TYPE de machine, depuis _bom_labels.
// Excavatrice -> 0000/0001/0002/0005 ; Pompe -> 0200/0201/0202 ; chaque type -> ses propres numeros.
function limiteurRoleInfo(type, role) {
    var labels = machinesData[type] && machinesData[type]._bom_labels;
    if (!labels) return null;
    for (var k in labels) {
        var code = k.split(' ')[0];
        var nom = k.slice(code.length).trim().toLowerCase();
        var v = labels[k] || {};
        var pn = v.pn || ('1500-' + code), desc = v.desc || k.slice(code.length).trim();
        if (role === 'base') {
            if (/(cabine|coffre|base)/.test(nom) && nom.indexOf('sans') < 0) return { pn: pn, desc: desc };
        } else if (role === 'hauteur') {
            if (nom.indexOf('hauteur') >= 0 && !/(cabine|coffre|base)/.test(nom)) return { pn: pn, desc: desc };
        } else if (role === 'rotation') {
            if (nom.indexOf('rotation') >= 0 && !/(cremaill|pignon|cylindre)/.test(nom)) return { pn: pn, desc: desc };
        } else if (role === 'multi') {
            if (nom.indexOf('multi') >= 0) return { pn: pn, desc: desc };
        }
    }
    return null;
}

function updateSelectedSummary() {
    try { updateAValiderWarning(); } catch (e) {}
    // Les overrides arrivent en asynchrone : on reevalue ici la disponibilite
    // des options nacelle, sinon un override recu apres la selection ne serait
    // pas reflete a l'ecran.
    try { applyNacelleOptions(); } catch (e) {}
    var wrap = document.getElementById('selected-options-summary');
    var list = document.getElementById('selected-options-list');
    if (!wrap || !list) return;

    var items = [];

    // Limiteur (exclusive checkbox) + IDC logic
    var limChecked = document.querySelector('#toggle-limiteur input[name="limiteur-type"]:checked');
    var limVal = limChecked ? limChecked.value : '';
    var anyLim = !!limVal;

    var idcBox = document.querySelector('[data-option="Indicateur de charge"]');
    var hasIDC = idcBox && idcBox.classList.contains('active');

    // Limiteur codes based on selection — codes PROPRES AU TYPE (depuis _bom_labels)
    var _selT = selectType.value;
    var _liBase = limiteurRoleInfo(_selT, 'base');
    var _liH = limiteurRoleInfo(_selT, 'hauteur');
    var _liR = limiteurRoleInfo(_selT, 'rotation');
    var _liM = limiteurRoleInfo(_selT, 'multi');
    var _selHasLabels = !!(machinesData[_selT] && machinesData[_selT]._bom_labels);
    // Pompe a Beton : le limiteur est un ON/OFF maitre (base + sections obligatoires),
    // Hauteur/Rotation etant des options. "Limiteur present" = la tuile est active,
    // pas une sous-option cochee (un client peut vouloir seulement la camera).
    var _isPompe0 = (_selT === 'Pompe a Beton');
    var _limBox0 = document.getElementById('toggle-limiteur');
    // "Limiteur present" = la tuile Limiteur est active. Signal universel (tous types) :
    //  - Pompe : bascule ON/OFF via le header (base + sections obligatoires).
    //  - Excavatrice / Vacuum / autres : active des qu'une sous-option (Hauteur/Rotation) est cochee.
    var limiterOn = !!(_limBox0 && _limBox0.classList.contains('active'));
    // Regle universelle (tout type) : ne rien afficher dans "Options selectionnees" tant que
    // le client n'a coche AUCUNE option. Toute tuile active (limiteur, camera, balance, creusage,
    // IDC, produits) porte la classe .active -> signal unique et fiable.
    var hasUserSelection = document.querySelectorAll('.toggle-box.active').length > 0;
    // Avertissement : Multi-axe sur retrocaveuse -> doit etre approuve par l'ingenierie.
    var _maw = document.getElementById('multiaxe-retro-warning');
    if (_maw) _maw.style.display = (limVal === 'Multi-axe' && _selT === 'Retrocaveuse') ? 'flex' : 'none';
    // Avertissement par machine : pilote par la donnee _warning (voir loadNotesForModel / #machine-warning).
    function pushLi(info, fbCode, fbDesc) {
        if (info) { items.push(fmtItem(info.pn, i18n.tBom(info.desc))); return; }
        // Repli sur les codes excavatrice UNIQUEMENT pour l'Excavatrice (ou type sans _bom_labels).
        // Pour un type connu sans ce role (ex. Telehandler sans hauteur dediee) : ne rien emettre
        // -> evite la fuite de codes excavatrice.
        if (fbCode && (_selT === 'Excavatrice' || !_selHasLabels)) items.push(fmtItem(fbCode, fbDesc));
    }
    if (_selT === 'Camion Vacuum') {
        // Vacuum : groupe hauteur exclusif (Hauteur OU Hauteur + extension) + Rotation independante.
        // La base (1500-0503) vient du kit obligatoire, pas du limiteur. Plusieurs cases possibles.
        var _vHE = document.getElementById('lim-hauteur-ext');
        var _vH = document.getElementById('lim-hauteur');
        var _vR = document.getElementById('lim-rotation');
        if (_vHE && _vHE.checked) items.push(fmtItem('1500-0505', 'Limitation Hauteur + extension'));
        else if (_vH && _vH.checked) items.push(fmtItem('1500-0501', 'Limitation Hauteur camion vac'));
        if (_vR && _vR.checked) items.push(fmtItem('1500-0502', 'Limitation Rotation camion vac'));
    } else if (_isPompe0) {
        // Pompe : la base (0200/0203) + les options de sections viennent du kit obligatoire
        // (plus bas), uniquement si le limiteur est ON. Ici, on ajoute seulement les options
        // Hauteur (0201) / Rotation (0202) que le client a choisies.
        if (limiterOn) {
            if ((limVal === 'Hauteur' || limVal === 'Hauteur + Rotation') && _liH) items.push(fmtItem(_liH.pn, i18n.tBom(_liH.desc)));
            if ((limVal === 'Rotation' || limVal === 'Hauteur + Rotation') && _liR) items.push(fmtItem(_liR.pn, i18n.tBom(_liR.desc)));
        }
    } else if (limVal === 'Hauteur') {
        pushLi(_liBase, '1500-0000', 'Base limiteur');
        pushLi(_liH, '1500-0001', 'Limiteur Hauteur');
    } else if (limVal === 'Rotation') {
        pushLi(_liBase, '1500-0000', 'Base limiteur');
        pushLi(_liR, '1500-0002', 'Limiteur Rotation');
    } else if (limVal === 'Hauteur + Rotation') {
        pushLi(_liBase, '1500-0000', 'Base limiteur');
        pushLi(_liH, '1500-0001', 'Limiteur Hauteur');
        pushLi(_liR, '1500-0002', 'Limiteur Rotation');
    } else if (limVal === 'Multi-axe') {
        // Multi-axe : meme produit que l'excavatrice (1500-0005), partage avec la retrocaveuse.
        if (_liM) {
            items.push(fmtItem(_liM.pn, _liM.desc));
        } else if (_selT === 'Excavatrice' || _selT === 'Retrocaveuse' || !_selHasLabels) {
            items.push(fmtItem('1500-0005', 'Limiteur Multi-axe'));
        }
    }

    // Options secondaires de la nacelle : cases independantes, montants cumules.
    // PN et libelle viennent de _bom_labels (BD = maitre), jamais codes en dur.
    if (_selT === 'Nacelle') {
        var nacBoxS = document.getElementById('toggle-nacelle-opts');
        if (nacBoxS && nacBoxS.style.display !== 'none') {
            nacBoxS.querySelectorAll('input[name="nacelle-opt"]:checked').forEach(function (cb) {
                var info = bomDescInfo('Nacelle', cb.value);
                items.push(fmtItem((info && info.pn) ? info.pn : ('1500-' + cb.value),
                                   i18n.tBom((info && info.desc) ? info.desc : cb.value)));
            });
        }
    }

    // IDC
    if (hasIDC && anyLim) {
        items.push(fmtItem('1000-0004', 'IDC en ajout au limiteur'));
    } else if (hasIDC) {
        items.push(fmtItem('1000-0400', 'IDC Complet'));
    }

    // Guide de creusage (checkboxes — can select both)
    var creus2d = document.getElementById('creus-2d');
    var creusLaser = document.getElementById('creus-laser');
    if (creus2d && creus2d.checked) items.push(fmtItem(creusage2dCode(), 'Systeme de creusage 2D'));
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
                items.push(fmtItem('', camRadio.value));   // repli : passe par tBom (pas de fuite FR)
            }
        }
    }

    // Other toggles (skip handled ones)
    document.querySelectorAll('.toggle-box').forEach(function(box) {
        if (box.id === 'toggle-limiteur') return;
        if (box.id === 'toggle-camera') return;
        if (box.id === 'toggle-creusage') return;
        if (box.id === 'toggle-balance') return;
        if (box.dataset.option === 'Indicateur de charge') return;
        if (box.classList.contains('active')) {
            var od = INDIVIDUAL_CODES[box.dataset.option];
            if (od) items.push(fmtItem(od[0].code, od[0].desc));
            else items.push(fmtItem('', box.dataset.option));   // repli : passe par tBom
        }
    });

    // Balance : le modele choisi (0010 installee / 0011 valise) + l'imprimante
    // eventuelle (0014 thermique / 0015 carbone), chacune en choix exclusif.
    var _balBoxS = document.getElementById('toggle-balance');
    if (_balBoxS && _balBoxS.classList.contains('active')) {
        var _balSelS = _balBoxS.querySelector('input[name="balance-type"]:checked');
        if (_balSelS) {
            var _b = BALANCE_PRODUITS[_balSelS.value];
            if (_b) items.push(fmtItem(_b.code, _b.desc));
        }
        var _impSelS = _balBoxS.querySelector('input[name="balance-imp"]:checked');
        if (_impSelS) {
            var _i = BALANCE_PRODUITS[_impSelS.value];
            if (_i) items.push(fmtItem(_i.code, _i.desc));
        }
    }

    // Add kit machine items.
    // Regle standard : le kit obligatoire est la base du LIMITEUR e-Trak -> il ne s'affiche
    // QUE si le limiteur est ON (pour TOUS les types). Ainsi "camera seule" (ou toute autre
    // option seule) n'entraine jamais la base de limiteur. Ceci couvre aussi les lignes custom
    // LEGACY sans option (retrocompat) : elles gardent EXACTEMENT leur comportement historique.
    // EXCEPTION : une ligne custom rattachee a une OPTION EXPLICITE (item.optExplicit, ex.
    // opt:"balance") est deja filtree par customItemVisible dans getKitSummary -> elle doit
    // sortir avec SON option meme si le limiteur est OFF (ex. fittings de balance sur un loader
    // sans limiteur). Bornee a hasUserSelection pour ne rien afficher avant toute selection.
    var obligItems = [];
    var kitAll = getKitAllItems();
    // Pompe a Beton : l'inclinometre magnetique (…0208) se pose UN par section de
    // fleche. Le nombre de sections = le PLUS GRAND code section present
    // (0203=3, 0204=4, 0205=5, 0206=6). On l'encode via "×N" dans le nom -> repris
    // par l'ecran, le courriel, le prix (etendu via lineQty) et le bloc Epicor.
    // Regle confirmee (Steve/Jacquot, 2026-08).
    var _pompeSecN = null;
    if (_selT === 'Pompe a Beton') {
        var _SECVAL = { '0203': 3, '0204': 4, '0205': 5, '0206': 6 };
        kitAll.forEach(function (it) {
            var v = _SECVAL[_codeSuffix(it.code)];
            if (v && (_pompeSecN === null || v > _pompeSecN)) _pompeSecN = v;
        });
    }
    kitAll.forEach(function(item) {
        if (item.optExplicit) { if (!hasUserSelection) return; }
        else { if (!limiterOn) return; }
        // Multi-axe remplace la base limiteur du type -> on masque la base.
        // Excavatrice : 1500-0000 ; Retrocaveuse : 1500-0600 (via _liBase) ; etc.
        var _baseSkip = (_liBase && _liBase.pn) || '';
        if (limVal === 'Multi-axe' && (item.code === '1500-0000' || (_baseSkip && item.code === _baseSkip))) return;
        var alreadyListed = items.some(function(i) { return i.indexOf(item.code) !== -1; });
        if (!alreadyListed && item.status === 'Obligatoire') {
            var _nm = i18n.tBom(item.name);
            // Inclinometre pompe : quantite = nombre de sections. Idempotent -> pas de doublon.
            if (_pompeSecN && _codeSuffix(item.code) === '0208' && !/[x×]\s*\d+\s*$/i.test(_nm)) {
                _nm = _nm + ' ×' + _pompeSecN;
            }
            obligItems.push(fmtItem(item.code, _nm));
        }
    });

    // Product codes from BD (manually added) — skip if code already listed.
    // Gate sur hasUserSelection : ne rien afficher avant qu'une option soit cochee.
    var pcItems = [];
    var allListedSoFar = items.concat(obligItems);
    if (hasUserSelection && currentProductCodes && currentProductCodes.length > 0) {
        currentProductCodes.forEach(function(pc) {
            var alreadyIn = allListedSoFar.some(function(i) { return i.indexOf(pc.code) !== -1; });
            if (alreadyIn) return;
            var desc = pc.desc || '';
            var qty = pc.qty && pc.qty > 1 ? ' x' + pc.qty : '';
            pcItems.push(fmtItem(pc.code, desc + qty));
        });
    }

    // Notes from BD — affichees seulement une fois qu'une option est cochee (jamais avant).
    var noteHtml = '';
    if (hasUserSelection && currentNotes) {
        noteHtml = '<li class="oblig note-item">Note: ' + currentNotes + '</li>';
    }

    // Camion Vacuum : 1500-0505 (Hauteur + extension) remplace 1500-0501 (Hauteur).
    // Si 0505 est present dans la selection, on retire 0501 (peu importe sa source).
    if (selectType.value === 'Camion Vacuum') {
        var _hasExt = items.concat(obligItems, pcItems).some(function (l) { return l.indexOf('1500-0505') !== -1; });
        if (_hasExt) {
            var _noH = function (arr) { return arr.filter(function (l) { return l.indexOf('1500-0501') === -1; }); };
            items = _noH(items); obligItems = _noH(obligItems); pcItems = _noH(pcItems);
        }
    }

    // Liste canonique de la selection (memes lignes que l'ecran) — reutilisee par le courriel.
    window.__selectionLines = items.concat(obligItems, pcItems);
    // Version structuree (code/nom/obligatoire) — le courriel s'en sert pour grouper proprement.
    var _mkRow = function (lineStr, oblig) {
        var idx = lineStr.indexOf(' — ');
        return {
            code: idx >= 0 ? lineStr.slice(0, idx).trim() : '',
            name: idx >= 0 ? lineStr.slice(idx + 3) : lineStr,
            oblig: !!oblig
        };
    };
    window.__selectionRows = items.map(function (l) { return _mkRow(l, false); })
        .concat(obligItems.map(function (l) { return _mkRow(l, true); }))
        .concat(pcItems.map(function (l) { return _mkRow(l, true); }));

    var allItems = items.length + obligItems.length + pcItems.length;
    if (allItems > 0 || noteHtml) {
        var totItem = 0, totInstall = 0, anyPrice = false;
        var cell = function(v) { return (v === null || v === undefined) ? '—' : fmtPrice(v); };
        var rowFor = function(lineStr, oblig) {
            var idx = lineStr.indexOf(' — ');
            var code = idx >= 0 ? lineStr.slice(0, idx).trim() : '';
            var name = idx >= 0 ? lineStr.slice(idx + 3) : lineStr;
            var pr = priceFor(code);
            // Prix ETENDU : inclinometre pompe (…0208) x nombre de sections (encode
            // dans le nom via "×N"). lineQty renvoie 1 pour toutes les autres lignes.
            var q = lineQty(code, name);
            var itemExt = (typeof pr.item === 'number') ? pr.item * q : pr.item;
            var instExt = (typeof pr.install === 'number') ? pr.install * q : pr.install;
            if (pr.item !== null || pr.install !== null) {
                anyPrice = true;
                if (typeof pr.item === 'number') totItem += pr.item * q;
                if (typeof pr.install === 'number') totInstall += pr.install * q;
            }
            var prod = code
                ? '<span style="font-family:\'JetBrains Mono\',monospace;color:#9fb4c8">' + code + '</span> ' + name
                : name;
            var dot = oblig ? '<span style="color:#FF4444">&#9679; </span>' : '';
            return '<tr>' +
                '<td style="padding:4px 10px 4px 0;vertical-align:top">' + dot + prod + '</td>' +
                '<td style="padding:4px 8px;text-align:right;white-space:nowrap">' + cell(itemExt) + '</td>' +
                '<td style="padding:4px 0 4px 8px;text-align:right;white-space:nowrap">' + cell(instExt) + '</td>' +
                '</tr>';
        };
        var rows = items.map(function(i) { return rowFor(i, false); }).join('');
        rows += obligItems.map(function(i) { return rowFor(i, true); }).join('');
        rows += pcItems.map(function(i) { return rowFor(i, true); }).join('');

        var totalRow = '';
        if (anyPrice) {
            totalRow = '<tr style="border-top:2px solid #555;font-weight:700">' +
                '<td style="padding:6px 10px 4px 0">' + i18n.t('soum.tbl_total') + ' <span style="font-weight:400;color:#aaa">(' + i18n.t('soum.tbl_combined', { total: fmtPrice(totItem + totInstall) }) + ')</span></td>' +
                '<td style="padding:6px 8px 4px;text-align:right;color:#FF8C00">' + fmtPrice(totItem) + '</td>' +
                '<td style="padding:6px 0 4px 8px;text-align:right;color:#FF8C00">' + fmtPrice(totInstall) + '</td>' +
                '</tr>';
        }
        var noteRow = currentNotes
            ? '<tr><td colspan="3" style="padding:8px 0 0;color:#9fe0a0;font-style:italic">' + i18n.t('soum.tbl_note', { note: currentNotes }) + '</td></tr>'
            : '';

        list.innerHTML =
            '<table style="width:100%;border-collapse:collapse;font-size:0.9rem">' +
            '<thead><tr style="border-bottom:1px solid #555;color:#9fb4c8;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.03em">' +
            '<th style="text-align:left;padding:0 10px 5px 0">' + i18n.t('soum.tbl_product') + '</th>' +
            '<th style="text-align:right;padding:0 8px 5px">' + i18n.t('soum.tbl_price') + '</th>' +
            '<th style="text-align:right;padding:0 0 5px 8px">' + i18n.t('soum.tbl_install') + '</th>' +
            '</tr></thead><tbody>' + rows + totalRow + noteRow + '</tbody></table>';
        // Filigrane du nom du user en fond du tableau de prix (dissuasion capture d'ecran).
        // Applique seulement si des prix sont reellement affiches.
        list.style.backgroundImage = '';   // ancienne approche (fond direct) retiree
        if (anyPrice) {
            list.style.position = 'relative';
            list.style.minHeight = '104px'; // garantit >= 2 lignes de filigrane meme si peu d'options
            // Filigrane sur une couche dediee DERRIERE le tableau. Un masque vide le
            // premier tiers (gauche) pour ne pas empieter sur les descriptions de
            // produits ; le nom apparait dans les espaces, cote prix (droite).
            var wm = document.createElement('div');
            wm.setAttribute('aria-hidden', 'true');
            var mask = 'linear-gradient(to right, transparent 0, transparent 36%, #000 50%, #000 100%)';
            wm.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;' +
                'background-image:' + watermarkBg() + ';background-repeat:repeat;' +
                '-webkit-mask-image:' + mask + ';mask-image:' + mask + ';';
            list.appendChild(wm);
            var tbl = list.querySelector('table');
            if (tbl) { tbl.style.position = 'relative'; tbl.style.zIndex = '1'; }
        } else {
            list.style.minHeight = '';
        }
        wrap.style.display = 'block';
    } else {
        list.innerHTML = '';
        list.style.backgroundImage = '';
        list.style.minHeight = '';
        wrap.style.display = 'none';
    }
}

// Get all kit machine items for current selection
function getKitAllItems() {
    var type = selectType.value;
    var fab = selectFabricant.value;
    var annee = selectAnnee.value;
    var modele = selectModele.value;
    if (!type || !fab || !modele) return [];

    var specs = {};
    if (machinesData[type] && machinesData[type][fab] && machinesData[type][fab][annee] && machinesData[type][fab][annee][modele]) {
        specs = machinesData[type][fab][annee][modele];
    }
    return getKitSummary(type, fab, modele, specs);
}

// Toggle boxes click handler
document.querySelectorAll('.toggle-box').forEach(function(box) {
    // Limiteur, Camera, Creusage et Balance ont des sous-options — handler ouverture/fermeture
    if (box.id === 'toggle-limiteur' || box.id === 'toggle-camera' || box.id === 'toggle-creusage' || box.id === 'toggle-balance') {
        box.addEventListener('click', function(e) {
            // Don't toggle open/close when clicking inside sub-panel (checkboxes, labels)
            if (e.target.closest('.toggle-sub-panel') || e.target.closest('.sub-option') || e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
            // Pompe a Beton : le limiteur est un ON/OFF maitre (base + sections). Le header
            // bascule l'etat actif ET ouvre/ferme le panneau des sous-options (Hauteur/Rotation).
            if (this.id === 'toggle-limiteur' && selectType.value === 'Pompe a Beton') {
                var willActive = !this.classList.contains('active');
                this.classList.toggle('active', willActive);
                this.classList.toggle('open', willActive);
                var st = this.querySelector('.toggle-status');
                if (st) st.textContent = willActive ? 'ON' : 'OFF';
                if (!willActive) {
                    // OFF : on decoche les sous-options Hauteur/Rotation.
                    this.querySelectorAll('input[name="limiteur-type"]').forEach(function(c){ c.checked = false; });
                }
                updateSelectedSummary();
                return;
            }
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
            // Show/hide lock valve warning for IDC on Excavatrice
            if (this.dataset.option === 'Indicateur de charge') {
                updateIdcLockValveWarning();
            }
            updateSelectedSummary();
        });
    }
});

// IDC Lock Valve warning — visible only when type=Excavatrice and IDC is ON
function updateIdcLockValveWarning() {
    var warning = document.getElementById('idc-lockvalve-warning');
    if (!warning) return;
    var type = selectType.value;
    var idcBox = document.querySelector('[data-option="Indicateur de charge"]');
    var isExcavatrice = type === 'Excavatrice';
    var isActive = idcBox && idcBox.classList.contains('active');
    warning.style.display = (isExcavatrice && isActive) ? 'flex' : 'none';
}

// Items du kit "a valider" (etat 'v') de la machine selectionnee.
// 'v' ne vient que des corrections (overrides) -> on lit currentBomOverrides (type-agnostique).
// BD maitre : retourne {pn, desc} (description LONGUE) depuis _bom_labels, ou null si absent.
function bomDescInfo(type, code) {
    try {
        var labels = machinesData[type]._bom_labels;
        for (var k in labels) {
            if (k.split(' ')[0] === code) {
                return { pn: (labels[k] && labels[k].pn) || '', desc: (labels[k] && labels[k].desc) || '' };
            }
        }
    } catch (e) {}
    return null;
}
// Retourne le CODE PRODUIT (pn de _bom_labels, ex. 0009 -> 1500-0009) + le libelle sans le code BOM.
function bomLabelInfo(type, code) {
    try {
        var labels = machinesData[type]._bom_labels;
        for (var k in labels) {
            if (k.split(' ')[0] === code) {
                return { pn: (labels[k] && labels[k].pn) || code, label: k.replace(/^[0-9]+\s*/, '') || k };
            }
        }
    } catch (e) {}
    return { pn: code, label: code };
}
function aValiderItems() {
    var out = [], ov = currentBomOverrides, type = selectType ? selectType.value : '';
    if (!ov) return out;
    for (var code in ov) {
        if (code.charAt(0) === '_' || code === 'rows' || code === 'customRows' || code === 'undefined' || code === 'harnais') continue;
        if (String(ov[code]).toLowerCase() === 'v') { var info = bomLabelInfo(type, code); out.push({ code: info.pn, name: info.label }); }
    }
    // Fittings (_custom) : soumis a la regle d'option (c.opt) comme le reste du kit.
    if (Array.isArray(ov._custom)) ov._custom.forEach(function (c) {
        if (!customItemVisible(c, type)) return;
        if (String(c.status || '').toLowerCase() === 'v') out.push({ code: c.pn || c.code || '', name: customName(c) || c.code || 'Item custom' });
    });
    return out;
}
// Affiche/masque la tuile warning "a valider" (meme style que indicateur de charge)
function updateAValiderWarning() {
    var warn = document.getElementById('bom-avalider-warning');
    if (!warn) return;
    var items = aValiderItems();
    if (items.length) {
        var listEl = document.getElementById('bom-avalider-list');
        if (listEl) listEl.textContent = items.map(function (i) { return i.name + (i.code ? ' (' + i.code + ')' : ''); }).join('  ;  ');
        warn.style.display = 'flex';
    } else {
        warn.style.display = 'none';
    }
}

// Limiteur de portee sub-options logic (exclusive checkboxes — same as camera)
(function() {
    var limBox = document.getElementById('toggle-limiteur');
    if (!limBox) return;
    var cbs = limBox.querySelectorAll('input[name="limiteur-type"]');
    var status = limBox.querySelector('.toggle-status');

    var HEIGHT_IDS = ['lim-hauteur', 'lim-hauteur-ext'];
    cbs.forEach(function(cb) {
        cb.addEventListener('change', function() {
            if (this.checked) {
                var isVac = (selectType.value === 'Camion Vacuum');
                if (isVac) {
                    // Vacuum : les 2 hauteurs s'excluent entre elles; Rotation reste independante.
                    if (HEIGHT_IDS.indexOf(this.id) >= 0) {
                        cbs.forEach(function(other) {
                            if (other !== cb && HEIGHT_IDS.indexOf(other.id) >= 0) other.checked = false;
                        });
                    }
                } else {
                    // Autres types : choix exclusif unique.
                    cbs.forEach(function(other) { if (other !== cb) other.checked = false; });
                }
            }
            // Recalcule etat + libelle a partir de toutes les cases cochees (visibles).
            var checked = [].filter.call(cbs, function(c) { return c.checked; });
            if (checked.length) {
                limBox.classList.add('active');
                status.textContent = checked.map(function(c) { return c.value; }).join(' + ');
            } else if (selectType.value === 'Pompe a Beton' && limBox.classList.contains('active')) {
                // Pompe : le limiteur reste ON (base + sections) meme sans Hauteur/Rotation.
                // L'etat maitre est gere par le header ; on ne l'eteint pas ici.
                status.textContent = 'ON';
            } else {
                limBox.classList.remove('active');
                status.textContent = 'OFF';
            }
            updateSelectedSummary();
        });
    });
})();

// Balance : DEUX groupes exclusifs dans le meme bloc — le modele de balance
// (0010 installee / 0011 valise) et l'imprimante (0014 thermique / 0015
// carbone). Exclusif A L'INTERIEUR de chaque groupe, mais on peut prendre une
// balance ET une imprimante. Le bloc reste actif tant qu'une case est cochee.
(function() {
    var balBox = document.getElementById('toggle-balance');
    if (!balBox) return;
    var status = balBox.querySelector('.toggle-status');
    var toutes = balBox.querySelectorAll('input[name="balance-type"], input[name="balance-imp"]');

    function rafraichir() {
        var bal = balBox.querySelector('input[name="balance-type"]:checked');
        var imp = balBox.querySelector('input[name="balance-imp"]:checked');
        if (bal || imp) {
            balBox.classList.add('active');
            status.textContent = bal ? bal.value.toUpperCase() : imp.value.toUpperCase();
        } else {
            balBox.classList.remove('active');
            status.textContent = 'OFF';
        }
        updateSelectedSummary();
    }

    toutes.forEach(function(cb) {
        cb.addEventListener('change', function() {
            if (this.checked) {
                // exclusivite limitee au groupe de la case cochee
                balBox.querySelectorAll('input[name="' + this.name + '"]').forEach(function(o) {
                    if (o !== cb) o.checked = false;
                });
            }
            rafraichir();
        });
    });
})();

// Options secondaires de la nacelle : cases CUMULATIVES (contrairement a la
// camera et a la balance qui sont exclusives). Le client peut en prendre
// plusieurs, les montants s'additionnent. Le statut affiche le nombre choisi.
(function() {
    var nacBox = document.getElementById('toggle-nacelle-opts');
    if (!nacBox) return;
    var cbs = nacBox.querySelectorAll('input[name="nacelle-opt"]');
    var status = nacBox.querySelector('.toggle-status');
    cbs.forEach(function(cb) {
        cb.addEventListener('change', function() {
            var n = 0;
            cbs.forEach(function(c) { if (c.checked) n++; });
            if (n) {
                nacBox.classList.add('active');
                status.textContent = (n === 1) ? '1 OPTION' : (n + ' OPTIONS');
            } else {
                nacBox.classList.remove('active');
                status.textContent = 'OFF';
            }
            updateSelectedSummary();
        });
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

    // Laser only available when 2D is checked
    if (cbLaser) cbLaser.disabled = true;

    function updateCreusage() {
        // Laser requires 2D
        if (cb2d && cbLaser) {
            cbLaser.disabled = !cb2d.checked;
            if (!cb2d.checked && cbLaser.checked) {
                cbLaser.checked = false;
            }
        }
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

// Re-translate dynamic dropdown content on language change
window.addEventListener('langchange', function() {
    Array.from(selectType.options).forEach(function(opt) {
        if (opt.value) opt.textContent = (typeof i18n !== 'undefined') ? i18n.t('type.' + opt.value) : opt.value;
    });
    var sel_txt = (typeof i18n !== 'undefined') ? i18n.t('common.selectionnez') : '-- Selectionnez --';
    [selectFabricant, selectAnnee, selectModele].forEach(function(sel) {
        var first = sel.options[0];
        if (first && first.value === '') first.textContent = sel_txt;
    });
    // Si une machine est deja affichee, re-render le contenu genere en JS
    // (titre options, tableau de specs, resume/prix) dans la nouvelle langue.
    if (selectType.value && selectFabricant.value && selectAnnee.value && selectModele.value) {
        var _type = selectType.value, _fab = selectFabricant.value, _an = selectAnnee.value, _mod = selectModele.value;
        var titleEl = document.getElementById('options-title');
        if (titleEl) titleEl.textContent = i18n.t('soumission.options_for', { fab: _fab, modele: _mod, annee: _an });
        var descEl = document.getElementById('options-machine-desc');
        if (descEl) descEl.textContent = i18n.t('soumission.options_desc');
        var infoEl = document.getElementById('soumission-machine-info');
        if (infoEl) infoEl.textContent = 'Machine : ' + _fab + ' ' + _mod + ' (' + _an + ') — ' + i18n.t('type.' + _type);
        try { renderSpecsTable(_type, _fab, _an, _mod); } catch (e) {}
        try { updateSelectedSummary(); } catch (e) {}
    }
});
    if (cbLaser) cbLaser.addEventListener('change', updateCreusage);
})();