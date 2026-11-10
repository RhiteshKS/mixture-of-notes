(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduceMotion = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /* ------------------------------------------------------------
     theme toggle (the saved choice is applied by a tiny inline
     script in <head> so there is no flash of the wrong theme)
  ------------------------------------------------------------ */
  var SUN = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="3.6"/><path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 11.6A6.8 6.8 0 0 1 8.4 3.5a6.8 6.8 0 1 0 8.1 8.1z"/></svg>';
  function effectiveTheme() {
    var t = root.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function syncTheme() {
    var btn = $('#theme');
    if (!btn) return;
    var dark = effectiveTheme() === 'dark';
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  var themeBtn = $('#theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('mon-theme', next); } catch (e) {}
      syncTheme();
    });
  }
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', syncTheme);
  }
  syncTheme();

  /* ------------------------------------------------------------
     copy buttons on code blocks
  ------------------------------------------------------------ */
  function flash(btn, label) {
    btn.textContent = label;
    setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.copy');
    if (!btn) return;
    var code = $('code', btn.closest('.code'));
    var p;
    try { p = navigator.clipboard.writeText(code.textContent); } catch (err) { p = Promise.reject(err); }
    p.then(function () { flash(btn, 'Copied'); }).catch(function () {
      var range = document.createRange();
      range.selectNodeContents(code);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      flash(btn, 'Press Ctrl+C');
    });
  });

  /* ------------------------------------------------------------
     post pages: reading progress and active table-of-contents link
  ------------------------------------------------------------ */
  var article = $('#article');
  var bar = $('#progress i');
  var tocLinks = $$('.toc a');
  function onScroll() {
    if (article && bar) {
      var r = article.getBoundingClientRect();
      var total = Math.max(1, r.height - window.innerHeight * 0.5);
      bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, -r.top / total)) + ')';
    }
    if (tocLinks.length) {
      var cur = null;
      tocLinks.forEach(function (a) {
        var h = document.getElementById(a.getAttribute('href').slice(1));
        if (h && h.getBoundingClientRect().top < 140) cur = a;
      });
      tocLinks.forEach(function (a) { a.classList.toggle('on', a === cur); });
    }
  }
  if (article) {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------
     writing page: search and series filter over the rendered list
  ------------------------------------------------------------ */
  var list = $('#list');
  if (list) {
    var input = $('#search');
    var empty = $('#empty');
    var rows = $$('.row', list);
    var groups = $$('.year-group', list);
    var state = { q: '', f: 'all' };
    var apply = function () {
      var q = state.q.trim().toLowerCase(), shown = 0;
      rows.forEach(function (r) {
        var okF = state.f === 'all' || r.getAttribute('data-series') === state.f;
        var ok = okF && (!q || r.getAttribute('data-hay').indexOf(q) !== -1);
        r.hidden = !ok;
        if (ok) shown++;
      });
      groups.forEach(function (g) {
        g.hidden = !$$('.row', g).some(function (r) { return !r.hidden; });
      });
      if (empty) empty.hidden = shown > 0;
    };
    if (input) input.addEventListener('input', function () { state.q = input.value; apply(); });
    $$('[data-f]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.f = b.getAttribute('data-f');
        $$('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        apply();
      });
    });
  }

  /* ------------------------------------------------------------
     home page: illustrative loss curve, drawn at the real pixel width
  ------------------------------------------------------------ */
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var box = $('#chart');
  if (box) {
    var N = 3000, Y0 = 0.4, Y1 = 3.0;
    var rnd = mulberry(42), train = [], evals = [], s0;
    var fmtN = function (n) { return Math.round(n).toLocaleString('en-US'); };
    for (s0 = 0; s0 <= N; s0 += 10) {
      var b1 = 0.55 + 2.1 * Math.exp(-s0 / 430) + 0.25 * Math.exp(-s0 / 1800);
      var n1 = (rnd() - 0.5) * (0.05 + 0.35 * Math.exp(-s0 / 700));
      train.push([s0, Math.max(0.4, b1 + n1)]);
    }
    for (s0 = 0; s0 <= N; s0 += 150) {
      var b2 = 0.82 + 1.9 * Math.exp(-s0 / 460) + (s0 > 2100 ? (s0 - 2100) * 0.00009 : 0);
      evals.push([s0, b2 + (rnd() - 0.5) * 0.02]);
    }
    var best = evals.reduce(function (a, b) { return b[1] < a[1] ? b : a; });
    var evalAt = function (s) {
      var i = Math.min(evals.length - 2, Math.floor(s / 150)), a = evals[i], b = evals[i + 1];
      var t = Math.min(1, Math.max(0, (s - a[0]) / (b[0] - a[0])));
      return a[1] + (b[1] - a[1]) * t;
    };

    var drawChart = function (animate) {
      var W = Math.max(280, Math.round(box.clientWidth));
      var H = Math.round(Math.min(330, Math.max(220, W * 0.6)));
      var m = { l: 36, r: 10, t: 12, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
      var X = function (s) { return m.l + s / N * iw; };
      var Y = function (v) { return m.t + (1 - (v - Y0) / (Y1 - Y0)) * ih; };
      var pts = function (a) { return a.map(function (p) { return X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' L '); };
      var dT = 'M ' + pts(train), dE = 'M ' + pts(evals);
      var yt = [0.5, 1, 1.5, 2, 2.5], xt = [0, 1000, 2000, 3000];
      var bx = X(best[0]), by = Y(best[1]);

      box.innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" aria-label="Illustrative training and evaluation loss curves">' +
        '<rect class="g-warm" x="' + X(0) + '" y="' + m.t + '" width="' + (X(150) - X(0)) + '" height="' + ih + '"/>' +
        yt.map(function (v) {
          return '<line class="g-grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>' +
                 '<text class="g-axis" x="' + (m.l - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v.toFixed(1) + '</text>';
        }).join('') +
        xt.map(function (v) {
          return '<text class="g-axis" x="' + X(v) + '" y="' + (H - 6) + '" text-anchor="' + (v === 0 ? 'start' : v === N ? 'end' : 'middle') + '">' + (v === 0 ? '0' : v / 1000 + 'k') + '</text>';
        }).join('') +
        '<text class="g-axis" x="' + (W - m.r) + '" y="' + (m.t + 10) + '" text-anchor="end">loss</text>' +
        '<path class="g-ghost" d="' + dT + '"/>' +
        '<path class="g-train' + (animate && !reduceMotion() ? ' live' : '') + '" pathLength="1" d="' + dT + '"/>' +
        '<path class="g-eval" d="' + dE + '"/>' +
        '<circle class="g-best" cx="' + bx + '" cy="' + by + '" r="5"/>' +
        '<text class="g-note" x="' + (bx - 10) + '" y="' + (by - 14) + '" text-anchor="end">best checkpoint</text>' +
        '<line class="g-cross" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '"/>' +
        '</svg>';

      var svg = $('svg', box), cross = $('.g-cross', svg), ro = $('#readout');
      var def = 'best eval ' + best[1].toFixed(2) + ' at step ' + fmtN(best[0]);
      if (ro) ro.textContent = def;
      svg.addEventListener('pointermove', function (e) {
        var r = svg.getBoundingClientRect();
        var px = (e.clientX - r.left) * (W / r.width);
        var s = Math.min(N, Math.max(0, (px - m.l) / iw * N));
        var t = train[Math.round(s / 10)];
        cross.setAttribute('x1', X(s)); cross.setAttribute('x2', X(s)); cross.style.opacity = 1;
        if (ro) ro.textContent = 'step ' + fmtN(s) + ' · train ' + t[1].toFixed(2) + ' · eval ' + evalAt(s).toFixed(2);
      });
      svg.addEventListener('pointerleave', function () { cross.style.opacity = 0; if (ro) ro.textContent = def; });
    };

    var lastW = 0;
    drawChart(true);
    lastW = box.clientWidth;
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var w = box.clientWidth;
        if (Math.abs(w - lastW) > 1) { lastW = w; drawChart(false); }
      }).observe(box);
    }
  }
})();
