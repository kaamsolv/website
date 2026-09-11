/**
 * Link expiry — the presets a creator can choose from when shortening.
 *
 * Framework-free and shared by the form (the <select> options) and the API
 * (validation + the actual expiry time), so the two can't drift apart.
 *
 * Presets rather than a free-form date: nothing to parse, no timezone
 * ambiguity, and the server — not the browser — decides the timestamp.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never', durationMs: null },
  { value: '1d', label: 'After 1 day', durationMs: DAY },
  { value: '7d', label: 'After 7 days', durationMs: 7 * DAY },
  { value: '30d', label: 'After 30 days', durationMs: 30 * DAY },
] as const;

export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]['value'];

export const DEFAULT_EXPIRY: ExpiryOption = 'never';

/**
 * Validate an untrusted `expiresIn` value from a request body.
 * Missing → the default ("never"), so older clients keep working.
 * Anything not in the preset list → null (the caller rejects the request).
 */
export function parseExpiryOption(value: unknown): ExpiryOption | null {
  if (value === undefined || value === null) return DEFAULT_EXPIRY;
  return EXPIRY_OPTIONS.find((o) => o.value === value)?.value ?? null;
}

/** The absolute expiry for a preset, or null for "never". */
export function expiresAtFor(option: ExpiryOption, now: number = Date.now()): Date | null {
  const preset = EXPIRY_OPTIONS.find((o) => o.value === option);
  return preset?.durationMs == null ? null : new Date(now + preset.durationMs);
}
