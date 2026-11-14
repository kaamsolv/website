/**
 * Orders from a business's WooCommerce store (Affiliate Manager, Phase 3B). Framework-free (no `next/*`, no `node:*`):
 * it runs in the Worker and in plain Node tests, using only Web Crypto.
 *
 * What WooCommerce sends (checked against WooCommerce's own documentation and source, 2026-11-14):
 *   • a POST with the raw JSON of the order, the same shape as the REST API's order;
 *   • `X-WC-Webhook-Signature`: the base64 of HMAC-SHA256(secret, raw request body);
 *   • `X-WC-Webhook-Topic` (`order.created`, `order.updated`, `order.deleted`) and `X-WC-Webhook-Delivery-ID`;
 *   • money as decimal STRINGS (`"1499.00"`), refunds in `refunds[].total` as NEGATIVE strings (`"-200.00"`);
 *   • `date_modified_gmt` to the second, in UTC without an offset;
 *   • the webhook is DISABLED after 5 consecutive failed (non-2xx) deliveries.
 *
 * Rules kept here, and tested with synthetic fixtures (test/affiliate-orders.test.mts):
 *   • the signature is checked against the raw bytes BEFORE anything is parsed (`verifySignature`);
 *   • every amount is whole paise (integer arithmetic): the string is read digit by digit, never as a float;
 *   • sales = line totals after discounts, before tax and shipping, net of refunds, and never below zero;
 *   • two deliveries about one order always settle on the same row, whatever order they arrive in, including two with
 *     the same modified second (`orderVersion`: modified time, then how final the status is, then refunded, then digest).
 */

// ─── Limits ───────────────────────────────────────────────────────────────────

/** A real WooCommerce order is a few KB; this leaves room for large baskets and refuses anything else unread. */
export const ORDER_BODY_MAX = 256 * 1024;
export const ORDER_MAX_LINES = 500;
export const ORDER_MAX_COUPONS = 50;
export const ORDER_MAX_REFUNDS = 200;

export const COUPON_MIN = 3;
export const COUPON_MAX = 32;

// ─── Statuses ─────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = ['pending', 'processing', 'completed', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** How "final" a status is. Only used to break a tie between two updates stamped with the same second. */
export const STATUS_RANK: Record<OrderStatus, number> = { pending: 1, processing: 2, completed: 3, cancelled: 4, refunded: 5 };

/** Statuses whose money counts as a sale. An order that is pending or on hold has not been paid for yet. */
export const COUNTED_STATUSES: readonly OrderStatus[] = ['processing', 'completed'];

/**
 * WooCommerce status (REST shows it without the `wc-` prefix) to ours. A status we don't know (a plugin's custom one)
 * reads as pending, which never counts toward sales, so an unknown status can only under-report.
 */
export function mapStatus(woo: string): OrderStatus {
  const s = woo.trim().toLowerCase().replace(/^wc-/, '');
  if (s === 'processing') return 'processing';
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'failed' || s === 'trash') return 'cancelled';
  if (s === 'refunded') return 'refunded';
  return 'pending';
}

// ─── Coupon codes ─────────────────────────────────────────────────────────────

/** Codes are matched without regard to case or surrounding spaces (WooCommerce treats them that way too). */
export function normalizeCoupon(raw: string): string {
  return raw.normalize('NFKC').trim().toUpperCase();
}

const COUPON_SHAPE = new RegExp(`^[A-Z0-9][A-Z0-9_-]{${COUPON_MIN - 1},${COUPON_MAX - 1}}$`);

export type CouponCheck = { ok: true; value: string } | { ok: false; error: 'coupon_invalid'; message: string };

/** The code a business types against an affiliate. Blank is allowed and means "none". */
export function cleanCouponCode(input: unknown): CouponCheck {
  if (input == null) return { ok: true, value: '' };
  if (typeof input !== 'string') return { ok: false, error: 'coupon_invalid', message: 'That code couldn’t be read.' };
  const value = normalizeCoupon(input);
  if (value === '') return { ok: true, value: '' };
  if (!COUPON_SHAPE.test(value)) {
    return {
      ok: false,
      error: 'coupon_invalid',
      message: `Use ${COUPON_MIN} to ${COUPON_MAX} letters or numbers, with dashes or underscores if you need them. No spaces.`,
    };
  }
  return { ok: true, value };
}

// ─── Money, in whole paise ────────────────────────────────────────────────────

/**
 * "1499.00" to 149900. Whole digits, an optional point and at most two decimals; read as digits so no float is ever
 * involved. A leading minus is allowed (refunds). Anything else, including a third decimal, is refused, not rounded.
 */
export function parsePaise(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = /^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  const paise = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] === '-' ? -paise : paise;
}

/** Sales for one order: counted only once paid, never below zero, never more than was billed. */
export function netSalePaise(status: OrderStatus, salePaise: number, refundedPaise: number): number {
  if (!COUNTED_STATUSES.includes(status)) return 0;
  return Math.max(0, salePaise - Math.max(0, refundedPaise));
}

