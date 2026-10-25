(function () {
'use strict';
var me = document.currentScript;
var GC = me.getAttribute('data-gc');
var CANONICAL = me.getAttribute('data-canonical');
function $(sel) { return document.querySelector(sel); }
function getJson(url) {
return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
if (!r.ok) throw new Error(r.status);
return r.json();
});
}
function cached(key, maxAgeMs, load) {
try {
var hit = JSON.parse(sessionStorage.getItem(key));
if (hit && Date.now() - hit.at < maxAgeMs) return Promise.resolve(hit.v);
} catch (e) { /* no storage: load every time */ }
return load().then(function (v) {
try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), v: v })); } catch (e) { /* ignore */ }
return v;
});
}
function plural(n, one, few, many) {
var m10 = n % 10, m100 = n % 100;
if (m10 === 1 && m100 !== 11) return one;
if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
return many;
}
function fmt(n) { return n.toLocaleString('ru-RU'); }
if (GC) {
if (location.href.indexOf(CANONICAL) === 0) {
new Image().src = GC + '/count?p=' + encodeURIComponent(location.pathname)
+ '&t=' + encodeURIComponent(document.title)
+ '&r=' + encodeURIComponent(document.referrer)
+ '&s=' + encodeURIComponent(screen.width + ',' + screen.height + ',' + (window.devicePixelRatio || 1))
+ '&rnd=' + Math.random().toString(36).slice(2);
}
var visits = $('[data-visits]');
if (visits) {
cached('bht-visits', 10 * 60 * 1000, function () {
return getJson(visits.getAttribute('data-visits')).then(function (j) { return parseInt(String(j.count).replace(/\D/g, ''), 10); });
}).then(function (n) {
if (!(n >= 0)) return;
visits.querySelector('[data-out="visits"]').textContent = fmt(n);
visits.hidden = false;
}).catch(function () { /* counter is optional */ });
}
}
var stats = $('[data-stats]');
if (stats) {
var version = stats.getAttribute('data-version');
cached('bht-releases', 10 * 60 * 1000, function () {
return getJson(stats.getAttribute('data-stats')).then(function (list) {
return list.filter(function (r) { return !r.draft && !r.prerelease && r.published_at; }).map(function (r) {
var n = 0;
r.assets.forEach(function (a) { if (/\.apk$/i.test(a.name)) n += a.download_count; });
return { tag: r.tag_name, at: Date.parse(r.published_at), n: n };
}).sort(function (a, b) { return b.at - a.at; });
});
}).then(function (rel) {
var i = -1;
rel.forEach(function (r, k) { if (r.tag === 'v' + version) i = k; });
if (i < 0) return;
var day = 24 * 3600 * 1000;
var days = function (from, to) { return Math.max(1, Math.round((to - from) / day)); };
var rate = function (n, d) { return d > 1 ? ' (≈' + fmt(Math.round(n / d * 10) / 10) + ' в день)' : ''; };
var cur = rel[i], prev = rel[i + 1];
var d = days(cur.at, Date.now());
var out = stats.querySelector('[data-out="downloads"]');
var li = document.createElement('li');
li.textContent = 'Версия ' + version + ': ' + fmt(cur.n) + ' ' + plural(cur.n, 'скачивание', 'скачивания', 'скачиваний')
+ ' за ' + d + ' ' + plural(d, 'день', 'дня', 'дней') + rate(cur.n, d);
out.appendChild(li);
if (prev) {
var pd = days(prev.at, cur.at);
li = document.createElement('li');
li.textContent = 'Версия ' + prev.tag.replace(/^v/, '') + ': ' + fmt(prev.n) + ' за ' + pd + ' '
+ plural(pd, 'день', 'дня', 'дней') + ', пока была текущей' + rate(prev.n, pd);
out.appendChild(li);
}
stats.hidden = false;
}).catch(function () { /* stats are optional */ });
}
var form = $('form[data-feedback]');
if (form) {
var email = form.querySelector('[name="email"]');
var consent = form.querySelector('[data-consent]');
var agree = consent.querySelector('input');
var status = form.querySelector('[data-out="fb-status"]');
var send = form.querySelector('button[type="submit"]');
var syncConsent = function () {
var need = email.value.trim() !== '';
consent.hidden = !need;
agree.required = need;
};
email.addEventListener('input', syncConsent);
syncConsent();
form.addEventListener('submit', function (ev) {
ev.preventDefault();
if (!form.reportValidity()) return;
send.disabled = true;
status.className = 'fb-status';
status.textContent = 'Отправляем…';
fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
.then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.success) throw new Error(j.message || r.status); }); })
.then(function () {
form.reset();
syncConsent();
status.className = 'fb-status ok';
status.textContent = 'Спасибо! Сообщение отправлено.';
})
.catch(function () {
status.className = 'fb-status bad';
status.textContent = 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз.';
})
.then(function () { send.disabled = false; });
});
}
})();