/**
 * Tracked (dynamic) QR codes — the framework-free rules (docs/products/qr-tracking.md).
 *
 * A tracked QR encodes `kaamsolv.com/{code}`, a short link the user owns;
 * scans are that link's clicks. Only QR types whose content is an https link
 * can work this way: URL, WhatsApp (https://wa.me/…), Social and File. Location
 * is a `geo:` URI and the rest are not web links, so a phone reads them
 * directly — there is nothing to redirect.
 */

import {
  DEFAULT_QR_DESIGN,
  MIN_QUIET_ZONE,
  isEyeShape,
  isFrameId,
  isModuleShape,
  isPresetId,
  type QrDesign,
} from './design.ts';
import { QR_EC_LEVELS, SOCIAL_PLATFORMS, type QrKind, type QrPayload } from './types.ts';

export const TRACKABLE_KINDS = ['url', 'whatsapp', 'social', 'file'] as const;
export type TrackableKind = (typeof TRACKABLE_KINDS)[number];

export const isTrackableKind = (kind: unknown): kind is TrackableKind =>
  typeof kind === 'string' && (TRACKABLE_KINDS as readonly string[]).includes(kind);

export const canTrack = (kind: QrKind): boolean => isTrackableKind(kind);

export const KIND_LABELS: Record<TrackableKind, string> = { url: 'Website', whatsapp: 'WhatsApp', social: 'Social profile', file: 'File link' };

/** Anti-abuse ceiling per account for every plan. Not a plan limit, never shown unless hit. */
export const QR_HARD_CAP = 2000;

export const QR_NAME_MAX = 80;

/** A name for the list: trimmed, one line, no control characters, 1–80 characters. Null if unusable. */
export function cleanQrName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const name = input.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= QR_NAME_MAX ? name : null;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * The design as it is saved: only known options, and **no logo** (a logo is up
 * to 500 KB and the QR's content is the same without it). Anything unreadable
 * falls back to the defaults, so a tampered request can't store arbitrary data.
 */
export function designForSaving(input: unknown): QrDesign {
  const r = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const colors = r.colors && typeof r.colors === 'object' ? (r.colors as Record<string, unknown>) : {};
  const modules = r.modules && typeof r.modules === 'object' ? (r.modules as Record<string, unknown>) : {};
  const eyes = r.eyes && typeof r.eyes === 'object' ? (r.eyes as Record<string, unknown>) : {};
  const frame = r.frame && typeof r.frame === 'object' ? (r.frame as Record<string, unknown>) : {};
  const d = DEFAULT_QR_DESIGN;
  const cta = typeof frame.ctaText === 'string' ? frame.ctaText.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 24) : '';
  const quiet = Number(r.quietZoneModules);
  return {
    ...(typeof r.presetId === 'string' && isPresetId(r.presetId) ? { presetId: r.presetId } : {}),
    colors: {
      fg: typeof colors.fg === 'string' && HEX.test(colors.fg) ? colors.fg.toUpperCase() : d.colors.fg,
      bg: typeof colors.bg === 'string' && HEX.test(colors.bg) ? colors.bg.toUpperCase() : d.colors.bg,
      transparent: colors.transparent === true,
    },
    modules: { shape: typeof modules.shape === 'string' && isModuleShape(modules.shape) ? modules.shape : d.modules.shape },
    eyes: { shape: typeof eyes.shape === 'string' && isEyeShape(eyes.shape) ? eyes.shape : d.eyes.shape },
    frame: { id: typeof frame.id === 'string' && isFrameId(frame.id) ? frame.id : d.frame.id, ...(cta ? { ctaText: cta } : {}) },
    errorCorrection: (QR_EC_LEVELS as readonly string[]).includes(r.errorCorrection as string) ? (r.errorCorrection as QrDesign['errorCorrection']) : d.errorCorrection,
    quietZoneModules: Number.isFinite(quiet) ? Math.min(10, Math.max(MIN_QUIET_ZONE, Math.round(quiet))) : d.quietZoneModules,
  };
}

/** Scan charts default to India's day boundaries; a visitor's own zone is used when it is a real IANA zone. */
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

export function validTimeZone(input: unknown): string {
  if (typeof input !== 'string' || input.length > 64 || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(input)) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en', { timeZone: input });
    return input;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Days shown on a scan chart. */
export const CHART_DAYS = 30;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * The payload as saved: only the fields of the four trackable types, nothing
 * else a client might send. Null when it isn't one of them. (The destination is
 * always worked out again on the server from this — never taken from the request.)
 */
export function cleanTrackablePayload(input: unknown): Extract<QrPayload, { kind: TrackableKind }> | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  switch (r.kind) {
    case 'url':
      return { kind: 'url', url: str(r.url, 2100) };
    case 'whatsapp':
      return { kind: 'whatsapp', phone: str(r.phone, 40), message: str(r.message, 1200) };
    case 'social':
      return (SOCIAL_PLATFORMS as readonly string[]).includes(r.platform as string)
        ? { kind: 'social', platform: r.platform as (typeof SOCIAL_PLATFORMS)[number], url: str(r.url, 2100) }
        : null;
    case 'file':
      return { kind: 'file', url: str(r.url, 2100), label: str(r.label, 120) };
    default:
      return null;
  }
}
