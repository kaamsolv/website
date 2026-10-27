/**
 * Saved invoices and business profiles (docs/products/accounts.md).
 *
 * Every query is scoped by `user_id` — callers pass the signed-in user's id
 * from app/lib/session.ts, never an id from the request — so one user can never
 * read or change another's rows. Framework-free; takes an explicit `db`.
 */

import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import type { Settings } from '../app/lib/invoice/settings.ts';
import { isTemplate } from '../app/lib/invoice/design.ts';
import { addDays } from '../app/lib/invoice/defaults.ts';
import { nextRecurAfter, type RecurEvery } from '../app/lib/invoice/recurring.ts';
import { ledgerErrorOf, toCents } from '../app/lib/invoice/payments.ts';
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
  /** Received so far, from the payment ledger (app/lib/invoice/payments.ts turns it into a state and balance). */
  amountPaid: number;
  kind: string;
  /** Pro recurring: how often, and when the reminder is due (null = doesn't repeat). */
  recurEvery: string | null;
  recurNext: string | null;
  updatedAt: Date;
};

export const SUMMARY_COLUMNS = {
  id: invoices.id,
  number: invoices.number,
  clientName: invoices.clientName,
  currency: invoices.currency,
  total: invoices.total,
  issueDate: invoices.issueDate,
  dueDate: invoices.dueDate,
  status: invoices.status,
  amountPaid: invoices.amountPaid,
  kind: invoices.kind,
  recurEvery: invoices.recurEvery,
  recurNext: invoices.recurNext,
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
    kind: doc.kind === 'quote' ? 'quote' : 'invoice',
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
): Promise<{ id: string; invoice: Invoice; status: 'unpaid' | 'paid'; amountPaid: number; paidAt: Date | null; updatedAt: Date; recurEvery: string | null; recurNext: string | null } | null> {
  const [row] = await db
    .select({
      id: invoices.id,
      data: invoices.data,
      customerId: invoices.customerId,
      status: invoices.status,
      amountPaid: invoices.amountPaid,
      paidAt: invoices.paidAt,
      updatedAt: invoices.updatedAt,
      recurEvery: invoices.recurEvery,
      recurNext: invoices.recurNext,
    })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
  if (!row) return null;
  return {
    id: row.id,
    invoice: { ...(row.data as Omit<Invoice, 'logo'>), logo: null, customerId: row.customerId },
    status: row.status,
    amountPaid: row.amountPaid,
    paidAt: row.paidAt,
    updatedAt: row.updatedAt,
    recurEvery: row.recurEvery,
    recurNext: row.recurNext,
  };
}

/**
 * Undo a legacy "marked paid": an invoice marked paid before payments were recorded, with nothing in its ledger,
 * goes back to unpaid. An invoice with payments is never touched here: its status follows its ledger, and a
 * mistaken payment is voided instead. (Marking an invoice paid is gone: record the payment, which settles it.)
 */
export async function clearMarkedPaid(db: Db, userId: string, id: string): Promise<'cleared' | 'not_marked' | 'not_found'> {
  const rows = await db
    .update(invoices)
    .set({ status: 'unpaid', paidAt: null })
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId), eq(invoices.kind, 'invoice'), eq(invoices.status, 'paid'), sql`${invoices.amountPaid} = 0`))
    .returning({ id: invoices.id });
  if (rows.length) return 'cleared';
  const [row] = await db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, userId), eq(invoices.kind, 'invoice')));
  return row ? 'not_marked' : 'not_found';
}

/** Why a save was refused: this invoice already has payments recorded against it. */
export class InvoiceLockedError extends Error {
  constructor(
    readonly code: 'has_payments' | 'below_paid',
    readonly amountPaid: number,
    readonly currency: string,
  ) {
    super(`invoice_${code}`);
  }
}

export type DashboardTotals = { currency: string; billedThisMonth: number; unpaid: number; overdue: number; overdueCount: number };

