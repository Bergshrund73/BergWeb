// Builds the BergHanziTrainer landing page: images (AVIF/WebP/JPEG, fingerprinted), index.html,
// robots.txt and sitemap.xml. App facts (version, icon, APK, stroke data) are read from the BergHanziTrainer checkout,
// by default a sibling folder of this repository. The APK itself is not copied: it is attached to the GitHub Release
// v<version>, and the page links there. Counter and feedback settings come from site.config.json. Usage:
//   node build.mjs                                   -> ../docs, https://bergshrund73.github.io/BergWeb/
//   node build.mjs --out <dir> --base <url>          -> e.g. a localhost build for validation
//   node build.mjs --app <path to BergHanziTrainer>
//   node build.mjs --with-apk                        -> link the release APK; without it the download is a stub
//   node build.mjs --with-apk --apk <file>           -> size and SHA-256 from this file instead of the app's release build
//   node build.mjs --config <file>                   -> another site.config.json (e.g. test keys for a local build)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const HERE = import.meta.dirname;
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const REPO = path.resolve(HERE, args.app ?? '../../BergHanziTrainer');
const OUT = path.resolve(HERE, args.out ?? '../docs');
const BASE = args.base ?? 'https://bergshrund73.github.io/BergWeb/';

// ---------- encoding helpers (all values are encoded for their output context) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function safeUrl(u) {
  const parsed = new URL(u);
  const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localHttp) throw new Error(`Rejected URL scheme: ${u}`);
  return parsed.href;
}
const abs = (rel) => safeUrl(new URL(rel, safeUrl(BASE)).href);
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

// ---------- facts, read from the project itself ----------
const gradle = fs.readFileSync(path.join(REPO, 'app/build.gradle.kts'), 'utf8');
const VERSION = gradle.match(/versionName = "([^"]+)"/)[1];
const MIN_SDK = Number(gradle.match(/minSdk = (\d+)/)[1]);
const ANDROID_BY_SDK = { 29: '10', 30: '11', 31: '12', 33: '13', 34: '14', 35: '15' };
const ANDROID_MIN = ANDROID_BY_SDK[MIN_SDK];
const APK_SRC = args.apk ? path.resolve(args.apk) : path.join(REPO, 'app/build/outputs/apk/release/app-release.apk');
const APK_NAME = `berghanzitrainer-${VERSION}.apk`;
const WITH_APK = process.argv.includes('--with-apk');
const SITE = JSON.parse(fs.readFileSync(path.resolve(HERE, args.config ?? 'site.config.json'), 'utf8'));
if (!/^[\w.-]+\/[\w.-]+$/.test(SITE.githubRepo)) throw new Error(`Bad githubRepo: ${SITE.githubRepo}`);
if (SITE.goatcounter && !/^[a-z0-9-]+$/.test(SITE.goatcounter)) throw new Error(`Bad goatcounter code: ${SITE.goatcounter}`);
if (SITE.web3formsKey && !/^[0-9a-f-]{36}$/i.test(SITE.web3formsKey)) throw new Error('Bad web3formsKey');
const GC_ORIGIN = SITE.goatcounter ? `https://${SITE.goatcounter}.goatcounter.com` : '';
const FORM_ENDPOINT = 'https://api.web3forms.com/submit';
const apkBytes = WITH_APK ? fs.readFileSync(APK_SRC) : null;
const APK_SHA256 = apkBytes && crypto.createHash('sha256').update(apkBytes).digest('hex');
const APK_MB = apkBytes && Math.round(apkBytes.length / 1024 / 1024);
const STROKE_CHARS = fs.readFileSync(path.join(REPO, 'app/src/main/assets/makemeahanzi/graphics.txt'), 'utf8')
  .split('\n').filter((l) => l.trim()).length;
const fmtInt = (n) => n.toLocaleString('ru-RU').replace(/\s/g, ' ');

// ---------- output dirs ----------
fs.rmSync(path.join(OUT, 'images'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'download'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'assets'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'images'), { recursive: true });

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
function emit(buf, base, ext) {
  const name = `images/${base}.${hash8(buf)}.${ext}`;
  fs.writeFileSync(path.join(OUT, name), buf);
  return name;
}

// ---------- logo: the launcher vector drawable, rendered in memory (no SVG is shipped) ----------
const drawable = fs.readFileSync(path.join(REPO, 'app/src/main/res/drawable/ic_launcher_foreground.xml'), 'utf8');
const glyphPaths = [...drawable.matchAll(/android:fillColor="(#[0-9A-Fa-f]{6})"\s+android:pathData="([^"]+)"/g)]
  .map((m) => `<path fill="${m[1]}" d="${m[2]}"/>`).join('');
const PAPER = '#F4EFE6';
const logoSvg = (bg) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72">${bg ? `<rect x="0" y="0" width="108" height="108" fill="${bg}"/>` : ''}${glyphPaths}</svg>`,
);
const renderLogo = (size, bg = PAPER) => sharp(logoSvg(bg), { density: 1200 }).resize(size, size).png().toBuffer();

const favicon = await renderLogo(96);
fs.writeFileSync(path.join(OUT, 'favicon.png'), favicon);
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), await renderLogo(180));

const LOGO_W = [48, 96, 144];
const logo = { avif: [], webp: [], png: [] };
for (const w of LOGO_W) {
  const png = await renderLogo(w);
  logo.png.push([emit(png, `logo-${w}`, 'png'), w]);
  logo.webp.push([emit(await sharp(png).webp({ quality: 90 }).toBuffer(), `logo-${w}`, 'webp'), w]);
  logo.avif.push([emit(await sharp(png).avif({ quality: 70 }).toBuffer(), `logo-${w}`, 'avif'), w]);
}

// ---------- screenshots: emulator captures (720x1280) without status and navigation bars ----------
const SHOT = { w: 720, h: 1180 };
const SHOT_W = [320, 480, 640, 720]; // never upscaled past the 720px source
async function shot(file) {
  const src = await sharp(path.join(HERE, 'src', file)).extract({ left: 0, top: 52, width: SHOT.w, height: SHOT.h }).toBuffer();
  const set = { avif: [], webp: [], jpg: [] };
  const base = path.basename(file, '.png');
  for (const w of SHOT_W) {
    const r = sharp(src).resize(w);
    set.avif.push([emit(await r.clone().avif({ quality: 55 }).toBuffer(), `${base}-${w}`, 'avif'), w]);
    set.webp.push([emit(await r.clone().webp({ quality: 80 }).toBuffer(), `${base}-${w}`, 'webp'), w]);
    set.jpg.push([emit(await r.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer(), `${base}-${w}`, 'jpg'), w]);
  }
  return set;
}
const shots = {
  copybook: await shot('shot-copybook.png'),
  trace: await shot('shot-trace.png'),
  lists: await shot('shot-lists.png'),
};

// ---------- Open Graph image 1200x630 ----------
const ogText = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <text x="520" y="230" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="64" fill="#22201C">BergHanziTrainer</text>
  <text x="520" y="310" font-family="Segoe UI, Arial, sans-serif" font-size="42" fill="#22201C">Тренажёр написания</text>
  <text x="520" y="364" font-family="Segoe UI, Arial, sans-serif" font-size="42" fill="#22201C">китайских иероглифов</text>
  <text x="520" y="450" font-family="Microsoft YaHei, Segoe UI, sans-serif" font-size="34" fill="#B3362B">写汉字 · Android · бесплатно</text>