/** ₹1,25,000.00 for INR (Indian grouping), `USD 1,250.00` for anything else. Whole rupees drop the .00. */
export function formatPaise(paise: number, currency: string): string {
  const rupees = Math.trunc(Math.abs(paise) / 100);
  const frac = Math.abs(paise) % 100;
  const digits = String(rupees);
  const grouped =
    currency === 'INR'
      ? digits.length > 3
        ? `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${digits.slice(-3)}`
        : digits
      : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac === 0 ? grouped : `${grouped}.${String(frac).padStart(2, '0')}`;
  const sign = paise < 0 ? '-' : '';
  return currency === 'INR' ? `${sign}₹${body}` : `${sign}${currency} ${body}`;
}

// ─── Hex, base64 and SHA-256 with Web Crypto only ────────────────────────────

type Bytes = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();
const toHex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

function fromBase64(s: string): Bytes | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  try {
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// ─── The webhook secret and the signature ────────────────────────────────────

/**
 * A connection's secret is derived, not stored: HMAC-SHA256(master, `<connection id>:<version>`) in hex. Nothing secret
 * sits in the database; rotating bumps the version. `master` is the Worker secret AFFILIATE_WEBHOOK_MASTER.
 */
export async function deriveWebhookSecret(master: string, connectionId: string, version: number): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(master, 'sign'), enc.encode(`${connectionId}:${version}`));
  return toHex(sig);
}

/**
 * Is `header` the base64 HMAC-SHA256 of exactly these bytes under `secret`? Uses `crypto.subtle.verify`, which compares in
 * constant time. A missing, malformed or wrong header is simply false: nothing about why is returned.
 */
export async function verifySignature(secret: string, body: Bytes, header: string | null): Promise<boolean> {
  if (!header) return false;
  const given = fromBase64(header.trim());
  if (!given || given.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), given, body);
}

/** What WooCommerce would put in the header. Used only by tests and the signed-fixture sender. */
export async function signBody(secret: string, body: Bytes | string): Promise<string> {
  const bytes = typeof body === 'string' ? enc.encode(body) : body;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), bytes));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ─── Reading the request body, bounded ───────────────────────────────────────

/** The body's bytes, or null if it is bigger than `max` (refused from the header when it can be, else while reading). */
export async function readBoundedBody(req: Request, max = ORDER_BODY_MAX): Promise<Bytes | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

// ─── Reading an order ─────────────────────────────────────────────────────────

export type ParsedOrder = {
  externalId: string;
  number: string;
  wooStatus: string;
  status: OrderStatus;
  currency: string;
  placedAt: Date;
  modifiedAt: Date;
  /** Line totals after discounts, before tax and shipping. */
  salePaise: number;
  /** Refunded so far, never more than the order total. */
  refundedPaise: number;
  /** Distinct, normalised coupon codes on the order. */
  codes: string[];
  /** Fingerprint of everything that matters, for the last tie-break between two identical-second updates. */
  digest: string;
};