/**
 * Pro dashboard: per currency, what was billed this month (by invoice date),
 * what's still owed, and what's overdue. "Owed" is the balance (total minus
 * what the ledger has received) of invoices not yet settled: partly paid ones
 * count only their remainder; "marked paid" legacy invoices owe nothing.
 * Overdue is owed and past its due date. Dates come from the visitor's calendar
 * (`today`, `monthStart` as YYYY-MM-DD). Currencies are never added together.
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
      unpaid: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}) filter (where ${invoices.status} = 'unpaid'), 0)::float8`,
      overdue: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}) filter (where ${invoices.status} = 'unpaid' and ${invoices.dueDate} < ${today}::date), 0)::float8`,
      overdueCount: sql<number>`(count(*) filter (where ${invoices.status} = 'unpaid' and ${invoices.dueDate} < ${today}::date))::int`,
    })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), eq(invoices.kind, 'invoice')))
    .groupBy(invoices.currency);
  totals.sort((a, b) => (a.currency === 'INR' ? -1 : b.currency === 'INR' ? 1 : a.currency.localeCompare(b.currency)));
  const recent = await db
    .select(SUMMARY_COLUMNS)
    .from(invoices)
    .where(and(eq(invoices.userId, userId), eq(invoices.kind, 'invoice')))
    .orderBy(desc(invoices.updatedAt))
    .limit(5);
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
    insert into ${invoices} (user_id, number, client_name, currency, total, issue_date, due_date, kind, customer_id, data)
    select ${userId}::uuid, ${s.number}, ${s.clientName}, ${s.currency}, ${s.total}, ${s.issueDate}::date, ${s.dueDate}::date, ${s.kind},
           ${ownCustomer(userId, doc.customerId)}, ${data}::jsonb
    where ${capped}
    returning id`);
  const id = (result as unknown as { rows: { id: string }[] }).rows[0]?.id;
  if (!id) return { ok: false, reason: 'limit' };
  await advanceNumberIfUsed(db, userId, doc.number, doc.kind);
  return { ok: true, id };
}

/**
 * Replace a saved invoice. Once payments are recorded against it, its currency and type are fixed and its total
 * can't drop below what was received (throws `InvoiceLockedError`); the database trigger is the backstop for a
 * payment that lands in the same instant.
 */
