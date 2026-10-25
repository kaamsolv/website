/**
 * The checks every tracked-QR destination goes through — on Save and on
 * Duplicate alike, so a copy is screened as freshly as a new code. The
 * destination is always worked out here from the saved payload, never taken
 * from a request: validation → other-shortener refusal → Google Web Risk
 * (fails open, like the URL Shortener).
 */

import { checkDestinationPolicy } from '../destination-policy';
import { canonicalPayload } from './encode';
import { screenUrl } from '../url-reputation';
import { messageForReason, validateDestinationUrl } from '../url-validation';
import type { QrPayload } from './types';

export type DestinationCheck =
  | { ok: true; destination: string; screenedAt: Date | null }
  | { ok: false; error: 'invalid_url' | 'blocked_url'; message: string };

export async function checkTrackedDestination(payload: QrPayload, logTag: string): Promise<DestinationCheck> {
  const canonical = canonicalPayload(payload);
  if (!canonical.ok) return { ok: false, error: 'invalid_url', message: canonical.message };
  const validated = validateDestinationUrl(canonical.text);
  if (!validated.ok) return { ok: false, error: 'invalid_url', message: messageForReason(validated.reason) };
  if (!checkDestinationPolicy(validated.hostname).ok) {
    return { ok: false, error: 'blocked_url', message: 'That’s a link from another shortener. Use the full destination link instead.' };
  }
  const screen = await screenUrl(validated.normalized, { apiKey: process.env.WEB_RISK_API_KEY });
  if (screen.status === 'unsafe') {
    console.warn(`[${logTag}] blocked by Web Risk: host=${validated.hostname} threats=${screen.threatTypes.join(',')}`);
    return { ok: false, error: 'blocked_url', message: 'We can’t track this link — it’s been flagged as potentially harmful.' };
  }
  if (screen.status === 'unavailable') console.warn(`[${logTag}] not screened (${screen.reason}): host=${validated.hostname} — allowed`);
  return { ok: true, destination: validated.normalized, screenedAt: screen.status === 'safe' ? new Date() : null };
}
