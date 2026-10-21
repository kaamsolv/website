/**
 * One invoice draft kept in this browser (localStorage) so a refresh — or a
 * trip to the sign-in page — doesn't lose it. Never sent anywhere. Every
 * access is guarded: private windows and blocked storage just mean no draft.
 */

import type { Invoice } from './types';

const KEY = 'kk.invoice.draft.v1';
/** Skip the logo in the draft if it's huge (keeps well inside storage quotas). */
const MAX_LOGO_CHARS = 280_000;

export function loadInvoiceDraft(): Invoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { invoice?: Invoice };
    return parsed.invoice && Array.isArray(parsed.invoice.items) ? parsed.invoice : null;
  } catch {
    return null;
  }
}

export function saveInvoiceDraft(invoice: Invoice): void {
  try {
    const logo = invoice.logo && invoice.logo.length <= MAX_LOGO_CHARS ? invoice.logo : null;
    localStorage.setItem(KEY, JSON.stringify({ invoice: { ...invoice, logo }, at: Date.now() }));
  } catch {
    // Quota or blocked storage: the draft just isn't kept.
  }
}

export function clearInvoiceDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
