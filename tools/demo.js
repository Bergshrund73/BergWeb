// "Try it in the browser" demo: one starter list, two modes, live stroke checking.
// The stroke check is a port of the app's StrokeValidationEngine (default StrokeValidationConfig).
// Stroke outlines are Make Me a Hanzi paths drawn with Path2D, so the page ships no SVG.
(function () {
  'use strict';
  var root = document.querySelector('.demo');
  if (!root) return;

  var INK = '#22201C', RED = '#B3362B', JADE = '#2F6B4F';
  var $ = function (sel) { return root.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var canvas = $('.demo-cell canvas');
  var ctx = canvas.getContext('2d');
  var data = null;
  var st = { mode: 'trace', wi: 0, ci: 0, done: 0, misses: 0, errs: 0, hint: false, flash: null, demoAt: -1 };
  var ink = [], drawing = false, inkColor = INK, flashTimer = 0, demoTimer = 0, paths = {};

  // ---------- geometry (normalised: x/1024, (900 - y)/1024, like the app) ----------
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function smooth(p) {
    if (p.length < 3) return p;
    return p.map(function (pt, i) {
      if (i === 0 || i === p.length - 1) return pt;
      return [(p[i - 1][0] + pt[0] + p[i + 1][0]) / 3, (p[i - 1][1] + pt[1] + p[i + 1][1]) / 3];
    });
  }
  function resample(p, n) {
    var out = [], i, k;
    if (p.length === 1) { for (k = 0; k < n; k++) out.push(p[0]); return out; }
    var s = smooth(p), L = [0];
    for (i = 1; i < s.length; i++) L.push(L[i - 1] + dist(s[i - 1], s[i]));
    var total = L[L.length - 1];
    for (k = 0; k < n; k++) {
      var t = total * k / (n - 1);
      if (total < 1e-6 || t <= 0) { out.push(s[0]); continue; }
      if (t >= total) { out.push(s[s.length - 1]); continue; }
      i = 1;
      while (i < L.length && L[i] < t) i++;
      var seg = L[i] - L[i - 1], f = seg < 1e-8 ? 0 : (t - L[i - 1]) / seg;
      out.push([s[i - 1][0] + (s[i][0] - s[i - 1][0]) * f, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * f]);
    }
    return out;
  }
  function pathLen(p) { var s = 0; for (var i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; }
  function dir(p) {
    if (p.length < 2) return null;
    var dx = p[p.length - 1][0] - p[0][0], dy = p[p.length - 1][1] - p[0][1];
    return Math.hypot(dx, dy) < 1e-6 ? null : Math.atan2(dy, dx) * 180 / Math.PI;
  }
  function angle(a, b) { var d = (a - b) % 360; if (d < -180) d += 360; if (d > 180) d -= 360; return Math.abs(d); }
  function segDist(p, a, b) {
    var abx = b[0] - a[0], aby = b[1] - a[1], len = abx * abx + aby * aby;
    if (len < 1e-12) return dist(p, a);
    var t = Math.min(1, Math.max(0, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len));
    return dist(p, [a[0] + abx * t, a[1] + aby * t]);
  }
  function toPoly(p, poly) {
    if (poly.length === 1) return dist(p, poly[0]);
    var m = Infinity;
    for (var i = 0; i < poly.length - 1; i++) m = Math.min(m, segDist(p, poly[i], poly[i + 1]));
    return m;
  }
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  function validate(user, median) {
    if (user.length < 2) return false;
    var U = resample(user, 32), R = resample(median, 32);
    var ud = dir(U), rd = dir(R);
    if (ud !== null && rd !== null && angle(ud, rd) > 45) return false;
    var fwd = U.map(function (p) { return toPoly(p, R); });
    if (mean(fwd) > 0.12 || Math.max.apply(null, fwd) > 0.20) return false;
    var all = fwd.concat(R.map(function (p) { return toPoly(p, U); })).sort(function (a, b) { return a - b; });
    if (all[Math.max(0, Math.ceil(0.9 * all.length) - 1)] > 0.18) return false;
    if (mean(U.map(function (p, i) { return dist(p, R[i]); })) > 0.16) return false;
    var tail = Math.max(1, Math.floor(32 * 0.15)) + 1;
    var ue = dir(U.slice(-tail)), re = dir(R.slice(-tail));
    if (ue !== null && re !== null && angle(ue, re) > 60) return false;
    var refLen = pathLen(smooth(median));
    return refLen <= 0 || pathLen(smooth(user)) / refLen <= 1.6;
  }

  // ---------- state helpers ----------
  function word() { return data.words[st.wi]; }
  function chars() { return Array.from(word().hz); }
  function charData() { return data.chars[chars()[st.ci]]; }
  function charDone() { return st.done >= charData().s.length; }
  function showHint() {
    return !charDone() && st.demoAt < 0 && (st.hint || st.misses >= (st.mode === 'trace' ? 1 : 2));
  }
  function path(d) { return paths[d] || (paths[d] = new Path2D(d)); }

  // ---------- drawing ----------
  function resize() {
    var r = canvas.getBoundingClientRect(), px = Math.round(r.width * (window.devicePixelRatio || 1));
    if (px > 0 && canvas.width !== px) { canvas.width = px; canvas.height = px; }
    draw();
  }
  function draw() {
    var w = canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, w);
    if (!data || root.dataset.screen !== 'write') return;
    var s = w / 1024, strokes = charData().s, done = charDone(), hint = showHint();
    ctx.setTransform(s, 0, 0, -s, 0, 900 * s);
    strokes.forEach(function (d, i) {
      var fill = st.mode === 'trace' ? 'rgba(179,54,43,.16)' : null;
      if (st.demoAt >= 0) fill = i <= st.demoAt ? RED : 'rgba(179,54,43,.10)';
      else if (i < st.done) fill = (i === st.done - 1 && st.flash === 'ok' && !done) ? JADE : INK;
      else if (i === st.done && hint) fill = 'rgba(179,54,43,.6)';
      if (fill) { ctx.fillStyle = fill; ctx.fill(path(d)); }
    });
    if (!ink.length) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = w * 0.034; ctx.strokeStyle = inkColor;
    ctx.beginPath();
    ctx.moveTo(ink[0][0] * w, ink[0][1] * w);
    ink.forEach(function (p) { ctx.lineTo(p[0] * w, p[1] * w); });
    if (ink.length === 1) ctx.lineTo(ink[0][0] * w + 0.1, ink[0][1] * w);
    ctx.stroke();
  }

  // ---------- UI ----------
  function show(screen) {
    root.dataset.screen = screen;
    $$('.demo-screen').forEach(function (el) { el.hidden = el.dataset.screen !== screen; });
    var idx = { list: 0, mode: 1, write: 2, done: 2 }[screen];
    $$('.demo-steps li').forEach(function (li, i) {
      li.classList.toggle('on', i <= idx);
      if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (screen === 'write') { render(); resize(); }
  }
  function render() {
    var w = word(), cs = chars(), done = charDone(), count = charData().s.length;
    $('[data-out="progress"]').textContent = 'Слово ' + (st.wi + 1) + ' из ' + data.words.length + ' · ' + (st.mode === 'trace' ? 'Обводка' : 'По памяти');
    $('[data-out="ru"]').textContent = w.ru;
    $('[data-out="py"]').textContent = w.py;
    var cells = $('[data-out="cells"]');
    cells.textContent = '';
    cs.forEach(function (c, i) {
      var shown = i < st.ci || (i === st.ci && done), span = document.createElement('span');
      span.textContent = shown ? c : '？';
      span.className = 'demo-char' + (shown ? ' shown' : '') + (i === st.ci ? ' current' : '');
      span.lang = 'zh-Hans';
      cells.appendChild(span);
    });
    var which = cs.length > 1 ? ' (иероглиф ' + (st.ci + 1) + ' из ' + cs.length + ')' : '';
    var msg, tone;
    if (done) { msg = st.errs ? 'Верно! Иероглиф написан, ошибок: ' + st.errs + '.' : 'Верно! Иероглиф написан без ошибок.'; tone = 'ok'; }
    else if (st.demoAt >= 0) { msg = 'Смотрите порядок черт…'; tone = ''; }
    else if (st.flash === 'bad') { msg = showHint() ? 'Не совсем. Нужная черта подсвечена в клетке.' : 'Не совсем — попробуйте эту черту ещё раз.'; tone = 'bad'; }
    else if (st.flash === 'ok') { msg = 'Хорошо! Следующая черта.'; tone = 'ok'; }
    else { msg = (st.mode === 'trace' ? 'Обведите черты по порядку' : 'Напишите по памяти, черта за чертой') + which + '.'; tone = ''; }
    var status = $('[data-out="status"]');
    status.textContent = msg;
    status.className = 'demo-status' + (tone ? ' ' + tone : '');
    $('[data-out="stroke"]').textContent = 'Черта ' + Math.min(st.done + 1, count) + ' из ' + count;
    $('[data-out="errs"]').textContent = 'Ошибок: ' + st.errs;
    $('[data-out="bar"]').style.width = Math.round(st.done / count * 100) + '%';
    $('[data-out="char-done"]').hidden = !done;
    $('[data-action="demo"]').hidden = done;
    $('[data-action="demo"]').disabled = st.demoAt >= 0;
    var lastChar = st.ci === cs.length - 1, lastWord = st.wi === data.words.length - 1;
    $('[data-action="next"]').textContent = lastChar && lastWord ? 'Завершить' : (lastChar ? 'Следующее слово' : 'Следующий иероглиф');
    $('[data-action="hint"]').setAttribute('aria-pressed', String(st.hint));
    canvas.setAttribute('aria-label', 'Клетка для письма: напишите иероглиф ' + cs[st.ci] + ' по чертам');
  }
  function update(patch) {
    for (var k in patch) st[k] = patch[k];
    render(); draw();
  }
  function resetChar(patch) {
    clearInterval(demoTimer); clearTimeout(flashTimer);
    ink = [];
    var base = { done: 0, misses: 0, errs: 0, hint: false, flash: null, demoAt: -1 };
    for (var k in patch) base[k] = patch[k];
    update(base);
  }

  // ---------- pointer input ----------
  function pt(e) {
    var r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!data || charDone() || st.demoAt >= 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    clearTimeout(flashTimer);
    drawing = true; inkColor = INK; ink = [pt(e)];
    draw();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    ink.push(pt(e));
    draw();
  });
  function up() {
    if (!drawing) return;
    drawing = false;
    if (validate(ink, charData().m[st.done])) {
      ink = [];
      update({ done: st.done + 1, misses: 0, hint: false, flash: 'ok' });
    } else {
      inkColor = RED;
      flashTimer = setTimeout(function () { ink = []; inkColor = INK; draw(); }, 450);
      update({ misses: st.misses + 1, errs: st.errs + 1, flash: 'bad' });
    }
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // ---------- buttons: one delegated handler ----------
  var actions = {
    open: function (btn) {
      btn.disabled = true;
      fetch(root.dataset.hanzi).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      }).then(function (json) {
        data = json;
        show('mode');
      }).catch(function () {
        $('[data-out="load-error"]').hidden = false;
      }).then(function () { btn.disabled = false; });
    },
    mode: function (btn) { st.mode = btn.dataset.mode; resetChar({ wi: 0, ci: 0 }); show('write'); },
    lists: function () { show('list'); },
    modes: function () { resetChar({}); show('mode'); },
    undo: function () { if (!charDone() && st.done > 0) { ink = []; update({ done: st.done - 1, flash: null }); } },
    retry: function () { resetChar({}); },
    hint: function () { update({ hint: !st.hint }); },
    demo: function () {
      resetChar({ demoAt: 0 });
      var count = charData().s.length;
      demoTimer = setInterval(function () {
        if (st.demoAt + 1 > count) { clearInterval(demoTimer); update({ demoAt: -1 }); }
        else update({ demoAt: st.demoAt + 1 });
      }, 550);
    },
    next: function () {
      if (st.ci < chars().length - 1) resetChar({ ci: st.ci + 1 });
      else if (st.wi < data.words.length - 1) resetChar({ wi: st.wi + 1, ci: 0 });
      else { resetChar({}); show('done'); }
    },
    restart: function () { resetChar({ wi: 0, ci: 0 }); show('list'); }
  };
  root.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (btn && root.contains(btn) && actions[btn.dataset.action]) actions[btn.dataset.action](btn);
  });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  root.classList.add('ready');
})();
