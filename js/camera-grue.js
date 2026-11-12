// Caméra de grue — choix en cascade (Steve, 2026-11-11). APERÇU : la case « Grue » de
// l'équipement (mode « Sans machine ») n'est visible que pour APERCU_COMPTES (soumission.js).
//
//   1. 1300-0225 Caméra de grue ............ toujours incluse
//   2. Moniteur : 7 po 1300-0100 OU 10 po 1300-0101
//   3. Pédale de contrôle du zoom 1300-0230 : oui / non
//   4. Batterie mobile 1300-0240 : quantité (recommandé 2)
//   5. Chargeur 1300-0141 : quantité (recommandé 1)
//
// Chaque étape apparaît quand la précédente est répondue. Les prix (liste de prix privée,
// getprices) sont affichés à côté de chaque choix, AVANT de choisir, pour aider la décision.
// Un code sans prix dans la liste affiche « Prix à venir » et retient le total (prixAValider).
// La grue remplace Recul / Recul + capteur / Quad / 360 : ces cases sont exclusives avec elle.
(function () {
    var boite = document.getElementById('cam-grue');
    var caseGrue = document.getElementById('cam-equip-grue');
    if (!boite || !caseGrue) return;
    var $ = function (id) { return document.getElementById(id); };
    var camBox = $('toggle-camera');
    var t = function (k, fb, p) {
        var v = (typeof i18n !== 'undefined') ? i18n.t(k, p) : k;
        if (!v || v === k) { v = fb; if (p) Object.keys(p).forEach(function (n) { v = v.split('{' + n + '}').join(p[n]); }); }
        return v;
    };

    var CODES = ['1300-0225', '1300-0100', '1300-0101', '1300-0230', '1300-0240', '1300-0141'];
    window.GRUE_CODES = CODES;

    function actif() { return !!caseGrue.checked && boite.style.display !== 'none'; }
    function moniteur() { var r = document.querySelector('input[name="grue-moniteur"]:checked'); return r ? r.value : ''; }
    function pedale() { var r = document.querySelector('input[name="grue-pedale"]:checked'); return r ? r.value : ''; }
    // Quantité saisie : '' = pas encore répondu ; sinon entier >= 0.
    function qte(id) {
        var s = String(($(id) || {}).value || '').trim();
        if (s === '') return '';
        var n = parseInt(s, 10);
        return (isFinite(n) && n >= 0) ? n : '';
    }

    function majPrix() {
        var cache = (typeof sansAccesPrix === 'function') && sansAccesPrix();
        boite.querySelectorAll('.grue-prix').forEach(function (el) {
            el.classList.remove('grue-a-venir');
            if (cache) { el.textContent = ''; return; }
            var p = (typeof priceFor === 'function') ? priceFor(el.getAttribute('data-code')) : {};
            if (typeof p.item === 'number') {
                el.textContent = fmtPrice(p.item) + (el.getAttribute('data-unite') ? ' ' + t('grue.par_unite', '/ unité') : '');
            } else {
                el.textContent = t('grue.prix_a_venir', 'Prix à venir');
                el.classList.add('grue-a-venir');
            }
        });
    }

    // Étapes en cascade : la suivante apparaît quand la précédente est répondue.
    function majEtapes() {
        var e3 = !!moniteur(), e4 = e3 && !!pedale(), e5 = e4 && qte('grue-batterie') !== '';
        $('grue-etape-3').style.display = e3 ? '' : 'none';
        $('grue-etape-4').style.display = e4 ? '' : 'none';
        $('grue-etape-5').style.display = e5 ? '' : 'none';
        var msg = '';
        if (!moniteur()) msg = t('grue.choisir_moniteur', 'Choisissez le moniteur.');
        else if (!pedale()) msg = t('grue.choisir_pedale', 'Pédale de zoom : oui ou non ?');
        else if (qte('grue-batterie') === '') msg = t('grue.choisir_batterie', 'Entrez la quantité de batteries.');
        else if (qte('grue-chargeur') === '') msg = t('grue.choisir_chargeur', 'Entrez la quantité de chargeurs.');
        $('grue-msg').textContent = msg;
        if (!msg) boite.classList.remove('manquant');
    }

    // Statut et état actif de la tuile Caméra.
    function majBloc() {
        if (!camBox) return;
        var st = camBox.querySelector('.toggle-status');
        if (caseGrue.checked) {
            camBox.classList.add('active');
            if (st) st.textContent = t('grue.statut', 'GRUE');
        } else if (!camBox.querySelector('input[name="camera-type"]:checked') && !($('cam-360-choix') || {}).checked) {
            camBox.classList.remove('active');
            if (st) st.textContent = 'OFF';
        }
    }

    function majVisibilite() {
        var vis = !!caseGrue.checked;   // la case n'existe que sur une grue mobile (aperçu)
        boite.style.display = vis ? '' : 'none';
        // La quantité générale ne s'applique pas à la grue : chaque ligne a la sienne.
        var qb = $('cam-qte-box');
        if (qb && typeof estSansMachine === 'function' && estSansMachine()) qb.style.display = vis ? 'none' : '';
        majPrix();
        majEtapes();
        majBloc();
    }

    function viderChoix() {
        boite.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = false; });
        ['grue-batterie', 'grue-chargeur'].forEach(function (id) { if ($(id)) $(id).value = ''; });
        boite.classList.remove('manquant');
    }

    function redessiner() {
        majVisibilite();
        try { if (typeof updateSelectedSummary === 'function') updateSelectedSummary(); } catch (e) {}
    }

    caseGrue.addEventListener('change', function () {
        if (caseGrue.checked) {
            // Exclusive avec Recul, Recul + capteur, Quad et 360.
            document.querySelectorAll('input[name="camera-type"]').forEach(function (cb) { if (cb.checked) cb.click(); });
            var c360 = $('cam-360-choix');
            if (c360 && c360.checked) c360.click();
        } else {
            viderChoix();
        }
        redessiner();
    });
    // Chariot élévateur coché : la case Grue se décoche (soumission.js) sans événement.
    var caseChariot = $('cam-equip-chariot');
    if (caseChariot) caseChariot.addEventListener('change', function () {
        if (!caseGrue.checked) { viderChoix(); redessiner(); }
    });
    // Une autre caméra cochée : la grue se décoche.
    document.querySelectorAll('input[name="camera-type"], #cam-360-choix').forEach(function (cb) {
        cb.addEventListener('change', function () {
            if (cb.checked && caseGrue.checked) { caseGrue.checked = false; viderChoix(); redessiner(); }
        });
    });
    boite.querySelectorAll('input[type="radio"]').forEach(function (r) { r.addEventListener('change', redessiner); });
    ['grue-batterie', 'grue-chargeur'].forEach(function (id) {
        $(id).addEventListener('input', redessiner);
        $(id).addEventListener('change', redessiner);
    });
    document.addEventListener('langchange', majVisibilite);

    // ---------------- API pour soumission.js ----------------
    window.grueMaj = majVisibilite;
    window.grueMajPrix = majPrix;
    window.grueActive = actif;
    window.grueVider = function () { viderChoix(); majVisibilite(); };
    // Lignes de la soumission (code + libellé, quantité en suffixe « ×N » lue par lineQty).
    window.grueLignes = function () {
        if (!actif()) return [];
        var out = [{ code: '1300-0225', desc: 'Caméra de grue' }];
        var m = moniteur();
        if (m === '1300-0100') out.push({ code: m, desc: 'Moniteur 7 po' });
        if (m === '1300-0101') out.push({ code: m, desc: 'Moniteur 10 po' });
        if (pedale() === 'oui') out.push({ code: '1300-0230', desc: 'Pédale de contrôle du zoom' });
        var b = qte('grue-batterie'), c = qte('grue-chargeur');
        if (b) out.push({ code: '1300-0240', desc: 'Batterie mobile' + (b > 1 ? ' ×' + b : '') });
        if (c) out.push({ code: '1300-0141', desc: 'Chargeur' + (c > 1 ? ' ×' + c : '') });
        return out;
    };
    // Envoi / ajout au panier : un choix manquant bloque, comme le kit 360.
    window.grueManquant = function () {
        if (!actif()) return false;
        if (moniteur() && pedale() && qte('grue-batterie') !== '' && qte('grue-chargeur') !== '') return false;
        majEtapes();
        boite.classList.add('manquant');
        boite.scrollIntoView({ block: 'center' });
        return true;
    };
    // Panier : les quantités ne sont pas des cases cochées, etatEcran les garde à part.
    window.grueEtat = function () {
        return { batterie: ($('grue-batterie') || {}).value || '', chargeur: ($('grue-chargeur') || {}).value || '' };
    };
    window.grueRestaurer = function (e) {
        if (!e) return;
        if ($('grue-batterie')) $('grue-batterie').value = e.batterie || '';
        if ($('grue-chargeur')) $('grue-chargeur').value = e.chargeur || '';
        majVisibilite();
    };

    majVisibilite();
})();
