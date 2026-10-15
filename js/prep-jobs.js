// Preparation des jobs (decision Jacquot, 2026-10-15) : aide a Luna pour completer les
// jobs ProgressionLive avant le depart du technicien. Le serveur (action 'getprepjobs')
// lit ProgressionLive et ne renvoie, par job, que code, type, date, technicien, client,
// emplacement, ville, etat et trois verdicts — jamais un telephone ni une adresse.
// L'acces est reserve a quatre personnes nommees : le serveur tranche, la page ne fait
// qu'eviter un ecran vide pour un invite ou un compte externe.
(function () {
    'use strict';
    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    function refuser() {
        document.getElementById('pj-root').style.display = 'none';
        document.getElementById('pj-denied').style.display = 'block';
    }
    if (!user || user.isGuest || !user.token || user.role === 'dealer' || user.role === 'distributeur') {
        refuser();
        return;
    }
    document.getElementById('pj-root').style.display = 'block';

    var t = function (k, p) { return (typeof i18n !== 'undefined') ? i18n.t(k, p) : k; };
    var lang = function () { return (typeof i18n !== 'undefined' && i18n.getLang) ? i18n.getLang() : 'fr'; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var DATA = null;
    var URGENT_MS = 3 * 86400000;

    // Un SAV n'a pas de commande officielle avant la visite : on ne sait pas encore ce
    // qui sera change (decision Jacquot, 2026-10-15). La commande n'est exigee que hors SAV.
    function estSav(j) { return String(j.type || '').trim().toLowerCase() === 'sav'; }
    function commandeOk(j) { return estSav(j) || j.commande; }
    function contactOk(j) { return j.contactNom && j.telOk; }
    function complete(j) { return commandeOk(j) && contactOk(j) && j.emplacement; }
    // Ressource d'attente de ProgressionLive (« _A Planifier », « _HOLD », « _Pas prêt ») :
    // la date n'est pas reelle, la job reste dans le tableau mais n'est jamais urgente
    // (decision Jacquot, 2026-10-15).
    function enAttente(j) { return String(j.tech || '').trim().charAt(0) === '_'; }
    function urgent(j) {
        if (!j.rv || complete(j) || enAttente(j)) return false;
        return new Date(j.rv).getTime() - Date.now() <= URGENT_MS;
    }

    function verdict(ok, textesKo) {
        return '<span class="pj-v ' + (ok ? 'pj-ok">' + esc(t('pj.ok')) : 'pj-ko">' + textesKo.map(esc).join('<br>')) + '</span>';
    }
    function verdictContact(j) {
        if (contactOk(j)) return verdict(true);
        if (!j.contactNom && !j.telChiffres) return verdict(false, [t('pj.no_contact')]);
        var ko = [];
        if (!j.contactNom) ko.push(t('pj.no_name'));
        if (!j.telOk) ko.push(j.telChiffres ? t('pj.bad_tel', { n: j.telChiffres }) : t('pj.no_tel'));
        return verdict(false, ko);
    }
    function fmtDate(iso) {
        if (!iso) return t('pj.no_date');
        var d = new Date(iso), loc = lang() === 'en' ? 'en-CA' : 'fr-CA';
        return d.toLocaleDateString(loc, { timeZone: 'America/Toronto', weekday: 'short', day: 'numeric', month: 'short' }) +
            ' · ' + d.toLocaleTimeString(loc, { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit' });
    }

    function dessiner() {
        if (!DATA) return;
        var grid = document.getElementById('pj-grid');
        var jobs = DATA.jobs || [];
        var aFaire = jobs.filter(function (j) { return !complete(j); });
        var n = function (f) { return jobs.filter(f).length; };
        document.getElementById('pj-summary').innerHTML = esc(t('pj.summary', { n: aFaire.length, total: jobs.length })) +
            '<small>' + esc([t('pj.count_cmd', { n: n(function (j) { return !commandeOk(j); }) }),
                             t('pj.count_contact', { n: n(function (j) { return !contactOk(j); }) }),
                             t('pj.count_lieu', { n: n(function (j) { return !j.emplacement; }) })]
                            .concat(n(function (j) { return (j.aCorriger || []).length; }) ?
                                [t('pj.count_fix', { n: n(function (j) { return (j.aCorriger || []).length; }) })] : []).join(' · ')) + '</small>';
        var liste = document.getElementById('pj-todo').checked ? aFaire : jobs;
        if (!jobs.length) { grid.className = 'pj-msg'; grid.textContent = t('pj.empty'); return; }
        if (!liste.length) { grid.className = 'pj-msg'; grid.textContent = t('pj.all_done'); return; }
        var celluleCmd = function (j) {
            return estSav(j) ? '<span class="pj-v pj-na">' + esc(t('pj.cmd_na')) + '</span>' : verdict(j.commande, [t('pj.no_pdf')]);
        };
        // Case « Confirmer client » (decision Jacquot, 2026-10-15) : information, pas un
        // critere de completude. Une ressource d'attente n'a pas de date reelle : « — ».
        var celluleConf = function (j) {
            if (j.confirme) return verdict(true);
            if (enAttente(j)) return '<span class="pj-v pj-na">—</span>';
            return '<span class="pj-v pj-warn">' + esc(t('pj.conf_non')) + '</span>';
        };
        // Voyant des champs mal remplis (decision Jacquot, 2026-10-15) : information pour
        // corriger ProgressionLive, pas un critere de completude. Le serveur n'envoie que
        // des codes, jamais le contenu des champs.
        var voyants = function (j) {
            return (j.aCorriger || []).map(function (c) {
                return '<span class="pj-fix">' + esc(t('pj.fix_' + c)) + '</span>';
            }).join('');
        };
        var rows = liste.map(function (j) {
            var lieu = j.lieu ? esc(j.lieu) + (j.ville ? ' — ' + esc(j.ville) : '') : '';
            return '<tr class="pj-row' + (urgent(j) ? ' pj-urgent' : '') + '" data-code="' + esc(j.code) + '">' +
                '<td><span class="pj-date">' + esc(fmtDate(j.rv)) + '</span><small>' + esc(j.etat) + '</small></td>' +
                '<td><button type="button" class="pj-code" data-code="' + esc(j.code) + '" title="' + esc(t('pj.copy')) + '">' + esc(j.code) + '</button><small>' + esc(j.type) + '</small></td>' +
                '<td class="pj-nocmd">' + (j.noCommande ? esc(j.noCommande) : '<span class="pj-vide">—</span>') + voyants(j) + '</td>' +
                '<td>' + esc(j.client) + (lieu ? '<small>' + lieu + '</small>' : '') + '</td>' +
                '<td class="pj-tech">' + esc(j.tech) + '</td>' +
                '<td class="pj-c pj-cmd">' + celluleCmd(j) + '</td>' +
                '<td class="pj-c pj-contact">' + verdictContact(j) + '</td>' +
                '<td class="pj-c pj-lieu">' + verdict(j.emplacement, [t('pj.no_lieu')]) + '</td>' +
                '<td class="pj-c pj-conf">' + celluleConf(j) + '</td></tr>';
        }).join('');
        grid.className = '';
        grid.innerHTML = '<table class="pj"><thead><tr>' +
            ['pj.col_date', 'pj.col_job', 'pj.col_nocmd', 'pj.col_client', 'pj.col_tech'].map(function (k) { return '<th>' + esc(t(k)) + '</th>'; }).join('') +
            ['pj.col_cmd', 'pj.col_contact', 'pj.col_lieu', 'pj.col_conf'].map(function (k) { return '<th class="pj-c">' + esc(t(k)) + '</th>'; }).join('') +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
        var g = DATA.genere ? new Date(DATA.genere) : null;
        document.getElementById('pj-updated').textContent = g && !isNaN(g) ? t('pj.updated', {
            heure: g.toLocaleTimeString(lang() === 'en' ? 'en-CA' : 'fr-CA', { hour: '2-digit', minute: '2-digit' }) }) : '';
    }

    document.getElementById('pj-grid').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.pj-code') : null;
        if (!b) return;
        var code = b.getAttribute('data-code');
        var fini = function () { b.textContent = t('pj.copied'); setTimeout(function () { b.textContent = code; }, 1200); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(fini, fini);
        else fini();
    });

    function charger() {
        fetch(window.PORTAL_API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'getprepjobs', token: user.token })
        })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d && (d.error === 'forbidden' || d.error === 'authentication required')) { refuser(); return; }
                if (!d || !d.ok || !d.prep) {
                    var grid = document.getElementById('pj-grid');
                    grid.className = 'pj-msg';
                    grid.textContent = t('pj.error');
                    return;
                }
                DATA = d.prep;
                dessiner();
            })
            .catch(function () {
                var grid = document.getElementById('pj-grid');
                grid.className = 'pj-msg';
                grid.textContent = t('pj.error');
            });
    }

    document.getElementById('pj-todo').addEventListener('change', dessiner);
    window.addEventListener('langchange', dessiner);
    charger();
})();
