/**
 * 2b.2 pure helpers: rate-limit config, IP hashing, destination policy,
 * report parsing, and log redaction of API keys.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANONYMOUS_LIMITS, rateLimitChecks, retryAfterSeconds } from '../app/lib/rate-limit.ts';
import { clientIp, hashIp, resolveIpHashSalt } from '../app/lib/ip-hash.ts';
import { checkDestinationPolicy } from '../app/lib/destination-policy.ts';
import {
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  extractShortCode,
  parseReportInput,
  sanitizeDetails,
} from '../app/lib/report.ts';
import { redactSecrets } from '../app/lib/log-error.ts';

// ----------------------------------------------------------- rate-limit config

test('create has a per-minute and a per-day window; report has per-hour', () => {
  assert.deepEqual(
    ANONYMOUS_LIMITS.create.map((r) => [r.window, r.limit]),
    [
      ['1m', 12],
      ['1d', 100],
    ],
  );
  assert.deepEqual(ANONYMOUS_LIMITS.report.map((r) => [r.window, r.limit]), [['1h', 5]]);
});

test('rate-limit keys are scoped, per-window, and carry only the hash', () => {
  const checks = rateLimitChecks('url-shortener', 'create', 'abc123');
  assert.deepEqual(
    checks.map((c) => c.key),
    ['url-shortener:create:1m:abc123', 'url-shortener:create:1d:abc123'],
  );
  // A different scope never shares a counter.
  assert.notEqual(rateLimitChecks('qr', 'create', 'abc123')[0].key, checks[0].key);
});

test('retryAfterSeconds rounds up and is never below 1', () => {
  const now = 1_000_000;
  assert.equal(retryAfterSeconds(new Date(now + 1500), now), 2);
  assert.equal(retryAfterSeconds(new Date(now - 5000), now), 1);
});

// --------------------------------------------------------------------- IP hash

test('the salt is required on Vercel, defaulted locally', () => {
  assert.throws(
    () => resolveIpHashSalt({ VERCEL: '1', VERCEL_ENV: 'preview' }),
    /KK_IP_HASH_SALT is not set.*VERCEL_ENV=preview.*REDEPLOY/,
  );
  assert.equal(resolveIpHashSalt({ VERCEL: '1', KK_IP_HASH_SALT: ' s3cret ' }), 's3cret');
  assert.ok(resolveIpHashSalt({}).length > 0);
});

test('hashIp is deterministic, salt-dependent, and never contains the IP', async () => {
  const a = await hashIp('203.0.113.7', 'salt-a');
  assert.equal(a, await hashIp('203.0.113.7', 'salt-a'));
  assert.notEqual(a, await hashIp('203.0.113.7', 'salt-b'));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('203'));
});

test('clientIp takes the first forwarded address', () => {
  const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
  assert.equal(clientIp(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
  assert.equal(clientIp(h({ 'x-real-ip': '198.51.100.2' })), '198.51.100.2');
  assert.equal(clientIp(h({})), 'local');
});

// ---------------------------------------------------------- destination policy

test('blocks open URL shorteners, including subdomains', () => {
  for (const host of ['bit.ly', 'www.bit.ly', 'tinyurl.com', 't.co', 'lnkd.in', 'is.gd', 'rb.gy']) {
    assert.deepEqual(checkDestinationPolicy(host), { ok: false, reason: 'url_shortener' }, host);
  }
});

test('allows first-party short domains and ordinary sites', () => {
  for (const host of ['youtu.be', 'amzn.to', 'wa.me', 'example.com', 'en.wikipedia.org', 'notbit.ly']) {
    assert.deepEqual(checkDestinationPolicy(host), { ok: true }, host);
  }
});

// ------------------------------------------------------------------- reports

const HOSTS = ['kaamkit.com', 'www.kaamkit.com', 'localhost:3000'];

test('extractShortCode accepts a bare code, a host/path, and a full URL', () => {
  assert.equal(extractShortCode('abc1234', HOSTS), 'abc1234');
  assert.equal(extractShortCode('kaamkit.com/abc1234', HOSTS), 'abc1234');
  assert.equal(extractShortCode('https://kaamkit.com/abc1234', HOSTS), 'abc1234');
  assert.equal(extractShortCode('  https://www.kaamkit.com/abc1234/  ', HOSTS), 'abc1234');
  assert.equal(extractShortCode('http://localhost:3000/abc1234', HOSTS), 'abc1234');
});

test('extractShortCode refuses other hosts, reserved words and junk', () => {
  assert.equal(extractShortCode('bit.ly/abc1234', HOSTS), null);
  assert.equal(extractShortCode('https://kaamkit.com/about', HOSTS), null);
  assert.equal(extractShortCode('https://kaamkit.com/a/b', HOSTS), null);
  assert.equal(extractShortCode('ab', HOSTS), null);
  assert.equal(extractShortCode('has space', HOSTS), null);
  assert.equal(extractShortCode('javascript:alert(1)', HOSTS), null);
  assert.equal(extractShortCode('x'.repeat(400), HOSTS), null);
});

test('sanitizeDetails strips control and ANSI characters, keeps newlines, caps length', () => {
  assert.equal(sanitizeDetails('ok\u001b[31m red\u0000\u0007 text\nline two'), 'ok[31m red text\nline two');
  assert.equal(sanitizeDetails('a\n\n\n\nb'), 'a\n\nb');
  assert.equal(sanitizeDetails('x'.repeat(MAX_REPORT_DETAILS + 50))?.length, MAX_REPORT_DETAILS);
  assert.equal(sanitizeDetails('   '), null);
  assert.equal(sanitizeDetails(42), null);
});

test('parseReportInput validates link, then reason', () => {
  assert.deepEqual(parseReportInput({ link: 'bit.ly/x1y2z3', reason: 'spam' }, HOSTS), {
    ok: false,
    field: 'link',
    message: "That doesn't look like a KaamKit short link.",
  });
  assert.equal((parseReportInput({ link: 'abc1234', reason: 'bogus' }, HOSTS) as { field: string }).field, 'reason');
  assert.deepEqual(parseReportInput({ link: 'kaamkit.com/abc1234', reason: 'phishing', details: ' hi ' }, HOSTS), {
    ok: true,
    shortCode: 'abc1234',
    reason: 'phishing',
    details: 'hi',
  });
  assert.equal(parseReportInput(null, HOSTS).ok, false);
});

test('every reason is a known enum value', () => {
  assert.deepEqual([...REPORT_REASONS], ['phishing', 'malware', 'spam', 'illegal', 'other']);
});

// ---------------------------------------------------------------- redaction

test('redactSecrets scrubs API keys in query strings', () => {
  const url = 'https://webrisk.googleapis.com/v1/uris:search?uri=x&threatTypes=MALWARE&key=AIzaFAKEKEY123';
  const safe = redactSecrets(`fetch failed: ${url}`);
  assert.ok(!safe.includes('AIzaFAKEKEY123'));
  assert.match(safe, /&key=\[redacted\]/);
  assert.match(redactSecrets('GET /x?token=abc&y=1'), /\?token=\[redacted\]&y=1/);
});
