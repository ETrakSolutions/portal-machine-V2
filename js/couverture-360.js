// Couverture 360 : 4 ou 6 cameras ? (Steve, 2026-10-14)
// Regle tiree de la fiche du fournisseur « Panoramic Calibration Camera Installation
// Instructions (Charte) » : une camera de cote doit voir la charte de calibration jusqu'au
// coin le plus eloigne de son cote de la machine. Sa portee depend de sa hauteur H et de
// la taille L du carre noir de la charte (tableaux du document, en multiples de L) :
//     H/L = 1 -> 4,12/0,78 L   2 -> 5,7/0,78 L   3 -> 7,4/0,78 L   4 -> 8,4/0,78 L
// (grande charte L = 1,35 m : 7,13 / 9,87 / 12,8 / 14,5 m). Entre deux points : interpolation
// lineaire. Hauteur minimale du document : H = 0,5/0,78 x L (0,87 m grande charte, 0,5 m
// petite). Entre ce minimum et H = L, le tableau ne donne pas de portee : on le dit, sans
// inventer. Au-dela de H/L = 4 : on garde la portee a 4 L (prudent, rien d'invente).
// Comme dans l'exemple du document, on ajoute 1 m de marge a la distance du coin le plus loin.
// Si cette distance depasse la portee : une camera par cote ne suffit pas -> 6 cameras.
(function () {
    'use strict';
    var RAPPORTS = [1, 2, 3, 4];
    var PORTEES = [4.12 / 0.78, 5.7 / 0.78, 7.4 / 0.78, 8.4 / 0.78];   // en multiples de L
    var CHARTES = { grande: 1.35, petite: 0.78 };
    var MARGE = 1;          // m
    var PIED = 0.3048;      // m

    function porteeEnL(r) {
        if (r <= RAPPORTS[0]) return PORTEES[0];
        for (var i = 1; i < RAPPORTS.length; i++) {
            if (r <= RAPPORTS[i]) {
                var t = (r - RAPPORTS[i - 1]) / (RAPPORTS[i] - RAPPORTS[i - 1]);
                return PORTEES[i - 1] + t * (PORTEES[i] - PORTEES[i - 1]);
            }
        }
        return PORTEES[PORTEES.length - 1];
    }

    // h, dAvant, dArriere en metres ; charte 'grande' | 'petite'.
    // -> { ok, raison?, cameras: 4|6, portee, distance, hMin, auDela }
    function calculer(h, dAvant, dArriere, charte) {
        var L = CHARTES[charte] || CHARTES.grande;
        if (!(h > 0) || !(dAvant >= 0) || !(dArriere >= 0)) return { ok: false, raison: 'incomplet' };
        var hMin = 0.5 / 0.78 * L;          // hauteur minimale du document
        var r = h / L;
        var distance = Math.max(dAvant, dArriere) + MARGE;
        if (h < hMin - 1e-9) return { ok: true, tropBas: true, hMin: hMin, L: L, distance: distance };
        if (r < 1) return { ok: true, horsTableau: true, hMin: hMin, L: L, distance: distance, porteeMin: L * PORTEES[0] };
        var portee = L * porteeEnL(r);
        return { ok: true, auDela: r > 4, portee: portee, distance: distance, cameras: distance <= portee ? 4 : 6, L: L };
    }

    window.couverture360 = { calculer: calculer, porteeEnL: porteeEnL };

    // INTERRUPTEUR : false = calculateur desactive (cache, aucune ligne dans le courriel),
    // sans rien retirer d'autre. Pour reculer completement : git revert du commit
    // « Soumission : calculateur Couverture 360 » (repere git avant-couverture-360).
    var ACTIF = true;

    // ---------------- interface (page Soumission) ----------------
    var boite = document.getElementById('cam-calc');
    if (!boite || !ACTIF) return;
    var $ = function (id) { return document.getElementById(id); };
    var t = function (k, fb, p) {
        var v = (typeof i18n !== 'undefined') ? i18n.t(k, p) : k;
        if (!v || v === k) { v = fb; if (p) Object.keys(p).forEach(function (n) { v = v.split('{' + n + '}').join(p[n]); }); }
        return v;
    };
    var nb = function (x) {   // 10,5 en francais, 10.5 en anglais
        var v = (Math.round(x * 10) / 10).toFixed(1);
        var en = typeof i18n !== 'undefined' && i18n.getLang && i18n.getLang() === 'en';
        return en ? v : v.replace('.', ',');
    };
    var dernier = null;

    function enMetres(v) {
        var x = parseFloat(String(v || '').replace(',', '.'));
        if (isNaN(x)) return NaN;
        return $('cam-calc-unite').value === 'pi' ? x * PIED : x;
    }
    function avecPieds(m) {   // « 10,5 m » ou « 10,5 m (34,4 pi) »
        return nb(m) + ' m' + ($('cam-calc-unite').value === 'pi' ? ' (' + nb(m / PIED) + ' pi)' : '');
    }
    function cam360Coche() {
        var a = $('cam-360'), b = $('cam-360-6');
        return (a && a.checked) || (b && b.checked);
    }

    function majVisibilite() { boite.style.display = cam360Coche() ? '' : 'none'; majResultat(); }

    function majResultat() {
        var res = $('cam-calc-res'), btn = $('cam-calc-choisir');
        dernier = null;
        var c = calculer(enMetres($('cam-calc-h').value), enMetres($('cam-calc-av').value),
                         enMetres($('cam-calc-ar').value), $('cam-calc-charte').value);
        btn.style.display = 'none';
        if (!c.ok) { res.className = 'cam-calc-res'; res.textContent = t('cam360.saisir', 'Entrez la hauteur de la caméra de côté et ses distances aux coins avant et arrière.'); return; }
        if (c.tropBas) {
            res.className = 'cam-calc-res cam-calc-alerte';
            res.textContent = t('cam360.trop_bas', 'Caméra trop basse pour cette charte : hauteur minimale {h}.', { h: avecPieds(c.hMin) });
            return;
        }
        if (c.horsTableau) {
            res.className = 'cam-calc-res cam-calc-alerte';
            res.textContent = t('cam360.hors_tableau', 'Hauteur sous le tableau du fournisseur (portée connue à partir de {h}) : à valider avec le fournisseur.', { h: avecPieds(c.L) });
            return;
        }
        dernier = c;
        var bon = c.cameras === 4 ? 'cam-360' : 'cam-360-6';
        res.className = 'cam-calc-res ' + (c.cameras === 4 ? 'cam-calc-ok' : 'cam-calc-6');
        res.textContent = t(c.cameras === 4 ? 'cam360.res_4' : 'cam360.res_6',
            c.cameras === 4 ? '4 caméras suffisent : coin le plus loin {d} (avec 1 m de marge), portée {p}.'
                            : '6 caméras recommandées : coin le plus loin {d} (avec 1 m de marge), portée {p} seulement.',
            { d: avecPieds(c.distance), p: avecPieds(c.portee) })
            + (c.auDela ? ' ' + t('cam360.au_dela', '(Hauteur au-delà du tableau du fournisseur : portée limitée à la dernière valeur connue.)') : '');
        if (!$(bon).checked) {
            btn.textContent = t(c.cameras === 4 ? 'cam360.choisir_4' : 'cam360.choisir_6',
                                c.cameras === 4 ? 'Choisir 360 (4 caméras)' : 'Choisir 360 (6 caméras)');
            btn.setAttribute('data-cible', bon);
            btn.style.display = '';
        }
    }

    // Ligne du courriel (vide si 360 non coche ou calcul incomplet).
    window.couverture360Ligne = function () {
        if (!cam360Coche() || !dernier) return '';
        return t('cam360.ligne', 'Couverture 360 : caméra de côté à {h}, coin le plus loin à {d} (avec 1 m de marge), portée {p} ({charte}) → {n} caméras.', {
            h: avecPieds(enMetres($('cam-calc-h').value)), d: avecPieds(dernier.distance), p: avecPieds(dernier.portee),
            charte: t($('cam-calc-charte').value === 'petite' ? 'cam360.charte_petite' : 'cam360.charte_grande',
                      $('cam-calc-charte').value === 'petite' ? 'petite charte' : 'grande charte'),
            n: dernier.cameras });
    };

    ['cam-calc-h', 'cam-calc-av', 'cam-calc-ar'].forEach(function (id) { $(id).addEventListener('input', majResultat); });
    ['cam-calc-unite', 'cam-calc-charte'].forEach(function (id) { $(id).addEventListener('change', majResultat); });
    document.querySelectorAll('input[name="camera-type"]').forEach(function (cb) { cb.addEventListener('change', majVisibilite); });
    $('cam-calc-choisir').addEventListener('click', function (e) {
        e.preventDefault();
        var cb = $(this.getAttribute('data-cible'));
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        majVisibilite();
    });
    document.addEventListener('langchange', majResultat);
    majVisibilite();
})();
