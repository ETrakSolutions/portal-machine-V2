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
        } else {
            html += `<tr><td>${key}</td><td>${value}</td></tr>`;
        }
    }
    html += '</table>';
    resultsTableContainer.innerHTML = html;

    resultsSection.style.display = 'block';
    emptyState.style.display = 'none';
}

function hideResults() {
    resultsSection.style.display = 'none';
    emptyState.style.display = 'block';
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
