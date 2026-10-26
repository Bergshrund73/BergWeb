// Gates 2, 3 and the sitemap part of 6: local asset and #anchor existence, JSON-LD syntax, sitemap/robots vs canonical.
// Usage: node check.mjs <dir> <base-url>
import fs from 'node:fs';
import path from 'node:path';
const [dir = '../docs', base = 'https://bergshrund73.github.io/BergWeb/'] = process.argv.slice(2);
const PAGES = ['index.html', 'guide.html'];
const read = (page) => fs.readFileSync(path.join(dir, page), 'utf8');
const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
let fail = 0;
const canonicals = [];
for (const page of PAGES) {
  const html = read(page);
  console.log(`--- ${page}`);
  const urls = new Set();
  for (const m of html.matchAll(/\s(?:src|href|content|data-hanzi)="([^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)) m[1].split(',').forEach((c) => urls.add(c.trim().split(/\s+/)[0]));
  let local = 0;
  for (const u of urls) {
    if (/^(mailto|tel|data):/.test(u) || /^#[0-9A-Fa-f]{6}$/.test(u)) continue; // theme-color values
    let rel;
    if (u.startsWith('#')) rel = page + u;
    else if (u.startsWith(base)) rel = u.slice(base.length);
    else if (/^https?:/.test(u) || !/[./]/.test(u) || u.includes(' ')) continue;
    else rel = u;
    const [file, frag] = rel.split('#');
    const target = file === '' ? 'index.html' : decodeURIComponent(file);
    local++;
    if (!fs.existsSync(path.join(dir, target))) { console.log('MISSING', u); fail++; continue; }
    if (frag && target.endsWith('.html') && !ids(read(target)).has(frag)) { console.log('MISSING ANCHOR', u); fail++; }
  }
  console.log(`references: ${local} local checked`);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, b] of blocks) {
    try { const o = JSON.parse(b); console.log('json-ld OK:', o['@type']); } catch (e) { console.log('json-ld FAIL', e.message); fail++; }
  }
  canonicals.push(html.match(/<link rel="canonical" href="([^"]+)"/)[1]);
}
const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const robots = read('robots.txt').match(/^Sitemap:\s*(\S+)/m)?.[1];
console.log('canonicals', canonicals, '| sitemap locs', locs, '| robots Sitemap', robots);
if (locs.join() !== canonicals.join()) { console.log('sitemap locs != canonicals'); fail++; }
if (robots !== new URL('sitemap.xml', base).href) { console.log('robots Sitemap mismatch'); fail++; }
console.log(fail ? `FAIL (${fail})` : 'PASS');
process.exit(fail ? 1 : 0);
