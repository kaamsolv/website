/**
 * What QR Pro adds, in the words the upgrade page uses. Every line here was checked against the code
 * (docs/products/qr-tracking.md, app/lib/qr/campaigns.ts, the entitlement seeds); the one number that
 * lives in code (the export cap) is imported, so the copy cannot drift from it.
 *
 * Deliberately absent: the anti-abuse ceilings (per-account code and campaign caps), "no ads" (there are
 * no third-party ads yet) and any pricing beyond this plan's own price, which belongs to Plans and billing.
 */

import { EXPORT_MAX_SCANS } from './campaigns.ts';

export type ProFact = { title: string; body: string; /** Smaller, secondary line. */ detail?: string };

export const QR_PRO_FACTS: ProFact[] = [
  {
    title: 'Where scans come from',
    body: 'Scans by country, device type and referring site. Country is approximate, taken from the network. We don’t record city, IP address or operating system.',
  },
  { title: '90 days of history', body: 'Free accounts see 7 and 30 days.' },
  {
    title: 'Campaigns',
    body: 'Group codes, such as everything for one event, and read one total. A campaign only groups codes. It never changes where a code goes.',
  },
  {
    title: 'CSV export',
    body: 'Download your codes or your scans as CSV.',
    detail: `One file holds up to ${EXPORT_MAX_SCANS.toLocaleString('en-IN')} scans. Pick a shorter range for more.`,
  },
  { title: 'Track more than 3 codes', body: 'Free accounts can track 3. QR Pro lifts that limit.' },
];

export const QR_FREE_STRIP =
  'Make and download QR codes with no account, and track 3 codes with scan counts, a 7 and 30 day chart and your top codes.';

export const QR_SCAN_NOTE = 'Scans count people, not bots or unique visitors. Days use your time zone.';

export const QR_UNAVAILABLE = 'QR Pro subscriptions aren’t available yet.';
export const QR_STATUS_ERROR = 'We couldn’t check whether subscriptions are available. Try again in a moment.';
