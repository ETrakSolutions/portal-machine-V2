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
        getLang: getLang,
        setLang: setLang,
        translatePage: translatePage
    };
})();
