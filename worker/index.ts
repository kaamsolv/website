/**
 * The Worker entry (wrangler.jsonc `main`). It is OpenNext's own worker, unchanged, plus one thing it doesn't
 * have: a scheduled trigger that retries the invoice outbox (docs/products/billing.md).
 *
 * The trigger doesn't run application code itself. It sends the Worker's own `/api/billing/drain` route a request
 * carrying CRON_SECRET, so the drain runs through the normal app path with the normal database code. Without
 * CRON_SECRET set, the route answers 503 and nothing happens; the first attempt after each payment is made by the
 * webhook, so the schedule is only the safety net for retries.
 */

// @ts-ignore: resolved by `opennextjs-cloudflare build`, which writes .open-next/worker.js
import openNext from '../.open-next/worker.js';
// @ts-ignore: same
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js';

type Env = { CRON_SECRET?: string } & Record<string, unknown>;
type Ctx = { waitUntil(p: Promise<unknown>): void };

export default {
  fetch: (request: Request, env: Env, ctx: Ctx) => openNext.fetch(request, env, ctx),
  scheduled(_controller: unknown, env: Env, ctx: Ctx) {
    const request = new Request('https://kaamsolv.com/api/billing/drain', { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET ?? '' } });
    ctx.waitUntil(openNext.fetch(request, env, ctx));
  },
};
