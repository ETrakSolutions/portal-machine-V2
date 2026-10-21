/* Portail Machine — section « Options compatibles avec cette machine » (Steve, 2026-10-21).
 *
 * Une carte par famille d'options, avec les MEMES regles que la tuile Soumission :
 *  - options offertes selon le type (applyTypeRestrictions / applyRotationRestriction
 *    de js/soumission.js) ;
 *  - pieces propres a CETTE machine, rattachees a une option (_bom._custom avec c.opt,
 *    meme logique que customItemVisible) : point rouge si obligatoire, jaune si optionnel.
 * Chaque option elle-meme est jaune : c'est le client qui la choisit dans la Soumission.
 * Le Limiteur est toujours la PREMIERE carte (produit le plus populaire, demande de Steve).
 * Si une regle change dans soumission.js, la reporter ici.
 */
(function () {
  'use strict';

  var CAMERAS = [
    ['optm.cam_recul', 'Recul', '1300-0001'],
    ['optm.cam_recul_capteur', 'Recul + capteur proximité', '1300-0012'],
    ['optm.cam_quad', 'Quad', '1300-0003'],
    ['optm.cam_360_4', 'Caméra 360 — kit 4 caméras', '1300-0004'],
    ['optm.cam_360_6', 'Caméra 360 — kit 6 caméras', '1300-0005']
  ];
  var CREUSAGE = [
    ['optm.creus_2d', 'Système 2D, 1 boom + 1 stick', '1100-0007'],
    ['optm.creus_2d_lim', '… avec limiteur Hauteur ou Multi-axe', '1000-0007'],
    ['optm.creus_2d_2b', 'Système 2D, 2 booms + 1 stick', '1100-0011'],
    ['optm.creus_2d_lim', '… avec limiteur Hauteur ou Multi-axe', '1000-0011'],
    ['optm.creus_laser', 'Référence laser', '1000-0009']
  ];
  var IDC = [
    ['optm.idc_complet', 'IDC complet', '1000-0400'],
    ['optm.idc_ajout', 'IDC en ajout au limiteur', '1000-0004']
  ];
  var BAL_LOADER = [
    ['optm.bal_loader', 'Balance loader', '1200-0010'],
    ['optm.bal_imp_therm', '+ Imprimante thermique', '1200-0014'],
    ['optm.bal_imp_carb', '+ Imprimante carbone', '1200-0015']
  ];
  var BAL_TRACTEUR = [
    ['optm.bal_scalelite', 'Scale Lite avec cabine', '1200-0020'],
    ['optm.bal_scalelite_sc', 'Scale Lite sans cabine', '1200-0023']
  ];
  var BALANCE_TYPES = { 'Loader': true, 'Retrocaveuse': true, 'Tracteur': true };
  var dernier = null;

  function t(cle, defaut) {
    if (typeof i18n === 'undefined' || !i18n.t) return defaut;
    var v = i18n.t(cle);
    return (v && v !== cle) ? v : defaut;
  }
  function tBom(s) { return (typeof i18n !== 'undefined' && i18n.tBom) ? i18n.tBom(s) : s; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function opt(item) { return { label: t(item[0], item[1]), code: item[2], st: 'j' }; }

  // Pieces de la machine rattachees a une famille (meme regle que customItemVisible).
  function pieces(custom, famille, type) {
    var out = [];
    (custom || []).forEach(function (c) {
      if (!c || c.status === 'na') return;
      var o = c.opt || '';
      var fam = o === 'limiteur' || o === 'lim_hauteur' || o === 'lim_rotation' ? 'limiteur'
              : (o || (BALANCE_TYPES[type] ? 'balance' : ''));
      if (fam !== famille) return;
      var lab = tBom((typeof i18n !== 'undefined' && i18n.getLang && i18n.getLang() === 'en' && c.desc_en) ? c.desc_en : (c.desc || c.code));
      if (c.qty && Number(c.qty) > 1) lab += ' (×' + c.qty + ')';
      if (o === 'lim_hauteur') lab += ' — ' + t('optm.si_hauteur', 'avec la Hauteur');
      if (o === 'lim_rotation') lab += ' — ' + t('optm.si_rotation', 'avec la Rotation');
      out.push({ label: lab, code: c.pn || c.code, st: c.status === 'r' ? 'r' : 'j', verif: c.status === 'v' });
    });
    return out;
  }

  function familles(type, specs, custom) {
    var cartes = [];
    var isExc = type === 'Excavatrice', isRetro = type === 'Retrocaveuse', isTracteur = type === 'Tracteur';

    // 1. Limiteur : toujours en premier quand il est offert (pas sur un tracteur).
    if (!isTracteur) {
      var lim = [];
      if (type === 'Pompe a Beton') {
        lim.push({ label: t('optm.lim_pompe', 'Limiteur (base et sections : voir le Kit Machine)'), code: '', st: 'j' });
      } else {
        var allowRot = true, allowHR = true;
        if (type === 'Telehandler') {
          var base = specs && (specs['Base rotative'] || (specs._specs && specs._specs['Base rotative']));
          allowRot = (base === 'Oui'); allowHR = allowRot;
        } else if (type === 'Loader') { allowRot = false; allowHR = false; }
        else if (type === 'Camion Vacuum') { allowHR = false; }
        lim.push({ label: t('soumission.hauteur', 'Hauteur'), code: '', st: 'j' });
        if (type === 'Camion Vacuum') lim.push({ label: t('soumission.hauteur_extension', 'Hauteur + extension'), code: '1500-0505', st: 'j' });
        if (allowRot) lim.push({ label: t('soumission.rotation', 'Rotation'), code: '', st: 'j' });
        if (allowHR) lim.push({ label: t('soumission.hauteur_rotation', 'Hauteur + Rotation'), code: '', st: 'j' });
        if (isExc || isRetro) lim.push({ label: t('soumission.multi_axe', 'Multi-axe'), code: '', st: 'j' });
        if (isRetro) lim.push({ label: t('optm.godet_avant', 'Limiteur godet avant (front loader)'), code: '1500-0603', st: 'j' });
      }
      cartes.push({ titre: t('optm.f_limiteur', 'Limiteur'), items: lim, pieces: pieces(custom, 'limiteur', type) });
    }
    // 2. Excavatrice : guide de creusage et indicateur de charge.
    if (isExc) {
      cartes.push({ titre: t('optm.f_creusage', 'Guide de creusage'), items: CREUSAGE.map(opt), pieces: pieces(custom, 'creusage', type) });
      cartes.push({ titre: t('optm.f_idc', 'Indicateur de charge'), items: IDC.map(opt), pieces: pieces(custom, 'idc', type) });
    }
    // 3. Balance : loader, retrocaveuse (ST-7) ; tracteur (Scale Lite, sans imprimante).
    if (BALANCE_TYPES[type]) {
      cartes.push({ titre: isTracteur ? t('soumission.balance_tracteur', 'Balance Scale Lite') : t('soumission.balance', 'Balance ST-7'),
                    items: (isTracteur ? BAL_TRACTEUR : BAL_LOADER).map(opt), pieces: pieces(custom, 'balance', type) });
    }
    // 4. Camera : tous les types.
    cartes.push({ titre: t('optm.f_camera', 'Caméra'), items: CAMERAS.map(opt), pieces: pieces(custom, 'camera', type) });
    return cartes;
  }

  function ligne(i) {
    return '<div class="optm-ligne"><span class="optm-dot optm-' + (i.st === 'r' ? 'r' : 'j') + '"></span>'
      + '<span class="optm-lab">' + esc(i.label)
      + (i.verif ? ' <span class="optm-verif">' + esc(t('edit.status_v', 'À vérifier')) + '</span>' : '') + '</span>'
      + '<span class="optm-code">' + esc(i.code || '') + '</span></div>';
  }
  function carte(c) {
    return '<div class="optm-carte"><div class="optm-titre">' + esc(c.titre) + '</div>'
      + c.items.map(ligne).join('')
      + (c.pieces.length ? '<div class="optm-sep">' + esc(t('optm.pieces', 'Pièces ajoutées pour cette machine si l\'option est choisie :')) + '</div>'
         + c.pieces.map(ligne).join('') : '')
      + '</div>';
  }

  function render(type, fab, modele, annee) {
    var sec = document.getElementById('options-compat-section');
    if (!sec) return;
    dernier = [type, fab, modele, annee];
    var entry = null;
    try { entry = machinesData[type][fab][annee][modele]; } catch (e) { entry = null; }
    if (!type || !entry) { sec.style.display = 'none'; sec.innerHTML = ''; return; }
    var custom = (entry._bom && Array.isArray(entry._bom._custom)) ? entry._bom._custom : [];
    var cartes = familles(type, entry, custom);
    sec.innerHTML = '<div class="kit-header"><h3>' + esc(t('optm.titre', 'Options compatibles avec cette machine')) + '</h3>'
      + '<div class="kit-lock-row"><p class="kit-subtitle">' + esc(fab + ' ' + modele + ' (' + annee + ')') + ' — '
      + esc(t('optm.sous_titre', 'à choisir dans la tuile Soumission')) + '</p></div></div>'
      + '<div class="kit-legend"><span class="kit-legend-item"><span class="legend-dot legend-red"></span> ' + esc(t('common.obligatoire', 'Obligatoire'))
      + '</span><span class="kit-legend-item"><span class="legend-dot legend-yellow"></span> ' + esc(t('common.optionnel', 'Optionnel')) + '</span></div>'
      + '<div class="optm-grille">' + cartes.map(carte).join('') + '</div>';
    sec.style.display = 'block';
  }

  function cacher() {
    var sec = document.getElementById('options-compat-section');
    if (sec) { sec.style.display = 'none'; sec.innerHTML = ''; }
    dernier = null;
  }

  window.addEventListener('langchange', function () { if (dernier) render.apply(null, dernier); });
  window.OptionsMachine = { render: render, cacher: cacher, _familles: familles };
})();
