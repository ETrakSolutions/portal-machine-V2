// =====================================================================
// e-Trak — Outil de capture inline (developpement)
// Charge sur n'importe quelle page du portail via :
//   <script src="js/capture-tool.js?v=1"></script>
// Auto-injecte un bouton flottant en bas-droite + panneau d'annotations.
// =====================================================================
(function () {
  if (window.__captureToolLoaded) return;
  window.__captureToolLoaded = true;

  var KEY_MODE = 'capture_mode';
  var KEY_DATA = 'capture_data';

  // ----- Styles -----
  var style = document.createElement('style');
  style.id = 'capture-tool-styles';
  style.textContent = [
    'body.capture-mode :hover { outline: 2px solid #FFB74D !important; outline-offset: 2px !important; }',
    'body.capture-mode * { cursor: crosshair !important; }',
    '#capture-fab {',
    '  position: fixed; bottom: 18px; right: 18px;',
    '  width: 48px; height: 48px; border-radius: 50%;',
    '  background: linear-gradient(145deg, #2A2A2A, #1a1a1a); color: #fff;',
    '  border: 1px solid rgba(255,255,255,0.15);',
    '  cursor: pointer; font-size: 1.25rem;',
    '  display: flex; align-items: center; justify-content: center;',
    '  box-shadow: 0 4px 14px rgba(0,0,0,0.5); z-index: 99997;',
    '  transition: all 0.15s; font-family: inherit;',
    '}',
    '#capture-fab:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.6); border-color: #FFB74D; }',
    '#capture-fab.active {',
    '  background: linear-gradient(145deg, #FFB74D, #FFA02D); color: #000; border-color: #FFB74D;',
    '  box-shadow: 0 0 0 4px rgba(255,183,77,0.25), 0 4px 14px rgba(0,0,0,0.5);',
    '}',
    '#capture-hint {',
    '  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);',
    '  background: rgba(0,98,204,0.95); color: #fff;',
    '  padding: 6px 14px; border-radius: 6px;',
    '  font-size: 0.82rem; font-weight: 600;',
    '  z-index: 99999;',
    '  box-shadow: 0 4px 20px rgba(0,98,204,0.4);',
    '  pointer-events: none; display: none;',
    '  font-family: "Inter", "Segoe UI", sans-serif;',
    '}',
    'body.capture-mode #capture-hint { display: block; }',
    '#capture-panel {',
    '  position: fixed; bottom: 80px; right: 18px;',
    '  width: 380px; max-height: 60vh;',
    '  background: #1a1a1a; border: 1px solid #FFB74D;',
    '  border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.7);',
    '  display: none; flex-direction: column;',
    '  z-index: 99998; font-size: 0.8rem;',
    '  font-family: "Inter", "Segoe UI", sans-serif;',
    '}',
    '#capture-panel.open { display: flex; }',
    '#capture-panel header {',
    '  background: #FFB74D !important; color: #000 !important;',
    '  padding: 8px 12px; border-radius: 8px 8px 0 0;',
    '  display: flex; justify-content: space-between; align-items: center;',
    '  height: auto !important; position: static !important; backdrop-filter: none !important;',
    '}',
    '#capture-panel header strong { font-size: 0.88rem; }',
    '#capture-list { flex: 1; overflow-y: auto; padding: 8px; background: #1a1a1a; }',
    '#capture-list .ann { background: #2a2a2a; border-left: 3px solid #FFB74D; padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; }',
    '#capture-list .ann .sel { color: #4FC3F7; font-family: monospace; font-size: 0.7rem; word-break: break-all; }',
    '#capture-list .ann .txt { color: #aaa; font-style: italic; font-size: 0.72rem; margin-top: 2px; }',
    '#capture-list .ann textarea {',
    '  width: 100%; background: #1a1a1a; color: #f0f0f0;',
    '  border: 1px solid #3a3a3a; border-radius: 4px;',
    '  padding: 4px; margin-top: 4px; font-size: 0.75rem; font-family: inherit; resize: vertical; min-height: 32px;',
    '  box-sizing: border-box;',
    '}',
    '#capture-list .ann .row { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }',
    '#capture-list .ann .num { color: #FFB74D; font-weight: 700; font-size: 0.72rem; margin-bottom: 2px; }',
    '#capture-list .ann button { background: transparent; border: none; color: #FF4444; cursor: pointer; font-size: 0.9rem; padding: 0 4px; }',
    '#capture-panel footer { padding: 8px; border-top: 1px solid #333; display: flex; gap: 6px; background: #1a1a1a; border-radius: 0 0 8px 8px; }',
    '#capture-panel footer button { background: #00CC66; color: #000; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-weight: 700; font-size: 0.78rem; flex: 1; font-family: inherit; }',
    '#capture-panel footer button.clear { background: #555; color: #ddd; flex: 0 0 auto; }',
    '#capture-panel .empty { color: #555; font-style: italic; padding: 12px; text-align: center; }'
  ].join('\n');
  document.head.appendChild(style);

  // ----- UI injection -----
  function injectUi() {
    if (document.getElementById('capture-fab')) return;
    var fab = document.createElement('button');
    fab.id = 'capture-fab';
    fab.title = 'Outil de capture (developpement)';
    fab.innerHTML = '\u{1F4CD}';
    document.body.appendChild(fab);

    var hint = document.createElement('div');
    hint.id = 'capture-hint';
    hint.innerHTML = '\u{1F3AF} Mode capture actif &mdash; clique sur un element pour l\'annoter';
    document.body.appendChild(hint);

    var panel = document.createElement('div');
    panel.id = 'capture-panel';
    panel.innerHTML = ''
      + '<header>'
      +   '<strong>\u{1F4CD} Annotations</strong>'
      +   '<span id="capture-count" style="font-size:0.72rem;background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:3px;">0</span>'
      + '</header>'
      + '<div id="capture-list"><div class="empty">Aucune annotation. Active la capture et clique sur un element.</div></div>'
      + '<footer>'
      +   '<button id="capture-copy">\u{1F4CB} Copier</button>'
      +   '<button id="capture-clear" class="clear">\u{1F5D1}</button>'
      + '</footer>';
    document.body.appendChild(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  function start() {
    injectUi();
    var btn = document.getElementById('capture-fab');
    var panel = document.getElementById('capture-panel');
    var list = document.getElementById('capture-list');
    var count = document.getElementById('capture-count');
    var annotations = [];
    try { annotations = JSON.parse(localStorage.getItem(KEY_DATA) || '[]'); } catch (e) {}
    var mode = false;
    var counter = annotations.reduce(function (m, a) { return Math.max(m, a.n || 0); }, 0);

    function save() { try { localStorage.setItem(KEY_DATA, JSON.stringify(annotations)); } catch (e) {} }

    function selFor(el) {
      if (el.id) return '#' + el.id;
      var parts = [];
      while (el && el !== document.body && parts.length < 4) {
        var t = el.tagName.toLowerCase();
        if (el.className && typeof el.className === 'string') {
          var cls = el.className.split(' ').filter(Boolean).slice(0, 2).join('.');
          if (cls) t += '.' + cls;
        }
        parts.unshift(t);
        el = el.parentElement;
      }
      return parts.join(' > ');
    }

    function render() {
      count.textContent = annotations.length;
      if (!annotations.length) {
        list.innerHTML = '<div class="empty">Aucune annotation. Active la capture et clique sur un element.</div>';
        return;
      }
      list.innerHTML = annotations.map(function (a, i) {
        return '<div class="ann">'
          + '<div class="num">#' + a.n + '</div>'
          + '<div class="sel">' + a.sel + '</div>'
          + (a.txt ? '<div class="txt">"' + a.txt.replace(/"/g, '&quot;') + '"</div>' : '')
          + '<textarea data-idx="' + i + '" placeholder="Commentaire...">' + (a.comment || '') + '</textarea>'
          + '<div class="row"><span style="color:#888;font-size:0.7rem">x=' + a.x + ' y=' + a.y + ' (' + a.w + 'x' + a.h + ')</span><button data-del="' + i + '">✖</button></div>'
          + '</div>';
      }).join('');
      list.querySelectorAll('textarea[data-idx]').forEach(function (ta) {
        ta.addEventListener('input', function () {
          var i = parseInt(this.dataset.idx);
          if (annotations[i]) { annotations[i].comment = this.value; save(); }
        });
      });
      list.querySelectorAll('button[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          var i = parseInt(this.dataset.del);
          annotations.splice(i, 1); save(); render();
        });
      });
    }

    function buildReport() {
      var lines = ['=== Annotations sur la page ===', 'URL: ' + location.href.replace(/[?&]cb=[^&]*/, ''), ''];
      annotations.forEach(function (a) {
        lines.push('#' + a.n + ' ' + a.sel);
        if (a.txt) lines.push('  Contenu: "' + a.txt + '"');
        lines.push('  Position: x=' + a.x + ' y=' + a.y + ' (' + a.w + 'x' + a.h + 'px)');
        if (a.comment) lines.push(' ' + a.comment);
        lines.push('');
      });
      return lines.join('\n');
    }

    function onHover(e) { if (!mode) return; e.target.style.outline = '2px solid #FFB74D'; e.target.style.outlineOffset = '2px'; }
    function onHoverOut(e) { e.target.style.outline = ''; e.target.style.outlineOffset = ''; }
    function onClick(e) {
      if (!mode) return;
      if (e.target.closest('#capture-panel') || e.target.closest('#capture-fab') || e.target.closest('#capture-hint')) return;
      e.preventDefault(); e.stopPropagation();
      var el = e.target;
      var rect = el.getBoundingClientRect();
      var txt = (el.innerText || el.textContent || '').trim().slice(0, 80);
      counter++;
      annotations.push({
        n: counter, sel: selFor(el), txt: txt,
        x: Math.round(rect.left), y: Math.round(rect.top),
        w: Math.round(rect.width), h: Math.round(rect.height),
        comment: ''
      });
      save(); render();
      if (!panel.classList.contains('open')) panel.classList.add('open');
    }

    function setMode(on) {
      mode = !!on;
      document.body.classList.toggle('capture-mode', mode);
      btn.classList.toggle('active', mode);
      try { localStorage.setItem(KEY_MODE, mode ? '1' : '0'); } catch (e) {}
      if (mode) {
        document.body.addEventListener('click', onClick, true);
        document.body.addEventListener('mouseover', onHover, true);
        document.body.addEventListener('mouseout', onHoverOut, true);
        panel.classList.add('open');
      } else {
        document.body.removeEventListener('click', onClick, true);
        document.body.removeEventListener('mouseover', onHover, true);
        document.body.removeEventListener('mouseout', onHoverOut, true);
      }
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setMode(!mode);
    });
    document.getElementById('capture-copy').addEventListener('click', function () {
      navigator.clipboard.writeText(buildReport()).then(function () {
        var b = document.getElementById('capture-copy');
        var prev = b.innerHTML;
        b.innerHTML = '✓ Copie';
        setTimeout(function () { b.innerHTML = prev; }, 1500);
      });
    });
    document.getElementById('capture-clear').addEventListener('click', function () {
      if (!annotations.length) return;
      if (!confirm('Effacer toutes les ' + annotations.length + ' annotations ?')) return;
      annotations = []; counter = 0; save(); render();
    });

    render();
    try { if (localStorage.getItem(KEY_MODE) === '1') setMode(true); } catch (e) {}
  }
})();
