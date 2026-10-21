import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isReservedCode, RESERVED_CODES } from '../app/lib/reserved-routes.ts';
import { CONVERTER_SLUGS } from '../app/lib/image/types.ts';

test('flags top-level app routes', () => {
  for (const r of ['url-shortener', 'about', 'login', 'api', 'dashboard', 'design-system']) {
    assert.ok(isReservedCode(r), r);
  }
});

test('flags framework / asset paths', () => {
  for (const r of ['_next', 'favicon.ico', 'robots.txt', 'sitemap.xml']) {
    assert.ok(isReservedCode(r), r);
  }
});

test('is case-insensitive and trims', () => {
  assert.ok(isReservedCode('  ABOUT '));
  assert.ok(isReservedCode('Api'));
});

test('does not flag a normal-looking short code', () => {
  for (const code of ['aB3xK9p', 'x7Kp2', 'q1w2e3r', 'Zz9Yy8X']) {
    assert.ok(!isReservedCode(code), code);
  }
});

test('every entry is stored lower-case', () => {
  for (const entry of RESERVED_CODES) assert.equal(entry, entry.toLowerCase());
});

// Every real top-level page must be reserved, or a short code could shadow it
// in the Cloudflare edge guard / future custom slugs. Route groups `(x)` are
// transparent, so their children are top-level too.
function topLevelRouteSegments(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith('(') && name.endsWith(')')) {
      out.push(...topLevelRouteSegments(join(dir, name)));
    } else if (!name.startsWith('_') && !name.startsWith('[')) {
      out.push(name);
    }
  }
  return out;
}

test('every top-level app route folder is reserved', () => {
  const appDir = join(import.meta.dirname, '..', 'app');
  // Folders under app/ that hold code but are not routes.
  const notRoutes = new Set(['components', 'lib']);
  const routes = topLevelRouteSegments(appDir).filter((s) => !notRoutes.has(s));
  assert.ok(routes.includes('qr-code-generator') && routes.includes('png-to-jpg'));
  for (const segment of routes) assert.ok(isReservedCode(segment), `app/${segment} is not reserved`);
});

test('every image converter slug is reserved', () => {
  for (const slug of CONVERTER_SLUGS) assert.ok(isReservedCode(slug), slug);
});
