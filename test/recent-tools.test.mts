/**
 * Recent and most-used tools (app/lib/recent-tools.ts): what is read back from a browser is always safe, only live catalogue
 * tools are ever kept, "uses" count separate visits, the lists are ordered as promised, wording by calendar day is right across
 * midnight, and blocked or broken storage never throws.
 */

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import vm from 'node:vm';
import {
  BAR_CLOSED_KEY,
  BAR_EVENT,
  clearRecent,
  isLiveSlug,
  MAX_ENTRIES,
  mostUsedList,
  noteToolUse,
  parseRecent,
  readBarClosed,
  RECENT_BAR_SCRIPT,
  setBarClosed,
  showsRecentBar,
  subscribeBar,
  readRaw,
  RECENT_EVENT,
  RECENT_KEY,
  recentList,
  recordUse,
  SAME_USE_MS,
  serializeRecent,
  subscribeRecent,
  toolForPath,
  usesText,
  whenText,
  type RecentEntry,
} from '../app/lib/recent-tools.ts';

const all = () => true;
const e = (slug: string, last: number, uses = 1): RecentEntry => ({ slug, last, uses });
const MIN = 60_000;
const DAY = 86_400_000;

test('only live catalogue tools count: live yes, planned and unknown no', () => {
  assert.equal(isLiveSlug('merge-pdf'), true);
  assert.equal(isLiveSlug('coupon-code-generator'), true);
  assert.equal(isLiveSlug('random-number-generator'), false); // planned
  assert.equal(isLiveSlug('not-a-tool'), false);
  assert.equal(isLiveSlug(''), false);
});

test('reading what a browser stored is always safe', () => {
  for (const bad of [null, '', 'not json', '{', '[]', '{"v":2,"tools":[]}', '{"v":1}', '{"v":1,"tools":"x"}', '{"v":1,"tools":{}}', 'null', '5', '"merge-pdf"']) assert.deepEqual(parseRecent(bad), [], String(bad));
});

test('bad entries are dropped one by one and good ones kept, newest first', () => {
  const raw = JSON.stringify({
    v: 1,
    tools: [
      { s: 'merge-pdf', t: 1000, n: 2 },
      { s: 'random-number-generator', t: 5000, n: 9 }, // planned: never shown
      { s: 'not-a-tool', t: 5000, n: 1 },
      { s: 'merge-pdf', t: 9000, n: 7 }, // duplicate slug: the first one wins
      { s: 'split-pdf', t: 3000 }, // no count: counts as 1
      { s: 'compress-pdf', t: 'soon', n: 1 },
      { s: 'protect-pdf', t: -4, n: 1 },
      { s: 'rotate-pdf', t: Number.NaN, n: 1 },
      { s: 42, t: 100, n: 1 },
      { s: 'jpg-to-pdf', t: 2000, n: 1.5 }, // not a whole number: counts as 1
      { s: 'qr-code-generator', t: 4000, n: -3 },
      null,
      'x',
      [],
    ],
  });
  assert.deepEqual(parseRecent(raw), [e('qr-code-generator', 4000, 1), e('split-pdf', 3000, 1), e('jpg-to-pdf', 2000, 1), e('merge-pdf', 1000, 2)]);
});

test('the list is capped and the oldest are the ones dropped', () => {
  const tools = Array.from({ length: MAX_ENTRIES + 25 }, (_, i) => ({ s: `t${i}`, t: i + 1, n: 1 }));
  const list = parseRecent(JSON.stringify({ v: 1, tools }), all);
  assert.equal(list.length, MAX_ENTRIES);
  assert.equal(list[0].slug, `t${MAX_ENTRIES + 24}`);
});

test('what we write can be read back unchanged', () => {
  const list = [e('merge-pdf', 3000, 4), e('split-pdf', 2000, 1), e('qr-code-generator', 1000, 12)];
  assert.deepEqual(parseRecent(serializeRecent(list)), list);
});

