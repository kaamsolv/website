/**
 * GET /api/fx — rupees per USD / EUR / GBP / AED, from Frankfurter (Pro:
 * invoice_fx_rates). Fetched here, on the server, so the visitor's browser
 * never calls a third party; kept for six hours; fails soft (the editor just
 * hides the line). Answer: { ok, rates: { USD: { rate, date }, … } }.
 */

import { entitlementsFrom } from '@/app/lib/entitlements';
import { FX_CURRENCIES, readFrankfurter, type InrRates } from '@/app/lib/invoice/fx';
import { fail, json, requireUser } from '@/app/lib/api-response';
import { getDb } from '@/db/client';
import { getEntitlements } from '@/db/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; rates: InrRates } | null = null;

async function fetchRates(): Promise<InrRates> {
  const rates: InrRates = {};
  await Promise.all(
    FX_CURRENCIES.map(async (base) => {
      try {
        const res = await fetch(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=INR`, {
          signal: AbortSignal.timeout(4000),
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const rate = readFrankfurter(await res.json(), base);
        if (rate) rates[base] = rate;
      } catch {
        // One currency failing leaves it out; the rest still show.
      }
    }),
  );
  return rates;
}

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (!entitlementsFrom(await getEntitlements(await getDb(), user.id)).can('invoice_fx_rates')) {
    return fail(403, 'not_allowed', 'Currency rates are part of Pro.');
  }
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rates = await fetchRates();
    // Only remember a result that has something in it, so a bad minute isn't kept for six hours.
    if (Object.keys(rates).length) cache = { at: Date.now(), rates };
    else if (!cache) return fail(502, 'unavailable', 'Rates aren’t available right now.');
  }
  return json({ ok: true, rates: cache!.rates }, 200);
}
