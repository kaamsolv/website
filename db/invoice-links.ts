/**
 * Private invoice links (billing M2): make one, find the live one, revoke, and open one by its token.
 * Framework-free; takes an explicit `db`. Token derivation and hashing: app/lib/links/token.ts.
 *
 * A link is a bearer link: anyone who has the URL can open that one invoice, until it is revoked or expires.
 * It opens one invoice and nothing else, carries no account or customer id, and `resolveLink` returns only
 * what the invoice page shows.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { deriveToken, hashToken, isTokenShape } from '../app/lib/links/token.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';
import type { Db } from './links.ts';
import { invoiceLinks, invoices } from './schema.ts';

export type LinkPurpose = 'billing' | 'share';

export type MadeLink = { id: string; token: string };

/** A new link for an invoice the caller has already proved they own. */
export async function createLink(db: Db, secret: string, input: { invoiceId: string; userId: string; purpose: LinkPurpose; expiresAt?: Date | null }): Promise<MadeLink> {
  const id = crypto.randomUUID();
  const token = await deriveToken(secret, id);
  await db.insert(invoiceLinks).values({
    id,
    invoiceId: input.invoiceId,
    userId: input.userId,
    tokenHash: await hashToken(token),
    purpose: input.purpose,
    expiresAt: input.expiresAt ?? null,
  });
  return { id, token };
}

const live = sql`${invoiceLinks.revokedAt} is null and (${invoiceLinks.expiresAt} is null or ${invoiceLinks.expiresAt} > now())`;

/** The newest live link of this purpose for the invoice, with its token rebuilt; or a new one. */
export async function ensureLink(db: Db, secret: string, input: { invoiceId: string; userId: string; purpose: LinkPurpose }): Promise<MadeLink> {
  const [existing] = await db
    .select({ id: invoiceLinks.id })
    .from(invoiceLinks)
    .where(and(eq(invoiceLinks.invoiceId, input.invoiceId), eq(invoiceLinks.userId, input.userId), eq(invoiceLinks.purpose, input.purpose), live))
    .orderBy(desc(invoiceLinks.createdAt))
    .limit(1);
  if (existing) return { id: existing.id, token: await deriveToken(secret, existing.id) };
  return createLink(db, secret, input);
}

/** The invoice's live links, newest first (for the Share panel). */
export async function liveLinks(db: Db, secret: string, userId: string, invoiceId: string) {
  const rows = await db
    .select({ id: invoiceLinks.id, purpose: invoiceLinks.purpose, createdAt: invoiceLinks.createdAt, viewCount: invoiceLinks.viewCount, lastViewedAt: invoiceLinks.lastViewedAt })
    .from(invoiceLinks)
    .where(and(eq(invoiceLinks.invoiceId, invoiceId), eq(invoiceLinks.userId, userId), live))
    .orderBy(desc(invoiceLinks.createdAt));
  return Promise.all(rows.map(async (r) => ({ ...r, token: await deriveToken(secret, r.id) })));
}

/** Turns off every live link of an invoice the caller owns. Returns how many were turned off. */
export async function revokeLinks(db: Db, userId: string, invoiceId: string): Promise<number> {
  const rows = await db
    .update(invoiceLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(invoiceLinks.invoiceId, invoiceId), eq(invoiceLinks.userId, userId), isNull(invoiceLinks.revokedAt)))
    .returning({ id: invoiceLinks.id });
  return rows.length;
}

export type SharedInvoice = {
  number: string;
  currency: string;
  total: number;
  amountPaid: number;
  status: 'unpaid' | 'paid';
  issueDate: string | null;
  dueDate: string | null;
  kind: string;
  doc: Invoice;
};

/**
 * Opens a link by its token and counts the view. A token that is the wrong shape, unknown, revoked or expired
 * is the same `null`, so nothing tells a visitor which. Returns the invoice and nothing that identifies the
 * account or the link.
 */
export async function resolveLink(db: Db, token: string): Promise<SharedInvoice | null> {
  if (!isTokenShape(token)) return null;
  const tokenHash = await hashToken(token);
  const [hit] = await db
    .update(invoiceLinks)
    .set({ viewCount: sql`${invoiceLinks.viewCount} + 1`, lastViewedAt: new Date(), firstViewedAt: sql`coalesce(${invoiceLinks.firstViewedAt}, now())` })
    .where(and(eq(invoiceLinks.tokenHash, tokenHash), live))
    .returning({ invoiceId: invoiceLinks.invoiceId });
  if (!hit) return null;
  const [row] = await db.select().from(invoices).where(eq(invoices.id, hit.invoiceId));
  if (!row) return null;
  return {
    number: row.number,
    currency: row.currency,
    total: row.total,
    amountPaid: row.amountPaid,
    status: row.status,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    kind: row.kind,
    doc: row.data as Invoice,
  };
}

/** The live `billing` link of an invoice (the one in its email), with its token rebuilt; null if there isn't one. */
export async function billingLinkToken(db: Db, secret: string, invoiceId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: invoiceLinks.id })
    .from(invoiceLinks)
    .where(and(eq(invoiceLinks.invoiceId, invoiceId), eq(invoiceLinks.purpose, 'billing'), live))
    .orderBy(desc(invoiceLinks.createdAt))
    .limit(1);
  return row ? deriveToken(secret, row.id) : null;
}