test('a tool opened for the first time goes to the front with one use', () => {
  const list = recordUse([], 'merge-pdf', 1000);
  assert.deepEqual(list, [e('merge-pdf', 1000, 1)]);
  assert.deepEqual(recordUse(list, 'split-pdf', 2000), [e('split-pdf', 2000, 1), e('merge-pdf', 1000, 1)]);
});

test('opening a tool again in the same visit moves it up but does not count again; a later visit does', () => {
  const base = [e('split-pdf', 5000, 1), e('merge-pdf', 1000, 2)];
  const soon = recordUse(base, 'merge-pdf', 1000 + 5 * MIN);
  assert.deepEqual(soon, [e('merge-pdf', 1000 + 5 * MIN, 2), e('split-pdf', 5000, 1)]);
  const later = recordUse(base, 'merge-pdf', 1000 + SAME_USE_MS);
  assert.equal(later[0].uses, 3);
  assert.equal(recordUse(base, 'merge-pdf', 1000 + SAME_USE_MS - 1)[0].uses, 2);
});

test('recording never grows past the cap and never mutates the old list', () => {
  const full = Array.from({ length: MAX_ENTRIES }, (_, i) => e(`t${i}`, 1000 - i));
  const copy = JSON.stringify(full);
  const next = recordUse(full, 'merge-pdf', 5000);
  assert.equal(next.length, MAX_ENTRIES);
  assert.equal(next[0].slug, 'merge-pdf');
  assert.equal(next.some((x) => x.slug === `t${MAX_ENTRIES - 1}`), false); // the oldest fell off
  assert.equal(JSON.stringify(full), copy);
});

test('recent: newest first, limited', () => {
  const list = [e('a', 10), e('b', 40), e('c', 30), e('d', 20)];
  assert.deepEqual(recentList(list, 3).map((x) => x.slug), ['b', 'c', 'd']);
  assert.deepEqual(recentList(list, 99).length, 4);
  assert.deepEqual(recentList([], 3), []);
});

test('most used: needs 3 separate uses, most first, the more recent wins a tie, limited', () => {
  const list = [e('a', 10, 2), e('b', 20, 3), e('c', 30, 9), e('d', 40, 3), e('e', 5, 1)];
  assert.deepEqual(mostUsedList(list, 4).map((x) => x.slug), ['c', 'd', 'b']);
  assert.deepEqual(mostUsedList(list, 2).map((x) => x.slug), ['c', 'd']);
  assert.deepEqual(mostUsedList([e('a', 1, 2), e('b', 2, 1)], 4), []);
});

test('wording by calendar day, on the visitor’s own clock, correct across midnight', () => {
  const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  const now = at(2026, 11, 13, 0, 10); // ten past midnight
  assert.equal(whenText(at(2026, 11, 13, 0, 5), now), 'Today');
  assert.equal(whenText(at(2026, 11, 12, 23, 50), now), 'Yesterday'); // twenty minutes ago, but a different day
  assert.equal(whenText(at(2026, 11, 10, 9), now), '3 days ago');
  assert.equal(whenText(at(2026, 11, 6, 9), now), 'Last week');
  assert.equal(whenText(at(2026, 10, 30, 9), now), '2 weeks ago');
  assert.equal(whenText(at(2026, 9, 1, 9), now), 'A while ago');
  assert.equal(whenText(at(2026, 11, 14, 9), now), 'Today'); // a clock set back never says "tomorrow"
  assert.equal(usesText(1), 'Used once');
  assert.equal(usesText(7), 'Used 7 times');
});

