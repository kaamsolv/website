import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPayload, encodePayload, escapeWifiValue, resolveEncodeTarget } from '../app/lib/qr/encode.ts';

test('URL QR encodes the normalised https URL directly', () => {
  const r = encodePayload({ kind: 'url', url: 'example.com/page' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.text, 'https://example.com/page');
    assert.equal(r.mode, 'static');
  }
});

test('text QR encodes trimmed text', () => {
  const r = encodePayload({ kind: 'text', text: '  Hello, world  ' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.text, 'Hello, world');
});

test('Wi-Fi QR uses WIFI: format', () => {
  const r = canonicalPayload({
    kind: 'wifi',
    ssid: 'Cafe WiFi',
    password: 'secret;pass',
    security: 'WPA',
    hidden: true,
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /^WIFI:T:WPA;/);
    assert.match(r.text, /S:Cafe WiFi/);
    assert.match(r.text, /H:true/);
    assert.ok(r.text.endsWith(';;'));
  }
});

test('escapeWifiValue escapes special characters', () => {
  assert.equal(escapeWifiValue('a;b'), 'a\\;b');
});

test('email QR builds mailto link', () => {
  const r = encodePayload({
    kind: 'email',
    email: 'hi@example.com',
    subject: 'Hello',
    body: 'There',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /^mailto:hi@example.com\?/);
    assert.match(r.text, /subject=Hello/);
    assert.match(r.text, /body=There/);
  }
});

test('phone QR uses tel:', () => {
  const r = encodePayload({ kind: 'phone', phone: '+91 98765 43210' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.text, 'tel:+919876543210');
});

test('WhatsApp QR uses wa.me', () => {
  const r = encodePayload({ kind: 'whatsapp', phone: '+919876543210', message: 'Hi' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /^https:\/\/wa\.me\/919876543210/);
    assert.match(r.text, /text=Hi/);
  }
});

test('vCard QR includes FN and END', () => {
  const r = encodePayload({
    kind: 'vcard',
    name: 'Ada Lovelace',
    phone: '+441234567890',
    email: 'ada@example.com',
    org: 'Analytical Engines',
    url: 'https://example.com',
    address: 'London',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /BEGIN:VCARD/);
    assert.match(r.text, /FN:Ada Lovelace/);
    assert.match(r.text, /END:VCARD/);
  }
});

test('resolveEncodeTarget is identity in Phase 1', () => {
  const t = resolveEncodeTarget('https://example.com');
  assert.deepEqual(t, { text: 'https://example.com', mode: 'static' });
});

test('rejects empty URL', () => {
  const r = encodePayload({ kind: 'url', url: '   ' });
  assert.equal(r.ok, false);
});

test('rejects WhatsApp without country code hint on 10-digit local', () => {
  const r = encodePayload({ kind: 'whatsapp', phone: '9876543210', message: '' });
  assert.equal(r.ok, false);
});
