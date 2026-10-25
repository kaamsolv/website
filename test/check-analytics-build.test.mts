import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAnalyticsBuild } from '../scripts/check-analytics-build.mts';

const ID = 'G-TEST123456';

/** A fake .open-next/assets/_next/static holding the given client file contents. */
function staticDirWith(files: Record<string, string> | null): { dir: string; done: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'kk-ga-check-'));
  const dir = join(root, 'static');
  if (files) {
    mkdirSync(join(dir, 'chunks'), { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'chunks', name), body);
  }
  return { dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('correct ID embedded in the build: ok', () => {
  const s = staticDirWith({ 'a.js': 'x', 'b.js': `var g="${ID}";` });
  const r = checkAnalyticsBuild({ id: ID, allowNone: false, staticDir: s.dir });
  assert.equal(r.ok, true, r.message);
  s.done();
});

test('empty or missing ID: fails and explains the opt-out', () => {
  const s = staticDirWith({ 'a.js': `"${ID}"` });
  for (const id of ['', undefined, '   ']) {
    const r = checkAnalyticsBuild({ id, allowNone: false, staticDir: s.dir });
    assert.equal(r.ok, false);
    assert.match(r.message, /KK_ALLOW_NO_ANALYTICS=1/);
  }
  s.done();
});

test('the opt-out flag does not rescue an empty or missing ID', () => {
  const s = staticDirWith({ 'a.js': 'x' });
  for (const id of ['', undefined]) assert.equal(checkAnalyticsBuild({ id, allowNone: true, staticDir: s.dir }).ok, false);
  s.done();
});

test('wrong or overridden ID: the expected ID is not in the build, so it fails', () => {
  const s = staticDirWith({ 'a.js': 'var g="G-OTHER99999";' });
  const r = checkAnalyticsBuild({ id: ID, allowNone: false, staticDir: s.dir });
  assert.equal(r.ok, false);
  assert.match(r.message, /NOT in the built client files/);
  s.done();
});

test('missing build output fails and says to build first', () => {
  const s = staticDirWith(null);
  const r = checkAnalyticsBuild({ id: ID, allowNone: false, staticDir: s.dir });
  assert.equal(r.ok, false);
  assert.match(r.message, /build/i);
  s.done();
});

test('stale or incomplete build output (no JavaScript) fails', () => {
  const s = staticDirWith({ 'readme.txt': ID });
  const r = checkAnalyticsBuild({ id: ID, allowNone: false, staticDir: s.dir });
  assert.equal(r.ok, false);
  assert.match(r.message, /no JavaScript files/);
  s.done();
});

test('malformed ID fails', () => {
  const s = staticDirWith({ 'a.js': 'UA-12345-1' });
  for (const id of ['UA-12345-1', 'G-', 'G-bad id', 'abc']) {
    assert.equal(checkAnalyticsBuild({ id, allowNone: false, staticDir: s.dir }).ok, false, id);
  }
  s.done();
});

test('explicit opt-out: NEXT_PUBLIC_GA_ID=off AND the flag, and only together', () => {
  const s = staticDirWith({ 'a.js': 'var g="";console.log("G-")' }); // a clean build: no GA ID inside
  const both = checkAnalyticsBuild({ id: 'off', allowNone: true, staticDir: s.dir });
  assert.equal(both.ok, true, both.message);
  assert.match(both.message, /WITHOUT analytics/);
  assert.equal(checkAnalyticsBuild({ id: 'off', allowNone: false, staticDir: s.dir }).ok, false);
  s.done();
});

test('opt-out fails if the build still contains a GA ID (stale build made with analytics)', () => {
  for (const literal of ['var g="G-Q9YEM3Y43T";', "var g='G-ABCDEF1234';", 'var g=`G-ABCDEF1234`;']) {
    const s = staticDirWith({ 'a.js': 'x', 'b.js': literal });
    const r = checkAnalyticsBuild({ id: 'off', allowNone: true, staticDir: s.dir });
    assert.equal(r.ok, false, literal);
    assert.match(r.message, /still contain a GA Measurement ID/);
    s.done();
  }
});

test('opt-out cannot be verified without build output, so it fails', () => {
  const none = staticDirWith(null);
  assert.equal(checkAnalyticsBuild({ id: 'off', allowNone: true, staticDir: none.dir }).ok, false);
  none.done();
  const empty = staticDirWith({ 'readme.txt': 'x' });
  assert.equal(checkAnalyticsBuild({ id: 'off', allowNone: true, staticDir: empty.dir }).ok, false);
  empty.done();
});

test('the flag never skips the check when a real ID is configured', () => {
  const s = staticDirWith({ 'a.js': 'var g="G-OTHER99999";' });
  assert.equal(checkAnalyticsBuild({ id: ID, allowNone: true, staticDir: s.dir }).ok, false);
  s.done();
});

test('cf:deploy runs the check after the build and before the deploy; preview/dev/test do not', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts as Record<string, string>;
  const steps = scripts['cf:deploy'].split('&&').map((s) => s.trim());
  assert.deepEqual(steps, [
    'opennextjs-cloudflare build',
    'tsx scripts/check-analytics-build.mts',
    'opennextjs-cloudflare deploy',
  ]);
  for (const name of ['cf:preview', 'cf:build', 'dev', 'build', 'test', 'test:e2e']) {
    assert.ok(!scripts[name].includes('check-analytics-build'), name);
  }
});

test('the app treats anything that is not a G- ID (such as "off") as analytics disabled', () => {
  const src = readFileSync(new URL('../app/lib/analytics.ts', import.meta.url), 'utf8');
  assert.match(src, /ANALYTICS_ENABLED = \/\^G-\[A-Z0-9\]\+\$\/i\.test\(GA_ID\)/);
  assert.equal(/^G-[A-Z0-9]+$/i.test('off'), false);
});
