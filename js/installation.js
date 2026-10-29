// Banque d'installation (decision Steve, 2026-10-28) : notes d'installation rattachees a un
// MODELE de machine (base machines du portail : type > fabricant > modele) ET a un PRODUIT
// (les options e-Trak de la tuile Soumission), avec filtres par modele et par produit.
// Une note : un grand champ d'informations (pas d'etapes : Steve, 2026-10-28), des photos,
// pieces et harnais, pieges connus, temps d'installation — aucune section obligatoire. Memes regles que la base de diagnostic :
// interne seulement (case SAV), brouillon jusqu'a la validation (case « Valider diag »),
// proposition de modification sur une note validee, notes bilingues traduites par le
// serveur. Photos reduites ici (~300 Ko) puis gardees par le serveur dans un dossier Drive
// prive ; elles ne sont remises qu'a une session ouverte. Le serveur (actions getinst /
// saveinst / validateinst / deleteinst / uploadinstphoto / getinstphoto) tranche tout.
(function () {
    'use strict';
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    function refuser() {
        document.getElementById('in-root').style.display = 'none';
        document.getElementById('in-denied').style.display = 'block';
    }
    if (!user || user.isGuest || !user.token || (window.portalRoleLocked && window.portalRoleLocked(user.role, 'savAccess'))) {
        refuser();
        return;
    }
    document.getElementById('in-root').style.display = 'block';

    var $ = function (id) { return document.getElementById(id); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    function enAnglais() {
        try { if (window.i18n && i18n.getLang) return i18n.getLang() === 'en'; } catch (e) {}
        try { return localStorage.getItem('portal_lang') === 'en'; } catch (e) { return false; }
    }
    // Texte de l'interface dans la langue de l'ecran ; {x} remplace par vars.x.
    function tx(fr, en, vars) {
        var v = enAnglais() ? en : fr;
        if (vars) Object.keys(vars).forEach(function (k) { v = v.split('{' + k + '}').join(vars[k]); });
        return v;
    }
    function traduireZone(z) {
        [].forEach.call(z.querySelectorAll('[data-tx]'), function (el) { var p = el.getAttribute('data-tx').split('|'); el.textContent = enAnglais() ? p[1] : p[0]; });
        [].forEach.call(z.querySelectorAll('[data-txp]'), function (el) { var p = el.getAttribute('data-txp').split('|'); el.placeholder = enAnglais() ? p[1] : p[0]; });
    }

    // Produits = options e-Trak de la tuile Soumission (Steve, 2026-10-28). La note garde la
    // CLE (independante de la langue) ; « Limit Pro » = Limiteur de portee.
    var PRODUITS = [
        { k: 'limiteur', fr: 'Limiteur de portée', en: 'Range limiter', options: [
            { k: 'hauteur', fr: 'Hauteur', en: 'Height' }, { k: 'hauteur_ext', fr: 'Hauteur + extension', en: 'Height + extension' },
            { k: 'rotation', fr: 'Rotation', en: 'Rotation' }, { k: 'hauteur_rotation', fr: 'Hauteur + Rotation', en: 'Height + Rotation' },
            { k: 'multi_axe', fr: 'Multi-axe', en: 'Multi-axis' }] },
        { k: 'godet_avant', fr: 'Limiteur godet avant', en: 'Front loader bucket limiter', options: [] },
        { k: 'idc', fr: 'Indicateur de charge', en: 'Load indicator', options: [] },
        { k: 'creusage', fr: 'Guide de creusage', en: 'Digging guide', options: [
            { k: '2d', fr: 'Système de creusage 2D', en: '2D digging system' }, { k: 'laser', fr: 'Référence laser', en: 'Laser reference' },
            { k: 'deux_booms', fr: '2 booms + 1 stick', en: '2 booms + 1 stick' }] },
        { k: 'camera', fr: 'Caméra', en: 'Camera', options: [
            { k: 'recul', fr: 'Recul', en: 'Rear view' }, { k: 'recul_capteur', fr: 'Recul + capteur de proximité', en: 'Rear view + proximity sensor' },
            { k: 'quad', fr: 'Quad', en: 'Quad' }, { k: '360', fr: 'Caméra 360', en: '360 camera' }] },
        { k: 'nacelle', fr: 'Options nacelle', en: 'Boom lift options', options: [
            { k: 'articulee', fr: 'Nacelle articulée', en: 'Articulated boom' }, { k: 'gauche_droite', fr: 'Gestion gauche-droite', en: 'Left-right management' },
            { k: 'drainage', fr: 'Drainage', en: 'Drainage' }, { k: 'pignon', fr: 'Rotation pignon et crémaillère', en: 'Rack-and-pinion rotation' },
            { k: 'fleche', fr: 'Flèche de nacelle', en: 'Boom lift jib' }] },
        { k: 'balance', fr: 'Balance ST-7', en: 'ST-7 Scale', options: [] }
    ];
    // Produits et options offerts selon le type de machine : memes regles que la tuile
    // Soumission (applyTypeRestrictions et applyRotationRestriction de soumission.js) —
    // pas d'options nacelle sur un loader (Steve, 2026-10-29). Type hors base : tout est offert.
    var PROD_TYPES = {
        limiteur: function (t) { return t !== 'Tracteur'; },
        godet_avant: function (t) { return t === 'Retrocaveuse'; },
        idc: function (t) { return t === 'Excavatrice'; },
        creusage: function (t) { return t === 'Excavatrice'; },
        nacelle: function (t) { return t === 'Nacelle'; },
        balance: function (t) { return t === 'Loader' || t === 'Retrocaveuse' || t === 'Tracteur'; }
    };
    var OPT_TYPES = {
        hauteur_ext: function (t) { return t === 'Camion Vacuum'; },
        rotation: function (t) { return t !== 'Loader'; },
        hauteur_rotation: function (t) { return t !== 'Loader' && t !== 'Camion Vacuum'; },
        multi_axe: function (t) { return t === 'Excavatrice' || t === 'Retrocaveuse'; }
    };
    function typeConnu(t) { return !!(t && ETAT.machines[t]); }
    function produitsPour(t) { return PRODUITS.filter(function (p) { return !typeConnu(t) || !PROD_TYPES[p.k] || PROD_TYPES[p.k](t); }); }
    function optionsPour(p, t) { return p.options.filter(function (o) { return !typeConnu(t) || !OPT_TYPES[o.k] || OPT_TYPES[o.k](t); }); }
    function produit(k) { return PRODUITS.filter(function (p) { return p.k === k; })[0]; }
    // Sur un tracteur, la balance est la Scale Lite (meme nom que dans Soumission).
    function nomProduit(k, t) {
        if (k === 'balance' && t === 'Tracteur') return tx('Balance Scale Lite', 'Scale Lite');
        var p = produit(k); return p ? (enAnglais() ? p.en : p.fr) : k;
    }
    function nomOption(pk, ok) {
        var p = produit(pk), o = p && p.options.filter(function (x) { return x.k === ok; })[0];
        return o ? (enAnglais() ? o.en : o.fr) : (ok || '');
    }

    var ETAT = { notes: [], machines: {}, pieces: [], peutValider: false, vue: 'tout', ouvertes: {}, edition: null, envois: 0 };
    var PHOTOS = {};     // id -> data URL (cache de la session)

    function api(corps) {
        corps.token = user.token;
        return fetch(window.PORTAL_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(corps) })
            .then(function (r) { return r.json(); });
    }
    function ok(msg) { var o = $('in-ok'); o.textContent = msg; o.style.display = 'block'; setTimeout(function () { o.style.display = 'none'; }, 6000); }
    function quand(iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString(enAnglais() ? 'en-CA' : 'fr-CA') : ''; }
    function msgErreur(d) {
        var e = (d && d.error) || '';
        var m = {
            'forbidden': tx('Action non permise pour votre compte.', 'Action not allowed for your account.'),
            'not found': tx('Cette note n\'existe plus (supprimée entre-temps).', 'This note no longer exists (deleted meanwhile).'),
            'authentication required': tx('Session expirée : reconnectez-vous au portail.', 'Session expired: log in to the portal again.'),
            'deja validee': tx('Cette note est déjà validée.', 'This note is already approved.'),
            'note trop longue': tx('Note trop longue : raccourcissez le texte.', 'Note too long: shorten the text.'),
            'photo trop grosse': tx('Photo trop grosse, même réduite.', 'Photo too large, even after resizing.'),
            'traduction incomplete': tx('Traduction incomplète : ouvrez « Modifier », complétez le français ou l\'anglais, enregistrez, puis validez.',
                                        'Incomplete translation: open "Edit", complete the French or English, save, then approve.')
        }[e];
        return m || (tx('Erreur du serveur', 'Server error') + (e ? ' : ' + e : '') + '.');
    }

    // ---------- machines (base du portail, fichier public) ----------
    function chargerMachines() {
        return fetch('data/machines.json?cb=' + Date.now()).then(function (r) { return r.json(); }).then(function (d) {
            var m = {};
            Object.keys(d).forEach(function (t) {
                if (!d[t] || typeof d[t] !== 'object') return;
                var fabs = {};
                Object.keys(d[t]).forEach(function (f) {
                    if (f.charAt(0) === '_' || !d[t][f] || typeof d[t][f] !== 'object') return;
                    var mods = {};
                    Object.keys(d[t][f]).forEach(function (an) {
                        var o = d[t][f][an];
                        if (o && typeof o === 'object') Object.keys(o).forEach(function (mo) { if (mo.charAt(0) !== '_') mods[mo] = 1; });
                    });
                    fabs[f] = Object.keys(mods).sort(function (a, b) { return a.localeCompare(b, 'fr', { numeric: true }); });
                });
                m[t] = fabs;
            });
            ETAT.machines = m;
        }, function () { ETAT.machines = {}; });
    }
    var tri = function (a, b) { return a.localeCompare(b, 'fr', { numeric: true }); };
    // Modele de base, sans les suffixes de lettres : CX19D -> CX19, 921G -> 921,
    // CX145D SR -> CX145, S-40 HF -> S-40. L'installation est souvent la meme et la note
    // doit se trouver meme si la derniere lettre differe (Steve, 2026-10-29). Il reste
    // toujours au moins 3 caracteres et un chiffre (JCB 3CX reste 3CX).
    function baseModele(m) {
        var s = String(m || '').trim(), av, r;
        do {
            av = s;
            r = s.replace(/[\s-]+[A-Za-z]{1,3}$/, '');
            if (r === s) r = s.replace(/(\d)[A-Za-z]{1,3}$/, '$1');
            if (r !== s && r.length >= 3 && /\d/.test(r)) s = r;
        } while (s !== av);
        return s;
    }
    // Machines hors base (« Autre… ») : celles des notes existantes s'ajoutent aux listes.
    function notesMachines(t, f) {
        return ETAT.notes.filter(function (n) { return (!t || n.type === t) && (!f || n.fabricant === f); });
    }
    function types() {
        var s = {};
        Object.keys(ETAT.machines).forEach(function (t) { s[t] = 1; });
        notesMachines().forEach(function (n) { if (n.type) s[n.type] = 1; });
        return Object.keys(s).sort(tri);
    }
    function fabricants(t) {
        var s = {};
        (t ? [t] : Object.keys(ETAT.machines)).forEach(function (x) { Object.keys(ETAT.machines[x] || {}).forEach(function (f) { s[f] = 1; }); });
        notesMachines(t).forEach(function (n) { if (n.fabricant) s[n.fabricant] = 1; });
        return Object.keys(s).sort(tri);
    }
    // Liste des modeles de base ; le libelle rappelle les modeles de la base qu'il regroupe.
    function modeles(t, f) {
        var s = {};
        var ajoute = function (m) { var b = baseModele(m); if (!b) return; s[b] = s[b] || {}; if (m !== b) s[b][m] = 1; };
        (t ? [t] : Object.keys(ETAT.machines)).forEach(function (x) { var fb = ETAT.machines[x] || {}; (f ? [f] : Object.keys(fb)).forEach(function (y) { (fb[y] || []).forEach(ajoute); }); });
        notesMachines(t, f).forEach(function (n) { ajoute(n.modele); });
        return Object.keys(s).sort(tri).map(function (b) {
            var v = Object.keys(s[b]).sort(tri);
            return { v: b, t: v.length ? b + '  (' + v.slice(0, 4).join(', ') + (v.length > 4 ? ', …' : '') + ')' : b };
        });
    }
    function remplir(sel, valeurs, premier, garder) {
        var v = garder !== undefined ? garder : sel.value;
        sel.innerHTML = '<option value="">' + esc(premier) + '</option>' + valeurs.map(function (x) {
            return typeof x === 'string' ? '<option>' + esc(x) + '</option>' : '<option value="' + esc(x.v) + '">' + esc(x.t) + '</option>'; }).join('');
        var existe = [].some.call(sel.options, function (o) { return o.value === v; });
        if (v && !existe) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); }
        sel.value = v || '';
    }
    function prodOptions(t) { return produitsPour(t).map(function (p) { return { v: p.k, t: nomProduit(p.k, t) }; }); }
    // Valeur gardee seulement si elle est encore offerte (ex. produit d'un autre type de machine).
    function offerte(liste, v) { return liste.some(function (x) { return (typeof x === 'string' ? x : x.v) === v; }) ? v : ''; }

    // ---------- filtres ----------
    function dessinerFiltres() {
        remplir($('f-type'), types(), tx('Tous les types', 'All types'));
        remplir($('f-fab'), fabricants($('f-type').value), tx('Tous les fabricants', 'All manufacturers'));
        remplir($('f-modele'), modeles($('f-type').value, $('f-fab').value), tx('Tous les modèles', 'All models'));
        var po = prodOptions($('f-type').value);
        remplir($('f-produit'), po, tx('Tous les produits', 'All products'), offerte(po, $('f-produit').value));
    }
    ['f-type', 'f-fab', 'f-modele', 'f-produit'].forEach(function (id) {
        $(id).addEventListener('change', function () {
            if (id === 'f-type') { $('f-fab').value = ''; $('f-modele').value = ''; }
            if (id === 'f-fab') $('f-modele').value = '';
            dessinerFiltres(); dessiner();
        });
    });
    $('f-q').addEventListener('input', dessiner);
    [].forEach.call(document.querySelectorAll('.in-chip'), function (b) {
        b.addEventListener('click', function () {
            ETAT.vue = b.getAttribute('data-vue');
            [].forEach.call(document.querySelectorAll('.in-chip'), function (x) { x.classList.toggle('on', x === b); });
            dessiner();
        });
    });

    // ---------- contenu dans la langue de l'ecran (l'autre en repli) ----------
    function enDe(n) { return n.en || { texte: '', pieges: '' }; }
    // champ = 'texte' ou 'pieges' ; autreL vrai = l'autre langue (sans repli).
    function txt(n, champ, autreL) {
        var fr = n[champ] || '', en = enDe(n)[champ] || '';
        return (enAnglais() !== !!autreL) ? (en || (autreL ? '' : fr)) : (fr || (autreL ? '' : en));
    }
    function titre(n) {
        return nomProduit(n.produit, n.type) + (n.option ? ' (' + nomOption(n.produit, n.option) + ')' : '') + ' — ' + n.fabricant + ' ' + n.modele;
    }

    // ---------- recherche (memes principes que la base de diagnostic) ----------
    var VIDES = ('le la les l un une des de du d au aux a et ou ne pas que qui se sa son ses ce il elle on y en est sont ' +
                 'pour par sur sous dans avec sans the an of to and or is are it this that with for at by from').split(' ');
    function racines(t) {
        return norm(t).split(/[^a-z0-9]+/).filter(function (m) { return m.length >= 2 && VIDES.indexOf(m) < 0; })
            .map(function (m) { return /\d/.test(m) ? m : m.replace(/(ements|ement|ations|ation|eurs|eur|ees|ee|es|er|ent|ing|ed|e|s|x)$/, '').slice(0, 6); })
            .filter(function (m) { return m.length >= 2; });
    }
    function points(n, mots) {
        var e = enDe(n);
        // modele de base aussi : « CX19E » trouve la note du CX19D
        var tete = racines([n.type, n.fabricant, n.modele, baseModele(n.modele), nomProduit(n.produit, n.type), produit(n.produit) ? produit(n.produit).en : '', nomOption(n.produit, n.option)].join(' '));
        var corps = racines(n.texte + ' ' + (e.texte || '') + ' ' + n.pieges + ' ' + (e.pieges || '') + ' ' + n.pieces.map(function (p) { return p.txt; }).join(' '));
        var total = 0;
        mots.forEach(function (m) {
            var pr = function (x) { return x === m || (x.length >= 3 && m.length >= 3 && (x.indexOf(m) === 0 || m.indexOf(x) === 0)); };
            total += tete.some(pr) ? 3 : corps.some(pr) ? 1 : 0;
        });
        return total;
    }
    function visibles() {
        var t = $('f-type').value, f = $('f-fab').value, m = $('f-modele').value, p = $('f-produit').value, mots = racines($('f-q').value);
        var l = ETAT.notes.filter(function (n) {
            if (ETAT.vue === 'brouillons' && n.statut !== 'brouillon') return false;
            return (!t || n.type === t) && (!f || n.fabricant === f) && (!m || baseModele(n.modele) === m) && (!p || n.produit === p);
        });
        var ordre = function (a, b) { return titre(a).localeCompare(titre(b), 'fr', { numeric: true }); };
        if (!mots.length) return l.sort(ordre);
        l.forEach(function (n) { n._points = points(n, mots); });
        return l.filter(function (n) { return n._points > 0; }).sort(function (a, b) { return b._points - a._points || ordre(a, b); });
    }
    function original(id) { return ETAT.notes.filter(function (n) { return n.id === id; })[0]; }

    // ---------- cartes ----------
    function vignettes(ids, retirable) {
        return (ids || []).map(function (pid) {
            return '<div class="in-photo charge" data-pid="' + esc(pid) + '">' + (retirable ? '<button type="button" class="x" title="' + esc(tx('Retirer', 'Remove')) + '">✕</button>' : '') + '</div>';
        }).join('');
    }
    function carte(n) {
        var revue = ETAT.peutValider && n.statut === 'brouillon', lAutre = enAnglais() ? 'FR' : 'EN', manque = tx('— à traduire —', '— to translate —');
        var autreLigne = function (t) { return revue ? '<div class="in-autre"><b>' + lAutre + '</b>' + esc(t || manque) + '</div>' : ''; };
        var tags = '<span class="in-tag type">' + esc(n.type) + '</span> <span class="in-tag prod">' + esc(nomProduit(n.produit, n.type)) + '</span>' +
            (n.statut === 'brouillon' ? ' <span class="in-tag brouillon">' + esc(n.remplace ? tx('Proposition de modification', 'Proposed change') : tx('Brouillon à valider', 'Draft to approve')) + '</span>' : '') +
            (n.bilingue === false ? ' <span class="in-tag en-manque">' + esc(tx('Traduction incomplète', 'Incomplete translation')) + '</span>' : '');
        var corps = '';
        if (n.temps) corps += '<div class="in-sec">⏱ ' + esc(tx('Temps d\'installation', 'Installation time')) + ' : <span style="color:#eee;font-weight:400">' + esc(n.temps) + '</span></div>';
        if (txt(n, 'texte')) corps += '<div class="in-sec">' + esc(tx('Informations d\'installation', 'Installation information')) + '</div>' +
            '<div class="in-etape"><div class="in-txt">' + esc(txt(n, 'texte')) + '</div>' + autreLigne(txt(n, 'texte', true)) + '</div>';
        if (n.photos.length) corps += '<div class="in-sec">' + esc(tx('Photos', 'Photos')) + '</div><div class="in-photos">' + vignettes(n.photos) + '</div>';
        if (n.pieces.length) corps += '<div class="in-sec">' + esc(tx('Pièces et harnais', 'Parts and harnesses')) + '</div><ul class="in-pieces">' +
            n.pieces.map(function (p) { return '<li>' + esc(p.qte || '1') + ' × ' + esc(p.txt) + '</li>'; }).join('') + '</ul>';
        if (n.pieges || enDe(n).pieges) corps += '<div class="in-sec">⚠ ' + esc(tx('Pièges connus', 'Known pitfalls')) + '</div><div class="in-pieges"><div class="in-txt">' +
            esc(txt(n, 'pieges')) + '</div>' + autreLigne(txt(n, 'pieges', true)) + '</div>';
        if (!corps) corps = '<div class="in-note">' + esc(tx('Note vide pour l\'instant.', 'Empty note for now.')) + '</div>';
        var meta = [n.auteurNom ? tx('Écrite par {nom}', 'Written by {nom}', { nom: esc(n.auteurNom) }) + (quand(n.creeLe) ? ' ' + tx('le {d}', 'on {d}', { d: quand(n.creeLe) }) : '') : '',
                    n.modifieParNom && n.modifieLe !== n.creeLe ? tx('modifiée par {nom} le {d}', 'edited by {nom} on {d}', { nom: esc(n.modifieParNom), d: quand(n.modifieLe) }) : '',
                    n.valideParNom ? tx('validée par {nom} le {d}', 'approved by {nom} on {d}', { nom: esc(n.valideParNom), d: quand(n.valideLe) }) : ''].filter(Boolean).join(' · ');
        if (n.remplace) { var o = original(n.remplace); meta += '<br>' + esc(tx('Remplacera la note validée « {t} ».', 'Will replace the approved note "{t}".', { t: o ? titre(o) : '?' })); }
        var b = [], auteurBrouillon = n.statut === 'brouillon' && n.mien;
        if (ETAT.peutValider && n.statut === 'brouillon') b.push('<button type="button" class="in-btn ok" data-act="valider">✓ ' + esc(tx('Valider', 'Approve')) + '</button>');
        if (ETAT.peutValider || auteurBrouillon) b.push('<button type="button" class="in-btn" data-act="modifier">' + esc(tx('Modifier', 'Edit')) + '</button>');
        else if (n.statut === 'valide') b.push('<button type="button" class="in-btn" data-act="modifier">' + esc(tx('Proposer une modification', 'Propose a change')) + '</button>');
        if (ETAT.peutValider || auteurBrouillon) b.push('<button type="button" class="in-btn danger" data-act="supprimer">' + esc(tx('Supprimer', 'Delete')) + '</button>');
        var resume = [n.photos.length ? '📷 ' + n.photos.length : '', n.temps ? '⏱ ' + n.temps : ''].filter(Boolean).join(' · ');
        return '<div class="in-card' + (n.statut === 'brouillon' ? ' brouillon' : '') + (ETAT.ouvertes[n.id] ? ' open' : '') + '" data-id="' + esc(n.id) + '">' +
            '<div class="in-head"><b>' + esc(titre(n)) + '</b>' + tags + '<span class="in-nb">' + esc(resume) + '</span></div>' +
            '<div class="in-body">' + corps + '<div class="in-meta">' + meta + '</div><div class="in-actions">' + b.join('') + '</div></div></div>';
    }
    function dessiner() {
        var l = visibles(), nbB = ETAT.notes.filter(function (n) { return n.statut === 'brouillon'; }).length;
        $('c-brouillons').textContent = (ETAT.peutValider ? tx('Brouillons à valider', 'Drafts to approve') : tx('Mes brouillons', 'My drafts')) + ' (' + nbB + ')';
        $('in-compte').textContent = tx('{n} note(s) affichée(s) sur {t}', '{n} note(s) shown of {t}', { n: l.length, t: ETAT.notes.length });
        $('in-liste').innerHTML = l.length ? l.map(carte).join('') : '<div class="in-vide">' + esc(ETAT.notes.length
            ? tx('Aucune note ne correspond à ces filtres.', 'No note matches these filters.')
            : tx('La banque est vide pour l\'instant. Ajoutez la première installation avec « + Nouvelle note ».', 'The library is empty for now. Add the first installation with "+ New note".')) + '</div>';
        chargerPhotos($('in-liste'));
    }

    // ---------- photos : chargement paresseux (cartes ouvertes seulement), grand format ----------
    function chargerPhotos(zone) {
        [].forEach.call(zone.querySelectorAll('.in-photo.charge'), function (el) {
            if (!el.closest('.in-card.open') && !el.closest('.in-edit')) return;
            var pid = el.getAttribute('data-pid');
            var poser = function (u) { el.style.backgroundImage = 'url("' + u + '")'; el.classList.remove('charge'); };
            if (PHOTOS[pid]) { poser(PHOTOS[pid]); return; }
            if (el.dataset.attente) return;
            el.dataset.attente = '1';
            api({ action: 'getinstphoto', id: pid }).then(function (d) {
                if (d && d.ok && d.data) { PHOTOS[pid] = 'data:' + (d.type || 'image/jpeg') + ';base64,' + d.data; poser(PHOTOS[pid]); }
                else { el.classList.remove('charge'); el.title = msgErreur(d); }
            }, function () { delete el.dataset.attente; });
        });
    }
    document.addEventListener('click', function (e) {
        var ph = e.target.closest('.in-photo');
        if (!ph || e.target.closest('.x')) return;
        var u = PHOTOS[ph.getAttribute('data-pid')];
        if (!u) return;
        $('in-boite').querySelector('img').src = u;
        $('in-boite').style.display = 'flex';
    });
    $('in-boite').addEventListener('click', function () { $('in-boite').style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('in-boite').style.display = 'none'; });

    $('in-liste').addEventListener('click', function (e) {
        var c = e.target.closest('.in-card');
        if (!c || e.target.closest('.in-photo')) return;
        var id = c.getAttribute('data-id'), act = e.target.closest('[data-act]');
        if (!act) {
            if (e.target.closest('.in-head')) {
                // Une seule fiche ouverte a la fois (Steve, 2026-10-29)
                var ouvrir = !ETAT.ouvertes[id];
                ETAT.ouvertes = {};
                [].forEach.call($('in-liste').querySelectorAll('.in-card.open'), function (o) { o.classList.remove('open'); });
                if (ouvrir) { ETAT.ouvertes[id] = true; c.classList.add('open'); chargerPhotos(c); }
            }
            return;
        }
        var n = original(id), a = act.getAttribute('data-act');
        if (a === 'modifier') ouvrirEdition(n);
        else if (a === 'valider') {
            if (n.bilingue === false) { alert(msgErreur({ error: 'traduction incomplete' })); return; }
            act.disabled = true;
            api({ action: 'validateinst', id: id }).then(function (d) {
                if (!d || !d.ok) { alert(msgErreur(d)); act.disabled = false; return; }
                ok(d.remplacee ? tx('Proposition validée : la note d\'origine est mise à jour.', 'Proposal approved: the original note is updated.')
                               : tx('Note validée : elle est maintenant visible de toute l\'équipe.', 'Note approved: it is now visible to the whole team.'));
                charger();
            }, function () { alert(tx('Serveur injoignable.', 'Server unreachable.')); act.disabled = false; });
        } else if (a === 'supprimer') {
            if (!confirm(tx('Supprimer définitivement la note « {t} » ?', 'Permanently delete the note "{t}"?', { t: titre(n) }))) return;
            api({ action: 'deleteinst', id: id }).then(function (d) {
                if (!d || !d.ok) { alert(msgErreur(d)); return; }
                ok(tx('Note supprimée.', 'Note deleted.')); charger();
            }, function () { alert(tx('Serveur injoignable.', 'Server unreachable.')); });
        }
    });

    // ---------- edition ----------
    // « Autre… » en fin de liste : machine absente de la base, nom a preciser dans la case
    // qui apparait dessous (Steve, 2026-10-29). Type « Autre » => fabricant et modele aussi.
    var AUTRE = '__autre';
    function avecAutre(sel, valeurs, garder) {
        remplir(sel, valeurs, tx('— Choisir —', '— Choose —'), garder === AUTRE ? '' : garder);
        var o = document.createElement('option'); o.value = AUTRE; o.textContent = tx('Autre…', 'Other…');
        sel.appendChild(o);
        if (garder === AUTRE) sel.value = AUTRE;
    }
    function dessinerChoixEdition() {
        var t = $('e-type').value;
        avecAutre($('e-type'), types(), t);
        var tA = t === AUTRE;
        avecAutre($('e-fab'), tA ? [] : fabricants(t), tA ? AUTRE : $('e-fab').value);
        var f = $('e-fab').value, fA = f === AUTRE;
        avecAutre($('e-modele'), fA || !f ? [] : modeles(t, f), fA ? AUTRE : $('e-modele').value);
        ['type', 'fab', 'modele'].forEach(function (k) { $('e-' + k + '-autre').style.display = $('e-' + k).value === AUTRE ? '' : 'none'; });
        var tp = tA ? '' : t, po = prodOptions(tp);
        remplir($('e-produit'), po, tx('— Choisir —', '— Choose —'), offerte(po, $('e-produit').value));
        var p = produit($('e-produit').value);
        var oo = p ? optionsPour(p, tp).map(function (o) { return { v: o.k, t: enAnglais() ? o.en : o.fr }; }) : [];
        remplir($('e-option'), oo, tx('— Aucune —', '— None —'), offerte(oo, $('e-option').value));
        $('e-option').disabled = !oo.length;
    }
    $('e-type').addEventListener('change', function () { $('e-fab').value = ''; $('e-modele').value = ''; dessinerChoixEdition(); });
    $('e-fab').addEventListener('change', function () { $('e-modele').value = ''; dessinerChoixEdition(); });
    $('e-modele').addEventListener('change', dessinerChoixEdition);
    $('e-produit').addEventListener('change', function () { $('e-option').value = ''; dessinerChoixEdition(); });

    // Seule la langue de l'ecran est affichee : l'autre est cachee (CSS .autre-l) et
    // traduite a l'enregistrement. Changer FR / EN montre l'autre (Steve, 2026-10-29).
    function ordonnerLangues(zone) {
        var premiere = enAnglais() ? 'en' : 'fr';
        [].forEach.call(zone.querySelectorAll('.in-grid'), function (g) {
            var champs = [].slice.call(g.children).filter(function (x) { return x.getAttribute('data-l'); });
            champs.filter(function (x) { return x.getAttribute('data-l') === premiere; }).concat(
                champs.filter(function (x) { return x.getAttribute('data-l') !== premiere; })).forEach(function (x) {
                    x.classList.toggle('autre-l', x.getAttribute('data-l') !== premiere);
                    g.appendChild(x);
                });
        });
    }
    $('e-photos').addEventListener('click', function (e) {
        var x = e.target.closest('.in-photo .x');
        if (x) x.parentNode.remove();
    });

    // Photo reduite AVANT l'envoi : cote max 1600 px, JPEG, sous ~350 Ko (une photo de
    // telephone fait 3-6 Mo). Une photo = un appel serveur ; la vignette apparait quand
    // le serveur a repondu, et l'enregistrement attend la fin des envois.
    var MAX_COTE = 1600, MAX_OCTETS = 350000;
    function reduire(fichier) {
        return new Promise(function (res, rej) {
            var img = new Image(), url = URL.createObjectURL(fichier);
            img.onload = function () {
                URL.revokeObjectURL(url);
                var r = Math.min(1, MAX_COTE / Math.max(img.width, img.height));
                var c = document.createElement('canvas');
                c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                var q = 0.82, u = c.toDataURL('image/jpeg', q);
                while (u.length * 0.75 > MAX_OCTETS && q > 0.4) { q -= 0.1; u = c.toDataURL('image/jpeg', q); }
                res(u);
            };
            img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image illisible')); };
            img.src = url;
        });
    }
    $('e-file').addEventListener('change', function (e) {
        var zone = $('e-photos');
        [].forEach.call(e.target.files, function (f) {
            var tmp = document.createElement('div');
            tmp.className = 'in-photo charge';
            zone.appendChild(tmp);
            ETAT.envois++;
            var fini = function () { ETAT.envois--; };
            reduire(f).then(function (u) {
                return api({ action: 'uploadinstphoto', type: 'image/jpeg', data: u.split(',')[1] }).then(function (d) {
                    fini();
                    if (!d || !d.ok) { tmp.remove(); alert(msgErreur(d)); return; }
                    PHOTOS[d.id] = u;
                    tmp.setAttribute('data-pid', d.id);
                    tmp.classList.remove('charge');
                    tmp.style.backgroundImage = 'url("' + u + '")';
                    tmp.innerHTML = '<button type="button" class="x" title="' + esc(tx('Retirer', 'Remove')) + '">✕</button>';
                });
            }).catch(function () { fini(); tmp.remove(); alert(tx('Photo impossible à lire ou à envoyer.', 'Photo could not be read or sent.')); });
        });
        e.target.value = '';
    });

    // Pieces : recherche dans la liste SAV (pieces vendues ou soumissionnees), ou texte libre.
    function lignePiece(p) {
        var row = document.createElement('div');
        row.className = 'in-pr';
        row.innerHTML = '<div class="in-f in-ac"><input type="text" class="p-txt" maxlength="200"><div class="in-ac-list"></div></div>' +
            '<div class="in-f"><input type="number" class="p-qte" min="1" value="1"></div><button type="button" class="in-btn x" title="✕">✕</button>';
        $('e-pieces').appendChild(row);
        var inp = row.querySelector('.p-txt'), liste = row.querySelector('.in-ac-list');
        inp.placeholder = tx('Numéro ou description…', 'Number or description…');
        inp.value = (p && p.txt) || ''; row.querySelector('.p-qte').value = (p && p.qte) || '1';
        var items = [];
        inp.addEventListener('input', function () {
            var mots = norm(inp.value).trim().split(/\s+/).filter(Boolean);
            if (!mots.length || inp.value.trim().length < 2) { liste.style.display = 'none'; return; }
            items = ETAT.pieces.filter(function (x) { var h = norm(x[0] + ' ' + x[1]); return mots.every(function (m) { return h.indexOf(m) >= 0; }); }).slice(0, 12);
            liste.innerHTML = items.map(function (x, k) { return '<div data-k="' + k + '"><b>' + esc(x[0]) + '</b><small>' + esc(x[1]) + '</small></div>'; }).join('');
            liste.style.display = items.length ? 'block' : 'none';
        });
        liste.addEventListener('mousedown', function (e) {
            var d = e.target.closest('[data-k]'); if (!d) return;
            e.preventDefault();
            var x = items[+d.getAttribute('data-k')];
            inp.value = x[0] + ' — ' + x[1]; liste.style.display = 'none';
        });
        inp.addEventListener('blur', function () { setTimeout(function () { liste.style.display = 'none'; }, 150); });
        row.querySelector('button').addEventListener('click', function () { row.remove(); });
        return row;
    }
    $('b-piece').addEventListener('click', function () { lignePiece().querySelector('.p-txt').focus(); });

    function noteEdition(n) {
        var propose = n && n.statut === 'valide' && !ETAT.peutValider;
        $('e-titre').textContent = !n ? tx('Nouvelle note d\'installation', 'New installation note') : propose ? tx('Proposer une modification', 'Propose a change') : tx('Modifier la note', 'Edit the note');
        $('e-note').textContent = ETAT.peutValider ? tx('Vous êtes validateur : la note est publiée dès l\'enregistrement.', 'You are an approver: the note is published when saved.')
            : propose ? tx('La note actuelle reste affichée telle quelle jusqu\'à ce que votre modification soit validée.', 'The current note stays as is until your change is approved.')
            : tx('La note restera en brouillon (visible de vous et des validateurs) jusqu\'à sa validation.', 'The note stays a draft (visible to you and the approvers) until it is approved.');
    }
    function ouvrirEdition(n) {
        ETAT.edition = n || null;
        noteEdition(n);
        ['type', 'fab', 'modele'].forEach(function (k) { $('e-' + k + '-autre').value = ''; });
        // Nouvelle note : reprend les filtres en cours (ex. Excavatrice > Case > CX19, Limiteur).
        var src = n || { type: $('f-type').value, fabricant: $('f-fab').value, modele: $('f-modele').value, produit: $('f-produit').value, option: '' };
        avecAutre($('e-type'), types(), src.type || '');
        avecAutre($('e-fab'), fabricants(src.type), src.fabricant || '');
        avecAutre($('e-modele'), src.fabricant ? modeles(src.type, src.fabricant) : [], baseModele(src.modele));
        remplir($('e-produit'), prodOptions(''), '', src.produit || '');
        remplir($('e-option'), [], '', src.option || '');
        dessinerChoixEdition();
        $('e-temps').value = n ? n.temps || '' : '';
        $('e-pieges').value = n ? n.pieges || '' : '';
        $('e-pieges-en').value = n ? enDe(n).pieges || '' : '';
        $('e-texte').value = n ? n.texte || '' : '';
        $('e-texte-en').value = n ? enDe(n).texte || '' : '';
        $('e-photos').innerHTML = vignettes(n ? n.photos : [], true);
        $('e-pieces').innerHTML = '';
        (n ? n.pieces : []).forEach(lignePiece);
        ordonnerLangues($('in-edit'));
        document.querySelectorAll('.in-f.err').forEach(function (x) { x.classList.remove('err'); });
        $('e-alert').style.display = 'none';
        // Creation ou modification : les filtres et la liste disparaissent (Steve, 2026-10-28) ;
        // « Retour aux notes » en haut, Annuler ou Enregistrer en bas y ramenent.
        $('in-vue-liste').style.display = 'none';
        $('in-edit').style.display = 'block';
        chargerPhotos($('in-edit'));
        window.scrollTo(0, 0);
    }
    function fermerEdition() {
        $('in-edit').style.display = 'none'; ETAT.edition = null;
        $('in-vue-liste').style.display = '';
        window.scrollTo(0, 0);
    }
    $('b-retour').addEventListener('click', fermerEdition);
    $('b-nouvelle').addEventListener('click', function () { ouvrirEdition(null); });
    $('b-annuler').addEventListener('click', fermerEdition);

    function lireEdition() {
        var photos = [].map.call($('e-photos').querySelectorAll('.in-photo[data-pid]'), function (p) { return p.getAttribute('data-pid'); });
        var pieces = [].map.call($('e-pieces').children, function (r) { return { txt: r.querySelector('.p-txt').value.trim(), qte: r.querySelector('.p-qte').value || '1' }; })
            .filter(function (p) { return p.txt; });
        var val = function (k) { var v = $('e-' + k).value; return v === AUTRE ? $('e-' + k + '-autre').value.trim() : v; };
        return { type: val('type'), fabricant: val('fab'), modele: baseModele(val('modele')), produit: $('e-produit').value, option: $('e-option').value,
                 temps: $('e-temps').value.trim(), texte: $('e-texte').value.trim(), photos: photos, pieces: pieces, pieges: $('e-pieges').value.trim(),
                 en: { texte: $('e-texte-en').value.trim(), pieges: $('e-pieges-en').value.trim() } };
    }
    function valider(x) {
        var manque = [];
        var marque = function (id, ko, nom) { $(id).classList.toggle('err', ko); if (ko) manque.push(nom); };
        marque('w-type', !x.type, tx('type de machine', 'machine type'));   // « Autre… » sans precision = vide
        marque('w-fab', !x.fabricant, tx('fabricant', 'manufacturer'));
        marque('w-modele', !x.modele, tx('modèle', 'model'));
        marque('w-produit', !x.produit, tx('produit', 'product'));
        var a = $('e-alert');
        a.style.display = manque.length ? 'block' : 'none';
        a.textContent = manque.length ? tx('À compléter : {l}.', 'To complete: {l}.', { l: manque.join(', ') }) : '';
        return !manque.length;
    }
    $('b-enreg').addEventListener('click', function () {
        if (ETAT.envois > 0) { var a0 = $('e-alert'); a0.textContent = tx('Photos en cours d\'envoi : attendez quelques secondes.', 'Photos still uploading: wait a few seconds.'); a0.style.display = 'block'; return; }
        var x = lireEdition();
        if (!valider(x)) return;
        if (ETAT.edition) x.id = ETAT.edition.id;
        var b = $('b-enreg');
        b.disabled = true; b.textContent = tx('Enregistrement…', 'Saving…');
        var remettre = function () { b.disabled = false; b.textContent = tx('Enregistrer', 'Save'); };
        api({ action: 'saveinst', note: x }).then(function (d) {
            remettre();
            if (!d || !d.ok) { var a = $('e-alert'); a.textContent = msgErreur(d); a.style.display = 'block'; return; }
            fermerEdition();
            ETAT.ouvertes = {}; ETAT.ouvertes[d.note.id] = true;
            ok(d.proposition ? tx('Proposition envoyée : elle attend la validation.', 'Proposal sent: it awaits approval.')
               : d.note.statut === 'brouillon' ? tx('Note enregistrée en brouillon : visible de toute l\'équipe après validation.', 'Note saved as draft: visible to the whole team after approval.')
               : tx('Note enregistrée et publiée.', 'Note saved and published.'));
            charger();
        }, function () { remettre(); var a = $('e-alert'); a.textContent = tx('Serveur injoignable : rien n\'a été enregistré.', 'Server unreachable: nothing was saved.'); a.style.display = 'block'; });
    });

    window.addEventListener('langchange', function () {
        traduireZone(document); dessinerFiltres(); dessiner();
        if ($('in-edit').style.display === 'block') { noteEdition(ETAT.edition); dessinerChoixEdition(); ordonnerLangues($('in-edit')); }
    });

    // ---------- chargement ----------
    function charger() {
        api({ action: 'getinst' }).then(function (d) {
            if (d && d.error === 'forbidden') { refuser(); return; }
            if (!d || !d.ok) { $('in-compte').textContent = msgErreur(d); return; }
            ETAT.notes = (d.notes || []).map(function (n) { n.texte = n.texte || ''; n.photos = n.photos || []; n.pieces = n.pieces || []; n.pieges = n.pieges || ''; return n; });
            ETAT.peutValider = !!d.peutValider;
            dessinerFiltres();   // machines hors base des notes
            dessiner();
        }, function () { $('in-compte').textContent = tx('Banque indisponible pour le moment (serveur injoignable).', 'Library unavailable for now (server unreachable).'); });
    }
    // Liste des pieces : celle de la demande SAV (meme droit d'acces).
    api({ action: 'getsav' }).then(function (d) { if (d && d.ok && d.sav) ETAT.pieces = d.sav.pieces || []; }, function () {});

    traduireZone(document);
    $('in-compte').textContent = tx('Chargement…', 'Loading…');
    chargerMachines().then(function () {
        dessinerFiltres();
        // Arrivee depuis le Portail Machine : ?type=...&fab=...&modele=...&produit=...
        var qs = new URLSearchParams(location.search);
        if (qs.get('type')) { $('f-type').value = qs.get('type'); dessinerFiltres(); }
        if (qs.get('fab')) { $('f-fab').value = qs.get('fab'); dessinerFiltres(); }
        if (qs.get('modele')) { $('f-modele').value = baseModele(qs.get('modele')); dessinerFiltres(); }
        if (qs.get('produit')) $('f-produit').value = qs.get('produit');
        charger();
    });
})();
