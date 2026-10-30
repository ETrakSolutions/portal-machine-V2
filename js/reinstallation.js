// Soumission reinstallation / desinstallation (decision Jacquot, 2026-10-29).
// Pour Kevin et Luna : chiffrer une desinstallation, une reinstallation, ou une
// reinstallation seule (systeme deja retire par le client).
// AUCUN montant dans ce fichier : le site est public. Le serveur (action 'getreinst')
// remet les montants et le catalogue des pieces aux quatre personnes admises seulement ;
// la page ne fait qu'eviter un ecran vide aux autres. Listes maitresses :
// prix-reinstallation.json et prix-pieces.json (SharePoint _Portail e-Trak), publiees par
// scripts/publier_reinst.py.
// Regles (Jacquot, 2026-10-29) : desinstallation 4 h (Guide Pro 5 h) au taux horaire ;
// installation au prix de l'annee ; lettre SAT01 pour le Limiteur seulement ; option Mini
// (mini-excavatrice) pour Limiteur et Guide Pro ; km aller-retour depuis l'usine ;
// pieces affichees sans prix, un seul montant pour l'ensemble.
// Ajouts du 2026-10-30 (Jacquot) : bloc Epicor pour Luna (code <TAB> qte, comme la
// Soumission) ; pieces additionnelles au prix de la liste ; codes Epicor : desinstallation
// SHR01 (heures), reinstallation 1000-1001, km SKM01, hotel + repas 1400-0000 ; raccords
// LS7 sans code, a valider selon la machine avant la reinstallation.
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

    // Systemes : heures, options et pieces remplacees [code Epicor, libelle] (sans prix).
    // Les montants (INST_*, PIECES_*) sont lus dans la reponse du serveur.
    var SYSTEMES = {
        lim: { nom: 'Limiteur', sous: 'Limit-Pro excavatrice', heures: 4, mini: true, lettre: true,
               inst: 'INST_LIM', instCode: '1500-0005-Install', pieces: 'PIECES_LIM',
               liste: [['Z03B-0062', 'Harnais de capteur M12 angle 5 m'], ['E03A-0005', 'Câble CAN femelle M12, 10 m'],
                       ['Z05B-0001', 'Pré-kit de fusibles et accessoires'], ['Z01B-0009', "Kit d'assemblage universel de prox"],
                       ['Z04A-0003', 'Autocollant « Protégée par un limiteur »'], ['AH006', 'Apprêt 3M 94'],
                       ['P01A-0002', "Support d'écran autocollant"]] },
        gp:  { nom: 'Guide Pro', sous: 'Creusage 2D', heures: 5, mini: true, lettre: false,
               modeles: [['1100-0007', '1 boom – 1 stick', 'INST_GP_1100-0007', '1100-0007-Install'],
                         ['1100-0011', '2 booms – 1 stick', 'INST_GP_1100-0011', '1100-0011-Install'],
                         ['1000-0007', 'Si déjà Limit-Pro, 1 boom', 'INST_GP_1000-0007', '1100-0007-Install'],
                         ['1000-0011', 'Si déjà Limit-Pro, 2 booms', 'INST_GP_1000-0011', '1100-0007-Install']],
               pieces: 'PIECES_GP',
               liste: [['Z03B-0062', 'Harnais de capteur M12 angle 5 m'], ['E03A-0005', 'Câble CAN femelle M12, 10 m'],
                       ['Z05B-0001', 'Pré-kit de fusibles et accessoires'], ['Z01B-0009', "Kit d'assemblage universel de prox"],
                       ['Z04A-0003', 'Autocollant « Protégée par un limiteur »'], ['E03A-0006', 'Câble CAN M12, 10 m, 2 connecteurs'],
                       ['E03A-0019', 'Câble CAN M12, 2 m, 2 connecteurs'], ['Z01X-0001', "Support d'inclinomètre soudé universel"],
                       ['Z01B-0071', "Support d'inclinomètre (godet)"], ['AH006', 'Apprêt 3M 94'],
                       ['P01A-0002', "Support d'écran autocollant"], ['KH1420', 'Collet Stauff 24 mm soudé']] },
        ls6: { nom: 'Balance LS6', sous: 'Scale Pro', heures: 4, mini: false, lettre: false,
               inst: 'INST_LS6', instCode: '1200-0010-Install', pieces: 'PIECES_LS6',
               liste: [['Z03B-0063', 'Harnais de capteur M12 droit 10 m'], ['E03A-0005', 'Câble CAN femelle M12, 10 m'],
                       ['E03A-0009', 'Câble CAN M12, 5 m, 2 connecteurs'], ['E03A-0013', 'Câble CAN M12, 3 m, 2 connecteurs'],
                       ['Z05B-0001', 'Pré-kit de fusibles et accessoires'], ['P01A-0002', "Support d'écran autocollant"]] },
        ls7: { nom: 'Balance LS7', sous: 'Scale Pro', heures: 4, mini: false, lettre: false, raccords: true,
               inst: 'INST_LS7', instCode: '1200-0010-Install', pieces: 'PIECES_LS7',
               liste: [['E03A-0009', 'Câble CAN M12, 5 m, 2 connecteurs'], ['E03A-0013', 'Câble CAN M12, 3 m, 2 connecteurs'],
                       ['C02A-0020', 'Coude 90° pour capteur de pression'], ['Z05B-0001', 'Pré-kit de fusibles et accessoires'],
                       ['E03A-0019', 'Câble CAN M12, 2 m, 2 connecteurs'], ['Z01B-0052', "Support d'inclinomètre magnétique"]] }
    };
    var TITRES = { re: 'Désinstallation et réinstallation', ri: 'Réinstallation (système déjà retiré par le client)', de: 'Désinstallation' };
    // Remarques Epicor par code (constats du 2026-10-30 dans Epicor, societe ETRAK).
    var REMARQUES = {
        'Z01B-0009': 'Inactif dans Epicor (« NE PLUS UTILISER ») : code de remplacement à confirmer avec Steve.',
        'Z01B-0071': "Absent de la liste de prix 2027 : vérifier son prix dans Epicor.",
        '1400-0000': 'Inactif dans Epicor : à faire réactiver par Steve.'
    };

    var P = null;           // { CODE: montant en dollars } remis par le serveur
    var CAT = null;         // { PN: [description, prix] } remis par le serveur
    var VIGUEUR = '';
    var ajouts = [];        // [{ pn, qte }]
    var texteCopie = '', texteEpicor = '';

    // Tout en cents entiers : jamais d'arrondi flottant sur un total.
    function c(code) {
        var v = P[code];
        if (typeof v !== 'number' || !isFinite(v)) throw new Error('Montant manquant : ' + code);
        return Math.round(v * 100);
    }
    function cCat(pn) { return Math.round(CAT[pn][1] * 100); }
    function entier(id) { var n = Math.floor(Number($(id).value)); return isFinite(n) && n > 0 ? n : 0; }
    function argent(cents) { return (cents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' }); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function etat() {
        return {
            type: document.querySelector('input[name=ri-type]:checked').value,
            sys: document.querySelector('input[name=ri-sys]:checked').value,
            gp: $('ri-gp').value, mini: $('ri-mini').checked,
            raccords: entier('ri-fit') * 100,
            km: entier('ri-km'), nuits: entier('ri-nuits'), repas: entier('ri-repas'),
            ajouts: ajouts.slice()
        };
    }

    // Calcul pur : (etat) -> lignes de la soumission, total, et lignes Epicor. En cents.
    function calculer(s) {
        var S = SYSTEMES[s.sys], L = [], E = [];
        var reinst = s.type === 're' || s.type === 'ri';
        if (s.type !== 'ri') {
            L.push({ lib: 'Désinstallation', note: S.heures + ' h × ' + argent(c('TAUX_H')), c: S.heures * c('TAUX_H') });
            E.push({ code: 'SHR01', desc: 'Désinstallation (taux horaire réparation)', qte: S.heures });
        }
        if (reinst) {
            var inst = S.inst, code = S.instCode;
            if (S.modeles) {
                var m = S.modeles.filter(function (x) { return x[0] === s.gp; })[0] || S.modeles[0];
                inst = m[2]; code = m[3];
            }
            L.push({ lib: 'Réinstallation et calibration', note: code, c: c(inst) });
            E.push({ code: '1000-1001', desc: 'Réinstallation de système', qte: 1,
                     rem: 'Prix à saisir dans Epicor : ' + argent(c(inst)) });
        }
        if (S.mini && s.mini) {
            L.push({ lib: 'Option mini-excavatrice', note: '1500-0004-Install', c: c('MINI') });
            E.push({ code: '1500-0004-Install', desc: 'Option mini-excavatrice', qte: 1 });
        }
        if (reinst && S.lettre) {
            L.push({ lib: "Lettre d'attestation", note: 'SAT01', c: c('LETTRE') });
            E.push({ code: 'SAT01', desc: "Lettre d'attestation de conformité CNESST", qte: 1 });
        }
        var km = s.km * c('KM'), sejour = s.nuits * c('HOTEL') + s.repas * c('REPAS');
        var noteDep = [s.km + ' km aller-retour', s.nuits ? s.nuits + " nuit(s) d'hôtel" : '', s.repas ? s.repas + ' jour(s) de repas' : '']
            .filter(Boolean).join(' · ');
        L.push({ lib: 'Déplacement', note: noteDep, c: km + sejour });
        if (s.km) E.push({ code: 'SKM01', desc: 'Frais de déplacement (km)', qte: s.km });
        if (sejour) E.push({ code: '1400-0000', desc: 'Hôtel et repas', qte: 1,
                             rem: REMARQUES['1400-0000'] + ' Prix à saisir : ' + argent(sejour) });
        if (reinst) {
            L.push({ lib: 'Pièces remplacées (ensemble)', note: 'Voir la liste ci-dessous', c: c(S.pieces) });
            S.liste.forEach(function (x) { E.push({ code: x[0], desc: x[1], qte: 1, rem: REMARQUES[x[0]] }); });
        }
        if (reinst && S.raccords) {
            L.push({ lib: 'Raccords hydrauliques', note: 'À valider selon la machine avant la réinstallation', c: s.raccords });
            E.push({ code: '', desc: 'Raccords hydrauliques', qte: 1,
                     rem: 'Aucun code : à saisir à la main, ' + argent(s.raccords) + '. À valider avant la réinstallation.' });
        }
        var extra = 0;
        s.ajouts.forEach(function (a) {
            extra += a.qte * cCat(a.pn);
            E.push({ code: a.pn, desc: CAT[a.pn][0], qte: a.qte });
        });
        if (s.ajouts.length) L.push({ lib: 'Pièces additionnelles', note: s.ajouts.length + ' code(s), voir la liste ci-dessous', c: extra });
        return { lignes: L, total: L.reduce(function (a, l) { return a + l.c; }, 0), epicor: E };
    }
    window.__reinstCalculer = calculer;   // pour le test navigateur

    function afficherAjouts() {
        $('ri-added').innerHTML = ajouts.map(function (a, i) {
            return '<li><span><strong>' + esc(a.pn) + '</strong> × ' + a.qte + '<small>' + esc(CAT[a.pn][0]) + '</small></span>' +
                '<button type="button" class="ri-x" data-i="' + i + '" aria-label="Retirer ' + esc(a.pn) + '">Retirer</button></li>';
        }).join('');
    }

    function ajouter() {
        var err = $('ri-add-err'), brut = $('ri-add-code').value.trim();
        var pn = brut.split(' — ')[0].trim();
        var trouve = Object.keys(CAT || {}).filter(function (k) { return k.toLowerCase() === pn.toLowerCase(); })[0];
        var qte = entier('ri-add-qty');
        err.hidden = true;
        if (!trouve) { err.textContent = '« ' + pn + ' » n’est pas dans la liste de prix de l’année (ou est inactif dans Epicor).'; err.hidden = false; return; }
        if (!qte) { err.textContent = 'Quantité d’au moins 1.'; err.hidden = false; return; }
        var dejà = ajouts.filter(function (a) { return a.pn === trouve; })[0];
        if (dejà) dejà.qte += qte; else ajouts.push({ pn: trouve, qte: qte });
        $('ri-add-code').value = ''; $('ri-add-qty').value = '1';
        afficherAjouts(); afficher();
    }

    function afficher() {
        var s = etat(), S = SYSTEMES[s.sys], reinst = s.type === 're' || s.type === 'ri', r;
        // Un texte de secours deja affiche ne doit jamais decrire une soumission precedente.
        ['ri-copy-fallback', 'ri-epi-fallback', 'ri-toast', 'ri-toast-epi'].forEach(function (id) { $(id).hidden = true; });
        $('ri-gp-field').hidden = s.sys !== 'gp';
        $('ri-mini-row').hidden = !S.mini;
        $('ri-fit-field').hidden = !(S.raccords && reinst);
        $('ri-note-fit').hidden = !(S.raccords && reinst);
        $('ri-parts').hidden = !reinst;
        $('ri-parts-box').hidden = !reinst && !s.ajouts.length;
        $('ri-parts-box').querySelector('h3').hidden = !reinst;
        $('ri-extra-h').hidden = !s.ajouts.length;
        try { r = calculer(s); }
        catch (e) {
            $('ri-lines').innerHTML = '<tr><td>Un montant manque sur le serveur : aucun total. Avise Jacquot.</td></tr>';
            $('ri-epi-rows').innerHTML = '';
            texteCopie = ''; texteEpicor = '';
            return;
        }
        $('ri-qtitle').textContent = TITRES[s.type] + ' — ' + S.nom;
        $('ri-qinfo').textContent = [$('ri-client').value.trim(), $('ri-machine').value.trim()].filter(Boolean).join(' · ');
        $('ri-lines').innerHTML = r.lignes.map(function (l) {
            return '<tr><td>' + esc(l.lib) + '<small>' + esc(l.note) + '</small></td><td class="amt">' + argent(l.c) + '</td></tr>';
        }).join('') + '<tr class="tot"><td>Total</td><td class="amt">' + argent(r.total) + '</td></tr>';
        $('ri-parts').innerHTML = S.liste.map(function (x) { return '<li>' + esc(x[1]) + '</li>'; }).join('');
        $('ri-extra').innerHTML = s.ajouts.map(function (a) {
            return '<li>' + esc(CAT[a.pn][0]) + (a.qte > 1 ? ' × ' + a.qte : '') + '</li>';
        }).join('');
        $('ri-epi-rows').innerHTML = r.epicor.map(function (e) {
            return '<tr><td>' + (e.code ? '<code>' + esc(e.code) + '</code>' : '<span class="ri-warn">sans code</span>') + '</td><td>' + esc(e.desc) +
                '</td><td class="q">' + e.qte + '</td><td>' + (e.rem ? '<span class="ri-warn">' + esc(e.rem) + '</span>' : '') + '</td></tr>';
        }).join('') + '<tr><td></td><td><strong>Total à retrouver dans Epicor</strong></td><td></td><td><strong>' + argent(r.total) + '</strong></td></tr>';
        texteEpicor = r.epicor.filter(function (e) { return e.code; })
            .map(function (e) { return e.code + '\t' + e.qte; }).join('\n');
        var noteFit = (S.raccords && reinst) ? ['Raccords hydrauliques à valider selon la machine avant la réinstallation.'] : [];
        texteCopie = [
            'e-Trak Solutions Technologiques — Soumission',
            $('ri-qtitle').textContent, $('ri-qinfo').textContent, ''
        ].concat(r.lignes.map(function (l) { return l.lib + ' (' + l.note + ') : ' + argent(l.c); }))
         .concat(['TOTAL : ' + argent(r.total) + ' (CAD, avant taxes)', ''])
         .concat(reinst ? ['Pièces remplacées incluses :'].concat(S.liste.map(function (x) { return '- ' + x[1]; })).concat(['']) : [])
         .concat(s.ajouts.length ? ['Pièces additionnelles :'].concat(s.ajouts.map(function (a) {
             return '- ' + CAT[a.pn][0] + (a.qte > 1 ? ' × ' + a.qte : ''); })).concat(['']) : [])
         .concat(noteFit)
         .concat([$('ri-vigueur').textContent, 'Pièce additionnelle constatée sur place : cotée séparément.',
                  'Préparé par : ' + (user.name || user.username || '')])
         .join('\n');
    }

    function copier(texte, toast, secours) {
        var t = $(toast), fb = $(secours);
        var ok = function () { t.textContent = 'Copié'; t.hidden = false; setTimeout(function () { t.hidden = true; }, 2500); };
        var ko = function () { fb.value = texte; fb.hidden = false; fb.select(); t.textContent = 'Texte sélectionné : Ctrl+C pour copier'; t.hidden = false; };
        if (!texte) return;
        try { navigator.clipboard.writeText(texte).then(ok, ko); } catch (e) { ko(); }
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
        $('ri-km-hint').textContent = 'Départ : 1400, boul. Pierre-Roux Est, Victoriaville. ' + argent(c('KM')) + '/km.';
        $('ri-date').textContent = new Date().toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
        var vig = VIGUEUR ? new Date(VIGUEUR + 'T12:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
        $('ri-vigueur').textContent = (vig ? 'Prix en vigueur le ' + vig + '. ' : '') + 'Soumission valide 30 jours.';
        if (CAT && Object.keys(CAT).length) {
            $('ri-cat-list').innerHTML = Object.keys(CAT).sort().map(function (pn) {
                return '<option value="' + esc(pn + ' — ' + CAT[pn][0]) + '"></option>';
            }).join('');
        } else {
            CAT = {};
            ['ri-add-code', 'ri-add-qty', 'ri-add-btn'].forEach(function (id) { $(id).disabled = true; });
            $('ri-add-hint').textContent = 'Le catalogue des pièces n’est pas encore publié : ajout manuel indisponible.';
        }
        $('ri-add-btn').addEventListener('click', ajouter);
        $('ri-add-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } });
        $('ri-added').addEventListener('click', function (e) {
            var b = e.target.closest('.ri-x'); if (!b) return;
            ajouts.splice(Number(b.getAttribute('data-i')), 1); afficherAjouts(); afficher();
        });
        document.addEventListener('input', function (e) { if (e.target.id !== 'ri-add-code' && e.target.id !== 'ri-add-qty') afficher(); });
        document.addEventListener('change', function (e) { if (e.target.id !== 'ri-add-code' && e.target.id !== 'ri-add-qty') afficher(); });
        $('ri-copy').addEventListener('click', function () { copier(texteCopie, 'ri-toast', 'ri-copy-fallback'); });
        $('ri-copy-epi').addEventListener('click', function () { copier(texteEpicor, 'ri-toast-epi', 'ri-epi-fallback'); });
        $('ri-loading').style.display = 'none';
        $('ri-root').style.display = 'block';
        afficher();
    }

    fetch(window.PORTAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getreinst', token: user.token }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.ok && d.reinst && d.reinst.prix) {
                P = d.reinst.prix; VIGUEUR = d.reinst.vigueur || ''; CAT = d.reinst.catalogue || null;
                try { construire(); } catch (e) { refuser('Un montant manque sur le serveur. Avise Jacquot.'); }
                return;
            }
            if (d && d.error === 'reinst unavailable') return refuser('Les prix de réinstallation ne sont pas encore publiés.');
            refuser();
        })
        .catch(function () { refuser('Le serveur ne répond pas. Réessaie dans un moment.'); });
})();
