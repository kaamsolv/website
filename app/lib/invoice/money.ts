import type { CurrencyCode } from './types';

/**
 * Currency formatting per code. INR uses Indian grouping (₹1,25,000.00).
 * AED is shown as the code ("AED 1,250.00"): its Arabic symbol isn't in the
 * PDF font and reads ambiguously to many clients.
 */
const FORMATTERS: Record<CurrencyCode, Intl.NumberFormat> = {
  INR: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  EUR: new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }),
  GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
  AED: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'AED', currencyDisplay: 'code' }),
};

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  INR: 'INR — Indian rupee (₹)',
  USD: 'USD — US dollar ($)',
  EUR: 'EUR — Euro (€)',
  GBP: 'GBP — British pound (£)',
  AED: 'AED — UAE dirham',
};

/** Format an amount; non-breaking spaces become plain ones so PDFs and tests match. */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  return FORMATTERS[currency].format(amount).replace(/ /g, ' ');
}

/** Short symbol for compact labels ("Flat ₹"). */
export function currencySymbol(currency: CurrencyCode): string {
  return { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED' }[currency];
}
