    (function () {
        'use strict';
        var API_URL = window.PORTAL_API_URL;  // #32 : js/config.js
        var DB_ROLES = { super_admin: true, administrateur: true, ingenierie: true };

        function t(k, fb) { return (typeof i18n !== 'undefined') ? i18n.t(k) : fb; }
        function portalToken() {
            try { return (JSON.parse(localStorage.getItem('portal_user')) || {}).token || ''; } catch (e) { return ''; }
        }
        var user = null;
        try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
        var hasAccess = user && user.role && DB_ROLES[user.role];
        if (!hasAccess) {
            document.querySelector('main').innerHTML =
                '<section class="selector-section"><p data-i18n="mr.unauthorized" style="color:#FF4444;text-align:center;padding:2rem;">' +
                t('mr.unauthorized', 'Acces non autorise. Connectez-vous avec un compte administrateur ou ingenierie.') +
                '</p></section>';
            return;  // ne PAS executer le reste (les elements #mr-* n'existent plus)
        }

        var requests = [];          // demandes actives
        var fullData = null;        // machines.json (types + verif existence)

        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
        function toast(msg) {
            var d = document.createElement('div'); d.className = 'mr-toast'; d.textContent = msg;
            document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
        }
        function showOverlay(msg) {
            var o = document.createElement('div'); o.className = 'mr-overlay'; o.id = 'mr-overlay';
            o.innerHTML = '<div class="mr-spinner"></div><div class="mr-overlay-text">' + esc(msg) + '</div>';
            document.body.appendChild(o); return o;
        }
        function hideOverlay() { var o = document.getElementById('mr-overlay'); if (o) o.remove(); }

        function machineExists(type, fab, annee, modele) {
            return !!(fullData && fullData[type] && fullData[type][fab] && fullData[type][fab][annee] && fullData[type][fab][annee][modele]);
        }

        // ---- Chargement types (depuis machines.json) + demandes ----
        function populateTypes() {
            var sel = document.getElementById('mr-type');
            if (!sel || !fullData) return;
            var types = Object.keys(fullData).filter(function (k) { return k.charAt(0) !== '_'; }).sort();
            sel.innerHTML = '';
            types.forEach(function (ty) {
                var o = document.createElement('option'); o.value = ty; o.textContent = t('type.' + ty, ty); sel.appendChild(o);
            });
        }

        function loadRequests() {
            return fetch(API_URL + '?action=get&key=machine_requests')
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var list = [];
                    if (data && data.value) { try { list = JSON.parse(data.value) || []; } catch (e) { list = []; } }
                    requests = Array.isArray(list) ? list : [];
                    renderTable();
                });
        }

        // Ecrit la liste complete (actives + autres statuts) cote serveur.
        function saveRequests(list) {
            return fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'save', key: 'machine_requests', value: JSON.stringify(list), pin: portalToken() })
            }).then(function (r) { return r.json(); });
        }

        function renderTable() {
            var wrap = document.getElementById('mr-table-wrap');
            var countEl = document.getElementById('mr-count');
            var active = requests.filter(function (r) { return r && r.status === 'active'; });
            if (countEl) countEl.textContent = active.length ? '(' + active.length + ')' : '';
            if (!active.length) {
                wrap.innerHTML = '<p class="mr-empty">' + t('mr.none', 'Aucune demande active.') + '</p>';
                return;
            }
            var html = '<table class="mr-table"><thead><tr>' +
                '<th>' + t('mr.f_type', 'Type') + '</th>' +
                '<th>' + t('mr.f_fab', 'Fabricant') + '</th>' +
                '<th>' + t('mr.f_model', 'Modele') + '</th>' +
                '<th>' + t('mr.f_year', 'Annee') + '</th>' +
                '<th>' + t('mr.col_requester', 'Demandeur') + '</th>' +
                '<th>' + t('mr.col_date', 'Date') + '</th>' +
                '<th></th></tr></thead><tbody>';
            active.forEach(function (r) {
                var exists = machineExists(r.type, r.fab, r.annee, r.modele);
                html += '<tr data-id="' + esc(r.id) + '">' +
                    '<td>' + esc(t('type.' + r.type, r.type)) + '</td>' +
                    '<td>' + esc(r.fab) + '</td>' +
                    '<td>' + esc(r.modele) + '</td>' +
                    '<td>' + esc(r.annee) + '</td>' +
                    '<td>' + esc(r.requester) + '</td>' +
                    '<td>' + esc(r.date) + '</td>' +
                    '<td><div class="mr-actions">' +
                    '<button class="mr-btn mr-btn-gen" data-act="gen" data-id="' + esc(r.id) + '"' + (exists ? ' title="' + t('mr.already_exists', 'Cette machine existe deja') + '"' : '') + '>' +
                    (exists ? t('mr.gen_exists', 'Existe deja') : t('mr.gen_btn', 'Generer')) + '</button>' +
                    '<button class="mr-btn mr-btn-reject" data-act="reject" data-id="' + esc(r.id) + '">' + t('mr.reject_btn', 'Rejeter') + '</button>' +
                    '</div></td></tr>';
            });
            html += '</tbody></table>';
            wrap.innerHTML = html;
            wrap.querySelectorAll('button[data-act]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var id = b.getAttribute('data-id');
                    var req = requests.filter(function (x) { return x.id === id; })[0];
                    if (!req) return;
                    if (b.getAttribute('data-act') === 'gen') generateMachine(req);
                    else rejectRequest(req);
                });
            });
        }

        // ---- Creation machine (endpoint existant updatemachinespecs : cree l'entree) ----
        // Champs techniques attendus pour CE TYPE : copies d'une machine existante du meme
        // type (valeur "A completer"). Ainsi la nouvelle machine s'ouvre dans l'edition avec
        // les bons champs a remplir (edit-machine derive le formulaire des cles de la machine).
        function specTemplateForType(type) {
            var specs = {};
            var t = fullData && fullData[type];
            if (!t) return specs;
            for (var f in t) {
                if (f.charAt(0) === '_') continue;
                for (var y in t[f]) {
                    for (var m in t[f][y]) {
                        var e = t[f][y][m] || {};
                        var keys = Object.keys(e).filter(function (k) {
                            return k.charAt(0) !== '_' && k !== 'Flag' && k !== 'Image';
                        });
                        if (keys.length) { keys.forEach(function (k) { specs[k] = 'A completer'; }); return specs; }
                    }
                }
            }
            return specs;
        }
        function createMachine(type, fab, annee, modele) {
            return fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'updatemachinespecs',
                    type: type, fab: fab, annee: String(annee), modele: modele,
                    specs: specTemplateForType(type), pin: portalToken()
                })
            }).then(function (r) { return r.json(); });
        }

        function gotoEdit(type, fab, annee, modele) {
            window.location.href = 'edit-machine.html?type=' + encodeURIComponent(type) +
                '&fab=' + encodeURIComponent(fab) + '&year=' + encodeURIComponent(annee) +
                '&model=' + encodeURIComponent(modele) + '&fresh=1';
        }

        // Apres creation : demande a l'admin (qui a une licence Claude) d'ouvrir Claude et de
        // coller l'instruction pour remplir les specs (recherche source officielle via le skill
        // portal-fill-specs). Le bouton "Generer" ne remplit que le squelette ; Claude fait les specs.
        function showClaudePrompt(type, fab, modele, annee) {
            var ex = document.getElementById('claude-prompt-modal'); if (ex) ex.remove();
            var instr = 'remplis les specs de ' + fab + ' ' + modele + ' (' + annee + ') sur toutes les annees disponibles';
            var m = document.createElement('div'); m.id = 'claude-prompt-modal';
            m.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(8,12,20,0.72);display:flex;align-items:center;justify-content:center';
            m.innerHTML = '<div style="background:#141d2b;border:1px solid #2a3a4a;border-radius:12px;padding:1.4rem 1.6rem;max-width:480px;width:92%;color:#e8eef5">' +
                '<h2 style="margin:0 0 .5rem;font-size:1.1rem">✅ ' + t('mr.created_title','Machine creee') + '</h2>' +
                '<p style="margin:0 0 .8rem;color:#9fb0c0;font-size:.9rem">' + t('mr.claude_desc','Pour remplir ses specifications, ouvrez Claude et collez cette demande :') + '</p>' +
                '<textarea id="claude-instr" readonly style="width:100%;box-sizing:border-box;height:54px;padding:.6rem;border:1px solid #2f86e8;border-radius:7px;background:#0c1420;color:#fff;font-size:.85rem;resize:none">' + instr.replace(/</g,'&lt;') + '</textarea>' +
                '<div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem;flex-wrap:wrap">' +
                '<button id="claude-copy" style="padding:.55rem 1rem;border:none;border-radius:7px;font-weight:700;cursor:pointer;background:#0062CC;color:#fff">📋 ' + t('mr.copy','Copier la demande') + '</button>' +
                '<button id="claude-edit" style="padding:.55rem 1rem;border:1px solid #2a3a4a;border-radius:7px;font-weight:700;cursor:pointer;background:transparent;color:#cfe0f5">' + t('mr.open_edit','Editer manuellement') + '</button>' +
                '<button id="claude-close" style="padding:.55rem 1rem;border:1px solid #2a3a4a;border-radius:7px;cursor:pointer;background:transparent;color:#9fb0c0">' + t('mr.close','Fermer') + '</button>' +
                '</div></div>';
            document.body.appendChild(m);
            document.getElementById('claude-copy').onclick = function(){
                var ta = document.getElementById('claude-instr'); ta.select();
                try { document.execCommand('copy'); } catch(e){}
                if (navigator.clipboard) { navigator.clipboard.writeText(instr).catch(function(){}); }
                this.textContent = '✓ ' + t('mr.copied','Copie !');
            };
            document.getElementById('claude-edit').onclick = function(){ gotoEdit(type, fab, annee, modele); };
            document.getElementById('claude-close').onclick = function(){ m.remove(); renderTable(); };
        }

        function generateMachine(req) {
            if (machineExists(req.type, req.fab, req.annee, req.modele)) {
                if (!confirm(t('mr.confirm_exists', 'Cette machine existe deja dans la BD. Ouvrir son edition ?'))) return;
                gotoEdit(req.type, req.fab, req.annee, req.modele);
                return;
            }
            var ov = showOverlay(t('mr.generating', 'Generation en cours... (peut prendre jusqu\'a une minute)'));
            createMachine(req.type, req.fab, req.annee, req.modele)
                .then(function (res) {
                    if (!res || res.ok === false) throw new Error((res && res.error) || 'echec');
                    // Marquer la demande comme traitee, puis rediriger vers l'edition.
                    req.status = 'done'; req.doneDate = new Date().toISOString().slice(0, 10);
                    return saveRequests(requests);
                })
                .then(function () { hideOverlay(); showClaudePrompt(req.type, req.fab, req.modele, req.annee); })
                .catch(function () { hideOverlay(); alert(t('mr.gen_error', 'Erreur lors de la generation. Reessayez.')); });
        }

        function rejectRequest(req) {
            if (!confirm(t('mr.confirm_reject', 'Rejeter cette demande ?'))) return;
            req.status = 'rejected'; req.rejectedDate = new Date().toISOString().slice(0, 10);
            saveRequests(requests).then(function () { renderTable(); toast(t('mr.rejected', 'Demande rejetee.')); });
        }

        // ---- Ajout manuel ----
        function addManual() {
            var type = document.getElementById('mr-type').value;
            var fab = (document.getElementById('mr-fab').value || '').trim();
            var modele = (document.getElementById('mr-model').value || '').trim();
            var annee = (document.getElementById('mr-year').value || '').trim();
            if (!type || !fab || !modele || !annee) { alert(t('mr.fill_all', 'Remplissez Type, Fabricant, Modele et Annee.')); return; }
            if (!/^\d{4}$/.test(annee)) { alert(t('mr.bad_year', 'Annee invalide (4 chiffres attendus).')); return; }
            if (machineExists(type, fab, annee, modele)) {
                if (!confirm(t('mr.confirm_exists', 'Cette machine existe deja dans la BD. Ouvrir son edition ?'))) return;
                gotoEdit(type, fab, annee, modele); return;
            }
            var btn = document.getElementById('mr-add-btn'); btn.disabled = true;
            var ov = showOverlay(t('mr.generating', 'Generation en cours... (peut prendre jusqu\'a une minute)'));
            createMachine(type, fab, annee, modele)
                .then(function (res) {
                    if (!res || res.ok === false) throw new Error((res && res.error) || 'echec');
                    hideOverlay(); btn.disabled = false; showClaudePrompt(type, fab, modele, annee);
                })
                .catch(function () { hideOverlay(); btn.disabled = false; alert(t('mr.gen_error', 'Erreur lors de la generation. Reessayez.')); });
        }

        // ---- Init ----
        document.getElementById('mr-add-btn').addEventListener('click', addManual);
        Promise.all([
            fetch('data/machines.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return {}; }),
            loadRequests()
        ]).then(function (res) {
            fullData = res[0] || {};
            populateTypes();
            renderTable();  // re-render pour afficher l'etat "existe deja"
        });

        // Le tableau des demandes et la liste des types sont construits en JS :
        // aucun data-i18n, donc translatePage() ne les voit pas. Sans ce
        // reabonnement, ils restaient dans la langue d origine apres une
        // bascule (audit du 2026-08-07). On preserve le type selectionne :
        // populateTypes() vide la liste avant de la reconstruire.
        window.addEventListener('langchange', function () {
            if (!fullData) return;
            var sel = document.getElementById('mr-type');
            var choisi = sel ? sel.value : '';
            populateTypes();
            if (sel && choisi) sel.value = choisi;
            renderTable();
        });
    })();
