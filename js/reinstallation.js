// Soumission reinstallation / desinstallation (decision Jacquot, 2026-10-29).
// Pour Kevin et Luna : chiffrer une desinstallation, une reinstallation, ou une
// reinstallation seule (systeme deja retire par le client).
// AUCUN montant dans ce fichier : le site est public. Le serveur (action 'getreinst')
// remet les montants aux quatre personnes admises seulement ; la page ne fait qu'eviter
// un ecran vide aux autres. Liste maitresse : prix-reinstallation.json (SharePoint
// _Portail e-Trak), publiee par scripts/publier_reinst.py.
// Regles (Jacquot, 2026-10-29) : desinstallation 4 h (Guide Pro 5 h) au taux horaire ;
// installation au prix de l'annee ; lettre SAT01 pour le Limiteur seulement ; option Mini
// (mini-excavatrice) pour Limiteur et Guide Pro ; km aller-retour depuis l'usine ;
// pieces affichees sans prix, un seul montant pour l'ensemble.
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}

    function refuser(texte) {
        $('ri-loading').style.display = 'none';
        $('ri-root').style.display = 'none';
        if (texte) $('ri-denied-desc').textContent = texte;
        $('ri-denied').style.display = 'block';
    }
    if (!user || user.isGuest || !user.token || user.role === 'dealer' || user.role === 'distributeur') {
        refuser();
        return;
    }

    // Systemes : heures, options et liste des pieces (libelles seulement, sans prix).
    // Les codes de montant (INST_*, PIECES_*) sont lus dans la reponse du serveur.
    var SYSTEMES = {
        lim: { nom: 'Limiteur', sous: 'Limit-Pro excavatrice', heures: 4, mini: true, lettre: true,
               inst: 'INST_LIM', instCode: '1500-0005-Install', pieces: 'PIECES_LIM',
               liste: ['Harnais de capteur M12 angle 5 m', 'Câble CAN femelle M12, 10 m', 'Pré-kit de fusibles et accessoires',
                       "Kit d'assemblage universel de prox", 'Autocollant « Protégée par un limiteur »', 'Apprêt 3M 94', "Support d'écran autocollant"] },
        gp:  { nom: 'Guide Pro', sous: 'Creusage 2D', heures: 5, mini: true, lettre: false,
               modeles: [['1100-0007', '1 boom – 1 stick', 'INST_GP_1100-0007', '1100-0007-Install'],
                         ['1100-0011', '2 booms – 1 stick', 'INST_GP_1100-0011', '1100-0011-Install'],
                         ['1000-0007', 'Si déjà Limit-Pro, 1 boom', 'INST_GP_1000-0007', '1100-0007-Install'],
                         ['1000-0011', 'Si déjà Limit-Pro, 2 booms', 'INST_GP_1000-0011', '1100-0007-Install']],
               pieces: 'PIECES_GP',
               liste: ['Harnais de capteur M12 angle 5 m', 'Câble CAN femelle M12, 10 m', 'Pré-kit de fusibles et accessoires',
                       "Kit d'assemblage universel de prox", 'Autocollant « Protégée par un limiteur »', 'Câble CAN M12, 10 m, 2 connecteurs',
                       'Câble CAN M12, 2 m, 2 connecteurs', "Support d'inclinomètre soudé universel", "Support d'inclinomètre (Z01B-0071)",
                       'Apprêt 3M 94', "Support d'écran autocollant", 'Collet Stauff 24 mm soudé'] },
        ls6: { nom: 'Balance LS6', sous: 'Scale Pro', heures: 4, mini: false, lettre: false,
               inst: 'INST_LS6', instCode: '1200-0010-Install', pieces: 'PIECES_LS6',
               liste: ['Harnais de capteur M12 droit 10 m', 'Câble CAN femelle M12, 10 m', 'Câble CAN M12, 5 m, 2 connecteurs',
                       'Câble CAN M12, 3 m, 2 connecteurs', 'Pré-kit de fusibles et accessoires', "Support d'écran autocollant"] },
        ls7: { nom: 'Balance LS7', sous: 'Scale Pro', heures: 4, mini: false, lettre: false, raccords: true,
               inst: 'INST_LS7', instCode: '1200-0010-Install', pieces: 'PIECES_LS7',
               liste: ['Câble CAN M12, 5 m, 2 connecteurs', 'Câble CAN M12, 3 m, 2 connecteurs', 'Coude 90° pour capteur de pression',
                       'Pré-kit de fusibles et accessoires', 'Câble CAN M12, 2 m, 2 connecteurs', "Support d'inclinomètre magnétique"] }
    };
    var TITRES = { re: 'Désinstallation et réinstallation', ri: 'Réinstallation (système déjà retiré par le client)', de: 'Désinstallation' };

    var P = null;           // { CODE: montant en dollars } remis par le serveur
    var VIGUEUR = '';
    var texteCopie = '';

    // Tout en cents entiers : jamais d'arrondi flottant sur un total.
    function c(code) {
        var v = P[code];
        if (typeof v !== 'number' || !isFinite(v)) throw new Error('Montant manquant : ' + code);
        return Math.round(v * 100);
    }
    function entier(id) { var n = Math.floor(Number($(id).value)); return isFinite(n) && n > 0 ? n : 0; }
    function argent(cents) { return (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' }); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function etat() {
        return {
            type: document.querySelector('input[name=ri-type]:checked').value,
            sys: document.querySelector('input[name=ri-sys]:checked').value,
            gp: $('ri-gp').value, mini: $('ri-mini').checked,
            raccords: entier('ri-fit') * 100,
            km: entier('ri-km'), nuits: entier('ri-nuits'), repas: entier('ri-repas')
        };
    }

    // Calcul pur : (etat, montants) -> lignes et total, en cents.
    function calculer(s) {
        var S = SYSTEMES[s.sys], L = [];
        var reinst = s.type === 're' || s.type === 'ri';
        if (s.type !== 'ri') L.push({ lib: 'Désinstallation', note: S.heures + ' h × ' + argent(c('TAUX_H')), c: S.heures * c('TAUX_H') });
        if (reinst) {
            var inst = S.inst, code = S.instCode;
            if (S.modeles) {
                var m = S.modeles.filter(function (x) { return x[0] === s.gp; })[0] || S.modeles[0];
                inst = m[2]; code = m[3];
            }
            L.push({ lib: 'Réinstallation et calibration', note: code, c: c(inst) });
        }
        if (S.mini && s.mini) L.push({ lib: 'Option mini-excavatrice', note: '1500-0004-Install', c: c('MINI') });
        if (reinst && S.lettre) L.push({ lib: "Lettre d'attestation", note: 'SAT01', c: c('LETTRE') });
        var dep = s.km * c('KM') + s.nuits * c('HOTEL') + s.repas * c('REPAS');
        var noteDep = [s.km + ' km aller-retour', s.nuits ? s.nuits + ' nuit(s) d\'hôtel' : '', s.repas ? s.repas + ' jour(s) de repas' : '']
            .filter(Boolean).join(' · ');
        L.push({ lib: 'Déplacement', note: noteDep, c: dep });
        if (reinst) L.push({ lib: 'Pièces remplacées (ensemble)', note: 'Voir la liste ci-dessous', c: c(S.pieces) });
        if (reinst && S.raccords) L.push({ lib: 'Raccords hydrauliques', note: 'Selon la machine', c: s.raccords });
        return { lignes: L, total: L.reduce(function (a, l) { return a + l.c; }, 0) };
    }
    window.__reinstCalculer = calculer;   // pour le test navigateur

    function afficher() {
        var s = etat(), S = SYSTEMES[s.sys], reinst = s.type === 're' || s.type === 'ri', r;
        $('ri-gp-field').hidden = s.sys !== 'gp';
        $('ri-mini-row').hidden = !S.mini;
        $('ri-fit-field').hidden = !(S.raccords && reinst);
        $('ri-parts-box').hidden = !reinst;
        try { r = calculer(s); }
        catch (e) {
            $('ri-lines').innerHTML = '<tr><td>Un montant manque sur le serveur : aucun total. Avise Jacquot.</td></tr>';
            texteCopie = '';
            return;
        }
        $('ri-qtitle').textContent = TITRES[s.type] + ' — ' + S.nom;
        $('ri-qinfo').textContent = [$('ri-client').value.trim(), $('ri-machine').value.trim()].filter(Boolean).join(' · ');
        $('ri-lines').innerHTML = r.lignes.map(function (l) {
            return '<tr><td>' + esc(l.lib) + '<small>' + esc(l.note) + '</small></td><td class="amt">' + argent(l.c) + '</td></tr>';
        }).join('') + '<tr class="tot"><td>Total</td><td class="amt">' + argent(r.total) + '</td></tr>';
        $('ri-parts').innerHTML = S.liste.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
        texteCopie = [
            'e-Trak Solutions Technologiques — Soumission',
            $('ri-qtitle').textContent, $('ri-qinfo').textContent, ''
        ].concat(r.lignes.map(function (l) { return l.lib + ' (' + l.note + ') : ' + argent(l.c); }))
         .concat(['TOTAL : ' + argent(r.total) + ' (CAD, avant taxes)', ''])
         .concat(reinst ? ['Pièces remplacées incluses :'].concat(S.liste.map(function (x) { return '- ' + x; })).concat(['']) : [])
         .concat([$('ri-vigueur').textContent, 'Pièce additionnelle constatée sur place : cotée séparément.',
                  'Préparé par : ' + (user.name || user.username || '')])
         .join('\n');
    }

    function construire() {
        $('ri-prods').innerHTML = Object.keys(SYSTEMES).map(function (k, i) {
            var S = SYSTEMES[k];
            return '<div class="ri-choice"><input type="radio" name="ri-sys" id="ri-p-' + k + '" value="' + k + '"' + (i === 0 ? ' checked' : '') +
                '><label for="ri-p-' + k + '"><strong>' + esc(S.nom) + '</strong><span>' + esc(S.sous) + '</span></label></div>';
        }).join('');
        $('ri-gp').innerHTML = SYSTEMES.gp.modeles.map(function (m) {
            return '<option value="' + m[0] + '">' + m[0] + ' · ' + esc(m[1]) + ' · installation ' + argent(c(m[2])) + '</option>';
        }).join('');
        $('ri-fit').value = String(c('RACCORDS') / 100);
        $('ri-km-hint').textContent = "Départ : 1400, boul. Pierre-Roux Est, Victoriaville. " + argent(c('KM')) + '/km.';
        $('ri-date').textContent = new Date().toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
        var vig = VIGUEUR ? new Date(VIGUEUR + 'T12:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
        $('ri-vigueur').textContent = (vig ? 'Prix en vigueur le ' + vig + '. ' : '') + 'Soumission valide 30 jours.';
        document.addEventListener('input', afficher);
        document.addEventListener('change', afficher);
        $('ri-copy').addEventListener('click', function () {
            var t = $('ri-toast'), fb = $('ri-copy-fallback');
            var ok = function () { t.textContent = 'Soumission copiée'; t.hidden = false; setTimeout(function () { t.hidden = true; }, 2500); };
            var ko = function () { fb.value = texteCopie; fb.hidden = false; fb.select(); t.textContent = 'Texte sélectionné : Ctrl+C pour copier'; t.hidden = false; };
            try { navigator.clipboard.writeText(texteCopie).then(ok, ko); } catch (e) { ko(); }
        });
        $('ri-loading').style.display = 'none';
        $('ri-root').style.display = 'block';
        afficher();
    }

    fetch(window.PORTAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getreinst', token: user.token }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.ok && d.reinst && d.reinst.prix) {
                P = d.reinst.prix; VIGUEUR = d.reinst.vigueur || '';
                try { construire(); } catch (e) { refuser('Un montant manque sur le serveur. Avise Jacquot.'); }
                return;
            }
            if (d && d.error === 'reinst unavailable') return refuser('Les prix de réinstallation ne sont pas encore publiés.');
            refuser();
        })
        .catch(function () { refuser('Le serveur ne répond pas. Réessaie dans un moment.'); });
})();
