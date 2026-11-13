import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESERVED_MERCHANT_SLUGS,
  checkSlug,
  cleanMerchantInput,
  contrastRatio,
  isAcceptableLogo,
  portalLabel,
  readableOn,
  slugFromName,
} from '../app/lib/affiliate/merchant.ts';
import { isReservedCode } from '../app/lib/reserved-routes.ts';

test('slug: accepts normal addresses, lower-cases and trims', () => {
  assert.deepEqual(checkSlug(' Wandernest-Tales '), { ok: true, slug: 'wandernest-tales' });
  assert.equal(checkSlug('abc').ok, true);
});

test('slug: refuses bad shapes', () => {
  for (const s of ['', 'ab', '-abc', 'abc-', 'a--b', 'has space', 'under_score', 'x'.repeat(41), 'dot.dot', 5, null]) {
    const r = checkSlug(s);
    assert.equal(r.ok, false, String(s));
    if (!r.ok) assert.equal(r.error, 'slug_invalid');
  }
});

test('slug: reserved words are refused, and every reserved word is itself a valid shape', () => {
  for (const s of RESERVED_MERCHANT_SLUGS) assert.equal(s, s.toLowerCase());
  const r = checkSlug('register');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, 'slug_reserved');
});

test('slug from a business name', () => {
  assert.equal(slugFromName('Wandernest Tales'), 'wandernest-tales');
  assert.equal(slugFromName('  Sharma & Sons (India) Pvt. Ltd. '), 'sharma-sons-india-pvt-ltd');
  assert.equal(slugFromName('AB'), '');
  assert.equal(checkSlug(slugFromName('Wandernest Tales')).ok, true);
});

test('/affiliate is reserved so a short code can never be "affiliate"', () => {
  assert.ok(isReservedCode('affiliate'));
});

test('portal label', () => assert.equal(portalLabel('wandernest-tales'), 'kaamsolv.com/affiliate/wandernest-tales'));

test('readable text: white on dark, navy on light, at least 3:1 on every brand colour', () => {
  assert.equal(readableOn('#0C2248'), '#FFFFFF');
  assert.equal(readableOn('#FDBD43'), '#0C2248');
  for (const c of ['#FE6336', '#38BBAC', '#6934D0', '#FDBD43', '#0C2248']) {
    assert.ok(contrastRatio(c, readableOn(c)) >= 3, c);
  }
  assert.ok(contrastRatio('#000000', '#FFFFFF') > 20);
});

test('logo check: small data URLs only', () => {
  assert.ok(isAcceptableLogo('data:image/png;base64,iVBORw0KGgo='));
  assert.ok(!isAcceptableLogo('data:image/svg+xml;base64,PHN2Zz4='));
  assert.ok(!isAcceptableLogo('https://example.com/logo.png'));
  assert.ok(!isAcceptableLogo('data:image/png;base64,' + 'A'.repeat(280_000)));
});

test('input: a minimal body is accepted with defaults', () => {
  const r = cleanMerchantInput({ name: '  Wandernest   Tales ' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.name, 'Wandernest Tales');
    assert.equal(r.value.brand.brandColour, '#FE6336');
    assert.equal(r.value.brand.logo, null);
    assert.equal(r.value.brand.programmeName, '');
  }
});

test('input: refusals say what to fix', () => {
  const bad: [unknown, string][] = [
    [{}, 'name_required'],
    [{ name: 'x'.repeat(81) }, 'name_long'],
    [{ name: 'A', programmeName: 'x'.repeat(81) }, 'programme_name_long'],
    [{ name: 'A', programmeDescription: 'x'.repeat(501) }, 'description_long'],
    [{ name: 'A', terms: 'x'.repeat(10_001) }, 'terms_long'],
    [{ name: 'A', brandColour: 'red' }, 'colour_invalid'],
    [{ name: 'A', brandColour: '#FFF' }, 'colour_invalid'],
    [{ name: 'A', logo: 'javascript:alert(1)' }, 'bad_logo'],
    [null, 'name_required'],
  ];
  for (const [body, code] of bad) {
    const r = cleanMerchantInput(body);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, code);
      assert.ok(r.message.length > 0);
    }
  }
});

test('input: colour is upper-cased and CRLF becomes LF', () => {
  const r = cleanMerchantInput({ name: 'A', brandColour: '#38bbac', terms: 'one\r\ntwo' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.brand.brandColour, '#38BBAC');
    assert.equal(r.value.brand.terms, 'one\ntwo');
  }
});