</svg>`);
const og = await sharp({ create: { width: 1200, height: 630, channels: 3, background: PAPER } })
  .composite([{ input: await renderLogo(400), left: 80, top: 115 }, { input: ogText, left: 0, top: 0 }])
  .jpeg({ quality: 85, mozjpeg: true }).toBuffer();
const OG_IMG = emit(og, 'og-cover', 'jpg');

// ---------- donation links and their QR codes (PNGs from the services, kept lossless) ----------
const QR_PX = 300; // shown at 150 CSS px
const DONATE = [ // hidden: true keeps an entry out of the page
  { name: 'CloudTips', url: 'https://pay.cloudtips.ru/p/9881136c', qr: 'qr-cloudtips.png', text: 'Разовый донат картой любого банка или через СБП — сумму выбираете сами.' },
  { name: 'Boosty', url: 'https://boosty.to/bergshrund73/donate', qr: 'qr-boosty.png', text: 'Разовый донат на Boosty — тоже на любую сумму.' },
].filter((d) => !d.hidden);
for (const d of DONATE) {
  const src = sharp(path.join(HERE, 'src', d.qr));
  const { width } = await src.metadata();
  const png = await src.flatten({ background: '#ffffff' })
    .resize(QR_PX, QR_PX, { kernel: width < QR_PX ? 'nearest' : 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
  d.img = emit(png, path.basename(d.qr, '.png'), 'png');
}

// ---------- "try it" demo: first words of the first starter list + their stroke data ----------
const DEMO_WORDS = 5;
const starter = JSON.parse(fs.readFileSync(path.join(REPO, 'app/src/main/assets/starter_lists/1_pronouns.json'), 'utf8'));
const DEMO_LIST = starter.lists[0].name;
const demoWords = starter.words.slice(0, DEMO_WORDS).map((w) => ({ hz: w.hanzi, py: w.pinyin, ru: w.translationRu }));
const demoChars = new Set(demoWords.flatMap((w) => Array.from(w.hz)));
const demoStrokes = {};
for (const line of fs.readFileSync(path.join(REPO, 'app/src/main/assets/makemeahanzi/graphics.txt'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const g = JSON.parse(line);
  if (!demoChars.has(g.character)) continue;
  demoStrokes[g.character] = {
    s: g.strokes.map((d) => d.replace(/(\d+)\.\d+/g, '$1')),
    m: g.medians.map((m) => m.map(([x, y]) => [+(x / 1024).toFixed(3), +((900 - y) / 1024).toFixed(3)])),
  };
}
for (const c of demoChars) if (!demoStrokes[c]) throw new Error(`No stroke data for demo character ${c}`);
function emitAsset(buf, base, ext) {
  const name = `assets/${base}.${hash8(buf)}.${ext}`;
  fs.writeFileSync(path.join(OUT, name), buf);
  return name;
}
const DEMO_DATA = emitAsset(Buffer.from(JSON.stringify({ words: demoWords, chars: demoStrokes })), 'demo-hanzi', 'json');
// Light minification: drop comment lines and indentation.
const demoJs = fs.readFileSync(path.join(HERE, 'demo.js'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');
if (Buffer.byteLength(demoJs) > 15 * 1024) throw new Error(`demo.js is ${Buffer.byteLength(demoJs)} bytes, over the 15 KB budget`);
const DEMO_JS = emitAsset(Buffer.from(demoJs), 'demo', 'js');
const siteJs = fs.readFileSync(path.join(HERE, 'site.js'), 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');
if (Buffer.byteLength(siteJs) > 8 * 1024) throw new Error(`site.js is ${Buffer.byteLength(siteJs)} bytes, over the 8 KB budget`);
const SITE_JS = emitAsset(Buffer.from(siteJs), 'site', 'js');

// ---------- markup helpers ----------
const srcset = (list) => list.map(([f, w]) => `${abs(f)} ${w}w`).join(', ');
function picture(set, { alt, sizes, w, h, lcp = false, eager = false, cls = '' }) {
  const fallback = set.jpg ?? set.png;
  const loading = lcp ? 'fetchpriority="high"' : eager ? '' : 'loading="lazy"';
  return `<picture>`
    + `<source type="image/avif" srcset="${esc(srcset(set.avif))}" sizes="${esc(sizes)}">`
    + `<source type="image/webp" srcset="${esc(srcset(set.webp))}" sizes="${esc(sizes)}">`
    + `<img${cls ? ` class="${cls}"` : ''} src="${esc(abs(fallback.at(-1)[0]))}" srcset="${esc(srcset(fallback))}" sizes="${esc(sizes)}"`
    + ` alt="${esc(alt)}" width="${w}" height="${h}"${loading ? ` ${loading}` : ''} decoding="async">`
    + `</picture>`;
}

const CANONICAL = abs('./');
const APK_URL = safeUrl(`https://github.com/${SITE.githubRepo}/releases/download/v${VERSION}/${APK_NAME}`);
const GITHUB_PROFILE = 'https://github.com/Bergshrund73';
const TITLE = 'Тренажёр написания китайских иероглифов — BergHanziTrainer';
const DESCRIPTION = 'Учитесь писать китайские иероглифы на Android: порядок черт, обводка, письмо по памяти, пиньинь и свои списки слов. Бесплатно, работает без интернета.';
const GUIDE_URL = abs('guide.html');
const GUIDE_TITLE = 'Как пользоваться BergHanziTrainer — инструкция';
const GUIDE_DESCRIPTION = 'Инструкция к BergHanziTrainer: списки и слова, пропись, письмо, пиньинь и тест, импорт из Pleco и Anki, экспорт и резервная копия.';

const FAQ = [
  ['Сколько стоит приложение?', 'Нисколько. BergHanziTrainer бесплатный, без рекламы и без подписок. Если приложение помогает, проект можно поддержать донатом.'],
  ['Нужен ли интернет?', 'Нет. Приложение не запрашивает доступ к сети: слова, списки и прогресс хранятся только на вашем телефоне.'],
  ['На каких телефонах работает?', `На Android ${ANDROID_MIN} и новее. Версий для iPhone пока нет.`],
  ['Почему APK, а не Google Play?', `Это частная разработка, поэтому приложение ${WITH_APK ? 'распространяется' : 'будет распространяться'} файлом APK прямо с этой страницы. Android попросит один раз разрешить установку из браузера или файлового менеджера.`],
  ['Можно перенести слова из Pleco или Anki?', 'Да. Импорт понимает файлы .txt, .csv и .tsv из Pleco, Anki и Excel, а также вставку текста. Списки можно выгрузить обратно для Pleco или сохранить резервной копией в JSON.'],
  ['Откуда данные о порядке черт?', `Из открытого проекта Make Me a Hanzi: в приложении ${fmtInt(STROKE_CHARS)} иероглифов с порядком черт.`],
  ['Как добавить своё слово?', 'Введите его в поиск списка и нажмите «Добавить новое слово».'],
  ['Можно ли учить одно слово в нескольких списках?', 'Да, отметьте нужные списки в карточке слова.'],
  ['Что будет со словами, если удалить список?', 'Ничего: они останутся в «Все слова».'],
  ['Как перенести всё на новый телефон?', 'Сохраните резервную копию, перенесите файл и загрузите его через импорт.'],
  ['Почему черта не засчитывается?', 'Проверьте порядок и направление: черты пишутся сверху вниз и слева направо. Не уверены — включите «Пропись», она покажет порядок.'],
];

