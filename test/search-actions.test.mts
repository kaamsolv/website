/**
 * The search box understands how people say what they want. Every live tool has an action-first phrase, the empty-state
 * suggestions are real live tools, and everyday phrasings land on the right tool first.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIVE_TOOLS, searchTools, TOOLS } from '../app/lib/catalogue.ts';
import { SEARCH_FILLER, SUGGESTED_TASKS, TOOL_ACTIONS } from '../app/lib/search-actions.ts';

test('every live tool has an action phrase (so a new tool cannot ship without one), and no phrase is orphaned', () => {
  for (const t of LIVE_TOOLS) assert.ok(TOOL_ACTIONS[t.slug]?.action, `${t.slug} needs an action in app/lib/search-actions.ts`);
  for (const slug of Object.keys(TOOL_ACTIONS)) assert.ok(TOOLS.some((t) => t.slug === slug), `${slug} is not in the catalogue`);
  const phrases = Object.values(TOOL_ACTIONS).map((a) => a.action.toLowerCase());
  assert.equal(new Set(phrases).size, phrases.length, 'action phrases are unique');
  for (const a of Object.values(TOOL_ACTIONS)) assert.match(a.action, /^[A-Z]/, `${a.action} starts a sentence`);
});

test('the empty-state suggestions are six real, live tools with actions', () => {
  assert.equal(SUGGESTED_TASKS.length, 6);
  assert.equal(new Set(SUGGESTED_TASKS).size, 6);
  for (const slug of SUGGESTED_TASKS) {
    const t = TOOLS.find((x) => x.slug === slug);
    assert.ok(t && t.status === 'live', slug);
    assert.ok(TOOL_ACTIONS[slug], slug);
  }
});

const first = (q: string) => searchTools(q)[0]?.slug;

test('everyday task phrases land on the right tool first', () => {
  const cases: [string, string][] = [
    ['make an invoice', 'invoice-generator'],
    ['i want to make an invoice', 'invoice-generator'],
    ['create invoice', 'invoice-generator'],
    ['bill a client', 'invoice-generator'],
    ['make a qr code', 'qr-code-generator'],
    ['wifi qr', 'qr-code-generator'],
    ['make coupon codes', 'coupon-code-generator'],
    ['i need discount codes for my sale', 'coupon-code-generator'],
    ['promo code generator', 'coupon-code-generator'],
    ['shorten a link', 'url-shortener'],
    ['convert heic to jpg', 'heic-to-jpg'],
    ['iphone photo to jpg', 'heic-to-jpg'],
    ['make a pdf smaller', 'compress-pdf'],
    ['shrink a pdf', 'compress-pdf'],
    ['combine pdfs', 'merge-pdf'],
    ['put a password on a pdf', 'protect-pdf'],
    ['turn photos into a pdf', 'jpg-to-pdf'],
    ['photo under 50kb', 'resize-image-in-kb'],
    ['write an amount in words', 'indian-number-to-words'],
    ['calculate gst', 'gst-calculator'],
    ['ctc to in hand', 'salary-calculator'],
    ['split a bill', 'split-bill-calculator'],
  ];
  for (const [q, slug] of cases) assert.equal(first(q), slug, `"${q}"`);
});

test('the old ways of searching still work: tool names, short names and keywords', () => {
  const cases: [string, string][] = [
    ['gst', 'gst-calculator'],
    ['emi', 'emi-calculator'],
    ['pdf to word', 'pdf-to-word'],
    ['heic', 'heic-to-jpg'],
    ['invoice', 'invoice-generator'],
    ['qr', 'qr-code-generator'],
    ['word counter', 'word-counter'],
    ['lorem', 'lorem-ipsum-generator'],
  ];
  for (const [q, slug] of cases) assert.equal(first(q), slug, `"${q}"`);
  assert.deepEqual(searchTools(''), []);
  assert.deepEqual(searchTools('zzzzqq'), []);
});

test('filler words are ignored, but a query made only of filler still returns something sensible instead of crashing', () => {
  assert.ok(SEARCH_FILLER.has('want') && SEARCH_FILLER.has('to'));
  assert.doesNotThrow(() => searchTools('to'));
  assert.doesNotThrow(() => searchTools('i want to'));
});
