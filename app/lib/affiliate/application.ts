/**
 * Affiliate Manager, Phase 2 — the registration rules (docs/products/affiliate-manager.md). Framework-free.
 *
 * An affiliate is a signed-in KaamSolv account with a profile. They apply to one merchant's programme; the
 * merchant approves or rejects by hand (there is no auto-approval). One application at a time per programme.
 */

export const AFFILIATE_LIMITS = { displayName: 80, website: 200, message: 500, note: 300, country: 60 } as const;

/** Who the applicant is, in the words a merchant uses. Optional on the form; the stored value is the key. */
export const AFFILIATE_CATEGORIES = [
  { key: 'teacher', label: 'Teacher or educator' },
  { key: 'parenting_creator', label: 'Parenting creator' },
  { key: 'influencer', label: 'Influencer' },
  { key: 'blogger', label: 'Blogger' },
  { key: 'youtuber', label: 'YouTuber' },
  { key: 'community_admin', label: 'Community administrator' },
  { key: 'referral_partner', label: 'Referral partner' },
  { key: 'other', label: 'Other' },
] as const;
export const AFFILIATE_CHANNELS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'whatsapp', label: 'WhatsApp groups' },
  { key: 'website', label: 'Website or blog' },
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'in_person', label: 'In person or events' },
  { key: 'other', label: 'Other' },
] as const;
export const CATEGORY_KEYS = AFFILIATE_CATEGORIES.map((c) => c.key) as readonly string[];
export const CHANNEL_KEYS = AFFILIATE_CHANNELS.map((c) => c.key) as readonly string[];
export const categoryLabel = (key: string) => AFFILIATE_CATEGORIES.find((c) => c.key === key)?.label ?? '';
export const channelLabel = (key: string) => AFFILIATE_CHANNELS.find((c) => c.key === key)?.label ?? '';

/** A rejected affiliate may apply again after this many days. */
export const REAPPLY_COOLDOWN_DAYS = 7;

/** A form submitted faster than this was not filled in by a person. Client-supplied, so a speed bump, not a lock. */
export const MIN_FILL_MS = 3_000;
/** Older than this and the timestamp is ignored as stale or forged. */
export const MAX_FILL_MS = 24 * 60 * 60 * 1000;

export const APPLICATION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const AFFILIATE_EVENT_ACTIONS = [
  'applied',
  'withdrawn',
  'approved',
  'rejected',
  'suspended',
  'reinstated',
  'programme_opened',
  'programme_closed',
  'portal_created',
  'portal_edited',
  'merchant_suspended',
  'merchant_reinstated',
  'link_created',
  'destination_saved',
] as const;
export type AffiliateEventAction = (typeof AFFILIATE_EVENT_ACTIONS)[number];

export const MEMBERSHIP_STATUSES = ['active', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PROGRAMME_STATUSES = ['open', 'closed'] as const;
export type ProgrammeStatus = (typeof PROGRAMME_STATUSES)[number];

/** What the register page needs to know about this visitor and this programme. */
export type RegistrationState = 'open' | 'closed' | 'own_programme' | 'pending' | 'approved' | 'suspended' | 'cooldown';

export type ApplyBlock = 'not_found' | 'closed' | 'own_programme' | 'already_member' | 'suspended' | 'already_pending' | 'cooldown';

export const APPLY_BLOCK_MESSAGES: Record<ApplyBlock, string> = {
  not_found: 'We couldn’t find that programme.',
  closed: 'This programme isn’t taking applications right now.',
  own_programme: 'This is your own programme.',
  already_member: 'You’re already part of this programme.',
  suspended: 'Your access to this programme is paused by the merchant.',
  already_pending: 'You’ve already applied. The merchant will review it.',
  cooldown: `That application wasn’t approved. You can apply again after ${REAPPLY_COOLDOWN_DAYS} days.`,
};

const oneLine = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '');
const multiLine = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim() : '');

/** A website the affiliate promotes on: http(s) only, normalised, or '' if blank. null if unusable. */
export function cleanWebsite(input: unknown): string | null {
  const raw = oneLine(input);
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') || u.username || u.password) return null;
    const out = u.toString();
    return out.length <= AFFILIATE_LIMITS.website ? out : null;
  } catch {
    return null;
  }
}

