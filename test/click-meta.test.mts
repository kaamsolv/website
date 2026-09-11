import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clickMetaFromRequest,
  countryFrom,
  deviceClassFromUserAgent,
  referrerHostFrom,
} from '../app/lib/click-meta.ts';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  facebookInApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0]',
  linkedInApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30',
};

const BOTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'WhatsApp/2.23.20.0 A',
  'TelegramBot (like TwitterBot)',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  'Twitterbot/1.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36',
  'curl/8.7.1',
  'python-requests/2.32.3',
];

test('classifies phones as mobile', () => {
  assert.equal(deviceClassFromUserAgent(UA.iphone), 'mobile');
  assert.equal(deviceClassFromUserAgent(UA.androidPhone), 'mobile');
});

test('classifies iPad and Android-without-"Mobile" as tablet', () => {
  assert.equal(deviceClassFromUserAgent(UA.ipad), 'tablet');
  assert.equal(deviceClassFromUserAgent(UA.androidTablet), 'tablet');
});

test('classifies desktop browsers as desktop', () => {
  assert.equal(deviceClassFromUserAgent(UA.windows), 'desktop');
  assert.equal(deviceClassFromUserAgent(UA.mac), 'desktop');
});

test('classifies link-preview fetchers, crawlers and scripts as bot', () => {
  for (const ua of BOTS) assert.equal(deviceClassFromUserAgent(ua), 'bot', ua);
});

test('in-app browsers are people, not bots', () => {
  assert.equal(deviceClassFromUserAgent(UA.facebookInApp), 'mobile');
  assert.equal(deviceClassFromUserAgent(UA.linkedInApp), 'mobile');
});

test('a missing user agent is unknown', () => {
  assert.equal(deviceClassFromUserAgent(null), 'unknown');
  assert.equal(deviceClassFromUserAgent('   '), 'unknown');
});

test('referrerHostFrom keeps the host only — never path or query', () => {
  assert.equal(
    referrerHostFrom('https://Mail.Google.com/mail/u/0/#inbox/abc?token=secret'),
    'mail.google.com',
  );
  assert.equal(referrerHostFrom('http://t.co/x'), 't.co');
});

test('referrerHostFrom rejects non-http(s) and junk', () => {
  assert.equal(referrerHostFrom(null), null);
  assert.equal(referrerHostFrom(''), null);
  assert.equal(referrerHostFrom('not a url'), null);
  assert.equal(referrerHostFrom('android-app://com.google.android.gm/'), null);
  assert.equal(referrerHostFrom('javascript:alert(1)'), null);
});

test('countryFrom accepts only a two-letter code', () => {
  assert.equal(countryFrom('IN'), 'IN');
  assert.equal(countryFrom(' in '), 'IN');
  assert.equal(countryFrom('IND'), null);
  assert.equal(countryFrom('I1'), null);
  assert.equal(countryFrom(''), null);
  assert.equal(countryFrom(null), null);
});

const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

test('clickMetaFromRequest builds the designed record from a GET', () => {
  assert.deepEqual(
    clickMetaFromRequest(
      'GET',
      headers({
        'user-agent': UA.iphone,
        referer: 'https://web.whatsapp.com/some/path',
        'x-vercel-ip-country': 'IN',
        'x-vercel-ip-city': 'Mumbai',
      }),
    ),
    { deviceClass: 'mobile', referrerHost: 'web.whatsapp.com', country: 'IN' },
  );
});

test('clickMetaFromRequest never reads city or region, even when present', () => {
  const meta = clickMetaFromRequest(
    'GET',
    headers({ 'x-vercel-ip-city': 'Mumbai', 'x-vercel-ip-country-region': 'MH' }),
  );
  assert.ok(meta);
  assert.deepEqual(Object.keys(meta).sort(), ['country', 'deviceClass', 'referrerHost']);
});

test('HEAD is not a click (Next.js answers HEAD with the GET handler)', () => {
  assert.equal(clickMetaFromRequest('HEAD', headers({ 'user-agent': UA.iphone })), null);
});

test('browser prefetch and prerender are not clicks', () => {
  assert.equal(clickMetaFromRequest('GET', headers({ 'sec-purpose': 'prefetch' })), null);
  assert.equal(clickMetaFromRequest('GET', headers({ 'sec-purpose': 'prefetch;prerender' })), null);
  assert.equal(clickMetaFromRequest('GET', headers({ purpose: 'prefetch' })), null);
});