test('the signed-in workspace: invoice and QR pages count as using those tools, and nothing else does', () => {
  assert.equal(toolForPath('/app/invoices'), 'invoice-generator');
  assert.equal(toolForPath('/app/invoices/editor'), 'invoice-generator');
  assert.equal(toolForPath('/app/qr'), 'qr-code-generator');
  assert.equal(toolForPath('/app/qr/new'), 'qr-code-generator');
  assert.equal(toolForPath('/app/qrx'), null);
  assert.equal(toolForPath('/app/invoicesX'), null);
  assert.equal(toolForPath('/app/products/qr'), null);
  assert.equal(toolForPath('/app/billing'), null);
  assert.equal(toolForPath('/qr-code-generator'), null);
});

// ── the browser side, against a stand-in window ─────────────────────────────────────────────────────────────────────
const realWindow = (globalThis as { window?: unknown }).window;
afterEach(() => {
  if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = realWindow;
});

function fakeStorage(data: Map<string, string>, opts: { blocked?: boolean; failWrites?: boolean }) {
  return {
    getItem: (k: string) => {
      if (opts.blocked) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.blocked || opts.failWrites) throw new Error('quota');
      data.set(k, v);
    },
    removeItem: (k: string) => {
      if (opts.blocked) throw new Error('blocked');
      data.delete(k);
    },
  };
}

function fakeWindow(opts: { blocked?: boolean; failWrites?: boolean } = {}) {
  const data = new Map<string, string>();
  const session = new Map<string, string>();
  const win = Object.assign(new EventTarget(), { localStorage: fakeStorage(data, opts), sessionStorage: fakeStorage(session, opts) });
  (globalThis as { window?: unknown }).window = win;
  return { win, data, session };
}

test('noteToolUse writes the list, tells listeners, and ignores anything that is not a live tool', () => {
  const { win, data } = fakeWindow();
  let heard = 0;
  const off = subscribeRecent(() => heard++);
  noteToolUse('merge-pdf', 1_000_000);
  noteToolUse('random-number-generator', 2_000_000); // planned
  noteToolUse('nope', 3_000_000);
  noteToolUse('split-pdf', 1_000_000 + 20 * MIN);
  noteToolUse('merge-pdf', 1_000_000 + 40 * MIN);
  assert.equal(heard, 3);
  assert.deepEqual(parseRecent(data.get(RECENT_KEY) ?? null), [e('merge-pdf', 1_000_000 + 40 * MIN, 2), e('split-pdf', 1_000_000 + 20 * MIN, 1)]);
  assert.equal(readRaw(), data.get(RECENT_KEY));
  off();
  noteToolUse('merge-pdf', 1_000_000 + 41 * MIN);
  assert.equal(heard, 3, 'after unsubscribing nothing is heard');
  void win;
});

test('another tab changing the list is heard, and so is a clear; an unrelated storage key is not', () => {
  const { win } = fakeWindow();
  let heard = 0;
  const off = subscribeRecent(() => heard++);
  win.dispatchEvent(Object.assign(new Event('storage'), { key: 'something-else' }));
  assert.equal(heard, 0);
  win.dispatchEvent(Object.assign(new Event('storage'), { key: RECENT_KEY }));
  win.dispatchEvent(Object.assign(new Event('storage'), { key: null })); // storage.clear() in another tab
  assert.equal(heard, 2);
  noteToolUse('merge-pdf');
  clearRecent();
  assert.equal(heard, 4);
  assert.equal(readRaw(), '');
  off();
  assert.equal(RECENT_EVENT, 'kaamsolv:recent-tools');
});

test('blocked, full or missing storage never throws; the feature just stays empty', () => {
  fakeWindow({ blocked: true });
  assert.equal(readRaw(), '');
  assert.doesNotThrow(() => noteToolUse('merge-pdf'));
  assert.doesNotThrow(() => clearRecent());
  fakeWindow({ failWrites: true });
  assert.doesNotThrow(() => noteToolUse('merge-pdf'));
  assert.equal(readRaw(), '');
  delete (globalThis as { window?: unknown }).window; // as on a server
  assert.equal(readRaw(), '');
  assert.doesNotThrow(() => noteToolUse('merge-pdf'));
  assert.doesNotThrow(() => clearRecent());
});

