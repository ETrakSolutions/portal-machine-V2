// Acces aux tuiles reglables dans le tableau des permissions (decision Jacquot, 2026-09-30) :
// Cedule des techniciens, Demande de service (SAV), Export, Price List.
// Tant qu'une permission n'a jamais ete reglee pour un role, la liste par defaut s'applique.
// Miroir de _roleHasAccess (apps-script/Code.gs). Confort d'affichage seulement : pour la
// Cedule et le SAV, le serveur refait le controle et fait foi.
(function () {
    'use strict';
    var INTERNES = ['administrateur', 'vente_interne', 'vente_externe', 'technicien', 'installateur', 'ingenierie'];
    var DEFAUTS = {
        ceduleAccess:    INTERNES,
        // Installateur : pas la tuile SAV (Steve, 2026-10-29).
        savAccess:       INTERNES.filter(function (r) { return r !== 'installateur'; }),
        exportAccess:    ['administrateur'],
        pricelistAccess: ['administrateur'],
        // Base de diagnostic SAV (Steve, 2026-10-13) : valider les fiches des techniciens.
        diagValidate:    ['administrateur', 'ingenierie'],
        // Tuile Soutien technique (Steve, 2026-10-29) : diagnostic + installation. Reglable
        // pour tous les roles ; par defaut internes + distributeur (dealer decoche).
        soutienAccess:   INTERNES.concat(['distributeur'])
    };
    // Roles verrouilles par permission, meme coches. Cedule, SAV, Valider diag : jamais un
    // compte externe (noms de techniciens, clients, courriels internes). Soutien technique :
    // aucun verrou, la case decide (Steve, 2026-10-29).
    var EXTERNES = ['dealer', 'distributeur'];
    var VERROUS = { ceduleAccess: EXTERNES, savAccess: EXTERNES, diagValidate: EXTERNES };
    function verrouille(role, perm) { return (VERROUS[perm] || []).indexOf(role) >= 0; }

    function aAcces(role, perm, sauve) {
        if (role === 'super_admin') return true;
        if (verrouille(role, perm)) return false;
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
    window.portalRoleLocked = verrouille;
    window.portalAccess = portalAccess;
})();
