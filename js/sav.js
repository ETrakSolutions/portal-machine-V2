// Demande de service apres-vente (decision Jacquot, 2026-09-29).
// Guide d'appel pour toute l'equipe interne : RIEN n'est enregistre. L'envoi ouvre un
// courriel Outlook pre-rempli vers Kevin et Luna (+ les copies des reglages).
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

    // Changement de client (Steve, 2026-10-07) : le contact, les telephones, le courriel, le
    // type de client, le client final, le lieu, l'adresse et le nombre de machines (section 3)
    // du client precedent ne doivent pas rester. On vide
    // quand le client reconnu change (A -> B, ou A -> nom tape d'un nouveau client), AVANT
    // d'appliquer le type du nouveau client. Le premier choix de client ne vide rien.
    var clientCle = null;
    function siChangementClient() {
        var cle = clientChoisi ? clientChoisi[0] : null;
        if (cle === clientCle) return;
        var avant = clientCle;
        clientCle = cle;
        if (avant === null) return;
        ['f-contact', 'f-tel', 'f-tel2', 'f-courriel', 'f-final', 'f-lieu', 'f-adresse', 'f-nb']
            .forEach(function (id) { $(id).value = ''; });
        document.querySelectorAll('input[name="f-type"]').forEach(function (r) { r.checked = false; });
        majType();
    }

    function adopterClient(c) {
        clientChoisi = c;
        siChangementClient();
        if (c) {
            $('f-compagnie').value = c[0];
            // Le lieu n'est PLUS pre-rempli par la ville du client (Steve, 2026-10-07) : beaucoup
            // de clients appellent d'un chantier ailleurs. Il se demande pendant l'appel.
            var r = document.querySelector('input[name="f-type"][value="' + c[3] + '"]');
            if (r) { r.checked = true; majType(); }
        }
        majClientTag();
    }
    autocomplete($('f-compagnie'), $('ac-clients'), function () { return REF.clients; },
        function (c) { return esc(c[0]) + '<small>' + esc([c[1], c[2]].filter(Boolean).join(', ')) + '</small>' + tagType(c[3]); },
        adopterClient,
        { nouveau: function (v) { return v.trim() ? '« ' + v.trim() + ' » — nouveau client (pas dans Epicor)' : ''; } });
    // Nom tape (ou colle) au complet sans cliquer dans la liste : s'il correspond a UN seul
    // client Epicor (casse et accents ignores), il est traite comme choisi — sinon ses
    // contacts n'apparaissaient jamais (constate par Jacquot le 2026-09-30).
    $('f-compagnie').addEventListener('input', function () {
        var v = $('f-compagnie').value;
        if (clientChoisi && v !== clientChoisi[0]) { clientChoisi = null; siChangementClient(); majClientTag(); }
        if (!clientChoisi) {
            var q = norm(v).trim();
            var m = q ? REF.clients.filter(function (c) { return norm(c[0]).trim() === q; }) : [];
            if (m.length === 1) {
                clientChoisi = m[0];
                siChangementClient();
                var r = document.querySelector('input[name="f-type"][value="' + m[0][3] + '"]');
                if (r && !val('f-type')) { r.checked = true; majType(); }
            }
            majClientTag();
        }
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
            function (p) { if (p) { inp.value = p[0] + ' — ' + p[1]; inp.dataset.pn = p[0]; } },
            { min: 2 });
        inp.addEventListener('input', function () { delete inp.dataset.pn; });
        row.querySelector('button').addEventListener('click', function () { row.remove(); });
        return row;
    }
    $('b-piece').addEventListener('click', function () { lignePiece().querySelector('.p-pn').focus(); });
    function pieces() {
        return [].map.call(document.querySelectorAll('#f-pieces .sav-pieces-row'), function (r) {
            return { txt: r.querySelector('.p-pn').value.trim(), qte: r.querySelector('.p-qte').value || '1' };
        }).filter(function (p) { return p.txt; });
    }

    // ---------- destinataires : toujours Kevin et Luna (decision Jacquot, 2026-09-30) ----------
    // Le routage par regles (section 5) et le suivi (section 6) sont retires. Les adresses
    // viennent du serveur (sav-reglages.json), jamais ecrites ici ; les copies restent celles
    // des reglages, moins les destinataires.
    var DEST_CLES = ['kevin', 'luna'];
    var val = function (n) { return (document.querySelector('input[name="' + n + '"]:checked') || {}).value || ''; };
    function destinataires() {
        return DEST_CLES.map(function (k) { return REF.routage.filter(function (r) { return r.cle === k && r.courriel; })[0]; })
            .filter(Boolean);
    }
    function dessinerDest() {
        var d = destinataires();
        $('f-dest').textContent = d.length ? 'Le courriel part à : ' + d.map(function (r) { return r.nom; }).join(' et ') + '.'
            : 'Destinataires indisponibles (listes non chargées) : utilisez « Copier la fiche ».';
    }

    // ---------- technicien a prevoir (Steve, 2026-10-27) ----------
    // Deplacement « Oui » : deux menus obligatoires, l'exigence (obligatoire, prioritaire,
    // n'importe lequel) et le nom. Les noms viennent de ProgressionLive par la meme action
    // que la Cedule (getcedule) ; « Pierre ou Michel » est toujours ajoute a la fin.
    // « N'importe quel technicien » n'exige pas de nom : le menu des noms est alors grise.
    var TECH_EXIG = { obligatoire: 'Technicien obligatoire', prioritaire: 'Technicien prioritaire', tous: "N'importe quel technicien" };
    var TECH_DUO = 'Pierre ou Michel';
    function dessinerTechs(noms, note) {
        var choix = $('f-tech-nom').value;
        $('f-tech-nom').innerHTML = '<option value="">— Technicien —</option>' +
            noms.concat([TECH_DUO]).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
        $('f-tech-nom').value = choix;
        if (note) $('f-tech-hint').textContent = note;
    }
    function chargerTechs() {
        fetch(window.PORTAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'getcedule', token: user.token }) })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var techs = d && d.ok && d.cedule && d.cedule.techs;
                if (!techs || !techs.length) { dessinerTechs([], 'Liste des techniciens indisponible : seul « ' + TECH_DUO + ' » est proposé.'); return; }
                // « Jean Mallet (limiteur ...) » -> « Jean Mallet », comme sur la Cedule.
                dessinerTechs(techs.map(function (t) { return String(t.nom).replace(/\s*\(.*\)\s*$/, ''); }));
            })
            .catch(function () { dessinerTechs([], 'Liste des techniciens indisponible : seul « ' + TECH_DUO + ' » est proposé.'); });
    }
    function majDepl() {
        var oui = val('f-depl') === 'oui';
        $('w-tech').style.display = oui ? '' : 'none';
        if (!oui) { $('f-tech-exig').value = ''; $('f-tech-nom').value = ''; $('f-tech-temps').value = ''; }
        var tous = $('f-tech-exig').value === 'tous';
        if (tous) $('f-tech-nom').value = '';
        $('f-tech-nom').disabled = tous;
    }
    document.querySelectorAll('input[name="f-depl"]').forEach(function (r) { r.addEventListener('change', majDepl); });
    $('f-tech-exig').addEventListener('change', majDepl);
    function techTexte() {
        var e = $('f-tech-exig').value;
        if (val('f-depl') !== 'oui' || !e) return '';
        return TECH_EXIG[e] + (e !== 'tous' && $('f-tech-nom').value ? ' : ' + $('f-tech-nom').value : '');
    }

    // ---------- fiche texte ----------
    // Mise en page refaite le 2026-10-27 pour Luna, qui recevait avant une fiche a quatre
    // sections numerotees et trouvait la panne trop loin. Trois regles tiennent la fiche :
    //   1. Ce qui sert a trier un appel — qui, quel produit, urgence — tient dans les quatre
    //      premieres lignes ; l'administratif (date, recu par, billet) descend a la fin.
    //   2. Les trois oui/non partagent UNE ligne au lieu de trois. Un « non » se lit encore,
    //      il ne coute juste plus une ligne a lui seul.
    //   3. Une section vide ne s'imprime pas DU TOUT, titre compris : pas de ligne « Machine :
    //      ? » ni de titre orphelin.
    function fiche() {
        var L = [];
        var txt = function (id) { return ($(id).value || '').trim(); };
        var joint = function (parts) { return parts.filter(Boolean).join(' · '); };
        var bloc = function (titre, contenu) {
            var lignes = [].concat(contenu || []).filter(Boolean);
            if (!lignes.length) return;
            L.push(''); L.push(titre);
            lignes.forEach(function (x) { L.push(x); });
        };
        // Un « oui » crie, un « non » murmure : c'est l'urgence qui doit sauter aux yeux.
        var ON = function (v) { return v === 'oui' ? 'OUI' : v; };

        L.push('DEMANDE DE SERVICE — e-Trak');
        L.push('');

        // En-tete : une phrase, comme le courriel que Luna recevait avant.
        var coord = joint([txt('f-tel'), txt('f-tel2'), txt('f-courriel')]);
        L.push('Demande de ' + (txt('f-contact') || 'un client')
            + (coord ? ' (' + coord + ')' : '')
            + ' chez ' + (txt('f-compagnie') || 'client à identifier')
            + (clientChoisi ? '' : ' — nouveau client, pas dans Epicor'));

        var prod = produitsCoches().join(', ');
        var nb = txt('f-nb');
        if (prod || nb) L.push(joint(['Produit : ' + (prod || 'à préciser'),
            nb ? nb + ' machines touchées' : '']));
        var mach = joint([txt('f-machine'), txt('f-serie') ? 'n° série ' + txt('f-serie') : '']);
        if (mach) L.push('Machine : ' + mach);

        var DEPL = { oui: 'OUI', non: 'non', '?': 'à valider' };
        L.push(joint([
            val('f-arret') ? 'Arrêt machine : ' + ON(val('f-arret')) : '',
            val('f-bypass') ? 'bypass : ' + ON(val('f-bypass')) : '',
            val('f-depl') ? 'déplacement technicien : ' + DEPL[val('f-depl')] : '']));
        if (val('f-fact') === 'oui') L.push('Question de facturation, compte ou paiement : OUI');

        bloc('PROBLÈME', [txt('f-code') ? 'Code / message à l’écran : ' + txt('f-code') : '',
            txt('f-desc')]);
        bloc('DIAGNOSTIC PRÉLIMINAIRE', txt('f-diag'));
        bloc('PIÈCES À PRÉVOIR', txt('f-prevoir'));
        bloc('PIÈCES DEMANDÉES', pieces().map(function (x) { return '  - ' + x.qte + ' × ' + x.txt; }));
        // L'adresse d'abord : c'est avec elle que le technicien part sur la route.
        bloc('EMPLACEMENT', [txt('f-adresse'), txt('f-lieu')]);
        if (val('f-depl') === 'oui') {
            bloc('TECHNICIEN', joint([techTexte(),
                txt('f-tech-temps') ? 'temps prévu : ' + txt('f-tech-temps') : '']));
        }
        var dt = $('f-date').value ? $('f-date').value.replace('T', ' ') : '';
        bloc('APPEL', [
            joint([dt, txt('f-recu') ? 'reçu par ' + txt('f-recu') : '',
                txt('f-billet') ? 'billet ' + txt('f-billet') : '']),
            joint([({ dealer: 'Dealer', direct: 'Client direct' })[val('f-type')] || '',
                val('f-type') === 'dealer' && txt('f-final') ? 'client final : ' + txt('f-final') : ''])]);
        return L.join('\n');
    }
    // Cases « Produit ». Cocher « Autre » fait apparaitre un champ de precision, obligatoire
    // et repris dans le courriel (Steve, 2026-10-07) ; decocher le cache et le vide.
    function dessinerProduits() {
        $('f-produits').innerHTML = REF.produits.map(function (p) {
            return '<label' + (p === 'Autre' ? ' class="p-autre"' : '') + '><input type="checkbox" value="' + esc(p) + '"> ' + esc(p) + '</label>'; }).join('');
        // « Autre » toujours en bas de la 3e colonne (Steve, 2026-10-07).
        // 3 colonnes remplies de haut en bas, dans l'ordre de la liste (Steve, 2026-10-07).
        $('f-produits').style.setProperty('--lignes', Math.max(1, Math.ceil(REF.produits.length / 3)));
        majAutre();
    }
    function autreCoche() { return !!document.querySelector('#f-produits input[value="Autre"]:checked'); }
    function majAutre() {
        var oui = autreCoche();
        $('w-autre').style.display = oui ? '' : 'none';
        if (!oui) $('f-autre').value = '';
    }
    $('f-produits').addEventListener('change', majAutre);
    function produitsCoches() {
        return [].map.call(document.querySelectorAll('#f-produits input:checked'), function (c) {
            return c.value === 'Autre' && $('f-autre').value.trim() ? 'Autre : ' + $('f-autre').value.trim() : c.value; });
    }

    function sujet() {
        var urg = (val('f-arret') === 'oui' || val('f-bypass') === 'oui') ? 'URGENT — ' : '';
        var prod = produitsCoches().join(' / ');
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
        marque('w-autre', autreCoche() && !$('f-autre').value.trim(), 'précision du produit « Autre »');
        marque('w-arret', !val('f-arret'), 'machine arrêtée ?');
        marque('w-bypass', !val('f-bypass'), 'demande de bypass ?');
        marque('w-desc', !$('f-desc').value.trim(), 'description');
        var depl = val('f-depl') === 'oui', exig = $('f-tech-exig').value;
        marque('w-tech', depl && (!exig || (exig !== 'tous' && !$('f-tech-nom').value)),
            !exig ? 'type de technicien (obligatoire, prioritaire…)' : 'nom du technicien');
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
        var dest = destinataires().map(function (r) { return r.courriel; });
        if (!dest.length) { ok('Destinataires indisponibles : utilisez « Copier la fiche ».'); return; }
        var txt = fiche();
        var cc = REF.cc.filter(function (x) { return x && dest.indexOf(x) < 0; });
        var corps = txt;
        // Outlook et Windows tronquent un lien mailto trop long : au-dela, la fiche
        // complete part dans le presse-papiers et le courriel dit de la coller.
        // Adresses en clair (Outlook decode mal « %40 ») et copies separees par des virgules.
        var url = function (b) { return 'mailto:' + dest.join(',') + '?subject=' + encodeURIComponent(sujet()) +
            (cc.length ? '&cc=' + cc.join(',') : '') + '&body=' + encodeURIComponent(b); };
        copier(txt).then(function () {}, function () {});
        modifiee = false;
        if (url(corps).length > 1900) {
            corps = 'La fiche complète est dans votre presse-papiers : collez-la ici (Ctrl+V).\n\n' + sujet();
            ok('Fiche copiée dans le presse-papiers : collez-la dans le courriel (Ctrl+V).');
        } else {
            ok('Courriel ouvert dans Outlook. La fiche est aussi dans le presse-papiers.');
        }
        (window.__savMailto || function (u) { window.location.href = u; })(url(corps));
        demanderFermeture();
    });

    // Apres l'envoi, la demande se ferme (Steve, 2026-10-14) : des que le courriel est ouvert,
    // une fenetre demande « Retour a l'accueil ? ». Oui : retour au hub, la fiche n'est pas
    // gardee. Non : on reste sur la fiche (pour corriger et renvoyer, par exemple).
    function demanderFermeture() {
        var ancien = $('sav-fin'); if (ancien) ancien.remove();
        var v = document.createElement('div');
        v.id = 'sav-fin'; v.className = 'sav-fin';
        v.innerHTML = '<div class="sav-fin-boite" role="dialog" aria-modal="true" aria-labelledby="sav-fin-titre">' +
            '<h3 id="sav-fin-titre">Retour à l’accueil ?</h3>' +
            '<p>Le courriel de la demande est ouvert dans Outlook : envoyez-le, puis fermez la demande.</p>' +
            '<div class="sav-fin-btns">' +
            '<button type="button" class="sav-btn" id="b-fin-non">Non, rester sur la demande</button>' +
            '<button type="button" class="sav-btn main" id="b-fin-oui">Oui, retour à l’accueil</button>' +
            '</div></div>';
        document.body.appendChild(v);
        $('b-fin-oui').addEventListener('click', function () {
            (window.__savAccueil || function () { window.location.href = 'index.html'; })();
        });
        $('b-fin-non').addEventListener('click', function () { v.remove(); });
        $('b-fin-oui').focus();
    }
    // Avertissement avant de quitter une fiche commencee (Steve, 2026-10-27).
    // « Modifiee » = un champ touche depuis l'ouverture ou depuis « Nouvelle demande » ; la
    // date et « Recu par », remplis seuls, ne comptent pas. L'envoi par courriel remet a zero
    // (l'ouverture du lien mailto ne doit pas declencher l'avertissement, et « Oui, retour a
    // l'accueil » non plus). Liens du portail (Retour, logo) : fenetre du portail. Fermeture
    // de l'onglet ou actualisation : avertissement du navigateur (son texte ne se change pas).
    var modifiee = false;
    $('sav-form').addEventListener('input', function () { modifiee = true; });
    $('sav-form').addEventListener('change', function () { modifiee = true; });
    $('f-contacts').addEventListener('click', function () { modifiee = true; });
    window.__savModifiee = function () { return modifiee; };
    window.addEventListener('beforeunload', function (e) {
        if (!modifiee) return;
        e.preventDefault(); e.returnValue = ''; return '';
    });
    function confirmerQuitter(aller) {
        var ancien = $('sav-quitter'); if (ancien) ancien.remove();
        var v = document.createElement('div');
        v.id = 'sav-quitter'; v.className = 'sav-fin';
        v.innerHTML = '<div class="sav-fin-boite" role="dialog" aria-modal="true" aria-labelledby="sav-quitter-titre">' +
            '<h3 id="sav-quitter-titre">Voulez-vous vraiment quitter ?</h3>' +
            '<p>La demande est commencée mais n’a pas été envoyée : ce qui est rempli sera perdu.</p>' +
            '<div class="sav-fin-btns">' +
            '<button type="button" class="sav-btn" id="b-quitter-oui">Quitter sans envoyer</button>' +
            '<button type="button" class="sav-btn main" id="b-quitter-non">Rester sur la demande</button>' +
            '</div></div>';
        document.body.appendChild(v);
        $('b-quitter-non').addEventListener('click', function () { v.remove(); });
        $('b-quitter-oui').addEventListener('click', function () { modifiee = false; v.remove(); aller(); });
        $('b-quitter-non').focus();
    }
    document.addEventListener('click', function (e) {
        var a = e.target.closest('a[href]');
        if (!a || !modifiee || a.target === '_blank' || /^(mailto|tel):|^#/.test(a.getAttribute('href'))) return;
        e.preventDefault();
        confirmerQuitter(function () { (window.__savAller || function (u) { window.location.href = u; })(a.href); });
    }, true);

    $('b-copier').addEventListener('click', function () { copier(fiche()).then(function () { ok('Fiche copiée dans le presse-papiers.'); }); });
    $('b-nouveau').addEventListener('click', function () {
        if (!confirm('Effacer la fiche et commencer une nouvelle demande ?')) return;
        $('sav-form').reset(); $('f-pieces').innerHTML = ''; clientChoisi = null;
        document.querySelectorAll('.sav-f.err').forEach(function (e) { e.classList.remove('err'); });
        $('sav-alert').style.display = 'none';
        init();
        modifiee = false;
    });

    function init() {
        var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        $('f-date').value = d.toISOString().slice(0, 16);
        $('f-recu').value = user.name || user.email || '';
        majClientTag(); majType(); majDepl(); dessinerDest();
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
                dessinerProduits();
                dessinerDest();
            })
            .catch(function () { $('sav-load').textContent = 'Listes indisponibles pour le moment : la fiche fonctionne, sans recherche.'; });
    }
    // Sans liste publiee, les destinataires et les produits restent vides : valeurs de repli
    // (les courriels ne sont jamais ecrits ici — ils viennent du serveur).
    // Meme liste que sav-reglages.json (Steve, 2026-10-07).
    REF.produits = ["Limiteur d'excavatrice (LPE)", 'Creusage 2D (Guide-Pro GP)', 'Indicateur de charge (IDC)', 'Limiteur de rétrocaveuse',
                    'Limiteur de pompe à béton (LPB)', 'Limiteur de téléhandler (LPT)', 'Limiteur de camion girafe', 'Limiteur de camion Vac',
                    'Limiteur de nacelle', 'Limiteur de grue', 'Limiteur de foreuse', 'Balance (Scale-Pro / Lite)', 'Caméras', 'Autre'];
    dessinerProduits();
    dessinerTechs([]);
    init();
    charger();
    chargerTechs();
})();
