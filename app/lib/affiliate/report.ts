/**
 * Reporting a merchant's portal: what a report may contain, and how it is checked. Framework-free.
 *
 * Anyone may report, signed in or not. A report never changes the portal by itself: an operator reads it and decides
 * (npm run affiliate:reports, then npm run affiliate:merchant to suspend). The text is treated as hostile: length-capped
 * and stripped of control characters, so it is safe to print in a terminal.
 */

import { sanitizeDetails } from '../report.ts';
import { SLUG_RE } from './merchant.ts';

export const PORTAL_REPORT_REASONS = ['impersonation', 'scam', 'misleading', 'illegal', 'other'] as const;
export type PortalReportReason = (typeof PORTAL_REPORT_REASONS)[number];

export const PORTAL_REPORT_LABELS: Record<PortalReportReason, string> = {
  impersonation: 'Pretending to be another business or person',
  scam: 'A scam or a request for money or details',
  misleading: 'Misleading promises about earnings',
  illegal: 'Illegal content',
  other: 'Something else',
};

export const PORTAL_REPORT_STATUSES = ['open', 'reviewed', 'dismissed'] as const;
export const PORTAL_REPORT_DETAILS_MAX = 500;

export type PortalReportField = 'reason' | 'details';
export type ParsedPortalReport =
  | { ok: true; slug: string; reason: PortalReportReason; details: string }
  | { ok: false; field: PortalReportField | 'slug'; message: string };

export function parsePortalReport(body: unknown): ParsedPortalReport {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase().slice(0, 60) : '';
  if (!SLUG_RE.test(slug)) return { ok: false, field: 'slug', message: 'We couldn’t tell which page you mean.' };
  const reason = b.reason;
  if (typeof reason !== 'string' || !(PORTAL_REPORT_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, field: 'reason', message: 'Choose what is wrong with this page.' };
  }
  const details = b.details === undefined || b.details === null || b.details === '' ? '' : sanitizeDetails(b.details);
  if (details === null) return { ok: false, field: 'details', message: 'Those details couldn’t be read. Try shorter text.' };
  return { ok: true, slug, reason: reason as PortalReportReason, details: details.slice(0, PORTAL_REPORT_DETAILS_MAX) };
}
