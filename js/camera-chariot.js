// Caméra de chariot élévateur (lift) — choix en cascade (Steve, 2026-11-12). APERÇU : la case
// « Chariot élévateur » de l'équipement (mode « Sans machine ») n'est visible que pour
// APERCU_COMPTES (soumission.js). Même patron que js/camera-grue.js.
//
//   1. Caméra au niveau des fourches : sur la fourche 1300-0126 OU sur le rack entre les
//      fourches 1300-0127 OU aucune
//   2. Caméra sur la cabine : avant 1300-0125 et/ou arrière 1300-0125 (même caméra) OU aucune
//   3. Moniteur : 7 po 1300-0100 OU 10 po 1300-0101
//   4. Batteries : 10 h 1300-0140 et/ou 30 h 1300-0240 ; recommandé = 2 par caméra
//      (1 en service + 1 de rechange)
//   5. Chargeur 1300-0141 : recommandé = 1 par caméra
//   Option aimants (Steve, 2026-11-12) : caméra entre les fourches et caméras de cabine.
//   Chaque caméra avec l'option ajoute 2 aimants AT0001 et 2 écrous nylon 93625A250.
//
// Chaque étape apparaît quand la précédente est répondue. Les prix sont affichés à côté de
// chaque choix, avant de choisir. Un code sans prix affiche « Prix à venir » et retient le
// total (prixAValider). Au moins une caméra (fourches ou cabine) est exigée.
(function () {
    var boite = document.getElementById('cam-chariot');
    var caseCh = document.getElementById('cam-equip-chariot');
    if (!boite || !caseCh) return;
    var $ = function (id) { return document.getElementById(id); };
    var camBox = $('toggle-camera');
    var t = function (k, fb, p) {
        var v = (typeof i18n !== 'undefined') ? i18n.t(k, p) : k;
        if (!v || v === k) { v = fb; if (p) Object.keys(p).forEach(function (n) { v = v.split('{' + n + '}').join(p[n]); }); }
        return v;
    };

    var CODES = ['1300-0126', '1300-0127', '1300-0125', '1300-0100', '1300-0101', '1300-0140', '1300-0240', '1300-0141', 'AT0001', '93625A250'];
    window.CHARIOT_CODES = CODES;

    function actif() { return !!caseCh.checked && boite.style.display !== 'none'; }
    function radio(n) { var r = document.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ''; }
    function fourche() { return radio('ch-fourche'); }               // '1300-0126' | '1300-0127' | 'aucune' | ''
    function moniteur() { return radio('ch-moniteur'); }
    function cabAvant() { return !!($('ch-cab-avant') || {}).checked; }
    function cabArriere() { return !!($('ch-cab-arriere') || {}).checked; }
    function cabAucune() { return !!($('ch-cab-aucune') || {}).checked; }
    function cabRepondu() { return cabAvant() || cabArriere() || cabAucune(); }
    function nbCameras() {
        return ((fourche() === '1300-0126' || fourche() === '1300-0127') ? 1 : 0) + (cabAvant() ? 1 : 0) + (cabArriere() ? 1 : 0);
    }
    // Quantité saisie : '' = pas encore répondu ; sinon entier >= 0.
    function qte(id) {
        var s = String(($(id) || {}).value || '').trim();
        if (s === '') return '';
        var n = parseInt(s, 10);
        return (isFinite(n) && n >= 0) ? n : '';
    }
    // Option aimants, visible seulement quand sa caméra est choisie.
    var AIMANTS = [['ch-aim-rack', function () { return fourche() === '1300-0127'; }],
                   ['ch-aim-arriere', cabArriere], ['ch-aim-avant', cabAvant]];
    function majAimants() {
        AIMANTS.forEach(function (a) {
            var on = a[1](), lab = $(a[0] + '-lab');
            if (lab) lab.style.display = on ? '' : 'none';
            if (!on && $(a[0])) $(a[0]).checked = false;
        });
    }
    function nbAimantes() { return AIMANTS.filter(function (a) { return a[1]() && ($(a[0]) || {}).checked; }).length; }
    function battRepondu() { return qte('ch-batt-10') !== '' || qte('ch-batt-30') !== ''; }

    function majPrix() {
        var cache = (typeof sansAccesPrix === 'function') && sansAccesPrix();
        boite.querySelectorAll('.grue-prix').forEach(function (el) {
            el.classList.remove('grue-a-venir');
            if (cache) { el.textContent = ''; return; }
            var p = (typeof priceFor === 'function') ? priceFor(el.getAttribute('data-code')) : {};
            if (el.getAttribute('data-aimants')) {
                // Option aimants : 2 aimants AT0001 + 2 écrous 93625A250 par caméra (Steve, 2026-11-12).
                var e = (typeof priceFor === 'function') ? priceFor('93625A250') : {};
                if (typeof p.item === 'number' && typeof e.item === 'number') {
                    el.textContent = fmtPrice(2 * p.item + 2 * e.item) + ' ' + t('chariot.par_camera', '/ caméra');
                    return;
                }
                p = {};
            }
            if (typeof p.item === 'number') {
                el.textContent = fmtPrice(p.item) + (el.getAttribute('data-unite') ? ' ' + t('grue.par_unite', '/ unité') : '');
            } else {
                el.textContent = t('grue.prix_a_venir', 'Prix à venir');
                el.classList.add('grue-a-venir');
            }
        });
    }

    function majRecos() {
        var n = nbCameras();
        $('ch-reco-batt').textContent = t('chariot.reco_batt', 'Qté recommandée : {n} au total (1 par caméra + 1 de rechange par caméra)', { n: 2 * n });
        $('ch-reco-charg').textContent = t('chariot.reco_charg', 'Qté recommandée : {n} (1 par caméra)', { n: n });
    }

    // Étapes en cascade : la suivante apparaît quand la précédente est répondue.
    function majEtapes() {
        majAimants();
        var e2 = !!fourche(), e3 = e2 && cabRepondu(), e4 = e3 && !!moniteur(), e5 = e4 && battRepondu();
        $('ch-etape-2').style.display = e2 ? '' : 'none';
        $('ch-etape-3').style.display = e3 ? '' : 'none';
        $('ch-etape-4').style.display = e4 ? '' : 'none';
        $('ch-etape-5').style.display = e5 ? '' : 'none';
        majRecos();
        var msg = '';
        if (!fourche()) msg = t('chariot.choisir_fourche', 'Caméra au niveau des fourches : faites un choix.');
        else if (!cabRepondu()) msg = t('chariot.choisir_cabine', 'Caméra sur la cabine : faites un choix.');
        else if (nbCameras() === 0) msg = t('chariot.aucune_camera', 'Choisissez au moins une caméra (fourches ou cabine).');
        else if (!moniteur()) msg = t('grue.choisir_moniteur', 'Choisissez le moniteur.');
        else if (!battRepondu()) msg = t('chariot.choisir_batt', 'Entrez la quantité de batteries.');
        else if (qte('ch-chargeur') === '') msg = t('grue.choisir_chargeur', 'Entrez la quantité de chargeurs.');
        $('ch-msg').textContent = msg;
        if (!msg) boite.classList.remove('manquant');
    }

    // Statut et état actif de la tuile Caméra.
    function majBloc() {
        if (!camBox) return;
        var st = camBox.querySelector('.toggle-status');
        if (caseCh.checked) {
            camBox.classList.add('active');
            if (st) st.textContent = t('chariot.statut', 'CHARIOT');
        } else if (!camBox.querySelector('input[name="camera-type"]:checked') && !($('cam-360-choix') || {}).checked
                   && !(($('cam-equip-grue') || {}).checked)) {
            camBox.classList.remove('active');
            if (st) st.textContent = 'OFF';
        }
    }

    function majVisibilite() {
        var vis = !!caseCh.checked && ($('cam-equip') || {}).style.display !== 'none';
        boite.style.display = vis ? '' : 'none';
        // La quantité générale ne s'applique pas : chaque ligne a la sienne.
        var qb = $('cam-qte-box');
        var autre = ($('cam-equip-grue') || {}).checked;
        if (qb && typeof estSansMachine === 'function' && estSansMachine() && !autre) qb.style.display = vis ? 'none' : '';
        majPrix();
        majEtapes();
        majBloc();
    }

    function viderChoix() {
        boite.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(function (r) { r.checked = false; });
        ['ch-batt-10', 'ch-batt-30', 'ch-chargeur'].forEach(function (id) { if ($(id)) $(id).value = ''; });
        boite.classList.remove('manquant');
    }

    function redessiner() {
        majVisibilite();
        try { if (typeof updateSelectedSummary === 'function') updateSelectedSummary(); } catch (e) {}
    }

    caseCh.addEventListener('change', function () {
        if (caseCh.checked) {
            // Exclusive avec Recul, Recul + capteur, Quad et 360.
            document.querySelectorAll('input[name="camera-type"]').forEach(function (cb) { if (cb.checked) cb.click(); });
            var c360 = $('cam-360-choix');
            if (c360 && c360.checked) c360.click();
        } else {
            viderChoix();
        }
        redessiner();
    });
    // Grue cochée : la case Chariot se décoche (soumission.js) sans événement.
    var caseGrue = $('cam-equip-grue');
    if (caseGrue) caseGrue.addEventListener('change', function () {
        if (!caseCh.checked) { viderChoix(); redessiner(); }
    });
    // Une autre caméra cochée : le chariot se décoche.
    document.querySelectorAll('input[name="camera-type"], #cam-360-choix').forEach(function (cb) {
        cb.addEventListener('change', function () {
            if (cb.checked && caseCh.checked) { caseCh.checked = false; viderChoix(); redessiner(); }
        });
    });
    // Cabine : « Aucune » exclut Avant / Arrière, et l'inverse.
    var aucune = $('ch-cab-aucune');
    ['ch-cab-avant', 'ch-cab-arriere'].forEach(function (id) {
        $(id).addEventListener('change', function () { if (this.checked && aucune) aucune.checked = false; });
    });
    if (aucune) aucune.addEventListener('change', function () {
        if (this.checked) ['ch-cab-avant', 'ch-cab-arriere'].forEach(function (id) { $(id).checked = false; });
    });
    boite.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(function (r) { r.addEventListener('change', redessiner); });
    ['ch-batt-10', 'ch-batt-30', 'ch-chargeur'].forEach(function (id) {
        $(id).addEventListener('input', redessiner);
        $(id).addEventListener('change', redessiner);
    });
    document.addEventListener('langchange', majVisibilite);

    // ---------------- API pour soumission.js ----------------
    window.chariotMaj = majVisibilite;
    window.chariotMajPrix = majPrix;
    window.chariotActive = actif;
    window.chariotVider = function () { viderChoix(); majVisibilite(); };
    // Lignes de la soumission (code + libellé, quantité en suffixe « ×N » lue par lineQty).
    window.chariotLignes = function () {
        if (!actif()) return [];
        var out = [], x = function (n) { return n > 1 ? ' ×' + n : ''; };
        if (fourche() === '1300-0126') out.push({ code: '1300-0126', desc: 'Caméra sur la fourche' });
        if (fourche() === '1300-0127') out.push({ code: '1300-0127', desc: 'Caméra sur le rack entre les fourches' });
        var nCab = (cabAvant() ? 1 : 0) + (cabArriere() ? 1 : 0);
        if (nCab) out.push({ code: '1300-0125', desc: 'Caméra sur la cabine (' +
            [cabArriere() ? 'arrière' : '', cabAvant() ? 'avant' : ''].filter(Boolean).join(' + ') + ')' + x(nCab) });
        var nA = nbAimantes();
        if (nA) {
            out.push({ code: 'AT0001', desc: 'Aimants (2 par caméra)' + x(2 * nA) });
            out.push({ code: '93625A250', desc: 'Écrous nylon M6 (2 par caméra)' + x(2 * nA) });
        }
        var m = moniteur();
        if (m === '1300-0100') out.push({ code: m, desc: 'Moniteur 7 po' });
        if (m === '1300-0101') out.push({ code: m, desc: 'Moniteur 10 po' });
        var b10 = qte('ch-batt-10'), b30 = qte('ch-batt-30'), c = qte('ch-chargeur');
        if (b10) out.push({ code: '1300-0140', desc: 'Batterie mobile 10 h' + x(b10) });
        if (b30) out.push({ code: '1300-0240', desc: 'Batterie mobile 30 h' + x(b30) });
        if (c) out.push({ code: '1300-0141', desc: 'Chargeur' + x(c) });
        return out;
    };
    // Envoi / ajout au panier : un choix manquant bloque, comme la grue et le kit 360.
    window.chariotManquant = function () {
        if (!actif()) return false;
        if (fourche() && cabRepondu() && nbCameras() > 0 && moniteur() && battRepondu() && qte('ch-chargeur') !== '') return false;
        majEtapes();
        boite.classList.add('manquant');
        boite.scrollIntoView({ block: 'center' });
        return true;
    };
    // Panier : les quantités ne sont pas des cases cochées, etatEcran les garde à part.
    window.chariotEtat = function () {
        return { b10: ($('ch-batt-10') || {}).value || '', b30: ($('ch-batt-30') || {}).value || '', ch: ($('ch-chargeur') || {}).value || '' };
    };
    window.chariotRestaurer = function (e) {
        if (!e) return;
        if ($('ch-batt-10')) $('ch-batt-10').value = e.b10 || '';
        if ($('ch-batt-30')) $('ch-batt-30').value = e.b30 || '';
        if ($('ch-chargeur')) $('ch-chargeur').value = e.ch || '';
        majVisibilite();
    };

    majVisibilite();
})();
