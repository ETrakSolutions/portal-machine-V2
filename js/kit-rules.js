/*
 * kit-rules.js — SOURCE UNIQUE des regles de pre-remplissage du kit BOM e-Trak.
 *
 * Chargee par : edit-machine.html, machine.html (app.js), database.html,
 *               soumission.html (soumission.js), export.html.
 *
 * >>> Toute modification de regle (ajout d'un modele a la liste DRAIN, changement
 *     d'un defaut, harnais, etc.) se fait ICI et UNIQUEMENT ici. <<<
 *
 * Les regles ne sont qu'un PRE-REMPLISSAGE. Les corrections manuelles (overrides
 * par machine) passent par-dessus. Le jeton affiche = defauts + overrides, et doit
 * etre identique dans toutes les tuiles ET l'export.
 *
 * Etats : 'r' = obligatoire (rouge), 'j' = option (jaune), 'v' = a verifier (orange),
 *         'na' = non applicable (gris).
 */
(function () {
  'use strict';

  // Un modele dont le nom COMMENCE par un de ces prefixes -> Drain hyd obligatoire.
  var DRAIN_PREFIXES = [
    'CX80', 'CX145', 'CX170', 'CX210', 'CX220', 'CX245', 'CX300', 'CX350', 'CX380', 'CX490', '145 D',
    '308', '315', '316', '320', '336', '440', '450', 'M318',
    'DX190', 'DX235', 'BX190',
    'ZX210LC', 'EX200', 'ZX130-6', 'ZX190', 'ZX350', 'ZX490', 'ZX50U', 'ZX75US', 'ZX245',
    '245X',
    '135', '200CLC', '210G', '210P', '210 P', '245 P', '245P', '330X', '350', '410', '470G', '490D', '130P',
    'SK210',
    'PC78', 'PC138', 'PC200', 'PC290',
    'R 920 K', 'R920', 'R 936', 'R936',
    '145 X4', '145X4', '160 X4', '160X4', '170X4', '190', '245X4', '300 X4', '300X4', '350 X4', '350X4', '355 X4', '355X4', '490 X4', '490X4',
    'TB210', 'TW65',
    'EC160', 'EC330', 'EC360', 'EC550', '235',
    'EZ36'
  ];

  var EXC_CODES = ['0000', '0001', '0002', '0004', '0005', '0008', '0009', '0070', '0304'];
  var POMPE_CODES = ['0200', '0203', '0201', '0202', '0204', '0205', '0206', '0207', '0208', '0209'];

  function poidsKg(specs) {
    var m = String((specs && specs['Poids operationnel (kg / lbs)']) || '').match(/(\d[\d\s]*)/);
    return m ? parseInt(m[1].replace(/\s/g, '')) : 0;
  }
  function isMini(specs) { var p = poidsKg(specs); return p > 0 && p <= 5000; }
  function isDrain(modele) {
    var u = String(modele || '').toUpperCase();
    return DRAIN_PREFIXES.some(function (p) { return u.indexOf(p.toUpperCase()) === 0; });
  }
  // Boite GC (0070) obligatoire pour les modeles Caterpillar comportant "GC"
  // (313 GC, 315 GC, 320 GC, 330 GC). "GC" est un suffixe exclusif a Caterpillar
  // -> detecte par le nom du modele. Token isole (precede d'un non-lettre) pour
  // ne pas matcher "GC" au milieu d'un mot.
  function isGC(modele) {
    return /(^|[^A-Z])GC/.test(String(modele || '').toUpperCase());
  }

  // Defauts Excavatrice -> { code: etat }
  function excDefaults(specs, modele) {
    var u = String(modele || '').toUpperCase();
    var swing = String((specs && specs['Swing boom']) || '').trim().toLowerCase() === 'oui';
    return {
      '0000': 'r', '0001': 'j', '0002': 'j',
      '0004': isMini(specs) ? 'r' : 'na',
      '0005': 'j',
      '0008': swing ? 'j' : 'na',   // swing boom = option (jaune) si la spec 'Swing boom' = Oui
      '0009': isDrain(modele) ? 'r' : 'na',
      '0070': isGC(modele) ? 'r' : 'na',   // Boite GC obligatoire si modele Cat "GC"
      '0304': u === 'TB216' ? 'r' : 'na'
    };
  }

  // Defauts Pompe a Beton -> { code: etat }
  function pompeDefaults(specs) {
    var sec = parseInt(specs && specs['Nombre de sections']) || 0;
    return {
      '0200': 'na', '0203': 'na', '0201': 'j', '0202': 'j',
      '0204': sec >= 4 ? 'r' : 'na', '0205': sec >= 5 ? 'r' : 'na', '0206': sec >= 6 ? 'r' : 'na',
      '0207': 'na', '0208': 'na', '0209': 'na'
    };
  }

  // Defauts Nacelle -> { code: etat }. Base selon la categorie :
  //  - Flèche articulée  -> base = 0903 (Nacelle articulee), 0900 (telescopique) = na
  //  - Flèche télescopique / Mât vertical -> base = 0900, 0903 = na
  // Les autres (0901 Hauteur, 0902 Rotation, 0904 Gestion G-D, 0905 Drain) = option (j).
  function nacelleDefaults(specs) {
    var cat = String((specs && (specs['Categorie'] || specs['Catégorie'])) || '').toLowerCase();
    var artic = cat.indexOf('articul') >= 0;
    return {
      '0900': artic ? 'na' : 'r',
      '0901': 'j',
      '0902': 'j',
      '0903': artic ? 'r' : 'na',
      '0904': 'j',
      '0905': 'j'
    };
  }

  // Libelles canoniques du harnais par code d'override (H-code stocke dans _bom.harnais).
  // UNIQUE source pour TOUTES les tuiles + l'export. Ne pas dupliquer ailleurs.
  var HARNAIS_LABELS = {
    H0031: 'Hitachi/JD', H0032: 'Komatsu', H0033: 'Doosan', H0034: 'Volvo',
    H0041: 'Link-Belt/Case', H0080: 'Caterpillar', H0100: 'Caterpillar (ECU)',
    H0121: 'Hitachi -7', H0043: 'Generique'
  };

  // 'H0080' -> 'Z03B-0080' (PN affiche). Tolere deja un Z03B-XXXX en entree.
  function harnaisPN(hCode) {
    var c = String(hCode || '');
    if (c.indexOf('Z03B-') === 0) return c;
    return 'Z03B-' + c.replace(/^H/, '');
  }

  // Harnais de coupure selon le fabricant -> { code: 'Z03B-XXXX', name }
  function harnais(fab, modele) {
    var f = String(fab || '').toUpperCase(), m = String(modele || '');
    if (f === 'HITACHI') {
      var is7 = m.indexOf('-7') >= 0, is56 = m.indexOf('-5') >= 0 || m.indexOf('-6') >= 0;
      return (is7 && !is56) ? { code: 'Z03B-0121', name: 'Hitachi -7' } : { code: 'Z03B-0031', name: 'Hitachi -5/-6' };
    }
    if (f === 'JOHN DEERE') return { code: 'Z03B-0031', name: 'Hitachi/JD' };
    if (f === 'KOMATSU') return { code: 'Z03B-0032', name: 'Komatsu' };
    if (f.indexOf('DOOSAN') >= 0 || f.indexOf('DEVELON') >= 0) return { code: 'Z03B-0033', name: 'Doosan' };
    if (f.indexOf('VOLVO') >= 0) return { code: 'Z03B-0034', name: 'Volvo' };
    if (f.indexOf('LINK') >= 0 || f === 'CASE') return { code: 'Z03B-0041', name: 'Link-Belt/Case' };
    if (f.indexOf('CATERPILLAR') >= 0 || f === 'CAT') return { code: 'Z03B-0080', name: 'Caterpillar' };
    return { code: 'Z03B-0043', name: 'Generique' };
  }

  // Harnais par defaut sous forme de H-code ('H0031') — pour les vues qui stockent
  // le code interne (database.html, edit-machine.html).
  function harnaisDefaultH(fab, modele) {
    return harnais(fab, modele).code.replace(/^Z03B-/, 'H');
  }

  // Harnais resultant d'un override (H-code) -> { code: 'Z03B-XXXX', name canonique }.
  function harnaisOverride(hCode) {
    return { code: harnaisPN(hCode), name: HARNAIS_LABELS[hCode] || String(hCode) };
  }

  function isOptionCode(k) {
    if (!k || k === 'undefined') return false;
    if (k.charAt(0) === '_') return false;
    if (k === 'rows' || k === 'customRows') return false;
    return true;
  }

  // Applique les overrides + _removed sur les defauts -> etat final { code: etat }
  function applyOverride(defaults, bom, isExc) {
    var st = {}; for (var k in defaults) st[k] = defaults[k];
    if (bom) {
      for (var c in bom) { if (isOptionCode(c) && bom[c]) st[c] = bom[c]; }
      if (Array.isArray(bom._removed)) bom._removed.forEach(function (c) { st[c] = 'na'; });
    }
    if (isExc && st['0009'] === 'j') st['0009'] = 'r';   // drain jamais jaune
    return st;
  }

  window.KitRules = {
    DRAIN_PREFIXES: DRAIN_PREFIXES,
    EXC_CODES: EXC_CODES,
    POMPE_CODES: POMPE_CODES,
    HARNAIS_LABELS: HARNAIS_LABELS,
    poidsKg: poidsKg, isMini: isMini, isDrain: isDrain, isGC: isGC,
    excDefaults: excDefaults, pompeDefaults: pompeDefaults, nacelleDefaults: nacelleDefaults,
    harnais: harnais, harnaisPN: harnaisPN, harnaisDefaultH: harnaisDefaultH,
    harnaisOverride: harnaisOverride,
    isOptionCode: isOptionCode, applyOverride: applyOverride
  };
})();
