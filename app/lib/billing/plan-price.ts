/**
 * Reads one plan's price out of GET /api/billing/status, for pages that sell a single plan.
 * Pure (no React, no fetch) so it can be tested. "Available" means checkout can actually be started:
 * the server says payments are configured AND the plan has an active price. Anything else is
 * "unavailable"; a response that isn't the expected shape is an "error".
 */

import { priceLabel } from './plans.ts';

export type PlanPrice = { period: 'month' | 'year'; amountPaise: number };

export type PlanPriceState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'available'; prices: PlanPrice[]; taxRate: number | null };

export function parsePlanPrice(body: unknown, planKey: string): PlanPriceState {
  if (!body || typeof body !== 'object') return { status: 'error' };
  const b = body as { ok?: unknown; configured?: unknown; taxRate?: unknown; prices?: unknown };
  if (b.ok !== true || typeof b.configured !== 'boolean' || !Array.isArray(b.prices)) return { status: 'error' };
  if (!b.configured) return { status: 'unavailable' };

  const prices: PlanPrice[] = [];
  for (const p of b.prices as { planKey?: unknown; period?: unknown; amountPaise?: unknown }[]) {
    if (p?.planKey !== planKey) continue;
    if ((p.period !== 'month' && p.period !== 'year') || typeof p.amountPaise !== 'number' || !(p.amountPaise > 0)) continue;
    prices.push({ period: p.period, amountPaise: p.amountPaise });
  }
  if (prices.length === 0) return { status: 'unavailable' };
  const taxRate = typeof b.taxRate === 'number' && Number.isFinite(b.taxRate) ? b.taxRate : null;
  return { status: 'available', prices, taxRate };
}

/** "₹99 a month or ₹990 a year", from whichever periods have a price. */
export function priceSentence(prices: PlanPrice[]): string {
  const month = prices.find((p) => p.period === 'month');
  const year = prices.find((p) => p.period === 'year');
  const parts = [month && `${priceLabel(month.amountPaise)} a month`, year && `${priceLabel(year.amountPaise)} a year`].filter(Boolean);
  return parts.join(' or ');
}
