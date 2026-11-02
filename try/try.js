/* Try page: a screenplay page you can type on.
   The page is one contenteditable block; every line is a <div class="ln">
   whose data-t attribute names its element type. After each edit the lines
   are read back, classified with the Fountain conventions, and the types
   re-applied. The DOM is rebuilt only when the browser left it in a shape
   we don't own (a paste, a stray text node), with the caret put back.
   Nothing leaves the browser: autosave is localStorage, export is a file. */
(function () {
  'use strict';

  var root = document.getElementById('page');
  var titleInput = document.getElementById('title');
  var countEl = document.getElementById('count');
  var labelEl = document.getElementById('el');
  var shareBtn = document.getElementById('share');
  var downloadBtn = document.getElementById('download');
  var copyBtn = document.getElementById('copy');
  var clearBtn = document.getElementById('clear');
  var exampleLink = document.getElementById('example');
  if (!root) return;

  var STORAGE_KEY = 'scenarist.try.v1';
  var APP_STORE = 'https://apps.apple.com/us/app/scenarist/id6762529535';

  var LABELS = {
    blank: '', scene: 'Scene heading', action: 'Action', character: 'Character',
    dialogue: 'Dialogue', parenthetical: 'Parenthetical', transition: 'Transition',
    centered: 'Centered', note: 'Note'
  };

  var EXAMPLE = [
    'INT. RADIO STATION - NIGHT',
    '',
    'A cramped booth, lit by one red ON AIR sign. JUNE, 30s, headphones half on, watches the clock tick over to 3:00.',
    '',
    'JUNE',
    '(into the mic)',
    "If you're still up, this one's for you.",
    '',
    'She drops the needle. Nothing. The record spins in silence.',
    '',
    "JUNE (CONT'D)",
    '...Or not.',
    '',
    'CUT TO:'
  ].join('\n');

  var model = { lines: [''], types: ['blank'] };
  var saveTimer = null;

  /* ---------- Fountain-ish classification ---------- */

  var SCENE = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
  var TRANSITION_WORDS = /^(?:FADE OUT|FADE TO BLACK|CUT TO BLACK|SMASH CUT|THE END)[.:]?$/;

  function isUpper(s) {
    return /[A-Za-z]/.test(s) && s === s.toUpperCase();
  }

  // "JUNE (CONT'D) ^" -> "JUNE"
  function baseName(s) {
    return s.replace(/\s*\^\s*$/, '').replace(/(\s*\([^)]*\)\s*)+$/, '').trim();
  }

  function inDialogue(prev) {
    return prev === 'character' || prev === 'parenthetical' || prev === 'dialogue';
  }

  function classify(lines) {
    var types = new Array(lines.length);
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      var prev = i > 0 ? types[i - 1] : 'blank';
      var afterBlank = prev === 'blank';
      var type;

      if (t === '') {
        type = 'blank';
      } else if (inDialogue(prev)) {
        type = t.charAt(0) === '(' ? 'parenthetical' : 'dialogue';
      } else if (t.charAt(0) === '!') {
        type = 'action';
      } else if (t.charAt(0) === '#' || t.charAt(0) === '=') {
        type = 'note';
      } else if (t.charAt(0) === '@' && afterBlank) {
        type = 'character';
      } else if ((t.charAt(0) === '.' && t.charAt(1) !== '.') || SCENE.test(t)) {
        type = 'scene';
      } else if (/^>.*<$/.test(t)) {
        type = 'centered';
      } else if (t.charAt(0) === '>') {
        type = 'transition';
      } else if (afterBlank && isUpper(t) && (/TO:$/.test(t) || TRANSITION_WORDS.test(t))) {
        type = 'transition';
      } else if (afterBlank && looksLikeCharacter(t)) {
        type = 'character';
      } else {
        type = 'action';
      }
      types[i] = type;
    }
    return types;
  }

  function looksLikeCharacter(t) {
    var name = baseName(t);
    if (!name || !isUpper(name)) return false;
    if (/[:.!?,;]$/.test(name)) return false;          // FADE IN:, BANG!, THE END.
    if (name.split(/\s+/).length > 6) return false;     // a shouted action line
    return true;
  }

  /* ---------- DOM <-> lines ---------- */

  var BLOCKS = { DIV: 1, P: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, PRE: 1,
    BLOCKQUOTE: 1, SECTION: 1, ARTICLE: 1, UL: 1, OL: 1, TABLE: 1, TBODY: 1, THEAD: 1, TR: 1, TD: 1, TH: 1 };

  // Text of a node tree, one line per block, exactly as the model splits it.
  function flatten(node) {
    function inner(n, isRoot) {
      var s = '';
      var kids = n.childNodes;
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c.nodeType === 3) {
          s += c.nodeValue.replace(/ /g, ' ');
        } else if (c.nodeType !== 1) {
          continue;
        } else if (c.nodeName === 'BR') {
          // A trailing <br> inside a block is the block's own line end.
          if (isRoot || i < kids.length - 1) s += '\n';
        } else if (BLOCKS[c.nodeName]) {
          if (s && s.charAt(s.length - 1) !== '\n') s += '\n';
          var b = inner(c, false);
          // Chrome (plaintext-only) ends a line break at the end of a block
          // with a second, placeholder newline (as separate text nodes); the
          // block's own end is the real line end, so one of the two goes.
          if (/\n\n$/.test(b)) b = b.slice(0, -1);
          s += b + '\n';
        } else {
          s += inner(c, false);
        }
      }
      return s;
    }
    return inner(node, true).replace(/\n$/, '');
  }

  // Every child is <div class="ln"> holding one text node (no newline) or one <br>.
  function isCanonical(lineCount) {
    var kids = root.childNodes;
    if (kids.length !== lineCount) return false;
    for (var i = 0; i < kids.length; i++) {
      var d = kids[i];
      if (d.nodeType !== 1 || d.nodeName !== 'DIV' || !d.classList.contains('ln')) return false;
      var inner = d.childNodes;
      if (inner.length === 0) return false;
      if (inner.length === 1) {
        var only = inner[0];
        if (only.nodeType === 3) { if (only.nodeValue.indexOf('\n') !== -1) return false; }
        else if (only.nodeName !== 'BR') return false;
      } else if (inner.length === 2) {
        if (inner[0].nodeType !== 3 || inner[0].nodeValue.indexOf('\n') !== -1 || inner[1].nodeName !== 'BR') return false;
      } else {
        return false;
      }
    }
    return true;
  }

  function caretOffset() {
    var sel = document.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0);
    if (!root.contains(r.endContainer)) return null;
    var pre = document.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(r.endContainer, r.endOffset);
    return flatten(pre.cloneContents()).length;
  }

  function setCaret(offset) {
    var sel = document.getSelection();
    if (!sel) return;
    var rem = offset;
    var kids = root.children;
    var target = null, pos = 0;
    for (var i = 0; i < kids.length; i++) {
      var d = kids[i];
      var text = d.firstChild && d.firstChild.nodeType === 3 ? d.firstChild : null;
      var len = text ? text.nodeValue.length : 0;
      if (rem <= len) { target = text || d; pos = text ? rem : 0; break; }
      rem -= len + 1;
    }
    if (!target && kids.length) {
      var last = kids[kids.length - 1];
      target = last.firstChild && last.firstChild.nodeType === 3 ? last.firstChild : last;
      pos = target.nodeType === 3 ? target.nodeValue.length : 0;
    }
    if (!target) return;
    var range = document.createRange();
    range.setStart(target, pos);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function rebuild(lines, types, caret) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < lines.length; i++) {
      var d = document.createElement('div');
      d.className = 'ln';
      d.setAttribute('data-t', types[i]);
      if (lines[i]) d.textContent = lines[i];
      else d.appendChild(document.createElement('br'));
      frag.appendChild(d);
    }
    root.replaceChildren(frag);
    if (caret !== null && caret !== undefined) setCaret(caret);
  }

  function sync() {
    var lines = flatten(root).split('\n');
    var types = classify(lines);
    if (isCanonical(lines.length)) {
      var kids = root.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].getAttribute('data-t') !== types[i]) kids[i].setAttribute('data-t', types[i]);
      }
    } else {
      rebuild(lines, types, caretOffset());
    }
    model.lines = lines;
    model.types = types;
    root.classList.toggle('is-empty', lines.length === 1 && lines[0] === '');
    updateCount();
    updateLabel();
    scheduleSave();
  }

  function setText(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    rebuild(lines, classify(lines), null);
    sync();
  }

  /* ---------- status ---------- */

  function updateCount() {
    var text = model.lines.join('\n');
    var words = text.split(/\s+/).filter(Boolean).length;
    if (!words) { countEl.textContent = '0 words'; return; }
    // Rough rendered line count: a page holds about 55 lines.
    var rendered = 0;
    for (var i = 0; i < model.lines.length; i++) {
      var t = model.types[i], len = model.lines[i].length;
      var width = t === 'dialogue' ? 35 : t === 'parenthetical' ? 25 : 60;
      rendered += Math.max(1, Math.ceil(len / width));
    }
    var eighths = Math.max(1, Math.round(rendered / 55 * 8));
    var whole = Math.floor(eighths / 8), part = eighths % 8;
    var pages = (whole ? whole + ' ' : '') + (part ? part + '/8' : '');
    pages = pages.trim() + (eighths > 8 ? ' pages' : ' page');
    countEl.textContent = words + (words === 1 ? ' word' : ' words') + ' · ' + pages;
  }

  function currentLineIndex() {
    var sel = document.getSelection();
    if (!sel || !sel.rangeCount) return -1;
    var n = sel.focusNode;
    if (!n || !root.contains(n)) return -1;
    if (n === root) return Math.min(sel.focusOffset, root.children.length - 1);
    while (n && n.parentNode !== root) n = n.parentNode;
    return n ? Array.prototype.indexOf.call(root.children, n) : -1;
  }

  function updateLabel() {
    var i = currentLineIndex();
    var t = i >= 0 ? model.types[i] : null;
    labelEl.textContent = t ? LABELS[t] : '';
    if (t) labelEl.setAttribute('data-t', t); else labelEl.removeAttribute('data-t');
  }

  /* ---------- storage ---------- */

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }

  function save() {
    try {
      var text = model.lines.join('\n');
      if (!text && !titleInput.value) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: titleInput.value, text: text, savedAt: Date.now() }));
    } catch (e) { /* private mode or storage off: the page still works */ }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && typeof data.text === 'string' && data.text) {
        titleInput.value = data.title || '';
        setText(data.text);
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /* ---------- export ---------- */

  function fountainText() {
    var title = titleInput.value.trim();
    var body = model.lines.join('\n').replace(/\n+$/, '');
    var head = '';
    if (title) {
      var d = new Date();
      var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      head = 'Title: ' + title + '\nDraft date: ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + '\n\n';
    }
    return head + body + '\n';
  }

  function fileName() {
    var slug = titleInput.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (slug || 'scene') + '.fountain';
  }

  function makeFile() {
    return new File([fountainText()], fileName(), { type: 'text/plain' });
  }

  function flash(btn, text) {
    var old = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', old);
    btn.textContent = text;
    btn.classList.add('is-done');
    setTimeout(function () { btn.textContent = old; btn.classList.remove('is-done'); }, 1600);
  }

  function hasText() {
    return model.lines.join('').trim().length > 0;
  }

  downloadBtn.addEventListener('click', function () {
    if (!hasText()) { root.focus(); return; }
    var blob = new Blob([fountainText()], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    flash(downloadBtn, 'Saved');
  });

  copyBtn.addEventListener('click', function () {
    if (!hasText()) { root.focus(); return; }
    var text = fountainText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(copyBtn, 'Copied'); }, function () { flash(copyBtn, 'Select and copy'); });
    } else {
      flash(copyBtn, 'Select and copy');
    }
  });

  var clearTimer = null;
  clearBtn.addEventListener('click', function () {
    if (!clearBtn.classList.contains('is-arm')) {
      if (!hasText() && !titleInput.value) return;
      clearBtn.classList.add('is-arm');
      clearBtn.textContent = 'Clear everything?';
      clearTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    titleInput.value = '';
    setText('');
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    root.focus();
    setCaret(0);
  });

  function disarm() {
    clearTimeout(clearTimer);
    clearBtn.classList.remove('is-arm');
    clearBtn.textContent = 'Clear';
  }

  // Web Share with a file: on iPhone and iPad the share sheet lists Scenarist
  // as an app that opens .fountain. Shown only where the browser can do it.
  var isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var canShareFiles = false;
  try {
    canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.fountain', { type: 'text/plain' })] }));
  } catch (e) { canShareFiles = false; }

  if (canShareFiles) {
    shareBtn.hidden = false;
    shareBtn.textContent = isApple ? 'Send to Scenarist' : 'Share…';
    shareBtn.addEventListener('click', function () {
      if (!hasText()) { root.focus(); return; }
      navigator.share({ files: [makeFile()], title: titleInput.value.trim() || 'Scene' })
        .catch(function () { /* cancelled, or the sheet refused the file */ });
    });
  }

  if (exampleLink) {
    exampleLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (!titleInput.value) titleInput.value = 'Dead Air';
      setText(EXAMPLE);
      root.focus();
      setCaret(flatten(root).length);
    });
  }

  /* ---------- editing ---------- */

  root.addEventListener('input', sync);

  root.addEventListener('paste', function (e) {
    var cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    var text = cd.getData('text/plain');
    if (text == null) return;
    e.preventDefault();
    var sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    range.deleteContents();
    var node = document.createTextNode(text.replace(/\r\n?/g, '\n'));
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    sync();
  });

  root.addEventListener('drop', function (e) { e.preventDefault(); });

  root.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') e.preventDefault(); // the page has no tab stops; keep focus here
  });

  document.addEventListener('selectionchange', updateLabel);
  root.addEventListener('focus', updateLabel);
  root.addEventListener('blur', function () { labelEl.textContent = ''; labelEl.removeAttribute('data-t'); });

  titleInput.addEventListener('input', scheduleSave);

  // Keep the page a single empty line when everything was deleted.
  root.addEventListener('beforeinput', function (e) {
    if (e.inputType && e.inputType.indexOf('delete') === 0 && root.childNodes.length <= 1) {
      var only = root.firstChild;
      if (only && only.nodeType === 1 && only.childNodes.length === 1 && only.firstChild.nodeName === 'BR') e.preventDefault();
    }
  });

  /* ---------- start ---------- */

  if (!restore()) setText('');
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    root.focus();
    setCaret(flatten(root).length);
  }
})();
