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
        var lang = getLang();
        if (lang === 'fr') return frenchValue;
        var dict = window.TRANSLATIONS && window.TRANSLATIONS[lang];
        var mapped = dict && dict['val.' + frenchValue];
        return mapped || frenchValue;
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
        getLang: getLang,
        setLang: setLang,
        translatePage: translatePage
    };
})();
