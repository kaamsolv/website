/**
 * QR campaigns (Pro: `qr_campaigns`) — the framework-free rules. A campaign
 * groups tracked QR codes so a print run can be seen as one. It never changes
 * where a code points: assigning, renaming or deleting a campaign touches only
 * `qr_codes.campaign_id`.
 */

import { isIsoDate } from '../invoice/recurring.ts';

export const CAMPAIGN_NAME_MAX = 80;
export const CAMPAIGN_DESCRIPTION_MAX = 500;
/** Anti-abuse ceiling per account for every plan. */
export const CAMPAIGN_CAP = 50;

export type CampaignInput = { name: string; description: string; startsOn: string | null; endsOn: string | null };
export type CampaignResult = { ok: true; value: CampaignInput } | { ok: false; field: 'name' | 'description' | 'startsOn' | 'endsOn'; message: string };

const oneLine = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A campaign as saved: trimmed name (1–80), description (≤ 500, line breaks kept), optional real dates with end ≥ start. */
export function cleanCampaign(input: unknown): CampaignResult {
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const name = typeof r.name === 'string' ? oneLine(r.name) : '';
  if (name.length < 1 || name.length > CAMPAIGN_NAME_MAX) {
    return { ok: false, field: 'name', message: `Give the campaign a name (up to ${CAMPAIGN_NAME_MAX} characters).` };
  }
  // eslint-disable-next-line no-control-regex
  const description = typeof r.description === 'string' ? r.description.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
  if (description.length > CAMPAIGN_DESCRIPTION_MAX) {
    return { ok: false, field: 'description', message: `Keep the description under ${CAMPAIGN_DESCRIPTION_MAX} characters.` };
  }
  const date = (v: unknown): string | null | undefined => (v === undefined || v === null || v === '' ? null : isIsoDate(v) ? v : undefined);
  const startsOn = date(r.startsOn);
  const endsOn = date(r.endsOn);
  if (startsOn === undefined) return { ok: false, field: 'startsOn', message: 'Use a start date like 2026-11-01.' };
  if (endsOn === undefined) return { ok: false, field: 'endsOn', message: 'Use an end date like 2026-11-30.' };
  if (startsOn && endsOn && endsOn < startsOn) return { ok: false, field: 'endsOn', message: 'The end date can’t be before the start.' };
  return { ok: true, value: { name, description, startsOn, endsOn } };
}

/** The scan ranges a dashboard or analytics page can show. 90 days needs `qr_breakdowns`. */
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const parseRange = (v: unknown): Range | null => {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : null;
};

/** The most scan rows one CSV export may hold; past it the request is refused, never silently cut. */
export const EXPORT_MAX_SCANS = 50_000;
