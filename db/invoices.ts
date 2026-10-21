/**
 * Saved invoices and business profiles (docs/products/accounts.md).
 *
 * Every query is scoped by `user_id` — callers pass the signed-in user's id
 * from app/lib/session.ts, never an id from the request — so one user can never
 * read or change another's rows. Framework-free; takes an explicit `db`.
 */

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';
import { formatSequentialNumber } from '../app/lib/invoice/validate.ts';
import type { Db } from './links.ts';
import { businessProfiles, invoices, LOGO_MAX_STORED_CHARS } from './schema.ts';

/** What list views get — never `data`, never a logo. */
export type InvoiceSummary = {
  id: string;
  number: string;
  clientName: string;
  currency: string;
  total: number;
  issueDate: string | null;
  updatedAt: Date;
};

const SUMMARY_COLUMNS = {
  id: invoices.id,
  number: invoices.number,
  clientName: invoices.clientName,
  currency: invoices.currency,
  total: invoices.total,
  issueDate: invoices.issueDate,
  updatedAt: invoices.updatedAt,
};

/** Summary columns copied out of the document. Unreadable totals store 0. */
function summaryOf(doc: Invoice) {
  const total = computeTotals(doc).total;
  return {
    number: doc.number,
    clientName: doc.client.name,
    currency: doc.currency,
    total: Number.isFinite(total) ? total : 0,
    issueDate: doc.issueDate || null,
  };
}

/** The stored document never carries the logo. */
function storable(doc: Invoice): Omit<Invoice, 'logo'> {
  const { logo: _logo, ...rest } = doc;
  return rest;
}

export async function countInvoices(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(invoices).where(eq(invoices.userId, userId));
  return row?.n ?? 0;
}

export async function listInvoices(db: Db, userId: string): Promise<InvoiceSummary[]> {
  return db.select(SUMMARY_COLUMNS).from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.updatedAt));
}

export async function getInvoice(db: Db, userId: string, id: string): Promise<{ id: string; invoice: Invoice; updatedAt: Date } | null> {
  const [row] = await db
    .select({ id: invoices.id, data: invoices.data, updatedAt: invoices.updatedAt })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
  if (!row) return null;
  return { id: row.id, invoice: { ...(row.data as Omit<Invoice, 'logo'>), logo: null }, updatedAt: row.updatedAt };
}

export type CreateResult = { ok: true; id: string } | { ok: false; reason: 'limit' };

/**
 * Insert, enforcing the plan's save limit in the same statement (no race
 * between "count" and "insert"). `limit` null = unlimited. Advances the
 * profile's sequential number when the invoice uses it.
 */
export async function createInvoice(db: Db, userId: string, doc: Invoice, limit: number | null): Promise<CreateResult> {
  const s = summaryOf(doc);
  const data = JSON.stringify(storable(doc));
  const capped = limit === null ? sql`true` : sql`(select count(*) from ${invoices} where ${invoices.userId} = ${userId}::uuid) < ${limit}`;
  const result = await db.execute<{ id: string }>(sql`
    insert into ${invoices} (user_id, number, client_name, currency, total, issue_date, data)
    select ${userId}::uuid, ${s.number}, ${s.clientName}, ${s.currency}, ${s.total}, ${s.issueDate}::date, ${data}::jsonb
    where ${capped}
    returning id`);
  const id = (result as unknown as { rows: { id: string }[] }).rows[0]?.id;
  if (!id) return { ok: false, reason: 'limit' };
  await advanceNumberIfUsed(db, userId, doc.number);
  return { ok: true, id };
}

export async function updateInvoice(db: Db, userId: string, id: string, doc: Invoice): Promise<boolean> {
  const rows = await db
    .update(invoices)
    .set({ ...summaryOf(doc), data: storable(doc), updatedAt: new Date() })
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .returning({ id: invoices.id });
  if (rows.length) await advanceNumberIfUsed(db, userId, doc.number);
  return rows.length > 0;
}

export async function deleteInvoice(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .returning({ id: invoices.id });
  return rows.length > 0;
}

// ─── Business profile ────────────────────────────────────────────────────────

export type BusinessProfile = {
  name: string;
  address: string;
  email: string;
  phone: string;
  logo: string | null;
  /** The number a new invoice should use, e.g. INV-0001. */
  nextNumber: string;
};

export async function getProfile(db: Db, userId: string): Promise<BusinessProfile | null> {
  const [row] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
  if (!row) return null;
  return {
    name: row.name,
    address: row.address,
    email: row.email,
    phone: row.phone,
    logo: row.logo,
    nextNumber: formatSequentialNumber(row.nextNumber),
  };
}

/** Logos are data URLs the browser already downscaled; anything else is refused. */
export function isAcceptableLogo(logo: unknown): logo is string {
  return (
    typeof logo === 'string' &&
    logo.length <= LOGO_MAX_STORED_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)
  );
}

export async function saveProfile(
  db: Db,
  userId: string,
  p: { name: string; address: string; email: string; phone: string; logo: string | null },
): Promise<void> {
  const values = { ...p, updatedAt: new Date() };
  await db
    .insert(businessProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: businessProfiles.userId, set: values });
}

/** INV-0007 saved → the next new invoice is INV-0008. Other formats leave it alone. */
async function advanceNumberIfUsed(db: Db, userId: string, number: string): Promise<void> {
  const m = /^INV-(\d{1,9})$/.exec(number.trim());
  if (!m) return;
  const used = Number(m[1]);
  await db
    .insert(businessProfiles)
    .values({ userId, nextNumber: used + 1 })
    .onConflictDoUpdate({
      target: businessProfiles.userId,
      set: { nextNumber: sql`greatest(${businessProfiles.nextNumber}, ${used + 1})` },
    });
}