// ---------- guide page: src/guide.md, a small Markdown subset (## {#id}, ###, paragraphs, - and 1. lists, **bold**, `code`) ----------
const mdInline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/[⺀-⿟㐀-鿿]+/g, (m) => `<span class="zh" lang="zh-Hans">${m}</span>`);
const GUIDE_TOC = [];
const GUIDE_HTML = fs.readFileSync(path.join(HERE, 'src/guide.md'), 'utf8').replace(/\r/g, '').trim().split(/\n{2,}/).map((block) => {
  const h = block.match(/^(#{2,3}) (.+?)(?: \{#([\w-]+)\})?$/);
  if (h) {
    if (h[1] === '##') {
      if (!h[3]) throw new Error(`guide.md: no {#id} on «${h[2]}»`);
      GUIDE_TOC.push([h[3], h[2]]);
      return `<h2 id="${h[3]}">${mdInline(h[2])}</h2>`;
    }
    return `<h3>${mdInline(h[2])}</h3>`;
  }
  const list = block.match(/^(- |\d+\. )/);
  if (list) {
    const items = block.split(/\n(?=- |\d+\. )/).map((it) => `<li>${mdInline(it.replace(/^(- |\d+\. )/, '').replace(/\n\s*/g, ' '))}</li>`);
    const tag = list[1] === '- ' ? 'ul' : 'ol';
    return `<${tag}>${items.join('')}</${tag}>`;
  }
  return `<p>${mdInline(block.replace(/\n\s*/g, ' '))}</p>`;
}).join('\n');

// ---------- CSS (inlined; authorised by a CSP hash) ----------
const CSS = `
:root{--paper:#F4EFE6;--paper-hi:#FFFDF8;--shade:#EAE3D6;--line:#E2D9C9;--ink:#22201C;--muted:#6A6358;--red:#B3362B;--on-red:#FFFDF8;--red-soft:#F3DCD5;--jade:#2F6B4F;--jade-soft:#D5E8DB;--ice:#3F6274;--shadow:0 18px 40px rgba(34,32,28,.16);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--paper:#141619;--paper-hi:#1D2024;--shade:#272B30;--line:#2E3338;--ink:#ECE7DE;--muted:#A39D93;--red:#E27A63;--on-red:#141619;--red-soft:#5A2A20;--jade:#7FC8A2;--jade-soft:#1F4A35;--ice:#8FB3C6;--shadow:0 18px 40px rgba(0,0,0,.45)}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:80px}
body{margin:0;background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Roboto","Oxygen","Ubuntu","Cantarell","Helvetica Neue",Arial,sans-serif;font-size:1.0625rem;line-height:1.6}
img{max-width:100%;height:auto;display:block}
a{color:var(--red)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--ice);outline-offset:3px;border-radius:4px}
.container{width:100%;max-width:1200px;margin:0 auto;padding-inline:max(16px,env(safe-area-inset-left)) max(16px,env(safe-area-inset-right))}
.zh{font-family:"KaiTi","STKaiti","Kaiti SC","Noto Serif CJK SC","Songti SC","SimSun",serif;font-weight:400}
.site-header{position:sticky;top:0;z-index:10;background:var(--paper);border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-weight:700;font-size:1.0625rem}
.brand img{width:40px;height:40px;border-radius:10px;border:1px solid var(--line)}
.nav{display:flex;gap:4px;align-items:center}
.nav a{color:var(--ink);text-decoration:none;padding:8px 12px;border-radius:999px;font-size:.9375rem}
.nav a:hover{background:var(--shade)}
.nav .nav-cta{background:var(--red);color:var(--on-red);font-weight:600}
.nav .nav-cta:hover{background:var(--red)}
.nav-extra{display:none}
@media (min-width:760px){.nav-extra{display:inline-block}}
@media (max-width:1019px){.nav .nav-wide{display:none}}
.nav a[aria-current]{background:var(--shade)}
.hero{padding:40px 0 56px}
.hero-grid{display:grid;gap:40px;align-items:center}
@media (min-width:900px){.hero-grid{grid-template-columns:1.25fr .75fr}.hero{padding:72px 0 88px}}
.kicker{margin:0 0 12px;color:var(--muted);font-size:1rem}
.kicker .zh{color:var(--red);font-size:1.75rem;margin-inline-end:8px;vertical-align:-3px}
h1{margin:0 0 20px;font-size:clamp(2rem,1.3rem + 3vw,3.25rem);line-height:1.12;letter-spacing:-.01em}
.lead{margin:0 0 28px;font-size:1.1875rem;color:var(--ink);max-width:36em}
.cta{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.btn{display:inline-flex;flex-direction:column;justify-content:center;min-height:56px;padding:10px 24px;border-radius:16px;text-decoration:none;font-weight:700;font-size:1.0625rem;line-height:1.25;border:2px solid transparent}
.btn small{font-weight:400;font-size:.8125rem;opacity:.92}
.btn-dl{flex-direction:row;align-items:center;gap:14px;padding-inline:20px 26px}
.btn-dl svg{flex:none;width:28px;height:28px}
.btn-dl span{display:flex;flex-direction:column}
.btn-big{min-height:64px;font-size:1.1875rem}
.btn-primary{background:var(--red);color:var(--on-red)}
.btn-primary:hover{filter:brightness(1.07)}
.btn-ghost{color:var(--ink);border-color:var(--ink)}
.btn-ghost:hover{background:var(--shade)}
.btn:focus-visible{outline:3px solid var(--ice);outline-offset:3px}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:28px 0 0;padding:0;list-style:none}
.facts li{background:var(--paper-hi);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:.9375rem}
.phone{width:min(300px,72vw);margin-inline:auto;border:10px solid var(--ink);border-radius:36px;overflow:hidden;background:var(--paper);box-shadow:var(--shadow)}
.phone img{aspect-ratio:720/1180;width:100%;background:var(--paper-hi)}
@media (prefers-color-scheme:dark){.phone{border-color:#2E3338}}
`;
const CSS_BELOW = `
section{padding:64px 0;border-top:1px solid var(--line)}
.alt{background:var(--paper-hi)}
h2{margin:0 0 12px;font-size:clamp(1.625rem,1.2rem + 1.6vw,2.25rem);line-height:1.2}
h2 .zh{color:var(--red);margin-inline-end:12px}
h3{margin:0 0 8px;font-size:1.1875rem}
.sub{margin:0 0 32px;color:var(--muted);max-width:44em}
.steps{counter-reset:s;list-style:none;margin:0;padding:0;display:grid;gap:16px}
@media (min-width:760px){.steps{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1100px){.steps.five{grid-template-columns:repeat(5,1fr)}}
.steps li{counter-increment:s;background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:20px}
.alt .steps li{background:var(--paper)}
.steps li::before{content:counter(s);display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--red-soft);color:var(--ink);font-weight:700;margin-bottom:10px}
.steps p{margin:0;color:var(--muted)}
.term{display:block;color:var(--red);font-size:.9375rem;margin-bottom:4px}
.term .zh{font-size:1.25rem;margin-inline-end:6px}
.cards{display:grid;gap:16px}
@media (min-width:760px){.cards{grid-template-columns:repeat(2,1fr)}}
.card{background:var(--paper-hi);border:1px solid var(--line);border-radius:20px;padding:24px}
.card p{margin:0;color:var(--muted)}
.card .glyph{float:inline-end;width:56px;height:56px;display:grid;place-items:center;border-radius:14px;background:var(--red-soft);font-size:2rem;margin-inline-start:12px}
.checks{list-style:none;margin:0;padding:0;display:grid;gap:12px}
@media (min-width:760px){.checks{grid-template-columns:repeat(2,1fr)}}
.checks li{position:relative;padding-inline-start:30px}
.checks li::before{content:"";position:absolute;inset-inline-start:4px;top:.45em;width:12px;height:7px;border-inline-start:3px solid var(--jade);border-bottom:3px solid var(--jade);transform:rotate(-45deg)}
.dl{display:grid;gap:32px;align-items:start}
@media (min-width:900px){.dl{grid-template-columns:1fr 1fr}}
.meta{margin:24px 0 0;display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:.9375rem}
.meta dt{color:var(--muted)}
.meta dd{margin:0}
.meta code{font-size:.8125rem;word-break:break-all}
.note{background:var(--jade-soft);border-radius:16px;padding:16px 20px;margin:0}
.hint{margin:12px 0 0;color:var(--muted);font-size:.9375rem}
.new{margin:28px 0 0}
.new h3{font-size:1.0625rem}
.new .checks{grid-template-columns:1fr}
.modes-h{margin:32px 0 16px;font-size:1.0625rem;color:var(--muted)}
.opts{display:grid;gap:16px}
@media (min-width:760px){.opts{grid-template-columns:repeat(2,1fr)}}
.opt{border:1px dashed var(--muted);border-radius:20px;padding:20px 24px}
.opt h3{display:flex;align-items:center;gap:10px}
.opt p{margin:0;color:var(--muted)}
.sw{flex:none;width:36px;height:22px;border-radius:999px;background:var(--red);position:relative}
.sw::after{content:"";position:absolute;top:4px;inset-inline-end:4px;width:14px;height:14px;border-radius:50%;background:var(--on-red)}
.donate{display:grid;gap:32px}
@media (min-width:900px){.donate{grid-template-columns:1fr 1fr}}
.pay{display:grid;gap:16px}
.pay-card{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid var(--line);border-radius:20px;padding:20px 24px;background:var(--paper)}
.pay-card h3{margin-top:0}
.pay-card p{margin:0 0 16px;color:var(--muted)}
.qr{flex:none;width:150px;height:150px;border-radius:8px;background:#fff}
@media (max-width:599px){.qr{display:none}}
fieldset{border:1px solid var(--line);border-radius:20px;padding:20px;margin:0;background:var(--paper)}
legend{font-weight:700;padding:0 8px}
.amounts{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 16px;padding:0;border:0;background:none}
.amounts legend{padding:0;margin-bottom:8px;font-weight:600;width:100%}
.amounts label{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:6px 14px}
.stub{margin:0 0 16px;padding:12px 16px;border-radius:12px;background:var(--red-soft);font-weight:600}
.stats{margin:20px 0 0}
.stats h3{font-size:1.0625rem}
.stats ul{margin:0;padding-inline-start:20px;color:var(--muted)}
.fb label{display:block;font-weight:600;margin:16px 0 6px}
.fb label small{font-weight:400;color:var(--muted)}
.fb .amounts{margin-top:0}
.fb .amounts label{margin:0;font-weight:400}
.fb textarea,.fb input[type=text],.fb input[type=email]{display:block;width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--paper-hi);color:var(--ink);font:inherit}
.fb textarea{resize:vertical;min-height:140px}
.fb textarea:focus-visible,.fb input:focus-visible{outline:3px solid var(--ice);outline-offset:1px}
.fb .consent{display:flex;gap:10px;align-items:flex-start;font-weight:400}
.fb .consent input{margin-top:.35em}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.btn-submit{margin-top:20px;min-height:52px;padding:10px 28px;border-radius:16px;border:0;background:var(--red);color:var(--on-red);font:inherit;font-weight:700;cursor:pointer}
.btn-submit:focus-visible{outline:3px solid var(--ice);outline-offset:3px}
.btn-submit:disabled{opacity:.6;cursor:progress}
.fb-status{margin:12px 0 0;font-weight:600}
.fb-status:empty{display:none}
.fb-status.ok{color:var(--jade)}
.fb-status.bad{color:var(--red)}
button[disabled]{min-height:48px;padding:10px 24px;border-radius:14px;border:0;background:var(--shade);color:var(--muted);font:inherit;font-weight:700;cursor:not-allowed}
details{border:1px solid var(--line);border-radius:16px;background:var(--paper-hi);margin-bottom:12px}
summary{cursor:pointer;padding:16px 20px;font-weight:700}
details p{margin:0;padding:0 20px 18px;color:var(--muted)}
.site-footer{padding:40px 0 max(40px,env(safe-area-inset-bottom));border-top:1px solid var(--line);color:var(--muted);font-size:.9375rem}
.site-footer p{margin:0 0 8px}
[hidden]{display:none!important}
.demo{display:grid;gap:20px}
.demo h3{margin:0 0 16px}
.demo button{font:inherit;cursor:pointer}
.demo button:focus-visible,.demo a:focus-visible{outline:3px solid var(--ice);outline-offset:3px}
.demo-steps{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.demo-steps li{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;border:1px solid var(--line);border-radius:999px;font-size:.9375rem;color:var(--muted)}
.demo-steps li span{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:var(--shade);font-weight:700}
.demo-steps li.on{color:var(--ink)}
.demo-steps li.on span{background:var(--red);color:var(--on-red)}
.demo-steps li[aria-current]{background:var(--paper-hi);font-weight:700}
.demo-card{background:var(--paper);border:1px solid var(--line);border-radius:24px;padding:clamp(20px,3vw,40px);min-height:420px}
.demo-lists{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.demo-list{display:flex;align-items:center;gap:14px;padding:14px;min-height:84px;border-radius:18px;border:1px solid var(--red);background:var(--paper-hi);color:var(--ink);text-align:start;box-shadow:0 6px 18px rgba(179,54,43,.12)}
.demo-list .zh{flex:none;width:56px;height:56px;display:grid;place-items:center;border-radius:14px;background:var(--red-soft);font-size:1.875rem}
.demo-list b{display:block;font-size:1.0625rem}
.demo-list small{display:block;color:var(--muted);font-size:.9375rem}
.demo-list[disabled]{min-height:84px;padding:14px;border-radius:18px;border:1px solid var(--line);background:var(--paper);box-shadow:none;color:var(--muted);font-weight:400}
.demo-list[disabled] .zh{background:var(--shade)}
.demo-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.demo-head h3{margin:0}
.demo-back{min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink)}
.demo-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.demo-mode{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px 12px;text-align:start;padding:24px;border-radius:20px;border:1px solid var(--line);background:var(--paper);color:var(--ink)}
.demo-mode:hover,.demo-list:not([disabled]):hover{border-color:var(--red)}
.demo-mode .zh{width:52px;height:52px;display:grid;place-items:center;border-radius:14px;background:var(--red-soft);font-size:1.75rem}
.demo-mode b{font-size:1.1875rem}
.demo-mode small{grid-column:1/-1;color:var(--muted);font-size:1rem;line-height:1.55}
.demo-write{display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start}
.demo-info{flex:1 1 280px;min-width:0;display:flex;flex-direction:column;gap:16px;align-items:flex-start}
.demo-info .demo-head{margin:0}
.demo-muted{color:var(--muted)}
.demo-word{margin:0;display:flex;flex-direction:column}
.demo-word span:first-child{font-size:2.5rem;font-weight:800;line-height:1.1}
.demo-word .demo-muted{font-size:1.25rem}
.demo-chars{display:flex;gap:8px;flex-wrap:wrap}
.demo-char{width:48px;height:48px;display:grid;place-items:center;border-radius:12px;border:2px solid var(--line);background:var(--paper-hi);color:var(--muted);font-size:1.75rem;font-family:"KaiTi","STKaiti","Kaiti SC","Noto Serif CJK SC","Songti SC","SimSun",serif}
.demo-char.shown{background:var(--jade-soft);color:var(--ink)}
.demo-char.current{border-color:var(--red)}
.demo-status{margin:0;align-self:stretch;padding:12px 16px;border-radius:14px;background:var(--shade);font-weight:600}
.demo-status.ok{background:var(--jade-soft)}
.demo-status.bad{background:var(--red-soft)}
.demo-meter{align-self:stretch;display:grid;gap:6px;font-size:.9375rem}
.demo-meter>div:first-child{display:flex;justify-content:space-between}
.demo-bar{height:6px;border-radius:999px;background:var(--shade);overflow:hidden}
.demo-bar div{height:100%;width:0;background:var(--jade);border-radius:999px}
@media (prefers-reduced-motion:no-preference){.demo-bar div{transition:width .25s}}
.demo-actions{display:flex;gap:12px;flex-wrap:wrap}
.demo-primary{display:inline-flex;align-items:center;min-height:52px;padding:10px 24px;border-radius:16px;border:0;background:var(--red);color:var(--on-red);font-weight:700;text-decoration:none}
.demo-secondary{min-height:48px;padding:10px 20px;border-radius:14px;border:2px solid var(--ink);background:transparent;color:var(--ink);font-weight:700}
.demo-pad{flex:0 1 380px;min-width:260px;width:100%;margin-inline:auto;display:grid;gap:12px}
.demo-cell{position:relative;aspect-ratio:1;border-radius:20px;background:#FFFDF8;border:1px solid var(--line);overflow:hidden;box-shadow:var(--shadow)}
.demo-cell::before,.demo-cell::after{content:"";position:absolute;pointer-events:none}
.demo-cell::before{left:50%;top:0;bottom:0;border-left:1px dashed #E8C4BC}
.demo-cell::after{top:50%;left:0;right:0;border-top:1px dashed #E8C4BC}
.demo-cell canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
.demo-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.demo-tools button{min-height:48px;border-radius:14px;border:0;background:var(--shade);color:var(--ink);font-weight:600}
.demo-tools [aria-pressed="true"]{background:var(--red-soft);box-shadow:inset 0 0 0 2px var(--red)}
.demo-big{margin:0;font-size:4rem;line-height:1;color:var(--jade)}
.demo-note{color:var(--red)}
.more{margin:24px 0 0;color:var(--muted)}
.guide{max-width:820px;padding-block:32px 64px}
.crumbs{margin:0 0 20px;color:var(--muted);font-size:.9375rem}
.guide .lead{margin-bottom:28px}
.toc{background:var(--paper-hi);border:1px solid var(--line);border-radius:20px;padding:20px 24px;margin:0 0 16px}
.toc h2{font-size:1.0625rem;margin:0 0 8px}
.toc ol{margin:0;padding-inline-start:22px;display:grid;gap:4px}
.guide article h2{margin:48px 0 16px;scroll-margin-top:80px}
.guide article h3{margin:28px 0 8px}
.guide article p{margin:0 0 14px}
.guide article ul,.guide article ol{margin:0 0 14px;padding-inline-start:24px;display:grid;gap:6px}
.guide code{background:var(--shade);border-radius:6px;padding:1px 6px;font-size:.9375em}
.guide-end{margin:48px 0 0;padding:24px;border-radius:20px;background:var(--jade-soft)}
.guide-end p{margin:0 0 16px}
`;
const minCss = (s) => s.replace(/\n/g, '').replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}').trim();
const STYLE = minCss(CSS + CSS_BELOW);
const STYLE_HASH = crypto.createHash('sha256').update(STYLE, 'utf8').digest('base64');

const HERO_SIZES = '(min-width: 417px) 300px, 72vw';

const ld = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${CANONICAL}#webpage`,
    url: CANONICAL,
    name: TITLE,
    description: DESCRIPTION,
    inLanguage: 'ru',
    primaryImageOfPage: { '@type': 'ImageObject', url: abs(OG_IMG), width: 1200, height: 630 },
    about: { '@id': `${CANONICAL}#app` },
    author: { '@id': `${CANONICAL}#author` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    '@id': `${CANONICAL}#app`,
    name: 'BergHanziTrainer',
    description: DESCRIPTION,
    url: CANONICAL,
    image: abs('favicon.png'),
    screenshot: [abs(shots.copybook.jpg.at(-1)[0]), abs(shots.trace.jpg.at(-1)[0]), abs(shots.lists.jpg.at(-1)[0])],
    operatingSystem: `Android ${ANDROID_MIN}+`,
    applicationCategory: 'EducationalApplication',
    softwareVersion: VERSION,
    ...(WITH_APK ? { fileSize: `${APK_MB} MB`, downloadUrl: APK_URL, installUrl: APK_URL } : {}),
    inLanguage: 'ru',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' },
    author: { '@id': `${CANONICAL}#author` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${CANONICAL}#author`,
    name: 'Bergshrund73',
    url: GITHUB_PROFILE,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${CANONICAL}#faq`,
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  },
];

const CSP = [
  "default-src 'none'",
  ["img-src 'self'", GC_ORIGIN].filter(Boolean).join(' '),
  ["connect-src 'self'", WITH_APK && 'https://api.github.com', GC_ORIGIN, SITE.web3formsKey && new URL(FORM_ENDPOINT).origin].filter(Boolean).join(' '),
  "script-src 'self'",
  `style-src 'sha256-${STYLE_HASH}'`,
  "base-uri 'self'",
  SITE.web3formsKey ? `form-action ${FORM_ENDPOINT} https://web3forms.com` : "form-action 'none'",
  "object-src 'none'",
].join('; ');

const DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M11 3h2v9.17l3.59-3.58L18 10l-6 6-6-6 1.41-1.41L11 12.17V3zM5 18h14v2H5z"/></svg>';
const dlButton = (detail, cls = '') => `<a class="btn btn-primary btn-dl${cls}" href="${esc(APK_URL)}" type="application/vnd.android.package-archive">${DL_ICON}<span>Скачать APK<small>${detail}</small></span></a>`;
// What changed in the published version, shown under the download button.
const WHATS_NEW = [
  'Тренировка по поиску: найдите в списке слова с 水 — «Письмо», «Тест» и «Пропись» пойдут только по ним',
  'В «Ключах» у каждого ключа кнопка «Слова с этим ключом»: открывает «Все слова» с этим ключом, и тренироваться можно только по ним',
  'В карточке слова раздел «Ключи»: ключ каждого иероглифа из словаря, плюс свои ключи через «Добавить ключ»',
  'Проверка черт строже: не засчитывает пропущенный или лишний крючок, недописанную черту, зигзаг и лишние штрихи',
  'Подсказка рисуется по тем же чертам, по которым идёт проверка',
  '15 форм ключей, которых не хватало (⻌, ⺧, ⺩, 牜, 龵 и другие), теперь пишутся с проверкой; 阝 стоит справа в значении «город» и слева в значении «холм»',
  '«О приложении» в конце экрана «Списки»: версия, источники данных и тексты лицензий',
];
const zh = (hanzi) => `<span class="zh" lang="zh-Hans">${esc(hanzi)}</span>`;
const zhDeco = (hanzi) => `<span class="zh" lang="zh-Hans" aria-hidden="true">${esc(hanzi)}</span>`;

// <head> and the site header, shared by the landing page and the guide. `home` is '' on the landing page and its URL
// elsewhere, so the section links lead back to it.
const pageHead = ({ title, description, url, ogType = 'website' }) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F4EFE6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141619" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" sizes="96x96" href="${esc(abs('favicon.png'))}">
<link rel="apple-touch-icon" href="${esc(abs('apple-touch-icon.png'))}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="BergHanziTrainer">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(abs(OG_IMG))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Логотип BergHanziTrainer: иероглифы 山 и 冰, разделённые красной трещиной">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(abs(OG_IMG))}">
<style>${STYLE}</style>
</head>
<body>`;
const siteHeader = (home) => `<header class="site-header">
<div class="container bar">
<a class="brand" href="${esc(CANONICAL)}">${picture(logo, { alt: '', sizes: '40px', w: 48, h: 48, eager: true })}<span>BergHanziTrainer</span></a>
<nav class="nav" aria-label="Разделы сайта">
<a class="nav-extra" href="${esc(home)}#how">Как учиться</a>
<a class="nav-extra nav-wide" href="${esc(home)}#modes">Режимы</a>
<a class="nav-extra" href="${esc(GUIDE_URL)}"${home ? ' aria-current="page"' : ''}>Инструкция</a>
<a class="nav-extra" href="${esc(home)}#donate">Поддержать</a>
<a class="nav-extra nav-wide" href="${esc(home)}#feedback">Отзывы</a>
<a class="nav-cta" href="${esc(home)}#download">Скачать</a>
</nav>
</div>
</header>`;
const siteFooter = (url) => `<footer class="site-footer">
<div class="container">
<p>© 2026 BergHanziTrainer · частная разработка <a href="${esc(GITHUB_PROFILE)}">Bergshrund73</a></p>
<p>Данные о порядке черт — <a href="https://github.com/skishore/makemeahanzi">Make Me a Hanzi</a> (Arphic Public License, LGPL). Недостающие формы ключей — <a href="https://github.com/parsimonhi/animCJK">animCJK</a> и шрифты Arphic (Arphic Public License). Иероглифы логотипа — шрифт Ma Shan Zheng (SIL Open Font License 1.1).</p>
${GC_ORIGIN ? `<p data-visits="${esc(`${GC_ORIGIN}/counter/TOTAL.json`)}" hidden>Посещений сайта: <span data-out="visits"></span> · счётчик <a href="https://www.goatcounter.com/">GoatCounter</a> без cookie</p>
<noscript><img src="${esc(`${GC_ORIGIN}/count?p=${encodeURIComponent(new URL(url).pathname)}`)}" alt="" width="1" height="1"></noscript>` : ''}
</div>
</footer>`;
const siteScript = `<script src="${esc(abs(SITE_JS))}" data-canonical="${esc(CANONICAL)}" data-gc="${esc(GC_ORIGIN)}" defer></script>`;

const html = `${pageHead({ title: TITLE, description: DESCRIPTION, url: CANONICAL })}
${siteHeader('')}
<main id="main">
<div class="hero">
<div class="container hero-grid">
<div>
<p class="kicker">${zh('写汉字')}xiě hànzì — «писать иероглифы»</p>
<h1>Тренажёр написания китайских иероглифов для Android</h1>
<p class="lead">BergHanziTrainer показывает порядок черт и учит писать иероглифы пальцем на экране — от обводки с подсказкой до письма по памяти. Бесплатно, без рекламы и без интернета.</p>
<div class="cta">
${WITH_APK
  ? dlButton(`v${esc(VERSION)} · ${APK_MB}&nbsp;МБ · Android ${ANDROID_MIN}+`)
  : `<a class="btn btn-primary" href="#download">Скачать APK<small>скоро · Android ${ANDROID_MIN}+</small></a>`}
