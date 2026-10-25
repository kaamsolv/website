import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LIVE_TOOLS, TOOLS } from '../app/lib/catalogue.ts';
import { PUBLIC_PAGES, SITE_ORIGIN, sitemapPaths, sitemapUrls } from '../app/lib/site-urls.ts';
import { CONVERTER_SLUGS } from '../app/lib/image/types.ts';

const APP = join(import.meta.dirname, '..', 'app');

/** Every page.tsx under app/, as its URL path (route groups removed, dynamic segments kept). */
function pageFiles(dir = APP, route = ''): Map<string, string> {
  const found = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = /^\(.*\)$/.test(name) ? '' : `/${name}`;
      for (const [r, f] of pageFiles(full, route + segment)) found.set(r, f);
    } else if (name === 'page.tsx') {
      found.set(route || '/', full);
    }
  }
  return found;
}

const PAGES = pageFiles();

test('every URL is https on kaamsolv.com, with no query, fragment, spaces or trailing slash', () => {
  for (const url of sitemapUrls()) {
    assert.ok(url.startsWith(`${SITE_ORIGIN}/`) || url === SITE_ORIGIN, url);
    const u = new URL(url);
    assert.equal(u.protocol, 'https:', url);
    assert.equal(u.host, 'kaamsolv.com', url);
    assert.equal(u.search, '', url);
    assert.equal(u.hash, '', url);
    assert.ok(!/\s/.test(url), url);
    if (u.pathname !== '/') assert.ok(!u.pathname.endsWith('/'), url);
    assert.equal(u.pathname, u.pathname.toLowerCase(), url);
  }
});

test('no duplicates', () => {
  const urls = sitemapUrls();
  assert.equal(new Set(urls).size, urls.length);
});

test('catalogue coverage: every live tool is listed, and no planned tool is', () => {
  const paths = new Set(sitemapPaths());
  for (const t of LIVE_TOOLS) assert.ok(paths.has(t.url), `${t.slug} missing`);
  for (const t of TOOLS.filter((x) => x.status !== 'live')) assert.ok(!paths.has(t.url), `${t.slug} is planned`);
  // The ten image converters are catalogue tools too.
  for (const slug of CONVERTER_SLUGS) assert.ok(paths.has(`/${slug}`), slug);
});

test('exclusions: no account, app, auth, report, API, design-system or legacy redirect routes', () => {
  const banned = ['/app', '/api', '/login', '/signup', '/report-link', '/link-unavailable', '/design-system', '/image-tools'];
  for (const p of sitemapPaths()) {
    for (const b of banned) assert.ok(p !== b && !p.startsWith(`${b}/`), `${p} is under ${b}`);
    assert.ok(!p.includes('['), `${p} is a dynamic route`);
  }
});

test('every listed path has a real page that is not marked noindex', () => {
  for (const p of sitemapPaths()) {
    const file = PAGES.get(p);
    assert.ok(file && existsSync(file), `${p} has no page.tsx`);
    const src = readFileSync(file, 'utf8');
    assert.ok(!/index:\s*false/.test(src), `${p} is noindex`);
  }
});
