// Cedule des techniciens (decision Jacquot, 2026-09-25).
// Le serveur (action 'getcedule') lit ProgressionLive et ne renvoie que
// { genere, jours[], techs[{ nom, cases{ 'yyyy-mm-dd': [AM, PM] } }] } — true = FERME.
// Aucun client ni detail de tache n'arrive dans le navigateur. Le role est verifie par
// le serveur ; le controle ci-dessous ne fait qu'eviter d'afficher une page vide.
(function () {
    'use strict';
    var ROLES = { super_admin: 1, administrateur: 1, vente_interne: 1, vente_externe: 1, technicien: 1, ingenierie: 1 };
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    if (!user || user.isGuest || !user.token || !ROLES[user.role]) {
        document.getElementById('ced-denied').style.display = 'block';
        return;
    }
    document.getElementById('ced-root').style.display = 'block';

    var t = function (k, p) { return (typeof i18n !== 'undefined') ? i18n.t(k, p) : k; };
    var lang = function () { return (typeof i18n !== 'undefined' && i18n.getLang) ? i18n.getLang() : 'fr'; };
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var DATA = null, semaine = 0, semaines = [];

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

    // Separe le nom de la competence entre parentheses : « Jean Mallet (limiteur ...) »
    function nomEtNote(n) {
        var m = /^(.*?)\s*\((.*)\)\s*$/.exec(n);
        return m ? { nom: m[1], note: m[2] } : { nom: n, note: '' };
    }

    function dessiner() {
        var grid = document.getElementById('ced-grid');
        if (!DATA) return;
        if (!DATA.techs.length) { grid.className = 'ced-msg'; grid.textContent = t('ced.empty'); return; }
        var lun = semaines[semaine], jours = [0, 1, 2, 3, 4].map(function (i) { return plus(lun, i); });
        var auj = aujourdhui();
        document.getElementById('ced-week').textContent = t('ced.week_of', { date: fmtJour(lun, { day: 'numeric', month: 'long', year: 'numeric' }) });
        document.getElementById('ced-prev').disabled = (semaine === 0);
        document.getElementById('ced-next').disabled = (semaine === semaines.length - 1);

        var h1 = '<tr class="ced-today-row"><th></th>', h2 = '<tr><th></th>';
        jours.forEach(function (j) {
            h1 += '<th colspan="2" class="ced-day' + (j === auj ? ' ced-today' : '') + '">' +
                  esc(fmtJour(j, { weekday: 'short', day: 'numeric', month: 'short' })) + '</th>';
            h2 += '<th class="ced-day">' + t('ced.am') + '</th><th>' + t('ced.pm') + '</th>';
        });
        var rows = DATA.techs.map(function (tech) {
            var n = nomEtNote(tech.nom);
            var r = '<tr><td class="ced-name">' + esc(n.nom) + (n.note ? '<small>' + esc(n.note) + '</small>' : '') + '</td>';
            jours.forEach(function (j) {
                var c = tech.cases[j];
                [0, 1].forEach(function (k) {
                    var cls = k === 0 ? ' class="ced-am"' : '';
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

    function charger() {
        fetch(window.PORTAL_API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'getcedule', token: user.token })
        })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var grid = document.getElementById('ced-grid');
                if (!d || !d.ok || !d.cedule) {
                    grid.className = 'ced-msg';
                    grid.textContent = (d && d.error === 'forbidden') ? t('ced.denied_desc') : t('ced.error');
                    return;
                }
                DATA = d.cedule;
                var vus = {};
                semaines = [];
                (DATA.jours || []).forEach(function (j) { var l = lundiDe(j); if (!vus[l]) { vus[l] = 1; semaines.push(l); } });
                if (!semaines.length) semaines = [lundiDe(aujourdhui())];
                semaine = 0;
                dessiner();
            })
            .catch(function () {
                var grid = document.getElementById('ced-grid');
                grid.className = 'ced-msg';
                grid.textContent = t('ced.error');
            });
    }

    document.getElementById('ced-prev').addEventListener('click', function () { if (semaine > 0) { semaine--; dessiner(); } });
    document.getElementById('ced-next').addEventListener('click', function () { if (semaine < semaines.length - 1) { semaine++; dessiner(); } });
    window.addEventListener('langchange', dessiner);
    charger();
})();
