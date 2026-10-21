/**
 * Free-tier limits. 10 items fits one A4 page with two-line descriptions;
 * more items (multi-page) is the Pro `invoice_unlimited_items` entitlement.
 * Field lengths keep the free invoice on one page.
 */
export const MAX_FREE_ITEMS = 10;

export const MAX_LEN = {
  name: 80,
  email: 120,
  phone: 30,
  address: 200,
  description: 120,
  number: 30,
  taxLabel: 12,
  notes: 400,
} as const;

/** Logo: accepted types and limits (processed in the browser). */
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_PX = 400;
