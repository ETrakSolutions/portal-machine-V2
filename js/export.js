    (function () {
        'use strict';

        // ---- Auth : Super Admin + Administrateur ----
        var EXPORT_ROLES = { super_admin: true, administrateur: true };
        var user = null;
        try { user = JSON.parse(localStorage.getItem('portal_user')); } catch (e) {}
        if (!user || !EXPORT_ROLES[user.role]) {
            document.getElementById('exp-denied').style.display = 'block';
            return;
        }
        document.getElementById('exp-root').style.display = 'block';

        // Ordre canonique des types (= slugs du loader)
        var TYPE_ORDER = [
            'Excavatrice', 'Pompe a Beton', 'Grue Mobile', 'Camion Girafe (Boom Truck)',
            'Telehandler', 'Foreuse', 'Camion Vacuum', 'Retrocaveuse', 'Loader', 'Nacelle'
        ];
        var SLUGS = window.ETRAK_TYPE_SLUGS || {};

        var API_URL = window.PORTAL_API_URL;  // #32 : js/config.js
        var MACHINES = {};   // machines.json (specs + _bom_labels)
        var OVERRIDES = {};  // overrides fusionnes (_bom / _notes)
        var FLAGS = {};      // db_flags (warnings) : { "TYPE|FAB|MODEL|ANNEE": {flaggedBy,flaggedAt,note,active} }

        function toast(msg) {
            var t = document.getElementById('exp-toast');
            t.textContent = msg; t.style.display = 'block';
            clearTimeout(t._timer); t._timer = setTimeout(function () { t.style.display = 'none'; }, 2600);
        }

        // Map code BOM -> libelle lisible, depuis _bom_labels du type.
        // _bom_labels a des cles type "0000 Cabine" ; le _bom utilise le code "0000".
        function labelMap(typeName) {
            var map = {};
            var labels = MACHINES[typeName] && MACHINES[typeName]._bom_labels;
            if (labels) {
                for (var k in labels) {
                    var code = k.split(' ')[0];
                    var pn = labels[k] && labels[k].pn ? '\n' + labels[k].pn : '';   // PN sur 2e ligne
                    map[code] = k + pn;
                }
            }
            return map;
        }

        function normVal(v) {
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
        }

        // Vrai code d'option BOM ? (exclut les cles internes : _removed, _custom, rows, customRows, undefined)
        function isOptionCode(k) {
            if (!k || k === 'undefined') return false;
            if (k.charAt(0) === '_') return false;            // _removed, _custom, _specs...
            if (k === 'rows' || k === 'customRows') return false;
            return true;
        }

        // Couleur de remplissage (ARGB) pour un drapeau BOM ; null si pas un drapeau.
        function colorFor(v) {
            if (v === null || v === undefined) return null;
            var low = String(v).toLowerCase();
            if (low === 'r') return 'FFFF0000';   // rouge = obligatoire
            if (low === 'j') return 'FFFFFF00';   // jaune = option
            if (low === 'v') return 'FFE07B00';   // orange = a verifier
            // 'na' (non applicable) -> aucun point : la case reste vide
            return null;
        }

        var STATUS_LABEL = { r: 'obligatoire', j: 'option', v: 'a verifier', na: 'n/a' };

        // Texte resumant les items ajoutes manuellement (_custom)
        function customText(bom) {
            var c = bom && bom._custom;
            if (!Array.isArray(c) || !c.length) return '';
            return c.map(function (it) {
                var st = STATUS_LABEL[String(it.status || '').toLowerCase()] || it.status || '';
                var pn = it.pn ? ' (' + it.pn + ')' : '';
                return (it.desc || it.code || '?') + pn + (st ? ' [' + st + ']' : '');
            }).join('  |  ');
        }

        // Texte du drapeau (warning) actif pour une machine
        function flagText(flag) {
            if (!flag || !flag.active) return '';
            return '⚠ ' + (flag.note || i18n.t('exp.no_note')) + ' — ' + (flag.flaggedBy || '?') + (flag.flaggedAt ? ' (' + flag.flaggedAt + ')' : '');
        }

        // Harnais de coupure (item necessaire des excavatrices) : defaut + override
        // calcules par la source unique js/kit-rules.js (KR).
        function harnaisText(fab, mod, ov) {
            var h = ov ? KR.harnaisOverride(ov) : KR.harnais(fab, mod);
            return h.code + ' (' + h.name + ')';
        }

        // ====== Regles de defaut : SOURCE UNIQUE = js/kit-rules.js (window.KitRules) ======
        // L'etat AFFICHE = defauts calcules + overrides. L'export reflete ce qui est visible
        // dans la BD, identique aux autres tuiles car meme source de regles.
        var KR = window.KitRules;

        function typeCodes(typeName) {
            if (typeName === 'Excavatrice') return KR.EXC_CODES;
            if (typeName === 'Pompe a Beton') return KR.POMPE_CODES;
            // Auto-adaptatif : tout type ayant des _bom_labels expose ses options.
            // Le code est le 1er token de chaque cle ("0000 Cabine" -> "0000").
            var labels = MACHINES[typeName] && MACHINES[typeName]._bom_labels;
            if (labels) return Object.keys(labels).map(function (k) { return k.split(' ')[0]; });
            return [];
        }

        // Etat affiche par code (r/j/v/na) = defaut + override + _removed
        function computeState(typeName, modele, specs, bom) {
            var defaults;
            if (typeName === 'Excavatrice') defaults = KR.excDefaults(specs, modele);
            else if (typeName === 'Pompe a Beton') defaults = KR.pompeDefaults(specs);
            else {
                // BD maitre : defaut 'def' stocke dans _bom_labels du type ("0300 Avec cabine" -> {def})
                defaults = {};
                var labels = MACHINES[typeName] && MACHINES[typeName]._bom_labels;
                if (labels) {
                    Object.keys(labels).forEach(function (k) {
                        var code = k.split(' ')[0];
                        defaults[code] = (labels[k] && labels[k].def) || 'na';
                    });
                }
                // Nacelle : base selon la categorie (articulee -> 0903, sinon 0900)
                if (typeName === 'Nacelle' && KR.nacelleDefaults) {
                    var nd = KR.nacelleDefaults(specs);
                    for (var c in nd) defaults[c] = nd[c];
                }
            }
            return KR.applyOverride(defaults, bom || {}, typeName === 'Excavatrice');
        }

        // Construit le BOM d'un type : { aoa, fills, redCells }.
        // Iteration sur TOUTES les machines (machines.json) -> etat affiche calcule comme le portail.
        function bomAoa(typeName) {
            var mNode = MACHINES[typeName] || {};
            var ovNode = OVERRIDES[typeName] || {};
            var codes = typeCodes(typeName);
            var lm = labelMap(typeName);
            var isExc = (typeName === 'Excavatrice');   // colonne Harnais : excavatrices seulement
            var rows = [];
            for (var fab in mNode) {
                if (fab === '_bom_labels') continue;
                for (var an in mNode[fab]) for (var mod in mNode[fab][an]) {
                    var entry = mNode[fab][an][mod];
                    if (!entry || typeof entry !== 'object') continue;
                    var ovEntry = (ovNode[fab] && ovNode[fab][an] && ovNode[fab][an][mod]) || {};
                    var bom = ovEntry._bom || {};
                    rows.push({
                        fab: fab, an: an, mod: mod,
                        state: computeState(typeName, mod, entry, bom),
                        bom: bom, notes: ovEntry._notes || '', harn: ovEntry.harnais || ''
                    });
                }
            }
            // Collecte les pieces custom DISTINCTES du type -> 1 colonne par piece.
            // Cle = code (ou pn) ; chaque machine recoit un point colore selon le statut de SA piece.
            var customCols = [], customSeen = {};
            rows.forEach(function (r) {
                r.cmap = {};
                var c = r.bom && r.bom._custom;
                if (Array.isArray(c)) c.forEach(function (it) {
                    var key = it.code || it.pn || it.desc;
                    if (!key) return;
                    r.cmap[key] = String(it.status || 'r').toLowerCase();
                    if (!customSeen[key]) {
                        customSeen[key] = true;
                        var pn = it.pn || it.code || '';
                        customCols.push({ key: key, label: (it.desc || key) + (pn ? '\n' + pn : '') });   // PN sur 2e ligne
                    }
                });
            });

            var header = [i18n.t('exp.col_type'), i18n.t('exp.col_fabricant'), i18n.t('exp.col_annee'), i18n.t('exp.col_modele')];
            codes.forEach(function (c) { header.push(lm[c] || c); });
            var cHarnais = isExc ? (header.push(i18n.t('exp.col_harnais')) - 1) : -1;
            var cCustomStart = header.length;                 // 1re colonne piece custom
            customCols.forEach(function (cc) { header.push(cc.label); });
            var cNotes = header.push(i18n.t('exp.col_notes')) - 1;
            var cFlag = header.push(i18n.t('exp.col_drapeau')) - 1;
            var aoa = [header], fills = [], redCells = [];
            rows.sort(function (a, b) { return (a.fab + a.mod + a.an).localeCompare(b.fab + b.mod + b.an); });
            rows.forEach(function (r) {
                var rowIdx = aoa.length;
                var line = [i18n.t('type.' + typeName), r.fab, r.an, r.mod];
                codes.forEach(function (c, ci) {
                    var rgb = colorFor(r.state[c]);
                    if (rgb) { line.push('●'); fills.push({ r: rowIdx, c: 4 + ci, rgb: rgb }); }
                    else { line.push(''); }
                });
                if (isExc) line[cHarnais] = harnaisText(r.fab, r.mod, r.harn);
                customCols.forEach(function (cc, ci) {
                    var rgb = r.cmap[cc.key] ? colorFor(r.cmap[cc.key]) : null;
                    var col = cCustomStart + ci;
                    if (rgb) { line[col] = '●'; fills.push({ r: rowIdx, c: col, rgb: rgb }); }
                    else { line[col] = ''; }
                });
                line[cNotes] = r.notes;
                var flag = FLAGS[typeName + '|' + r.fab + '|' + r.mod + '|' + r.an];
                var ft = flagText(flag);
                line[cFlag] = ft;
                if (ft) redCells.push({ r: rowIdx, c: cFlag });
                aoa.push(line);
            });
            return { aoa: aoa, fills: fills, redCells: redCells };
        }

        function specsAoa(typeName) {
            var node = MACHINES[typeName] || {};
            var rows = [], keySet = {};
            for (var fab in node) {
                if (fab === '_bom_labels') continue;
                for (var an in node[fab]) for (var mod in node[fab][an]) {
                    var e = node[fab][an][mod];
                    if (!e || typeof e !== 'object') continue;
                    var specs = {};
                    for (var k in e) { if (k.charAt(0) !== '_' && k !== 'Image' && k !== 'Flag') { specs[k] = e[k]; keySet[k] = true; } }
                    rows.push({ fab: fab, an: an, mod: mod, specs: specs });
                }
            }
            var keys = Object.keys(keySet);
            var header = [i18n.t('exp.col_type'), i18n.t('exp.col_fabricant'), i18n.t('exp.col_annee'), i18n.t('exp.col_modele')].concat(keys);
            var aoa = [header];
            rows.sort(function (a, b) { return (a.fab + a.mod + a.an).localeCompare(b.fab + b.mod + b.an); });
            rows.forEach(function (r) {
                var line = [i18n.t('type.' + typeName), r.fab, r.an, r.mod];
                keys.forEach(function (k) { line.push(normVal(r.specs[k])); });
                aoa.push(line);
            });
            return aoa;
        }

        // Ligne de legende (point rouge/jaune/gris) — affichee en haut de la feuille BOM
        function legendRichText() {
            return { richText: [
                { text: i18n.t('exp.legend_title') + '  ', font: { bold: true, size: 11 } },
                { text: '● ', font: { color: { argb: 'FFFF0000' }, bold: true, size: 14 } }, { text: i18n.t('exp.legend_obligatoire') + '     ', font: { size: 11 } },
                { text: '● ', font: { color: { argb: 'FFE6C000' }, bold: true, size: 14 } }, { text: i18n.t('exp.legend_option') + '     ', font: { size: 11 } },
                { text: '● ', font: { color: { argb: 'FFE07B00' }, bold: true, size: 14 } }, { text: i18n.t('exp.legend_verifier'), font: { size: 11 } }
            ] };
        }

        // Construit une feuille ExcelJS. withLegend=true ajoute une ligne legende en haut.
        // Volets figes : la legende (si presente) + la ligne d'en-tete restent visibles au defilement.
        function buildSheet(wb, sheetName, aoa, fills, withLegend, redCells) {
            var nCols = aoa[0].length;
            var headerRow = withLegend ? 2 : 1;          // ligne de l'en-tete dans Excel
            var ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: headerRow }] });
            ws.properties.defaultRowHeight = 20;          // laisse respirer les points plus gros

            if (withLegend) {
                ws.addRow([]);                           // ligne 1 = legende
                ws.mergeCells(1, 1, 1, nCols);
                var lc = ws.getCell(1, 1);
                lc.value = legendRichText();
                lc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E0' } };  // creme clair
                ws.getRow(1).height = 22;
            }
            var hr = ws.addRow(aoa[0]);                   // en-tete
            hr.height = 34;                               // 2 lignes : libelle + n° de produit
            hr.eachCell({ includeEmpty: true }, function (cell) {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A2A2A' } };  // ardoise e-Trak
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.border = { bottom: { style: 'medium', color: { argb: 'FFFFB74D' } } };          // liseré orange
            });
            for (var i = 1; i < aoa.length; i++) { ws.addRow(aoa[i]); }   // donnees

            // Points de couleur (drapeaux BOM) : caractere ● centre, couleur de police
            (fills || []).forEach(function (f) {
                var cell = ws.getCell(headerRow + f.r, f.c + 1);   // f.r = index aoa (0=en-tete)
                cell.value = '●';
                cell.font = { color: { argb: f.rgb }, size: 18, bold: true };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            // Cellules drapeau (warnings) en rouge gras
            (redCells || []).forEach(function (rc) {
                var cell = ws.getCell(headerRow + rc.r, rc.c + 1);
                cell.font = { color: { argb: 'FFCC0000' }, bold: true };
            });

            ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + aoa.length - 1, column: nCols } };

            // Largeur basee sur la LIGNE la plus longue (les en-tetes multi-lignes ne gonflent pas la colonne)
            function lineLen(v) {
                return String(v).split('\n').reduce(function (mx, s) { return Math.max(mx, s.length); }, 0);
            }
            for (var c = 0; c < nCols; c++) {
                var w = lineLen(aoa[0][c]);
                for (var r = 1; r < Math.min(aoa.length, 200); r++) { var v = aoa[r][c]; if (v != null) w = Math.max(w, lineLen(v)); }
                ws.getColumn(c + 1).width = Math.min(45, Math.max(8, w + 2));
            }
            return ws;
        }

        function saveWorkbook(wb, filename) {
            return wb.xlsx.writeBuffer().then(function (buf) {
                var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob); a.download = filename;
                document.body.appendChild(a); a.click();
                setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
            });
        }

        function safeName(s) { return s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28) || 'Sheet'; }

        function countBom(typeName) {
            var node = MACHINES[typeName] || {}, n = 0;
            for (var fab in node) { if (fab === '_bom_labels') continue;
                for (var an in node[fab]) for (var mod in node[fab][an]) {
                    var e = node[fab][an][mod];
                    if (e && typeof e === 'object') n++;
                }
            }
            return n;
        }

        function downloadType(typeName) {
            var x = bomAoa(typeName);
            var wb = new ExcelJS.Workbook();
            buildSheet(wb, safeName(typeName), x.aoa, x.fills, true, x.redCells);
            saveWorkbook(wb, 'BOM_' + (SLUGS[typeName] || safeName(typeName)) + '.xlsx');
            toast(i18n.t('exp.toast_export', { typeName: i18n.t('type.' + typeName), n: (x.aoa.length - 1) }));
        }

        function downloadAllBom() {
            var wb = new ExcelJS.Workbook();
            TYPE_ORDER.forEach(function (t) { var x = bomAoa(t); buildSheet(wb, safeName(t), x.aoa, x.fills, true, x.redCells); });
            saveWorkbook(wb, 'BOM_tous_types.xlsx');
            toast(i18n.t('exp.toast_all_bom', { n: TYPE_ORDER.length }));
        }

        function downloadAllSpecs() {
            var wb = new ExcelJS.Workbook();
            TYPE_ORDER.forEach(function (t) { buildSheet(wb, safeName(t), specsAoa(t), null, false); });
            saveWorkbook(wb, 'Specifications_machines.xlsx');
            toast(i18n.t('exp.toast_all_specs', { n: TYPE_ORDER.length }));
        }

        function buildMenu() {
            var grid = document.getElementById('exp-bom-grid');
            grid.innerHTML = '';
            TYPE_ORDER.forEach(function (t) {
                var n = countBom(t);
                var row = document.createElement('div');
                row.className = 'exp-row';
                var info = document.createElement('div');
                info.className = 'exp-row-info';
                var hasKit = (typeCodes(t).length > 0);
                info.innerHTML = '<div class="exp-row-title">' + i18n.t('type.' + t) + '</div>' +
                    '<div class="exp-row-sub">' + i18n.t('exp.machine_count', { n: n }) + (hasKit ? ' &middot; ' + i18n.t('exp.kit_bom') : ' &middot; ' + i18n.t('exp.no_kit')) + '</div>';
                var btn = document.createElement('button');
                btn.className = 'exp-btn';
                btn.textContent = i18n.t('exp.export_btn');
                if (n === 0) { btn.disabled = true; btn.textContent = i18n.t('exp.empty'); }
                btn.addEventListener('click', refreshThen(function () { downloadType(t); }));
                row.appendChild(info); row.appendChild(btn);
                grid.appendChild(row);
            });
            document.getElementById('exp-all-bom').addEventListener('click', refreshThen(downloadAllBom));
            document.getElementById('exp-all-specs').addEventListener('click', refreshThen(downloadAllSpecs));
            document.getElementById('exp-loading').style.display = 'none';
            document.getElementById('exp-content').style.display = 'block';
        }

        // ---- Chargement des donnees (toujours frais : tout est cache-buste) ----
        function loadData() {
            return Promise.all([
                fetch('data/machines.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
                window.loadMergedOverrides(),
                fetch(API_URL + '?action=get&key=db_flags').then(function (r) { return r.json(); })
                    .then(function (d) { try { return d && d.value ? JSON.parse(d.value) : {}; } catch (e) { return {}; } })
                    .catch(function () { return {}; })   // si l'API ne repond pas : pas de drapeaux, le reste marche
            ]).then(function (res) {
                MACHINES = res[0] || {};
                OVERRIDES = res[1] || {};
                FLAGS = res[2] || {};
            });
        }

        // Recharge la base AVANT de generer le fichier -> l'export est toujours synchro.
        // buildMenu() n'est PAS rappele ici (sinon doublons d'ecouteurs sur les boutons fixes).
        var exporting = false;
        function refreshThen(action) {
            return function () {
                if (exporting) return;                 // anti double-clic pendant la synchro
                exporting = true;
                toast(i18n.t('exp.toast_sync'));
                loadData().then(function () {
                    action();
                }).catch(function (err) {
                    console.error(err);
                    toast(i18n.t('exp.toast_sync_error'));
                }).then(function () { exporting = false; });
            };
        }

        // Chargement initial : remplit le menu une seule fois.
        loadData().then(buildMenu).catch(function (err) {
            document.getElementById('exp-loading').textContent = i18n.t('exp.load_error');
            console.error(err);
        });
    })();
