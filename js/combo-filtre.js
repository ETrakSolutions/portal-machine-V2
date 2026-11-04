/*
 * combo-filtre.js : menu deroulant et filtre dans UNE case (Steve, 2026-10-08).
 * Charge par : soumission.html (Fabricant, Modele), database.html (Fabricant, 2026-11-04).
 */
// Menus Fabricant et Modele avec filtre (Steve, 2026-10-08) : chacun est UNE case qui
// ressemble aux autres menus. Un clic ouvre la liste complete ; taper ne garde que les
// choix qui contiennent le texte, sans tenir compte de la casse, des espaces ni des tirets
// (« dx 140 » trouve DX140LC-5 / -7). Le vrai <select> reste dans la page, cache : tout le
// reste du code le lit et l'ecrit comme avant ; la case suit sa valeur (voir creerComboFiltre).
function normFiltre(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function texteI18n(k, fb, p) {
    var v = (typeof i18n !== 'undefined') ? i18n.t(k, p) : k;
    if (!v || v === k) { v = fb; if (p) Object.keys(p).forEach(function (n) { v = v.split('{' + n + '}').join(p[n]); }); }
    return v;
}

// select : le vrai menu (cache) ; input / ul : la case et sa liste ; cfg.autre : valeur de
// l'option « Ajout ... non repertorie » (toujours au bout) ; cfg.compte / cfg.aucun : cles
// de l'en-tete quand on filtre ; cfg.vide : true pour proposer aussi l'option de valeur vide
// (« Tous » de la Base de donnees) en tete de la liste complete. Les choix sont lus dans les
// <option> du menu.
function creerComboFiltre(select, input, ul, cfg) {
    var index = -1;
    var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    function choix() {
        return Array.prototype.filter.call(select.options, function (o) { return o.value && o.value !== cfg.autre; })
            .map(function (o) { return { v: o.value, t: o.textContent }; });
    }
    // La case montre le choix du menu (vide = invite « Selectionnez ou tapez »).
    function afficher() {
        if (document.activeElement === input) return;
        var o = select.options[select.selectedIndex];
        input.value = (o && o.value && o.value !== cfg.autre) ? o.textContent : '';
    }
    function fermer() {
        ul.hidden = true; ul.innerHTML = ''; index = -1;
        input.setAttribute('aria-expanded', 'false');
    }
    function choisir(valeur) {
        fermer();
        input.blur();
        if ((valeur || cfg.vide) && valeur !== select.value) {
            select.value = valeur;
            select.dispatchEvent(new Event('change'));
        }
        afficher();
    }
    function surligner() {
        var items = ul.querySelectorAll('.filtre-item');
        Array.prototype.forEach.call(items, function (li, i) { li.classList.toggle('actif', i === index); });
        if (items[index]) items[index].scrollIntoView({ block: 'nearest' });
    }
    // texte vide : liste complete (comme le menu deroulant) ; sinon les choix qui le contiennent.
    function ouvrir(texte) {
        if (input.disabled) return;
        var brut = String(texte || '').trim(), f = normFiltre(brut);
        var tous = choix();
        var oVide = cfg.vide && !f && select.querySelector('option[value=""]');
        var liste = f ? tous.filter(function (c) { return normFiltre(c.t).indexOf(f) >= 0 || normFiltre(c.v).indexOf(f) >= 0; }) : tous;
        var html = '';
        if (f) {
            html += '<li class="filtre-entete">' + esc(liste.length
                ? texteI18n(cfg.compte[0], cfg.compte[1], { n: liste.length, f: brut })
                : texteI18n(cfg.aucun[0], cfg.aucun[1], { f: brut })) + '</li>';
        }
        var courant = select.value;
        if (oVide) html += '<li class="filtre-item' + (courant === '' ? ' choisi' : '') + '" role="option" data-valeur="">' + esc(oVide.textContent) + '</li>';
        liste.forEach(function (c) {
            html += '<li class="filtre-item' + (c.v === courant ? ' choisi' : '') + '" role="option" data-valeur="' + esc(c.v) + '">' + esc(c.t) + '</li>';
        });
        var oAutre = cfg.autre && select.querySelector('option[value="' + cfg.autre + '"]');
        if (oAutre) html += '<li class="filtre-item filtre-autre" role="option" data-valeur="' + esc(cfg.autre) + '">' + esc(oAutre.textContent) + '</li>';
        ul.innerHTML = html;
        ul.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        // Liste complete : on part du choix courant ; liste filtree : du premier resultat.
        index = f ? (liste.length ? 0 : -1) : liste.map(function (c) { return c.v; }).indexOf(courant);
        if (oVide) index = courant === '' ? 0 : index + 1;
        surligner();
    }
    // Le reste du code ecrit select.value / .disabled directement (restauration du panier,
    // Annuler, changement de type...) : la case suit sans qu'on ait a toucher ces endroits.
    ['value', 'disabled'].forEach(function (prop) {
        var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
        if (!d || !d.set) return;
        Object.defineProperty(select, prop, {
            configurable: true,
            get: function () { return d.get.call(this); },
            set: function (v) {
                d.set.call(this, v);
                if (prop === 'disabled') { input.disabled = !!v; if (v) fermer(); }
                afficher();
            }
        });
    });
    select.addEventListener('change', afficher);
    input.addEventListener('focus', function () {
        input.value = '';                     // on part d'une case vide : taper filtre tout de suite
        ouvrir('');
    });
    input.addEventListener('mousedown', function () {
        // Deuxieme clic sur la case deja active : referme / rouvre la liste, comme un menu.
        if (document.activeElement === input) { if (ul.hidden) ouvrir(input.value); else fermer(); }
    });
    input.addEventListener('input', function () { ouvrir(input.value); });
    // mousedown (pas click) : le choix se fait avant que la case perde le focus.
    ul.addEventListener('mousedown', function (e) {
        var li = e.target.closest('.filtre-item');
        e.preventDefault();
        if (li) choisir(li.getAttribute('data-valeur'));
    });
    input.addEventListener('blur', function () {
        setTimeout(function () { if (document.activeElement !== input) { fermer(); afficher(); } }, 150);
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); fermer(); input.blur(); return; }
        if (e.key === 'Tab') { fermer(); return; }
        if (ul.hidden && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); ouvrir(input.value); return; }
        var items = ul.querySelectorAll('.filtre-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(items.length - 1, index + 1); surligner(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(0, index - 1); surligner(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[index]) choisir(items[index].getAttribute('data-valeur')); }
    });
    input.disabled = select.disabled;
    afficher();
    return { afficher: afficher, fermer: fermer, ouvrir: ouvrir };
}