export async function updateInvoice(db: Db, userId: string, id: string, doc: Invoice): Promise<boolean> {
  const s = summaryOf(doc);
  const [cur] = await db
    .select({ amountPaid: invoices.amountPaid, currency: invoices.currency, kind: invoices.kind })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
  if (cur && toCents(cur.amountPaid) > 0) {
    if (cur.currency !== s.currency || cur.kind !== s.kind) throw new InvoiceLockedError('has_payments', cur.amountPaid, cur.currency);
    if (toCents(s.total) < toCents(cur.amountPaid)) throw new InvoiceLockedError('below_paid', cur.amountPaid, cur.currency);
  }
  let rows: { id: string }[];
  try {
    rows = await db
      .update(invoices)
      .set({ ...s, customerId: ownCustomer(userId, doc.customerId), data: storable(doc), updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
      .returning({ id: invoices.id });
  } catch (e) {
    const rule = ledgerErrorOf(e);
    if (rule === 'invoice_has_payments' || rule === 'invoice_total_below_paid') {
      const [now] = await db.select({ amountPaid: invoices.amountPaid, currency: invoices.currency }).from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
      throw new InvoiceLockedError(rule === 'invoice_has_payments' ? 'has_payments' : 'below_paid', now?.amountPaid ?? 0, now?.currency ?? s.currency);
    }
    throw e;
  }
  if (rows.length) await advanceNumberIfUsed(db, userId, doc.number, doc.kind);
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

/** Settings plus the logo, signature and the ready-made next numbers (e.g. INV-0001, QT-0001). */
export type BusinessProfile = Settings & { logo: string | null; signature: string | null; nextNumber: string; nextQuoteNumber: string };

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
  quotePrefix: 'QT-',
  quoteNextNumber: 1,
  defaultTemplate: 'classic',
  defaultBrandColor: '#FE6336',
};

export async function getProfile(db: Db, userId: string): Promise<BusinessProfile | null> {
  const [row] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
  if (!row) return null;
  const { userId: _u, updatedAt: _t, logo, nextNumber, ...rest } = row;
  return {
    ...rest,
    defaultCurrency: (CURRENCIES as readonly string[]).includes(rest.defaultCurrency) ? (rest.defaultCurrency as Settings['defaultCurrency']) : 'INR',
    defaultTemplate: isTemplate(rest.defaultTemplate) ? rest.defaultTemplate : 'classic',
    nextQuoteNumber: formatSequentialNumber(rest.quoteNextNumber, rest.quotePrefix),
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

/**
 * INV-0007 saved → the next new invoice is INV-0008 (with the account's prefix);
 * QT-0003 saved as a quotation → the next quotation is QT-0004. Other formats leave it alone.
 */
async function advanceNumberIfUsed(db: Db, userId: string, number: string, kind?: Invoice['kind']): Promise<void> {
  const [row] = await db
    .select({ prefix: businessProfiles.invoicePrefix, quotePrefix: businessProfiles.quotePrefix })
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId));
  if (kind === 'quote') {
    const usedQuote = sequenceOf(number, row?.quotePrefix ?? 'QT-');
    if (usedQuote === null) return;
    await db
      .insert(businessProfiles)
      .values({ userId, quoteNextNumber: usedQuote + 1 })
      .onConflictDoUpdate({
        target: businessProfiles.userId,
        set: { quoteNextNumber: sql`greatest(${businessProfiles.quoteNextNumber}, ${usedQuote + 1})` },
      });
    return;
  }
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

/**
 * A saved quotation → a new invoice with the same client and lines, the next
 * invoice number, `issueDate` and the account's days-to-pay. The quotation
 * stays as it was. Null if the id isn't this user's quotation.
 */
export async function convertQuote(
  db: Db,
  userId: string,
  id: string,
  issueDate: string,
  limit: number | null,
): Promise<CreateResult | null> {
  const quote = await getInvoice(db, userId, id);
  if (!quote || quote.invoice.kind !== 'quote') return null;
  const profile = await getProfile(db, userId);
  const invoice: Invoice = {
    ...quote.invoice,
    kind: undefined,
    number: profile?.nextNumber ?? formatSequentialNumber(1),
    issueDate,
    dueDate: addDays(issueDate, profile?.defaultDueDays ?? 14),
  };
  return createInvoice(db, userId, invoice, limit);
}

// ─── Recurring (Pro, Stage 2C-2) ─────────────────────────────────────────────

/** Set or clear how an invoice repeats. Quotations never repeat. False if it isn't this user's invoice. */
export async function setRecurring(db: Db, userId: string, id: string, schedule: { every: RecurEvery; next: string } | null): Promise<boolean> {
  const rows = await db
    .update(invoices)
    .set({ recurEvery: schedule?.every ?? null, recurNext: schedule?.next ?? null })
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId), eq(invoices.kind, 'invoice')))
    .returning({ id: invoices.id });
  return rows.length > 0;
}

/** Invoices whose reminder is due on or before `today`, oldest first. */
export async function listDueToRecur(db: Db, userId: string, today: string): Promise<InvoiceSummary[]> {
  return db
    .select(SUMMARY_COLUMNS)
    .from(invoices)
    .where(and(eq(invoices.userId, userId), eq(invoices.kind, 'invoice'), sql`${invoices.recurNext} <= ${today}::date`))
    .orderBy(invoices.recurNext)
    .limit(50);
}

export type RecurResult = { ok: true; id: string | null; next: string } | { ok: false; reason: 'not_found' | 'not_due' | 'limit' };

/**
 * "Due to repeat" → Create or Skip. The schedule moves on first, in one
 * compare-and-set (`recur_next` must still be the date the caller saw), so a
 * double click or two tabs can't create the invoice twice. Create then makes a
 * copy — next invoice number, `today`, the account's days to pay — and puts the
 * schedule back if the copy can't be saved. The copy does not itself repeat.
 */
