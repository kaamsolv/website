/**
 * Saved invoices and business profiles (docs/products/accounts.md).
 *
 * Every query is scoped by `user_id` — callers pass the signed-in user's id
 * from app/lib/session.ts, never an id from the request — so one user can never
 * read or change another's rows. Framework-free; takes an explicit `db`.
 */

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import type { Settings } from '../app/lib/invoice/settings.ts';
import { CURRENCIES, type Invoice } from '../app/lib/invoice/types.ts';
import { formatSequentialNumber, sequenceOf } from '../app/lib/invoice/validate.ts';
import type { Db } from './links.ts';
import { businessProfiles, customers, invoices, LOGO_MAX_STORED_CHARS } from './schema.ts';

/** What list views get — never `data`, never a logo. */
export type InvoiceSummary = {
  id: string;
  number: string;
  clientName: string;
  currency: string;
  total: number;
  issueDate: string | null;
  dueDate: string | null;
  status: 'unpaid' | 'paid';
  updatedAt: Date;
};

const SUMMARY_COLUMNS = {
  id: invoices.id,
  number: invoices.number,
  clientName: invoices.clientName,
  currency: invoices.currency,
  total: invoices.total,
  issueDate: invoices.issueDate,
  dueDate: invoices.dueDate,
  status: invoices.status,
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
    dueDate: doc.dueDate || null,
  };
}

/** The stored document never carries the logo or signature (they live on the profile), nor the customer link (its own column). */
function storable(doc: Invoice): Omit<Invoice, 'logo' | 'customerId' | 'signature'> {
  const { logo: _logo, customerId: _customerId, signature: _signature, ...rest } = doc;
  return rest;
}

/** A customer id is only linked when it is this user's own customer. */
function ownCustomer(userId: string, customerId: string | null | undefined) {
  return customerId
    ? sql`(select ${customers.id} from ${customers} where ${customers.id} = ${customerId}::uuid and ${customers.userId} = ${userId}::uuid)`
    : sql`null`;
}

export async function countInvoices(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(invoices).where(eq(invoices.userId, userId));
  return row?.n ?? 0;
}

export async function listInvoices(db: Db, userId: string): Promise<InvoiceSummary[]> {
  return db.select(SUMMARY_COLUMNS).from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.updatedAt));
}

export async function getInvoice(
  db: Db,
  userId: string,
  id: string,
): Promise<{ id: string; invoice: Invoice; status: 'unpaid' | 'paid'; paidAt: Date | null; updatedAt: Date } | null> {
  const [row] = await db
    .select({ id: invoices.id, data: invoices.data, customerId: invoices.customerId, status: invoices.status, paidAt: invoices.paidAt, updatedAt: invoices.updatedAt })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
  if (!row) return null;
  return {
    id: row.id,
    invoice: { ...(row.data as Omit<Invoice, 'logo'>), logo: null, customerId: row.customerId },
    status: row.status,
    paidAt: row.paidAt,
    updatedAt: row.updatedAt,
  };
}

export async function setInvoiceStatus(db: Db, userId: string, id: string, status: 'unpaid' | 'paid'): Promise<boolean> {
  const rows = await db
    .update(invoices)
    .set({ status, paidAt: status === 'paid' ? new Date() : null })
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .returning({ id: invoices.id });
  return rows.length > 0;
}

export type DashboardTotals = { currency: string; billedThisMonth: number; unpaid: number; overdue: number; overdueCount: number };

/**
 * Pro dashboard: per currency, what was billed this month (by invoice date),
 * what's unpaid, and what's overdue (unpaid and past its due date). Dates come
 * from the visitor's calendar (`today`, `monthStart` as YYYY-MM-DD).
 */
