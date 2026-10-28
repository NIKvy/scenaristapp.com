/* Click-to-load YouTube player for the lesson pages.
   Until the poster is pressed the page makes no request to YouTube: the
   poster is a local image. Pressing it (or a chapter) swaps in the
   privacy-enhanced (youtube-nocookie.com) player, already playing. */
(function () {
  var fig = document.querySelector('.video[data-yt]');
  if (!fig) return;

  var id = fig.getAttribute('data-yt');
  var title = fig.getAttribute('data-title') || 'Video';
  var holder = fig.querySelector('.video-frame');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function play(start) {
    var frame = holder.querySelector('iframe');
    var src = 'https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&rel=0&playsinline=1' + (start > 0 ? '&start=' + start : '');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = title;
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      holder.textContent = '';
      holder.appendChild(frame);
    }
    frame.src = src;
    frame.focus();
  }

  fig.querySelector('.video-poster').addEventListener('click', function () { play(0); });

  document.querySelectorAll('a[data-t]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      play(Number(a.getAttribute('data-t')) || 0);
      fig.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    });
  });
})();
