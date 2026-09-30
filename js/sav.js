// Demande de service apres-vente (decision Jacquot, 2026-09-29).
// Guide d'appel pour toute l'equipe interne : RIEN n'est enregistre. L'envoi ouvre un
// courriel Outlook pre-rempli vers la personne choisie au routage (+ les copies).
// Le serveur (action 'getsav') ne remet la liste des clients (nom, ville, province,
// dealer/direct) et des pieces qu'a une session d'un role interne ; le controle
// ci-dessous ne fait qu'eviter d'afficher une page vide.
(function () {
    'use strict';
    // Acces regle dans le tableau des permissions (savAccess, 2026-09-30) : le serveur
    // tranche ; un refus de sa part affiche la page « acces refuse ».
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    function refuser() {
        document.getElementById('sav-root').style.display = 'none';
        document.getElementById('sav-denied').style.display = 'block';
    }
    if (!user || user.isGuest || !user.token || (window.portalRoleLocked && window.portalRoleLocked(user.role, 'savAccess'))) {
        refuser();
        return;
    }
    document.getElementById('sav-root').style.display = 'block';

    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    var REF = { clients: [], pieces: [], produits: [], routage: [], cc: [], contacts: {} };
    var clientChoisi = null;          // [nom, ville, prov, type] ou null (nouveau client)
    var routageManuel = false;        // l'utilisateur a choisi lui-meme : on ne suggere plus

    // ---------- recherche avec liste deroulante (clients et pieces) ----------
    function autocomplete(input, liste, source, rendu, choisir, options) {
        var sel = -1, items = [];
        options = options || {};
        function fermer() { liste.style.display = 'none'; sel = -1; }
        function ouvrir() {
            var q = norm(input.value).trim();
            if (q.length < (options.min || 2)) { fermer(); return; }
            var mots = q.split(/\s+/);
            items = [];
            var src = source();
            for (var i = 0; i < src.length && items.length < 12; i++) {
                var h = norm(src[i].join(' '));
                if (mots.every(function (m) { return h.indexOf(m) >= 0; })) items.push(src[i]);
            }
            var html = items.map(function (it, k) { return '<div data-k="' + k + '">' + rendu(it) + '</div>'; }).join('');
            if (options.nouveau) html += '<div class="new" data-k="-2">' + esc(options.nouveau(input.value)) + '</div>';
            liste.innerHTML = html || '<div class="new">Aucun résultat</div>';
            liste.style.display = 'block';
            sel = -1;
        }
        function marquer() { [].forEach.call(liste.children, function (d, k) { d.classList.toggle('on', k === sel); }); }
        input.addEventListener('input', ouvrir);
        input.addEventListener('focus', ouvrir);
        input.addEventListener('keydown', function (e) {
            if (liste.style.display !== 'block') return;
            if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, liste.children.length - 1); marquer(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); marquer(); e.preventDefault(); }
            else if (e.key === 'Enter' && sel >= 0) { liste.children[sel].dispatchEvent(new MouseEvent('mousedown')); e.preventDefault(); }
            else if (e.key === 'Escape') fermer();
        });
        liste.addEventListener('mousedown', function (e) {
            var d = e.target.closest('div[data-k]');
            if (!d) return;
            e.preventDefault();
            var k = +d.getAttribute('data-k');
            choisir(k >= 0 ? items[k] : null);
            fermer();
        });
        input.addEventListener('blur', function () { setTimeout(fermer, 150); });
    }

    var TYPE_LBL = { dealer: 'Dealer', direct: 'Client direct', interco: 'Intercompagnie' };
    function tagType(t) { return t ? '<span class="sav-tag ' + t + '">' + (TYPE_LBL[t] || t) + '</span>' : ''; }

    autocomplete($('f-compagnie'), $('ac-clients'), function () { return REF.clients; },
        function (c) { return esc(c[0]) + '<small>' + esc([c[1], c[2]].filter(Boolean).join(', ')) + '</small>' + tagType(c[3]); },
        function (c) {
            clientChoisi = c;
            if (c) {
                $('f-compagnie').value = c[0];
                if (c[1] && !$('f-lieu').value) $('f-lieu').value = c[1] + (c[2] ? ', ' + c[2] : '');
                var r = document.querySelector('input[name="f-type"][value="' + c[3] + '"]');
                if (r) { r.checked = true; majType(); }
            }
            majClientTag();
        },
        { nouveau: function (v) { return v.trim() ? '« ' + v.trim() + ' » — nouveau client (pas dans Epicor)' : ''; } });
    $('f-compagnie').addEventListener('input', function () {
        if (clientChoisi && $('f-compagnie').value !== clientChoisi[0]) { clientChoisi = null; majClientTag(); }
    });
    // Contacts Epicor du client choisi : proposes, jamais remplis seuls (decision Jacquot,
    // 2026-09-29 — la plupart des contacts Epicor sont ceux de la facturation, ecartes a
    // la publication ; ne restent que les vraies personnes).
    function majContacts() {
        var l = clientChoisi ? (REF.contacts[clientChoisi[0]] || []) : [];
        $('w-contacts').style.display = l.length ? '' : 'none';
        $('f-contacts').innerHTML = l.map(function (c, i) {
            return '<button type="button" data-i="' + i + '"><b>' + esc(c[0] || '(sans nom)') + '</b>' + (c[1] ? ' — ' + esc(c[1]) : '') +
                '<small>' + esc([c[2], c[3]].filter(Boolean).join(' · ')) + '</small></button>';
        }).join('');
        [].forEach.call($('f-contacts').querySelectorAll('button'), function (b) {
            b.addEventListener('click', function () {
                var c = l[+b.getAttribute('data-i')];
                $('f-contact').value = c[0] || ''; $('f-tel').value = c[2] || ''; $('f-courriel').value = c[3] || '';
                [].forEach.call($('f-contacts').querySelectorAll('button'), function (x) { x.classList.toggle('on', x === b); });
            });
        });
    }
    function majClientTag() {
        majContacts();
        var v = $('f-compagnie').value.trim();
        $('f-type-tag').innerHTML = clientChoisi ? tagType(clientChoisi[3]) || '<span class="sav-tag interco">Epicor</span>'
            : (v ? '<span class="sav-tag nouveau">nouveau client</span>' : '');
    }

    function majType() {
        var t = (document.querySelector('input[name="f-type"]:checked') || {}).value;
        $('w-final').style.display = t === 'dealer' ? '' : 'none';
    }
    document.querySelectorAll('input[name="f-type"]').forEach(function (r) { r.addEventListener('change', majType); });

    // ---------- pieces ----------
    function lignePiece() {
        var row = document.createElement('div');
        row.className = 'sav-pieces-row';
        row.innerHTML = '<div class="sav-f sav-ac"><input type="text" class="p-pn" placeholder="Numéro ou description…"><div class="sav-ac-list"></div></div>' +
            '<div class="sav-f"><input type="number" class="p-qte" min="1" value="1" title="Quantité"></div>' +
            '<button type="button" class="sav-btn x" title="Retirer">✕</button>';
        $('f-pieces').appendChild(row);
        var inp = row.querySelector('.p-pn');
        autocomplete(inp, row.querySelector('.sav-ac-list'), function () { return REF.pieces; },
            function (p) { return '<b>' + esc(p[0]) + '</b><small>' + esc(p[1]) + '</small>'; },
            function (p) { if (p) { inp.value = p[0] + ' — ' + p[1]; inp.dataset.pn = p[0]; } suggerer(); },
            { min: 2 });
        inp.addEventListener('input', function () { delete inp.dataset.pn; suggerer(); });
        row.querySelector('button').addEventListener('click', function () { row.remove(); suggerer(); });
        return row;
    }
    $('b-piece').addEventListener('click', function () { lignePiece().querySelector('.p-pn').focus(); });
    function pieces() {
        return [].map.call(document.querySelectorAll('#f-pieces .sav-pieces-row'), function (r) {
            return { txt: r.querySelector('.p-pn').value.trim(), qte: r.querySelector('.p-qte').value || '1' };
        }).filter(function (p) { return p.txt; });
    }

    // ---------- routage : suggestion d'apres les regles de Mathieu ----------
    var val = function (n) { return (document.querySelector('input[name="' + n + '"]:checked') || {}).value || ''; };
    function suggestion() {
        if (val('f-arret') === 'oui' || val('f-bypass') === 'oui') return 'mathieu';
        if (val('f-fact') === 'oui') return 'compta';
        if (val('f-depl') === 'oui') return 'luna';
        if (pieces().length) return 'steve';
        return 'mathieu';                 // technique, calibration : meme journee
    }
    function dessinerRoutage() {
        $('f-routage').innerHTML = REF.routage.filter(function (r) { return r.cle !== 'kevin' || REF.routage.length; }).map(function (r) {
            var off = !r.courriel;
            return '<label class="' + (off ? 'off' : '') + '" data-cle="' + esc(r.cle) + '"><input type="radio" name="f-routage" value="' + esc(r.cle) + '"' + (off ? ' disabled' : '') + '>' +
                '<span><b>' + esc(r.nom) + '</b><b class="s"></b></span><small>' + esc(r.regle) + (off ? ' — <i>courriel à compléter</i>' : '') + '</small></label>';
        }).join('');
        document.querySelectorAll('input[name="f-routage"]').forEach(function (r) {
            r.addEventListener('change', function () { routageManuel = true; marquerSugg(); });
        });
        $('f-cc').textContent = REF.cc.length ? REF.cc.join(', ') : '—';
    }
    // Personne suggeree sans courriel (a completer dans sav-reglages.json) : repli sur
    // le directeur de service, et la page le dit.
    function suggestionEffective() {
        var s = suggestion();
        var r = REF.routage.filter(function (x) { return x.cle === s; })[0];
        if (r && !r.courriel) {
            var k = REF.routage.filter(function (x) { return x.cle === 'kevin' && x.courriel; })[0];
            if (k) return { cle: 'kevin', note: r.nom + ' n’a pas encore de courriel : la demande part à ' + k.nom + '.' };
        }
        return { cle: s, note: '' };
    }
    function marquerSugg() {
        var se = suggestionEffective(), s = se.cle;
        $('f-routage-hint').textContent = se.note || 'La suggestion suit les règles ci-dessus ; vous pouvez choisir quelqu’un d’autre.';
        document.querySelectorAll('#f-routage label').forEach(function (l) {
            var on = l.getAttribute('data-cle') === s;
            l.classList.toggle('sugg', on);
            l.querySelector('b.s').textContent = on ? 'suggéré' : '';
        });
        if (!routageManuel) {
            var r = document.querySelector('input[name="f-routage"][value="' + s + '"]');
            if (r && !r.disabled) r.checked = true;
        }
    }
    function suggerer() { marquerSugg(); }
    ['f-arret', 'f-bypass', 'f-depl', 'f-fact'].forEach(function (n) {
        document.querySelectorAll('input[name="' + n + '"]').forEach(function (r) { r.addEventListener('change', suggerer); });
    });

    // ---------- fiche texte ----------
    function fiche() {
        var L = [], ajoute = function (k, v) { if (v) L.push(k + ' : ' + v); };
        var rt = REF.routage.filter(function (r) { return r.cle === val('f-routage'); })[0];
        var dt = $('f-date').value ? $('f-date').value.replace('T', ' ') : '';
        L.push('DEMANDE DE SERVICE APRÈS-VENTE — e-Trak');
        L.push('');
        L.push('1. APPEL'); ajoute('Date/heure', dt); ajoute('Reçu par', $('f-recu').value); ajoute('N° de billet', $('f-billet').value);
        L.push(''); L.push('2. CLIENT');
        ajoute('Compagnie', $('f-compagnie').value + (clientChoisi ? '' : ' (nouveau client, pas dans Epicor)'));
        ajoute('Contact', $('f-contact').value); ajoute('Téléphone', $('f-tel').value); ajoute('Courriel', $('f-courriel').value);
        ajoute('Type de client', ({ dealer: 'Dealer', direct: 'Client direct' })[val('f-type')] || '');
        if (val('f-type') === 'dealer') ajoute('Client final', $('f-final').value);
        L.push(''); L.push('3. MACHINE ET SYSTÈME');
        ajoute('Produit', [].map.call(document.querySelectorAll('#f-produits input:checked'), function (c) { return c.value; }).join(', '));
        ajoute('Machine', $('f-machine').value); ajoute('N° série système', $('f-serie').value); ajoute('Lieu', $('f-lieu').value);
        L.push(''); L.push('4. PROBLÈME');
        ajoute('Machine arrêtée', val('f-arret').toUpperCase()); ajoute('Demande de bypass', val('f-bypass').toUpperCase());
        ajoute('Code / message écran', $('f-code').value);
        L.push('Description (mots du client) :'); L.push($('f-desc').value.trim());
        var p = pieces();
        if (p.length) { L.push('Pièces demandées :'); p.forEach(function (x) { L.push('  - ' + x.qte + ' × ' + x.txt); }); }
        ajoute('Déplacement technicien', ({ oui: 'OUI', non: 'Non', '?': 'À valider' })[val('f-depl')] || '');
        ajoute('Facturation / compte', val('f-fact') === 'oui' ? 'OUI' : '');
        L.push(''); L.push('5. ROUTAGE');
        ajoute('Assigné à', rt ? rt.nom : ''); ajoute('Rappel promis', $('f-rappel').value);
        if ($('f-action').value.trim() || val('f-res') || $('f-ferme-le').value) {
            L.push(''); L.push('6. SUIVI');
            if ($('f-action').value.trim()) { L.push('Action prise :'); L.push($('f-action').value.trim()); }
            ajoute('Résultat', val('f-res')); ajoute('Fermé le', $('f-ferme-le').value); ajoute('Fermé par', $('f-ferme-par').value);
        }
        return L.join('\n');
    }
    function sujet() {
        var urg = (val('f-arret') === 'oui' || val('f-bypass') === 'oui') ? 'URGENT — ' : '';
        var prod = [].map.call(document.querySelectorAll('#f-produits input:checked'), function (c) { return c.value; }).join('/');
        return 'SAV — ' + urg + ($('f-compagnie').value.trim() || 'client') + (prod ? ' — ' + prod : '');
    }

    // ---------- validation ----------
    function valider() {
        var manque = [];
        var marque = function (id, ko, nom) { $(id).classList.toggle('err', ko); if (ko) manque.push(nom); };
        marque('w-compagnie', !$('f-compagnie').value.trim(), 'compagnie');
        marque('w-contact', !$('f-contact').value.trim(), 'nom du contact');
        marque('w-tel', !$('f-tel').value.trim() && !$('f-courriel').value.trim(), 'téléphone (ou courriel)');
        marque('w-type', !val('f-type'), 'type de client');
        marque('w-produit', !document.querySelector('#f-produits input:checked'), 'produit');
        marque('w-arret', !val('f-arret'), 'machine arrêtée ?');
        marque('w-bypass', !val('f-bypass'), 'demande de bypass ?');
        marque('w-desc', !$('f-desc').value.trim(), 'description');
        marque('w-routage', !val('f-routage'), 'routage');
        var a = $('sav-alert');
        a.style.display = manque.length ? 'block' : 'none';
        a.textContent = manque.length ? 'À compléter avant l’envoi : ' + manque.join(', ') + '.' : '';
        return !manque.length;
    }

    function copier(txt) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
        var t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e) {} t.remove();
        return Promise.resolve();
    }
    function ok(msg) { var o = $('sav-ok'); o.textContent = msg; o.style.display = 'block'; setTimeout(function () { o.style.display = 'none'; }, 6000); }

    $('b-envoyer').addEventListener('click', function () {
        if (!valider()) return;
        var rt = REF.routage.filter(function (r) { return r.cle === val('f-routage'); })[0];
        var txt = fiche();
        var cc = REF.cc.filter(function (x) { return x && x !== rt.courriel; });
        var corps = txt;
        // Outlook et Windows tronquent un lien mailto trop long : au-dela, la fiche
        // complete part dans le presse-papiers et le courriel dit de la coller.
        // Adresses en clair (Outlook decode mal « %40 ») et copies separees par des virgules.
        var url = function (b) { return 'mailto:' + rt.courriel + '?subject=' + encodeURIComponent(sujet()) +
            (cc.length ? '&cc=' + cc.join(',') : '') + '&body=' + encodeURIComponent(b); };
        copier(txt).then(function () {}, function () {});
        if (url(corps).length > 1900) {
            corps = 'La fiche complète est dans votre presse-papiers : collez-la ici (Ctrl+V).\n\n' + sujet();
            ok('Fiche copiée dans le presse-papiers : collez-la dans le courriel (Ctrl+V).');
        } else {
            ok('Courriel ouvert dans Outlook. La fiche est aussi dans le presse-papiers.');
        }
        (window.__savMailto || function (u) { window.location.href = u; })(url(corps));
    });
    $('b-copier').addEventListener('click', function () { copier(fiche()).then(function () { ok('Fiche copiée dans le presse-papiers.'); }); });
    $('b-nouveau').addEventListener('click', function () {
        if (!confirm('Effacer la fiche et commencer une nouvelle demande ?')) return;
        $('sav-form').reset(); $('f-pieces').innerHTML = ''; clientChoisi = null; routageManuel = false;
        document.querySelectorAll('.sav-f.err').forEach(function (e) { e.classList.remove('err'); });
        $('sav-alert').style.display = 'none';
        init();
    });

    function init() {
        var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        $('f-date').value = d.toISOString().slice(0, 16);
        $('f-recu').value = user.name || user.email || '';
        majClientTag(); majType(); marquerSugg();
    }

    function charger() {
        fetch(window.PORTAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'getsav', token: user.token }) })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d && d.error === 'forbidden') { refuser(); return; }
                if (!d || !d.ok || !d.sav) {
                    $('sav-load').textContent = (d && d.error === 'forbidden') ? 'La demande SAV est réservée aux comptes internes.'
                        : (d && d.ok && !d.sav) ? 'Les listes clients et pièces ne sont pas encore publiées : la fiche fonctionne, sans recherche.'
                        : 'Listes indisponibles pour le moment : la fiche fonctionne, sans recherche.';
                    return;
                }
                REF = { clients: d.sav.clients || [], pieces: d.sav.pieces || [], produits: d.sav.produits || [],
                        routage: d.sav.routage || [], cc: d.sav.cc || [], contacts: d.sav.contacts || {} };
                var up = d.sav.updated ? new Date(d.sav.updated) : null;
                $('sav-load').textContent = REF.clients.length + ' clients et ' + REF.pieces.length + ' pièces'
                    + (up && !isNaN(up) ? ' · listes au ' + up.toLocaleDateString('fr-CA') : '');
                $('f-produits').innerHTML = REF.produits.map(function (p) {
                    return '<label><input type="checkbox" value="' + esc(p) + '"> ' + esc(p) + '</label>'; }).join('');
                dessinerRoutage(); marquerSugg();
            })
            .catch(function () { $('sav-load').textContent = 'Listes indisponibles pour le moment : la fiche fonctionne, sans recherche.'; });
    }
    // Sans liste publiee, le routage et les produits restent vides : valeurs de repli
    // (les courriels ne sont jamais ecrits ici — ils viennent du serveur).
    REF.produits = ['LIMIT-ELG', 'LIMIT-ELN', 'LIMIT-ELP', 'Guide-Pro', 'IDC', 'Scale-Pro / Lite', 'Autre'];
    $('f-produits').innerHTML = REF.produits.map(function (p) { return '<label><input type="checkbox" value="' + esc(p) + '"> ' + esc(p) + '</label>'; }).join('');
    init();
    charger();
})();
