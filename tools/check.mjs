// Gates 2, 3 and the sitemap part of 6: local asset existence, JSON-LD syntax, sitemap/robots vs canonical.
// Usage: node check.mjs <dir> <base-url>
import fs from 'node:fs';
import path from 'node:path';
const [dir = '../docs', base = 'https://bergshrund73.github.io/BergWeb/'] = process.argv.slice(2);
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
let fail = 0;
const urls = new Set();
for (const m of html.matchAll(/\s(?:src|href|content)="([^"]+)"/g)) urls.add(m[1]);
for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)) m[1].split(',').forEach((c) => urls.add(c.trim().split(/\s+/)[0]));
let local = 0;
for (const u of urls) {
  if (u.startsWith('#') || /^(mailto|tel|data):/.test(u)) continue;
  let rel;
  if (u.startsWith(base)) rel = u.slice(base.length);
  else if (/^https?:/.test(u) || !/[./]/.test(u) || u.includes(' ')) continue;
  else rel = u;
  if (rel === '' ) rel = 'index.html';
  local++;
  if (!fs.existsSync(path.join(dir, decodeURIComponent(rel)))) { console.log('MISSING', u); fail++; }
}
console.log(`assets: ${local} local references checked, ${fail} missing`);
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
for (const [, b] of blocks) {
  try { const o = JSON.parse(b); console.log('json-ld OK:', o['@type']); } catch (e) { console.log('json-ld FAIL', e.message); fail++; }
}
const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
const locs = [...fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const robots = fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8').match(/^Sitemap:\s*(\S+)/m)?.[1];
console.log('canonical', canonical, '| sitemap locs', locs, '| robots Sitemap', robots);
if (locs.length !== 1 || locs[0] !== canonical) { console.log('sitemap loc != canonical'); fail++; }
if (robots !== new URL('sitemap.xml', base).href) { console.log('robots Sitemap mismatch'); fail++; }
console.log(fail ? `FAIL (${fail})` : 'PASS');
process.exit(fail ? 1 : 0);
