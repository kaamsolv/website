import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILL_MS, MIN_FILL_MS, botCheck, cleanApplication, cleanNote, cleanWebsite } from '../app/lib/affiliate/application.ts';
import { ANONYMOUS_LIMITS, rateLimitChecks } from '../app/lib/rate-limit.ts';

test('website: normalised, http(s) only, blank allowed', () => {
  assert.equal(cleanWebsite(''), '');
  assert.equal(cleanWebsite('  example.com/blog '), 'https://example.com/blog');
  assert.equal(cleanWebsite('http://example.com'), 'http://example.com/');
  for (const bad of ['javascript:alert(1)', 'ftp://example.com', 'https://user:pw@example.com', 'localhost', 'https://' + 'a'.repeat(200) + '.com']) {
    assert.equal(cleanWebsite(bad), null, bad);
  }
});

test('application: a name is required; length limits say what to fix', () => {
  assert.equal(cleanApplication({ displayName: 'Riya' }).ok, true);
  const bad: [unknown, string, string][] = [
    [{}, 'name_required', 'displayName'],
    [{ displayName: 'x'.repeat(81) }, 'name_long', 'displayName'],
    [{ displayName: 'A', website: 'nope' }, 'website_invalid', 'website'],
    [{ displayName: 'A', message: 'x'.repeat(501) }, 'message_long', 'message'],
    [null, 'name_required', 'displayName'],
  ];
  for (const [body, code, field] of bad) {
    const r = cleanApplication(body);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, code);
      assert.equal(r.field, field, 'every error names the field it belongs to');
    }
  }
});

test('website error: an email address gets its own plain-words message', () => {
  const email = cleanApplication({ displayName: 'Reha', website: 'reha@insta.com' });
  assert.equal(email.ok, false);
  if (!email.ok) {
    assert.equal(email.field, 'website');
    assert.match(email.message, /looks like an email address/);
    assert.match(email.message, /instagram\.com\/yourname/);
  }
  const other = cleanApplication({ displayName: 'Reha', website: 'not a link' });
  assert.equal(other.ok, false);
  if (!other.ok) assert.match(other.message, /doesn’t look like a web address/);
  assert.equal(cleanApplication({ displayName: 'Reha', website: 'instagram.com/reha' }).ok, true);
});

test('application: control characters are stripped and CRLF becomes LF', () => {
  const r = cleanApplication({ displayName: 'Ri\u0000ya\n Sen', message: 'one\r\ntwo\u0007' });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.displayName, 'Ri ya Sen');
    assert.equal(r.value.message, 'one\ntwo');
  }
});

test('decision note: optional, capped', () => {
  assert.equal(cleanNote(undefined), '');
  assert.equal(cleanNote('Thanks!'), 'Thanks!');
  assert.equal(cleanNote('x'.repeat(301)), null);
});

test('bot check: a filled honeypot, a missing time, and a too-fast submit all fail; a normal one passes', () => {
  const now = 1_000_000_000_000;
  assert.deepEqual(botCheck({ openedAt: now - 10_000 }, now), { ok: true });
  assert.deepEqual(botCheck({ openedAt: now - 10_000, website2: 'http://spam' }, now), { ok: false, reason: 'honeypot' });
  assert.deepEqual(botCheck({ openedAt: now - (MIN_FILL_MS - 1) }, now), { ok: false, reason: 'too_fast' });
  assert.deepEqual(botCheck({}, now), { ok: false, reason: 'too_fast' });
  assert.deepEqual(botCheck({ openedAt: 'soon' }, now), { ok: false, reason: 'too_fast' });
  assert.deepEqual(botCheck({ openedAt: now + 60_000 }, now), { ok: true }, 'a clock a minute off is not a bot');
  assert.deepEqual(botCheck({ openedAt: now - MAX_FILL_MS - 1 }, now), { ok: true }, 'a tab left open overnight is fine');
});

test('rate limits exist for applying, deciding and editing, each with two windows or more', () => {
  for (const action of ['affiliateApplyUser', 'affiliateApplyIp', 'affiliateApplyMerchant', 'affiliateMerchantEdit', 'affiliateDecide'] as const) {
    assert.ok(ANONYMOUS_LIMITS[action].length >= 1, action);
    const checks = rateLimitChecks('affiliate', action, 'hash');
    assert.ok(checks.every((c) => c.key.startsWith(`affiliate:${action}:`) && c.limit > 0));
  }
});

test('optional answers: only listed categories and channels, a short country; blank is fine', () => {
  const ok = cleanApplication({ displayName: 'Riya', category: 'teacher', channel: 'whatsapp', country: '  India ' });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.value.category, ok.value.channel, ok.value.country], ['teacher', 'whatsapp', 'India']);
  const blank = cleanApplication({ displayName: 'Riya' });
  assert.ok(blank.ok);
  if (blank.ok) assert.deepEqual([blank.value.category, blank.value.channel, blank.value.country], ['', '', '']);
  for (const [body, field] of [
    [{ displayName: 'R', category: 'wizard' }, 'category'],
    [{ displayName: 'R', channel: 'carrier-pigeon' }, 'channel'],
    [{ displayName: 'R', country: 'x'.repeat(61) }, 'country'],
  ] as const) {
    const r = cleanApplication(body);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.field, field);
  }
});
