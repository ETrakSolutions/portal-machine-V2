// Verification « cette machine existe-t-elle deja ? » avant toute demande d'ajout
// (Steve, 2026-10-08). Le 8 octobre, deux demandes visaient des machines deja dans la base :
// « DX140lcr-7 » (base : DX140LCR-7) et « TB350CR ». On compare les noms sans casse, espaces
// ni tirets, en depliant les variantes « DX140LC-5 / -7 », et on propose les modeles proches.
// Utilise par machine.html (js/app.js), soumission.html (js/soumission.js) et
// machine-requests.html (js/machine-requests.js).
(function () {
    'use strict';

    function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

    // « DX140LC-5 / -7 » -> dx140lc5 et dx140lc7 (plus le nom complet).
    function cles(nom) {
        var parts = String(nom).split('/').map(function (p) { return p.trim(); }).filter(Boolean);
        var out = [norm(nom)];
        if (parts.length) {
            var base = parts[0];
            out.push(norm(base));
            parts.slice(1).forEach(function (p) {
                if (p.charAt(0) === '-') {
                    var i = base.lastIndexOf('-');
                    out.push(norm((i > 0 ? base.slice(0, i) : base) + p));
                } else {
                    out.push(norm(p));
                }
            });
        }
        return out.filter(function (k, i) { return k && out.indexOf(k) === i; });
    }

    function distance(a, b) {
        var d = [], i, j;
        for (i = 0; i <= a.length; i++) d[i] = [i];
        for (j = 0; j <= b.length; j++) d[0][j] = j;
        for (i = 1; i <= a.length; i++) {
            for (j = 1; j <= b.length; j++) {
                d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
            }
        }
        return d[a.length][b.length];
    }

    // Meme nom (exact) ou nom proche : prefixe commun (TB350C / TB350CR) ou un seul caractere
    // de difference (DX140LRC-7 / DX140LCR-7, mais aussi PC210 / PC220). Ce n'est qu'une
    // proposition : la personne peut toujours continuer sa demande.
    function proche(t, k) {
        if (t === k) return 2;
        if (t.length < 4 || k.length < 4) return 0;
        if ((k.indexOf(t) === 0 || t.indexOf(k) === 0) && Math.abs(k.length - t.length) <= 3) return 1;
        if (t.length >= 5 && distance(t, k) === 1) return 1;
        return 0;
    }

    // -> { exact: {annee, modele} | null, semblables: [{modele, annees:[...], memeNom}] }
    // exact = meme nom, meme annee. semblables = meme nom d'autres annees, ou noms proches.
    function chercher(data, type, fab, modele, annee) {
        var res = { exact: null, semblables: [] };
        var t = norm(modele);
        var parFab = data && data[type] && data[type][fab];
        if (!t || !parFab) return res;
        var vus = {};
        Object.keys(parFab).filter(function (y) { return y.charAt(0) !== '_'; }).forEach(function (y) {
            var mods = parFab[y] || {};
            Object.keys(mods).filter(function (m) { return m.charAt(0) !== '_'; }).forEach(function (m) {
                var score = Math.max.apply(null, cles(m).map(function (k) { return proche(t, k); }));
                if (!score) return;
                if (score === 2 && String(y) === String(annee) && !res.exact) res.exact = { annee: y, modele: m };
                if (!vus[m]) { vus[m] = { modele: m, annees: [], memeNom: false }; res.semblables.push(vus[m]); }
                vus[m].annees.push(y);
                if (score === 2) vus[m].memeNom = true;
            });
        });
        res.semblables.forEach(function (s) { s.annees.sort(); });
        res.semblables.sort(function (a, b) {
            return (b.memeNom - a.memeNom) || a.modele.localeCompare(b.modele, undefined, { numeric: true });
        });
        res.semblables = res.semblables.slice(0, 6);
        return res;
    }

    function annees(liste) {
        if (liste.length <= 2) return liste.join(', ');
        return liste[0] + '–' + liste[liste.length - 1];
    }

    // Avant de demander l'ajout : si la machine (ou une machine proche) est deja dans la base,
    // la fenetre `modal` le dit et propose de l'ouvrir. o = { data, type, fab, modele, annee,
    // modal, onChoisir(annee, modele), onContinuer(), onAnnuler() }.
    function verifierAvantDemande(o) {
        var r = chercher(o.data, o.type, o.fab, o.modele, o.annee);
        if (!r.exact && !r.semblables.length) { o.onContinuer(); return; }
        var t = function (k, fb, p) {
            var v = (typeof i18n !== 'undefined') ? i18n.t(k, p) : k;
            if (!v || v === k) {
                v = fb;
                if (p) Object.keys(p).forEach(function (n) { v = v.split('{' + n + '}').join(p[n]); });
            }
            return v;
        };
        var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        var boite = o.modal.querySelector('.custom-modal') || o.modal;
        var html = '';
        if (r.exact) {
            html = '<h3>' + esc(t('mm.exists_title', 'Cette machine est déjà dans la base')) + '</h3>' +
                '<p class="modal-desc">' + esc(o.fab) + ' <strong>' + esc(r.exact.modele) + '</strong> (' + esc(r.exact.annee) + ')</p>' +
                '<p class="modal-desc">' + esc(t('mm.exists_desc', 'Vous avez tapé « {saisi} ». Ouvrez la fiche existante : aucune demande d\'ajout n\'est nécessaire.', { saisi: o.modele })) + '</p>' +
                '<div class="modal-buttons">' +
                '<button type="button" class="modal-btn modal-btn-cancel" data-mm="annuler">' + esc(t('common.annuler', 'Annuler')) + '</button>' +
                '<button type="button" class="modal-btn modal-btn-create" data-mm="choisir" data-annee="' + esc(r.exact.annee) + '" data-modele="' + esc(r.exact.modele) + '">' + esc(t('mm.open', 'Ouvrir cette machine')) + '</button>' +
                '</div>';
        } else {
            html = '<h3>' + esc(t('mm.similar_title', 'Machines semblables déjà dans la base')) + '</h3>' +
                '<p class="modal-desc">' + esc(t('mm.similar_desc', 'Vous avez tapé « {saisi} » ({annee}). Est-ce l\'une de celles-ci ?', { saisi: o.modele, annee: o.annee })) + '</p>' +
                '<div class="mm-liste" style="display:flex;flex-direction:column;gap:0.4rem;margin:0.6rem 0">';
            r.semblables.forEach(function (s) {
                var y = s.annees.indexOf(String(o.annee)) >= 0 ? String(o.annee) : s.annees[s.annees.length - 1];
                html += '<button type="button" class="modal-btn" style="text-align:left" data-mm="choisir" data-annee="' + esc(y) + '" data-modele="' + esc(s.modele) + '">' +
                    esc(o.fab) + ' <strong>' + esc(s.modele) + '</strong> — ' + esc(annees(s.annees)) + '</button>';
            });
            html += '</div><div class="modal-buttons">' +
                '<button type="button" class="modal-btn modal-btn-cancel" data-mm="annuler">' + esc(t('common.annuler', 'Annuler')) + '</button>' +
                '<button type="button" class="modal-btn modal-btn-create" data-mm="continuer">' + esc(t('mm.none_continue', 'Aucune de celles-ci, continuer')) + '</button>' +
                '</div>';
        }
        boite.innerHTML = html;
        boite.querySelectorAll('[data-mm]').forEach(function (b) {
            b.addEventListener('click', function () {
                var a = b.getAttribute('data-mm');
                if (a === 'choisir') o.onChoisir(b.getAttribute('data-annee'), b.getAttribute('data-modele'));
                else if (a === 'continuer') o.onContinuer();
                else o.onAnnuler();
            });
        });
        var premier = boite.querySelector('[data-mm="choisir"]');
        if (premier) premier.focus();
    }

    window.machineMatch = { norm: norm, cles: cles, chercher: chercher, verifierAvantDemande: verifierAvantDemande };
})();