export type OrderParse = { ok: true; order: ParsedOrder } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `2026-11-14T09:30:05` (UTC, as WooCommerce writes the `_gmt` fields), with optional fraction and a trailing Z. */
export function parseGmt(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/.exec(raw.trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const d = new Date(t);
  // Date.UTC rolls 31 February over silently; a real timestamp reads back the same.
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

/**
 * Reads an order out of the JSON WooCommerce sent. Required: id, status, currency, date_created_gmt, total, line_items
 * and coupon_lines. Anything missing or malformed is refused with a reason that holds no order data.
 * `forceStatus` is for `order.deleted`: a deleted order is treated as cancelled.
 */
export async function parseOrder(payload: unknown, forceStatus?: OrderStatus): Promise<OrderParse> {
  if (!isObj(payload)) return { ok: false, reason: 'not_an_order' };

  const idRaw = payload.id;
  const externalId = typeof idRaw === 'number' && Number.isSafeInteger(idRaw) && idRaw > 0 ? String(idRaw) : typeof idRaw === 'string' && /^\d{1,18}$/.test(idRaw) ? idRaw : null;
  if (!externalId) return { ok: false, reason: 'bad_id' };

  if (typeof payload.status !== 'string' || payload.status.length === 0 || payload.status.length > 40) return { ok: false, reason: 'bad_status' };
  const wooStatus = payload.status.trim().toLowerCase();

  if (typeof payload.currency !== 'string' || !/^[A-Za-z]{3}$/.test(payload.currency)) return { ok: false, reason: 'bad_currency' };
  const currency = payload.currency.toUpperCase();

  const placedAt = parseGmt(payload.date_created_gmt);
  if (!placedAt) return { ok: false, reason: 'bad_date' };
  const modifiedAt = payload.date_modified_gmt == null ? placedAt : parseGmt(payload.date_modified_gmt);
  if (!modifiedAt) return { ok: false, reason: 'bad_date' };

  const totalPaise = parsePaise(payload.total);
  if (totalPaise === null || totalPaise < 0) return { ok: false, reason: 'bad_total' };

  if (!Array.isArray(payload.line_items) || payload.line_items.length > ORDER_MAX_LINES) return { ok: false, reason: 'bad_lines' };
  let salePaise = 0;
  for (const line of payload.line_items) {
    const t = isObj(line) ? parsePaise(line.total) : null;
    if (t === null || t < 0) return { ok: false, reason: 'bad_lines' };
    salePaise += t;
  }

  if (!Array.isArray(payload.coupon_lines) || payload.coupon_lines.length > ORDER_MAX_COUPONS) return { ok: false, reason: 'bad_coupons' };
  const codes = new Set<string>();
  for (const c of payload.coupon_lines) {
    if (!isObj(c) || typeof c.code !== 'string') return { ok: false, reason: 'bad_coupons' };
    const code = normalizeCoupon(c.code);
    if (code !== '') codes.add(code);
  }

  const refundsRaw = payload.refunds == null ? [] : payload.refunds;
  if (!Array.isArray(refundsRaw) || refundsRaw.length > ORDER_MAX_REFUNDS) return { ok: false, reason: 'bad_refunds' };
  let refunded = 0;
  for (const r of refundsRaw) {
    const t = isObj(r) ? parsePaise(r.total) : null;
    if (t === null) return { ok: false, reason: 'bad_refunds' };
    refunded += Math.abs(t); // WooCommerce writes refunds as negative amounts
  }
  const refundedPaise = Math.min(refunded, totalPaise);

  const number = typeof payload.number === 'string' && payload.number.trim() !== '' && payload.number.length <= 40 ? payload.number.trim() : externalId;
  const status = forceStatus ?? mapStatus(wooStatus);
  const sortedCodes = [...codes].sort();
  const digest = await sha256Hex(JSON.stringify([externalId, status, currency, totalPaise, salePaise, refundedPaise, sortedCodes, number]));

  return { ok: true, order: { externalId, number, wooStatus, status, currency, placedAt, modifiedAt, salePaise, refundedPaise, codes: sortedCodes, digest } };
}

/**
 * The tuple that decides which of two deliveries about one order wins: the later modified time, then the more final
 * status, then the larger refund, then the larger digest. Compared as a row in SQL (`db/affiliate-orders.ts`) so the
 * database applies exactly this rule, and the same rule here so tests can state it. Total and deterministic: two
 * different updates never tie, and one delivered twice does not beat itself.
 */
export function orderVersion(o: Pick<ParsedOrder, 'modifiedAt' | 'status' | 'refundedPaise' | 'digest'>): [number, number, number, string] {
  return [Math.floor(o.modifiedAt.getTime() / 1000), STATUS_RANK[o.status], o.refundedPaise, o.digest];
}

/** True when `a` is strictly newer than `b` under `orderVersion`. */
export function isNewer(a: ReturnType<typeof orderVersion>, b: ReturnType<typeof orderVersion>): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return (a[i] as number) > (b[i] as number);
  }
  return a[3] > b[3];
}

// ─── Wording the setup screen and the docs share ─────────────────────────────

export const WOO_TOPICS = ['Order created', 'Order updated'] as const;

/** Plain steps, in the order WooCommerce shows them. */
export const WOO_STEPS = [
  'In WordPress, open WooCommerce, then Settings, then Advanced, then Webhooks, and choose Add webhook.',
  'Name it KaamSolv. Set Status to Active and Topic to Order created. Paste the webhook address into Delivery URL and the secret into Secret. Save.',
  'Add a second webhook the same way with Topic set to Order updated.',
  'Make a coupon in WooCommerce for each affiliate, then type the same code against them on your Applications page.',
] as const;

export const WOO_DISABLE_NOTE =
  'WooCommerce switches a webhook off by itself after 5 failed deliveries in a row. If orders stop showing up, open the webhook in WooCommerce and set its Status back to Active.';

// ─── Words the screens share ──────────────────────────────────────────────────

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Not paid yet',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const ORDERS_NOTE =
  'These are orders the business’s store reported that used your coupon code. They’re recorded orders: not visitors, and not commission.';

export const SALES_NOTE =
  'Sales are what customers paid for the items, after discounts and before tax and shipping, once the order is paid, minus any refunds. An order that isn’t paid yet, or was cancelled or refunded in full, counts as nothing.';

export const COUPON_NOTE =
  'The code a customer types at checkout in your WooCommerce store. Make the same code in WooCommerce first, then type it here. An order is credited to this affiliate from the moment you add the code, and only when it is the only affiliate code on that order. A code stays with the first affiliate it is given to.';

export const STORE_NOTE =
  'Your store sends KaamSolv each order it takes. KaamSolv keeps only an order number, the amounts, the status and the date, and only for orders that used an affiliate’s coupon code. No customer names, emails, phone numbers or addresses are stored.';
