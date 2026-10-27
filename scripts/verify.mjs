import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../_site');
const errors = [];
const urls = new Set(['/']);
async function files(dir) {
  const entries = await fs.readdir(dir, {withFileTypes: true});
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
}
const all = await files(root);
const htmlFiles = new Map(await Promise.all(all.filter(f => f.endsWith('.html')).map(async f => [f, await fs.readFile(f, 'utf8')])));
for (const file of htmlFiles.keys()) {
  if (file.endsWith('404.html')) continue;
  const url = '/' + path.relative(root, file).replaceAll('\\', '/').replace(/index\.html$/, '');
  urls.add(url);
}
async function check(ref, file) {
  if (/^(?:https?:|mailto:|tel:|data:|\/\/)/.test(ref)) return;
  const pageUrl = '/' + path.relative(root, file).replaceAll('\\', '/');
  const url = new URL(ref.replaceAll('&amp;', '&'), 'https://local.test' + pageUrl);
  const target = path.join(root, decodeURI(url.pathname));
  let found = false, resolved;
  for (const candidate of [target, path.join(target, 'index.html')]) {
    try { if ((await fs.stat(candidate)).isFile()) { found = true; resolved = candidate; break; } } catch {}
  }
  if (!found) errors.push(`${pageUrl}: missing ${ref}`);
  else urls.add(url.pathname);
  if (found && url.hash && htmlFiles.has(resolved)) {
    const ids = [...htmlFiles.get(resolved).matchAll(/\b(?:id|name)=["']([^"']+)["']/g)].map(m => m[1]);
    if (!ids.includes(decodeURIComponent(url.hash.slice(1)))) errors.push(`${pageUrl}: missing anchor ${ref}`);
  }
}
for (const file of all) {
  if (!/\.(html|css)$/.test(file)) continue;
  const text = await fs.readFile(file, 'utf8');
  if (file.endsWith('.html')) {
    if (/<(?:script|iframe)[^>]+(?:googletagmanager|googlesyndication|rezab\.eu)/i.test(text)) errors.push(`Remote script in ${file}`);
    if (/<img[^>]+\sdata-src=/.test(text)) errors.push(`Unconverted lazy image in ${file}`);
    for (const m of text.matchAll(/\s(?:href|src|action)=["']([^"']+)["']/g)) await check(m[1], file);
    for (const m of text.matchAll(/\ssrcset="([^"]+)"/g)) for (const ref of m[1].split(',')) await check(ref.trim().split(/\s+/)[0], file);
  }
  for (const m of text.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)) await check(m[1], file);
}
const base = process.argv.find(arg => arg.startsWith('--url='))?.slice(6);
if (base) {
  for (const url of urls) {
    const response = await fetch(new URL(url, base));
    if (url === '/404.html' ? response.status !== 404 : !response.ok) errors.push(`HTTP ${response.status}: ${url}`);
    await response.arrayBuffer();
  }
  const missing = await fetch(new URL('/definitely-missing-test-page/', base));
  if (missing.status !== 404) errors.push(`Missing page returned ${missing.status}, expected 404`);
  await missing.arrayBuffer();
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Verified ${all.length} files and ${urls.size} internal URLs${base ? ' including Docker HTTP responses and 404' : ''}.`);
