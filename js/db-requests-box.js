// Boite "Machines a creer" en haut de database.html, au-dessus des filtres.
//
// POURQUOI : avant, les demandes n'etaient visibles qu'en cliquant "Nouvelle machine".
// Deux personnes pouvaient donc partir sur la meme machine sans le savoir (cas reels :
// John Deere 320P / 320 P, Takeuchi TB125 / TB 125). La boite les met sous les yeux des
// l'ouverture de la BD, avec QUI l'a prise en charge et DEPUIS QUAND.
//
// PORTEE : c'est un SIGNAL, pas un verrou. La liste des demandes est un blob KV reecrit
// en entier ; deux prises en charge a la meme seconde -> la derniere gagne. On limite le
// risque en relisant la liste juste avant d'ecrire (read-modify-write cote page), mais
// un vrai verrou demanderait un endpoint dedie cote Apps Script.
(function () {
    'use strict';

    var API_URL = window.PORTAL_API_URL;
    var DB_ROLES = { super_admin: true, administrateur: true, ingenierie: true };

    var user = null;
    try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
    if (!user || !user.role || !DB_ROLES[user.role]) return;   // meme perimetre que la tuile BD

    var box = document.getElementById('db-requests-box');
    if (!box) return;

    var requests = [];
    var busy = false;

    function t(k, rep) { return (typeof i18n !== 'undefined') ? i18n.t(k, rep) : k; }
    function portalToken() {
        try { return (JSON.parse(localStorage.getItem('portal_user')) || {}).token || ''; } catch (e) { return ''; }
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }
    function me() { return (user && user.name) || (user && user.username) || ''; }

    // "14:02" si c'est aujourd'hui, sinon "2026-09-05 14:02".
    function since(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        var hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        var jour = d.toISOString().slice(0, 10);
        var aujourdhui = new Date().toISOString().slice(0, 10);
        return jour === aujourdhui ? hh : (jour + ' ' + hh);
    }

    function fetchRequests() {
        return fetch(API_URL + '?action=get&key=machine_requests')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var list = [];
                if (data && data.value) { try { list = JSON.parse(data.value) || []; } catch (e) { list = []; } }
                return Array.isArray(list) ? list : [];
            });
    }

    // Relit la liste fraiche, applique la modif sur LA demande visee, puis ecrit.
    // Evite d'ecraser une demande ajoutee ou modifiee entre-temps par quelqu'un d'autre.
    function mutate(id, fn) {
        if (busy) return;
        busy = true;
        render();
        return fetchRequests()
            .then(function (frais) {
                var cible = frais.filter(function (x) { return x && x.id === id; })[0];
                if (!cible) throw new Error('demande introuvable');
                fn(cible);
                return fetch(API_URL, {
                    method: 'POST', headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'save', key: 'machine_requests', value: JSON.stringify(frais), pin: portalToken() })
                }).then(function (r) { return r.json(); }).then(function (res) {
                    if (!res || res.ok === false) throw new Error((res && res.error) || 'echec');
                    requests = frais;
                });
            })
            .catch(function () { alert(t('dbr.save_error')); })
            .then(function () { busy = false; render(); });
    }

    function actives() {
        return requests.filter(function (r) { return r && r.status === 'active'; });
    }

    function render() {
        var list = actives();
        if (!list.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
        box.style.display = 'block';

        var html = '<div class="dbr-head">' +
            '<span class="dbr-title">&#127381; ' + esc(t('dbr.title')) + ' (' + list.length + ')</span>' +
            '<a class="dbr-link" href="machine-requests.html">' + esc(t('dbr.open_page')) + ' &rarr;</a>' +
            '</div><ul class="dbr-list">';

        list.forEach(function (r) {
            var pris = !!r.claimedBy;
            var parMoi = pris && r.claimedBy === me();
            html += '<li class="dbr-item' + (pris ? ' dbr-claimed' : '') + '">' +
                '<div class="dbr-machine">' +
                    '<span class="dbr-type">' + esc(t('type.' + r.type)) + '</span> &middot; ' +
                    '<strong>' + esc(r.fab) + ' ' + esc(r.modele) + '</strong> (' + esc(r.annee) + ')' +
                '</div>' +
                '<div class="dbr-meta">' + esc(t('dbr.requested_by', { name: r.requester || '?', date: r.date || '' })) + '</div>';

            if (pris) {
                html += '<div class="dbr-claim">&#128274; ' +
                    esc(t('dbr.in_progress', { name: r.claimedBy, time: since(r.claimedAt) })) + '</div>';
            }

            html += '<div class="dbr-actions">';
            if (!pris) {
                html += '<button class="dbr-btn dbr-btn-take" data-act="take" data-id="' + esc(r.id) + '">' + esc(t('dbr.take')) + '</button>';
            } else if (parMoi) {
                html += '<button class="dbr-btn" data-act="release" data-id="' + esc(r.id) + '">' + esc(t('dbr.release')) + '</button>';
            } else {
                html += '<button class="dbr-btn" data-act="take" data-id="' + esc(r.id) + '">' + esc(t('dbr.take_over')) + '</button>';
            }
            html += '<button class="dbr-btn dbr-btn-done" data-act="done" data-id="' + esc(r.id) + '">&#10003; ' + esc(t('dbr.done')) + '</button>' +
                '<a class="dbr-btn dbr-btn-go" href="machine-requests.html">' + esc(t('dbr.handle')) + '</a>' +
                '</div></li>';
        });

        box.innerHTML = html + '</ul>';
        if (busy) box.classList.add('dbr-busy'); else box.classList.remove('dbr-busy');

        box.querySelectorAll('button[data-act]').forEach(function (b) {
            b.addEventListener('click', function () {
                var id = b.getAttribute('data-id');
                var act = b.getAttribute('data-act');
                var req = requests.filter(function (x) { return x.id === id; })[0];
                if (!req) return;
                if (act === 'take') {
                    if (req.claimedBy && req.claimedBy !== me() &&
                        !confirm(t('dbr.confirm_take_over', { name: req.claimedBy }))) return;
                    mutate(id, function (x) { x.claimedBy = me(); x.claimedAt = new Date().toISOString(); });
                } else if (act === 'release') {
                    mutate(id, function (x) { delete x.claimedBy; delete x.claimedAt; });
                } else if (act === 'done') {
                    if (!confirm(t('dbr.confirm_done'))) return;
                    mutate(id, function (x) {
                        x.status = 'done';
                        x.doneDate = new Date().toISOString().slice(0, 10);
                        x.doneBy = me();
                    });
                }
            });
        });
    }

    fetchRequests().then(function (list) { requests = list; render(); }).catch(function () {});

    // Contenu genere en JS : translatePage() ne le voit pas. Sans ce reabonnement, la
    // boite resterait dans la langue d'origine apres une bascule FR/EN.
    window.addEventListener('langchange', render);
})();
