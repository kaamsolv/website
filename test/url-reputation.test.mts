/**
 * Google Web Risk client — with a mocked fetch. No network, no API key needed.
 * The response shapes mirror docs.cloud.google.com/web-risk/docs/lookup-api:
 * `{}` for no match, `{ threat: { threatTypes, expireTime } }` for a match.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREAT_TYPES, WEB_RISK_ENDPOINT, screenUrl } from '../app/lib/url-reputation.ts';

type Call = { url: string; signal?: AbortSignal };

function mockFetch(respond: (call: Call) => Promise<{ ok: boolean; status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: { signal?: AbortSignal }) => {
    const call = { url, signal: init?.signal };
    calls.push(call);
    const r = await respond(call);
    return { ok: r.ok, status: r.status, json: async () => r.body };
  };
  return { fetch, calls };
}

const TARGET = 'https://example.com/path?q=1';

test('no API key → not_configured, and no request is made', async () => {
  const { fetch, calls } = mockFetch(async () => ({ ok: true, status: 200, body: {} }));
  assert.deepEqual(await screenUrl(TARGET, { apiKey: '', fetch }), { status: 'not_configured' });
  assert.deepEqual(await screenUrl(TARGET, { fetch }), { status: 'not_configured' });
  assert.equal(calls.length, 0);
});

test('builds the documented uris:search request', async () => {
  const { fetch, calls } = mockFetch(async () => ({ ok: true, status: 200, body: {} }));
  await screenUrl(TARGET, { apiKey: 'test-key', fetch });

  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, WEB_RISK_ENDPOINT);
  assert.equal(url.searchParams.get('uri'), TARGET); // encoded in transit, exact after decoding
  assert.deepEqual(url.searchParams.getAll('threatTypes'), [...THREAT_TYPES]);
  assert.equal(url.searchParams.get('key'), 'test-key');
});

test('an empty object means safe', async () => {
  const { fetch } = mockFetch(async () => ({ ok: true, status: 200, body: {} }));
  assert.deepEqual(await screenUrl(TARGET, { apiKey: 'k', fetch }), { status: 'safe' });
});

test('a threat match means unsafe, with the threat types', async () => {
  const { fetch } = mockFetch(async () => ({
    ok: true,
    status: 200,
    body: { threat: { threatTypes: ['SOCIAL_ENGINEERING'], expireTime: '2026-09-11T12:00:00Z' } },
  }));
  assert.deepEqual(await screenUrl(TARGET, { apiKey: 'k', fetch }), {
    status: 'unsafe',
    threatTypes: ['SOCIAL_ENGINEERING'],
  });
});

test('an HTTP error fails open as unavailable', async () => {
  for (const status of [400, 403, 429, 500, 503]) {
    const { fetch } = mockFetch(async () => ({ ok: false, status, body: { error: {} } }));
    assert.deepEqual(await screenUrl(TARGET, { apiKey: 'k', fetch }), {
      status: 'unavailable',
      reason: `http_${status}`,
    });
  }
});

test('a network error fails open as unavailable', async () => {
  const { fetch } = mockFetch(async () => {
    throw new TypeError('fetch failed');
  });
  assert.deepEqual(await screenUrl(TARGET, { apiKey: 'k', fetch }), {
    status: 'unavailable',
    reason: 'TypeError',
  });
});

test('a slow response is abandoned at the timeout and fails open', async () => {
  const { fetch } = mockFetch(
    (call) =>
      new Promise((_, reject) => {
        call.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );
  const started = Date.now();
  const result = await screenUrl(TARGET, { apiKey: 'k', fetch, timeoutMs: 50 });
  assert.deepEqual(result, { status: 'unavailable', reason: 'timeout' });
  assert.ok(Date.now() - started < 1000, 'must not wait for the slow response');
});

test('a malformed body is treated as no match, not a crash', async () => {
  const { fetch } = mockFetch(async () => ({ ok: true, status: 200, body: null }));
  assert.deepEqual(await screenUrl(TARGET, { apiKey: 'k', fetch }), { status: 'safe' });
});