export async function getDashboard(
  db: Db,
  userId: string,
  today: string,
  monthStart: string,
): Promise<{ totals: DashboardTotals[]; recent: InvoiceSummary[] }> {
  const totals = await db
    .select({
      currency: invoices.currency,
      billedThisMonth: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.issueDate} >= ${monthStart}::date and ${invoices.issueDate} <= ${today}::date), 0)::float8`,
      unpaid: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.status} = 'unpaid'), 0)::float8`,
      overdue: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.status} = 'unpaid' and ${invoices.dueDate} < ${today}::date), 0)::float8`,
      overdueCount: sql<number>`(count(*) filter (where ${invoices.status} = 'unpaid' and ${invoices.dueDate} < ${today}::date))::int`,
    })
    .from(invoices)
    .where(eq(invoices.userId, userId))
    .groupBy(invoices.currency);
  totals.sort((a, b) => (a.currency === 'INR' ? -1 : b.currency === 'INR' ? 1 : a.currency.localeCompare(b.currency)));
  const recent = await db.select(SUMMARY_COLUMNS).from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.updatedAt)).limit(5);
  return { totals, recent };
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
    insert into ${invoices} (user_id, number, client_name, currency, total, issue_date, due_date, customer_id, data)
    select ${userId}::uuid, ${s.number}, ${s.clientName}, ${s.currency}, ${s.total}, ${s.issueDate}::date, ${s.dueDate}::date,
           ${ownCustomer(userId, doc.customerId)}, ${data}::jsonb
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
    .set({ ...summaryOf(doc), customerId: ownCustomer(userId, doc.customerId), data: storable(doc), updatedAt: new Date() })
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

// ─── Business profile / Settings ─────────────────────────────────────────────

/** Settings plus the logo, signature and the ready-made next number (e.g. INV-0001). */
export type BusinessProfile = Settings & { logo: string | null; signature: string | null; nextNumber: string };

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  address: '',
  email: '',
  phone: '',
  stateCode: '',
  gstin: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  bankName: '',
  upiId: '',
  showUpiQr: false,
  invoicePrefix: 'INV-',
  nextSequence: 1,
  defaultCurrency: 'INR',
  defaultTaxLabel: 'GST',
  defaultTaxRate: '',
  defaultDueDays: 14,
  defaultNotes: '',
  composition: false,
};

export async function getProfile(db: Db, userId: string): Promise<BusinessProfile | null> {
  const [row] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
  if (!row) return null;
  const { userId: _u, updatedAt: _t, logo, nextNumber, ...rest } = row;
  return {
    ...rest,
    defaultCurrency: (CURRENCIES as readonly string[]).includes(rest.defaultCurrency) ? (rest.defaultCurrency as Settings['defaultCurrency']) : 'INR',
    nextSequence: nextNumber,
    logo,
    nextNumber: formatSequentialNumber(nextNumber, rest.invoicePrefix),
  };
}

/** The full Settings page (everything but the logo, which the editor manages). */
export async function saveSettings(db: Db, userId: string, s: Settings): Promise<void> {
  const { nextSequence, ...rest } = s;
  const values = { ...rest, nextNumber: nextSequence, updatedAt: new Date() };
  await db
    .insert(businessProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: businessProfiles.userId, set: values });
}

/** Logos are data URLs the browser already downscaled; anything else is refused. */
export function isAcceptableLogo(logo: unknown): logo is string {
  return (
    typeof logo === 'string' &&
    logo.length <= LOGO_MAX_STORED_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)
  );
}

/** The authorised-signatory image (already validated with isAcceptableLogo, or null to remove). */
export async function saveSignature(db: Db, userId: string, signature: string | null): Promise<void> {
  await db
    .insert(businessProfiles)
    .values({ userId, signature, updatedAt: new Date() })
    .onConflictDoUpdate({ target: businessProfiles.userId, set: { signature, updatedAt: new Date() } });
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

/** INV-0007 saved → the next new invoice is INV-0008 (with the account's prefix). Other formats leave it alone. */
async function advanceNumberIfUsed(db: Db, userId: string, number: string): Promise<void> {
  const [row] = await db.select({ prefix: businessProfiles.invoicePrefix }).from(businessProfiles).where(eq(businessProfiles.userId, userId));
  const used = sequenceOf(number, row?.prefix ?? 'INV-');
  if (used === null) return;
  await db
    .insert(businessProfiles)
    .values({ userId, nextNumber: used + 1 })
    .onConflictDoUpdate({
      target: businessProfiles.userId,
      set: { nextNumber: sql`greatest(${businessProfiles.nextNumber}, ${used + 1})` },
    });
}
