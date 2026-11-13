'use client';

import { useEffect, useState } from 'react';
import { parsePlanPrice, type PlanPriceState } from './plan-price';

/**
 * One plan's price and whether it can be bought right now, from GET /api/billing/status (the same
 * call the Plans and billing page makes). `enabled` false (an account that already has the plan) makes no request.
 */
export function usePlanPrice(planKey: string, enabled = true): PlanPriceState {
  const [state, setState] = useState<PlanPriceState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    setState({ status: 'loading' });
    fetch('/api/billing/status', { credentials: 'same-origin', cache: 'no-store', signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: unknown) => setState(parsePlanPrice(body, planKey)))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== 'AbortError') setState({ status: 'error' });
      });
    return () => ctl.abort();
  }, [planKey, enabled]);

  return state;
}
