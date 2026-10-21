// Base de diagnostic SAV (decision Steve, 2026-10-13) : pannes connues -> causes ->
// solutions, remplie depuis le portail par l'equipe interne (techniciens compris).
// Interne seulement. Une fiche d'un non-validateur reste en BROUILLON jusqu'a sa
// validation (case « Valider diag », defaut administrateur et ingenierie). Le serveur
// (actions getdiag / savediag / validediag / deletediag) tranche tout : les boutons
// masques ici ne sont qu'un confort d'affichage.
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
    // Meme liste que la demande SAV (sav-reglages.json), si le serveur ne la renvoie pas.
    var PRODUITS_REPLI = ["Limiteur d'excavatrice (LPE)", 'Creusage 2D (Guide-Pro GP)', 'Indicateur de charge (IDC)', 'Limiteur de rétrocaveuse',
                          'Limiteur de pompe à béton (LPB)', 'Limiteur de téléhandler (LPT)', 'Limiteur de camion girafe', 'Limiteur de camion Vac',
                          'Limiteur de nacelle', 'Limiteur de grue', 'Limiteur de foreuse', 'Balance (Scale-Pro / Lite)', 'Caméras', 'Autre'];
    var ETAT = { fiches: [], produits: PRODUITS_REPLI.slice(), peutValider: false, vue: 'tout', ouvertes: {}, edition: null };
    // Anglais des fiches (Steve, 2026-10-21) : traduit par le serveur, revise par le validateur.
    function enAnglais() {
        try { if (window.i18n && i18n.getLang) return i18n.getLang() === 'en'; } catch (e) {}
        try { return localStorage.getItem('portal_lang') === 'en'; } catch (e) { return false; }
    }
    function en(f) { return f.en || { symptome: '', motsCles: '', causes: [] }; }
    function titre(f) { return (enAnglais() && en(f).symptome) || f.symptome; }

    function api(corps) {
        corps.token = user.token;
        return fetch(window.PORTAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corps) })
            .then(function (r) { return r.json(); });
    }
    function ok(msg) { var o = $('dg-ok'); o.textContent = msg; o.style.display = 'block'; setTimeout(function () { o.style.display = 'none'; }, 6000); }
    function quand(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString('fr-CA') : ''; }
    var ERREURS = { 'forbidden': 'Action non permise pour votre compte.', 'not found': 'Cette fiche n\'existe plus (supprimée entre-temps).',
                    'authentication required': 'Session expirée : reconnectez-vous au portail.', 'deja validee': 'Cette fiche est déjà validée.',
                    'fiche trop longue': 'Fiche trop longue : raccourcissez les solutions.',
                    'anglais incomplet': 'Anglais incomplet : ouvrez « Modifier », complétez ou corrigez l\'anglais, enregistrez, puis validez.',
                    'traduction impossible': 'Traduction automatique impossible pour le moment : la fiche n\'a pas été modifiée. Réessayez plus tard ou entrez l\'anglais à la main.' };
    function msgErreur(d) { var e = (d && d.error) || ''; return ERREURS[e] || ('Erreur du serveur' + (e ? ' : ' + e : '') + '.'); }

    // ---------- liste ----------
    function dessinerProduits() {
        var f = $('f-produit'), v = f.value;
        f.innerHTML = '<option value="">Tous les produits</option>' + ETAT.produits.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
        f.value = ETAT.produits.indexOf(v) >= 0 ? v : '';
        $('e-produit').innerHTML = '<option value="">— Choisir —</option>' + ETAT.produits.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
    }
    // Recherche par pertinence (Steve, 2026-10-13) : une description dans les mots du client
    // (« la christ de balance pèse pas bien ») ne trouvait rien, car TOUS les mots devaient
    // etre dans la fiche. Maintenant : petits mots ignores, variantes d'un meme mot
    // rapprochees (pèse / peser / pesée), et fiches classees par points — un mot trouve dans
    // le symptome, le code ou les mots-cles compte plus que dans une solution.
    var VIDES = ('le la les l un une des de du d au aux a et ou ni ne n pas plus que qu qui quoi se s sa son ses ce c ca cela ' +
        'cet cette il ils elle elles on y en est sont etre ai as avons ont avoir fait fais faire tres trop bien mal ' +
        'pour par sur sous dans avec sans chez quand comme mais donc car si tout tous toute toutes rien peu ' +
        'mon ma mes ton ta tes notre nos votre vos leur leurs me te nous vous lui je j tu ' +
        'christ crisse tabarnak tabarnac calice caliss esti ostie hostie maudit maudite sacrament ciboire').split(' ');
    function racine(m) {
        m = m.replace(/(ements|ement|ations|ation|euses|euse|eurs|eur|ees|ee|es|er|ez|ent|ait|ais|ons|e|s|x)$/, '');
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
        var prod = $('f-produit').value, mots = racines($('f-q').value);
        var l = ETAT.fiches.filter(function (f) {
            if (ETAT.vue === 'brouillons' && f.statut !== 'brouillon') return false;
            return !prod || f.produit === prod;
        });
        var ordre = function (a, b) { return a.produit === b.produit ? a.symptome.localeCompare(b.symptome, 'fr') : a.produit.localeCompare(b.produit, 'fr'); };
        if (!mots.length) return l.sort(ordre);
        l.forEach(function (f) { f._points = points(f, mots); });
        return l.filter(function (f) { return f._points > 0; })
                .sort(function (a, b) { return b._points - a._points || ordre(a, b); });
    }
    function original(id) { return ETAT.fiches.filter(function (f) { return f.id === id; })[0]; }
    function carte(f) {
        var prop = f.remplace ? original(f.remplace) : null;
        var tags = '<span class="dg-tag prod">' + esc(f.produit) + '</span>' + (f.code ? ' <span class="dg-tag code">' + esc(f.code) + '</span>' : '') +
            (f.statut === 'brouillon' ? ' <span class="dg-tag brouillon">' + (f.remplace ? 'Proposition de modification' : 'Brouillon à valider') + '</span>' : '') +
            (f.anglaisComplet === false ? ' <span class="dg-tag en-manque">Anglais incomplet</span>' : '');
        var ang = enAnglais(), e = en(f), revue = ETAT.peutValider && f.statut === 'brouillon' && !ang;
        var causes = f.causes.map(function (c, i) {
            var k = (e.causes || [])[i] || {};
            var cause = (ang && k.cause) || c.cause, sol = (ang && k.solution) || c.solution;
            return '<div class="dg-cause"><h4>' + (i + 1) + '. ' + esc(cause) + '</h4>' +
                (revue ? '<div class="dg-en"><b>EN</b>' + esc(k.cause || '— à traduire —') + '</div>' : '') +
                '<div class="dg-sol">' + esc(sol) + '</div>' +
                (revue ? '<div class="dg-en"><b>EN</b>' + esc(k.solution || '— à traduire —') + '</div>' : '') +
                (c.pieces ? '<div class="dg-pieces">Pièces : ' + esc(c.pieces) + '</div>' : '') + '</div>';
        }).join('');
        if (revue) causes = '<div class="dg-en"><b>EN</b>' + esc(e.symptome || '— à traduire —') + '</div>' + causes;
        var meta = [f.auteurNom ? 'Écrite par ' + esc(f.auteurNom) + (quand(f.creeLe) ? ' le ' + quand(f.creeLe) : '') : '',
                    f.modifieParNom && f.modifieLe !== f.creeLe ? 'modifiée par ' + esc(f.modifieParNom) + ' le ' + quand(f.modifieLe) : '',
                    f.valideParNom ? 'validée par ' + esc(f.valideParNom) + ' le ' + quand(f.valideLe) : ''].filter(Boolean).join(' · ');
        if (f.remplace) meta += '<br>Remplacera la fiche validée « ' + esc(prop ? prop.symptome : '(introuvable : deviendra une fiche à part)') + ' ».';
        var b = [];
        var auteurBrouillon = f.statut === 'brouillon' && f.mien;
        if (ETAT.peutValider && f.statut === 'brouillon') b.push('<button type="button" class="dg-btn ok" data-act="valider">✓ Valider</button>');
        if (ETAT.peutValider || auteurBrouillon) b.push('<button type="button" class="dg-btn" data-act="modifier">Modifier</button>');
        else if (f.statut === 'valide') b.push('<button type="button" class="dg-btn" data-act="modifier">Proposer une modification</button>');
        if (ETAT.peutValider || auteurBrouillon) b.push('<button type="button" class="dg-btn danger" data-act="supprimer">Supprimer</button>');
        return '<div class="dg-card' + (f.statut === 'brouillon' ? ' brouillon' : '') + (ETAT.ouvertes[f.id] ? ' open' : '') + '" data-id="' + esc(f.id) + '">' +
            '<div class="dg-head"><b>' + esc(titre(f)) + '</b>' + tags + '<span class="dg-nb">' + f.causes.length + ' cause' + (f.causes.length > 1 ? 's' : '') + '</span></div>' +
            '<div class="dg-body">' + causes + '<div class="dg-meta">' + meta + '</div><div class="dg-actions">' + b.join('') + '</div></div></div>';
    }
    function dessiner() {
        var l = visibles(), nbB = ETAT.fiches.filter(function (f) { return f.statut === 'brouillon'; }).length;
        $('c-brouillons').textContent = (ETAT.peutValider ? 'Brouillons à valider' : 'Mes brouillons') + ' (' + nbB + ')';
        $('dg-compte').textContent = l.length + ' fiche' + (l.length > 1 ? 's' : '') + ' affichée' + (l.length > 1 ? 's' : '') +
            ' sur ' + ETAT.fiches.length + (racines($('f-q').value).length && l.length ? ' · les plus proches en premier' : '');
        $('dg-liste').innerHTML = l.length ? l.map(carte).join('') : '<div class="dg-vide">' + (ETAT.fiches.length
            ? 'Aucune fiche ne correspond. Essayez d\'autres mots, ou ajoutez la fiche si vous connaissez la solution.'
            : 'La base est vide pour l\'instant. Ajoutez la première panne connue avec « + Nouvelle fiche ».') + '</div>';
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
            if (f.anglaisComplet === false) { alert(ERREURS['anglais incomplet']); return; }
            act.disabled = true;
            api({ action: 'validediag', id: id }).then(function (d) {
                if (!d || !d.ok) { alert(msgErreur(d)); act.disabled = false; return; }
                ok(d.remplacee ? 'Proposition validée : la fiche d\'origine est mise à jour.' : 'Fiche validée : elle est maintenant visible de toute l\'équipe.');
                charger();
            }, function () { alert('Serveur injoignable.'); act.disabled = false; });
        } else if (a === 'supprimer') {
            if (!confirm('Supprimer définitivement la fiche « ' + f.symptome + ' » ?')) return;
            api({ action: 'deletediag', id: id }).then(function (d) {
                if (!d || !d.ok) { alert(msgErreur(d)); return; }
                ok('Fiche supprimée.'); charger();
            }, function () { alert('Serveur injoignable.'); });
        }
    });
    $('f-produit').addEventListener('change', dessiner);
    window.addEventListener('langchange', dessiner);
    $('f-q').addEventListener('input', dessiner);
    [].forEach.call(document.querySelectorAll('.dg-chip'), function (b) {
        b.addEventListener('click', function () {
            ETAT.vue = b.getAttribute('data-vue');
            [].forEach.call(document.querySelectorAll('.dg-chip'), function (x) { x.classList.toggle('on', x === b); });
            dessiner();
        });
    });

    // ---------- edition ----------
    function blocCause(c) {
        var d = document.createElement('div');
        d.className = 'dg-ec';
        d.innerHTML = '<div class="dg-ec-head"><span class="n"></span>' +
            '<button type="button" class="dg-btn x" data-m="haut" title="Plus probable">↑</button>' +
            '<button type="button" class="dg-btn x" data-m="bas" title="Moins probable">↓</button>' +
            '<button type="button" class="dg-btn x" data-m="x" title="Retirer">✕</button></div>' +
            '<div class="dg-grid"><div class="dg-f full"><label>Cause <span class="req">*</span></label><input type="text" class="c-cause" maxlength="300"></div>' +
            '<div class="dg-f full"><label>Solution (étapes) <span class="req">*</span></label><textarea class="c-sol" maxlength="4000"></textarea></div>' +
            '<div class="dg-f full"><label>Pièces (numéros)</label><input type="text" class="c-pieces" maxlength="300" placeholder="facultatif"></div>' +
            '<div class="dg-f full en"><label>Cause — anglais</label><input type="text" class="c-cause-en" maxlength="300" placeholder="traduite automatiquement à l\'enregistrement"></div>' +
            '<div class="dg-f full en"><label>Solution — anglais</label><textarea class="c-sol-en" maxlength="4000" placeholder="traduite automatiquement à l\'enregistrement"></textarea></div></div>';
        d.querySelector('.c-cause').value = (c && c.cause) || '';
        d.querySelector('.c-sol').value = (c && c.solution) || '';
        d.querySelector('.c-pieces').value = (c && c.pieces) || '';
        d.querySelector('.c-cause-en').value = (c && c.causeEn) || '';
        d.querySelector('.c-sol-en').value = (c && c.solutionEn) || '';
        $('e-causes').appendChild(d);
        numeroter();
        return d;
    }
    function numeroter() {
        [].forEach.call($('e-causes').children, function (d, i) { d.querySelector('.n').textContent = 'Cause ' + (i + 1); });
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
    $('b-cause').addEventListener('click', function () { blocCause().querySelector('.c-cause').focus(); });

    function ouvrirEdition(f) {
        ETAT.edition = f || null;
        var propose = f && f.statut === 'valide' && !ETAT.peutValider;
        $('e-titre').textContent = !f ? 'Nouvelle fiche' : propose ? 'Proposer une modification' : 'Modifier la fiche';
        $('e-note').textContent = ETAT.peutValider ? 'Vous êtes validateur : la fiche est publiée dès l\'enregistrement.'
            : propose ? 'La fiche actuelle reste affichée telle quelle jusqu\'à ce que le service valide votre modification.'
            : 'La fiche restera en brouillon (visible de vous et du service) jusqu\'à sa validation.';
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
        document.querySelectorAll('.dg-f.err').forEach(function (x) { x.classList.remove('err'); });
        $('e-alert').style.display = 'none';
        $('dg-edit').style.display = 'block';
        $('dg-edit').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $(f ? 'e-symptome' : 'e-produit').focus();
    }
    function fermerEdition() { $('dg-edit').style.display = 'none'; ETAT.edition = null; }
    $('b-nouvelle').addEventListener('click', function () { ouvrirEdition(null); });
    $('b-annuler').addEventListener('click', fermerEdition);

    function lireEdition() {
        var causes = [].map.call($('e-causes').children, function (d) {
            return { cause: d.querySelector('.c-cause').value.trim(), solution: d.querySelector('.c-sol').value.trim(), pieces: d.querySelector('.c-pieces').value.trim() };
        });
        var causesEn = [].map.call($('e-causes').children, function (d) {
            return { cause: d.querySelector('.c-cause-en').value.trim(), solution: d.querySelector('.c-sol-en').value.trim() };
        });
        return { produit: $('e-produit').value, symptome: $('e-symptome').value.trim(), code: $('e-code').value.trim(), motsCles: $('e-mots').value.trim(), causes: causes,
                 en: { symptome: $('e-symptome-en').value.trim(), motsCles: $('e-mots-en').value.trim(), causes: causesEn } };
    }
    function valider(x) {
        var manque = [];
        var marque = function (el, ko, nom) { el.classList.toggle('err', ko); if (ko && manque.indexOf(nom) < 0) manque.push(nom); };
        marque($('w-produit'), !x.produit, 'produit');
        marque($('w-symptome'), !x.symptome, 'symptôme');
        var utiles = 0;
        [].forEach.call($('e-causes').children, function (d, i) {
            var c = x.causes[i], vide = !c.cause && !c.solution && !c.pieces;
            if (!vide) utiles++;
            marque(d.querySelector('.c-cause').parentNode, !vide && !c.cause, 'cause ' + (i + 1));
            marque(d.querySelector('.c-sol').parentNode, !vide && !c.solution, 'solution ' + (i + 1));
        });
        if (!utiles) { marque($('e-causes').children[0].querySelector('.c-cause').parentNode, true, 'au moins une cause et sa solution');
                       marque($('e-causes').children[0].querySelector('.c-sol').parentNode, true, 'au moins une cause et sa solution'); }
        var a = $('e-alert');
        a.style.display = manque.length ? 'block' : 'none';
        a.textContent = manque.length ? 'À compléter : ' + manque.join(', ') + '.' : '';
        return !manque.length;
    }
    $('b-enreg').addEventListener('click', function () {
        var x = lireEdition();
        if (!valider(x)) return;
        if (ETAT.edition) x.id = ETAT.edition.id;
        var b = $('b-enreg');
        b.disabled = true; b.textContent = 'Enregistrement…';
        api({ action: 'savediag', fiche: x }).then(function (d) {
            b.disabled = false; b.textContent = 'Enregistrer';
            if (!d || !d.ok) { var a = $('e-alert'); a.textContent = msgErreur(d); a.style.display = 'block'; return; }
            fermerEdition();
            ETAT.ouvertes[d.fiche.id] = true;
            if (d.fiche.anglaisComplet === false) {
                ok('Fiche enregistrée en brouillon, mais la traduction anglaise n\'a pas pu se faire : rouvrez-la plus tard pour la compléter.');
                charger(); return;
            }
            ok(d.proposition ? 'Proposition envoyée : le service la verra dans ses brouillons à valider.'
                : d.fiche.statut === 'brouillon' ? 'Fiche enregistrée en brouillon : elle sera visible de toute l\'équipe après validation.'
                : 'Fiche enregistrée et publiée.');
            charger();
        }, function () { b.disabled = false; b.textContent = 'Enregistrer'; var a = $('e-alert'); a.textContent = 'Serveur injoignable : rien n\'a été enregistré.'; a.style.display = 'block'; });
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
        }, function () { $('dg-compte').textContent = 'Base indisponible pour le moment (serveur injoignable).'; });
    }
    // Arrivee depuis la demande SAV : ?produit=...&q=... pre-remplit la recherche.
    var qs = new URLSearchParams(location.search);
    dessinerProduits();
    if (qs.get('produit') && ETAT.produits.indexOf(qs.get('produit')) >= 0) $('f-produit').value = qs.get('produit');
    if (qs.get('q')) $('f-q').value = qs.get('q');
    charger();
})();
