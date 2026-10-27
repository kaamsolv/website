/**
 * Analytics URL hygiene (docs/ANALYTICS.md). Every event that leaves through
 * app/lib/analytics.ts must carry a clean page_location — origin and path, never
 * a query string or fragment — and account pages must send nothing outbound.
 *
 * Runs the real helpers against stubbed browser globals: gtag is a recorder, so
 * nothing is ever sent anywhere.
 */

import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';

type Call = { cmd: string; name: string; params: Record<string, unknown>; args: unknown[] };
type Mod = typeof import('../app/lib/analytics.ts');

const ORIGIN = 'https://kaamsolv.com';
const DIRTY = '?id=TEST123&token=SHOULD_NOT_SEND#private-fragment';

let a: Mod;
let calls: Call[];
let loc: { href: string; origin: string; pathname: string; hostname: string };
const doc = { title: 'A fixed title', referrer: '', cookie: '' };

function visit(path: string, referrer = '') {
  const u = new URL(`${ORIGIN}${path}`);
  loc.href = u.href;
  loc.origin = u.origin;
  loc.pathname = u.pathname;
  doc.referrer = referrer;
}

before(async () => {
  process.env.NEXT_PUBLIC_GA_ID = 'G-UNITTEST1';
  const store = new Map<string, string>([['kaamsolv-analytics', 'granted']]);
  loc = { href: ORIGIN, origin: ORIGIN, pathname: '/', hostname: 'kaamsolv.com' };
  const g = globalThis as unknown as Record<string, unknown>;
  g.location = loc;
  g.document = doc;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  g.window = { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
  a = await import('../app/lib/analytics.ts');
});

beforeEach(() => {
  calls = [];
  (globalThis as unknown as { window: Record<string, unknown> }).window.dataLayer = [];
  (globalThis as unknown as { window: Record<string, unknown> }).window.gtag = (...args: unknown[]) => {
    calls.push({ cmd: String(args[0]), name: String(args[1]), params: (args[2] ?? {}) as Record<string, unknown>, args });
  };
  a.resetPageView();
});

const events = () => calls.filter((c) => c.cmd === 'event');
const wire = () => JSON.stringify(calls);

test('cleanUrl keeps origin and path only, collapses the account area, and never throws', () => {
  assert.equal(a.cleanUrl(`${ORIGIN}/invoice-generator${DIRTY}`), `${ORIGIN}/invoice-generator`);
  assert.equal(a.cleanUrl(`${ORIGIN}/${DIRTY}`), `${ORIGIN}/`);
  assert.equal(a.cleanUrl('/tools?x=1#y', ORIGIN), `${ORIGIN}/tools`);
  assert.equal(a.cleanUrl(`${ORIGIN}/app/qr/4f8ddbc9-753c-4a4b-a8f7-7dca4f18a060?x=1`), `${ORIGIN}/app`, 'ids inside the account area never go');
  assert.equal(a.cleanUrl(`${ORIGIN}/app`), `${ORIGIN}/app`);
  assert.equal(a.cleanUrl(`${ORIGIN}/apple`), `${ORIGIN}/apple`, '/apple is not the account area');
  for (const bad of ['', 'not a url', 'javascript:alert(1)', 'data:text/plain,hi', 'mailto:a@b.c', 'http://[::1', '//']) {
    assert.equal(a.cleanUrl(bad), '', `${bad} gives nothing`);
  }
});

test('page_view, tool_open, tool_success, tool_error, file_download and outbound_click all carry a clean page_location', () => {
  visit(`/invoice-generator${DIRTY}`);
  const tool = { name: 'Invoice Generator', slug: 'invoice-generator', url: '/invoice-generator', category: 'Business', blurb: '', keywords: [], status: 'live' } as never;
  a.trackPageView('/invoice-generator');
  a.trackToolOpen(tool, 'generator');
  a.trackToolSuccess('generator', true);
  a.trackToolError('pdf_failed', 'generator');
  a.trackFileDownload('Invoice 42 – Acme Ltd.pdf');
  a.trackOutboundClick('https://example.org/private/path?x=1#y');

  assert.deepEqual(
    events().map((e) => e.name),
    ['page_view', 'tool_open', 'tool_success', 'tool_error', 'file_download', 'outbound_click'],
  );
  for (const e of events()) assert.equal(e.params.page_location, `${ORIGIN}/invoice-generator`, `${e.name} location is clean`);
  const w = wire();
  for (const leak of ['TEST123', 'SHOULD_NOT_SEND', 'private-fragment', 'token=', '?id', 'Acme', 'Invoice 42', '/private/path']) {
    assert.ok(!w.includes(leak), `${leak} is nowhere in the payload`);
  }
  // Still the fixed, useful labels.
  assert.deepEqual(events().find((e) => e.name === 'file_download')!.params.file_ext, 'pdf');
  assert.equal(events().find((e) => e.name === 'outbound_click')!.params.link_domain, 'example.org');
  assert.equal(events().find((e) => e.name === 'tool_open')!.params.tool_name, 'invoice-generator');
});

test('the page you came from is cleaned too: no query, no fragment, no account ids; an unusable referrer is left out', () => {
  visit('/tools', `${ORIGIN}/invoice-generator${DIRTY}`);
  a.trackPageView('/tools');
  assert.equal(events()[0].params.page_referrer, `${ORIGIN}/invoice-generator`);

  visit('/tools', `${ORIGIN}/app/invoices?select=TEST123`);
  a.resetPageView();
  calls = [];
  a.trackPageView('/tools');
  assert.equal(events()[0].params.page_referrer, `${ORIGIN}/app`);

  visit('/tools', 'https://www.google.com/search?q=private+words#x');
  a.resetPageView();
  calls = [];
  a.trackPageView('/tools');
  assert.equal(events()[0].params.page_referrer, 'https://www.google.com/search', 'even an outside referrer is cut at the path');

  visit('/tools', 'garbage');
  a.resetPageView();
  calls = [];
  a.trackPageView('/tools');
  assert.ok(!('page_referrer' in events()[0].params), 'nothing is sent rather than something unclean');
  assert.ok(!wire().includes('private+words'));
});

test('call sites cannot override the clean location', () => {
  visit(`/gst-calculator${DIRTY}`);
  a.trackToolSuccess('calculator');
  assert.equal(events()[0].params.page_location, `${ORIGIN}/gst-calculator`);
});

test('account pages: no page view and no outbound click — public pages still send both', () => {
  for (const path of ['/app', '/app/', '/app/qr/4f8ddbc9-753c-4a4b-a8f7-7dca4f18a060', '/app/invoices?select=TEST123']) {
    visit(path);
    a.trackPageView(new URL(`${ORIGIN}${path}`).pathname);
    a.trackOutboundClick('https://example.org/');
  }
  assert.deepEqual(events(), [], 'nothing from the account area');

  visit('/about');
  a.trackOutboundClick('https://example.org/');
  assert.equal(events().length, 1);
  assert.equal(events()[0].name, 'outbound_click');
  visit('/apple');
  a.trackOutboundClick('https://example.org/');
  assert.equal(events().length, 2, '/apple is public, not the account area');
});

test('without consent nothing is sent at all', () => {
  const g = globalThis as unknown as { localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } };
  g.localStorage.setItem('kaamsolv-analytics', 'denied');
  try {
    visit('/about');
    a.trackPageView('/about');
    a.trackOutboundClick('https://example.org/');
    assert.deepEqual(calls, []);
  } finally {
    g.localStorage.setItem('kaamsolv-analytics', 'granted');
  }
});

