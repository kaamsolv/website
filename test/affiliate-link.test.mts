import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDestination, generateLinkCode, isLinkCodeShape, linkLabel, linkPath, withRef, LINK_DESTINATION_MAX, CLICKS_NOTE } from '../app/lib/affiliate/link.ts';

test('a link code is 8 base62 characters, random each time, and matches the shape check', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const c = generateLinkCode();
    assert.match(c, /^[0-9A-Za-z]{8}$/);
    assert.ok(isLinkCodeShape(c));
    seen.add(c);
  }
  assert.ok(seen.size > 195, 'codes are not repeating');
  for (const bad of ['', 'abc', 'a-b-c-d-e', 'abcd efgh', 'ab/cdefgh', 'x'.repeat(13)]) assert.equal(isLinkCodeShape(bad), false, bad);
});

test('a link is kaamsolv.com/{business}/{code}', () => {
  assert.equal(linkPath('wandernest-tales', 'Ab3xK9pQ'), '/wandernest-tales/Ab3xK9pQ');
  assert.equal(linkLabel('wandernest-tales', 'Ab3xK9pQ'), 'kaamsolv.com/wandernest-tales/Ab3xK9pQ');
});

test('the destination: blank is fine; https store addresses are kept', () => {
  assert.deepEqual(cleanDestination(''), { ok: true, value: '' });
  assert.deepEqual(cleanDestination('   '), { ok: true, value: '' });
  assert.deepEqual(cleanDestination(undefined), { ok: true, value: '' });
  const ok = cleanDestination('https://wandernesttales.com');
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.value, 'https://wandernesttales.com/');
  const deep = cleanDestination('https://shop.example.in/collections/new?utm_source=a#top');
  assert.ok(deep.ok && deep.value === 'https://shop.example.in/collections/new?utm_source=a#top');
  // A bare domain gets https.
  const bare = cleanDestination('wandernesttales.com');
  assert.ok(bare.ok && bare.value.startsWith('https://wandernesttales.com'));
});

test('the destination refuses what could mislead or harm', () => {
  const refused: [string, string][] = [
    ['http://wandernesttales.com', 'destination_https'],
    ['javascript:alert(1)', 'destination_invalid'],
    ['ftp://example.com', 'destination_invalid'],
    ['https://user:pass@example.com', 'destination_invalid'],
    ['https://localhost/x', 'destination_invalid'],
    ['https://192.168.1.5/x', 'destination_invalid'],
    ['https://169.254.169.254/latest', 'destination_invalid'],
    ['https://kaamsolv.com/', 'destination_self'],
    ['https://www.kaamsolv.com/affiliate/x', 'destination_self'],
    ['https://sub.kaamsolv.com', 'destination_self'],
    ['https://bit.ly/abc', 'destination_shortener'],
    ['https://www.tinyurl.com/abc', 'destination_shortener'],
    ['not a web address', 'destination_invalid'],
    [`https://example.com/${'a'.repeat(LINK_DESTINATION_MAX)}`, 'destination_long'],
  ];
  for (const [input, error] of refused) {
    const r = cleanDestination(input);
    assert.equal(r.ok, false, input);
    assert.equal(!r.ok && r.error, error, input);
    assert.ok(!r.ok && r.message.length > 10 && !r.message.includes('undefined'));
  }
  assert.equal(cleanDestination(42).ok, true, 'a non-string is treated as blank, not as an address');
});

test('?ref=CODE is added, keeping any query and fragment, and replacing an existing ref', () => {
  assert.equal(withRef('https://wandernesttales.com/', 'Ab3xK9pQ'), 'https://wandernesttales.com/?ref=Ab3xK9pQ');
  assert.equal(withRef('https://s.example/p?utm_source=wa#top', 'Ab3xK9pQ'), 'https://s.example/p?utm_source=wa&ref=Ab3xK9pQ#top');
  assert.equal(withRef('https://s.example/?ref=someone-else', 'Ab3xK9pQ'), 'https://s.example/?ref=Ab3xK9pQ');
});

test('the clicks note never claims people or unique visitors', () => {
  assert.match(CLICKS_NOTE, /recorded/i);
  assert.match(CLICKS_NOTE, /isn’t a count of people/);
});
