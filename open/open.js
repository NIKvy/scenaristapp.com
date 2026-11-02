/* /open/: shows the scene carried in the link (#f=base64url Fountain), read
   only. With Scenarist installed, iOS opens the app before this page loads
   (universal link); this is what everyone else sees. */
(function () {
  'use strict';

  var F = window.ScenaristFountain;
  var sceneEl = document.getElementById('scene');
  var emptyEl = document.getElementById('empty');
  var page = document.getElementById('page');
  var titleEl = document.getElementById('title');
  var countEl = document.getElementById('count');
  var openAppBtn = document.getElementById('openapp');
  var editBtn = document.getElementById('edit');
  var downloadBtn = document.getElementById('download');

  var OPEN_IN_APP = false; // on once Scenarist 1.13 (scenarist://open) is on the App Store
  var STORAGE_KEY = 'scenarist.try.v1';

  var payload = F.payloadFrom(window.location);
  var text = null;
  if (payload) {
    try { text = F.decode(payload); } catch (e) { text = null; }
  }
  if (!text || !text.trim()) {
    emptyEl.hidden = false;
    return;
  }

  var parts = F.splitTitlePage(text);
  var title = parts.keys.title || '';
  var body = parts.body.replace(/\n+$/, '');
  F.render(page, body.split('\n'));
  titleEl.textContent = title || 'Untitled';
  var words = body.split(/\s+/).filter(Boolean).length;
  countEl.textContent = words + (words === 1 ? ' word' : ' words');
  if (title) document.title = title + ' | Scenarist';
  sceneEl.hidden = false;

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (OPEN_IN_APP && isIOS) {
    openAppBtn.hidden = false;
    openAppBtn.addEventListener('click', function () {
      window.location.href = 'scenarist://open?f=' + payload;
    });
  }

  editBtn.addEventListener('click', function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ title: title, text: body, savedAt: Date.now() }));
    } catch (e) { /* storage off: the Try page opens empty */ }
    window.location.href = '/try/';
  });

  downloadBtn.addEventListener('click', function () {
    var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scene';
    var blob = new Blob([text.replace(/\n*$/, '\n')], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = slug + '.fountain';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  });
})();
