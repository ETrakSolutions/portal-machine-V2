// ============================================
// e-Trak Portal — i18n Engine
// Lightweight bilingual FR/EN support
// ============================================

(function() {
    var STORAGE_KEY = 'portal_lang';
    var DEFAULT_LANG = 'fr';

    function getLang() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    }

    function setLang(lang) {
        localStorage.setItem(STORAGE_KEY, lang);
        translatePage();
        window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
    }

    // Main translation lookup
    function t(key, replacements) {
        var lang = getLang();
        var dict = window.TRANSLATIONS && window.TRANSLATIONS[lang];
        var val = dict && dict[key];
        // Fallback to FR
        if (val === undefined || val === null) {
            var frDict = window.TRANSLATIONS && window.TRANSLATIONS.fr;
            val = frDict && frDict[key];
        }
        // Fallback to key itself
        if (val === undefined || val === null) return key;
        // Placeholder substitution: {name}
        if (replacements) {
            for (var k in replacements) {
                val = val.replace(new RegExp('\\{' + k + '\\}', 'g'), replacements[k]);
            }
        }
        return val;
    }

    // Translate spec field labels (keys from machines.json)
    function tSpec(frenchKey) {
        var lang = getLang();
        if (lang === 'fr') return frenchKey;
        var dict = window.TRANSLATIONS && window.TRANSLATIONS[lang];
        var mapped = dict && dict['spec.' + frenchKey];
        return mapped || frenchKey;
    }

    // Translate spec values (Oui, Non, Chenille, etc.)
    function tVal(frenchValue) {
        if (frenchValue === undefined || frenchValue === null) return frenchValue;
        var lang = getLang();
        if (lang === 'fr') return frenchValue;
        var v = String(frenchValue);
        var dict = window.TRANSLATIONS && window.TRANSLATIONS[lang];
        var mapped = dict && dict['val.' + v];
        if (mapped !== undefined && mapped !== null) return mapped;
        // Normalisation N/D, n/d, N/A -> N/A (donnee "non disponible")
        if (/^n\s*\/?\s*[ad]$/i.test(v.trim())) return 'N/A';
        // Motif "Portee 47 m" / "Portée 28m" -> "Reach 47 m"
        var m = v.match(/^Port[eé]{1,2}\s*([\d.,]+)\s*m$/i);
        if (m) return 'Reach ' + m[1] + ' m';
        // Motif "61 m treillis" -> "61 m lattice"
        m = v.match(/^([\d.,]+)\s*m\s+treillis$/i);
        if (m) return m[1] + ' m lattice';
        return frenchValue;
    }

    // Translate BOM / kit item descriptions coming from the DB (_bom_labels).
    // La BD est en francais ; on traduit a l'affichage via la table 'bom.<desc>'.
    function tBom(frenchDesc) {
        if (frenchDesc === undefined || frenchDesc === null) return frenchDesc;
        var lang = getLang();
        if (lang === 'fr') return frenchDesc;
        var dict = window.TRANSLATIONS && window.TRANSLATIONS[lang];
        var mapped = dict && dict['bom.' + String(frenchDesc)];
        return (mapped !== undefined && mapped !== null) ? mapped : frenchDesc;
    }

    // Piece saisie en texte libre dans les fiches d'installation / de diagnostic
    // (« 1200-0014 — Imprimante thermique (si demandee) »). Audit anglais, Steve 2026-11-26 :
    // 1) table exacte 'bom.<desc>' ; 2) sinon regles de vocabulaire (raccord, cote tige...),
    // pour que les prochaines fiches sortent aussi en anglais. Le numero de piece ne change pas.
    var REGLES_PIECE = [
        [/\(constat[ée] dans ProgressionLive\)/gi, '(as found in ProgressionLive)'],
        [/\(code de la Soumission\)/gi, '(Quote code)'], [/code de la Soumission/gi, 'Quote code'],
        [/\(?à ajouter, absent de la Soumission\)?/gi, '(to be added, missing from the Quote)'],
        [/c[ôo]t[ée]s piston et tige/gi, 'piston and rod sides'], [/c[ôo]t[ée]s tige et piston/gi, 'rod and piston sides'],
        [/c[ôo]t[ée] tige et c[ôo]t[ée] piston/gi, 'rod and piston sides'], [/c[ôo]t[ée] piston et c[ôo]t[ée] tige/gi, 'piston and rod sides'],
        [/c[ôo]t[ée] tige/gi, 'rod side'], [/c[ôo]t[ée] piston/gi, 'piston side'],
        [/\(tige\)/gi, '(rod)'], [/\(piston\)/gi, '(piston)'], [/\btige\b/gi, 'rod'],
        [/Raccords? capteur de pression/gi, 'Pressure sensor fitting'], [/Raccords? capteur/gi, 'Sensor fitting'],
        [/\bRaccords\b/g, 'Fittings'], [/\bRaccord\b/g, 'Fitting'], [/\braccords?\b/g, 'fitting'],
        [/capteur de pression/gi, 'pressure sensor'], [/Capteur de proximit[ée]/gi, 'Proximity sensor'],
        [/Support de prox/gi, 'Proximity sensor bracket'], [/Plaque prox soud[ée]e/gi, 'Welded proximity plate'],
        [/C[âa]ble prox droit/gi, 'Straight proximity cable'], [/\(pi[èe]ce 1\)/gi, '(part 1)'],
        [/Harnais de coupure/gi, 'Cut-off harness'], [/Harnais/g, 'Harness'], [/autres marques/gi, 'other brands'],
        [/G[ée]n[ée]rique/gi, 'Generic'], [/dans un coude à 90°/gi, 'in a 90° elbow'], [/m[âa]le à/gi, 'male to'],
        [/m[âa]le/gi, 'male'], [/m[ée]trique/gi, 'metric'], [/boyaux modifi[ée]s/gi, 'modified hoses'],
        [/taille non not[ée]e/gi, 'size not recorded'], [/\bBoulon\b/g, 'Bolt'], [/\bcourt\b/gi, 'short'],
        [/en T RUN T/gi, 'RUN tee'], [/« hausse 1\/4 po x 7 po »/gi, '"1/4 in x 7 in riser"'],
        [/si demand[ée]e/gi, 'if requested'], [/si command[ée]e/gi, 'if ordered'], [/si coupure par valve/gi, 'if valve cut-off'],
        [/selon la machine/gi, 'depending on the machine'], [/coupure hydraulique/gi, 'hydraulic cut-off'],
        [/\bseulement\b/gi, 'only'], [/\bsur\b/g, 'on'], [/ et /g, ' and '], [/Cam[ée]ra de recul/gi, 'Rear-view camera'],
        [/\bcapteur\b/gi, 'sensor'], [/Imprimante/gi, 'Printer']
    ];
    function tPiece(txt) {
        if (txt === undefined || txt === null) return txt;
        var s = String(txt);
        if (getLang() === 'fr' || !s) return s;
        var m = s.match(/^(\S+)\s+[—–-]\s+(.+)$/), pn = '', desc = s;
        if (m && /\d/.test(m[1])) { pn = m[1]; desc = m[2]; }
        var dict = (window.TRANSLATIONS && window.TRANSLATIONS.en) || {};
        var exact = dict['bom.' + desc] || dict['bom.' + desc.replace(/\s+/g, ' ').trim()];
        var en = exact;
        if (!en) { en = desc; REGLES_PIECE.forEach(function (r) { en = en.replace(r[0], r[1]); }); }
        return pn ? pn + ' — ' + en : en;
    }

    // Walk DOM and apply translations
    function translatePage() {
        var lang = getLang();
        document.documentElement.lang = lang;

        // data-i18n -> textContent
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            el.textContent = t(key);
        });

        // data-i18n-html -> innerHTML
        document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-html');
            el.innerHTML = t(key);
        });

        // data-i18n-placeholder -> placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = t(key);
        });

        // data-i18n-title -> title
        document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
            var key = el.getAttribute('data-i18n-title');
            el.title = t(key);
        });

        // Update lang buttons active state
        document.querySelectorAll('.lang-btn').forEach(function(btn) {
            if (btn.getAttribute('data-lang') === lang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update page title
        var titleKey = document.documentElement.getAttribute('data-i18n-title');
        if (titleKey) document.title = t(titleKey);
    }

    // Init on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function() {
        // Attach click handlers to lang buttons
        document.querySelectorAll('.lang-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                setLang(btn.getAttribute('data-lang'));
            });
        });
        // Initial translation
        translatePage();
    });

    // Expose globally
    window.i18n = {
        t: t,
        tSpec: tSpec,
        tVal: tVal,
        tBom: tBom,
        tPiece: tPiece,
        getLang: getLang,
        setLang: setLang,
        translatePage: translatePage
    };
})();
