// Base de diagnostic SAV (decision Steve, 2026-10-13) : pannes connues -> causes ->
// solutions, remplie depuis le portail par l'equipe interne (techniciens compris).
// Interne seulement. Une fiche d'un non-validateur reste en BROUILLON jusqu'a sa
// validation (case « Valider diag », defaut administrateur et ingenierie). Le serveur
// (actions getdiag / savediag / validediag / deletediag) tranche tout : les boutons
// masques ici ne sont qu'un confort d'affichage.
// Bilingue (Steve, 2026-10-21) : la page suit le FR/EN du portail (techniciens de Val-trak) ;
// on ecrit une fiche dans SA langue, le serveur traduit vers l'autre ; le validateur revise ;
// pas de validation tant qu'il manque une des deux langues.
(function () {
    'use strict';
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    function refuser() {
        document.getElementById('dg-root').style.display = 'none';
        document.getElementById('dg-denied').style.display = 'block';
    }
    if (!user || user.isGuest || !user.token || (window.portalRoleLocked && window.portalRoleLocked(user.role, 'savAccess'))) {
        refuser();
        return;
    }
    document.getElementById('dg-root').style.display = 'block';

    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    // Texte traduit (translations.js, cles diag.*) ; {x} remplace par vars.x.
    function T(cle, defaut, vars) {
        var v = defaut;
        try { if (window.i18n && i18n.t) { var r = i18n.t(cle); if (r && r !== cle) v = r; } } catch (e) {}
        if (vars) Object.keys(vars).forEach(function (k) { v = v.split('{' + k + '}').join(vars[k]); });
        return v;
    }
    function enAnglais() {
        try { if (window.i18n && i18n.getLang) return i18n.getLang() === 'en'; } catch (e) {}
        try { return localStorage.getItem('portal_lang') === 'en'; } catch (e) { return false; }
    }
    // Meme liste que la demande SAV (sav-reglages.json), si le serveur ne la renvoie pas.
    var PRODUITS_REPLI = ["Limiteur d'excavatrice (LPE)", 'Creusage 2D (Guide-Pro GP)', 'Indicateur de charge (IDC)', 'Limiteur de rétrocaveuse',
                          'Limiteur de pompe à béton (LPB)', 'Limiteur de téléhandler (LPT)', 'Limiteur de camion girafe', 'Limiteur de camion Vac',
                          'Limiteur de nacelle', 'Limiteur de grue', 'Limiteur de foreuse', 'Balance (Scale-Pro / Lite)', 'Caméras', 'Autre'];
    var ETAT = { fiches: [], produits: PRODUITS_REPLI.slice(), peutValider: false, vue: 'tout', ouvertes: {}, edition: null };

    // Contenu dans la langue de l'ecran, l'autre langue en repli.
    function en(f) { return f.en || { symptome: '', motsCles: '', causes: [] }; }
    function frDe(f, champ, i) { return (i == null ? f[champ] : (f.causes[i] || {})[champ]) || ''; }
    function enDe(f, champ, i) { var e = en(f); return (i == null ? e[champ] : ((e.causes || [])[i] || {})[champ]) || ''; }
    function dans(f, champ, i) { return enAnglais() ? (enDe(f, champ, i) || frDe(f, champ, i)) : (frDe(f, champ, i) || enDe(f, champ, i)); }
    function autre(f, champ, i) { return enAnglais() ? frDe(f, champ, i) : enDe(f, champ, i); }
    function titre(f) { return dans(f, 'symptome'); }

    function api(corps) {
        corps.token = user.token;
        return fetch(window.PORTAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corps) })
            .then(function (r) { return r.json(); });
    }
    function ok(msg) { var o = $('dg-ok'); o.textContent = msg; o.style.display = 'block'; setTimeout(function () { o.style.display = 'none'; }, 6000); }
    function quand(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString(enAnglais() ? 'en-CA' : 'fr-CA') : ''; }
    var ERREURS = {
        'forbidden': ['diag.err_forbidden', 'Action non permise pour votre compte.'],
        'not found': ['diag.err_notfound', 'Cette fiche n\'existe plus (supprimée entre-temps).'],
        'authentication required': ['diag.err_auth', 'Session expirée : reconnectez-vous au portail.'],
        'deja validee': ['diag.err_deja', 'Cette fiche est déjà validée.'],
        'fiche trop longue': ['diag.err_longue', 'Fiche trop longue : raccourcissez les solutions.'],
        'traduction incomplete': ['diag.err_trad_incomplete', 'Traduction incomplète : ouvrez « Modifier », complétez ou corrigez la traduction (français et anglais), enregistrez, puis validez.'],
        'traduction impossible': ['diag.err_trad_impossible', 'Traduction automatique impossible pour le moment : la fiche n\'a pas été modifiée. Réessayez plus tard ou entrez la traduction à la main.']
    };
    function msgErreur(d) {
        var e = (d && d.error) || '';
        return ERREURS[e] ? T(ERREURS[e][0], ERREURS[e][1]) : (T('diag.err_serveur', 'Erreur du serveur') + (e ? ' : ' + e : '') + '.');
    }

    // ---------- liste ----------
    function dessinerProduits() {
        var f = $('f-produit'), v = f.value;
        f.innerHTML = '<option value="">' + esc(T('diag.tous_produits', 'Tous les produits')) + '</option>' + ETAT.produits.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
        f.value = ETAT.produits.indexOf(v) >= 0 ? v : '';
        var e = $('e-produit'), ev = e.value;
        e.innerHTML = '<option value="">' + esc(T('diag.choisir', '— Choisir —')) + '</option>' + ETAT.produits.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
        if (ev) e.value = ev;
    }
    // Recherche par pertinence (Steve, 2026-10-13) : une description dans les mots du client
    // (« la christ de balance pèse pas bien ») ne trouvait rien, car TOUS les mots devaient
    // etre dans la fiche. Maintenant : petits mots ignores, variantes d'un meme mot
    // rapprochees (pèse / peser / pesée), et fiches classees par points — un mot trouve dans
    // le symptome, le code ou les mots-cles compte plus que dans une solution. Les deux
    // langues sont cherchees.
    var VIDES = ('le la les l un une des de du d au aux a et ou ni ne n pas plus que qu qui quoi se s sa son ses ce c ca cela ' +
        'cet cette il ils elle elles on y en est sont etre ai as avons ont avoir fait fais faire tres trop bien mal ' +
        'pour par sur sous dans avec sans chez quand comme mais donc car si tout tous toute toutes rien peu ' +
        'mon ma mes ton ta tes notre nos votre vos leur leurs me te nous vous lui je j tu ' +
        'christ crisse tabarnak tabarnac calice caliss esti ostie hostie maudit maudite sacrament ciboire ' +
        'the an of to and or is are was be it its this that with for at by from not no my our your his her they').split(' ');
    function racine(m) {
        m = m.replace(/(ements|ement|ations|ation|euses|euse|eurs|eur|ees|ee|es|er|ez|ent|ait|ais|ons|ing|ed|e|s|x)$/, '');
        return m.length > 6 ? m.slice(0, 6) : m;
    }
    function racines(txt) {
        return norm(txt).split(/[^a-z0-9]+/).filter(function (m) { return m.length >= 2 && VIDES.indexOf(m) < 0; })
            .map(function (m) { return /\d/.test(m) ? m : racine(m); }).filter(function (m) { return m.length >= 2; });
    }
    function proche(a, b) { return a === b || (a.length >= 3 && b.length >= 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)); }
    function points(f, mots) {
        var e = en(f), ec = e.causes || [];
        var zones = [[racines(f.symptome + ' ' + f.code + ' ' + f.motsCles + ' ' + e.symptome + ' ' + e.motsCles), 3], [racines(f.produit), 2],
                     [racines(f.causes.map(function (c, i) { return c.cause + ' ' + c.pieces + ' ' + ((ec[i] || {}).cause || ''); }).join(' ')), 2],
                     [racines(f.causes.map(function (c, i) { return c.solution + ' ' + ((ec[i] || {}).solution || ''); }).join(' ')), 1]];
        var total = 0;
        mots.forEach(function (m) {
            var meilleur = 0;
            zones.forEach(function (z) { if (meilleur < z[1] && z[0].some(function (x) { return proche(m, x); })) meilleur = z[1]; });
            total += meilleur;
        });
        return total;
    }
    function visibles() {
        var prod = $('f-produit').value, mots = racines($('f-q').value), lang = enAnglais() ? 'en' : 'fr';
        var l = ETAT.fiches.filter(function (f) {
            if (ETAT.vue === 'brouillons' && f.statut !== 'brouillon') return false;
            return !prod || f.produit === prod;
        });
        var ordre = function (a, b) { return a.produit === b.produit ? titre(a).localeCompare(titre(b), lang) : a.produit.localeCompare(b.produit, lang); };
        if (!mots.length) return l.sort(ordre);
        l.forEach(function (f) { f._points = points(f, mots); });
        return l.filter(function (f) { return f._points > 0; })
                .sort(function (a, b) { return b._points - a._points || ordre(a, b); });
    }
    function original(id) { return ETAT.fiches.filter(function (f) { return f.id === id; })[0]; }
    function carte(f) {
        var prop = f.remplace ? original(f.remplace) : null;
        var tags = '<span class="dg-tag prod">' + esc(f.produit) + '</span>' + (f.code ? ' <span class="dg-tag code">' + esc(f.code) + '</span>' : '') +
            (f.statut === 'brouillon' ? ' <span class="dg-tag brouillon">' + esc(f.remplace ? T('diag.tag_proposition', 'Proposition de modification') : T('diag.tag_brouillon', 'Brouillon à valider')) + '</span>' : '') +
            (f.bilingue === false ? ' <span class="dg-tag en-manque">' + esc(T('diag.tag_trad', 'Traduction incomplète')) + '</span>' : '');
        // Validateur, brouillon : l'autre langue sous chaque ligne, pour reviser la traduction.
        var revue = ETAT.peutValider && f.statut === 'brouillon', lAutre = enAnglais() ? 'FR' : 'EN', manque = T('diag.a_traduire', '— à traduire —');
        var ligneAutre = function (txt) { return revue ? '<div class="dg-en"><b>' + lAutre + '</b>' + esc(txt || manque) + '</div>' : ''; };
        var causes = f.causes.map(function (c, i) {
            return '<div class="dg-cause"><h4>' + (i + 1) + '. ' + esc(dans(f, 'cause', i)) + '</h4>' + ligneAutre(autre(f, 'cause', i)) +
                '<div class="dg-sol">' + esc(dans(f, 'solution', i)) + '</div>' + ligneAutre(autre(f, 'solution', i)) +
                (c.pieces ? '<div class="dg-pieces">' + esc(T('diag.pieces', 'Pièces')) + ' : ' + esc(c.pieces) + '</div>' : '') + '</div>';
        }).join('');
        if (revue) causes = ligneAutre(autre(f, 'symptome')) + causes;
        var meta = [f.auteurNom ? T('diag.ecrite_par', 'Écrite par {nom}', { nom: esc(f.auteurNom) }) + (quand(f.creeLe) ? ' ' + T('diag.le', 'le {date}', { date: quand(f.creeLe) }) : '') : '',
                    f.modifieParNom && f.modifieLe !== f.creeLe ? T('diag.modifiee_par', 'modifiée par {nom} le {date}', { nom: esc(f.modifieParNom), date: quand(f.modifieLe) }) : '',
                    f.valideParNom ? T('diag.validee_par', 'validée par {nom} le {date}', { nom: esc(f.valideParNom), date: quand(f.valideLe) }) : ''].filter(Boolean).join(' · ');
        if (f.remplace) meta += '<br>' + T('diag.remplacera', 'Remplacera la fiche validée « {titre} ».', { titre: esc(prop ? titre(prop) : T('diag.introuvable', '(introuvable : deviendra une fiche à part)')) });
        var b = [];
        var auteurBrouillon = f.statut === 'brouillon' && f.mien;
        if (ETAT.peutValider && f.statut === 'brouillon') b.push('<button type="button" class="dg-btn ok" data-act="valider">✓ ' + esc(T('diag.valider', 'Valider')) + '</button>');
        if (ETAT.peutValider || auteurBrouillon) b.push('<button type="button" class="dg-btn" data-act="modifier">' + esc(T('diag.modifier', 'Modifier')) + '</button>');
        else if (f.statut === 'valide') b.push('<button type="button" class="dg-btn" data-act="modifier">' + esc(T('diag.proposer', 'Proposer une modification')) + '</button>');
        if (ETAT.peutValider || auteurBrouillon) b.push('<button type="button" class="dg-btn danger" data-act="supprimer">' + esc(T('diag.supprimer', 'Supprimer')) + '</button>');
        var n = f.causes.length;
        return '<div class="dg-card' + (f.statut === 'brouillon' ? ' brouillon' : '') + (ETAT.ouvertes[f.id] ? ' open' : '') + '" data-id="' + esc(f.id) + '">' +
            '<div class="dg-head"><b>' + esc(titre(f)) + '</b>' + tags + '<span class="dg-nb">' + esc(n > 1 ? T('diag.n_causes', '{n} causes', { n: n }) : T('diag.une_cause', '1 cause')) + '</span></div>' +
            '<div class="dg-body">' + causes + '<div class="dg-meta">' + meta + '</div><div class="dg-actions">' + b.join('') + '</div></div></div>';
    }
    function dessiner() {
        var l = visibles(), nbB = ETAT.fiches.filter(function (f) { return f.statut === 'brouillon'; }).length;
        $('c-brouillons').textContent = (ETAT.peutValider ? T('diag.chip_a_valider', 'Brouillons à valider') : T('diag.chip_mes', 'Mes brouillons')) + ' (' + nbB + ')';
        var nb = l.length;
        $('dg-compte').textContent = T(nb > 1 ? 'diag.compte_n' : 'diag.compte_1', nb > 1 ? '{n} fiches affichées sur {total}' : '{n} fiche affichée sur {total}', { n: nb, total: ETAT.fiches.length }) +
            (racines($('f-q').value).length && nb ? ' · ' + T('diag.plus_proches', 'les plus proches en premier') : '');
        $('dg-liste').innerHTML = nb ? l.map(carte).join('') : '<div class="dg-vide">' + esc(ETAT.fiches.length
            ? T('diag.aucune', 'Aucune fiche ne correspond. Essayez d\'autres mots, ou ajoutez la fiche si vous connaissez la solution.')
            : T('diag.vide', 'La base est vide pour l\'instant. Ajoutez la première panne connue avec « + Nouvelle fiche ».')) + '</div>';
    }
    $('dg-liste').addEventListener('click', function (e) {
        var c = e.target.closest('.dg-card');
        if (!c) return;
        var id = c.getAttribute('data-id'), act = e.target.closest('[data-act]');
        if (!act) { if (e.target.closest('.dg-head')) { ETAT.ouvertes[id] = !ETAT.ouvertes[id]; c.classList.toggle('open'); } return; }
        var f = original(id);
        var a = act.getAttribute('data-act');
        if (a === 'modifier') ouvrirEdition(f);
        else if (a === 'valider') {
            if (f.bilingue === false) { alert(msgErreur({ error: 'traduction incomplete' })); return; }
            act.disabled = true;
            api({ action: 'validediag', id: id }).then(function (d) {
                if (!d || !d.ok) { alert(msgErreur(d)); act.disabled = false; return; }
                ok(d.remplacee ? T('diag.ok_prop_validee', 'Proposition validée : la fiche d\'origine est mise à jour.') : T('diag.ok_validee', 'Fiche validée : elle est maintenant visible de toute l\'équipe.'));
                charger();
            }, function () { alert(T('diag.injoignable', 'Serveur injoignable.')); act.disabled = false; });
        } else if (a === 'supprimer') {
            if (!confirm(T('diag.confirmer_suppr', 'Supprimer définitivement la fiche « {titre} » ?', { titre: titre(f) }))) return;
            api({ action: 'deletediag', id: id }).then(function (d) {
                if (!d || !d.ok) { alert(msgErreur(d)); return; }
                ok(T('diag.ok_supprimee', 'Fiche supprimée.')); charger();
            }, function () { alert(T('diag.injoignable', 'Serveur injoignable.')); });
        }
    });
    $('f-produit').addEventListener('change', dessiner);
    $('f-q').addEventListener('input', dessiner);
    [].forEach.call(document.querySelectorAll('.dg-chip'), function (b) {
        b.addEventListener('click', function () {
            ETAT.vue = b.getAttribute('data-vue');
            [].forEach.call(document.querySelectorAll('.dg-chip'), function (x) { x.classList.toggle('on', x === b); });
            dessiner();
        });
    });

    // ---------- edition (francais ET anglais ; on ecrit dans sa langue, l'autre est traduite) ----------
    function blocCause(c) {
        var d = document.createElement('div');
        d.className = 'dg-ec';
        d.innerHTML = '<div class="dg-ec-head"><span class="n"></span>' +
            '<button type="button" class="dg-btn x" data-m="haut" data-i18n-title="diag.plus_probable" title="Plus probable">↑</button>' +
            '<button type="button" class="dg-btn x" data-m="bas" data-i18n-title="diag.moins_probable" title="Moins probable">↓</button>' +
            '<button type="button" class="dg-btn x" data-m="x" data-i18n-title="diag.retirer" title="Retirer">✕</button></div>' +
            '<div class="dg-grid"><div class="dg-f full" data-l="fr"><label><span data-i18n="diag.l_cause">Cause</span> <span class="req">*</span></label><input type="text" class="c-cause" maxlength="300"></div>' +
            '<div class="dg-f full" data-l="fr"><label><span data-i18n="diag.l_solution">Solution (étapes)</span> <span class="req">*</span></label><textarea class="c-sol" maxlength="4000"></textarea></div>' +
            '<div class="dg-f full" data-l="en"><label><span data-i18n="diag.l_cause_en">Cause — anglais</span> <span class="req">*</span></label><input type="text" class="c-cause-en" maxlength="300"></div>' +
            '<div class="dg-f full" data-l="en"><label><span data-i18n="diag.l_solution_en">Solution — anglais</span> <span class="req">*</span></label><textarea class="c-sol-en" maxlength="4000"></textarea></div>' +
            '<div class="dg-f full"><label data-i18n="diag.l_pieces">Pièces (numéros)</label><input type="text" class="c-pieces" maxlength="300" data-i18n-placeholder="diag.facultatif" placeholder="facultatif"></div></div>';
        d.querySelector('.c-cause').value = (c && c.cause) || '';
        d.querySelector('.c-sol').value = (c && c.solution) || '';
        d.querySelector('.c-pieces').value = (c && c.pieces) || '';
        d.querySelector('.c-cause-en').value = (c && c.causeEn) || '';
        d.querySelector('.c-sol-en').value = (c && c.solutionEn) || '';
        $('e-causes').appendChild(d);
        traduireZone(d);
        ordonnerLangues(d);
        numeroter();
        return d;
    }
    function traduireZone(z) {
        z.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = T(el.getAttribute('data-i18n'), el.textContent); });
        z.querySelectorAll('[data-i18n-title]').forEach(function (el) { el.title = T(el.getAttribute('data-i18n-title'), el.title); });
        z.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { el.placeholder = T(el.getAttribute('data-i18n-placeholder'), el.placeholder); });
    }
    // La langue de l'ecran en premier ; les champs de l'autre langue en dessous, en pointille
    // (classe « en » = traduction automatique). Les champs sans langue (produit, code, pieces)
    // ne bougent pas, sauf les pieces, toujours en dernier dans une cause.
    function ordonnerLangues(zone) {
        var premiere = enAnglais() ? 'en' : 'fr';
        [].forEach.call(zone.querySelectorAll('.dg-grid'), function (g) {
            var champs = [].slice.call(g.children).filter(function (x) { return x.getAttribute('data-l'); });
            champs.filter(function (x) { return x.getAttribute('data-l') === premiere; }).concat(
                champs.filter(function (x) { return x.getAttribute('data-l') !== premiere; })).forEach(function (x) {
                    x.classList.toggle('en', x.getAttribute('data-l') !== premiere);
                    g.appendChild(x);
                });
            var piece = g.querySelector('.c-pieces'); if (piece) g.appendChild(piece.parentNode);
        });
    }
    function numeroter() {
        [].forEach.call($('e-causes').children, function (d, i) { d.querySelector('.n').textContent = T('diag.cause_n', 'Cause {n}', { n: i + 1 }); });
    }
    $('e-causes').addEventListener('click', function (e) {
        var b = e.target.closest('[data-m]');
        if (!b) return;
        var d = b.closest('.dg-ec'), m = b.getAttribute('data-m');
        if (m === 'haut' && d.previousElementSibling) d.parentNode.insertBefore(d, d.previousElementSibling);
        else if (m === 'bas' && d.nextElementSibling) d.parentNode.insertBefore(d.nextElementSibling, d);
        else if (m === 'x') { if ($('e-causes').children.length > 1) d.remove(); else { d.querySelectorAll('input,textarea').forEach(function (x) { x.value = ''; }); } }
        numeroter();
    });
    $('b-cause').addEventListener('click', function () { blocCause().querySelector(enAnglais() ? '.c-cause-en' : '.c-cause').focus(); });

    function noteEdition(f) {
        var propose = f && f.statut === 'valide' && !ETAT.peutValider;
        $('e-titre').textContent = !f ? T('diag.nouvelle', 'Nouvelle fiche') : propose ? T('diag.proposer', 'Proposer une modification') : T('diag.modifier_fiche', 'Modifier la fiche');
        $('e-note').textContent = ETAT.peutValider ? T('diag.note_valideur', 'Vous êtes validateur : la fiche est publiée dès l\'enregistrement.')
            : propose ? T('diag.note_propose', 'La fiche actuelle reste affichée telle quelle jusqu\'à ce que le service valide votre modification.')
            : T('diag.note_brouillon', 'La fiche restera en brouillon (visible de vous et du service) jusqu\'à sa validation.');
    }
    function ouvrirEdition(f) {
        ETAT.edition = f || null;
        noteEdition(f);
        dessinerProduits();
        $('e-produit').value = f ? f.produit : ($('f-produit').value || '');
        if (f && ETAT.produits.indexOf(f.produit) < 0) {        // produit retire de la liste depuis
            var o = document.createElement('option'); o.textContent = f.produit; $('e-produit').appendChild(o); $('e-produit').value = f.produit;
        }
        $('e-symptome').value = f ? f.symptome : '';
        $('e-code').value = f ? f.code : '';
        $('e-mots').value = f ? f.motsCles : '';
        $('e-symptome-en').value = f ? en(f).symptome : '';
        $('e-mots-en').value = f ? en(f).motsCles : '';
        $('e-causes').innerHTML = '';
        (f ? f.causes.map(function (c, i) { var k = (en(f).causes || [])[i] || {};
            return { cause: c.cause, solution: c.solution, pieces: c.pieces, causeEn: k.cause, solutionEn: k.solution }; }) : [null]).forEach(blocCause);
        ordonnerLangues($('dg-edit'));
        document.querySelectorAll('.dg-f.err').forEach(function (x) { x.classList.remove('err'); });
        $('e-alert').style.display = 'none';
        $('dg-edit').style.display = 'block';
        $('dg-edit').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $(f ? (enAnglais() ? 'e-symptome-en' : 'e-symptome') : 'e-produit').focus();
    }
    function fermerEdition() { $('dg-edit').style.display = 'none'; ETAT.edition = null; }
    $('b-nouvelle').addEventListener('click', function () { ouvrirEdition(null); });
    $('b-annuler').addEventListener('click', fermerEdition);

    function lireEdition() {
        var val = function (d, s) { return d.querySelector(s).value.trim(); };
        var causes = [].map.call($('e-causes').children, function (d) { return { cause: val(d, '.c-cause'), solution: val(d, '.c-sol'), pieces: val(d, '.c-pieces') }; });
        var causesEn = [].map.call($('e-causes').children, function (d) { return { cause: val(d, '.c-cause-en'), solution: val(d, '.c-sol-en') }; });
        return { produit: $('e-produit').value, symptome: $('e-symptome').value.trim(), code: $('e-code').value.trim(), motsCles: $('e-mots').value.trim(), causes: causes,
                 en: { symptome: $('e-symptome-en').value.trim(), motsCles: $('e-mots-en').value.trim(), causes: causesEn } };
    }
    // Obligatoire dans AU MOINS une langue (le serveur traduit l'autre).
    function valider(x) {
        var manque = [];
        var marque = function (els, ko, nom) { els.forEach(function (el) { el.classList.toggle('err', ko); }); if (ko && manque.indexOf(nom) < 0) manque.push(nom); };
        marque([$('w-produit')], !x.produit, T('diag.m_produit', 'produit'));
        marque([$('w-symptome'), $('w-symptome-en')], !x.symptome && !x.en.symptome, T('diag.m_symptome', 'symptôme'));
        var utiles = 0;
        [].forEach.call($('e-causes').children, function (d, i) {
            var c = x.causes[i], k = x.en.causes[i], vide = !c.cause && !c.solution && !c.pieces && !k.cause && !k.solution;
            if (!vide) utiles++;
            var p = function (s) { return d.querySelector(s).parentNode; };
            marque([p('.c-cause'), p('.c-cause-en')], !vide && !c.cause && !k.cause, T('diag.m_cause', 'cause {n}', { n: i + 1 }));
            marque([p('.c-sol'), p('.c-sol-en')], !vide && !c.solution && !k.solution, T('diag.m_solution', 'solution {n}', { n: i + 1 }));
        });
        if (!utiles) {
            var d0 = $('e-causes').children[0], p0 = function (s) { return d0.querySelector(s).parentNode; }, nom = T('diag.m_une_cause', 'au moins une cause et sa solution');
            marque([p0(enAnglais() ? '.c-cause-en' : '.c-cause')], true, nom); marque([p0(enAnglais() ? '.c-sol-en' : '.c-sol')], true, nom);
        }
        var a = $('e-alert');
        a.style.display = manque.length ? 'block' : 'none';
        a.textContent = manque.length ? T('diag.a_completer', 'À compléter : {liste}.', { liste: manque.join(', ') }) : '';
        return !manque.length;
    }
    $('b-enreg').addEventListener('click', function () {
        var x = lireEdition();
        if (!valider(x)) return;
        if (ETAT.edition) x.id = ETAT.edition.id;
        var b = $('b-enreg');
        b.disabled = true; b.textContent = T('diag.enregistrement', 'Enregistrement…');
        var remettre = function () { b.disabled = false; b.textContent = T('diag.enregistrer', 'Enregistrer'); };
        api({ action: 'savediag', fiche: x }).then(function (d) {
            remettre();
            if (!d || !d.ok) { var a = $('e-alert'); a.textContent = msgErreur(d); a.style.display = 'block'; return; }
            fermerEdition();
            ETAT.ouvertes[d.fiche.id] = true;
            if (d.fiche.bilingue === false) {
                ok(T('diag.ok_trad_manque', 'Fiche enregistrée en brouillon, mais la traduction automatique n\'a pas pu se faire : rouvrez-la plus tard pour la compléter.'));
                charger(); return;
            }
            ok(d.proposition ? T('diag.ok_proposition', 'Proposition envoyée : le service la verra dans ses brouillons à valider.')
                : d.fiche.statut === 'brouillon' ? T('diag.ok_brouillon', 'Fiche enregistrée en brouillon : elle sera visible de toute l\'équipe après validation.')
                : T('diag.ok_publiee', 'Fiche enregistrée et publiée.'));
            charger();
        }, function () { remettre(); var a = $('e-alert'); a.textContent = T('diag.err_injoignable_enreg', 'Serveur injoignable : rien n\'a été enregistré.'); a.style.display = 'block'; });
    });

    // Changement de langue : tout redessiner (liste, formulaire ouvert, compteur).
    window.addEventListener('langchange', function () {
        dessinerProduits();
        dessiner();
        traduireZone($('dg-edit'));
        if ($('dg-edit').style.display === 'block') { noteEdition(ETAT.edition); ordonnerLangues($('dg-edit')); numeroter(); }
    });

    // ---------- chargement ----------
    function charger() {
        api({ action: 'getdiag' }).then(function (d) {
            if (d && d.error === 'forbidden') { refuser(); return; }
            if (!d || !d.ok) { $('dg-compte').textContent = msgErreur(d); return; }
            ETAT.fiches = d.fiches || [];
            ETAT.peutValider = !!d.peutValider;
            if (d.produits && d.produits.length) ETAT.produits = d.produits;
            dessinerProduits();
            dessiner();
        }, function () { $('dg-compte').textContent = T('diag.indisponible', 'Base indisponible pour le moment (serveur injoignable).'); });
    }
    // Arrivee depuis la demande SAV : ?produit=...&q=... pre-remplit la recherche.
    var qs = new URLSearchParams(location.search);
    $('dg-compte').textContent = T('diag.chargement', 'Chargement…');
    dessinerProduits();
    if (qs.get('produit') && ETAT.produits.indexOf(qs.get('produit')) >= 0) $('f-produit').value = qs.get('produit');
    if (qs.get('q')) $('f-q').value = qs.get('q');
    charger();
})();
