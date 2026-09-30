// Acces aux tuiles reglables dans le tableau des permissions (decision Jacquot, 2026-09-30) :
// Cedule des techniciens, Demande de service (SAV), Export, Price List.
// Tant qu'une permission n'a jamais ete reglee pour un role, la liste par defaut s'applique.
// Miroir de _roleHasAccess (apps-script/Code.gs). Confort d'affichage seulement : pour la
// Cedule et le SAV, le serveur refait le controle et fait foi.
(function () {
    'use strict';
    var INTERNES = ['administrateur', 'vente_interne', 'vente_externe', 'technicien', 'ingenierie'];
    var DEFAUTS = {
        ceduleAccess:    INTERNES,
        savAccess:       INTERNES,
        exportAccess:    ['administrateur'],
        pricelistAccess: ['administrateur']
    };
    // Jamais pour les roles externes, meme coches : noms de techniciens, clients, courriels internes.
    var INTERNE_SEULEMENT = { ceduleAccess: true, savAccess: true };
    var EXTERNES = ['dealer', 'distributeur'];

    function aAcces(role, perm, sauve) {
        if (role === 'super_admin') return true;
        if (INTERNE_SEULEMENT[perm] && EXTERNES.indexOf(role) >= 0) return false;
        var r = sauve && sauve[role];
        if (r && r[perm] !== undefined) return !!r[perm];
        return (DEFAUTS[perm] || []).indexOf(role) >= 0;
    }

    // portalAccess('savAccess', user, function (ok) { ... }) — lit roles_permissions (GET public).
    function portalAccess(perm, user, cb) {
        if (!user || !user.role) { cb(false); return; }
        fetch(window.PORTAL_API_URL + '?action=get&key=roles_permissions')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var sauve = null;
                try { sauve = d && d.value ? JSON.parse(d.value) : null; } catch (e) {}
                cb(aAcces(user.role, perm, sauve));
            })
            .catch(function () { cb(aAcces(user.role, perm, null)); });
    }

    window.PORTAL_PERM_DEFAUTS = DEFAUTS;
    window.portalRoleLocked = function (role, perm) { return !!INTERNE_SEULEMENT[perm] && EXTERNES.indexOf(role) >= 0; };
    window.portalAccess = portalAccess;
})();