test('a corrupted stored value is replaced cleanly on the next use', () => {
  const { data } = fakeWindow();
  data.set(RECENT_KEY, '{{{{ not json');
  noteToolUse('merge-pdf', 5000);
  assert.deepEqual(parseRecent(data.get(RECENT_KEY) ?? null), [e('merge-pdf', 5000, 1)]);
});

// ── the bar under the header ────────────────────────────────────────────────────────────────────────────────────────

test('the bar shows only where people choose a tool: the home page and /tools', () => {
  assert.equal(showsRecentBar('/'), true);
  assert.equal(showsRecentBar('/tools'), true);
  for (const p of ['/tools/x', '/merge-pdf', '/coupon-code-generator', '/qr-code-generator', '/app', '/app/invoices', '/login', '/privacy', '/about', '/pdf-tools', '']) assert.equal(showsRecentBar(p), false, p);
});

test('"hidden for now" is remembered for the tab, can be undone, tells listeners, and survives blocked storage', () => {
  const { session } = fakeWindow();
  let heard = 0;
  const off = subscribeBar(() => heard++);
  assert.equal(readBarClosed(), false);
  setBarClosed(true);
  assert.equal(readBarClosed(), true);
  assert.equal(session.get(BAR_CLOSED_KEY), '1');
  setBarClosed(false);
  assert.equal(readBarClosed(), false);
  assert.equal(session.has(BAR_CLOSED_KEY), false);
  assert.equal(heard, 2);
  off();
  setBarClosed(true);
  assert.equal(heard, 2);
  fakeWindow({ blocked: true });
  assert.equal(readBarClosed(), false);
  assert.doesNotThrow(() => setBarClosed(true));
  delete (globalThis as { window?: unknown }).window;
  assert.equal(readBarClosed(), false);
  assert.doesNotThrow(() => setBarClosed(false));
  assert.equal(BAR_EVENT, 'kaamsolv:recent-bar');
});

/** Runs the before-first-paint script against a stand-in page and reports whether it marked the page. */
function runScript(env: { path: string; recent?: string | null; closed?: boolean; blocked?: boolean }): boolean {
  const attrs: Record<string, string> = {};
  const boom = () => {
    throw new Error('blocked');
  };
  const ctx = {
    location: { pathname: env.path },
    localStorage: { getItem: env.blocked ? boom : (k: string) => (k === RECENT_KEY ? (env.recent ?? null) : null) },
    sessionStorage: { getItem: env.blocked ? boom : (k: string) => (k === BAR_CLOSED_KEY && env.closed ? '1' : null) },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
  };
  vm.runInNewContext(RECENT_BAR_SCRIPT, ctx);
  return attrs['data-recent'] === '1';
}

test('the pre-paint script reserves the bar’s space only when the bar is going to show', () => {
  const some = serializeRecent([e('merge-pdf', 5000, 2)]);
  assert.equal(runScript({ path: '/', recent: some }), true);
  assert.equal(runScript({ path: '/tools', recent: some }), true);
  assert.equal(runScript({ path: '/tools', recent: some, closed: true }), false, 'hidden for now, and not on the home page');
  assert.equal(runScript({ path: '/', recent: some, closed: true }), true, 'the home page always brings it back');
  assert.equal(runScript({ path: '/merge-pdf', recent: some }), false, 'never inside a tool');
  assert.equal(runScript({ path: '/app/invoices', recent: some }), false);
  for (const nothing of [null, '', 'not json', '{"v":1,"tools":[]}', '[]']) assert.equal(runScript({ path: '/', recent: nothing }), false, String(nothing));
  assert.doesNotThrow(() => runScript({ path: '/', recent: some, blocked: true }));
  assert.equal(runScript({ path: '/', recent: some, blocked: true }), false);
});
