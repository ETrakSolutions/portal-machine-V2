// Cedule des techniciens (decision Jacquot, 2026-09-25).
// Le serveur (action 'getcedule') lit ProgressionLive et ne renvoie que
// { genere, jours[], techs[{ nom, cases{ 'yyyy-mm-dd': [AM, PM] } }] } — true = FERME.
// Aucun client ni detail de tache n'arrive dans le navigateur. Le role est verifie par
// le serveur ; le controle ci-dessous ne fait qu'eviter d'afficher une page vide.
(function () {
    'use strict';
    // Acces regle dans le tableau des permissions (ceduleAccess, 2026-09-30) : le serveur
    // tranche ; un refus de sa part affiche la page « acces refuse ».
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    function refuser() {
        document.getElementById('ced-root').style.display = 'none';
        document.getElementById('ced-denied').style.display = 'block';
    }
    if (!user || user.isGuest || !user.token || (window.portalRoleLocked && window.portalRoleLocked(user.role, 'ceduleAccess'))) {
        refuser();
        return;
    }
    document.getElementById('ced-root').style.display = 'block';

    var t = function (k, p) { return (typeof i18n !== 'undefined') ? i18n.t(k, p) : k; };
    var lang = function () { return (typeof i18n !== 'undefined' && i18n.getLang) ? i18n.getLang() : 'fr'; };
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var DATA = null, semaine = 0, semaines = [];
    var MAJ_MS = 15 * 60 * 1000;          // meme rythme que le cache serveur (CEDULE_CACHE_S)
    var FOCUS_MS = 60 * 1000;             // delai minimal entre deux rechargements au focus
    var dernierChargement = 0;

    function lundiDe(j) {                       // 'yyyy-mm-dd' du lundi de la semaine de j
        var d = new Date(j + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        return d.toISOString().slice(0, 10);
    }
    function plus(j, n) { var d = new Date(j + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function fmtJour(j, opts) {
        return new Date(j + 'T12:00:00Z').toLocaleDateString(lang() === 'en' ? 'en-CA' : 'fr-CA', Object.assign({ timeZone: 'UTC' }, opts));
    }
    function aujourdhui() {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    }

    // Samedi et dimanche (ajoutes le 2026-10-27, demande de Jacquot) : la grille les montre
    // comme les autres jours, mais grises, pour que l'oeil ne les lise pas comme des jours
    // ouvrables. Les cases restent vraies — le serveur renvoie desormais les 7 jours.
    function estFinSemaine(j) { var d = new Date(j + 'T12:00:00Z').getUTCDay(); return d === 0 || d === 6; }

    // Separe le nom de la competence entre parentheses : « Jean Mallet (limiteur ...) »
    function nomEtNote(n) {
        var m = /^(.*?)\s*\((.*)\)\s*$/.exec(n);
        return m ? { nom: m[1], note: m[2] } : { nom: n, note: '' };
    }

    function dessiner() {
        var grid = document.getElementById('ced-grid');
        if (!DATA) return;
        if (!DATA.techs.length) { grid.className = 'ced-msg'; grid.textContent = t('ced.empty'); return; }
        var lun = semaines[semaine], jours = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return plus(lun, i); });
        var auj = aujourdhui();
        // Le sous-titre annonçait « 4 semaines » en dur. CEDULE_JOURS vaut 28 jours CIVILS
        // a partir d'aujourd'hui : ca ne tombe sur quatre lundis que si on est un lundi, les
        // six autres jours la grille en porte cinq. On affiche le compte reel.
        var st = document.getElementById('ced-sous-titre');
        if (st) st.textContent = t('ced.subtitle', { n: semaines.length });
        document.getElementById('ced-week').textContent = t('ced.week_of', { date: fmtJour(lun, { day: 'numeric', month: 'long', year: 'numeric' }) });
        document.getElementById('ced-prev').disabled = (semaine === 0);
        document.getElementById('ced-next').disabled = (semaine === semaines.length - 1);
        // « Cette semaine » : grise quand on y est deja, ou si la semaine courante n'est pas
        // dans la cedule recue (cas theorique — le serveur part toujours d'aujourd'hui).
        var iAuj = semaines.indexOf(lundiDe(auj));
        document.getElementById('ced-auj').disabled = (iAuj < 0 || iAuj === semaine);

        var h1 = '<tr class="ced-today-row"><th></th>', h2 = '<tr><th></th>';
        jours.forEach(function (j) {
            var cl = estFinSemaine(j) ? ' ced-we' : '';
            h1 += '<th colspan="2" class="ced-day' + cl + (j === auj ? ' ced-today' : '') + '">' +
                  esc(fmtJour(j, { weekday: 'short', day: 'numeric', month: 'short' })) + '</th>';
            h2 += '<th class="ced-day' + cl + '">' + t('ced.am') + '</th>' +
                  (cl ? '<th class="' + cl.trim() + '">' : '<th>') + t('ced.pm') + '</th>';
        });
        var rows = DATA.techs.map(function (tech) {
            var n = nomEtNote(tech.nom);
            var r = '<tr><td class="ced-name">' + esc(n.nom) + (n.note ? '<small>' + esc(n.note) + '</small>' : '') + '</td>';
            jours.forEach(function (j) {
                var c = tech.cases[j], we = estFinSemaine(j) ? ' ced-we' : '';
                [0, 1].forEach(function (k) {
                    var cl = ((k === 0 ? 'ced-am' : '') + we).trim();
                    var cls = cl ? ' class="' + cl + '"' : '';
                    if (!c) { r += '<td' + cls + '><span class="ced-cell ced-none">—</span></td>'; return; }
                    r += '<td' + cls + '><span class="ced-cell ' + (c[k] ? 'ced-closed">' + t('ced.closed') : 'ced-open">' + t('ced.open')) + '</span></td>';
                });
            });
            return r + '</tr>';
        }).join('');
        grid.className = '';
        grid.innerHTML = '<table class="ced"><thead>' + h1 + '</tr>' + h2 + '</tr></thead><tbody>' + rows + '</tbody></table>';
        var g = DATA.genere ? new Date(DATA.genere) : null;
        document.getElementById('ced-updated').textContent = g && !isNaN(g) ? t('ced.updated', {
            heure: g.toLocaleTimeString(lang() === 'en' ? 'en-CA' : 'fr-CA', { hour: '2-digit', minute: '2-digit' }) }) : '';
    }

    // Un rafraichissement qui echoue ne doit PAS effacer une grille qui marche : on garde
    // ce qui est a l'ecran. L'heure affichee en bas reste celle des donnees montrees, elle
    // ne ment donc pas. Seul un premier chargement rate laisse la page sur le message.
    function echec() {
        if (DATA) return;
        var grid = document.getElementById('ced-grid');
        grid.className = 'ced-msg';
        grid.textContent = t('ced.error');
    }

    function charger() {
        fetch(window.PORTAL_API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'getcedule', token: user.token })
        })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d && d.error === 'forbidden') { refuser(); return; }
                if (!d || !d.ok || !d.cedule) { echec(); return; }
                dernierChargement = Date.now();
                // La semaine REGARDEE survit au rafraichissement : ramener quelqu'un a la
                // semaine courante pendant qu'il consulte dans trois semaines serait hostile.
                var affichee = semaines[semaine] || null;
                DATA = d.cedule;
                var vus = {};
                semaines = [];
                (DATA.jours || []).forEach(function (j) { var l = lundiDe(j); if (!vus[l]) { vus[l] = 1; semaines.push(l); } });
                if (!semaines.length) semaines = [lundiDe(aujourdhui())];
                var i = affichee ? semaines.indexOf(affichee) : -1;
                semaine = i >= 0 ? i : 0;
                dessiner();
            })
            .catch(echec);
    }

    // Seam de test, comme window.__savMailto dans js/sav.js : le test navigateur declenche
    // un rafraichissement sans attendre quinze minutes.
    window.__cedCharger = charger;

    // Retour direct a la semaine courante : la navigation va jusqu'a quatre semaines en
    // avant, et il fallait cliquer « precedente » autant de fois pour revenir.
    document.getElementById('ced-auj').addEventListener('click', function () {
        var i = semaines.indexOf(lundiDe(aujourdhui()));
        if (i >= 0 && i !== semaine) { semaine = i; dessiner(); }
    });
    document.getElementById('ced-prev').addEventListener('click', function () { if (semaine > 0) { semaine--; dessiner(); } });
    document.getElementById('ced-next').addEventListener('click', function () { if (semaine < semaines.length - 1) { semaine++; dessiner(); } });
    window.addEventListener('langchange', dessiner);

    // Rafraichissement (2026-10-27). Le bas de la grille annonce « actualise aux 15 min » :
    // c'etait vrai du cache serveur et faux de la page, qui ne chargeait qu'une seule fois.
    // Une cedule laissee ouverte toute la matinee montrait des donnees figees, et le jour
    // courant finissait par etre le mauvais — d'autant plus depuis qu'on repere aujourd'hui
    // aux tirets des jours passes. Deux declencheurs : le temps, et le retour sur l'onglet.
    setInterval(function () { charger(); }, MAJ_MS);
    document.addEventListener('visibilitychange', function () {
        // Garde-fou : des alt-tab repetes ne doivent pas marteler le serveur.
        if (document.visibilityState === 'visible' && Date.now() - dernierChargement > FOCUS_MS) charger();
    });
    charger();
})();
