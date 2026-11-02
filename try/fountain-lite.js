/* Shared by the Try page and the /open/ page: the Fountain line rules, the
   title page, and the link encoding (UTF-8 text as base64url, the form
   Scenarist reads from scenarist://open?f=… and scenaristapp.com/open/#f=…). */
window.ScenaristFountain = (function () {
  'use strict';

  var LABELS = {
    blank: '', scene: 'Scene heading', action: 'Action', character: 'Character',
    dialogue: 'Dialogue', parenthetical: 'Parenthetical', transition: 'Transition',
    centered: 'Centered', note: 'Note'
  };

  var SCENE = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
  var TRANSITION_WORDS = /^(?:FADE OUT|FADE TO BLACK|CUT TO BLACK|SMASH CUT|THE END)[.:]?$/;

  function isUpper(s) {
    return /[A-Za-z]/.test(s) && s === s.toUpperCase();
  }

  // "JUNE (CONT'D) ^" -> "JUNE"
  function baseName(s) {
    return s.replace(/\s*\^\s*$/, '').replace(/(\s*\([^)]*\)\s*)+$/, '').trim();
  }

  function looksLikeCharacter(t) {
    var name = baseName(t);
    if (!name || !isUpper(name)) return false;
    if (/[:.!?,;]$/.test(name)) return false;          // FADE IN:, BANG!, THE END.
    if (name.split(/\s+/).length > 6) return false;     // a shouted action line
    return true;
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

  // A Fountain title page is "Key: value" lines at the very top, up to the
  // first empty line. Returns the keys and the body without them.
  function splitTitlePage(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var keys = {};
    var i = 0;
    if (/^[A-Za-z][A-Za-z ]*:\s*\S/.test(lines[0] || '')) {
      for (; i < lines.length && lines[i].trim() !== ''; i++) {
        var m = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(lines[i]);
        if (m) keys[m[1].toLowerCase()] = m[2].trim();
      }
      while (i < lines.length && lines[i].trim() === '') i++;
    }
    return { keys: keys, body: lines.slice(i).join('\n') };
  }

  function encode(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(value) {
    var b = value.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = atob(b);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // The `f` value from a URL's fragment (#f=…) or query (?f=…).
  function payloadFrom(url) {
    var parts = [url.hash.replace(/^#/, ''), url.search.replace(/^\?/, '')];
    for (var p = 0; p < parts.length; p++) {
      var pairs = parts[p].split('&');
      for (var i = 0; i < pairs.length; i++) {
        var eq = pairs[i].indexOf('=');
        if (eq > 0 && pairs[i].slice(0, eq) === 'f' && eq < pairs[i].length - 1) return decodeURIComponent(pairs[i].slice(eq + 1));
      }
    }
    return null;
  }

  // Lines into <div class="ln" data-t="…"> children of `root`.
  function render(root, lines) {
    var types = classify(lines);
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
    return types;
  }

  return { LABELS: LABELS, classify: classify, splitTitlePage: splitTitlePage, encode: encode, decode: decode, payloadFrom: payloadFrom, render: render };
})();
