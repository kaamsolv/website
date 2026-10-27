/**
 * Security headers (next.config.mjs) and robots.txt (app/robots.ts).
 * The values are checked here; that Cloudflare really sends them is checked
 * against a local Worker build (docs/infra/deployment.md → Security headers).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import nextConfig, { securityHeaders } from '../next.config.mjs';
import robotsModule from '../app/robots.ts';
import { PUBLIC_PAGES } from '../app/lib/site-urls.ts';

// Under tsx the default export can arrive wrapped one level deep.
const robots = (typeof robotsModule === 'function' ? robotsModule : (robotsModule as unknown as { default: typeof robotsModule }).default) as () => ReturnType<typeof robotsModule>;
const config = (nextConfig as unknown as (phase: string) => { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> })('phase-production-build');
const map = new Map(securityHeaders.map((h) => [h.key, h.value]));

test('every route gets the security headers, once each', async () => {
  const rules = await config.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, '/:path*', 'every path, API and pages alike');
  const keys = rules[0].headers.map((h) => h.key);
  assert.equal(new Set(keys).size, keys.length, 'no header twice');
  for (const k of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Content-Security-Policy', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.ok(map.has(k), `${k} is set`);
  }
});

test('the values are the intended ones', () => {
  assert.match(map.get('Strict-Transport-Security')!, /^max-age=(\d+)$/);
  assert.ok(Number(map.get('Strict-Transport-Security')!.split('=')[1]) >= 31536000, 'at least a year');
  assert.doesNotMatch(map.get('Strict-Transport-Security')!, /includeSubDomains|preload/, 'those are separate, later decisions');
  assert.equal(map.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(map.get('X-Frame-Options'), 'SAMEORIGIN');
  assert.equal(map.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  for (const feature of ['camera', 'microphone', 'geolocation']) assert.match(map.get('Permissions-Policy')!, new RegExp(`${feature}=\\(\\)`));
});

test('the Content-Security-Policy is the safe subset: it cannot block a script, style, image, font or connection', () => {
  const csp = map.get('Content-Security-Policy')!;
  const directives = csp.split(';').map((d) => d.trim().split(/\s+/)[0]);
  assert.deepEqual(directives.sort(), ['base-uri', 'frame-ancestors', 'object-src']);
  for (const risky of ['script-src', 'default-src', 'style-src', 'img-src', 'connect-src', 'font-src', 'form-action']) {
    assert.ok(!csp.includes(risky), `${risky} would need its own testing first`);
  }
  assert.match(csp, /frame-ancestors 'self'/);
});

test('robots.txt: public pages crawlable, account area and API not, and it points at the sitemap', () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  assert.equal(rule.userAgent, '*');
  assert.equal(rule.allow, '/');
  assert.deepEqual(rule.disallow, ['/app/', '/api/']);
  assert.equal(r.sitemap, 'https://kaamsolv.com/sitemap.xml');
  // Nothing the sitemap lists is blocked.
  for (const page of PUBLIC_PAGES) {
    for (const d of rule.disallow as string[]) assert.ok(!page.startsWith(d), `${page} must not be disallowed`);
  }
});
