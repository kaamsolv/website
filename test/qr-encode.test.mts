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

test('SMS QR phone only', () => {
  const r = encodePayload({ kind: 'sms', phone: '+91 98765 43210', message: '' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.text, 'sms:+919876543210');
});

test('SMS QR phone with message', () => {
  const r = encodePayload({ kind: 'sms', phone: '+919876543210', message: 'Hello there' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.text, 'sms:+919876543210?body=Hello%20there');
  }
});

test('location QR valid coordinates', () => {
  const r = encodePayload({
    kind: 'location',
    latitude: '28.6139',
    longitude: '77.2090',
    name: 'India Gate',
    mapsUrl: '',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /^geo:28\.6139,77\.209/);
    assert.match(r.text, /India%20Gate/);
  }
});

test('location QR rejects invalid latitude', () => {
  const r = encodePayload({
    kind: 'location',
    latitude: '95',
    longitude: '77.2090',
    name: '',
    mapsUrl: '',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.field, 'latitude');
});

test('location QR rejects invalid longitude', () => {
  const r = encodePayload({
    kind: 'location',
    latitude: '28.6139',
    longitude: '200',
    name: '',
    mapsUrl: '',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.field, 'longitude');
});

test('event QR valid event', () => {
  const r = encodePayload({
    kind: 'event',
    title: 'Team standup',
    start: '2025-09-15T14:00',
    end: '2025-09-15T15:00',
    location: 'Conference room',
    description: 'Weekly sync',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /BEGIN:VEVENT/);
    assert.match(r.text, /SUMMARY:Team standup/);
    assert.match(r.text, /DTSTART:20250915T140000/);
    assert.match(r.text, /DTEND:20250915T150000/);
    assert.match(r.text, /LOCATION:Conference room/);
    assert.match(r.text, /DESCRIPTION:Weekly sync/);
  }
});

test('event QR rejects end before start', () => {
  const r = encodePayload({
    kind: 'event',
    title: 'Meetup',
    start: '2025-09-15T15:00',
    end: '2025-09-15T14:00',
    location: '',
    description: '',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.field, 'end');
});

test('event QR optional fields omitted', () => {
  const r = encodePayload({
    kind: 'event',
    title: 'Quick call',
    start: '2025-09-15T10:00',
    end: '2025-09-15T10:30',
    location: '',
    description: '',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.doesNotMatch(r.text, /LOCATION:/);
    assert.doesNotMatch(r.text, /DESCRIPTION:/);
  }
});

const socialPlatforms = ['instagram', 'facebook', 'linkedin', 'twitter', 'youtube'] as const;

for (const platform of socialPlatforms) {
  test(`social QR ${platform} encodes URL`, () => {
    const r = encodePayload({
      kind: 'social',
      platform,
      url: 'https://example.com/profile',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.text, 'https://example.com/profile');
  });
}

test('social QR rejects invalid URL', () => {
  const r = encodePayload({ kind: 'social', platform: 'instagram', url: 'not a url' });
  assert.equal(r.ok, false);
});

test('file QR valid URL', () => {
  const r = encodePayload({
    kind: 'file',
    url: 'https://example.com/report.pdf',
    label: 'Annual report',
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.text, 'https://example.com/report.pdf');
});

test('file QR rejects invalid URL', () => {
  const r = encodePayload({ kind: 'file', url: 'ftp://bad.example/file.pdf', label: '' });
  assert.equal(r.ok, false);
});

test('UPI QR ID only', () => {
  const r = encodePayload({ kind: 'upi', upiId: 'merchant@upi', payeeName: '', amount: '', note: '' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /^upi:\/\/pay\?/);
    assert.match(r.text, /pa=merchant(%40|@)upi/);
    assert.match(r.text, /cu=INR/);
    assert.doesNotMatch(r.text, /am=/);
  }
});

test('UPI QR ID and payee', () => {
  const r = encodePayload({
    kind: 'upi',
    upiId: 'shop@okicici',
    payeeName: 'Corner Shop',
    amount: '',
    note: '',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /pn=Corner\+Shop|pn=Corner%20Shop/);
  }
});

test('UPI QR ID and amount', () => {
  const r = encodePayload({
    kind: 'upi',
    upiId: 'pay@upi',
    payeeName: '',
    amount: '250.5',
    note: '',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /am=250\.50/);
  }
});

test('UPI QR full payload', () => {
  const r = encodePayload({
    kind: 'upi',
    upiId: 'pay@upi',
    payeeName: 'Vendor',
    amount: '99',
    note: 'Invoice 42',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.text, /pa=pay(%40|@)upi/);
    assert.match(r.text, /am=99\.00/);
    assert.match(r.text, /tn=Invoice\+42|tn=Invoice%2042/);
  }
});

test('UPI QR rejects invalid UPI ID', () => {
  const r = encodePayload({ kind: 'upi', upiId: 'not-valid', payeeName: '', amount: '', note: '' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.field, 'upiId');
});

test('UPI QR rejects invalid amount', () => {
  const r = encodePayload({
    kind: 'upi',
    upiId: 'pay@upi',
    payeeName: '',
    amount: '-10',
    note: '',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.field, 'amount');
});