test('syncCleanLocation gives Google the cleaned address (and referrer) as its default for anything it measures itself', () => {
  visit(`/invoice-generator${DIRTY}`, `${ORIGIN}/tools?from=TEST123#top`);
  a.syncCleanLocation();
  const set = calls.filter((c) => c.cmd === 'set');
  assert.equal(set.length, 1);
  assert.deepEqual(set[0].args[1], { page_location: `${ORIGIN}/invoice-generator`, page_referrer: `${ORIGIN}/tools` });
  for (const leak of ['TEST123', 'SHOULD_NOT_SEND', 'private-fragment']) assert.ok(!wire().includes(leak), `${leak} is nowhere`);

  calls = [];
  visit('/about', 'garbage');
  a.syncCleanLocation();
  assert.deepEqual(calls[0].args[1], { page_location: `${ORIGIN}/about` }, 'an unusable referrer is left out');
});

test('account pages: analytics is inert — no event of any kind, and no defaults set either', () => {
  const tool = { name: 'Invoice Generator', slug: 'invoice-generator', url: '/invoice-generator', category: 'Business', blurb: '', keywords: [], status: 'live' } as never;
  for (const path of ['/app', '/app/qr/4f8ddbc9-753c-4a4b-a8f7-7dca4f18a060', `/app/invoices${DIRTY}`]) {
    visit(path, `${ORIGIN}/tools`);
    a.syncCleanLocation();
    a.trackToolOpen(tool, 'generator');
    a.trackToolSuccess('generator', true);
    a.trackToolError('x', 'generator');
    a.trackFileDownload('a.pdf');
    a.trackOutboundClick('https://example.org/');
  }
  assert.deepEqual(calls, []);
  visit('/tools');
  a.syncCleanLocation();
  assert.equal(calls.length, 1, 'public pages still work');
});

test('without consent syncCleanLocation sets nothing', () => {
  const g = globalThis as unknown as { localStorage: { setItem: (k: string, v: string) => void } };
  g.localStorage.setItem('kaamsolv-analytics', 'denied');
  try {
    visit('/about');
    a.syncCleanLocation();
    assert.deepEqual(calls, []);
  } finally {
    g.localStorage.setItem('kaamsolv-analytics', 'granted');
  }
});

test('a Word download is reported as "docx" (not "other"), without its file name', () => {
  visit('/pdf-to-word');
  a.trackFileDownload('Priya salary offer.docx');
  const ev = events()[0];
  assert.equal(ev.name, 'file_download');
  assert.equal(ev.params.file_ext, 'docx');
  assert.equal(ev.params.tool_name, 'pdf-to-word');
  assert.ok(!wire().includes('Priya'));
});