<a class="btn btn-ghost" href="#donate">Поддержать проект</a>
</div>
<ul class="facts">
<li>${fmtInt(STROKE_CHARS)} иероглифов с порядком черт</li>
<li>Пропись, письмо и тест</li>
<li>6 стартовых списков слов</li>
</ul>
</div>
<div class="phone">${picture(shots.copybook, { alt: 'Экран прописи: приложение по одной черте показывает порядок написания иероглифа 我', sizes: HERO_SIZES, w: SHOT.w, h: SHOT.h, lcp: true })}</div>
</div>
</div>
<section id="how" class="alt" aria-labelledby="how-title">
<div class="container">
<h2 id="how-title">${zhDeco('笔顺')}Как проходит тренировка</h2>
<p class="sub">В режиме «Пропись» каждый иероглиф проходит путь от показа до письма по памяти. Подсказок становится меньше с каждым раундом.</p>
<ol class="steps five">
<li><span class="term">${zh('笔顺')}bǐshùn</span><h3>Показ порядка черт</h3><p>Иероглиф рисуется по одной черте, рядом — лента со всеми шагами. Тап по клетке пропускает показ.</p></li>
<li><span class="term">${zh('描红')}miáohóng</span><h3>Обводка с подсказкой</h3><p>Вы обводите иероглиф по контуру. Ошиблись — приложение сразу покажет, как провести черту.</p></li>
<li><h3>Обводка</h3><p>Контур тот же, но подсказка появляется только после ошибки.</p></li>
<li><h3>Частичная опора</h3><p>Целого контура больше нет — видна лишь следующая черта.</p></li>
<li><span class="term">${zh('默写')}mòxiě</span><h3>По памяти</h3><p>Пустая клетка с сеткой ${zh('田')} и без ленты порядка черт. Слово из нескольких иероглифов в конце пишется целиком.</p></li>
</ol>
</div>
</section>
<section id="modes" aria-labelledby="modes-title">
<div class="container">
<h2 id="modes-title">${zhDeco('模式')}Режимы тренировки</h2>
<p class="sub">Выберите, как учить слова, и включите нужные переключатели. Настройки открываются кнопкой над словами списка и запоминаются.</p>
<div class="cards">
<article class="card"><span class="glyph zh" lang="zh-Hans" aria-hidden="true">描</span><h3>Пропись</h3><p>Пошаговое обучение новому иероглифу: показ порядка черт → обводка → по памяти → слово целиком.</p></article>
<article class="card"><span class="glyph zh" lang="zh-Hans" aria-hidden="true">字</span><h3>Письмо</h3><p>Видите перевод и пиньинь — пишете иероглифы. Кнопка «Подсказка» покажет контур, если забыли.</p></article>
</div>
<h3 class="modes-h">Переключатели для «Письма» — по отдельности или вместе</h3>
<div class="opts">
<article class="opt"><h3><span class="sw" aria-hidden="true"></span>Пиньинь</h3><p>Чтение скрыто — его нужно ввести после иероглифов. Тон — цифрой после слога или кнопкой: <span lang="zh-Latn-pinyin">nv3 → nǚ</span>.</p></article>
<article class="opt"><h3><span class="sw" aria-hidden="true"></span>Тест</h3><p>Без подсказок, слова вперемешку, ошибки считаются. Проверьте 5, 10 или все слова списка — в конце итог: что написано чисто и где были ошибки.</p></article>
</div>
</div>
</section>
<section id="try" class="alt" aria-labelledby="try-title">
<div class="container">
<h2 id="try-title">${zhDeco('试一试')}Попробуйте прямо в браузере</h2>
<p class="sub">Откройте стартовый список, выберите режим и напишите иероглиф мышкой или пальцем. Каждая черта проверяется сразу — так же, как в приложении.</p>
<div class="demo" data-screen="list" data-hanzi="${esc(abs(DEMO_DATA))}">
<ol class="demo-steps" aria-label="Шаги демо">
<li class="on" aria-current="step"><span>1</span>Список</li>
<li><span>2</span>Режим</li>
<li><span>3</span>Пишите</li>
</ol>
<div class="demo-card">
<div class="demo-screen" data-screen="list">
<h3>Выберите список</h3>
<div class="demo-lists">
<button type="button" class="demo-list" data-action="open"><span class="zh" lang="zh-Hans" aria-hidden="true">${esc(Array.from(demoWords[0].hz)[0])}</span><span><b>${esc(DEMO_LIST)}</b><small>${DEMO_WORDS} слов · открыт в демо</small></span></button>
${[['是', 'Глаголы'], ['大', 'Прилагательные'], ['爸', 'Семья и люди'], ['家', 'Места'], ['茶', 'Еда и напитки']].map(([g, t]) => `<button type="button" class="demo-list" disabled><span class="zh" lang="zh-Hans" aria-hidden="true">${g}</span><span><b>${t}</b><small>в приложении</small></span></button>`).join('\n')}
</div>
<p class="demo-note" data-out="load-error" hidden>Не удалось загрузить демо. Обновите страницу и попробуйте ещё раз.</p>
<noscript><p class="stub">Для демо нужен включённый JavaScript.</p></noscript>
</div>
<div class="demo-screen" data-screen="mode" hidden>
<div class="demo-head"><button type="button" class="demo-back" data-action="lists">← Списки</button><h3>${esc(DEMO_LIST)}: выберите режим</h3></div>
<div class="demo-modes">
<button type="button" class="demo-mode" data-action="mode" data-mode="trace"><span class="zh" lang="zh-Hans" aria-hidden="true">描</span><b>Пропись</b><small>Иероглиф виден бледным контуром — обведите его черта за чертой. Ошиблись — подсветим нужную черту.</small></button>
<button type="button" class="demo-mode" data-action="mode" data-mode="memory"><span class="zh" lang="zh-Hans" aria-hidden="true">默</span><b>Письмо</b><small>Пустая клетка: только перевод и пиньинь — пишете по памяти. После двух ошибок появится подсказка.</small></button>
</div>
</div>
<div class="demo-screen demo-write" data-screen="write" hidden>
<div class="demo-info">
<div class="demo-head"><button type="button" class="demo-back" data-action="modes">← Режим</button><span class="demo-muted" data-out="progress"></span></div>
<p class="demo-word"><span data-out="ru"></span><span class="demo-muted" data-out="py"></span></p>
<div class="demo-chars" data-out="cells"></div>
<p class="demo-status" role="status" data-out="status"></p>
<div class="demo-meter"><div class="demo-muted"><span data-out="stroke"></span><span data-out="errs"></span></div><div class="demo-bar" aria-hidden="true"><div data-out="bar"></div></div></div>
<div class="demo-actions" data-out="char-done" hidden><button type="button" class="demo-primary" data-action="next">Дальше</button><button type="button" class="demo-secondary" data-action="retry">Написать ещё раз</button></div>
<button type="button" class="demo-secondary" data-action="demo">Показать порядок черт</button>
</div>
<div class="demo-pad">
<div class="demo-cell"><canvas width="760" height="760" aria-label="Клетка для письма"></canvas></div>
<div class="demo-tools"><button type="button" data-action="undo">Отменить</button><button type="button" data-action="retry">Заново</button><button type="button" data-action="hint" aria-pressed="false">Подсказка</button></div>
</div>
</div>
<div class="demo-screen" data-screen="done" hidden>
<p class="demo-big zh" lang="zh-Hans" aria-hidden="true">好</p>
<h3>Список пройден!</h3>
<p class="demo-muted">В приложении — полная пропись с показом порядка черт, переключатели «Пиньинь» и «Тест», свои списки слов и все стартовые списки.</p>
<div class="demo-actions"><a class="demo-primary" href="#download">Скачать приложение</a><button type="button" class="demo-secondary" data-action="restart">Пройти ещё раз</button></div>
</div>
</div>
</div>
</div>
</section>
<section id="lists" aria-labelledby="lists-title">
<div class="container">
<h2 id="lists-title">${zhDeco('词表')}Свои списки слов</h2>
<p class="sub">Учите то, что нужно именно вам: по учебнику, по курсу или из своего словаря.</p>
<ul class="checks">
<li>6 стартовых списков: местоимения, глаголы, прилагательные, семья и люди, места, еда и напитки</li>
<li>Системный список «Ключи»: 214 ключей Канси с вариантами форм; у каждого ключа — все ваши слова с ним</li>
<li>Свои списки и слова: иероглифы, пиньинь, перевод; одно слово — сразу в нескольких списках</li>
<li>Импорт из Pleco, Anki и Excel — файлы .txt, .csv, .tsv или вставка текста</li>
<li>Выгрузка списка для Pleco и в JSON для другого телефона</li>
<li>Резервная копия всех слов, списков и прогресса одним файлом</li>
<li>Поиск по переводу, иероглифам и пиньиню — и тренировка только по найденным словам</li>
</ul>
<p class="more">Как перенести слова из Pleco и сделать резервную копию — по шагам <a href="${esc(GUIDE_URL)}#import">в инструкции</a>.</p>
</div>
</section>
<section id="download" class="alt" aria-labelledby="download-title">
<div class="container dl">
<div>
<h2 id="download-title">${zhDeco('下载')}Скачать BergHanziTrainer</h2>
${WITH_APK
  ? `<p class="sub">Приложение распространяется файлом APK. Установка занимает минуту, новая версия ставится поверх старой — слова и прогресс сохраняются.</p>
${dlButton(`версия ${esc(VERSION)} · ${APK_MB}&nbsp;МБ`, ' btn-big')}
<p class="hint">Открыли страницу на компьютере? Откройте её на телефоне или перенесите скачанный файл по кабелю.</p>
<div class="stats" data-stats="${esc(`https://api.github.com/repos/${SITE.githubRepo}/releases?per_page=20`)}" data-version="${esc(VERSION)}" hidden>
<h3>Скачивания</h3>
<ul data-out="downloads"></ul>
</div>`
  : `<p class="sub">Приложение будет распространяться файлом APK. Установка займёт минуту.</p>
<p class="stub">Скачивание скоро появится на этой странице.</p>
<button type="button" disabled>Скачать APK</button>`}
<dl class="meta">
<dt>Версия</dt><dd>${esc(VERSION)}</dd>
<dt>Android</dt><dd>${ANDROID_MIN} и новее</dd>
${WITH_APK ? `<dt>Размер</dt><dd>${APK_MB}&nbsp;МБ</dd>
<dt>SHA-256</dt><dd><code>${esc(APK_SHA256)}</code></dd>` : ''}
</dl>
<div class="new">
<h3>Что нового в ${esc(VERSION)}</h3>
<ul class="checks">
${WHATS_NEW.map((t) => `<li>${esc(t)}</li>`).join('\n')}
</ul>
</div>
</div>
<div>
<ol class="steps">
<li><h3>Скачайте файл</h3><p>Нажмите «Скачать APK» на телефоне с Android.</p></li>
<li><h3>Откройте его</h3><p>Из уведомления о загрузке или из папки «Загрузки».</p></li>
<li><h3>Разрешите установку</h3><p>Android один раз спросит, можно ли устанавливать приложения из этого источника.</p></li>
<li><h3>Готово</h3><p>Стартовые списки уже на месте — можно писать первый иероглиф.</p></li>
</ol>
</div>
</div>
</section>
<section id="donate" aria-labelledby="donate-title">
<div class="container donate">
<div>
<h2 id="donate-title">${zhDeco('支持')}Поддержать проект</h2>
<p class="sub">BergHanziTrainer — частная разработка без рекламы и подписок. Донаты помогают выделять время на новые режимы и списки слов.</p>
<p class="note">Спасибо, что пользуетесь приложением! ${zh('谢谢')}</p>
</div>
<div class="pay">
${DONATE.map((d) => `<article class="pay-card">
<div><h3>${esc(d.name)}</h3><p>${esc(d.text)}</p>
<a class="btn btn-primary" href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener">Поддержать через ${esc(d.name)}</a></div>
<img class="qr" src="${esc(abs(d.img))}" width="150" height="150" loading="lazy" decoding="async" alt="QR-код: ${esc(d.name)} — откройте камерой телефона">
</article>`).join('\n')}
</div>
</div>
</section>
<section id="faq" class="alt" aria-labelledby="faq-title">
<div class="container">
<h2 id="faq-title">${zhDeco('问答')}Вопросы и ответы</h2>
${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
<p class="more">Подробно обо всех функциях — в <a href="${esc(GUIDE_URL)}">инструкции</a>.</p>
</div>
</section>
<section id="feedback" aria-labelledby="feedback-title">
<div class="container donate">
<div>
<h2 id="feedback-title">${zhDeco('反馈')}Отзывы и предложения</h2>
<p class="sub">Что понравилось, чего не хватает, где приложение ошиблось — напишите. Каждое сообщение читает сам разработчик.</p>
<p class="note">Нашли ошибку? Укажите версию приложения и опишите, что делали перед ней.</p>
</div>
${SITE.web3formsKey
  ? `<form class="fb" action="${esc(FORM_ENDPOINT)}" method="post" accept-charset="utf-8" data-feedback aria-labelledby="fb-title">
<input type="hidden" name="access_key" value="${esc(SITE.web3formsKey)}">
<input type="hidden" name="subject" value="BergHanziTrainer: сообщение с сайта">
<input type="hidden" name="from_name" value="Сайт BergHanziTrainer">
<input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<fieldset>
<legend id="fb-title">Сообщение</legend>
<fieldset class="amounts"><legend>Тема</legend>
<label><input type="radio" name="topic" value="Отзыв" checked>Отзыв</label>
<label><input type="radio" name="topic" value="Предложение">Предложение</label>
<label><input type="radio" name="topic" value="Ошибка">Ошибка</label>
</fieldset>
<label for="fb-message">Текст</label>
<textarea id="fb-message" name="message" rows="6" minlength="5" maxlength="4000" required></textarea>
<label for="fb-version">Версия приложения <small>необязательно</small></label>
<input id="fb-version" type="text" name="app_version" value="${esc(VERSION)}" maxlength="20" autocomplete="off">
<label for="fb-email">Email для ответа <small>необязательно</small></label>
<input id="fb-email" type="email" name="email" maxlength="200" autocomplete="email" inputmode="email">
<label class="consent" data-consent><input type="checkbox" name="consent" value="да">Согласен(на), чтобы мой email использовали только для ответа на это сообщение</label>
<p class="hint">Сообщение уходит на почту разработчика через сервис Web3Forms. Email указывать не обязательно.</p>
<button type="submit" class="btn-submit">Отправить</button>
<p class="fb-status" role="status" data-out="fb-status"></p>
</fieldset>
</form>`
  : `<form aria-labelledby="fb-title">
<fieldset disabled>
<legend id="fb-title">Сообщение</legend>
<p class="stub">Форма отзывов скоро появится на этой странице.</p>
<button type="submit" disabled>Отправить</button>
</fieldset>
</form>`}
</div>
</section>
</main>
${siteFooter(CANONICAL)}
${ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n')}
<script src="${esc(abs(DEMO_JS))}" defer></script>
${siteScript}
</body>
</html>
`;

const guideLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${GUIDE_URL}#article`,
    url: GUIDE_URL,
    headline: GUIDE_TITLE,
    description: GUIDE_DESCRIPTION,
    inLanguage: 'ru',
    image: abs(OG_IMG),
    about: { '@id': `${CANONICAL}#app` },
    author: { '@id': `${CANONICAL}#author` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'BergHanziTrainer', item: CANONICAL },
      { '@type': 'ListItem', position: 2, name: 'Инструкция', item: GUIDE_URL },
    ],
  },
];
const guideHtml = `${pageHead({ title: GUIDE_TITLE, description: GUIDE_DESCRIPTION, url: GUIDE_URL, ogType: 'article' })}
${siteHeader(CANONICAL)}
<main id="main" class="container guide">
<nav class="crumbs" aria-label="Навигация"><a href="${esc(CANONICAL)}">BergHanziTrainer</a> → Инструкция</nav>
<h1>Как пользоваться BergHanziTrainer</h1>
<p class="lead">Всё об основных функциях приложения: списки и слова, режимы тренировки, импорт и экспорт. Описана версия ${esc(VERSION)}.</p>
<nav class="toc" aria-labelledby="toc-title">
<h2 id="toc-title">Содержание</h2>
<ol>${GUIDE_TOC.map(([id, t]) => `<li><a href="#${id}">${mdInline(t)}</a></li>`).join('')}</ol>
</nav>
<article>
${GUIDE_HTML}
</article>
<aside class="guide-end">
<p>Не нашли ответ — загляните в <a href="${esc(CANONICAL)}#faq">вопросы и ответы</a> или <a href="${esc(CANONICAL)}#feedback">напишите разработчику</a>.</p>
${WITH_APK ? dlButton(`v${esc(VERSION)} · ${APK_MB}&nbsp;МБ · Android ${ANDROID_MIN}+`) : `<a class="btn btn-primary" href="${esc(CANONICAL)}#download">Скачать APK<small>скоро · Android ${ANDROID_MIN}+</small></a>`}
</aside>
</main>
${siteFooter(GUIDE_URL)}
${guideLd.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n')}
${siteScript}
</body>
</html>
`;

const minify = (h) => h.replace(/>\s*\n\s*</g, '><').replace(/\n/g, ' ').trim() + '\n';
const minHtml = minify(html);
fs.writeFileSync(path.join(OUT, 'index.html'), minHtml);
fs.writeFileSync(path.join(OUT, 'guide.html'), minify(guideHtml));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);
const xmlEsc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[CANONICAL, GUIDE_URL].map((u) => `  <url><loc>${xmlEsc(u)}</loc></url>\n`).join('')}</urlset>\n`);

console.log(JSON.stringify({ out: OUT, base: BASE, version: VERSION, apk: WITH_APK ? APK_NAME : 'stub', apkMB: APK_MB, sha256: APK_SHA256, strokeChars: STROKE_CHARS, htmlBytes: Buffer.byteLength(minHtml), guideBytes: Buffer.byteLength(minify(guideHtml)), cssBytes: STYLE.length, og: OG_IMG }, null, 1));