export async function recurInvoice(
  db: Db,
  userId: string,
  id: string,
  action: 'create' | 'skip',
  today: string,
  limit: number | null,
): Promise<RecurResult> {
  const [row] = await db
    .select({ every: invoices.recurEvery, next: invoices.recurNext })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId), eq(invoices.kind, 'invoice')));
  if (!row) return { ok: false, reason: 'not_found' };
  if (!row.every || !row.next) return { ok: false, reason: 'not_found' };
  if (row.next > today) return { ok: false, reason: 'not_due' };

  const next = nextRecurAfter(row.next, row.every as RecurEvery, today);
  const moved = await db
    .update(invoices)
    .set({ recurNext: next })
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId), sql`${invoices.recurNext} = ${row.next}::date`))
    .returning({ id: invoices.id });
  if (!moved.length) return { ok: false, reason: 'not_due' };
  if (action === 'skip') return { ok: true, id: null, next };

  const source = await getInvoice(db, userId, id);
  const profile = await getProfile(db, userId);
  if (!source) return { ok: false, reason: 'not_found' };
  const copy: Invoice = {
    ...source.invoice,
    kind: undefined,
    number: profile?.nextNumber ?? formatSequentialNumber(1),
    issueDate: today,
    dueDate: addDays(today, profile?.defaultDueDays ?? 14),
  };
  const created = await createInvoice(db, userId, copy, limit);
  if (!created.ok) {
    await db.update(invoices).set({ recurNext: row.next }).where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
    return { ok: false, reason: 'limit' };
  }
  return { ok: true, id: created.id, next };
}

// ─── Batch and export (Pro, Stage 2C-2) ──────────────────────────────────────

export type BatchResult = { created: { index: number; id: string; number: string }[]; failed: number[] };

/**
 * Save several invoices in order, each with the next number from the account's
 * sequence (the documents' own numbers are ignored). One at a time, so if
 * something stops part-way the ones before it are saved and the result says
 * which. `limit` null = unlimited.
 */
export async function createBatch(db: Db, userId: string, docs: Invoice[], limit: number | null): Promise<BatchResult> {
  const out: BatchResult = { created: [], failed: [] };
  for (let i = 0; i < docs.length; i++) {
    const profile = await getProfile(db, userId);
    const number = profile?.nextNumber ?? formatSequentialNumber(1);
    const r = await createInvoice(db, userId, { ...docs[i], kind: undefined, number }, limit);
    if (r.ok) out.created.push({ index: i, id: r.id, number });
    else out.failed.push(i);
  }
  return out;
}

export type ExportRow = {
  invoice: Invoice;
  status: 'unpaid' | 'paid';
  /** Received per the payment ledger; with status it tells Paid / Partially paid / Unpaid / Marked paid apart. */
  amountPaid: number;
  paidAt: Date | null;
};

export const EXPORT_MAX_ROWS = 5000;

/** The user's invoices and quotations, oldest first, for CSV export. Dates are YYYY-MM-DD (optional). One more than the cap is read so the caller can tell it was cut. */
export async function listForExport(db: Db, userId: string, range: { from?: string; to?: string }): Promise<ExportRow[]> {
  const where = and(
    eq(invoices.userId, userId),
    range.from ? gte(invoices.issueDate, range.from) : undefined,
    range.to ? lte(invoices.issueDate, range.to) : undefined,
  );
  const rows = await db
    .select({ data: invoices.data, status: invoices.status, amountPaid: invoices.amountPaid, paidAt: invoices.paidAt, customerId: invoices.customerId })
    .from(invoices)
    .where(where)
    .orderBy(invoices.issueDate, invoices.createdAt)
    .limit(EXPORT_MAX_ROWS + 1);
  return rows.map((r) => ({
    invoice: { ...(r.data as Omit<Invoice, 'logo'>), logo: null, customerId: r.customerId },
    status: r.status,
    amountPaid: r.amountPaid,
    paidAt: r.paidAt,
  }));
}
