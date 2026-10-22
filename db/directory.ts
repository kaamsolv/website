/**
 * Saved customers and items (Stage 2A). Every query is scoped to the signed-in
 * user's id. Inserts enforce the plan's limit in the same statement (free
 * account: 3 customers) plus a hidden anti-abuse ceiling for everyone.
 * Framework-free; takes an explicit `db`.
 */

import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { DIRECTORY_HARD_CAP } from '../app/lib/entitlements.ts';
import type { Customer, Item } from '../app/lib/invoice/settings.ts';
import type { Db } from './links.ts';
import { customers, items } from './schema.ts';

export type CustomerRow = Customer & { id: string };
export type ItemRow = Item & { id: string };

export type InsertResult = { ok: true; id: string } | { ok: false; reason: 'limit' };

/** Escape LIKE wildcards in what the user typed. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const CUSTOMER_COLUMNS = {
  id: customers.id,
  name: customers.name,
  contactName: customers.contactName,
  email: customers.email,
  phone: customers.phone,
  address: customers.address,
  stateCode: customers.stateCode,
  gstin: customers.gstin,
};

const ITEM_COLUMNS = { id: items.id, name: items.name, hsnSac: items.hsnSac, unit: items.unit, rate: items.rate, gstRate: items.gstRate };

/** The effective cap: the plan's limit (null = unlimited), never above the hard cap. */
const capOf = (limit: number | null) => Math.min(limit ?? DIRECTORY_HARD_CAP, DIRECTORY_HARD_CAP);

// ─── Customers ───────────────────────────────────────────────────────────────

export async function countCustomers(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(eq(customers.userId, userId));
  return row?.n ?? 0;
}

export async function listCustomers(db: Db, userId: string, q = ''): Promise<CustomerRow[]> {
  const where: SQL[] = [eq(customers.userId, userId)];
  const term = q.trim().slice(0, 80);
  if (term) where.push(or(ilike(customers.name, like(term)), ilike(customers.contactName, like(term)), ilike(customers.gstin, like(term)))!);
  return db.select(CUSTOMER_COLUMNS).from(customers).where(and(...where)).orderBy(asc(customers.name)).limit(200);
}

export async function getCustomer(db: Db, userId: string, id: string): Promise<CustomerRow | null> {
  const [row] = await db.select(CUSTOMER_COLUMNS).from(customers).where(and(eq(customers.id, id), eq(customers.userId, userId)));
  return row ?? null;
}

export async function createCustomer(db: Db, userId: string, c: Customer, limit: number | null): Promise<InsertResult> {
  const result = await db.execute<{ id: string }>(sql`
    insert into ${customers} (user_id, name, contact_name, email, phone, address, state_code, gstin)
    select ${userId}::uuid, ${c.name}, ${c.contactName}, ${c.email}, ${c.phone}, ${c.address}, ${c.stateCode}, ${c.gstin}
    where (select count(*) from ${customers} where ${customers.userId} = ${userId}::uuid) < ${capOf(limit)}
    returning id`);
  const id = (result as unknown as { rows: { id: string }[] }).rows[0]?.id;
  return id ? { ok: true, id } : { ok: false, reason: 'limit' };
}

export async function updateCustomer(db: Db, userId: string, id: string, c: Customer): Promise<boolean> {
  const rows = await db
    .update(customers)
    .set({ ...c, updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.userId, userId)))
    .returning({ id: customers.id });
  return rows.length > 0;
}

/** Past invoices keep their own copy of the customer; their link is cleared (ON DELETE SET NULL). */
export async function deleteCustomer(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(customers).where(and(eq(customers.id, id), eq(customers.userId, userId))).returning({ id: customers.id });
  return rows.length > 0;
}

// ─── Items ───────────────────────────────────────────────────────────────────

export async function listItems(db: Db, userId: string, q = ''): Promise<ItemRow[]> {
  const where: SQL[] = [eq(items.userId, userId)];
  const term = q.trim().slice(0, 80);
  if (term) where.push(or(ilike(items.name, like(term)), ilike(items.hsnSac, like(term)))!);
  return db.select(ITEM_COLUMNS).from(items).where(and(...where)).orderBy(asc(items.name)).limit(200);
}

export async function getItem(db: Db, userId: string, id: string): Promise<ItemRow | null> {
  const [row] = await db.select(ITEM_COLUMNS).from(items).where(and(eq(items.id, id), eq(items.userId, userId)));
  return row ?? null;
}

export async function createItem(db: Db, userId: string, it: Item, limit: number | null): Promise<InsertResult> {
  const result = await db.execute<{ id: string }>(sql`
    insert into ${items} (user_id, name, hsn_sac, unit, rate, gst_rate)
    select ${userId}::uuid, ${it.name}, ${it.hsnSac}, ${it.unit}, ${it.rate}, ${it.gstRate}
    where (select count(*) from ${items} where ${items.userId} = ${userId}::uuid) < ${capOf(limit)}
    returning id`);
  const id = (result as unknown as { rows: { id: string }[] }).rows[0]?.id;
  return id ? { ok: true, id } : { ok: false, reason: 'limit' };
}

export async function updateItem(db: Db, userId: string, id: string, it: Item): Promise<boolean> {
  const rows = await db
    .update(items)
    .set({ ...it, updatedAt: new Date() })
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .returning({ id: items.id });
  return rows.length > 0;
}

export async function deleteItem(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(items).where(and(eq(items.id, id), eq(items.userId, userId))).returning({ id: items.id });
  return rows.length > 0;
}