export type ApplicationInput = { displayName: string; website: string; message: string; category: string; channel: string; country: string };
/** The form field an error belongs to, so the page can mark it and put the message beside it. */
export type ApplicationField = 'displayName' | 'website' | 'message' | 'category' | 'channel' | 'country';
export type ApplicationCheck = { ok: true; value: ApplicationInput } | { ok: false; error: string; message: string; field: ApplicationField };

/** Says what is wrong with the website box in plain words, including the common slip of typing an email address. */
function websiteMessage(raw: unknown): string {
  const text = oneLine(raw);
  if (text.includes('@') && !text.includes('/')) {
    return 'That looks like an email address. Add the link to your page instead, like instagram.com/yourname, or leave this blank.';
  }
  if (text.length > AFFILIATE_LIMITS.website) return `That link is too long. Keep it under ${AFFILIATE_LIMITS.website} characters, or leave this blank.`;
  return 'That doesn’t look like a web address. Try something like instagram.com/yourname, or leave this blank.';
}

export function cleanApplication(body: unknown): ApplicationCheck {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const displayName = oneLine(b.displayName);
  if (!displayName) return { ok: false, error: 'name_required', message: 'Add the name you go by.', field: 'displayName' };
  if (displayName.length > AFFILIATE_LIMITS.displayName) return { ok: false, error: 'name_long', message: `Keep your name under ${AFFILIATE_LIMITS.displayName} characters.`, field: 'displayName' };
  const website = cleanWebsite(b.website);
  if (website === null) return { ok: false, error: 'website_invalid', message: websiteMessage(b.website), field: 'website' };
  const message = multiLine(b.message);
  if (message.length > AFFILIATE_LIMITS.message) return { ok: false, error: 'message_long', message: `Keep your message under ${AFFILIATE_LIMITS.message} characters.`, field: 'message' };
  const category = oneLine(b.category);
  if (category && !CATEGORY_KEYS.includes(category)) return { ok: false, error: 'category_invalid', message: 'Choose one of the categories in the list, or leave it blank.', field: 'category' };
  const channel = oneLine(b.channel);
  if (channel && !CHANNEL_KEYS.includes(channel)) return { ok: false, error: 'channel_invalid', message: 'Choose one of the channels in the list, or leave it blank.', field: 'channel' };
  const country = oneLine(b.country);
  if (country.length > AFFILIATE_LIMITS.country) return { ok: false, error: 'country_long', message: `Keep the country under ${AFFILIATE_LIMITS.country} characters.`, field: 'country' };
  return { ok: true, value: { displayName, website, message, category, channel, country } };
}

/** The merchant's reason note on a decision. Optional; at most AFFILIATE_LIMITS.note characters. null if too long. */
export function cleanNote(input: unknown): string | null {
  const n = multiLine(input);
  return n.length <= AFFILIATE_LIMITS.note ? n : null;
}

export type BotCheck = { ok: true } | { ok: false; reason: 'honeypot' | 'too_fast' };

/**
 * The cheap bot checks (no external service): a hidden field a person never fills, and a minimum time between the
 * form opening and being sent. Both come from the browser, so they stop scripts that post blindly, nothing more.
 * Rate limits do the rest.
 */
export function botCheck(body: unknown, now: number = Date.now()): BotCheck {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.website2 === 'string' && b.website2.trim() !== '') return { ok: false, reason: 'honeypot' };
  const opened = Number(b.openedAt);
  // A missing or nonsense timestamp is treated like a script that skipped the form; a stale one (a tab left open for
  // a day) is let through, since rate limits cover that case.
  if (!Number.isFinite(opened)) return { ok: false, reason: 'too_fast' };
  const took = now - opened;
  // A negative time means the browser's clock is ahead of ours; that is skew, not speed, so it passes.
  if (took >= 0 && took < MIN_FILL_MS) return { ok: false, reason: 'too_fast' };
  return { ok: true };
}
