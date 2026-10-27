import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'content');
const output = path.join(root, 'docs');
const origin = 'https://www.rezab.eu';
const exec = promisify(execFile);
const downloading = process.argv.includes('--download') || process.argv.includes('--download-archives');
await fs.mkdir(source, { recursive: true });
await fs.mkdir(output, { recursive: true });
const write = async (file, data) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data); };
async function download(url, file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await exec('curl.exe', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '60', url, '-o', file]);
}
if (process.argv.includes('--download')) {
  for (const type of ['posts', 'pages']) {
    await download(`${origin}/wp-json/wp/v2/${type}?per_page=100`, path.join(source, `${type}.json`));
  }
  const records = (await Promise.all(['posts', 'pages'].map(async type => JSON.parse(await fs.readFile(path.join(source, `${type}.json`), 'utf8'))))).flat();
  const pages = [{ url: '/', file: 'home.html' }, ...records.map(r => ({url: new URL(r.link).pathname, file: `${r.id}.html`}))];
  for (const page of pages) await download(origin + page.url, path.join(source, page.file));
  await write(path.join(source, 'routes.json'), JSON.stringify(pages, null, 2) + '\n');
}
const routes = JSON.parse(await fs.readFile(path.join(source, 'routes.json'), 'utf8'));
if (downloading) {
  for (const route of routes) {
    const html = await fs.readFile(path.join(source, route.file), 'utf8');
    for (const match of html.matchAll(/href=["']https:\/\/www\.rezab\.eu((?:\/(?:category|tag|author|page)\/)[^"'?#]*)["']/g)) {
      const url = match[1];
      if (url.endsWith('/feed/')) continue;
      if (routes.some(r => r.url === url)) continue;
      const file = `archive-${routes.filter(r => r.file.startsWith('archive-')).length + 1}.html`;
      await download(origin + url, path.join(source, file));
      routes.push({url, file});
    }
  }
  await write(path.join(source, 'routes.json'), JSON.stringify(routes, null, 2) + '\n');
}
const assets = new Map();
function localize(text, base = origin) {
  text = text.replaceAll('https:\\/\\/www.rezab.eu\\/', origin + '/');
  text = text.replace(/(?:https?:)?\/\/(?:www\.)?rezab\.eu([^\s"'<>)]*)/g, (whole, suffix) => {
    const url = new URL(suffix.replaceAll('&#038;', '&').replaceAll('&amp;', '&'), origin);
    if (/^\/wp-(content|includes)\//.test(url.pathname)) assets.set(url.pathname, url.href);
    return url.pathname + (url.pathname.startsWith('/wp-') ? '' : url.search) + url.hash;
  });
  return text.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (whole, quote, value) => {
    if (/^(data:|#)/.test(value)) return whole;
    const url = new URL(value, base);
    if (url.origin !== origin) throw new Error(`External CSS asset requires review: ${url}`);
    assets.set(url.pathname, url.href);
    return `url("${url.pathname}")`;
  });
}
function transform(html) {
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<link\b[^>]*>/gi, tag => /stylesheet|rel=["'](?:icon|apple-touch-icon)["']/.test(tag) ? tag : '')
    .replace(/<meta\b[^>]*(?:generator|msapplication-TileImage)[^>]*>/gi, '')
    .replace(/\sdata-wp-[\w-]+=(?:"[^"]*"|'[^']*')/g, '')
    .replace(/<img\b[^>]*>/gi, tag => {
      const actual = tag.match(/\sdata-src="([^"]+)"/);
      const srcset = tag.match(/\sdata-srcset="([^"]+)"/);
      if (actual) tag = tag.replace(/\ssrc="[^"]*"/, ` src="${actual[1]}"`);
      if (srcset) tag = tag.replace(/\ssrcset="[^"]*"/, '').replace(/\s*\/?>$/, ` srcset="${srcset[1]}" sizes="(max-width: 1000px) 100vw, 1000px" />`);
      return tag.replace(/\sdata-[\w-]+="[^"]*"/g, '').replace(/\blazyload\b|\blazy\b/g, '');
    });
  html = localize(html);
  return html.replace('</head>', '<link rel="alternate" type="application/rss+xml" title="www.rezab.eu Feed" href="/feed/">\n<link rel="stylesheet" href="/assets/static.css">\n<script src="/assets/site.js" defer></script>\n</head>');
}
for (const route of routes) {
  const html = transform(await fs.readFile(path.join(source, route.file), 'utf8'));
  await write(path.join(output, route.url, 'index.html'), html);
}
// Discover assets recursively, including relative font references in downloaded CSS.
const done = new Set();
while ([...assets.keys()].some(key => !done.has(key))) {
  const batch = [...assets.entries()].filter(([key]) => !done.has(key));
  for (let i = 0; i < batch.length; i += 6) {
    await Promise.all(batch.slice(i, i + 6).map(async ([key, url]) => {
      const file = path.join(output, decodeURI(key));
      if (downloading) {
        try { await fs.access(file); } catch { await download(url, file); }
      }
      else await fs.access(file);
      if (key.endsWith('.css')) await write(file, localize(await fs.readFile(file, 'utf8'), url));
      done.add(key);
    }));
  }
}
const records = JSON.parse(await fs.readFile(path.join(source, 'posts.json'), 'utf8'));
const plain = text => text.replace(/<[^>]+>/g, ' ').replace(/&#\d+;|&\w+;/g, ' ').replace(/\s+/g, ' ').trim();
await write(path.join(output, 'search.json'), JSON.stringify(records.map(r => ({title: r.title.rendered, url: new URL(r.link).pathname, text: plain(r.content.rendered)})), null, 2));
const xml = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await write(path.join(output, 'feed/index.xml'), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>www.rezab.eu</title><link>${origin}/</link><description>Microsoft 365, Intune, PowerShell, Modern Desktop Management</description>${records.map(r => `<item><title>${xml(plain(r.title.rendered))}</title><link>${xml(r.link)}</link><guid>${xml(r.link)}</guid><pubDate>${new Date(r.date_gmt + 'Z').toUTCString()}</pubDate><description>${xml(plain(r.excerpt.rendered))}</description></item>`).join('')}</channel></rss>`);
await write(path.join(output, 'feed/index.html'), '<!doctype html><meta http-equiv="refresh" content="0;url=/feed/index.xml"><a href="/feed/index.xml">RSS feed</a>');
await write(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(r => `<url><loc>${origin}${r.url}</loc></url>`).join('')}</urlset>`);
await write(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await write(path.join(output, '.nojekyll'), '');
await write(path.join(output, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found — www.rezab.eu</title><main><h1>Page not found</h1><p>The requested page could not be found.</p><a href="/">Back to www.rezab.eu</a></main></html>');
console.log(`Built ${routes.length} pages, ${done.size} local assets and ${records.length} searchable posts.`);
