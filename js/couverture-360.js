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

    // INTERRUPTEUR : false = questionnaire cache (aucune ligne dans le courriel) ; la case
    // « Camera 360 » et le choix du kit 4 / 6 restent. Pour reculer completement : git revert du commit
    // « Soumission : calculateur Couverture 360 » (repere git avant-couverture-360).
    var ACTIF = true;

    // ---------------- interface (page Soumission) ----------------
    // Une seule case « Camera 360 » (Steve, 2026-10-14, 2e version) : on la coche, on
    // remplit le questionnaire, puis on choisit le kit (4 ou 6 cameras) ; le kit recommande
    // est mis en evidence. Les deux kits restent des cases cachees name="camera-type"
    // (#cam-360 et #cam-360-6) : courriel, Epicor, recapitulatif et panier les lisent comme
    // avant. Avec ACTIF = false, le questionnaire est cache mais le choix du kit reste.
    var boite = document.getElementById('cam-calc');
    var choix = document.getElementById('cam-360-choix');
    if (!boite || !choix) return;
    var $ = function (id) { return document.getElementById(id); };
    var kit4 = $('cam-360'), kit6 = $('cam-360-6');
    var camBox = $('toggle-camera');
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
    // Toujours la grande charte (1,35 m) : on installe sur de la machinerie lourde, la camera
    // est toujours au-dessus de 0,87 m (Steve, 2026-10-15 ; le choix de charte est retire).
    var CHARTE = 'grande';
    if (!ACTIF) { var q = $('cam-calc-questions'); if (q) q.style.display = 'none'; }

    function enMetres(v) {
        var x = parseFloat(String(v || '').replace(',', '.'));
        if (isNaN(x)) return NaN;
        return $('cam-calc-unite').value === 'pi' ? x * PIED : x;
    }
    function avecPieds(m, dec) {   // « 10,5 m » ou « 10,5 m (34,4 pi) » ; dec = 2 pour les hauteurs minimales
        var f = function (x) {
            if (dec !== 2) return nb(x);
            var v = (Math.round(x * 100) / 100).toFixed(2);
            return (typeof i18n !== 'undefined' && i18n.getLang && i18n.getLang() === 'en') ? v : v.replace('.', ',');
        };
        return f(m) + ' m' + ($('cam-calc-unite').value === 'pi' ? ' (' + f(m / PIED) + ' pi)' : '');
    }
    function kitChoisi() { return kit6.checked ? 6 : (kit4.checked ? 4 : 0); }

    function majBoutons() {
        var reco = dernier ? dernier.cameras : 0, pris = kitChoisi();
        [[4, $('cam-kit-4')], [6, $('cam-kit-6')]].forEach(function (k) {
            var b = k[1];
            b.classList.toggle('reco', reco === k[0]);
            b.classList.toggle('choisi', pris === k[0]);
            b.textContent = t(k[0] === 4 ? 'cam360.kit_4' : 'cam360.kit_6', k[0] === 4 ? 'Kit 4 caméras' : 'Kit 6 caméras')
                + (reco === k[0] ? ' — ' + t('cam360.recommande', 'recommandé') : '');
        });
        $('cam-kit-msg').textContent = pris ? '' : t('cam360.choisir_kit', 'Choisissez le kit qui convient.');
        if (pris) boite.classList.remove('manquant');
    }

    // Longueur totale <-> deux longueurs (Steve et Jacquot, 2026-10-15) : la totale se
    // separe en deux moities egales ; deux longueurs entrees refont la totale. Les valeurs
    // restent dans l'unite choisie (m ou pi).
    function lire(id) { var x = parseFloat(String($(id).value || '').replace(',', '.')); return isNaN(x) ? NaN : x; }
    function ecrire(id, x) {
        var v = String(Math.round(x * 100) / 100);
        var en = typeof i18n !== 'undefined' && i18n.getLang && i18n.getLang() === 'en';
        $(id).value = en ? v : v.replace('.', ',');
    }
    function totaleSaisie() {
        var tot = lire('cam-calc-total');
        if (tot >= 0) { ecrire('cam-calc-av', tot / 2); ecrire('cam-calc-ar', tot / 2); }
        else if (!String($('cam-calc-total').value).trim()) { $('cam-calc-av').value = ''; $('cam-calc-ar').value = ''; }   // totale effacee -> longueurs effacees
        majResultat();
    }
    function partieSaisie() {
        var av = lire('cam-calc-av'), ar = lire('cam-calc-ar');
        if (av >= 0 && ar >= 0) ecrire('cam-calc-total', av + ar);
        else $('cam-calc-total').value = '';     // une longueur effacee -> plus de totale
        majResultat();
    }
    // Changement d'unite : les valeurs deja entrees sont converties (2 m ne devient pas 2 pi).
    var uniteAvant = 'm';
    function uniteChangee() {
        var u = $('cam-calc-unite').value;
        if (u !== uniteAvant) {
            var k = u === 'pi' ? 1 / PIED : PIED;
            ['cam-calc-total', 'cam-calc-av', 'cam-calc-ar', 'cam-calc-h'].forEach(function (id) {
                var x = lire(id); if (!isNaN(x)) ecrire(id, x * k);
            });
            uniteAvant = u;
        }
        majResultat();
    }

    function majResultat() {
        var res = $('cam-calc-res');
        dernier = null;
        if (ACTIF) {
            var c = calculer(enMetres($('cam-calc-h').value), enMetres($('cam-calc-av').value),
                             enMetres($('cam-calc-ar').value), CHARTE);
            if (!c.ok) {
                res.className = 'cam-calc-res';
                res.textContent = t('cam360.saisir', 'Entrez la longueur totale du véhicule, ou les deux longueurs de chaque côté de la caméra.');
            } else if (c.tropBas) {
                res.className = 'cam-calc-res cam-calc-alerte';
                res.textContent = t('cam360.trop_bas', 'Caméra trop basse : hauteur minimale {h}.', { h: avecPieds(c.hMin, 2) });
            } else if (c.horsTableau) {
                res.className = 'cam-calc-res cam-calc-alerte';
                res.textContent = t('cam360.hors_tableau', 'Hauteur sous le tableau du fournisseur (portée connue à partir de {h}) : à valider avec le fournisseur.', { h: avecPieds(c.L, 2) });
            } else {
                dernier = c;
                res.className = 'cam-calc-res ' + (c.cameras === 4 ? 'cam-calc-ok' : 'cam-calc-6');
                res.textContent = t(c.cameras === 4 ? 'cam360.res_4' : 'cam360.res_6',
                    c.cameras === 4 ? '4 caméras suffisent : coin le plus loin {d} (avec 1 m de marge), portée {p}.'
                                    : '6 caméras recommandées : coin le plus loin {d} (avec 1 m de marge), portée {p} seulement.',
                    { d: avecPieds(c.distance), p: avecPieds(c.portee) })
                    + (c.auDela ? ' ' + t('cam360.au_dela', '(Hauteur au-delà du tableau du fournisseur : portée limitée à la dernière valeur connue.)') : '');
            }
        }
        majBoutons();
    }

    // Etat du bloc quand « Camera 360 » est cochee sans kit : actif, statut « 360 (kit a choisir) ».
    function majBloc() {
        if (!camBox) return;
        var st = camBox.querySelector('.toggle-status');
        if (choix.checked) {
            camBox.classList.add('active');
            if (!kitChoisi() && st) st.textContent = t('cam360.statut_sans_kit', '360 (kit à choisir)');
        }
    }

    // Dessin du vehicule selon le type de machine (Steve, 2026-10-15) : camion par defaut.
    // Chaque dessin porte data-cam="x,haut" : la camera, les cotes et les cases suivent.
    function placerCamera(x, y) {
        function attr(id, a) { var e = $(id); if (e) for (var k in a) e.setAttribute(k, a[k]); }
        attr('sch-cam', { x: x - 9, y: y });
        attr('sch-rappel-cam', { x1: x, x2: x, y2: y });
        attr('sch-cote-av', { x2: x - 4 });
        attr('sch-fl-av', { d: 'M24 30 l7 -4 v8 Z M' + (x - 4) + ' 30 l-7 -4 v8 Z' });
        attr('sch-cote-ar', { x1: x + 4 });
        attr('sch-fl-ar', { d: 'M' + (x + 4) + ' 30 l7 -4 v8 Z M496 30 l-7 -4 v8 Z' });
        attr('sch-cote-h', { x1: x, x2: x, y1: y + 12 });
        attr('sch-fl-h', { d: 'M' + x + ' ' + (y + 12) + ' l-4 7 h8 Z M' + x + ' 222 l-4 -7 h8 Z' });
        function pos(sel, gauche, haut) {
            var e = document.querySelector('.cam-schema ' + sel); if (!e) return;
            e.style.left = (gauche / 520 * 100).toFixed(1) + '%';
            if (haut != null) e.style.top = (haut / 290 * 100).toFixed(1) + '%';
        }
        pos('.sch-av', (20 + x) / 2);
        pos('.sch-ar', (x + 500) / 2);
        pos('.sch-h', Math.min(x + 70, 470), (y + 12 + 222) / 2 + 40);
        pos('.sch-cam-lib', x, y - 14 + 40);
    }
    function majVehicule(force) {
        var type = typeof force === 'string' ? force : (($('select-type') || {}).value || ''), choisi = null;
        document.querySelectorAll('.cam-schema .sch-veh').forEach(function (g) {
            var oui = g.getAttribute('data-type') === type;
            g.style.display = oui ? '' : 'none';
            if (oui) choisi = g;
        });
        var d = $('sch-veh-defaut');
        if (d) d.style.display = choisi ? 'none' : '';
        var c = ((choisi || d) && (choisi || d).getAttribute('data-cam') || '186,76').split(',');
        placerCamera(+c[0], +c[1]);
    }
    window.couverture360Vehicule = majVehicule;
    if ($('select-type')) $('select-type').addEventListener('change', majVehicule);

    function majVisibilite() {
        majVehicule();
        boite.style.display = choix.checked ? '' : 'none';
        majBloc();
        majResultat();
    }
    window.couverture360Maj = majVisibilite;

    // Case « Camera 360 »
    choix.addEventListener('change', function () {
        if (choix.checked) {
            // Exclusive avec Recul, Recul + capteur, Quad (comme les autres cases du bloc).
            document.querySelectorAll('input[name="camera-type"]').forEach(function (cb) {
                if (cb.checked && cb !== kit4 && cb !== kit6) cb.click();
            });
        } else {
            [kit4, kit6].forEach(function (cb) { if (cb.checked) cb.click(); });
        }
        majVisibilite();
        try { if (typeof updateSelectedSummary === 'function') updateSelectedSummary(); } catch (e) {}
    });
    // Une autre camera cochee (Recul, Quad...) : « Camera 360 » se decoche. Un kit coche
    // (bouton, ou panier restaure) : « Camera 360 » se coche.
    document.querySelectorAll('input[name="camera-type"]').forEach(function (cb) {
        cb.addEventListener('change', function () {
            if (cb.checked && (cb === kit4 || cb === kit6)) choix.checked = true;
            else if (cb.checked) choix.checked = false;
            majVisibilite();
        });
    });
    [[4, kit4], [6, kit6]].forEach(function (k) {
        $('cam-kit-' + k[0]).addEventListener('click', function (e) {
            e.preventDefault();
            if (!k[1].checked) k[1].click();
            majVisibilite();
        });
    });
    $('cam-calc-h').addEventListener('input', majResultat);
    $('cam-calc-total').addEventListener('input', totaleSaisie);
    ['cam-calc-av', 'cam-calc-ar'].forEach(function (id) { $(id).addEventListener('input', partieSaisie); });
    $('cam-calc-unite').addEventListener('change', uniteChangee);
    if (!$('cam-calc-h').value) $('cam-calc-h').value = '2';     // hauteur de base : 2 m (modifiable)
    document.addEventListener('langchange', majVisibilite);

    // Envoi / ajout au panier : « Camera 360 » cochee sans kit choisi -> on bloque.
    window.kit360Manquant = function () {
        if (!choix.checked || kitChoisi()) return false;
        boite.style.display = '';
        boite.classList.add('manquant');
        boite.scrollIntoView({ block: 'center' });
        majBoutons();
        return true;
    };

    // Ligne du courriel (vide si « Camera 360 » non cochee ou calcul non fait).
    window.couverture360Ligne = function () {
        if (!choix.checked || !dernier) return '';
        return t('cam360.ligne', 'Couverture 360 : caméra de côté à {h}, coin le plus loin à {d} (avec 1 m de marge), portée {p} → {n} caméras.', {
            h: avecPieds(enMetres($('cam-calc-h').value)), d: avecPieds(dernier.distance), p: avecPieds(dernier.portee),
            n: dernier.cameras });
    };

    majVisibilite();
})();
