/**
 * Abuse reports — what a report may contain and how it's validated.
 *
 * Framework-free, shared by the form (reason options) and `POST /api/report`.
 * Everything here treats input as hostile: it is length-capped, stripped of
 * control characters, and never echoed back or rendered as HTML. Reports are
 * read by operators in a terminal (npm run link:reports), so ANSI/control
 * sequences are removed too.
 */

import { isReservedCode } from './reserved-routes.ts';
import { isValidShortCodeShape } from './short-code.ts';

export const REPORT_REASONS = ['phishing', 'malware', 'spam', 'illegal', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  phishing: 'Phishing or a scam',
  malware: 'Malware or a harmful download',
  spam: 'Spam',
  illegal: 'Illegal content',
  other: 'Something else',
};

export const MAX_REPORT_DETAILS = 500;
const MAX_LINK_INPUT = 300;

/**
 * The short code from what someone pasted: `https://kaamkit.com/abc1234`,
 * `kaamkit.com/abc1234`, or just `abc1234`. A URL must be on one of
 * `allowedHosts` — otherwise `bit.ly/abc1234` would be mistaken for ours.
 */
export function extractShortCode(input: string, allowedHosts: readonly string[]): string | null {
  const value = input.trim();
  if (!value || value.length > MAX_LINK_INPUT) return null;

  let code = value;
  if (value.includes('/') || value.includes('.')) {
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return null;
    }
    const hosts = allowedHosts.map((h) => h.toLowerCase());
    if (!hosts.includes(url.host.toLowerCase())) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
    code = segments[0];
  }
  return isValidShortCodeShape(code) && !isReservedCode(code) ? code : null;
}

/** Trim, drop control characters (keeping newlines), cap the length. */
export function sanitizeDetails(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    // C0 controls except \n, DEL, and C1 controls (includes the ESC of ANSI sequences).
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_REPORT_DETAILS);
  return cleaned || null;
}

export type ParsedReport =
  | { ok: true; shortCode: string; reason: ReportReason; details: string | null }
  | { ok: false; field: 'link' | 'reason'; message: string };

export function parseReportInput(body: unknown, allowedHosts: readonly string[]): ParsedReport {
  const b = (body ?? {}) as { link?: unknown; reason?: unknown; details?: unknown };

  const shortCode = typeof b.link === 'string' ? extractShortCode(b.link, allowedHosts) : null;
  if (!shortCode) {
    return { ok: false, field: 'link', message: "That doesn't look like a KaamKit short link." };
  }
  if (!REPORT_REASONS.includes(b.reason as ReportReason)) {
    return { ok: false, field: 'reason', message: "Choose what's wrong with the link." };
  }
  return { ok: true, shortCode, reason: b.reason as ReportReason, details: sanitizeDetails(b.details) };
}
